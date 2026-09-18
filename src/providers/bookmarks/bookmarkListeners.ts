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
 * Registers VS Code listeners that keep bookmarks synchronized
 * with text changes, file renames, and file deletions.
 */
export function registerBookmarkListeners(deps: BookmarkListenerDeps): void {
    // 1. Text changes (Dynamic Movement & Deletion)
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

    // 2. File/folder renames
    vscode.workspace.onDidRenameFiles((event) => {
        let hasChanged = false;

        for (const rename of event.files) {
            const oldPath = rename.oldUri.fsPath;
            const newPath = rename.newUri.fsPath;

            const affectedBookmarks = deps.getForFile(oldPath);
            for (const bookmark of affectedBookmarks) {
                // The path is part of the index key: use renameBookmarkFile
                // so that the per-file index remains consistent (otherwise getForFile(newPath)
                // would no longer find the bookmark).
                deps.renameBookmarkFile(bookmark, newPath);
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            }
        }

        if (hasChanged) {
            deps.notifyChanged();
        }
    });

    // 3. File OR folder deletion
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