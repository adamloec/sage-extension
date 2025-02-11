import * as vscode from 'vscode';
import axios from 'axios';
const { BackendInstaller } = require('../installation');
import { loadServerProfiles, saveServerProfiles } from '../utils/server_profiles';

class ConnectionPanel {
    private _context: vscode.ExtensionContext;
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[];
    static currentPanel: ConnectionPanel | undefined;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._panel = undefined;
        this._disposables = [];
    }

    static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.Two;

        if (ConnectionPanel.currentPanel) {
            ConnectionPanel.currentPanel._panel?.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'sageConnection',
            'Sage Backend Configuration',
            column || vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        ConnectionPanel.currentPanel = new ConnectionPanel(context);
        ConnectionPanel.currentPanel._panel = panel;
        ConnectionPanel.currentPanel._initialize();
    }

    private async _initialize() {
        if (!this._panel) return;

        // Get current configuration
        const config = vscode.workspace.getConfiguration('sage');
        const currentRemoteBackendUrl = config.get('currentRemoteBackendUrl') as string;
        const isStandalone = config.get('standalone') as boolean;
        const isConfigured = config.get('isConfigured') as boolean;

        // Check if backend is installed locally
        const installer = new BackendInstaller(this._context);
        const isInstalled = await installer.isInstalled();

        this._updateContent(isInstalled, currentRemoteBackendUrl, isStandalone, isConfigured);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'saveConfiguration':
                        try {
                            const { mode, remoteBackendUrl } = message;
                            const isStandalone = mode === 'standalone';

                            // Validate configuration
                            if (isStandalone && !isInstalled) {
                                throw new Error('Local backend not installed');
                            }

                            if (!isStandalone && !remoteBackendUrl) {
                                throw new Error('Backend URL required for remote connection');
                            }   

                            // For remote backend, test connection and update persisted server profiles
                            if (!isStandalone) {
                                const healthResponse = await axios.get(`${remoteBackendUrl}/health`);
                                if (healthResponse.status !== 200) {
                                    throw new Error('Could not connect to backend');
                                }
                                
                                // Retrieve persisted server profiles from the global storage
                                let serverProfiles = await loadServerProfiles(this._context);

                                // Check if we already have a profile for this server
                                let storedProfile = serverProfiles[remoteBackendUrl];

                                // Call the API endpoint to create or get a user record
                                const userApiUrl = `${remoteBackendUrl}/api/user/users`;
                                interface UserResponseData {
                                    id: string;
                                }
                                
                                const userResponse = await axios.post<UserResponseData>(
                                    userApiUrl,
                                    {}, // no body needed
                                    {
                                        headers: storedProfile ? { 'x-user-id': storedProfile.userId } : {}
                                    }
                                );

                                // Save or update the user id for this server in the serverProfiles mapping
                                serverProfiles[remoteBackendUrl] = { userId: userResponse.data.id };
                                await saveServerProfiles(this._context, serverProfiles);
                            }

                            // Update configuration settings for the connection type
                            await vscode.workspace.getConfiguration().update('sage.standalone', isStandalone, true);
                            await vscode.workspace.getConfiguration().update(
                                'sage.currentRemoteBackendUrl', 
                                isStandalone ? 'http://localhost:8000' : remoteBackendUrl, 
                                true
                            );
                            await vscode.workspace.getConfiguration().update('sage.isConfigured', true, true);

                            vscode.window.showInformationMessage('Backend configuration saved successfully');
                            this.dispose();
                            await vscode.commands.executeCommand('sage.openPanel');
                        } catch (error: any) {
                            vscode.window.showErrorMessage(`Configuration failed: ${error}`);
                        }
                        break;

                    case 'installBackend':
                        try {
                            const installer = new BackendInstaller(this._context);
                            await installer.install();
                            this._initialize(); // Refresh panel after installation
                        } catch (error: any) {
                            vscode.window.showErrorMessage(`Installation failed: ${error}`);
                        }
                        break;
                }
            },
            undefined,
            this._disposables
        );

        this._panel.onDidDispose(
            () => {
                ConnectionPanel.currentPanel = undefined;
                this.dispose();
            },
            null,
            this._disposables
        );
    }

    private _updateContent(
        isInstalled: boolean, 
        currentRemoteBackendUrl: string, 
        isStandalone: boolean,
        isConfigured: boolean
    ) {
        if (!this._panel) return;

        this._panel.webview.html = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Select Sage Backend</title>
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
        <body class="bg-dark-grey text-gray-200 h-screen flex items-center justify-center">
            <div class="max-w-md w-full p-8 bg-light-grey rounded-xl shadow-lg">
                <h1 class="text-2xl font-bold mb-6 text-center">Select Sage Backend</h1>
                <div class="space-y-6">
                    <!-- Mode Selection -->
                    <div class="space-y-4">
                        <label class="block font-medium mb-2">Backend Mode</label>
                        <div class="space-y-2">
                            <label class="flex items-center space-x-3">
                                <input type="radio" name="mode" value="standalone" 
                                    ${isStandalone ? 'checked' : ''} 
                                    class="form-radio"
                                    onchange="updateMode('standalone')">
                                <span>Standalone (Local Backend)</span>
                            </label>
                            <label class="flex items-center space-x-3">
                                <input type="radio" name="mode" value="remote" 
                                    ${!isStandalone ? 'checked' : ''} 
                                    class="form-radio"
                                    onchange="updateMode('remote')">
                                <span>Remote Backend</span>
                            </label>
                        </div>
                    </div>

                    <!-- Standalone Section -->
                    <div id="standaloneSection" class="p-4 bg-lighter-grey rounded-lg ${!isStandalone ? 'hidden' : ''}">
                        ${isInstalled ? 
                            `<p class="text-sm text-green-500 mb-4">✓ Local backend is installed</p>` :
                            `<p class="text-sm text-gray-400 mb-4">Local backend needs to be installed</p>
                            <button 
                                onclick="installBackend()"
                                class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                                Install Backend
                            </button>`
                        }
                    </div>

                    <!-- Remote Section -->
                    <div id="remoteSection" class="p-4 bg-lighter-grey rounded-lg ${isStandalone ? 'hidden' : ''}">
                        <input 
                            type="text" 
                            id="remoteBackendUrl"
                            value="${!isStandalone ? currentRemoteBackendUrl : ''}"
                            placeholder="Enter backend URL (e.g., http://localhost:8000)"
                            class="w-full p-2 mb-4 bg-dark-grey border border-border-grey rounded-md focus:outline-none focus:border-blue-500"
                        >
                    </div>

                    <!-- Save Button -->
                    <button 
                        onclick="saveConfiguration()"
                        class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                        Connect to Sage
                    </button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let currentMode = '${isStandalone ? 'standalone' : 'remote'}';

                function updateMode(mode) {
                    currentMode = mode;
                    document.getElementById('standaloneSection').classList.toggle('hidden', mode !== 'standalone');
                    document.getElementById('remoteSection').classList.toggle('hidden', mode === 'standalone');
                }

                function installBackend() {
                    vscode.postMessage({ command: 'installBackend' });
                }

                function saveConfiguration() {
                    const remoteBackendUrl = document.getElementById('remoteBackendUrl').value.trim();
                    vscode.postMessage({ 
                        command: 'saveConfiguration',
                        mode: currentMode,
                        remoteBackendUrl: currentMode === 'standalone' ? null : remoteBackendUrl
                    });
                }
            </script>
        </body>
        </html>`;
    }

    dispose() {
        this._panel?.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

module.exports = { ConnectionPanel };