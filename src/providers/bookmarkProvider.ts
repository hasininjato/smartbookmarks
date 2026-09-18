import * as vscode from 'vscode';
import { Bookmark, SymbolInfo } from '../types';
import { Storage } from '../storage/storage';
import { getGitUser } from '../utils/gitUser';
import * as fs from 'fs';
import { BookmarkIndex } from './bookmarks/bookmarkIndex';
import { registerBookmarkListeners } from './bookmarks/bookmarkListeners';

export class BookmarkProvider {
    private index: BookmarkIndex = new BookmarkIndex();
    private storage: Storage;
    private _onDidChangeBookmarks = new vscode.EventEmitter<void>();
    public readonly onDidChangeBookmarks = this._onDidChangeBookmarks.event;

    constructor(context: vscode.ExtensionContext) {
        this.storage = new Storage(context);
        this.load();
        void this.cleanOrphanBookmarks(); // Nettoyage asynchrone non-bloquant

        registerBookmarkListeners({
            getForFile: (filePath) => this.getForFile(filePath),
            getAllBookmarks: () => this.getBookmarks(),
            deleteBookmark: (id) => this.deleteBookmarkInternal(id),
            renameBookmarkFile: (bookmark, newPath) => this.renameBookmarkFile(bookmark, newPath),
            notifyChanged: () => this.notifyAndSave()
        });
    }

    /**
     * Récupère un signet à la ligne d'un fichier donné (cursorLine est en base 0)
     */
    public getBookmark(filePath: string, cursorLine: number): Bookmark | undefined {
        const line = cursorLine + 1; // Conversion en base 1 pour correspondre à bookmark.line
        return this.getForFile(filePath).find(b => b.line === line);
    }

    /**
     * Met à jour un signet existant sur une ligne donnée sans recréer son ID ou sa date de création
     */
    public updateBookmark(
        filePath: string,
        cursorLine: number,
        updates: {
            symbol?: SymbolInfo;
            title?: string;
            comment?: string;
            tag?: string;
            highlightRange?: { startLine: number; endLine: number };
        }
    ): Bookmark | null {
        const bookmark = this.getBookmark(filePath, cursorLine);
        if (!bookmark) {
            return null;
        }

        if (updates.symbol) {
            bookmark.symbolName = updates.symbol.name;
            bookmark.symbolKind = updates.symbol.kind;
        }

        // Utilisation de 'property' in updates pour autoriser la réinitialisation à undefined
        if ('title' in updates) {
            bookmark.title = updates.title;
        }
        if ('comment' in updates) {
            bookmark.comment = updates.comment;
        }
        if ('tag' in updates) {
            bookmark.tag = updates.tag; // Réinitialise bien à undefined si aucun tag n'est choisi
        }
        if ('highlightRange' in updates) {
            bookmark.highlightRange = updates.highlightRange;
        }

        bookmark.updatedAt = Date.now();
        this.notifyAndSave();
        return bookmark;
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
            author: user.email,
            createdDateFormatted: formattedDate,
            highlightRange,
            comment: comment?.trim() || undefined,
            tag: tag || undefined,
            title: title?.trim() || undefined
        };

        this.index.add(bookmark);
        this.notifyAndSave();
        return bookmark;
    }

    public getBookmarks(): Bookmark[] {
        return this.index.getAll();
    }

    public getForFile(filePath: string): Bookmark[] {
        return this.index.getForFile(filePath);
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
        const bookmark = this.index.get(id);
        if (bookmark) {
            bookmark.range = range;
            bookmark.line = range.start.line + 1;
            bookmark.updatedAt = Date.now();
            this.notifyAndSave();
        }
    }

    public clear(): void {
        this.index.clear();
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
        if (this.index.has(id)) {
            this.deleteBookmarkInternal(id);
            this.notifyAndSave();
        }
    }

    public async cleanOrphanBookmarks(): Promise<void> {
        let hasChanged = false;

        for (const bookmark of this.index.getAll()) {
            try {
                await fs.promises.access(bookmark.filePath);
            } catch {
                this.deleteBookmarkInternal(bookmark.id);
                hasChanged = true;
            }
        }

        if (hasChanged) {
            this.notifyAndSave();
        }
    }

    public updateTitleById(id: string, newTitle?: string): void {
        const bookmark = this.index.get(id);

        if (bookmark) {
            bookmark.title = newTitle;
            bookmark.updatedAt = Date.now();
            this.notifyAndSave();
        }
    }

    /**
 * Renomme un tag sur tous les signets existants qui l'utilisaient
 */
    public renameTagInBookmarks(oldTagLabel: string, newTagLabel: string): void {
        let hasChanges = false;
        for (const bookmark of this.index.getAll()) {
            if (bookmark.tag?.toUpperCase() === oldTagLabel.toUpperCase()) {
                bookmark.tag = newTagLabel;
                bookmark.updatedAt = Date.now();
                hasChanges = true;
            }
        }
        if (hasChanges) {
            this.notifyAndSave();
        }
    }

    /**
     * Notifie un changement sans modifier les données (pour forcer le rafraîchissement d'icône)
     */
    public refresh(): void {
        this.notifyAndSave();
    }

    private renameBookmarkFile(bookmark: Bookmark, newPath: string): void {
        this.index.remove(bookmark);
        bookmark.filePath = newPath;
        this.index.add(bookmark);
    }

    private deleteBookmarkInternal(id: string): void {
        const bookmark = this.index.get(id);
        if (bookmark) {
            this.index.remove(bookmark);
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
        this.index.clear();

        for (const b of saved) {
            this.index.add(b);
        }
    }
}