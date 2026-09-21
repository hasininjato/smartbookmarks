import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Bookmark } from '../types';

export class Storage {
    private filePath: string;
    private cache: Record<string, any[]> = {};
    private isCacheLoaded = false;

    constructor(context: vscode.ExtensionContext) {
        // Use globalStorageUri (recommended by VS Code)
        this.filePath = path.join(context.globalStorageUri.fsPath, 'bookmarks.json');
        this.ensureDir();
    }

    private ensureDir(): void {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            // Recursively create the global extension storage directory
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Determines the correct JSON key for a given file path.
     * - If the file is inside an open workspace folder, returns the workspace folder path.
     * - Otherwise, returns the absolute file path itself.
     */
    private getKeyForFile(filePath: string): string {
        const normalizedFilePath = path.normalize(filePath).toLowerCase();
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (workspaceFolders && workspaceFolders.length > 0) {
            for (const folder of workspaceFolders) {
                const normalizedFolder = path.normalize(folder.uri.fsPath).toLowerCase();
                // Check if the file is inside this workspace folder
                if (normalizedFilePath.startsWith(normalizedFolder + path.sep) || normalizedFilePath === normalizedFolder) {
                    return normalizedFolder;
                }
            }
        }

        // Fallback: the file itself is the key (single file mode or outside workspace)
        return normalizedFilePath;
    }

    private loadAllRaw(): Record<string, any[]> {
        // Use in-memory cache for instant read speed
        if (this.isCacheLoaded) {
            return this.cache;
        }

        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                if (data.trim()) {
                    this.cache = JSON.parse(data);
                }
            }
        } catch (error) {
            console.error('❌ SmartBookmarks loadAllRaw error:', error);
        } finally {
            this.isCacheLoaded = true;
        }

        return this.cache;
    }

    save(bookmarks: Bookmark[]): void {
        try {
            // Group all bookmarks by their correct key based on their filePath
            const newStore: Record<string, any[]> = {};

            for (const b of bookmarks) {
                const key = this.getKeyForFile(b.filePath);

                if (!newStore[key]) {
                    newStore[key] = [];
                }

                newStore[key].push({
                    ...b,
                    range: b.range ? {
                        start: { line: b.range.start.line, character: b.range.start.character },
                        end: { line: b.range.end.line, character: b.range.end.character }
                    } : null
                });
            }

            // Update cache and write to disk
            this.cache = newStore;
            this.isCacheLoaded = true;

            const data = JSON.stringify(newStore, null, 2);
            fs.writeFileSync(this.filePath, data, 'utf8');
        } catch (error) {
            console.error('❌ SmartBookmarks save error:', error);
        }
    }

    load(): Bookmark[] {
        try {
            const store = this.loadAllRaw();
            const allBookmarks: Bookmark[] = [];

            // Flatten all bookmarks from all keys (workspace folders + individual files)
            for (const key in store) {
                const rawBookmarks = store[key];

                for (const b of rawBookmarks) {
                    let range = new vscode.Range(0, 0, 0, 0);

                    if (b.range && b.range.start && b.range.end) {
                        range = new vscode.Range(
                            b.range.start.line ?? 0,
                            b.range.start.character ?? 0,
                            b.range.end.line ?? 0,
                            b.range.end.character ?? 0
                        );
                    }

                    allBookmarks.push({
                        ...b,
                        range
                    } as Bookmark);
                }
            }

            return allBookmarks;
        } catch (error) {
            console.error('❌ SmartBookmarks load error:', error);
            return [];
        }
    }
}