import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const axios = require('axios');
import { BaseViewProvider } from './base_view_provider';
import { loadServerProfiles } from '../utils/server_profiles';
import { MessageManager } from '../utils/message_manager';

export class RemoteViewProvider extends BaseViewProvider {
    private _currentSessionId?: string;
    private _disposables: vscode.Disposable[] = [];
    private static readonly LAST_SESSION_KEY = 'sage.lastSessionId';

    constructor(context: vscode.ExtensionContext) {
        super(context);
    }

    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ) {
        // Clean up old listeners
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
        
        this._view = webviewView;
        webviewView.webview.options = this.getWebviewOptions();

        const config = vscode.workspace.getConfiguration('sage');
        const backendUrl = config.get('currentRemoteBackendUrl') as string;

        try {
            // Load the chat interface first
            const filePath = path.join(this.context.extensionPath, 'src', 'media', 'sage.html');
            let htmlContent = fs.readFileSync(filePath, 'utf8');
            const mediaPath = vscode.Uri.file(
                path.join(this.context.extensionPath, 'src', 'media')
            );
            const mediaUri = webviewView.webview.asWebviewUri(mediaPath);
            htmlContent = htmlContent.replace(/src="\.\/media\//g, `src="${mediaUri}/`);
            
            // Add status information
            const statusClass = 'text-green-500'; // or 'text-red-500' for offline
            const statusText = 'Connected'; // or 'Disconnected' when offline
            htmlContent = htmlContent
                .replace('%STATUS_CLASS%', statusClass)
                .replace('%STATUS%', statusText);

            webviewView.webview.html = htmlContent;

            // Wait for the webview to be ready
            await new Promise(resolve => setTimeout(resolve, 100));

            // Immediately restore the last session ID
            this._currentSessionId = this.context.globalState.get(RemoteViewProvider.LAST_SESSION_KEY);

            // Load sessions first
            const sessions = await this.fetchChatSessions(backendUrl);
            if (sessions) {
                webviewView.webview.postMessage({
                    command: 'updateSessions',
                    sessions: sessions
                });
            }

            // If we have a last session, load it immediately
            if (this._currentSessionId) {
                const serverProfiles = await loadServerProfiles(this.context);
                const profile = serverProfiles[backendUrl];

                if (profile?.userId) {
                    const sessionResponse = await axios.get(
                        `${backendUrl}/api/chat/sessions/${this._currentSessionId}`,
                        { headers: { 'x-user-id': profile.userId } }
                    );

                    webviewView.webview.postMessage({
                        command: 'updateChatHistory',
                        messages: sessionResponse.data.messages
                    });
                }
            }

            // Register message handlers
            this._disposables.push(
                webviewView.webview.onDidReceiveMessage(async message => {
                    switch (message.command) {
                        case 'sendMessage':
                            await this.handleSendMessage(message, webviewView);
                            break;
                        case 'selectSession':
                            await this.handleSelectSession(message, webviewView);
                            break;
                        case 'newChatSession':
                            await this.handleNewChatSession(webviewView);
                            break;
                        case 'deleteSession':
                            await this.handleDeleteSession(message, webviewView);
                            break;
                        case 'reconfigure':
                            await this.handleReconfigure(webviewView);
                            break;
                    }
                })
            );

            // Add disposal when webview is hidden
            this._disposables.push(
                webviewView.onDidDispose(() => {
                    this._disposables.forEach(d => d.dispose());
                    this._disposables = [];
                })
            );

        } catch (error: any) {
            console.error('Error in resolveWebviewView:', error);
            MessageManager.showError(`Failed to initialize view: ${error.message}`);
            webviewView.webview.html = this.getConnectionErrorHtml();
        }
    }

    private async handleSendMessage(message: any, webviewView: vscode.WebviewView) {
        const config = vscode.workspace.getConfiguration('sage');
        const backendUrl = config.get('currentRemoteBackendUrl') as string;

        try {
            if (message.text) {
                const serverProfiles = await loadServerProfiles(this.context);
                const profile = serverProfiles[backendUrl];
                
                if (!profile || !profile.userId) {
                    MessageManager.showError("User ID not configured. Please reconfigure your connection.");
                    return;
                }

                if (!this._currentSessionId) {
                    const sessionResponse = await axios.post(
                        `${backendUrl}/api/chat/sessions`,
                        null,
                        { headers: { 'x-user-id': profile.userId } }
                    );
                    this._currentSessionId = sessionResponse.data.session_id;
                }

                webviewView.webview.postMessage({
                    command: 'addMessage',
                    message: { role: 'user', content: message.text }
                });

                const response = await axios.post(
                    `${backendUrl}/api/chat/sessions/${this._currentSessionId}/messages`,
                    { content: message.text },
                    { headers: { 'x-user-id': profile.userId } }
                );

                if (response.data.message) {
                    webviewView.webview.postMessage({
                        command: 'addMessage',
                        message: response.data.message
                    });
                }

                // Refresh sessions list
                const sessions = await this.fetchChatSessions(backendUrl);
                if (sessions) {
                    webviewView.webview.postMessage({
                        command: 'updateSessions',
                        sessions: sessions
                    });
                }
            }
        } catch (error: any) {
            console.error('Error sending message:', error);
            MessageManager.showError(`Failed to send message: ${error.message}`);
        }
    }

    private async handleSelectSession(message: any, webviewView: vscode.WebviewView) {
        const config = vscode.workspace.getConfiguration('sage');
        const backendUrl = config.get('currentRemoteBackendUrl') as string;

        if (message.sessionId) {
            try {
                const serverProfiles = await loadServerProfiles(this.context);
                const profile = serverProfiles[backendUrl];

                const sessionResponse = await axios.get(
                    `${backendUrl}/api/chat/sessions/${message.sessionId}`,
                    { headers: { 'x-user-id': profile.userId } }
                );
                this._currentSessionId = message.sessionId;
                // Save the current session ID
                await this.context.globalState.update(RemoteViewProvider.LAST_SESSION_KEY, message.sessionId);
                
                webviewView.webview.postMessage({
                    command: 'updateChatHistory',
                    messages: sessionResponse.data.messages
                });
            } catch (error: any) {
                console.error('Error fetching session:', error);
                MessageManager.showError(`Failed to open session: ${error.message}`);
            }
        }
    }

    private async handleNewChatSession(webviewView: vscode.WebviewView) {
        this._currentSessionId = undefined;
        await this.context.globalState.update(RemoteViewProvider.LAST_SESSION_KEY, undefined);
        webviewView.webview.postMessage({
            command: 'updateChatHistory',
            messages: []
        });
    }

    private async handleDeleteSession(message: any, webviewView: vscode.WebviewView) {
        const config = vscode.workspace.getConfiguration('sage');
        const backendUrl = config.get('currentRemoteBackendUrl') as string;

        if (message.sessionId) {
            try {
                const serverProfiles = await loadServerProfiles(this.context);
                const profile = serverProfiles[backendUrl];

                await axios.delete(
                    `${backendUrl}/api/chat/sessions/${message.sessionId}`,
                    { headers: { 'x-user-id': profile.userId } }
                );
                MessageManager.showInfo("Chat session deleted successfully.");

                if (this._currentSessionId === message.sessionId) {
                    this._currentSessionId = undefined;
                    await this.context.globalState.update(RemoteViewProvider.LAST_SESSION_KEY, undefined);
                    webviewView.webview.postMessage({
                        command: 'updateChatHistory',
                        messages: []
                    });
                }

                const sessions = await this.fetchChatSessions(backendUrl);
                if (sessions) {
                    webviewView.webview.postMessage({
                        command: 'updateSessions',
                        sessions: sessions
                    });
                }
            } catch (error: any) {
                console.error('Error deleting session:', error);
                MessageManager.showError(`Failed to delete session: ${error.message}`);
            }
        }
    }

    private async handleReconfigure(webviewView: vscode.WebviewView) {
        try {
            MessageManager.showInfo('Reconfiguring Sage...');
            await vscode.workspace.getConfiguration().update('sage.isConfigured', false, true);
            await vscode.workspace.getConfiguration().update('sage.currentRemoteBackendUrl', '', true);
            await vscode.commands.executeCommand('sage.switchView');
            MessageManager.showInfo('Reconfiguration complete');
        } catch (error: any) {
            MessageManager.showError(`Failed to reconfigure: ${error.message}`);
        }
    }

    private getConnectionErrorHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        padding: 20px;
                        color: #cccccc;
                        background-color: #1e1e1e;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                    }
                    button {
                        background-color: #0066cc;
                        color: white;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-top: 16px;
                    }
                    button:hover {
                        background-color: #0052a3;
                    }
                </style>
            </head>
            <body>
                <h3>Connection Error</h3>
                <p>Unable to connect to the remote backend. Please check your connection settings.</p>
                <button onclick="vscode.postMessage({command: 'reconfigure'})">
                    Configure Backend
                </button>
                <script>
                    const vscode = acquireVsCodeApi();
                </script>
            </body>
            </html>
        `;
    }

    private async fetchChatSessions(backendUrl: string) {
        try {
            const serverProfiles = await loadServerProfiles(this.context);
            const profile = serverProfiles[backendUrl];
            
            if (!profile || !profile.userId) {
                console.error('No user ID found for this backend');
                return null;
            }

            const response = await axios.get(
                `${backendUrl}/api/chat/sessions`,
                { headers: { 'x-user-id': profile.userId } }
            );
            return response.data;
        } catch (error) {
            console.error('Error fetching chat sessions:', error);
            return null;
        }
    }

    private updateConnectionStatus(connected: boolean) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateStatus',
                status: {
                    text: connected ? 'Connected' : 'Disconnected',
                    class: connected ? 'text-green-500' : 'text-red-500'
                }
            });
        }
    }
} 