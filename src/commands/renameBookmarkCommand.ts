import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { BookmarkTreeItem } from '../providers/bookmarkTreeViewProvider';

export class RenameBookmarkCommand {
    public readonly commandId = 'smartbookmarks.renameBookmark';

    constructor(
        private provider: BookmarkProvider,
        private treeView?: vscode.TreeView<BookmarkTreeItem>
    ) { }

    public async execute(node?: BookmarkTreeItem): Promise<void> {
        // If invoked via F2, node is undefined. Retrieve the active selection from the TreeView.
        let targetBookmark = node?.bookmark;

        if (!targetBookmark && this.treeView && this.treeView.selection.length > 0) {
            targetBookmark = this.treeView.selection[0].bookmark;
        }

        if (!targetBookmark) {
            vscode.window.showWarningMessage(
                vscode.l10n.t("Please select a bookmark (not a file/folder) to rename.")
            );
            return;
        }

        const newTitle = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('New title for the bookmark'),
            value: targetBookmark.title || targetBookmark.symbolName
        });

        if (newTitle !== undefined) {
            this.provider.updateTitleById(targetBookmark.id, newTitle);
        }
    }
}