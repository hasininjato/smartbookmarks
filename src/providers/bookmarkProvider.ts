import * as vscode from 'vscode';
import { Bookmark, SymbolInfo } from '../types';
import { Storage } from '../storage/storage';
import { getGitUser } from '../utils/gitUser';
import * as fs from 'fs';

export class BookmarkProvider {
    // Indexation principale par ID
    private bookmarks: Map<string, Bookmark> = new Map();
    // Indexation secondaire par fichier pour des recherches O(1)
    private fileIndex: Map<string, Set<string>> = new Map();

    private storage: Storage;
    private _onDidChangeBookmarks = new vscode.EventEmitter<void>();
    public readonly onDidChangeBookmarks = this._onDidChangeBookmarks.event;

    constructor(context: vscode.ExtensionContext) {
        this.storage = new Storage(context);
        this.load();
        void this.cleanOrphanBookmarks(); // Nettoyage asynchrone non-bloquant
        this.setupListeners();
    }

    // LISTENERS
    private setupListeners(): void {
        // 1. Modifications de texte (Déplacement & Suppression dynamique)
        vscode.workspace.onDidChangeTextDocument((event) => {
            const filePath = event.document.uri.fsPath;
            const fileBookmarks = this.getForFile(filePath);

            if (fileBookmarks.length === 0 || event.contentChanges.length === 0) {
                return;
            }

            let hasChanged = false;

            for (const change of event.contentChanges) {
                if (this.handleTextChange(event.document, filePath, fileBookmarks, change)) {
                    hasChanged = true;
                }
            }

            if (hasChanged) {
                this.notifyAndSave();
            }
        });

        // 2. Renommage de fichiers/dossiers
        vscode.workspace.onDidRenameFiles((event) => {
            let hasChanged = false;

            for (const rename of event.files) {
                const oldPath = rename.oldUri.fsPath;
                const newPath = rename.newUri.fsPath;

                const affectedBookmarks = this.getForFile(oldPath);
                for (const bookmark of affectedBookmarks) {
                    this.removeFromIndex(bookmark);
                    bookmark.filePath = newPath;
                    bookmark.updatedAt = Date.now();
                    this.addToIndex(bookmark);
                    hasChanged = true;
                }
            }

            if (hasChanged) {
                this.notifyAndSave();
            }
        });

        // 3. Suppression de fichiers OU dossiers
        vscode.workspace.onDidDeleteFiles((event) => {
            let hasChanged = false;

            for (const uri of event.files) {
                const deletedPath = uri.fsPath;

                for (const bookmark of this.getBookmarks()) {
                    if (bookmark.filePath === deletedPath || bookmark.filePath.startsWith(deletedPath + '/')) {
                        this.deleteBookmarkInternal(bookmark.id);
                        hasChanged = true;
                    }
                }
            }

            if (hasChanged) {
                this.notifyAndSave();
            }
        });
    }

