import * as vscode from 'vscode';
const axios = require('axios');
const { MessageManager } = require('../utils/message_manager');
import { loadServerProfiles } from '../utils/server_profiles';

export class SagePanel {
    private _context: vscode.ExtensionContext;
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[];
    static currentPanel: SagePanel | undefined;
    private _currentSessionId: string | undefined;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._panel = undefined;
        this._disposables = [];
        this._currentSessionId = undefined;
    }

    static async createOrShow(context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration('sage');
        // This panel now assumes remote connection mode.
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (SagePanel.currentPanel && SagePanel.currentPanel._panel) {
            SagePanel.currentPanel._panel.reveal(column);
            return SagePanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'sagePanel',
            'Sage',
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        SagePanel.currentPanel = new SagePanel(context);
        SagePanel.currentPanel._panel = panel;

        // Dispose panel resources when the panel is closed.
        panel.onDidDispose(
            async () => {
                try {
                    await SagePanel.currentPanel?.dispose();
                    MessageManager.showInfo('Disconnected from server');
                } catch (error: any) {
                    console.error('Error during panel disposal:', error);
                    MessageManager.showError(`Error during disconnection: ${error.message}`);
                }
            },
            null,
            context.subscriptions
        );

        await SagePanel.currentPanel._initialize();
        return SagePanel.currentPanel;
    }

    async _initialize() {
        if (!this._panel) return;
        const config = vscode.workspace.getConfiguration('sage');
        const backendUrl = config.get('remoteBackendUrl') as string;

        try {
            this._updateContent('Connected to remote server', true);
            this._panel.webview.postMessage({
                command: 'showStatus',
                message: 'Connected to remote server'
            });

            this._panel.webview.onDidReceiveMessage(
                async (message: { command: string; text?: string }) => {
                    switch (message.command) {
                        case 'sendMessage':
                            try {
                                if (message.text) {
                                    // Create a chat session if one hasn't been initiated yet.
                                    if (!this._currentSessionId) {
                                        const serverProfiles = await loadServerProfiles(this._context);
                                        const profile = serverProfiles[backendUrl];
                                        if (!profile || !profile.userId) {
                                            MessageManager.showError("User ID not configured. Please update your connection settings.");
                                            return;
                                        }
                                        const sessionResponse = await axios.post(
                                            `${backendUrl}/api/chat/sessions`,
                                            null,
                                            { headers: { 'x-user-id': profile.userId } }
                                        );
                                        this._currentSessionId = sessionResponse.data.session_id;
                                        // Load initial chat history from the backend session.
                                        this._panel?.webview.postMessage({
                                            command: 'updateChatHistory',
                                            messages: sessionResponse.data.messages
                                        });
                                    }

                                    // Append the user's message immediately to the chat.
                                    this._panel?.webview.postMessage({
                                        command: 'addMessage',
                                        message: {
                                            role: 'user',
                                            content: message.text
                                        }
                                    });

                                    // Send the message to the remote backend.
                                    const response = await axios.post(
                                        `${backendUrl}/api/chat/sessions/${this._currentSessionId}/messages`,
                                        { content: message.text }
                                    );

                                    // If a response is received from the assistant, add it to the chat.
                                    if (response.data.message) {
                                        this._panel?.webview.postMessage({
                                            command: 'addMessage',
                                            message: response.data.message
                                        });
                                    }
                                }
                            } catch (error: any) {
                                console.error('Error sending message:', error);
                                MessageManager.showError(`Failed to send message: ${error.message}`);
                                // Display the error as an assistant's response.
                                this._panel?.webview.postMessage({
                                    command: 'addMessage',
                                    message: {
                                        role: 'assistant',
                                        content: `Error: ${error.message}`
                                    }
                                });
                                // Clear any pending message state.
                                this._panel?.webview.postMessage({
                                    command: 'clearPendingMessage'
                                });
                            }
                            break;

                        case 'checkModelStatus':
                            try {
                                const modelResponse = await axios.get(`${backendUrl}/api/llm`);
                                this._panel?.webview.postMessage({
                                    command: 'updateModelStatus',
                                    modelName: modelResponse.data?.model_name || null
                                });
                            } catch (error) {
                                console.error('Error checking model status:', error);
                                this._panel?.webview.postMessage({
                                    command: 'updateModelStatus',
                                    modelName: null
                                });
                            }
                            break;

                        case 'openSettings':
                        case 'openConfig': {
                            // Open the connection panel to update settings.
                            vscode.commands.executeCommand('sage.openConnectionPanel');
                            break;
                        }
                    }
                },
                undefined,
                this._disposables
            );
        } catch (error: any) {
            console.error('Initialization error:', error);
            this._updateContent('Connection failed', false);
            MessageManager.showError(`Failed to connect: ${error.message}`);
            this._panel.webview.postMessage({
                command: 'showError',
                message: `Failed to connect: ${error.message}`
            });
            throw error;
        }
    }

    _updateContent(status: string, isRunning: boolean = false) {
        if (!this._panel) return;
        this._panel.webview.html = this._getWebviewContent(status, isRunning);
    }

    _getWebviewContent(status: string, isRunning: boolean = false): string {
        // Remote-mode HTML content; settings UI is minimal.
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sage</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'dark-grey': '#1e1e1e',
                        'light-grey': '#2d2d2d',
                        'lighter-grey': '#3d3d3d',
                        'border-grey': '#4d4d4d',
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-dark-grey text-gray-200 h-screen">
    <div class="container mx-auto max-w-4xl h-full flex flex-col p-6">
        <!-- Connection Status -->
        <div class="w-[90%] mx-auto mb-2 text-sm">
            <span class="${isRunning ? 'text-green-500' : 'text-red-500'}">
                ${status}
            </span>
        </div>

        <!-- Status Bar -->
        <div class="w-[90%] mx-auto mb-2 p-4 bg-light-grey rounded-xl flex justify-between items-center shadow-lg">
            <div class="flex items-center gap-4">
                <div id="modelStatus" class="text-gray-400">
                    No model loaded
                </div>
            </div>
            <button 
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                onclick="openSettings()">
                <i class="fas fa-cog mr-2"></i>Settings
            </button>
        </div>

        <!-- Chat History -->
        <div id="chatHistory" class="w-[90%] mx-auto flex-1 overflow-y-auto mb-24 p-4 rounded-xl shadow-lg">
            <!-- Chat messages will appear here -->
        </div>

        <!-- Message Input -->
        <div class="fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl">
            <div class="flex gap-2 p-4 bg-light-grey border border-border-grey rounded-xl shadow-lg">
                <textarea 
                    id="messageInput"
                    class="flex-1 p-3 bg-lighter-grey border border-border-grey rounded-md resize-none min-h-[40px] focus:outline-none focus:border-blue-500"
                    placeholder="Type your message here..."
                    rows="1"
                    onkeydown="handleKeyPress(event)"
                ></textarea>
                <button 
                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    onclick="sendMessage()">
                    Send
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'clearPendingMessage':
                    // Implement any pending message clearing if needed.
                    break;
                case 'addMessage': {
                    const chatHistory = document.getElementById('chatHistory');
                    if (message.message.role === 'user') {
                        chatHistory.innerHTML += \`
                            <div class="flex justify-end mb-2">
                                <div class="bg-blue-600 text-white rounded-lg py-2 px-4 max-w-[80%]">
                                    \${message.message.content}
                                </div>
                            </div>
                        \`;
                    } else {
                        chatHistory.innerHTML += \`
                            <div class="flex justify-start mb-2">
                                <div class="bg-lighter-grey text-white rounded-lg py-2 px-4 max-w-[80%]">
                                    \${message.message.content}
                                </div>
                            </div>
                        \`;
                    }
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                    break;
                }
                case 'updateChatHistory': {
                    const chatHistory = document.getElementById('chatHistory');
                    chatHistory.innerHTML = '';
                    message.messages.forEach((msg) => {
                        if (msg.role === 'user') {
                            chatHistory.innerHTML += \`
                                <div class="flex justify-end mb-2">
                                    <div class="bg-blue-600 text-white rounded-lg py-2 px-4 max-w-[80%]">
                                        \${msg.content}
                                    </div>
                                </div>
                            \`;
                        } else {
                            chatHistory.innerHTML += \`
                                <div class="flex justify-start mb-2">
                                    <div class="bg-lighter-grey text-white rounded-lg py-2 px-4 max-w-[80%]">
                                        \${msg.content}
                                    </div>
                                </div>
                            \`;
                        }
                    });
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                    break;
                }
                case 'updateModelStatus': {
                    const modelStatus = document.getElementById('modelStatus');
                    if (message.modelName) {
                        modelStatus.textContent = message.modelName;
                        modelStatus.classList.remove('text-gray-400');
                        modelStatus.classList.add('text-white');
                    } else {
                        modelStatus.textContent = 'No model loaded';
                        modelStatus.classList.remove('text-white');
                        modelStatus.classList.add('text-gray-400');
                    }
                    break;
                }
                case 'showStatus': {
                    // Optionally handle status updates.
                    break;
                }
                case 'showError': {
                    // Optionally display error messages on the UI.
                    break;
                }
            }
        });

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const text = input.value.trim();
            if (text) {
                input.value = '';
                input.style.height = 'auto';
                vscode.postMessage({ command: 'sendMessage', text });
            }
        }

        function handleKeyPress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function openSettings() {
            vscode.postMessage({ command: 'openSettings' });
        }
    </script>
</body>
</html>`;
    }

    async dispose() {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
        SagePanel.currentPanel = undefined;
    }
}

module.exports = { SagePanel };