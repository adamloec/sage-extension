import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export async function getServerProfilesFilePath(context: vscode.ExtensionContext): Promise<string> {
    await fs.promises.mkdir(context.globalStorageUri.fsPath, { recursive: true });
    return path.join(context.globalStorageUri.fsPath, 'serverProfiles.json');
}

export async function loadServerProfiles(context: vscode.ExtensionContext): Promise<{ [url: string]: { userId: string } }> {
    const filePath = await getServerProfilesFilePath(context);
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {}; // default to empty object if file doesn't exist
    }
}

export async function saveServerProfiles(context: vscode.ExtensionContext, profiles: any): Promise<void> {
    const filePath = await getServerProfilesFilePath(context);
    await fs.promises.writeFile(filePath, JSON.stringify(profiles, null, 2), 'utf8');
} 