    // TRAITEMENT DYNAMIQUE DES DÉCALAGES
    private handleTextChange(
        document: vscode.TextDocument,
        filePath: string,
        fileBookmarks: Bookmark[],
        change: vscode.TextDocumentContentChangeEvent
    ): boolean {
        let hasChanged = false;

        const linesAdded = (change.text.match(/\n/g) || []).length;
        const linesRemoved = change.range.end.line - change.range.start.line;
        const lineDelta = linesAdded - linesRemoved;

        const changeStartLine = change.range.start.line;
        const changeEndLine = change.range.end.line;

        for (const bookmark of fileBookmarks) {
            const startLine = bookmark.line - 1;
            const endLine = bookmark.highlightRange ? bookmark.highlightRange.endLine : startLine;
            const startsAtLineHead =
                changeStartLine < startLine ||
                (changeStartLine === startLine && change.range.start.character === 0);
            const isSelectionUpwardsFromBookmark =
                changeStartLine < startLine &&
                changeEndLine === startLine;
            // 1. Suppression du signet
            const isLineDeleted = !isSelectionUpwardsFromBookmark && (
                (startsAtLineHead && changeEndLine > endLine) ||
                (changeStartLine < startLine && changeEndLine >= startLine && lineDelta < 0) ||
                (bookmark.line > document.lineCount)
            );

            if (isLineDeleted) {
                this.deleteBookmarkInternal(bookmark.id);
                hasChanged = true;
                continue;
            }

            // 2. Remontée via sélection vers le haut
            if (isSelectionUpwardsFromBookmark) {
                const targetLine = changeStartLine + 1;
                const diff = targetLine - bookmark.line;

                bookmark.line = targetLine;
                bookmark.range = new vscode.Range(changeStartLine, 0, changeStartLine, 0);

                if (bookmark.highlightRange) {
                    bookmark.highlightRange.startLine += diff;
                    bookmark.highlightRange.endLine += diff;
                }

                bookmark.updatedAt = Date.now();
                hasChanged = true;
            }
            // 3. Décalage vertical standard (modification avant le signet)
            else if (changeEndLine < startLine) {
                if (lineDelta !== 0) {
                    bookmark.line = Math.max(1, bookmark.line + lineDelta);
                    const newLineIndex = bookmark.line - 1;
                    bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                    if (bookmark.highlightRange) {
                        bookmark.highlightRange.startLine += lineDelta;
                        bookmark.highlightRange.endLine += lineDelta;
                    }
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                }
            }
            // 4. Édition sur la ligne même du signet
            else if (changeStartLine === startLine) {
                if (lineDelta > 0) {
                    const lineText = document.lineAt(changeStartLine).text;
                    const textBeforeChange = lineText.substring(0, change.range.start.character);

                    if (textBeforeChange.trim() === '') {
                        bookmark.line += lineDelta;
                        const newLineIndex = bookmark.line - 1;
                        bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                        if (bookmark.highlightRange) {
                            bookmark.highlightRange.startLine += lineDelta;
                            bookmark.highlightRange.endLine += lineDelta;
                        }
                    } else if (bookmark.highlightRange) {
                        bookmark.highlightRange.endLine += lineDelta;
                    }
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                } else if (lineDelta < 0 && bookmark.highlightRange) {
                    // Fusion de lignes : tout ce qui suit remonte de |lineDelta|
                    bookmark.highlightRange.endLine += lineDelta;
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                }
            }
            // 5. Édition à l'intérieur d'une plage multi-lignes
            else if (changeStartLine > startLine && changeStartLine <= endLine) {
                if (bookmark.highlightRange && lineDelta !== 0) {
                    bookmark.highlightRange.endLine += lineDelta;
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                }
            }

            // Normalisation des bornes du HighlightRange
            if (bookmark.highlightRange) {
                bookmark.highlightRange.startLine = Math.max(0, bookmark.highlightRange.startLine);
                bookmark.highlightRange.endLine = Math.max(
                    bookmark.highlightRange.startLine,
                    bookmark.highlightRange.endLine
                );
            }
        }

        return hasChanged;
    }

