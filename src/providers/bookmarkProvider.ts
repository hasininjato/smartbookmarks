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

    // Recherche une ligne dont le contenu correspond exactement (trim) au texte attendu,
    // dans un rayon autour de la position d'origine.
    // - Si un seul candidat correspond : on le retourne directement.
    // - Si plusieurs candidats correspondent (code répétitif, ex: deux endpoints avec
    //   une ligne identique) : on utilise le contenu de la ligne précédente comme
    //   contexte de désambiguïsation. On ne retourne un résultat que si UN SEUL
    //   candidat a aussi la bonne ligne précédente.
    private findMatchingLine(
        document: vscode.TextDocument,
        expectedText: string,
        aroundLine: number,
        expectedContext?: string,
        searchRadius: number = 100
    ): number | null {
        const target = expectedText.trim();

        // Trop court = pas fiable (ex: une ligne avec juste "}" ou "")
        if (target.length < 4) {
            return null;
        }

        const start = Math.max(0, aroundLine - searchRadius);
        const end = Math.min(document.lineCount - 1, aroundLine + searchRadius);

        const matches: number[] = [];
        for (let i = start; i <= end; i++) {
            if (document.lineAt(i).text.trim() === target) {
                matches.push(i);
            }
        }

        if (matches.length === 1) {
            return matches[0];
        }

        if (matches.length > 1 && expectedContext) {
            const ctx = expectedContext.trim();
            const contextMatches = matches.filter(
                (i) => i > 0 && document.lineAt(i - 1).text.trim() === ctx
            );
            if (contextMatches.length === 1) {
                return contextMatches[0];
            }
        }

        return null;
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
        const changeStartChar = change.range.start.character;
        const documentLineCount = document.lineCount;

        for (const bookmark of fileBookmarks) {
            const startLine = bookmark.line - 1;
            const highlightRange = bookmark.highlightRange;
            const endLine = highlightRange ? highlightRange.endLine : startLine;

            const startsAtLineHead =
                changeStartLine < startLine ||
                (changeStartLine === startLine && changeStartChar === 0);

            const isSelectionUpwardsFromBookmark =
                changeStartLine < startLine &&
                changeEndLine === startLine;

            // 1. Suppression du signet
            const isLineDeleted = !isSelectionUpwardsFromBookmark && (
                (startsAtLineHead && changeEndLine > endLine) ||
                (changeStartLine < startLine && changeEndLine >= startLine && lineDelta < 0) ||
                (bookmark.line > documentLineCount)
            );

            if (isLineDeleted) {
                // Avant de supprimer définitivement : le contenu de la ligne existe-t-il
                // encore ailleurs dans le fichier (undo, ligne redescendue plus loin) ?
                const recoveredLine = bookmark.lineText
                    ? this.findMatchingLine(document, bookmark.lineText, startLine, bookmark.lineTextContext)
                    : null;

                if (recoveredLine !== null) {
                    bookmark.line = recoveredLine + 1;
                    bookmark.range = new vscode.Range(recoveredLine, 0, recoveredLine, 0);
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                    continue;
                }

                this.deleteBookmarkInternal(bookmark.id);
                hasChanged = true;
                continue;
            }

            // 2. Remontée via sélection vers le haut
            // NOTE : ce cas est ambigu (fusion possible avec du contenu existant),
            // donc on NE touche PAS à bookmark.lineText/lineTextContext ici — l'ancre
            // d'origine est préservée pour permettre une future récupération (voir
            // vérification de dérive en fin de boucle).
            if (isSelectionUpwardsFromBookmark) {
                const targetLine = changeStartLine + 1;
                const diff = targetLine - bookmark.line;

                bookmark.line = targetLine;
                bookmark.range = new vscode.Range(changeStartLine, 0, changeStartLine, 0);

                if (highlightRange) {
                    highlightRange.startLine += diff;
                    highlightRange.endLine += diff;
                }

                bookmark.updatedAt = Date.now();
                hasChanged = true;
            }
            // 3. Décalage vertical standard (modification avant le signet)
            // Cas non-ambigu : le contenu de la ligne du signet n'est jamais touché,
            // seul son numéro de ligne change. L'ancre reste donc valide telle quelle.
            else if (changeEndLine < startLine) {
                if (lineDelta !== 0) {
                    bookmark.line = Math.max(1, bookmark.line + lineDelta);
                    const newLineIndex = bookmark.line - 1;
                    bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                    if (highlightRange) {
                        highlightRange.startLine += lineDelta;
                        highlightRange.endLine += lineDelta;
                    }
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                }
            }
            // 4. Édition sur la ligne même du signet
            else if (changeStartLine === startLine) {
                if (lineDelta > 0) {
                    const lineText = document.lineAt(changeStartLine).text;
                    const textBeforeChange = lineText.substring(0, changeStartChar);

                    if (textBeforeChange.trim() === '') {
                        // Insertion pure avant tout contenu réel : le contenu du signet
                        // descend intact, l'ancre reste donc valide sans modification.
                        bookmark.line += lineDelta;
                        const newLineIndex = bookmark.line - 1;
                        bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                        if (highlightRange) {
                            highlightRange.startLine += lineDelta;
                            highlightRange.endLine += lineDelta;
                        }
                    } else if (highlightRange) {
                        // Cas ambigu (insertion au milieu de la ligne, ex: undo d'une fusion) :
                        // on ne touche PAS à l'ancre, seule la fin du highlight est ajustée.
                        highlightRange.endLine += lineDelta;
                    }
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                } else if (lineDelta < 0) {
                    // Fusion de lignes : cas ambigu, on NE touche PAS à l'ancre —
                    // elle reste la référence pour une récupération future.
                    if (highlightRange) {
                        highlightRange.endLine += lineDelta;
                    }
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                } else {
                    // Édition sans changement de nombre de lignes : édition intentionnelle
                    // du contenu de la ligne bookmarkée elle-même. On rafraîchit lineText
                    // pour suivre cette évolution volontaire (le contexte au-dessus n'a
                    // pas bougé, pas besoin de le rafraîchir).
                    bookmark.lineText = document.lineAt(startLine).text;
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                }
            }
            // 5. Édition à l'intérieur d'une plage multi-lignes
            else if (changeStartLine > startLine && changeStartLine <= endLine) {
                if (highlightRange && lineDelta !== 0) {
                    highlightRange.endLine += lineDelta;
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                }
            }

            // Vérification de dérive : si le contenu de la ligne actuelle du signet ne
            // correspond plus à son ancre textuelle, on tente de la retrouver ailleurs
            // dans le fichier (undo qui restaure une fusion, déplacement manuel du bloc).
            if (bookmark.lineText) {
                const currentLineIndex = bookmark.line - 1;
                if (currentLineIndex >= 0 && currentLineIndex < documentLineCount) {
                    const currentText = document.lineAt(currentLineIndex).text.trim();
                    const anchorText = bookmark.lineText.trim();

                    if (currentText !== anchorText) {
                        const recoveredLine = this.findMatchingLine(
                            document,
                            bookmark.lineText,
                            currentLineIndex,
                            bookmark.lineTextContext
                        );

                        if (recoveredLine !== null && recoveredLine !== currentLineIndex) {
                            const diff = recoveredLine - currentLineIndex;
                            bookmark.line = recoveredLine + 1;
                            bookmark.range = new vscode.Range(recoveredLine, 0, recoveredLine, 0);

                            if (highlightRange) {
                                highlightRange.startLine += diff;
                                highlightRange.endLine += diff;
                            }

                            bookmark.updatedAt = Date.now();
                            hasChanged = true;
                        }
                    }
                }
            }

            // Normalisation des bornes du HighlightRange
            if (highlightRange) {
                highlightRange.startLine = Math.max(0, highlightRange.startLine);
                highlightRange.endLine = Math.max(highlightRange.startLine, highlightRange.endLine);
            }
        }

        return hasChanged;
    }

    public toggle(
        symbol: SymbolInfo,
        filePath: string,
        cursorLine: number,
        lineText: string,
        lineTextContext: string | undefined,
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
            lineText,
            lineTextContext,
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