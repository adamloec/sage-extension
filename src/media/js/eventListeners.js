import { getState } from './state.js';

export function setupEventListeners(elements) {
    elements.historyDropdownButton.addEventListener('click', () => {
        elements.historyDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!elements.historyDropdown.contains(e.target) && !elements.historyDropdownButton.contains(e.target)) {
            elements.historyDropdown.classList.add('hidden');
        }
    });

    elements.newSessionButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'createSession' });
    });

    elements.sendButton.addEventListener('click', () => sendMessage(elements));

    elements.userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(elements);
        }
    });

    elements.userInput.addEventListener('input', () => {
        // Reset height to auto to get the correct scrollHeight
        elements.userInput.style.height = 'auto';
        // Set the height to match the content, with a max of 150px
        elements.userInput.style.height = Math.min(elements.userInput.scrollHeight, 150) + 'px';
    });

    // Add a message handler for file info at the top level
    window.addEventListener('message', event => {
        if (event.data.type === 'fileInfo' && event.data.payload) {
            const fileInfo = event.data.payload;
            // Find the two most recently added tabs
            const tabs = elements.codePreview.querySelectorAll('.code-tab:nth-last-child(-n+2)');
            const codeBlocks = elements.codePreview.querySelectorAll('.code-block:nth-last-child(-n+2)');
            
            if (tabs.length === 2 && codeBlocks.length === 2) {
                // Update full file tab
                tabs[0].textContent = fileInfo.filename;
                codeBlocks[0].dataset.filename = fileInfo.filename;
                
                // Update selection tab
                tabs[1].textContent = `${fileInfo.filename} (${fileInfo.startLine}-${fileInfo.endLine})`;
                codeBlocks[1].dataset.filename = fileInfo.filename;
                codeBlocks[1].dataset.startLine = fileInfo.startLine.toString();
                codeBlocks[1].dataset.endLine = fileInfo.endLine.toString();

                // Update the content of the full file code block with the complete file
                const fullFileContent = codeBlocks[0].querySelector('pre');
                fullFileContent.innerHTML = hljs.highlight(fileInfo.fileContent, 
                    { language: codeBlocks[0].dataset.language }).value;
                codeBlocks[0].dataset.code = fileInfo.fileContent;
            }
        }
    });

    elements.userInput.addEventListener('paste', async (e) => {
        const clipboardData = e.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData('text');
        const vscodeFormat = clipboardData.getData('vscode-editor-data');
        
        if (vscodeFormat && elements.codePreview) {
            try {
                const metadata = JSON.parse(vscodeFormat);
                if (metadata.mode) {
                    e.preventDefault();
                    
                    // Request file info from extension immediately
                    vscode.postMessage({
                        type: 'getActiveFileInfo',
                        payload: { code: pastedText }
                    });

                    // Initialize containers if they don't exist
                    if (!elements.codePreview.querySelector('.code-tabs')) {
                        const tabsContainer = document.createElement('div');
                        tabsContainer.className = 'code-tabs';
                        elements.codePreview.appendChild(tabsContainer);
                    }

                    if (!elements.codePreview.querySelector('.code-previews')) {
                        const previewsContainer = document.createElement('div');
                        previewsContainer.className = 'code-previews hidden';
                        elements.codePreview.appendChild(previewsContainer);
                    }

                    const tabsContainer = elements.codePreview.querySelector('.code-tabs');
                    const previewsContainer = elements.codePreview.querySelector('.code-previews');

                    // Create base tabId
                    const baseTabId = `code-${Date.now()}`;
                    
                    // Create two tabs: one for full file, one for selection
                    const fullFileTab = document.createElement('div');
                    fullFileTab.className = 'code-tab';
                    fullFileTab.dataset.tabId = `${baseTabId}-full`;
                    fullFileTab.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading file...`;
                    
                    const selectionTab = document.createElement('div');
                    selectionTab.className = 'code-tab';
                    selectionTab.dataset.tabId = `${baseTabId}-selection`;
                    selectionTab.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading selection...`;
                    
                    tabsContainer.appendChild(fullFileTab);
                    tabsContainer.appendChild(selectionTab);

                    // Create two code blocks: one for full file, one for selection
                    const createCodeBlock = (tabId, code, language) => {
                        const codeBlock = document.createElement('div');
                        codeBlock.className = 'code-block hidden';
                        codeBlock.dataset.tabId = tabId;
                        
                        const codeHeader = document.createElement('div');
                        codeHeader.className = 'code-header';
                        codeHeader.innerHTML = `
                            <span class="language">${language}</span>
                            <button class="remove-preview" title="Remove code">
                                <i class="fas fa-times"></i>
                            </button>
                        `;
                        
                        const codeContent = document.createElement('pre');
                        codeContent.className = `language-${language}`;
                        codeContent.innerHTML = hljs.highlight(code, { language }).value;
                        
                        codeBlock.appendChild(codeHeader);
                        codeBlock.appendChild(codeContent);
                        codeBlock.dataset.code = code;
                        codeBlock.dataset.language = language;
                        
                        return codeBlock;
                    };

                    // Create and append both code blocks
                    const fullFileBlock = createCodeBlock(`${baseTabId}-full`, pastedText, metadata.mode);
                    const selectionBlock = createCodeBlock(`${baseTabId}-selection`, pastedText, metadata.mode);
                    
                    previewsContainer.appendChild(fullFileBlock);
                    previewsContainer.appendChild(selectionBlock);
                    elements.codePreview.classList.remove('hidden');

                    // Add click handlers for tabs
                    const addTabHandler = (tab, codeBlock) => {
                        tab.addEventListener('click', () => {
                            const isCurrentlyActive = tab.classList.contains('active');

                            document.querySelectorAll('.code-block').forEach(block => 
                                block.classList.add('hidden'));
                            document.querySelectorAll('.code-tab').forEach(t => 
                                t.classList.remove('active'));
                            previewsContainer.classList.add('hidden');

                            if (!isCurrentlyActive) {
                                codeBlock.classList.remove('hidden');
                                tab.classList.add('active');
                                previewsContainer.classList.remove('hidden');
                            }
                        });
                    };

                    addTabHandler(fullFileTab, fullFileBlock);
                    addTabHandler(selectionTab, selectionBlock);

                    // Add click handler to hide preview when clicking outside
                    document.addEventListener('click', (e) => {
                        if (!elements.codePreview.contains(e.target)) {
                            previewsContainer.classList.add('hidden');
                            document.querySelectorAll('.code-tab').forEach(t => 
                                t.classList.remove('active'));
                        }
                    });

                    // Add remove handlers
                    const addRemoveHandler = (tab, codeBlock) => {
                        codeBlock.querySelector('.remove-preview').addEventListener('click', (e) => {
                            e.stopPropagation();
                            tab.remove();
                            codeBlock.remove();
                            
                            if (!tabsContainer.children.length) {
                                elements.codePreview.classList.add('hidden');
                            }
                        });
                    };

                    addRemoveHandler(fullFileTab, fullFileBlock);
                    addRemoveHandler(selectionTab, selectionBlock);
                }
            } catch (e) {
                console.error('Error processing VS Code paste:', e);
            }
        }
    });

    // Add model dropdown button click handler
    elements.modelDropdownButton.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.modelSelect.classList.toggle('hidden');
    });

    // Add click outside handler for model dropdown
    document.addEventListener('click', (e) => {
        if (!elements.modelSelect.contains(e.target) && !elements.modelDropdownButton.contains(e.target)) {
            elements.modelSelect.classList.add('hidden');
        }
    });
}

function sendMessage(elements) {
    const content = elements.userInput.value.trim();
    const codeBlocks = Array.from(elements.codePreview.querySelectorAll('.code-block')).map(block => {
        // Base code block object
        const codeBlock = {
            language: block.dataset.language,
            code: block.dataset.code,
            filename: block.dataset.filename || ''
        };

        // Only add line numbers if they exist (for selection blocks)
        if (block.dataset.startLine && block.dataset.endLine) {
            codeBlock.start_line = parseInt(block.dataset.startLine);
            codeBlock.end_line = parseInt(block.dataset.endLine);
        }

        return codeBlock;
    });

    if (content || codeBlocks.length > 0) {
        const state = getState();
        if (!state.currentSessionId) {
            vscode.postMessage({ type: 'createSession' });
            return;
        }

        vscode.postMessage({
            type: 'sendMessage',
            payload: { 
                content: content,
                code: codeBlocks
            }
        });

        // Clear everything
        elements.userInput.value = '';
        elements.userInput.style.height = 'auto';
        elements.codePreview.innerHTML = '';
        elements.codePreview.classList.add('hidden');
    }
} 