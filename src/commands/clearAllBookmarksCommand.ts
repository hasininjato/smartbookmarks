import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class ClearAllBookmarksCommand {
    public readonly commandId = 'smartbookmarks.clearAllBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const bookmarks = this.provider.getBookmarks();
        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage(vscode.l10n.t('No bookmarks to clear.'));
            return;
        }

        const clearLabel = vscode.l10n.t('Clear');
        const confirmMessage = bookmarks.length > 1
            ? vscode.l10n.t('Are you sure you want to clear all {0} bookmarks?', bookmarks.length)
            : vscode.l10n.t('Are you sure you want to clear this bookmark?');

        const answer = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            clearLabel
        );

        if (answer === clearLabel) {
            this.provider.clear();
            vscode.window.showInformationMessage(vscode.l10n.t('All bookmarks cleared.'));
        }
    }
}