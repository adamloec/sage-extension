import * as vscode from 'vscode';
import * as path from 'path';

export abstract class BaseViewProvider implements vscode.WebviewViewProvider {
    protected _view?: vscode.WebviewView;

    constructor(protected readonly context: vscode.ExtensionContext) {}

    abstract resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Promise<void>;

    protected getWebviewOptions(): vscode.WebviewOptions {
        return {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'media'))
            ]
        };
    }
} 