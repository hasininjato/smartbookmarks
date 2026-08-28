import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class ListBookmarksCommand {
    public readonly commandId = 'smartbookmarks.listBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const bookmarks = this.provider.getBookmarks();

        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage('No bookmarks');
            return;
        }

        const items = bookmarks.map(b => ({
            label: `📍 ${b.symbolName}`,
            description: `line ${b.line}`,
            detail: b.filePath,
            bookmark: b
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a bookmark to navigate'
        });

        if (selected) {
            await this.navigateToBookmark(selected.bookmark);
        }
    }

    async navigateToBookmark(bookmark: any): Promise<void> {
        const uri = vscode.Uri.file(bookmark.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        const position = new vscode.Position(
            bookmark.range.start.line,
            0
        );

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    }
}