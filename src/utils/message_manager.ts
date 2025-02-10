import * as vscode from 'vscode';

export class MessageManager {
    private static readonly MESSAGE_TIMEOUT = 5000; // 5 seconds

    static showInfo(message: string) {
        const notification = vscode.window.showInformationMessage("Sage: " + message);
        // Auto-dismiss after timeout
        setTimeout(() => {
            notification.then(value => {
                if (value) {
                    // @ts-ignore - Private API but works for dismissing
                    value.dispose();
                }
            });
        }, this.MESSAGE_TIMEOUT);
    }

    static showError(message: string) {
        const notification = vscode.window.showErrorMessage("Sage: " + message);
        // Auto-dismiss after timeout
        setTimeout(() => {
            notification.then(value => {
                if (value) {
                    // @ts-ignore - Private API but works for dismissing
                    value.dispose();
                }
            });
        }, this.MESSAGE_TIMEOUT);
    }

    static showWarning(message: string) {
        const notification = vscode.window.showWarningMessage("Sage: " + message);
        // Auto-dismiss after timeout
        setTimeout(() => {
            notification.then(value => {
                if (value) {
                    // @ts-ignore - Private API but works for dismissing
                    value.dispose();
                }
            });
        }, this.MESSAGE_TIMEOUT);
    }
} 