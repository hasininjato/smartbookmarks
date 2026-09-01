import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { Bookmark } from '../types';

interface BookmarkQuickPickItem extends vscode.QuickPickItem {
    bookmark: Bookmark;
}

export class ListBookmarksCommand {
    public readonly commandId = 'smartbookmarks.listBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;

        // 1. Chercher les signets du fichier actif
        let bookmarks = activeEditor
            ? this.provider.getForFile(activeEditor.document.uri.fsPath)
            : [];

        // 2. Fallback sur TOUS les signets si vide
        if (bookmarks.length === 0) {
            bookmarks = this.provider.getBookmarks();
        }

        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage('No bookmarks found');
            return;
        }

        // Trier les signets par ligne
        const sortedBookmarks = [...bookmarks].sort((a, b) => a.line - b.line);

        // 3. Créer le QuickPick
        const quickPick = vscode.window.createQuickPick<BookmarkQuickPickItem>();
        quickPick.placeholder = 'Select a bookmark to navigate';

        // Transformer les signets en éléments de liste
        quickPick.items = sortedBookmarks.map(b => {
            const author = b.author || 'Unknown';
            const dateStr = b.createdDateFormatted
                || (b.createdAt ? new Date(b.createdAt).toLocaleString('fr-FR') : 'Unknown date');

            const hasRange = b.highlightRange && b.highlightRange.startLine !== b.highlightRange.endLine;
            const lineStr = hasRange
                ? `Lines ${b.highlightRange!.startLine + 1} → ${b.highlightRange!.endLine + 1}`
                : `Line ${b.line}`;

            // Formatage avec Tag, Titre et Note
            const tagStr = b.tag ? `[${b.tag}] ` : '';
            const titleStr = b.title ? `${b.title} (${b.symbolName})` : b.symbolName;
            const commentStr = b.comment ? ` — 💬 "${b.comment}"` : '';

            return {
                label: `${hasRange ? '📑' : '📍'} ${tagStr}${titleStr}${commentStr}`,
                description: `${lineStr} • by ${author}`,
                detail: `📅 ${dateStr} — 📁 ${b.filePath}`,
                bookmark: b,
                buttons: [
                    {
                        iconPath: new vscode.ThemeIcon('trash'),
                        tooltip: 'Delete this bookmark'
                    }
                ]
            };
        });

        // 4. Clic sur la corbeille
        quickPick.onDidTriggerItemButton(async (e) => {
            const item = e.item;
            this.provider.delete(item.bookmark.id);

            quickPick.items = quickPick.items.filter(i => i.bookmark.id !== item.bookmark.id);

            if (quickPick.items.length === 0) {
                quickPick.hide();
            }
        });

        // 5. Clic sur la ligne (navigation)
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            if (selected) {
                await this.navigateToBookmark(selected.bookmark);
            }
            quickPick.hide();
        });

        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    }

    async navigateToBookmark(bookmark: Bookmark): Promise<void> {
        const uri = vscode.Uri.file(bookmark.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        const lineIndex = Math.max(0, bookmark.line - 1);
        const position = new vscode.Position(lineIndex, 0);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    }
}