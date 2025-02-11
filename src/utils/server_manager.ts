import * as vscode from 'vscode';
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { platform } = require('os');
const path = require('path');
const axios = require('axios');

export class ServerManager {
    private _context: vscode.ExtensionContext;
    private _process: any;
    private _isStarting: boolean;
    private _envName: string;
    private _port: number;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._process = null;
        this._isStarting = false;
        this._envName = 'sage_vscode_env';
        this._port = 8000;
    }

    async startServer() {
        if (this._process) {
            console.log('Server already running');
            return;
        }

        console.log('=== Starting server ===');
        
        const command = await this._getStartCommand();
        console.log('Command:', command);

        this._process = spawn(command.command, command.args, {
            shell: true,
            env: { 
                ...process.env, 
                PYTHONUNBUFFERED: '1',
                PYTHONFAULTHANDLER: '1'
            }
        });

        console.log('Process spawned with PID:', this._process.pid);

        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.log('=== Server startup timed out ===');
                console.log('Last known process state:', this._process ? 'alive' : 'null');
                reject(new Error('Server startup timed out'));
            }, 30000);

            let errorOutput = '';
            let startupComplete = false;

            this._process.stdout.on('data', (data: Buffer) => {
                const output = data.toString();
                console.log('Server stdout:', output);
                
                // Check for startup success message
                if (output.includes('Application startup complete')) {
                    console.log('=== Server startup complete ===');
                    clearTimeout(timeout);
                    startupComplete = true;
                    resolve();
                }
            });

            this._process.stderr.on('data', (data: any) => {
                const error = data.toString();
                errorOutput += error;
                console.log('Server stderr:', error);
                
                // Uvicorn logs its startup messages to stderr
                if (error.includes('Application startup complete')) {
                    console.log('=== Server startup complete ===');
                    clearTimeout(timeout);
                    startupComplete = true;
                    resolve();
                }
            });

            this._process.on('error', (error: any) => {
                console.log('=== Server process error ===');
                console.log('Error:', error.message);
                clearTimeout(timeout);
                this._process = null;
                reject(error);
            });

            this._process.on('exit', (code: number, signal: string) => {
                console.log('=== Server process exit ===');
                console.log('Exit code:', code);
                console.log('Exit signal:', signal);
                console.log('Collected error output:', errorOutput);
                clearTimeout(timeout);
                this._process = null;
                
                if (!startupComplete) {
                    reject(new Error(`Server exited during startup with code ${code}. Error: ${errorOutput}`));
                } else if (code !== 0 && code !== null) {
                    reject(new Error(`Server exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
    }

    async stopServer() {
        if (!this._process) {
            console.log('No server process to stop');
            return;
        }

        console.log('=== Stopping server ===');
        
        const process = this._process;
        this._process = null;

        try {
            // First try graceful shutdown via API endpoint
            try {
                await axios.post('http://localhost:' + this._port + '/api/shutdown', {
                    timeout: 5000 // Add timeout to prevent hanging
                });
                console.log('Graceful shutdown initiated');
            } catch (error) {
                console.log('Graceful shutdown failed, falling back to process termination');
                if (process.platform === 'win32') {
                    // On Windows, terminate the entire process tree
                    try {
                        await execAsync(`taskkill /F /T /PID ${process.pid}`);
                    } catch (error) {
                        console.log('Initial taskkill failed:', error);
                    }
                } else {
                    // On Unix systems, send SIGTERM first
                    process.kill('SIGTERM');
                }
            }

            // Wait for process to exit
            await new Promise<void>((resolve) => {
                const cleanup = () => {
                    console.log('Process exited successfully');
                    resolve();
                };

                process.once('exit', cleanup);

                // Force kill after timeout
                setTimeout(async () => {
                    process.removeListener('exit', cleanup);
                    console.log('Process kill timed out, forcing termination');
                    
                    if (process.platform === 'win32') {
                        try {
                            // Force kill any remaining processes
                            await execAsync(`taskkill /F /T /PID ${process.pid}`);
                            // Additional cleanup for Windows to handle lingering connections
                            await execAsync(`netstat -ano | findstr :${this._port} | findstr LISTENING`).then(
                                async ({stdout}: {stdout: string}) => {
                                    if (stdout.trim()) {
                                        const pid = stdout.trim().split(/\s+/).pop();
                                        if (pid) {
                                            await execAsync(`taskkill /F /PID ${pid}`);
                                        }
                                    }
                                }
                            ).catch(() => {
                                // Ignore errors if no process is found
                            });
                        } catch (error) {
                            console.log('Force kill failed:', error);
                        }
                    } else {
                        try {
                            process.kill('SIGKILL');
                            // Additional cleanup for Unix systems
                            await execAsync(`lsof -ti:${this._port} | xargs kill -9`).catch(() => {
                                // Ignore errors if no process is found
                            });
                        } catch (error) {
                            console.log('Force kill failed:', error);
                        }
                    }
                    resolve();
                }, 5000);
            });

            // Additional wait to allow OS to clean up sockets
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.log('Error during server shutdown:', error);
        }

        console.log('Server stopped');
    }

    async _getStartCommand() {
        try {
            const envPath = path.join(this._context.globalStorageUri.fsPath, this._envName);
            const sagePath = process.platform === 'win32' ?
                path.join(envPath, 'Scripts', 'sage.exe') :
                path.join(envPath, 'bin', 'sage');

            return {
                command: sagePath,
                args: ['serve', '--port', this._port.toString(), '--mode', 'standalone'],
                useShell: true
            };
        } catch (error) {
            console.log('=== Command error ===');
            console.log(error);
            throw error;
        }
    }

    isRunning() {
        return this._process !== null;
    }
}