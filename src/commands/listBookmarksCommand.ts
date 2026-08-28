import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';

export class ListBookmarksCommand {
    public readonly commandId = 'smartbookmarks.listBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;

        // 1. Chercher d'abord les signets du fichier actif
        let bookmarks = activeEditor
            ? this.provider.getForFile(activeEditor.document.uri.fsPath)
            : [];

        // 2. Si le fichier actif n'a pas de signet (ou pas d'éditeur ouvert), charger TOUS les signets
        if (bookmarks.length === 0) {
            bookmarks = this.provider.getBookmarks();
        }

        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage('No bookmarks found');
            return;
        }

        // Trier les signets par ligne
        const sortedBookmarks = [...bookmarks].sort((a, b) => a.line - b.line);

        // 3. Préparer les éléments pour le QuickPick
        const items = sortedBookmarks.map(b => ({
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

        // Utiliser bookmark.line (-1 pour l'index 0-based de VS Code)
        const lineIndex = Math.max(0, bookmark.line - 1);
        const position = new vscode.Position(lineIndex, 0);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    }
}