import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BookmarkProvider } from './bookmarkProvider';
import { Bookmark, BookmarkTagConfig } from '../types';

export class BookmarkTreeItem extends vscode.TreeItem {
    private static readonly BRAND_BLUE = '#2196F3';
    private iconUriCache: Map<string, vscode.Uri> = new Map();

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly bookmark?: Bookmark,
        public readonly filePath?: string,
        private readonly extensionUri?: vscode.Uri
    ) {
        super(label, collapsibleState);

        if (bookmark) {
            this.contextValue = 'bookmarkItem';

            const tagStr = bookmark.tag ? `${bookmark.tag.toUpperCase()} ` : '';
            const titleStr = bookmark.title ? bookmark.title : bookmark.symbolName;
            const firstLineComment = bookmark.comment ? bookmark.comment.split('\n')[0] : '';
            const noteStr = firstLineComment ? ` — 💬 "${firstLineComment}..."` : '';

            this.label = `${tagStr}${titleStr}${noteStr}`;

            const author = bookmark.author || vscode.l10n.t('Unknown');
            const dateStr = bookmark.createdDateFormatted
                || (bookmark.createdAt ? new Date(bookmark.createdAt).toLocaleString(vscode.env.language) : vscode.l10n.t('Unknown date'));

            const hasRange = bookmark.highlightRange && bookmark.highlightRange.startLine !== bookmark.highlightRange.endLine;

            this.description = hasRange
                ? vscode.l10n.t('Lines {0} → {1}', bookmark.highlightRange!.startLine + 1, bookmark.highlightRange!.endLine + 1)
                : vscode.l10n.t('Line {0}', bookmark.line);

            const config = vscode.workspace.getConfiguration('smartbookmarks');
            const userTags = config.get<BookmarkTagConfig[]>('tags') || [];
            const tagConfig = bookmark.tag
                ? userTags.find(t => t.label.toUpperCase() === bookmark.tag!.toUpperCase())
                : undefined;

            // --- Icône de l'arbre ---
            if (tagConfig && tagConfig.icon) {
                // Tag custom : icône Codicon teintée en bleu
                const rawIcon = tagConfig.icon;
                const cleanIconName = rawIcon.replace(/^\$\((.*?)\).*/, '$1');
                this.iconPath = this.getOrCreateTintedIconUri(cleanIconName);
            } else {
                // Pas de tag : logo bleu (gutter.svg)
                if (this.extensionUri) {
                    this.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'gutter.svg');
                } else {
                    // Fallback si extensionUri non disponible
                    this.iconPath = new vscode.ThemeIcon('bookmark');
                }
            }

            // --- Tooltip ---
            const tooltipMarkdown = new vscode.MarkdownString();
            tooltipMarkdown.isTrusted = true;
            tooltipMarkdown.supportHtml = true;
            tooltipMarkdown.supportThemeIcons = true;

            const cleanIconName = tagConfig?.icon
                ? tagConfig.icon.replace(/^\$\((.*?)\).*/, '$1')
                : 'bookmark';

            let htmlContent = '';
            if (bookmark.tag && bookmark.tag.trim().length > 0) {
                htmlContent = `$(${cleanIconName}) **${bookmark.tag.toUpperCase()}** — *${bookmark.symbolName}*\n\n`;
            } else {
                htmlContent = `*${bookmark.symbolName}*\n\n`;
            }

            htmlContent += `---\n\n`;

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

            if (hasContentSection) {
                htmlContent += `---\n\n`;
            }

            const authorLabel = vscode.l10n.t('Author');
            const dateLabel = vscode.l10n.t('Date');
            htmlContent += `👤 **${authorLabel} :** ${author} &nbsp;|&nbsp; 📅 **${dateLabel} :** ${dateStr}\n\n`;

            if (hasRange) {
                const linesLabel = vscode.l10n.t('Lines');
                const toLabel = vscode.l10n.t('to');
                htmlContent += `📏 **${linesLabel} :** ${bookmark.highlightRange!.startLine + 1} ${toLabel} ${bookmark.highlightRange!.endLine + 1}`;
            } else {
                const lineLabel = vscode.l10n.t('Line');
                htmlContent += `📍 **${lineLabel} :** ${bookmark.line}`;
            }

            tooltipMarkdown.appendMarkdown(htmlContent);
            this.tooltip = tooltipMarkdown;

            this.command = {
                command: 'vscode.open',
                title: vscode.l10n.t('Open bookmark'),
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

    /** Charge un SVG Codicon et le teint en bleu (Data URI, avec cache) */
    private getOrCreateTintedIconUri(iconName: string): vscode.Uri {
        const cached = this.iconUriCache.get(iconName);
        if (cached) { return cached; }

        if (!this.extensionUri) {
            return vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${BookmarkTreeItem.BRAND_BLUE}"><path d="M3 2h10a1 1 0 0 1 1 1v12l-6-3.5L2 15V3a1 1 0 0 1 1-1z"/></svg>`
            ));
        }

        let svgPath = vscode.Uri.joinPath(
            this.extensionUri,
            'node_modules', '@vscode/codicons', 'src', 'icons', `${iconName}.svg`
        ).fsPath;

        if (!fs.existsSync(svgPath)) {
            svgPath = vscode.Uri.joinPath(
                this.extensionUri,
                'node_modules', '@vscode/codicons', 'src', 'icons', 'bookmark-filled.svg'
            ).fsPath;
        }

        const blue = BookmarkTreeItem.BRAND_BLUE;
        let iconUri: vscode.Uri;
        try {
            let svgContent = fs.readFileSync(svgPath, 'utf8');
            if (svgContent.includes('fill=')) {
                svgContent = svgContent.replace(/fill="[^"]*"/g, `fill="${blue}"`);
            } else {
                svgContent = svgContent.replace('<svg', `<svg fill="${blue}"`);
            }
            iconUri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(svgContent));
        } catch {
            const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${blue}"><path d="M3 2h10a1 1 0 0 1 1 1v12l-6-3.5L2 15V3a1 1 0 0 1 1-1z"/></svg>`;
            iconUri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(fallbackSvg));
        }

        this.iconUriCache.set(iconName, iconUri);
        return iconUri;
    }
}

export class BookmarkTreeViewProvider implements vscode.TreeDataProvider<BookmarkTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkTreeItem | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private provider: BookmarkProvider,
        private extensionUri: vscode.Uri
    ) {
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
                    filePath,
                    this.extensionUri
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
                    b,
                    undefined,
                    this.extensionUri
                )
            );
        }

        return [];
    }
}