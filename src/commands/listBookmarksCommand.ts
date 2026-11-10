import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { Bookmark, BookmarkTagConfig, BookmarkQuickPickItem } from '../types';

export class ListBookmarksCommand {
    public readonly commandId = 'smartbookmarks.listBookmarks';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;

        // 1. Find bookmarks from the active file
        let bookmarks = activeEditor
            ? this.provider.getForFile(activeEditor.document.uri.fsPath)
            : [];

        // 2. Fallback to ALL bookmarks if empty
        if (bookmarks.length === 0) {
            bookmarks = this.provider.getBookmarks();
        }

        if (bookmarks.length === 0) {
            vscode.window.showInformationMessage(vscode.l10n.t('No bookmarks found'));
            return;
        }

        // Retrieve configured tags to resolve their icons
        const config = vscode.workspace.getConfiguration('smartbookmarks');
        const userTags = config.get<BookmarkTagConfig[]>('tags') || [];

        // Sort bookmarks by line
        const sortedBookmarks = [...bookmarks].sort((a, b) => a.line - b.line);

        // 3. Create the QuickPick
        const quickPick = vscode.window.createQuickPick<BookmarkQuickPickItem>();
        quickPick.placeholder = vscode.l10n.t('Select a bookmark to navigate');

        // Transform bookmarks into list items
        quickPick.items = sortedBookmarks.map(b => {
            const author = b.author || vscode.l10n.t('Unknown');
            const dateStr = b.createdDateFormatted
                || (b.createdAt ? new Date(b.createdAt).toLocaleString(vscode.env.language) : vscode.l10n.t('Unknown date'));

            // Retrieve the icon associated with the tag
            let tagStr = '';
            if (b.tag && b.tag.trim().length > 0) {
                const formattedTag = b.tag.toUpperCase();
                const tagConfig = userTags.find(t => t.label.toUpperCase() === formattedTag);
                const rawIcon = tagConfig?.icon || 'tag';
                const cleanIconName = rawIcon.replace(/^\$\((.*?)\).*/, '$1');

                tagStr = `$(${cleanIconName}) [${formattedTag}] `;
            }

            // Build the Title and Note / Comment block for the details area
            let detailParts: string[] = [];
            if (b.title) {
                detailParts.push(`📌 ${b.title}`);
            }
            if (b.comment) {
                detailParts.push(`💬 ${b.comment}`);
            }

            const detailStr = detailParts.length > 0 ? detailParts.join(' — ') : undefined;

            return {
                label: `${tagStr}${b.symbolName}`,
                description: `👤 ${author}`,
                detail: detailStr ? `${detailStr}  |  📅 ${dateStr}` : `📅 ${dateStr}`,
                bookmark: b,
                buttons: [
                    {
                        iconPath: new vscode.ThemeIcon('trash'),
                        tooltip: vscode.l10n.t('Delete this bookmark')
                    }
                ]
            };
        });

        // 4. Click on the trash button
        quickPick.onDidTriggerItemButton(async (e) => {
            const item = e.item;
            this.provider.delete(item.bookmark.id);

            quickPick.items = quickPick.items.filter(i => i.bookmark.id !== item.bookmark.id);

            if (quickPick.items.length === 0) {
                quickPick.hide();
            }
        });

        // 5. Click on the line (navigation)
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