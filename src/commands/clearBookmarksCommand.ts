import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class ClearBookmarksCommand {
    public readonly commandId = 'smartbookmarks.clearBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const bookmarks = this.provider.getBookmarks();
        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage('No bookmarks to clear');
            return;
        }

        const answer = await vscode.window.showWarningMessage(
            `Clear all ${bookmarks.length} bookmarks?`,
            { modal: true },
            'Clear'
        );

        if (answer === 'Clear') {
            this.provider.clear();
            vscode.window.showInformationMessage('All bookmarks cleared');
        }
    }
}