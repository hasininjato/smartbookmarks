import * as vscode from 'vscode';
import * as path from 'path';
import { BookmarkProvider } from './bookmarkProvider';
import { Bookmark } from '../types';

export class BookmarkTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly bookmark?: Bookmark,
        public readonly filePath?: string
    ) {
        super(label, collapsibleState);

        if (bookmark) {
            // Élément enfant : un Signet précis
            this.description = `Ligne ${bookmark.line}`;
            this.tooltip = `${bookmark.symbolName} - Ligne ${bookmark.line}`;
            this.iconPath = new vscode.ThemeIcon('bookmark');

            // Commande pour sauter directement au signet au clic
            this.command = {
                command: 'vscode.open',
                title: 'Ouvrir le signet',
                arguments: [
                    vscode.Uri.file(bookmark.filePath),
                    {
                        selection: new vscode.Range(
                            bookmark.line - 1, 0,
                            bookmark.line - 1, 0
                        )
                    }
                ]
            };
        } else {
            // Élément parent : un Fichier
            this.iconPath = vscode.ThemeIcon.File;
            this.resourceUri = vscode.Uri.file(filePath || '');
        }
    }
}

export class BookmarkTreeViewProvider implements vscode.TreeDataProvider<BookmarkTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkTreeItem | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private provider: BookmarkProvider) {
        // Rafraîchir la vue dès qu'un signet est ajouté, modifié ou supprimé
        this.provider.onDidChangeBookmarks(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BookmarkTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BookmarkTreeItem): Promise<BookmarkTreeItem[]> {
        const allBookmarks = this.provider.getBookmarks();

        if (allBookmarks.length === 0) {
            return [];
        }

        // 1. Racine de l'arbre : Grouper les signets par Fichier
        if (!element) {
            const filePaths = Array.from(new Set(allBookmarks.map(b => b.filePath)));

            return filePaths.map(filePath => {
                const count = allBookmarks.filter(b => b.filePath === filePath).length;
                const fileName = path.basename(filePath);

                const item = new BookmarkTreeItem(
                    fileName,
                    vscode.TreeItemCollapsibleState.Expanded,
                    undefined,
                    filePath
                );
                item.description = `(${count})`;
                return item;
            });
        }

        // 2. Enfants : Signets appartenant au fichier sélectionné
        if (element.filePath) {
            const fileBookmarks = allBookmarks
                .filter(b => b.filePath === element.filePath)
                .sort((a, b) => a.line - b.line);

            return fileBookmarks.map(b =>
                new BookmarkTreeItem(
                    b.symbolName,
                    vscode.TreeItemCollapsibleState.None,
                    b
                )
            );
        }

        return [];
    }
}