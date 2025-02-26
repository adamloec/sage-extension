export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    code: ChatMessageCode[];
    timestamp: number;
}

export interface ChatMessageCode {
    language: string;
    code: string;
    filename: string;
    start_line: number;
    end_line: number;
}

export interface ChatSession {
    id: string;
    name: string;
    messages: ChatMessage[];
    createdAt: number;
    lastModified: number;
}

export interface ChatState {
    sessions: ChatSession[];
    currentSessionId: string | null;
    currentModel: string | null;
}

// Messages between webview and extension
export interface WebviewMessage {
    type: 'createSession' | 'deleteSession' | 'switchSession' | 'sendMessage' | 
          'loadModel' | 'unloadModel' | 'checkOllamaInstallation' | 'getModels' | 'getActiveFileInfo';
    payload: any;
}

export type ExtensionMessage = {
    type: 'ollamaStatus' | 'sessionCreated' | 'sessionDeleted' | 'sessionSwitched' | 
          'messageReceived' | 'modelLoaded' | 'modelUnloaded' | 'error' | 'initialize' | 
          'modelList' | 'messageUpdated' | 'fileInfo';
    payload: any;
};