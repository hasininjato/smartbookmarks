import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class ClearFileBookmarksCommand {
    public readonly commandId = 'smartbookmarks.clearFileBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const fileBookmarks = this.provider.getForFile(filePath);

        if (fileBookmarks.length === 0) {
            vscode.window.showInformationMessage('No bookmarks to clear in this file');
            return;
        }

        const answer = await vscode.window.showWarningMessage(
            `Clear ${fileBookmarks.length} bookmark(s) in active file?`,
            { modal: true },
            'Clear'
        );

        if (answer === 'Clear') {
            this.provider.clearForFile(filePath);
            vscode.window.showInformationMessage('Bookmarks in active file cleared');
        }
    }
}