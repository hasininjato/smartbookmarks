import * as vscode from 'vscode';
import { Bookmark, SymbolInfo } from '../types';
import { Storage } from '../storage/storage';

export class BookmarkProvider {
    private bookmarks: Map<string, Bookmark> = new Map();
    private storage: Storage;
    private _onDidChangeBookmarks = new vscode.EventEmitter<void>();
    public readonly onDidChangeBookmarks = this._onDidChangeBookmarks.event;

    constructor(context: vscode.ExtensionContext) {
        this.storage = new Storage(context);
        this.load();
        this.setupListeners();
    }

    private setupListeners(): void {
        // 1. MISE À JOUR DYNAMIQUE DES POSITIONS ET DES PLAGES
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

                if (lineDelta === 0) { continue; }

                const changeLine = change.range.start.line;
                const changeChar = change.range.start.character;

                for (const bookmark of fileBookmarks) {
                    const startLine = bookmark.line - 1; // 0-based index
                    const endLine = bookmark.highlightRange ? bookmark.highlightRange.endLine : startLine;

                    // -------------------------------------------------------------
                    // CAS 1 : Tape/Saut de ligne STRICTEMENT AVANT le signet
                    // -> L'icône ET toute la plage violette descendent intactes
                    // -------------------------------------------------------------
                    if (changeLine < startLine) {
                        bookmark.line += lineDelta;
                        if (bookmark.line < 1) { bookmark.line = 1; }

                        const newLineIndex = bookmark.line - 1;
                        bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                        if (bookmark.highlightRange) {
                            bookmark.highlightRange.startLine += lineDelta;
                            bookmark.highlightRange.endLine += lineDelta;
                        }
                        hasChanged = true;
                    }
                    // -------------------------------------------------------------
                    // CAS 2 : Tape/Saut de ligne SUR LA 1RE LIGNE DU SIGNET
                    // -------------------------------------------------------------
                    else if (changeLine === startLine) {
                        // A. Si on est au début de la ligne (colonne 0) -> Le bloc complet descend
                        const lineText = event.document.lineAt(changeLine).text;
                        const textBeforeChange = lineText.substring(0, changeChar);
                        // if (changeChar === 0) {
                        if (textBeforeChange.trim() === '') {
                            bookmark.line += lineDelta;
                            if (bookmark.line < 1) { bookmark.line = 1; }

                            const newLineIndex = bookmark.line - 1;
                            bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                            if (bookmark.highlightRange) {
                                bookmark.highlightRange.startLine += lineDelta;
                                bookmark.highlightRange.endLine += lineDelta;
                            }
                        }
                        // B. Si on est au milieu/fin de la ligne -> Seule la plage violette s'allonge vers le bas
                        else {
                            if (bookmark.highlightRange) {
                                bookmark.highlightRange.endLine += lineDelta;
                            }
                        }
                        hasChanged = true;
                    }
                    // -------------------------------------------------------------
                    // CAS 3 : Tape/Saut de ligne À L'INTÉRIEUR de la plage (Ligne 2 et +)
                    // -> L'icône reste en haut, seule la fin de la plage violette s'étire
                    // -------------------------------------------------------------
                    else if (changeLine > startLine && changeLine <= endLine) {
                        if (bookmark.highlightRange) {
                            bookmark.highlightRange.endLine += lineDelta;
                        }
                        hasChanged = true;
                    }

                    // Sécurité pour éviter les index négatifs
                    if (bookmark.highlightRange) {
                        if (bookmark.highlightRange.startLine < 0) { bookmark.highlightRange.startLine = 0; }
                        if (bookmark.highlightRange.endLine < bookmark.highlightRange.startLine) {
                            bookmark.highlightRange.endLine = bookmark.highlightRange.startLine;
                        }
                    }

                    if (hasChanged) {
                        bookmark.updatedAt = Date.now();
                        this.bookmarks.set(bookmark.id, bookmark);
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

        // 3. Suppression de fichiers
        vscode.workspace.onDidDeleteFiles((event) => {
            let hasChanged = false;
            for (const uri of event.files) {
                const path = uri.fsPath;
                for (const [id, bookmark] of this.bookmarks) {
                    if (bookmark.filePath === path) {
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
        highlightRange?: { startLine: number; endLine: number }
    ): Bookmark | null {
        const line = cursorLine + 1; // 1-based index

        const existingBookmark = this.getForFile(filePath).find(b => b.line === line);

        if (existingBookmark) {
            this.bookmarks.delete(existingBookmark.id);
            this.save();
            this._onDidChangeBookmarks.fire();
            return null;
        }

        const id = `${filePath}::${Date.now()}::${Math.random().toString(36).substring(2, 7)}`;
        const lineRange = new vscode.Range(cursorLine, 0, cursorLine, 0);

        const bookmark: Bookmark = {
            id,
            symbolName: symbol.name,
            symbolKind: symbol.kind,
            filePath,
            range: lineRange,
            line: line,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            highlightRange
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
}