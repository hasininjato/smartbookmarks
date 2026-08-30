import * as vscode from 'vscode';
import { BookmarkProvider } from './bookmarkProvider';

export class BookmarkDecorationProvider implements vscode.Disposable {
    // 1. Icône de la 1re ligne dans la marge de gauche
    private gutterDecorationType: vscode.TextEditorDecorationType;

    // 2. Ligne verticale à GAUCHE (dans la marge / à côté des numéros de lignes)
    private leftBorderDecorationType: vscode.TextEditorDecorationType;

    private disposables: vscode.Disposable[] = [];

    constructor(private provider: BookmarkProvider) {
        // Icône bleue sur la première ligne
        this.gutterDecorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: this.getIconPath(),
            gutterIconSize: '80%',
            overviewRulerColor: '#2196F3',
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        // Barre verticale bleue collée à gauche de la ligne (à côté des numéros)
        this.leftBorderDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            borderWidth: '0 0 0 4px', // Épaisseur de 4px uniquement à gauche
            borderStyle: 'solid',
            borderColor: '#A855F7'    // Mêrme bleu que l'icône
        });

        this.disposables.push(
            this.provider.onDidChangeBookmarks(() => this.updateDecorations()),
            vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations()),
            vscode.workspace.onDidChangeTextDocument((e) => {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor && e.document === activeEditor.document) {
                    this.updateDecorations();
                }
            })
        );

        this.updateDecorations();
    }

    private getIconPath(): vscode.Uri {
        return vscode.Uri.parse(
            'data:image/svg+xml;utf8,' +
            encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="#2196F3">
        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
    </svg>`)
        );
    }

    public updateDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const bookmarks = this.provider.getForFile(editor.document.uri.fsPath);

        const gutterDecorations: vscode.DecorationOptions[] = [];
        const leftBorderRanges: vscode.Range[] = [];

        for (const bookmark of bookmarks) {
            const lineIndex = bookmark.line - 1;

            if (lineIndex >= 0 && lineIndex < editor.document.lineCount) {
                // A. Icône sur la 1re ligne
                const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
                gutterDecorations.push({
                    range,
                    hoverMessage: `📌 **${bookmark.symbolName}** (Ligne ${bookmark.line})`
                });

                // B. Barre verticale à gauche sur toute la sélection (1re à dernière ligne)
                if (bookmark.highlightRange) {
                    leftBorderRanges.push(new vscode.Range(
                        bookmark.highlightRange.startLine, 0,
                        bookmark.highlightRange.endLine, 0
                    ));
                }
            }
        }

        editor.setDecorations(this.gutterDecorationType, gutterDecorations);
        editor.setDecorations(this.leftBorderDecorationType, leftBorderRanges);
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.gutterDecorationType.dispose();
        this.leftBorderDecorationType.dispose();
    }
}