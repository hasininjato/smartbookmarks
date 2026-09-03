import * as vscode from 'vscode';
import * as path from 'path';
import { BookmarkProvider } from './bookmarkProvider';
import { Bookmark, BookmarkTagConfig } from '../types';

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
            const tagStr = bookmark.tag ? `${bookmark.tag.toUpperCase()} ` : '';
            const titleStr = bookmark.title ? bookmark.title : bookmark.symbolName;

            // Première ligne du commentaire pour l'affichage concis
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

            // Récupération de la configuration du tag s'il existe
            const config = vscode.workspace.getConfiguration('smartbookmarks');
            const userTags = config.get<BookmarkTagConfig[]>('tags') || [];
            const tagConfig = bookmark.tag
                ? userTags.find(t => t.label.toUpperCase() === bookmark.tag!.toUpperCase())
                : undefined;

            const rawIcon = tagConfig?.icon || 'bookmark';
            const cleanIconName = rawIcon.replace(/^\$\((.*?)\).*/, '$1');

            // --- Construction du Tooltip (Hover) ---
            const tooltipMarkdown = new vscode.MarkdownString();
            tooltipMarkdown.isTrusted = true;
            tooltipMarkdown.supportHtml = true;
            tooltipMarkdown.supportThemeIcons = true;

            // Ligne 1 : Si un tag existe, on l'affiche avec son icône. Sinon, SEULEMENT le nom du symbole.
            let htmlContent = '';
            if (bookmark.tag && bookmark.tag.trim().length > 0) {
                htmlContent = `$(${cleanIconName}) **${bookmark.tag.toUpperCase()}** — *${bookmark.symbolName}*\n\n`;
            } else {
                htmlContent = `*${bookmark.symbolName}*\n\n`;
            }

            // Séparateur 1
            htmlContent += `---\n\n`;

            // Section 2 : Titre et Commentaire
            let hasContentSection = false;
            if (bookmark.title) {
                htmlContent += `**${bookmark.title}**\n\n`;
                hasContentSection = true;
            }

            if (bookmark.comment) {
                const formattedComment = bookmark.comment.replace(/\n/g, '<br/>');
                htmlContent += `💬 <i>"${formattedComment}"</i>\n\n`;
                hasContentSection = true;
            }

            // Séparateur 2 (seulement si titre ou commentaire présent)
            if (hasContentSection) {
                htmlContent += `---\n\n`;
            }

            // Section 3 : Auteur, Date et Lignes
            htmlContent += `👤 **Auteur :** ${author} &nbsp;|&nbsp; 📅 **Date :** ${dateStr}\n\n`;

            if (hasRange) {
                htmlContent += `📏 **Lignes :** ${bookmark.highlightRange!.startLine + 1} à ${bookmark.highlightRange!.endLine + 1}`;
            } else {
                htmlContent += `📍 **Ligne :** ${bookmark.line}`;
            }

            tooltipMarkdown.appendMarkdown(htmlContent);
            this.tooltip = tooltipMarkdown;

            // Définition de l'icône affichée dans l'arbre
            this.iconPath = new vscode.ThemeIcon(cleanIconName);

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
                        preserveFocus: true,
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