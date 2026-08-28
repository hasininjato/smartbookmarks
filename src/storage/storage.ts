import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Bookmark } from '../types';

export class Storage {
    private filePath: string;

    constructor(context: vscode.ExtensionContext) {
        // Utilisation de globalStorageUri (recommandé par VS Code)
        this.filePath = path.join(context.globalStorageUri.fsPath, 'bookmarks.json');
        this.ensureDir();
    }

    private ensureDir(): void {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            // Crée le dossier d'extension global de manière récursive
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    save(bookmarks: Bookmark[]): void {
        try {
            this.ensureDir();

            // Sérialisation propre des objets VS Code (Range, Position)
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
            console.error('❌ Erreur de sauvegarde SmartBookmarks:', error);
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

            // Reconstitution sécurisée des types vscode.Range
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
            console.error('❌ Erreur de chargement SmartBookmarks:', error);
            return [];
        }
    }
}