    public toggle(
        symbol: SymbolInfo,
        filePath: string,
        cursorLine: number,
        highlightRange?: { startLine: number; endLine: number },
        comment?: string,
        tag?: string,
        title?: string
    ): Bookmark | null {
        const line = cursorLine + 1;
        const existingBookmark = this.getForFile(filePath).find(b => b.line === line);

        if (existingBookmark) {
            this.deleteBookmarkInternal(existingBookmark.id);
            this.notifyAndSave();
            return null;
        }

        const id = `${filePath}::${Date.now()}::${Math.random().toString(36).substring(2, 7)}`;
        const now = Date.now();
        const formattedDate = new Date(now).toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short'
        });

        const user = getGitUser(filePath);

        const bookmark: Bookmark = {
            id,
            symbolName: symbol.name,
            symbolKind: symbol.kind,
            filePath,
            range: new vscode.Range(cursorLine, 0, cursorLine, 0),
            line,
            createdAt: now,
            updatedAt: now,
            author: user.name,
            createdDateFormatted: formattedDate,
            highlightRange,
            comment: comment?.trim() || undefined,
            tag: tag || undefined,
            title: title?.trim() || undefined
        };

        this.addToIndex(bookmark);
        this.notifyAndSave();
        return bookmark;
    }

    public getBookmarks(): Bookmark[] {
        return Array.from(this.bookmarks.values());
    }

    public getForFile(filePath: string): Bookmark[] {
        const ids = this.fileIndex.get(filePath);
        if (!ids) {
            return [];
        }
        return Array.from(ids).map(id => this.bookmarks.get(id)!).filter(Boolean);
    }

    public getNext(position: vscode.Position, filePath: string): Bookmark | null {
        const bookmarks = this.getForFile(filePath);
        if (bookmarks.length === 0) {
            return null;
        }

        const currentLine1Based = position.line + 1;
        const sorted = [...bookmarks].sort((a, b) => a.line - b.line);

        return sorted.find(b => b.line > currentLine1Based) || sorted[0];
    }

    public getPrevious(position: vscode.Position, filePath: string): Bookmark | null {
        const bookmarks = this.getForFile(filePath);
        if (bookmarks.length === 0) {
            return null;
        }

        const currentLine1Based = position.line + 1;
        const sorted = [...bookmarks].sort((a, b) => b.line - a.line);

        return sorted.find(b => b.line < currentLine1Based) || sorted[0];
    }

    public updatePosition(id: string, range: vscode.Range): void {
        const bookmark = this.bookmarks.get(id);
        if (bookmark) {
            bookmark.range = range;
            bookmark.line = range.start.line + 1;
            bookmark.updatedAt = Date.now();
            this.notifyAndSave();
        }
    }

    public clear(): void {
        this.bookmarks.clear();
        this.fileIndex.clear();
        this.notifyAndSave();
    }

    public clearForFile(filePath: string): void {
        const bookmarks = this.getForFile(filePath);
        if (bookmarks.length > 0) {
            for (const b of bookmarks) {
                this.deleteBookmarkInternal(b.id);
            }
            this.notifyAndSave();
        }
    }

    public delete(id: string): void {
        if (this.bookmarks.has(id)) {
            this.deleteBookmarkInternal(id);
            this.notifyAndSave();
        }
    }

    public async cleanOrphanBookmarks(): Promise<void> {
        let hasChanged = false;

        for (const [id, bookmark] of this.bookmarks) {
            try {
                await fs.promises.access(bookmark.filePath);
            } catch {
                this.deleteBookmarkInternal(id);
                hasChanged = true;
            }
        }

        if (hasChanged) {
            this.notifyAndSave();
        }
    }

    public updateTitleById(id: string, newTitle?: string): void {
        const bookmark = this.bookmarks.get(id);

        if (bookmark) {
            bookmark.title = newTitle;
            bookmark.updatedAt = Date.now();
            this.notifyAndSave();
        }
    }

    private addToIndex(bookmark: Bookmark): void {
        this.bookmarks.set(bookmark.id, bookmark);

        if (!this.fileIndex.has(bookmark.filePath)) {
            this.fileIndex.set(bookmark.filePath, new Set());
        }
        this.fileIndex.get(bookmark.filePath)!.add(bookmark.id);
    }

    private removeFromIndex(bookmark: Bookmark): void {
        this.bookmarks.delete(bookmark.id);

        const ids = this.fileIndex.get(bookmark.filePath);
        if (ids) {
            ids.delete(bookmark.id);
            if (ids.size === 0) {
                this.fileIndex.delete(bookmark.filePath);
            }
        }
    }

    private deleteBookmarkInternal(id: string): void {
        const bookmark = this.bookmarks.get(id);
        if (bookmark) {
            this.removeFromIndex(bookmark);
        }
    }

    private notifyAndSave(): void {
        this.save();
        this._onDidChangeBookmarks.fire();
    }

    private save(): void {
        this.storage.save(this.getBookmarks());
    }

    private load(): void {
        const saved = this.storage.load();
        this.bookmarks.clear();
        this.fileIndex.clear();

        for (const b of saved) {
            this.addToIndex(b);
        }
    }
}