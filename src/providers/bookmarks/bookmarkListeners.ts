import * as vscode from 'vscode';
import { Bookmark } from '../../types';
import { handleTextChange } from './bookmarkTextChangeHandler';

export interface BookmarkListenerDeps {
    getForFile: (filePath: string) => Bookmark[];
    getAllBookmarks: () => Bookmark[];
    deleteBookmark: (id: string) => void;
    renameBookmarkFile: (bookmark: Bookmark, newPath: string) => void;
    notifyChanged: () => void;
}

/**
 * Enregistre les listeners VS Code qui maintiennent les signets synchronisés
 * avec les modifications de texte, les renommages et les suppressions de fichiers.
 */
export function registerBookmarkListeners(deps: BookmarkListenerDeps): void {
    // 1. Modifications de texte (Déplacement & Suppression dynamique)
    vscode.workspace.onDidChangeTextDocument((event) => {
        const filePath = event.document.uri.fsPath;
        const fileBookmarks = deps.getForFile(filePath);

        if (fileBookmarks.length === 0 || event.contentChanges.length === 0) {
            return;
        }

        let hasChanged = false;

        for (const change of event.contentChanges) {
            if (handleTextChange(event.document, fileBookmarks, change, deps.deleteBookmark)) {
                hasChanged = true;
            }
        }

        if (hasChanged) {
            deps.notifyChanged();
        }
    });

    // 2. Renommage de fichiers/dossiers
    vscode.workspace.onDidRenameFiles((event) => {
        let hasChanged = false;

        for (const rename of event.files) {
            const oldPath = rename.oldUri.fsPath;
            const newPath = rename.newUri.fsPath;

            const affectedBookmarks = deps.getForFile(oldPath);
            for (const bookmark of affectedBookmarks) {
                // Le chemin fait partie de la clé d'index : on passe par renameBookmarkFile
                // pour que l'index par fichier reste cohérent (sinon getForFile(newPath)
                // ne retrouverait plus le signet).
                deps.renameBookmarkFile(bookmark, newPath);
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            }
        }

        if (hasChanged) {
            deps.notifyChanged();
        }
    });

    // 3. Suppression de fichiers OU dossiers
    vscode.workspace.onDidDeleteFiles((event) => {
        let hasChanged = false;

        for (const uri of event.files) {
            const deletedPath = uri.fsPath;

            for (const bookmark of deps.getAllBookmarks()) {
                if (bookmark.filePath === deletedPath || bookmark.filePath.startsWith(deletedPath + '/')) {
                    deps.deleteBookmark(bookmark.id);
                    hasChanged = true;
                }
            }
        }

        if (hasChanged) {
            deps.notifyChanged();
        }
    });
}