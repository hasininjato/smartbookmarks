import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class ClearFileBookmarksCommand {
    public readonly commandId = 'smartbookmarks.clearFileBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(vscode.l10n.t('No active editor found.'));
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const fileBookmarks = this.provider.getForFile(filePath);

        if (fileBookmarks.length === 0) {
            vscode.window.showInformationMessage(vscode.l10n.t('No bookmarks to clear in this file.'));
            return;
        }

        const clearLabel = vscode.l10n.t('Clear');
        const confirmMessage = fileBookmarks.length > 1
            ? vscode.l10n.t('Clear {0} bookmarks in active file?', fileBookmarks.length)
            : vscode.l10n.t('Clear {0} bookmark in active file?', fileBookmarks.length);

        const answer = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            clearLabel
        );

        if (answer === clearLabel) {
            this.provider.clearForFile(filePath);
            vscode.window.showInformationMessage(vscode.l10n.t('Bookmarks in active file cleared.'));
        }
    }
}