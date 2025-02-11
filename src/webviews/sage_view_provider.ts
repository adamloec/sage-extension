import * as vscode from 'vscode';
import { ConnectionViewProvider } from './connection_view_provider';
import { StandaloneViewProvider } from './standalone_view_provider';
import { RemoteViewProvider } from './remote_view_provider';
import { MessageManager } from '../utils/message_manager';

export class SageViewProvider implements vscode.WebviewViewProvider {
	private _currentProvider?: vscode.WebviewViewProvider;
	private _connectionProvider: ConnectionViewProvider;
	private _standaloneProvider: StandaloneViewProvider;
	private _remoteProvider: RemoteViewProvider;
	private _view?: vscode.WebviewView;
	private static readonly STATE_KEY = 'sage.viewState';
	private _lastActiveProvider?: string;

	constructor(private readonly context: vscode.ExtensionContext) {
		this._connectionProvider = new ConnectionViewProvider(context);
		this._standaloneProvider = new StandaloneViewProvider(context);
		this._remoteProvider = new RemoteViewProvider(context);

		// Add configuration change listener
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('sage') && this._view) {
				this.updateProvider();
			}
		});

		// Add visibility change listener
		context.subscriptions.push(
			vscode.window.onDidChangeVisibleTextEditors(() => {
				if (this._view?.visible) {
					this.restoreState();
				}
			})
		);
	}

	private async restoreState() {
		if (!this._view || !this._currentProvider) return;

		// Re-resolve the webview to restore the state
		await this._currentProvider.resolveWebviewView(
			this._view,
			{} as vscode.WebviewViewResolveContext,
			{} as vscode.CancellationToken
		);
	}

	private async updateProvider() {
		if (!this._view) return;

		const config = vscode.workspace.getConfiguration('sage');
		const isConfigured = config.get('isConfigured') as boolean;
		const isStandalone = config.get('standalone') as boolean;

		// Store the current provider type before switching
		await this.context.globalState.update(SageViewProvider.STATE_KEY, {
			isConfigured,
			isStandalone
		});

		if (!isConfigured) {
			this._currentProvider = this._connectionProvider;
			this._lastActiveProvider = 'connection';
		} else {
			this._currentProvider = isStandalone ? this._standaloneProvider : this._remoteProvider;
			this._lastActiveProvider = isStandalone ? 'standalone' : 'remote';
		}

		await this._currentProvider.resolveWebviewView(
			this._view!,
			{} as vscode.WebviewViewResolveContext,
			{} as vscode.CancellationToken
		);
	}

	async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		token: vscode.CancellationToken
	) {
		this._view = webviewView;

		// Add visibility change listener for this specific webview
		this._view.onDidChangeVisibility(() => {
			if (this._view?.visible) {
				this.restoreState();
			}
		});

		// Get the stored state or current configuration
		const storedState = this.context.globalState.get(SageViewProvider.STATE_KEY) as any;
		const config = vscode.workspace.getConfiguration('sage');
		
		// Check if this is a fresh install by looking for any stored state or configuration
		const isFreshInstall = !storedState && 
			config.get('currentRemoteBackendUrl') === '' && 
			!config.get('isConfigured');

		// If it's a fresh install, force the connection view
		if (isFreshInstall) {
			this._currentProvider = this._connectionProvider;
			this._lastActiveProvider = 'connection';
			// Ensure configuration reflects initial state
			await vscode.workspace.getConfiguration().update('sage.isConfigured', false, true);
		} else {
			// Use stored or current configuration as before
			const isConfigured = storedState?.isConfigured ?? config.get('isConfigured') as boolean;
			const isStandalone = storedState?.isStandalone ?? config.get('standalone') as boolean;

			if (!isConfigured) {
				this._currentProvider = this._connectionProvider;
				this._lastActiveProvider = 'connection';
			} else {
				this._currentProvider = isStandalone ? this._standaloneProvider : this._remoteProvider;
				this._lastActiveProvider = isStandalone ? 'standalone' : 'remote';
			}
		}

		await this._currentProvider.resolveWebviewView(webviewView, context, token);
	}
}