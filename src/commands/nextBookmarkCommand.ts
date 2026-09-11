import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class NextBookmarkCommand {
    public readonly commandId = 'smartbookmarks.nextBookmark';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(vscode.l10n.t('No active editor'));
            return;
        }

        const position = editor.selection.active;
        const filePath = editor.document.uri.fsPath;
        const bookmark = this.provider.getNext(position, filePath);

        if (!bookmark) {
            vscode.window.showInformationMessage(vscode.l10n.t('No bookmarks in this file'));
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