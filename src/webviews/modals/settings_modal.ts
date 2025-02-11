import { getLLMConfigModalHtml, getLLMConfigModalScripts } from './llm_config_modal';

export function getSettingsModalHtml(): string {
    return `
    <div id="settingsModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-light-grey rounded-xl p-6 w-[90%] max-w-2xl shadow-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold">Settings</h2>
                <button onclick="closeSettings()" class="text-gray-400 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="space-y-6">
                <!-- Server Info Banner -->
                <div class="bg-darker-grey rounded-lg p-3 flex justify-between items-center">
                    <div class="flex items-center gap-4">
                        <span class="text-green-500">●</span>
                        <span>Local Server (Port 8000)</span>
                    </div>
                </div>

                <!-- LLM Configuration Section -->
                <div class="bg-darker-grey rounded-lg p-4">
                    <h3 class="text-lg mb-4">Model Configuration</h3>
                    
                    <!-- Current Model Selection -->
                    <div class="mb-4">
                        <label class="block text-sm mb-2">Current Model</label>
                        <div class="relative">
                            <select id="currentModel" 
                                class="w-full p-2 bg-light-grey border border-border-grey rounded-md focus:outline-none focus:border-blue-500">
                                <option value="">Select a model...</option>
                            </select>
                        </div>
                    </div>

                    <!-- Saved Configurations -->
                    <div>
                        <div class="flex justify-between items-center mb-2">
                            <label class="text-sm">Saved Configurations</label>
                            <button onclick="addNewConfig()" 
                                class="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-sm text-white rounded-lg transition-colors">
                                <i class="fas fa-plus mr-1"></i>Add New
                            </button>
                        </div>
                        <div id="savedConfigs" class="space-y-2 max-h-60 overflow-y-auto">
                            <!-- Configurations will be populated here -->
                            <div class="text-gray-400 text-sm text-center p-4" id="noConfigsMessage">
                                No saved configurations
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    ${getLLMConfigModalHtml()}`;
}

export function getSettingsModalScripts(): string {
    return `
    let currentConfigs = [];

    function openSettings() {
        document.getElementById('settingsModal').classList.remove('hidden');
        loadConfigurations();
    }

    function closeSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    async function loadConfigurations() {
        try {
            // Get current model
            const currentModelResponse = await fetch('http://localhost:8000/api/llm');
            const currentModel = await currentModelResponse.json();
            
            // Get all saved configs
            const configsResponse = await fetch('http://localhost:8000/api/llm/configs');
            const configs = await configsResponse.json();
            currentConfigs = configs;
            
            updateConfigsUI(configs, currentModel);
        } catch (error) {
            console.error('Failed to load configurations:', error);
        }
    }

    function updateConfigsUI(configs, currentModel) {
        const select = document.getElementById('currentModel');
        select.innerHTML = '<option value="">Select a model...</option>';
        configs.forEach(config => {
            const option = document.createElement('option');
            option.value = config.id;
            option.textContent = config.model_name;
            if (currentModel && config.model_name === currentModel.model_name) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        const configsContainer = document.getElementById('savedConfigs');
        const noConfigsMessage = document.getElementById('noConfigsMessage');
        
        if (configs.length === 0) {
            noConfigsMessage.style.display = 'block';
            configsContainer.innerHTML = noConfigsMessage.outerHTML;
            return;
        }

        noConfigsMessage.style.display = 'none';
        configsContainer.innerHTML = configs.map(config => {
            return \`<div class="flex justify-between items-center p-2 bg-light-grey rounded-lg">
                <div>
                    <div class="font-medium">\${config.model_name}</div>
                    <div class="text-sm text-gray-400">\${config.model_path}</div>
                </div>
                <button onclick="deleteConfig(\${config.id})" 
                    class="text-red-400 hover:text-red-500">
                    <i class="fas fa-trash"></i>
                </button>
            </div>\`;
        }).join('');
    }

    // Handle model selection change
    document.getElementById('currentModel').addEventListener('change', async (e) => {
        const configId = e.target.value;
        const config = currentConfigs.find(c => c.id === parseInt(configId));
        if (config) {
            try {
                const response = await fetch('http://localhost:8000/api/llm', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                });

                if (response.ok) {
                    vscode.postMessage({ 
                        command: 'updateModelStatus',
                        modelName: config.model_name 
                    });
                }
            } catch (error) {
                console.error('Failed to update current model:', error);
            }
        }
    });

    async function deleteConfig(configId) {
        try {
            await fetch(\`http://localhost:8000/api/llm/configs/\${configId}\`, {
                method: 'DELETE'
            });
            
            // Check if this was the current model
            const currentModelResponse = await fetch('http://localhost:8000/api/llm');
            const currentModel = await currentModelResponse.json();
            
            if (currentModel && currentModel.id === configId) {
                // Remove the current model
                await fetch('http://localhost:8000/api/llm', {
                    method: 'DELETE'
                });
                vscode.postMessage({ 
                    command: 'updateModelStatus',
                    modelName: null 
                });
            }
            
            loadConfigurations();
        } catch (error) {
            console.error('Failed to delete configuration:', error);
        }
    }

    function addNewConfig() {
        document.getElementById('newConfigModal').classList.remove('hidden');
    }

    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') {
            closeSettings();
        }
    });

    ${getLLMConfigModalScripts()}
    `;
} 