import { Bookmark } from '../../types';

/**
 * Encapsulates the in-memory bookmark storage (main Map + per-file index)
 * to enable O(1) lookups by file.
 */
export class BookmarkIndex {
    private bookmarks: Map<string, Bookmark> = new Map();
    private fileIndex: Map<string, Set<string>> = new Map();

    public get(id: string): Bookmark | undefined {
        return this.bookmarks.get(id);
    }

    public has(id: string): boolean {
        return this.bookmarks.has(id);
    }

    public getAll(): Bookmark[] {
        return Array.from(this.bookmarks.values());
    }

    public getForFile(filePath: string): Bookmark[] {
        const ids = this.fileIndex.get(filePath);
        if (!ids) {
            return [];
        }
        return Array.from(ids).map(id => this.bookmarks.get(id)!).filter(Boolean);
    }

    public add(bookmark: Bookmark): void {
        this.bookmarks.set(bookmark.id, bookmark);

        if (!this.fileIndex.has(bookmark.filePath)) {
            this.fileIndex.set(bookmark.filePath, new Set());
        }
        this.fileIndex.get(bookmark.filePath)!.add(bookmark.id);
    }

    public remove(bookmark: Bookmark): void {
        this.bookmarks.delete(bookmark.id);

        const ids = this.fileIndex.get(bookmark.filePath);
        if (ids) {
            ids.delete(bookmark.id);
            if (ids.size === 0) {
                this.fileIndex.delete(bookmark.filePath);
            }
        }
    }

    public clear(): void {
        this.bookmarks.clear();
        this.fileIndex.clear();
    }
}