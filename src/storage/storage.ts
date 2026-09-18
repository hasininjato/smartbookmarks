import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Bookmark } from '../types';

export class Storage {
    private filePath: string;

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

    save(bookmarks: Bookmark[]): void {
        try {
            this.ensureDir();

            // Proper serialization of VS Code objects (Range, Position)
            const serialized = bookmarks.map(b => ({
                ...b,
                range: b.range ? {
                    start: { line: b.range.start.line, character: b.range.start.character },
                    end: { line: b.range.end.line, character: b.range.end.character }
                } : null
            }));

            const data = JSON.stringify(serialized, null, 2);
            fs.writeFileSync(this.filePath, data, 'utf8');
        } catch (error) {
            console.error('❌ SmartBookmarks save error:', error);
        }
    }

    load(): Bookmark[] {
        try {
            if (!fs.existsSync(this.filePath)) {
                return [];
            }

            const data = fs.readFileSync(this.filePath, 'utf8');
            if (!data.trim()) {
                return [];
            }

            const parsed = JSON.parse(data);

            // Safely reconstruct vscode.Range types
            return parsed.map((b: any) => {
                let range = new vscode.Range(0, 0, 0, 0);

                if (b.range && b.range.start && b.range.end) {
                    range = new vscode.Range(
                        b.range.start.line ?? 0,
                        b.range.start.character ?? 0,
                        b.range.end.line ?? 0,
                        b.range.end.character ?? 0
                    );
                }

                return {
                    ...b,
                    range
                };
            });
        } catch (error) {
            console.error('❌ SmartBookmarks load error:', error);
            return [];
        }
    }
}