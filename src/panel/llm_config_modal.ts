export function getLLMConfigModalHtml(): string {
    return `
    <div id="newConfigModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-light-grey rounded-xl p-6 w-[90%] max-w-3xl shadow-2xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-semibold">Add New Model</h2>
                <button onclick="closeNewConfig()" class="text-gray-400 hover:text-white">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="space-y-4">
                <!-- Required Fields -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm mb-2">Model Name*</label>
                        <input type="text" id="newModelName" 
                            class="w-full p-2 bg-darker-grey border border-border-grey rounded-md focus:outline-none focus:border-blue-500 text-white"
                            placeholder="e.g., Mistral 7B">
                    </div>
                    
                    <div>
                        <label class="block text-sm mb-2">Model Path</label>
                        <input type="text" id="newModelPath" 
                            class="w-full p-2 bg-darker-grey border border-border-grey rounded-md focus:outline-none focus:border-blue-500 text-white"
                            placeholder="Path to model file">
                    </div>
                </div>

                <!-- Core Model Parameters -->
                <div class="pt-4 border-t border-border-grey">
                    <h3 class="text-sm font-medium mb-4">Core Model Parameters</h3>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex items-center justify-between">
                            <label class="text-sm">Trust Remote Code</label>
                            <input type="checkbox" id="trustRemoteCode" class="form-checkbox">
                        </div>
                        
                        <div>
                            <label class="block text-sm mb-1">Data Type</label>
                            <select id="dtype" class="w-full p-2 bg-darker-grey border border-border-grey rounded-md text-white">
                                <option value="float16">float16</option>
                                <option value="float32">float32</option>
                                <option value="bfloat16">bfloat16</option>
                            </select>
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="text-sm">Local Files Only</label>
                            <input type="checkbox" id="localFilesOnly" checked class="form-checkbox">
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="text-sm">Use Cache</label>
                            <input type="checkbox" id="useCache" checked class="form-checkbox">
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="text-sm">Return Dict in Generate</label>
                            <input type="checkbox" id="returnDictInGenerate" checked class="form-checkbox">
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="text-sm">Output Attentions</label>
                            <input type="checkbox" id="outputAttentions" class="form-checkbox">
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="text-sm">Output Hidden States</label>
                            <input type="checkbox" id="outputHiddenStates" class="form-checkbox">
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="text-sm">Low CPU Memory Usage</label>
                            <input type="checkbox" id="lowCpuMemUsage" checked class="form-checkbox">
                        </div>
                    </div>
                </div>

                <!-- Generation Parameters -->
                <div class="pt-4 border-t border-border-grey">
                    <h3 class="text-sm font-medium mb-4">Generation Parameters</h3>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm mb-1">Max New Tokens</label>
                            <input type="number" id="maxNewTokens" 
                                class="w-full p-2 bg-darker-grey border border-border-grey rounded-md text-white">
                        </div>

                        <div>
                            <label class="block text-sm mb-1">Temperature</label>
                            <input type="number" id="temperature" step="0.1" min="0" max="2"
                                class="w-full p-2 bg-darker-grey border border-border-grey rounded-md text-white">
                        </div>

                        <div>
                            <label class="block text-sm mb-1">Top P</label>
                            <input type="number" id="topP" step="0.1" min="0" max="1"
                                class="w-full p-2 bg-darker-grey border border-border-grey rounded-md text-white">
                        </div>

                        <div>
                            <label class="block text-sm mb-1">Top K</label>
                            <input type="number" id="topK" min="0"
                                class="w-full p-2 bg-darker-grey border border-border-grey rounded-md text-white">
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="text-sm">Do Sample</label>
                            <input type="checkbox" id="doSample" class="form-checkbox">
                        </div>
                    </div>
                </div>

                <div class="flex justify-end gap-2 mt-6">
                    <button onclick="closeNewConfig()" 
                        class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button onclick="saveNewConfig()" 
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                        Save
                    </button>
                </div>
            </div>
        </div>
    </div>`;
}

export function getLLMConfigModalScripts(): string {
    return `
    function closeNewConfig() {
        document.getElementById('newConfigModal').classList.add('hidden');
        // Reset form
        document.getElementById('newModelName').value = '';
        document.getElementById('newModelPath').value = '';
        document.getElementById('trustRemoteCode').checked = false;
        document.getElementById('dtype').value = 'float16';
        document.getElementById('localFilesOnly').checked = true;
        document.getElementById('useCache').checked = true;
        document.getElementById('returnDictInGenerate').checked = true;
        document.getElementById('outputAttentions').checked = false;
        document.getElementById('outputHiddenStates').checked = false;
        document.getElementById('lowCpuMemUsage').checked = true;
        document.getElementById('maxNewTokens').value = '';
        document.getElementById('temperature').value = '';
        document.getElementById('doSample').checked = false;
        document.getElementById('topP').value = '';
        document.getElementById('topK').value = '';
    }

    async function saveNewConfig() {
        const modelName = document.getElementById('newModelName').value.trim();
        const modelPath = document.getElementById('newModelPath').value.trim();

        if (!modelName || !modelPath) {
            // TODO: Show error message
            return;
        }

        try {
            const config = {
                model_name: modelName,
                model_path: modelPath,
                trust_remote_code: document.getElementById('trustRemoteCode').checked,
                dtype: document.getElementById('dtype').value,
                local_files_only: document.getElementById('localFilesOnly').checked,
                use_cache: document.getElementById('useCache').checked,
                return_dict_in_generate: document.getElementById('returnDictInGenerate').checked,
                output_attentions: document.getElementById('outputAttentions').checked,
                output_hidden_states: document.getElementById('outputHiddenStates').checked,
                low_cpu_mem_usage: document.getElementById('lowCpuMemUsage').checked,
                max_new_tokens: document.getElementById('maxNewTokens').value || null,
                temperature: document.getElementById('temperature').value || null,
                do_sample: document.getElementById('doSample').checked,
                top_p: document.getElementById('topP').value || null,
                top_k: document.getElementById('topK').value || null
            };

            // Save the config
            const response = await fetch('http://localhost:8000/api/llm/configs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                const savedConfig = await response.json();
                
                // Set as current model
                await fetch('http://localhost:8000/api/llm', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(savedConfig)
                });

                vscode.postMessage({ 
                    command: 'updateModelStatus',
                    modelName: savedConfig.model_name 
                });

                closeNewConfig();
                loadConfigurations();
            }
        } catch (error) {
            console.error('Failed to save configuration:', error);
        }
    }

    // Close new config modal when clicking outside
    document.getElementById('newConfigModal').addEventListener('click', (e) => {
        if (e.target.id === 'newConfigModal') {
            closeNewConfig();
        }
    });`;
}
