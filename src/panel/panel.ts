import * as vscode from 'vscode';
const { ServerManager } = require('../utils/server_manager');
const axios = require('axios');
const { MessageManager } = require('../utils/message_manager');
import { getSettingsModalHtml, getSettingsModalScripts } from './settings_modal';
const { BackendInstaller } = require('../installation');
export class SagePanel {
    private _context: vscode.ExtensionContext;
    private _panel: vscode.WebviewPanel | undefined;
    private _serverManager: typeof ServerManager;
    private _disposables: vscode.Disposable[];
    static currentPanel: SagePanel | undefined;
    private _currentSessionId: string | undefined;
    private _isInitializing: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._panel = undefined;
        this._serverManager = new ServerManager(context);
        this._disposables = [];
        this._currentSessionId = undefined;
    }

    static async createOrShow(context: vscode.ExtensionContext) {
        // First check configuration to determine mode
        const config = vscode.workspace.getConfiguration('sage');
        const isStandalone = config.get('standalone') as boolean;

        if (isStandalone) {
            // Only check local installation if in standalone mode
            const installer = new BackendInstaller(context);
            const isInstalled = await installer.isInstalled();

            if (!isInstalled) {
                vscode.commands.executeCommand('sage.openConnectionPanel');
                return;
            }
        }

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.Two;

        // If we already have a panel, show it
        if (SagePanel.currentPanel && SagePanel.currentPanel._panel) {
            SagePanel.currentPanel._panel.reveal(column);
            return;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'sagePanel',
            'Sage',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true
            }
        );

        SagePanel.currentPanel = new SagePanel(context);
        SagePanel.currentPanel._panel = panel;

        // Handle panel disposal before initialization
        panel.onDidDispose(
            async () => {
                try {
                    if (SagePanel.currentPanel) {
                        await SagePanel.currentPanel.dispose();
                        MessageManager.showInfo('Sage server stopped');
                    }
                } catch (error: any) {
                    console.error('Error during panel disposal:', error);
                    MessageManager.showError(`Failed to stop server: ${error.message}`);
                }
            },
            null,
            context.subscriptions
        );

        // Initialize after setting up disposal handler
        await SagePanel.currentPanel._initialize();

        return SagePanel.currentPanel;
    }

    async _initialize() {
        if (!this._panel) {
            return;
        }

        this._isInitializing = true;
        const config = vscode.workspace.getConfiguration('sage');
        const isStandalone = config.get('standalone') as boolean;

        try {
            if (isStandalone) {
                // Only start server in standalone mode
                this._updateContent('Starting server...', false);
                await this._serverManager.startServer();
                
                // Check if panel was disposed during initialization
                if (!this._panel) {
                    console.log('Panel was disposed during initialization, cleaning up...');
                    await this._serverManager.stopServer();
                    this._isInitializing = false;
                    return;
                }

                this._updateContent('Server running', true);
                MessageManager.showInfo('Sage server started successfully');
            } else {
                this._updateContent('Connected to remote server', true);
            }

            this._panel.webview.postMessage({ 
                command: 'showStatus', 
                message: isStandalone ? 'Server started successfully' : 'Connected to remote server'
            });

            // Add message handler for button clicks and status checks
            this._panel.webview.onDidReceiveMessage(
                async (message: { command: string; text?: string }) => {
                    switch (message.command) {

                        case 'sendMessage':
                            try {
                                const config = vscode.workspace.getConfiguration('sage');
                                const isStandalone = config.get('standalone') as boolean;
                                const backendUrl = isStandalone 
                                    ? 'http://localhost:8000'  // Local backend in standalone mode
                                    : config.get('remoteBackendUrl') as string;  // Remote server URL

                                if (isStandalone) {
                                    // In standalone mode, check if model is loaded first
                                    const modelResponse = await axios.get(`${backendUrl}/api/llm`);
                                    if (!modelResponse.data?.model_name) {
                                        MessageManager.showError('Load a model before attempting to use the chat.');
                                        this._panel?.webview.postMessage({ 
                                            command: 'clearPendingMessage' 
                                        });
                                        return;
                                    }
                                }

                                // If we have a message text, proceed with chat
                                if (message.text) {
                                    // Create session if this is the first message
                                    if (!this._currentSessionId) {
                                        const sessionResponse = await axios.post(`${backendUrl}/api/chat/sessions`);
                                        this._currentSessionId = sessionResponse.data.session_id;
                                        // Load initial chat history
                                        this._panel?.webview.postMessage({
                                            command: 'updateChatHistory',
                                            messages: sessionResponse.data.messages
                                        });
                                    }

                                    // Send the message
                                    const response = await axios.post(
                                        `${backendUrl}/api/chat/sessions/${this._currentSessionId}/messages`,
                                        { content: message.text }
                                    );

                                    // Update UI with the new message
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
                                // Clear the pending message from UI
                                this._panel?.webview.postMessage({ 
                                    command: 'clearPendingMessage' 
                                });
                            }
                            break;

                        case 'checkModelStatus':
                            try {
                                const modelResponse = await axios.get('http://localhost:8000/api/llm');
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
                            if (vscode.workspace.getConfiguration('sage').get('standalone')) {
                                if (this._panel) {
                                    this._panel.webview.postMessage({ command: 'openSettings' });
                                }
                            }
                            break;

                        case 'openConfig':
                            if (vscode.workspace.getConfiguration('sage').get('standalone')) {
                                vscode.commands.executeCommand('sage.openConnectionPanel');
                            }
                            break;
                    }
                },
                undefined,
                this._disposables
            );
        } catch (error: any) {
            console.error('Initialization error:', error);
            if (isStandalone) {
                // Only attempt to stop server on error if in standalone mode
                await this._serverManager.stopServer();
            }
            
            if (this._panel) {
                const errorMessage = isStandalone 
                    ? `Failed to start server: ${error.message}`
                    : `Failed to connect: ${error.message}`;
                this._updateContent(isStandalone ? 'Server stopped' : 'Connection failed', false);
                MessageManager.showError(errorMessage);
                this._panel.webview.postMessage({ 
                    command: 'showError', 
                    message: errorMessage 
                });
            }
            throw error;
        } finally {
            this._isInitializing = false;
        }
    }

    _updateContent(status: string, isRunning: boolean = false) {
        if (!this._panel) {
            return;
        }

        this._panel.webview.html = this._getWebviewContent(status, isRunning);
    }

    _getWebviewContent(status: string, isRunning: boolean = false): string {
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
                <!-- Server Status Text -->
                <div class="w-[90%] mx-auto mb-2 text-sm">
                    <span class="${isRunning ? 'text-green-500' : 'text-red-500'}">
                        ${status || (isRunning ? 'Server running' : 'Server stopped')}
                    </span>
                </div>

                <!-- Status Bar -->
                <div class="w-[90%] mx-auto mb-2 p-4 bg-light-grey rounded-xl flex justify-between items-center shadow-lg">
                    <div class="flex items-center gap-4">
                        <div id="modelStatus" class="text-gray-400">
                            No model loaded
                        </div>
                    </div>
                    ${vscode.workspace.getConfiguration('sage').get('standalone') ? `
                        <button 
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                            onclick="openSettings()">
                            <i class="fas fa-cog mr-2"></i>Settings
                        </button>
                    ` : ''}
                </div>

                <!-- Chat History -->
                <div id="chatHistory" class="w-[90%] mx-auto flex-1 overflow-y-auto mb-24 p-4 rounded-xl shadow-lg">
                    <!-- Chat messages will be populated here -->
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

            <!-- Settings Modal (only included in standalone mode) -->
            ${vscode.workspace.getConfiguration('sage').get('standalone') ? getSettingsModalHtml() : ''}

            <script>
                const vscode = acquireVsCodeApi();

                // Add message handler for server responses
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'clearPendingMessage':
                            // Do nothing - message wasn't added to UI yet
                            break;
                        case 'addMessage':
                            const chatHistory = document.getElementById('chatHistory');
                            // Add both user and assistant messages
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
                        case 'updateChatHistory':
                            const history = document.getElementById('chatHistory');
                            history.innerHTML = ''; // Clear existing messages
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
                        case 'updateModelStatus':
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
                });

                function sendMessage() {
                    const input = document.getElementById('messageInput');
                    const message = input.value.trim();
                    if (message) {
                        // Store message in input but don't display yet
                        const pendingMessage = message;
                        
                        // Clear input right away
                        input.value = '';
                        input.style.height = 'auto';
                        
                        // Send to extension
                        vscode.postMessage({ 
                            command: 'sendMessage',
                            text: pendingMessage 
                        });
                    }
                }

                function handleKeyPress(event) {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                    }
                }

                // Auto-resize textarea
                const textarea = document.getElementById('messageInput');
                textarea.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = this.scrollHeight + 'px';
                });

                function openSettings() {
                    document.getElementById('settingsModal').classList.remove('hidden');
                    updateSettingsStatus();
                }

                function closeSettings() {
                    document.getElementById('settingsModal').classList.add('hidden');
                }

                function openConfigFile() {
                    vscode.postMessage({ command: 'openConfig' });
                }

                // Close modal when clicking outside
                document.getElementById('settingsModal').addEventListener('click', (e) => {
                    if (e.target.id === 'settingsModal') {
                        closeSettings();
                    }
                });

                ${vscode.workspace.getConfiguration('sage').get('standalone') ? getSettingsModalScripts() : ''}
            </script>
        </body>
        </html>`;
    }

    async dispose() {
        // Prevent multiple disposal attempts
        if (!this._panel) {
            return;
        }

        const config = vscode.workspace.getConfiguration('sage');
        const isStandalone = config.get('standalone') as boolean;

        try {
            // Only stop server if in standalone mode
            if (isStandalone) {
                await this._serverManager.stopServer();
            }
        } catch (error) {
            console.error('Error during disposal:', error);
        }

        // Clean up panel resources
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Dispose panel last
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
        
        SagePanel.currentPanel = undefined;
    }
}

module.exports = { SagePanel };