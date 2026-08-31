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

        // 1. Chercher d'abord les signets du fichier actif
        let bookmarks = activeEditor
            ? this.provider.getForFile(activeEditor.document.uri.fsPath)
            : [];

        // 2. Si le fichier actif n'a pas de signet (ou pas d'éditeur), charger TOUS les signets
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

        // Transformer les signets en éléments de liste avec bouton corbeille
        quickPick.items = sortedBookmarks.map(b => ({
            label: `📍 ${b.symbolName}`,
            description: `line ${b.line}`,
            detail: b.filePath,
            bookmark: b,
            buttons: [
                {
                    iconPath: new vscode.ThemeIcon('trash'),
                    tooltip: 'Supprimer ce signet'
                }
            ]
        }));

        // 4. Clic sur la corbeille
        quickPick.onDidTriggerItemButton(async (e) => {
            const item = e.item;
            this.provider.delete(item.bookmark.id);

            // Met à jour la liste en direct sans fermer le menu
            quickPick.items = quickPick.items.filter(i => i.bookmark.id !== item.bookmark.id);

            // Si plus aucun signet dans la liste, on ferme le QuickPick
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