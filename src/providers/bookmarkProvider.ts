import * as vscode from 'vscode';
import { Bookmark, SymbolInfo } from '../types';
import { Storage } from '../storage/storage';
import * as os from 'os';
import { getGitUser } from '../utils/gitUser';
import * as fs from 'fs';
import * as path from 'path';

export class BookmarkProvider {
    private bookmarks: Map<string, Bookmark> = new Map();
    private storage: Storage;
    private _onDidChangeBookmarks = new vscode.EventEmitter<void>();
    public readonly onDidChangeBookmarks = this._onDidChangeBookmarks.event;

    constructor(context: vscode.ExtensionContext) {
        this.storage = new Storage(context);
        this.load();
        this.cleanOrphanBookmarks(); // <-- Nettoyage à froid des orphelins au démarrage
        this.setupListeners();
    }

    private setupListeners(): void {
        // 1. GESTION DES MODIFICATIONS DE TEXTE (DÉPLACEMENT ET NETTOYAGE)
        vscode.workspace.onDidChangeTextDocument((event) => {
            const filePath = event.document.uri.fsPath;
            const fileBookmarks = this.getForFile(filePath);

            if (fileBookmarks.length === 0 || event.contentChanges.length === 0) {
                return;
            }

            let hasChanged = false;

            for (const change of event.contentChanges) {
                const linesAdded = (change.text.match(/\n/g) || []).length;
                const linesRemoved = change.range.end.line - change.range.start.line;
                const lineDelta = linesAdded - linesRemoved;

                const changeStartLine = change.range.start.line; // 0-based
                const changeEndLine = change.range.end.line;     // 0-based

                for (const bookmark of fileBookmarks) {
                    const startLine = bookmark.line - 1; // 0-based
                    const endLine = bookmark.highlightRange ? bookmark.highlightRange.endLine : startLine;

                    // -----------------------------------------------------------------
                    // DÉTECTION : Est-ce qu'on remonte la ligne du signet via sélection vers le haut ?
                    // -----------------------------------------------------------------
                    // Cas où la sélection part du début/milieu de la ligne du signet vers le haut,
                    // sans englober ni détruire la ligne du signet elle-même.
                    const isSelectionUpwardsFromBookmark =
                        changeStartLine < startLine &&
                        changeEndLine === startLine &&
                        change.range.end.character < event.document.lineAt(changeEndLine).text.length;

                    // -----------------------------------------------------------------
                    // 1. SUPPRESSION DU SIGNET
                    // -----------------------------------------------------------------
                    const isLineDeleted = !isSelectionUpwardsFromBookmark && (
                        // A. Suppression qui dépasse/englobe la ligne du signet
                        (changeStartLine <= startLine && changeEndLine > endLine) ||
                        // B. Suppression du saut de ligne détruisant la ligne (Backspace en début de ligne / Suppr fin de ligne précédente)
                        (changeStartLine < startLine && changeEndLine >= startLine && lineDelta < 0) ||
                        // C. Suppression multi-lignes démarrant sur la ligne du signet
                        (changeStartLine === startLine && changeEndLine > startLine) ||
                        // D. Dépassement du nombre total de lignes
                        (bookmark.line > event.document.lineCount)
                    );

                    if (isLineDeleted) {
                        this.bookmarks.delete(bookmark.id);
                        hasChanged = true;
                        continue;
                    }

                    // -----------------------------------------------------------------
                    // 2. SELECTION VERS LE HAUT (Le signet remonte à la ligne de destination)
                    // -----------------------------------------------------------------
                    if (isSelectionUpwardsFromBookmark) {
                        const targetLine = changeStartLine + 1; // 1-based index
                        const diff = targetLine - bookmark.line;

                        bookmark.line = targetLine;
                        bookmark.range = new vscode.Range(changeStartLine, 0, changeStartLine, 0);

                        if (bookmark.highlightRange) {
                            bookmark.highlightRange.startLine += diff;
                            bookmark.highlightRange.endLine += diff;
                        }

                        bookmark.updatedAt = Date.now();
                        this.bookmarks.set(bookmark.id, bookmark);
                        hasChanged = true;
                    }
                    // -----------------------------------------------------------------
                    // 3. MODIFICATION STRICTEMENT AVANT LE SIGNET (Décalage vertical standard)
                    // -----------------------------------------------------------------
                    else if (changeEndLine < startLine) {
                        if (lineDelta !== 0) {
                            bookmark.line += lineDelta;
                            if (bookmark.line < 1) { bookmark.line = 1; }

                            const newLineIndex = bookmark.line - 1;
                            bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                            if (bookmark.highlightRange) {
                                bookmark.highlightRange.startLine += lineDelta;
                                bookmark.highlightRange.endLine += lineDelta;
                            }
                            bookmark.updatedAt = Date.now();
                            this.bookmarks.set(bookmark.id, bookmark);
                            hasChanged = true;
                        }
                    }
                    // -----------------------------------------------------------------
                    // 4. ÉDITION SUR LA LIGNE MÊME DU SIGNET
                    // -----------------------------------------------------------------
                    else if (changeStartLine === startLine) {
                        if (lineDelta > 0) {
                            const lineText = event.document.lineAt(changeStartLine).text;
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
                            this.bookmarks.set(bookmark.id, bookmark);
                            hasChanged = true;
                        }
                    }
                    // -----------------------------------------------------------------
                    // 5. ÉDITION À L'INTÉRIEUR D'UNE PLAGE PLURI-LIGNES
                    // -----------------------------------------------------------------
                    else if (changeStartLine > startLine && changeStartLine <= endLine) {
                        if (bookmark.highlightRange && lineDelta !== 0) {
                            bookmark.highlightRange.endLine += lineDelta;
                            bookmark.updatedAt = Date.now();
                            this.bookmarks.set(bookmark.id, bookmark);
                            hasChanged = true;
                        }
                    }

                    // Sécurités sur les bornes du HighlightRange
                    if (bookmark.highlightRange) {
                        if (bookmark.highlightRange.startLine < 0) { bookmark.highlightRange.startLine = 0; }
                        if (bookmark.highlightRange.endLine < bookmark.highlightRange.startLine) {
                            bookmark.highlightRange.endLine = bookmark.highlightRange.startLine;
                        }
                    }
                }
            }

            if (hasChanged) {
                this.save();
                this._onDidChangeBookmarks.fire();
            }
        });

        // 2. Renommage de fichiers
        vscode.workspace.onDidRenameFiles((event) => {
            let hasChanged = false;
            for (const rename of event.files) {
                const oldPath = rename.oldUri.fsPath;
                const newPath = rename.newUri.fsPath;

                for (const [id, bookmark] of this.bookmarks) {
                    if (bookmark.filePath === oldPath) {
                        bookmark.filePath = newPath;
                        bookmark.updatedAt = Date.now();
                        hasChanged = true;
                    }
                }
            }
            if (hasChanged) {
                this.save();
                this._onDidChangeBookmarks.fire();
            }
        });

        // 3. Suppression de fichiers OU DOSSIERS
        vscode.workspace.onDidDeleteFiles((event) => {
            let hasChanged = false;

            for (const uri of event.files) {
                const deletedPath = uri.fsPath;
                for (const [id, bookmark] of this.bookmarks) {
                    // Supprime si c'est le fichier exact OU si le fichier était DANS le dossier supprimé
                    if (bookmark.filePath === deletedPath || bookmark.filePath.startsWith(deletedPath + path.sep)) {
                        this.bookmarks.delete(id);
                        hasChanged = true;
                    }
                }
            }

            if (hasChanged) {
                this.save();
                this._onDidChangeBookmarks.fire();
            }
        });
    }

