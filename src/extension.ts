import * as vscode from 'vscode';
import axios from 'axios';
const { BackendInstaller } = require('./installation');
const { SagePanel } = require('./panel/panel');
const { StandalonePanel } = require('./panel/standalone_panel');
const { ConnectionPanel } = require('./panel/connection_panel');

// Configuration type for better type safety
interface SageConfig {
    currentRemoteBackendUrl: string;
    standalone: boolean;
    isConfigured: boolean; // New setting to track if user has made initial choice
}


async function getConfiguration(): Promise<SageConfig> {
    const config = vscode.workspace.getConfiguration('sage');
    return {
        currentRemoteBackendUrl: config.get('currentRemoteBackendUrl') as string,
        standalone: config.get('standalone') as boolean,
        isConfigured: config.get('isConfigured') as boolean
    };

}

async function updateConfiguration(updates: Partial<SageConfig>): Promise<void> {
    const config = vscode.workspace.getConfiguration('sage');
    for (const [key, value] of Object.entries(updates)) {
        await config.update(key, value, true);
    }
}

async function checkRemoteBackendConnection(remoteBackendUrl: string): Promise<boolean> {
    try {
        const response = await axios.get(`${remoteBackendUrl}/health`);
        return response.status === 200;

    } catch (error) {
        return false;
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    // Open panel command - now always checks configuration first
    const openPanelCommand = vscode.commands.registerCommand('sage.openPanel', async () => {
        const config = await getConfiguration();
        
        // If not configured, show connection panel first
        if (!config.isConfigured) {
            await vscode.commands.executeCommand('sage.openConnectionPanel');
            return;
        }

        // Verify connection based on mode
        let canConnect = false;
        if (config.standalone) {
            const installer = new BackendInstaller(context);
            canConnect = await installer.isInstalled();
        } else {
            canConnect = await checkRemoteBackendConnection(config.currentRemoteBackendUrl);
        }

        if (canConnect) {
            if (config.standalone) {
                StandalonePanel.createOrShow(context);
            } else {
                SagePanel.createOrShow(context);
            }
        } else {
            vscode.window.showErrorMessage(
                'Cannot connect to backend. Please check your connection settings.',
                'Configure Backend'
            ).then(selection => {
                if (selection === 'Configure Backend') {
                    vscode.commands.executeCommand('sage.openConnectionPanel');
                }
            });
        }
    });

    // Open connection panel command
    const openConnectionPanelCommand = vscode.commands.registerCommand(
        'sage.openConnectionPanel', 
        () => ConnectionPanel.createOrShow(context)
    );

    context.subscriptions.push(openPanelCommand, openConnectionPanelCommand);
}

async function activate(context: vscode.ExtensionContext) {
    console.log('Sage extension activating...');
    
    // Register commands first
    registerCommands(context);
    
    // Read the configuration setting to decide whether to prompt on activation.
    const promptForBackendOnActivation = vscode.workspace
        .getConfiguration('sage')
        .get<boolean>('promptForBackendOnActivation', false);

    const installer = new BackendInstaller(context);
    const isBackendInstalled = await installer.isInstalled();

    // If no backend exists or if the user has asked to always be prompted, display our prompt.
    if (!isBackendInstalled || promptForBackendOnActivation) {
        let message: string;
        let primaryAction: string;
        if (isBackendInstalled) {
            message = 'Sage backend is already installed. Would you like to reinstall it?';
            primaryAction = 'Reinstall Backend';
        } else {
            message = 'Would you like to install the Sage backend?';
            primaryAction = 'Install Backend';
        }
        const installChoice = await vscode.window.showInformationMessage(message, primaryAction, 'Skip');
        if (installChoice === primaryAction) {
            const success = await installer.install();
            if (success) {
                await updateConfiguration({
                    standalone: true,
                    isConfigured: true
                });
            }
        }
    }
}

export function deactivate(context: vscode.ExtensionContext) {
    
    const { deactivate } = require('./installation');
    return deactivate(context);
}

module.exports = {
    activate,
    deactivate
};