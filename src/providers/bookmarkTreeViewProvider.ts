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
            this.contextValue = 'bookmarkItem';

            // Construction du libellé dans la vue arborescente
            const tagStr = bookmark.tag ? `[${bookmark.tag}] ` : '';
            const titleStr = bookmark.title ? bookmark.title : bookmark.symbolName;

            // Si la note comporte plusieurs lignes, on n'affiche que la première dans l'arbre
            const firstLineComment = bookmark.comment ? bookmark.comment.split('\n')[0] : '';
            const noteStr = firstLineComment ? ` — 💬 "${firstLineComment}..."` : '';

            this.label = `${tagStr}${titleStr}${noteStr}`;

            const author = bookmark.author || 'Unknown';
            const dateStr = bookmark.createdDateFormatted
                || (bookmark.createdAt ? new Date(bookmark.createdAt).toLocaleString('fr-FR') : 'Unknown date');

            const hasRange = bookmark.highlightRange && bookmark.highlightRange.startLine !== bookmark.highlightRange.endLine;

            this.description = hasRange
                ? `Lines ${bookmark.highlightRange!.startLine + 1} → ${bookmark.highlightRange!.endLine + 1}`
                : `Line ${bookmark.line}`;

            // Construction du survol (Hover) avec centrage HTML et gestion multi-lignes
            const tooltipMarkdown = new vscode.MarkdownString();
            tooltipMarkdown.isTrusted = true;
            tooltipMarkdown.supportHtml = true;

            let htmlContent = `<div align="center">\n\n`;

            if (bookmark.tag) {
                htmlContent += `### ${bookmark.tag}\n`;
            }
            if (bookmark.title) {
                htmlContent += `**${bookmark.title}**\n\n`;
            }

            htmlContent += `📍 *${bookmark.symbolName}*\n\n`;

            if (bookmark.comment) {
                // Conversion des retour à la ligne pour l'affichage HTML dans le tooltip
                const formattedComment = bookmark.comment.replace(/\n/g, '<br/>');
                htmlContent += `💬 <i>"${formattedComment}"</i><br/><br/>`;
            }

            htmlContent += `---\n\n`;
            htmlContent += `👤 **Auteur :** ${author} &nbsp;|&nbsp; 📅 **Date :** ${dateStr}\n\n`;

            if (hasRange) {
                htmlContent += `📏 **Lignes :** ${bookmark.highlightRange!.startLine + 1} à ${bookmark.highlightRange!.endLine + 1}\n`;
            } else {
                htmlContent += `📍 **Ligne :** ${bookmark.line}\n`;
            }

            htmlContent += `\n</div>`;

            tooltipMarkdown.appendMarkdown(htmlContent);
            this.tooltip = tooltipMarkdown;
            this.iconPath = new vscode.ThemeIcon(hasRange ? 'selection' : 'bookmark');

            this.command = {
                command: 'vscode.open',
                title: 'Ouvrir le signet',
                arguments: [
                    vscode.Uri.file(bookmark.filePath),
                    {
                        selection: new vscode.Range(
                            bookmark.line - 1, 0,
                            bookmark.line - 1, 0
                        ),
                        preserveFocus: false,
                        preview: false,
                        viewColumn: vscode.ViewColumn.Active
                    }
                ]
            };
        } else {
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