    toggle(
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
            this.bookmarks.delete(existingBookmark.id);
            this.save();
            this._onDidChangeBookmarks.fire();
            return null;
        }

        const id = `${filePath}::${Date.now()}::${Math.random().toString(36).substring(2, 7)}`;
        const lineRange = new vscode.Range(cursorLine, 0, cursorLine, 0);

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
            range: lineRange,
            line: line,
            createdAt: now,
            updatedAt: now,
            author: user.name,
            createdDateFormatted: formattedDate,
            highlightRange,
            comment: comment?.trim() || undefined,
            tag: tag || undefined,
            title: title?.trim() || undefined
        };

        this.bookmarks.set(id, bookmark);
        this.save();
        this._onDidChangeBookmarks.fire();
        return bookmark;
    }

    getBookmarks(): Bookmark[] {
        return Array.from(this.bookmarks.values());
    }

    getForFile(filePath: string): Bookmark[] {
        return this.getBookmarks().filter(b => b.filePath === filePath);
    }

    getNext(position: vscode.Position, filePath: string): Bookmark | null {
        const bookmarks = this.getForFile(filePath);
        if (bookmarks.length === 0) { return null; }

        const currentLine1Based = position.line + 1;
        const sorted = [...bookmarks].sort((a, b) => a.line - b.line);

        for (const b of sorted) {
            if (b.line > currentLine1Based) { return b; }
        }

        return sorted[0];
    }

    getPrevious(position: vscode.Position, filePath: string): Bookmark | null {
        const bookmarks = this.getForFile(filePath);
        if (bookmarks.length === 0) { return null; }

        const currentLine1Based = position.line + 1;
        const sorted = [...bookmarks].sort((a, b) => b.line - a.line);

        for (const b of sorted) {
            if (b.line < currentLine1Based) { return b; }
        }

        return sorted[0];
    }

    updatePosition(id: string, range: vscode.Range): void {
        const bookmark = this.bookmarks.get(id);
        if (bookmark) {
            bookmark.range = range;
            bookmark.line = range.start.line + 1;
            bookmark.updatedAt = Date.now();
            this.save();
            this._onDidChangeBookmarks.fire();
        }
    }

    clear(): void {
        this.bookmarks.clear();
        this.save();
        this._onDidChangeBookmarks.fire();
    }

    clearForFile(filePath: string): void {
        let hasChanged = false;
        for (const [id, bookmark] of this.bookmarks) {
            if (bookmark.filePath === filePath) {
                this.bookmarks.delete(id);
                hasChanged = true;
            }
        }

        if (hasChanged) {
            this.save();
            this._onDidChangeBookmarks.fire();
        }
    }

    private save(): void {
        this.storage.save(this.getBookmarks());
    }

    private load(): void {
        const saved = this.storage.load();
        this.bookmarks.clear();
        for (const b of saved) {
            this.bookmarks.set(b.id, b);
        }
    }

    public delete(id: string): void {
        if (this.bookmarks.has(id)) {
            this.bookmarks.delete(id);
            this.save();
            this._onDidChangeBookmarks.fire();
        }
    }

    /**
     * Nettoie les signets dont le fichier n'existe plus du tout sur le disque.
     */
    public cleanOrphanBookmarks(): void {
        let hasChanged = false;

        for (const [id, bookmark] of this.bookmarks) {
            if (!fs.existsSync(bookmark.filePath)) {
                this.bookmarks.delete(id);
                hasChanged = true;
            }
        }

        if (hasChanged) {
            this.save();
            this._onDidChangeBookmarks.fire();
        }
    }
}