import { Ollama } from 'ollama';

import { ChatMessageCode, ChatMessage, ChatSession } from './types';
import { exec } from 'child_process';

export class OllamaManager {
    private _ollama: Ollama;
    public model: string | null;

    constructor(defaultModel?: string) {
        this._ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
        this.model = defaultModel || null;
        if (this.model) {
            this.loadModel(this.model);
        }
    }

    async checkInstallation(): Promise<boolean> {
        try {
            await new Promise<void>((resolve, reject) => {
                exec('ollama --version', (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    async loadModel(model: string) {
        await this.unloadModel();
        const models = await this.getModels();
        if (!models.includes(model)) {
            throw new Error(`Model ${model} not found`);
        }
        console.log(`Loading model: ${model}`);
        this.model = model;
    }

    async unloadModel() {
        // If no model is loaded, just return
        if (!this.model) {
            return;
        }

        try {
            await new Promise((resolve, reject) => {
                exec(`ollama stop ${this.model}`, (error: any) => {
                    if (error) reject(error);
                    else resolve(null);
                });
            });
        } catch (error) {
            // If unload fails, we can safely ignore the error
            // The model might already be unloaded or not running
            console.log(`Note: Failed to unload model ${this.model}, continuing anyway`);
        }
    }

    async getModels(): Promise<string[]> {
        const response = await this._ollama.list();
        return response.models.map(model => model.name);
    }

    async *generateResponseStream(message: ChatMessage, session: ChatSession) {
        if (!this.model) {
            console.error('No model selected');
            throw new Error('No model selected');
        }

        try {
            console.log(`Starting chat stream with model: ${this.model}`);
            
            const messages = [
                {
                    role: 'system',
                    content: `You are Sage, an intelligent and helpful coding assistant. Your responses should be:
                        - Clear and concise
                        - Well-structured using markdown
                        - Code-focused, using proper syntax highlighting
                        - If asked for or providing an explanation, use markdown, and make it as concise as possible.
                        - If providing example usage, create a separate code block for each example.`
                },
                ...session.messages.map(msg => {
                    let content = msg.content;

                    // Add code blocks if presentLL
                    if (msg.code && msg.code.length > 0) {
                        content += '\n\nCode:\n' + msg.code.map(codeBlock => {
                            let codeHeader = codeBlock.filename ? 
                                `File: ${codeBlock.filename}` : 
                                `${codeBlock.language} snippet`;
                            
                            if (codeBlock.start_line && codeBlock.end_line) {
                                codeHeader += ` (lines ${codeBlock.start_line}-${codeBlock.end_line})`;
                            }

                            return `${codeHeader}\n\`\`\`${codeBlock.language}\n${codeBlock.code}\n\`\`\``;
                        }).join('\n\n');
                    }

                    return {
                        role: msg.role,
                        content: content
                    };
                })
            ];

            const response = await this._ollama.chat({
                model: this.model,
                messages,
                stream: true,
                options: {
                    num_ctx: 32768,
                    temperature: 0.7
                }
            });

            for await (const part of response) {
                if (part.message?.content) {
                    yield part.message.content;
                }
            }
        } catch (error: any) {
            console.error('Error in generateResponseStream:', error);
            throw new Error(`Failed to generate response: ${error.message}`);
        }
    }
}
