import { getState } from './state.js';

export const md = window.markdownit({
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value;
            } catch (__) {}
        }
        return '';
    }
});

export function updateSessionsDropdown(sessionSelect) {
    const state = getState();
    sessionSelect.innerHTML = '';
    state.sessions.forEach(session => {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'flex items-center justify-between px-4 py-2 hover:bg-lighter-grey cursor-pointer';
        if (session.id === state.currentSessionId) {
            sessionDiv.classList.add('bg-lighter-grey');
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = session.name;
        nameSpan.className = 'flex-1';
        
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteButton.className = 'ml-2 text-gray-400 hover:text-red-500';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            vscode.postMessage({
                type: 'deleteSession',
                payload: { sessionId: session.id }
            });
        };

        sessionDiv.appendChild(nameSpan);
        sessionDiv.appendChild(deleteButton);
        
        sessionDiv.onclick = () => {
            vscode.postMessage({
                type: 'switchSession',
                payload: { sessionId: session.id }
            });
            document.getElementById('historyDropdown').classList.add('hidden');
        };
        
        sessionSelect.appendChild(sessionDiv);
    });
}

export function updateChatMessages(chatMessages) {
    const state = getState();
    
    // Store the current scroll position and check if we're at the bottom
    const isAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 10;
    
    chatMessages.innerHTML = '';
    const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
    
    if (currentSession) {
        currentSession.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message-wrapper';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = msg.role === 'user' ? 'message user' : 'message assistant';
            
            // Create a container for the message content
            const messageContent = document.createElement('div');
            messageContent.className = 'content';
            
            // Add the actual message text
            if (msg.role === 'assistant') {
                messageContent.innerHTML = md.render(msg.content);
            } else {
                messageContent.textContent = msg.content;
            }
            
            // Add code tabs if message has code blocks
            if (msg.code && msg.code.length > 0) {
                const codeContainer = document.createElement('div');
                codeContainer.className = 'code-container';
                
                const tabsContainer = document.createElement('div');
                tabsContainer.className = 'code-tabs';
                
                const previewsContainer = document.createElement('div');
                previewsContainer.className = 'code-previews hidden';
                
                msg.code.forEach(codeBlock => {
                    const tabId = `code-${Date.now()}-${Math.random()}`;
                    
                    // Create tab
                    const tab = document.createElement('div');
                    tab.className = 'code-tab';
                    tab.dataset.tabId = tabId;
                    const fileName = codeBlock.filename || 'Code Snippet';
                    const lineInfo = codeBlock.start_line ? ` (${codeBlock.start_line}-${codeBlock.end_line})` : '';
                    tab.textContent = `${fileName}${lineInfo}`;
                    
                    // Create code preview
                    const preview = document.createElement('div');
                    preview.className = 'code-block hidden';
                    preview.dataset.tabId = tabId;
                    
                    const codeHeader = document.createElement('div');
                    codeHeader.className = 'code-header';
                    codeHeader.innerHTML = `
                        <span class="language">${codeBlock.language}</span>
                    `;
                    
                    const codeContent = document.createElement('pre');
                    codeContent.className = `language-${codeBlock.language}`;
                    codeContent.innerHTML = hljs.highlight(codeBlock.code, { language: codeBlock.language }).value;
                    
                    preview.appendChild(codeHeader);
                    preview.appendChild(codeContent);
                    previewsContainer.appendChild(preview);
                    
                    // Add click handler for tab
                    tab.addEventListener('click', () => {
                        const previewsContainer = tab.closest('.code-container').querySelector('.code-previews');
                        const isCurrentlyActive = tab.classList.contains('active');

                        // Hide all code blocks and deactivate all tabs
                        tab.closest('.code-container').querySelectorAll('.code-block').forEach(block => 
                            block.classList.add('hidden'));
                        tab.closest('.code-container').querySelectorAll('.code-tab').forEach(t => 
                            t.classList.remove('active'));
                        previewsContainer.classList.add('hidden');

                        if (!isCurrentlyActive) {
                            // Show this code block and activate this tab
                            preview.classList.remove('hidden');
                            tab.classList.add('active');
                            previewsContainer.classList.remove('hidden');

                            // Get position information
                            const tabRect = tab.getBoundingClientRect();
                            const previewHeight = previewsContainer.offsetHeight;
                            const spaceAbove = tabRect.top;
                            const spaceBelow = window.innerHeight - tabRect.bottom;

                            // Determine if preview should go above or below
                            if (spaceAbove < previewHeight && spaceBelow > spaceAbove) {
                                // Position below
                                previewsContainer.style.top = '100%';
                                previewsContainer.style.bottom = 'auto';
                                previewsContainer.style.marginTop = '8px';
                                previewsContainer.style.marginBottom = '0';
                            } else {
                                // Position above (default)
                                previewsContainer.style.bottom = '100%';
                                previewsContainer.style.top = 'auto';
                                previewsContainer.style.marginBottom = '8px';
                                previewsContainer.style.marginTop = '0';
                            }
                        }
                    });
                    
                    tabsContainer.appendChild(tab);
                });
                
                codeContainer.appendChild(tabsContainer);
                codeContainer.appendChild(previewsContainer);
                contentDiv.appendChild(codeContainer);
            }
            
            // Add timestamp
            const timeDiv = document.createElement('div');
            timeDiv.className = 'timestamp';
            timeDiv.textContent = new Date(msg.timestamp).toLocaleTimeString();
            
            // Append in the correct order
            contentDiv.appendChild(messageContent);
            contentDiv.appendChild(timeDiv);
            messageDiv.appendChild(contentDiv);
            chatMessages.appendChild(messageDiv);
        });
        
        // Only auto-scroll if user was already at the bottom
        if (isAtBottom) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // Add global click handler for closing previews
        document.addEventListener('click', (e) => {
            const previews = document.querySelectorAll('.code-previews');
            const tabs = document.querySelectorAll('.code-tab');
            previews.forEach(preview => {
                if (!preview.contains(e.target) && !e.target.closest('.code-tabs')) {
                    preview.classList.add('hidden');
                    tabs.forEach(tab => tab.classList.remove('active'));
                }
            });
        });
    }

    // Ensure smooth scrolling during streaming
    if (currentSession && currentSession.messages.length > 0) {
        const lastMessage = currentSession.messages[currentSession.messages.length - 1];
        if (lastMessage.role === 'assistant' && lastMessage.content) {
            // Only scroll if we were already at the bottom
            if (isAtBottom) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
    }
}

export function updateModelSelect(modelSelect, models) {
    const state = getState();
    console.log('Updating model select with models:', models);
    
    if (!models || models.length === 0) {
        return;
    }

    // Clear existing options
    modelSelect.innerHTML = '';
    
    // Sort models without affecting the current model display
    const sortedModels = [...models].sort((a, b) => a.localeCompare(b));

    // Create model options as div elements
    sortedModels.forEach(model => {
        const modelOption = document.createElement('div');
        modelOption.className = 'px-4 py-2 hover:bg-lighter-grey cursor-pointer';
        if (model === state.currentModel) {
            modelOption.classList.add('bg-lighter-grey');
        }
        modelOption.textContent = model;
        
        modelOption.onclick = () => {
            vscode.postMessage({
                type: 'loadModel',
                payload: { model: model }
            });
            modelSelect.classList.add('hidden');
        };
        
        modelSelect.appendChild(modelOption);
    });

    return modelSelect;
} 