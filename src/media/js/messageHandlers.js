import { getState, updateState } from './state.js';
import { updateSessionsDropdown, updateChatMessages, updateModelSelect } from './ui.js';

export function handleMessage(message, elements) {
    const state = getState();
    console.log('Received message from extension:', message.type);
    
    switch (message.type) {
        case 'sessionCreated':
            state.sessions.push(message.payload);
            state.currentSessionId = message.payload.id;
            // If we have pending content to send, send it now
            const pendingContent = elements.userInput.value.trim();
            if (pendingContent) {
                vscode.postMessage({
                    type: 'sendMessage',
                    payload: { content: pendingContent }
                });
                elements.userInput.value = '';
                elements.userInput.style.height = 'auto';
            }
            break;
            
        case 'sessionDeleted':
            state.sessions = state.sessions.filter(s => s.id !== message.payload.deletedSessionId);
            state.currentSessionId = message.payload.currentSessionId;
            break;
            
        case 'sessionSwitched':
            state.currentSessionId = message.payload.sessionId;
            break;
            
        case 'messageReceived':
            const receivedSession = state.sessions.find(s => s.id === message.payload.sessionId);
            if (receivedSession) {
                receivedSession.messages = message.payload.messages;
            }
            break;
            
        case 'modelList':
            console.log('Current state when receiving modelList:', getState());
            elements.modelSelect = updateModelSelect(elements.modelSelect, message.payload.models);
            break;

        case 'initialize':
            // Add logging to debug state initialization
            console.log('Before state update:', getState());
            updateState(message.payload);
            console.log('After state update:', getState());
            // Update the current model display immediately after state update
            if (message.payload.currentModel) {
                const currentModelSpan = document.getElementById('currentModel');
                if (currentModelSpan) {
                    console.log('Setting current model display to:', message.payload.currentModel);
                    currentModelSpan.textContent = message.payload.currentModel;
                }
            }
            vscode.postMessage({ type: 'getModels' });
            break;

        case 'modelLoaded':
            state.currentModel = message.payload.model;
            updateState(state);
            // Ensure the current model display is updated
            const currentModelSpan = document.getElementById('currentModel');
            currentModelSpan.textContent = message.payload.model;
            elements.modelSelect = updateModelSelect(elements.modelSelect, message.payload.models);
            break;

        case 'modelUnloaded':
            state.currentModel = null;
            updateState(state);
            break;

        case 'messageUpdated':
            const session = state.sessions.find(s => s.id === message.payload.sessionId);
            if (session) {
                session.messages = message.payload.messages;
                updateChatMessages(elements.chatMessages);
            }
            break;
    }
    
    // Update the stored state
    updateState(state);
    
    // Update the UI
    updateSessionsDropdown(elements.sessionSelect);
    updateChatMessages(elements.chatMessages);
} 