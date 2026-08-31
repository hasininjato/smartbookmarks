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
            // C'est un signet -> on lui donne le tag 'bookmarkItem'
            this.contextValue = 'bookmarkItem';

            const author = bookmark.author || 'Unknown';
            const dateStr = bookmark.createdDateFormatted
                || (bookmark.createdAt ? new Date(bookmark.createdAt).toLocaleString('fr-FR') : 'Unknown date');

            this.description = `Line ${bookmark.line}`;

            // --- INFOBULLE ENRICHIE AU HOVER ---
            const tooltipMarkdown = new vscode.MarkdownString();
            tooltipMarkdown.appendMarkdown(`**📍 ${bookmark.symbolName}**\n\n`);
            tooltipMarkdown.appendMarkdown(`- **Created by :** ${author}\n`);
            tooltipMarkdown.appendMarkdown(`- **Date of creation :** ${dateStr}`);

            this.tooltip = tooltipMarkdown;
            this.iconPath = new vscode.ThemeIcon('bookmark');

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
            // C'est un fichier parent -> on lui donne le tag 'fileItem'
            this.contextValue = 'fileItem';
            this.iconPath = vscode.ThemeIcon.File;
            this.resourceUri = vscode.Uri.file(filePath || '');
        }
    }
}

export class BookmarkTreeViewProvider implements vscode.TreeDataProvider<BookmarkTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkTreeItem | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private provider: BookmarkProvider) {
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