import * as vscode from 'vscode';
import axios from 'axios';
import { loadServerProfiles } from './server_profiles';

export async function fetchChatSessions(context: vscode.ExtensionContext, backendUrl: string) {
  try {
    const serverProfiles = await loadServerProfiles(context);
    const profile = serverProfiles[backendUrl];
    if (!profile || !profile.userId) {
      vscode.window.showErrorMessage("User ID not configured. Please update your connection settings.");
      return null;
    }
    const response = await axios.get(`${backendUrl}/api/chat/sessions`, {
      headers: { 'x-user-id': profile.userId }
    });
    return response.data; // List of session summaries.
  } catch (error: any) {
    vscode.window.showErrorMessage(`Unable to fetch chat sessions: ${error.message}`);
    return null;
  }
} 