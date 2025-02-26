import { initializeState } from './state.js';
import { setupEventListeners } from './eventListeners.js';
import { handleMessage } from './messageHandlers.js';

// Initialize elements
const elements = {
    chatMessages: document.getElementById('chatMessages'),
    userInput: document.getElementById('userInput'),
    sendButton: document.getElementById('sendMessage'),
    newSessionButton: document.getElementById('newSession'),
    sessionSelect: document.getElementById('sessionSelect'),
    historyDropdown: document.getElementById('historyDropdown'),
    historyDropdownButton: document.getElementById('historyDropdownButton'),
    modelSelect: document.getElementById('modelSelect'),
    modelDropdownButton: document.getElementById('modelDropdownButton'),
    codePreview: document.getElementById('codePreview')
};

// Initialize state
initializeState(initialState);

// Set up event listeners
setupEventListeners(elements);

// Set up message handler
window.addEventListener('message', event => {
    handleMessage(event.data, elements);
}); 