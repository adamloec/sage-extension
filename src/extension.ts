import * as vscode from 'vscode';
import { ChatState, ChatSession, WebviewMessage, ExtensionMessage, ChatMessage } from './types';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { OllamaManager } from './ollama_manager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sage.chatView';
    private _view?: vscode.WebviewView;
    private _chatState: ChatState;
    private _ollamaManager: OllamaManager;
    private _isOllamaInstalled: boolean = false;
    private _hasModelsInstalled: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        const savedState = this._context.globalState.get('chatState') as ChatState | undefined;
        this._ollamaManager = new OllamaManager(savedState?.currentModel || undefined);
        this._chatState = savedState || {
            sessions: [],
            currentSessionId: null,
            currentModel: null
        };
        this.checkOllamaInstallation();
        
        // Add automatic model loading if no model is specified
        if (!this._chatState.currentModel) {
            this.loadFirstAvailableModel();
        }
    }

    private async checkOllamaInstallation() {
        try {
            this._isOllamaInstalled = await this._ollamaManager.checkInstallation();
            if (!this._isOllamaInstalled) {
                vscode.window.showErrorMessage('Ollama is not installed. Please install Ollama to use this extension: https://ollama.ai');
            } else {
                // Only check for models if Ollama is installed
                await this.checkModelsInstalled();
            }
            // Update webview if it exists
            if (this._view) {
                this._view.webview.postMessage({
                    type: 'ollamaStatus',
                    payload: { 
                        installed: this._isOllamaInstalled,
                        hasModels: this._hasModelsInstalled
                    }
                } as ExtensionMessage);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to check Ollama installation: ${error.message}`);
        }
    }

    private async checkModelsInstalled() {
        try {
            const models = await this._ollamaManager.getModels();
            this._hasModelsInstalled = models.length > 0;
            if (!this._hasModelsInstalled) {
                vscode.window.showErrorMessage('No Ollama models found. Please install at least one model using Ollama to use this extension.');
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to check Ollama models: ${error.message}`);
        }
    }

    private async loadFirstAvailableModel() {
        try {
            const models = await this._ollamaManager.getModels();
            if (models.length > 0) {
                const firstModel = models[0];
                await this._ollamaManager.loadModel(firstModel);
                this._chatState.currentModel = firstModel;
                this.saveState();
                
                // Update webview if it exists
                if (this._view) {
                    this._view.webview.postMessage({
                        type: 'initialize',
                        payload: {
                            ...this._chatState,
                            currentModel: firstModel,
                            models: models
                        }
                    } as ExtensionMessage);
                }
            }
        } catch (error: any) {
            console.error('Failed to load first available model:', error);
        }
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        // Check Ollama installation before proceeding
        await this.checkOllamaInstallation();
        
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        this._setWebviewMessageListener(webviewView.webview);

        // Send the initial state including Ollama status and current model
        webviewView.webview.postMessage({
            type: 'initialize',
            payload: {
                ...this._chatState,
                ollamaInstalled: this._isOllamaInstalled,
                hasModels: this._hasModelsInstalled,
                currentModel: this._ollamaManager.model  // Use the actual model from OllamaManager
            }
        } as ExtensionMessage);

        // Handle view visibility changes
        webviewView.onDidChangeVisibility(async () => {
            if (!webviewView.visible) {
                // Unload model when view is hidden
                await this._ollamaManager.unloadModel();
                this._chatState.currentModel = null;
                this.saveState();
            } else {
                // Refresh the state when the view becomes visible
                webviewView.webview.postMessage({
                    type: 'initialize',
                    payload: {
                        ...this._chatState,
                        ollamaInstalled: this._isOllamaInstalled,
                        hasModels: this._hasModelsInstalled,
                        currentModel: this._ollamaManager.model
                    }
                } as ExtensionMessage);
            }
        });

        // Handle view disposal
        webviewView.onDidDispose(async () => {
            // Unload model when view is disposed
            await this._ollamaManager.unloadModel();
            this._chatState.currentModel = null;
            this.saveState();
        });
    }

    private createChatSession(): ChatSession {
        const sessionId = uuidv4();
        const session: ChatSession = {
            id: sessionId,
            name: `Session ${sessionId.slice(0, 8)}`,
            messages: [],
            createdAt: Date.now(),
            lastModified: Date.now()
        };
        this._chatState.sessions.push(session);
        this._chatState.currentSessionId = session.id;
        this.saveState();
        return session;
    }

    private deleteSession(sessionId: string) {
        this._chatState.sessions = this._chatState.sessions.filter(s => s.id !== sessionId);
        if (this._chatState.currentSessionId === sessionId) {
            this._chatState.currentSessionId = this._chatState.sessions.length > 0 ? this._chatState.sessions[0].id : null;
        }
        this.saveState();
    }

    private saveState() {
        this._context.globalState.update('chatState', this._chatState);
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message: WebviewMessage) => {
                // Block all operations if Ollama is not installed or no models available
                if (!this._isOllamaInstalled) {
                    webview.postMessage({
                        type: 'error',
                        payload: { message: 'Ollama is not installed. Please install Ollama to use this extension.' }
                    } as ExtensionMessage);
                    return;
                }
                
                if (!this._hasModelsInstalled && message.type !== 'getModels') {
                    webview.postMessage({
                        type: 'error',
                        payload: { message: 'No Ollama models found. Please install at least one model using Ollama to use this extension.' }
                    } as ExtensionMessage);
                    return;
                }

                switch (message.type) {
                    case 'createSession':
                        const newSession = this.createChatSession();
                        this._view?.webview.postMessage({
                            type: 'sessionCreated',
                            payload: newSession
                        } as ExtensionMessage);
                        break;

                    case 'deleteSession':
                        this.deleteSession(message.payload.sessionId);
                        this._view?.webview.postMessage({
                            type: 'sessionDeleted',
                            payload: { 
                                deletedSessionId: message.payload.sessionId,
                                currentSessionId: this._chatState.currentSessionId,
                                sessions: this._chatState.sessions
                            }
                        } as ExtensionMessage);
                        break;

                    case 'switchSession':
                        this._chatState.currentSessionId = message.payload.sessionId;
                        this.saveState();
                        this._view?.webview.postMessage({
                            type: 'sessionSwitched',
                            payload: { sessionId: message.payload.sessionId }
                        } as ExtensionMessage);
                        break;

                    case 'sendMessage':
                        const session = this._chatState.sessions.find(s => s.id === this._chatState.currentSessionId);
                        if (session) {
                            // Add user message
                            session.messages.push({
                                role: 'user',
                                content: message.payload.content,
                                code: message.payload.code,
                                timestamp: Date.now()
                            });
                            session.lastModified = Date.now();
                            this.saveState();

                            // Send user message to frontend
                            this._view?.webview.postMessage({
                                type: 'messageReceived',
                                payload: { 
                                    sessionId: session.id,
                                    messages: session.messages
                                }
                            } as ExtensionMessage);
                            
                            // Create assistant message placeholder
                            const assistantMessage: ChatMessage = {
                                role: 'assistant',
                                content: '',
                                code: [],
                                timestamp: Date.now()
                            };
                            session.messages.push(assistantMessage);
                            
                            // Stream the response
                            try {
                                for await (const content of this._ollamaManager.generateResponseStream(message.payload.content, session)) {
                                    assistantMessage.content += content;
                                    this.saveState();
                                    
                                    // Send partial message to frontend
                                    this._view?.webview.postMessage({
                                        type: 'messageUpdated',
                                        payload: { 
                                            sessionId: session.id,
                                            messages: session.messages
                                        }
                                    } as ExtensionMessage);
                                }
                            } catch (error: any) {
                                assistantMessage.content = 'An error occurred while generating the response. Please try again.';
                                this.saveState();
                            }
                            
                            // Send final message state
                            this._view?.webview.postMessage({
                                type: 'messageReceived',
                                payload: { 
                                    sessionId: session.id,
                                    messages: session.messages
                                }
                            } as ExtensionMessage);
                        }
                        break;

                    case 'loadModel':
                        try {
                            await this._ollamaManager.loadModel(message.payload.model);
                            this._chatState.currentModel = message.payload.model;
                            this.saveState();
                            console.log('Model loaded:', message.payload.model);
                            this._view?.webview.postMessage({
                                type: 'modelLoaded',
                                payload: { 
                                    model: message.payload.model,
                                    models: await this._ollamaManager.getModels()
                                }
                            } as ExtensionMessage);
                        } catch (error: any) {
                            this._view?.webview.postMessage({
                                type: 'error',
                                payload: { message: `Failed to load model: ${error.message}` }
                            } as ExtensionMessage);
                        }
                        break;

                    case 'unloadModel':
                        try {
                            await this._ollamaManager.unloadModel();
                            this._chatState.currentModel = null;
                            this.saveState();
                            this._view?.webview.postMessage({
                                type: 'modelUnloaded',
                                payload: null
                            } as ExtensionMessage);
                        } catch (error: any) {
                            this._view?.webview.postMessage({
                                type: 'error',
                                payload: { message: `Failed to unload model: ${error.message}` }
                            } as ExtensionMessage);
                        }
                        break;

                    case 'getModels':
                        const models = await this._ollamaManager.getModels();
                        this._view?.webview.postMessage({
                            type: 'modelList',
                            payload: { models: models }
                        } as ExtensionMessage);
                        break;

                    case 'checkOllamaInstallation':
                        await this.checkOllamaInstallation();
                        break;

                    case 'getActiveFileInfo':
                        const fileInfo = this.getActiveFileInfo(message.payload.code);
                        this._view?.webview.postMessage({
                            type: 'fileInfo',
                            payload: fileInfo
                        } as ExtensionMessage);
                        break;
                }
            }
        );
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get URIs for all JS modules
        const mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'media', 'js', 'main.js'));
        const stateScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'media', 'js', 'state.js'));
        const uiScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'media', 'js', 'ui.js'));
        const messageHandlersUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'media', 'js', 'messageHandlers.js'));
        const eventListenersUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'media', 'js', 'eventListeners.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'media', 'style.css'));
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'media', 'chat.html');
        let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

        // Replace template variables
        htmlContent = htmlContent
            .replace(/{{cspSource}}/g, webview.cspSource)
            .replace(/{{styleUri}}/g, styleUri.toString())
            .replace(/{{mainScriptUri}}/g, mainScriptUri.toString())
            .replace(/{{stateScriptUri}}/g, stateScriptUri.toString())
            .replace(/{{uiScriptUri}}/g, uiScriptUri.toString())
            .replace(/{{messageHandlersUri}}/g, messageHandlersUri.toString())
            .replace(/{{eventListenersUri}}/g, eventListenersUri.toString())
            .replace(/{{initialState}}/g, JSON.stringify(this._chatState));

        return htmlContent;
    }

    private getActiveFileInfo(code: string): { filename: string; fileContent: string; filePath: string; startLine: number; endLine: number } | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }

        const document = editor.document;
        const selection = editor.selection;
        const documentText = document.getText();
        
        // Use path.basename() for cross-platform path handling
        const filename = path.basename(document.fileName);
        
        // If there's a selection, use those line numbers
        if (!selection.isEmpty) {
            return {
                filename,
                fileContent: documentText,
                filePath: document.fileName,
                startLine: selection.start.line + 1,
                endLine: selection.end.line + 1
            };
        }

        // If no selection, find the code's location in the file
        const lines = documentText.split('\n');
        let startLine = 1;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(code.split('\n')[0])) {
                startLine = i + 1;
                break;
            }
        }

        return {
            filename,
            fileContent: documentText,
            filePath: document.fileName,
            startLine: startLine,
            endLine: startLine + code.split('\n').length - 1
        };
    }
}

export function activate(context: vscode.ExtensionContext) {
    const chatViewProvider = new ChatViewProvider(context.extensionUri, context);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            chatViewProvider
        )
    );
} 