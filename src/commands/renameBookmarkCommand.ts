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
        // Si invoqué via F2, node est undefined. On récupère la sélection active du TreeView.
        let targetBookmark = node?.bookmark;

        if (!targetBookmark && this.treeView && this.treeView.selection.length > 0) {
            targetBookmark = this.treeView.selection[0].bookmark;
        }

        if (!targetBookmark) {
            vscode.window.showWarningMessage("Veuillez sélectionner un signet (et non un dossier/fichier) à renommer.");
            return;
        }

        if (!targetBookmark) {
            return;
        }

        const newTitle = await vscode.window.showInputBox({
            prompt: 'Nouveau titre pour le signet',
            value: targetBookmark.title || targetBookmark.symbolName
        });

        if (newTitle !== undefined) {
            this.provider.updateTitleById(targetBookmark.id, newTitle);
        }
    }
}