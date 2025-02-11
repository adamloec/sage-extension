import * as vscode from 'vscode';
const axios = require('axios');
import { ServerManager } from '../utils/server_manager';
import { MessageManager } from '../utils/message_manager';
import { getSettingsModalHtml, getSettingsModalScripts } from './modals/settings_modal';

export class StandalonePanel {
    private _context: vscode.ExtensionContext;
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[];
    static currentPanel: StandalonePanel | undefined;
    private _currentSessionId: string | undefined;

    private _serverManager: ServerManager;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._serverManager = new ServerManager(context);
        this._disposables = [];
        this._currentSessionId = undefined;
    }

    static async createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
        
        if (StandalonePanel.currentPanel && StandalonePanel.currentPanel._panel) {
            StandalonePanel.currentPanel._panel.reveal(column);
            return StandalonePanel.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel(
            'sageStandalone',
            'Sage (Standalone Mode)',
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        StandalonePanel.currentPanel = new StandalonePanel(context);
        StandalonePanel.currentPanel._panel = panel;

        panel.onDidDispose(() => {
            StandalonePanel.currentPanel?.dispose();
        }, null, context.subscriptions);

        await StandalonePanel.currentPanel._initialize();
        return StandalonePanel.currentPanel;
    }

    async _initialize() {
        if (!this._panel) return;

        try {
            // Update UI to show initialization/start-up
            this._updateContent('Starting server...', false);

            // Start the local server (standalone mode)
            await this._serverManager.startServer();

            // Check if the panel was disposed while starting up
            if (!this._panel) {
                console.log('Panel disposed during initialization. Stopping server.');
                await this._serverManager.stopServer();
                return;
            }
            this._updateContent('Server running', true);
            MessageManager.showInfo('Sage server started successfully');

            // Inform the webview of successful startup
            this._panel.webview.postMessage({
                command: 'showStatus',
                message: 'Server started successfully'
            });

            // Register message handlers for the webview
            this._panel.webview.onDidReceiveMessage(
                async (message: { command: string; text?: string }) => {
                    const backendUrl = 'http://localhost:8000';

                    switch (message.command) {
                        case 'sendMessage': {
                            try {

                                // Validate that a model is loaded before sending any messages.
                                const modelResponse = await axios.get(`${backendUrl}/api/llm`);
                                if (!modelResponse.data?.model_name) {
                                    MessageManager.showError('Load a model before attempting to use the chat.');
                                    this._panel?.webview.postMessage({ command: 'clearPendingMessage' });
                                    return;
                                }

                                if (message.text) {
                                    // Create a chat session if none has been initiated yet.
                                    if (!this._currentSessionId) {
                                        const sessionResponse = await axios.post(
                                            `${backendUrl}/api/chat/sessions`,
                                            null,
                                            { headers: { 'x-user-id': 'standalone-user' } }
                                        );
                                        this._currentSessionId = sessionResponse.data.session_id;
                                        // Send the initial chat history from the backend
                                        this._panel?.webview.postMessage({
                                            command: 'updateChatHistory',
                                            messages: sessionResponse.data.messages
                                        });
                                    }

                                    // Immediately add the user's message to the chat history.
                                    this._panel?.webview.postMessage({
                                        command: 'addMessage',
                                        message: { role: 'user', content: message.text }
                                    });

                                    // Post the user's message to the backend.
                                    const response = await axios.post(
                                        `${backendUrl}/api/chat/sessions/${this._currentSessionId}/messages`,
                                        { content: message.text }
                                    );

                                    // Add the assistant's (model) response if available.
                                    if (response.data.message) {
                                        this._panel?.webview.postMessage({
                                            command: 'addMessage',
                                            message: response.data.message
                                        });
                                    }
                                }
                            } catch (error: any) {
                                console.error('Error in sendMessage:', error);
                                MessageManager.showError(`Failed to send message: ${error.message}`);
                                // Display error as an assistant message.
                                this._panel?.webview.postMessage({
                                    command: 'addMessage',
                                    message: { role: 'assistant', content: `Error: ${error.message}` }
                                });
                                // Clear any pending UI state.
                                this._panel?.webview.postMessage({ command: 'clearPendingMessage' });
                            }
                            break;
                        }
                        case 'checkModelStatus': {
                            try {
                                const modelResponse = await axios.get(`${backendUrl}/api/llm`);
                                this._panel?.webview.postMessage({
                                    command: 'updateModelStatus',
                                    modelName: modelResponse.data?.model_name || null
                                });
                            } catch (error) {
                                console.error('Error checking model status:', error);
                                this._panel?.webview.postMessage({ command: 'updateModelStatus', modelName: null });
                            }
                            break;
                        }
                        case 'openSettings': {
                            this._panel?.webview.postMessage({ command: 'openSettings' });
                            break;
                        }
                        case 'openConfig': {
                            vscode.commands.executeCommand('sage.openConnectionPanel');
                            break;
                        }
                    }
                },
                undefined,
                this._disposables
            );

        } catch (error: any) {
            console.error('StandalonePanel initialization error:', error);
            await this._serverManager.stopServer();
            this._updateContent('Server stopped', false);
            MessageManager.showError(`Failed to start server: ${error.message}`);
            this._panel?.webview.postMessage({
                command: 'showError',
                message: `Failed to start server: ${error.message}`
            });
            throw error;
        } finally {
            this._isInitializing = false;
        }
    }

    _updateContent(status: string, isRunning: boolean) {
        if (!this._panel) return;
        this._panel.webview.html = this._getWebviewContent(status, isRunning);
    }

    _getWebviewContent(status: string, isRunning: boolean): string {
        // Note: We assume standalone mode so we can always include the settings modal.
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sage (Standalone Mode)</title>
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
        <!-- Server Status Text -->
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

        <!-- Floating Input Container -->
        <div class="fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl">
            <div class="flex gap-2 p-4 bg-light-grey border border-border-grey rounded-xl shadow-lg">
                <textarea 
                    class="flex-1 p-3 bg-lighter-grey border border-border-grey rounded-md resize-none min-h-[40px] focus:outline-none focus:border-blue-500"
                    placeholder="Type your message here..."
                    id="messageInput"
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

    <!-- Settings Modal -->
    ${getSettingsModalHtml()}
    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'clearPendingMessage':
                    // Optionally clear pending UI states
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
                    const history = document.getElementById('chatHistory');
                    history.innerHTML = '';
                    message.messages.forEach(msg => {
                        if (msg.role === 'user') {
                            history.innerHTML += \`
                                <div class="flex justify-end mb-2">
                                    <div class="bg-blue-600 text-white rounded-lg py-2 px-4 max-w-[80%]">
                                        \${msg.content}
                                    </div>
                                </div>
                            \`;
                        } else {
                            history.innerHTML += \`
                                <div class="flex justify-start mb-2">
                                    <div class="bg-lighter-grey text-white rounded-lg py-2 px-4 max-w-[80%]">
                                        \${msg.content}
                                    </div>
                                </div>
                            \`;
                        }
                    });
                    history.scrollTop = history.scrollHeight;
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
                case 'openSettings': {
                    document.getElementById('settingsModal').classList.remove('hidden');
                    break;
                }
                case 'showStatus': {
                    // Optionally, update local UI according to server status
                    break;
                }
                case 'showError': {
                    // Optionally, display error messages in the UI
                    break;
                }
            }
        });

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            if (message) {
                input.value = '';
                input.style.height = 'auto';
                vscode.postMessage({ command: 'sendMessage', text: message });
            }
        }

        function handleKeyPress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function openSettings() {
            document.getElementById('settingsModal').classList.remove('hidden');
        }

        function closeSettings() {
            document.getElementById('settingsModal').classList.add('hidden');
        }

        ${getSettingsModalScripts()}
    </script>
</body>
</html>`;
    }

    async dispose() {
        if (!this._panel) return;
        try {
            await this._serverManager.stopServer();
            vscode.window.showInformationMessage("Server stopped successfully");
        } catch (error) {
            console.error('Error during standalone panel disposal:', error);
        }
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) disposable.dispose();
        }
        this._panel.dispose();
        this._panel = undefined;
        StandalonePanel.currentPanel = undefined;
    }
} 