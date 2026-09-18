import * as vscode from 'vscode';
import { BookmarkProvider } from './bookmarkProvider';
import { SymbolInfo } from '../types';

export class SymbolTracker implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private timeout: NodeJS.Timeout | undefined;

    constructor(private provider: BookmarkProvider) {
        this.start();
    }

    start(): void {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                this.scheduleUpdate(event.document);
            })
        );
    }

    private scheduleUpdate(document: vscode.TextDocument): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            this.updateBookmarks(document);
        }, 300);
    }

    private async updateBookmarks(document: vscode.TextDocument): Promise<void> {
        const bookmarks = this.provider.getForFile(document.uri.fsPath);
        if (bookmarks.length === 0) { return; }

        const symbols = await this.getSymbols(document);

        for (const bookmark of bookmarks) {
            const symbol = symbols.find(s => s.name === bookmark.symbolName);
            // FIX: check that symbol and symbol.range exist
            if (symbol && symbol.range && bookmark.range) {
                if (!symbol.range.isEqual(bookmark.range)) {
                    this.provider.updatePosition(bookmark.id, symbol.range);
                }
            }
        }
    }

    private async getSymbols(doc: vscode.TextDocument): Promise<SymbolInfo[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                doc.uri
            );

            if (!symbols) { return []; }

            const result: SymbolInfo[] = [];

            const flatten = (items: vscode.DocumentSymbol[]) => {
                for (const item of items) {
                    // FIX: check that item.range exists
                    if (item.range) {
                        result.push({
                            name: item.name || vscode.l10n.t('Unknown'),
                            kind: item.kind || 0,
                            range: item.range,
                            selectionRange: item.selectionRange || item.range
                        });
                    }
                    if (item.children) { flatten(item.children); }
                }
            };

            flatten(symbols);
            return result;
        } catch {
            return [];
        }
    }

    dispose(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.disposables.forEach(d => d.dispose());
    }
}