import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class NavigateBookmarkCommand {
    public readonly commandId = 'smartbookmarks.navigateBookmark';

    constructor(
        private provider: BookmarkProvider,
        private direction: 'next' | 'prev'
    ) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const position = editor.selection.active;
        const filePath = editor.document.uri.fsPath;

        const bookmark = this.direction === 'next'
            ? this.provider.getNext(position, filePath)
            : this.provider.getPrevious(position, filePath);

        if (!bookmark) {
            vscode.window.showInformationMessage('No bookmarks in this file');
            return;
        }

        const range = new vscode.Range(
            bookmark.range.start.line,
            0,
            bookmark.range.start.line,
            0
        );

        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
}