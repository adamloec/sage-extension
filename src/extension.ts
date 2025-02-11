import * as vscode from 'vscode';
const { BackendInstaller } = require('./installation');
import { SageViewProvider } from './webviews/sage_view_provider';

// Configuration type for better type safety
interface SageConfig {
    currentRemoteBackendUrl: string;
    standalone: boolean;
    isConfigured: boolean;
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

async function activate(context: vscode.ExtensionContext) {
    console.log('Sage extension activating...');
    
    // Register the webview provider
    const provider = new SageViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('sageView', provider)
    );

    // Register the switchView command
    context.subscriptions.push(
        vscode.commands.registerCommand('sage.switchView', async () => {
            // Force the webview to reload by hiding and showing it
            await vscode.commands.executeCommand('workbench.view.extension.sageSidebar');
        })
    );

    // Check for backend installation on activation
    const promptForBackendOnActivation = vscode.workspace
        .getConfiguration('sage')
        .get<boolean>('promptForBackendOnActivation', false);

    const installer = new BackendInstaller(context);
    const isBackendInstalled = await installer.isInstalled();

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
        
        const installChoice = await vscode.window.showInformationMessage(
            message, 
            primaryAction, 
            'Skip'
        );
        
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

    console.log('Sage extension activated');
}

export function deactivate(context: vscode.ExtensionContext) {
    const { deactivate } = require('./installation');
    return deactivate(context);
}

module.exports = {
    activate,
    deactivate
};