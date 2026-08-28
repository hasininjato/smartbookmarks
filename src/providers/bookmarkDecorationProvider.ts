import * as vscode from 'vscode';
import { BookmarkProvider } from './bookmarkProvider';

export class BookmarkDecorationProvider implements vscode.Disposable {
    private decorationType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];

    constructor(private provider: BookmarkProvider) {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: this.getIconPath(),
            gutterIconSize: '80%',
            overviewRulerColor: '#FFA500',
            overviewRulerLane: vscode.OverviewRulerLane.Right
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
        const decorations: vscode.DecorationOptions[] = [];

        for (const bookmark of bookmarks) {
            const lineIndex = bookmark.line - 1;

            if (lineIndex >= 0 && lineIndex < editor.document.lineCount) {
                const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
                decorations.push({
                    range,
                    hoverMessage: `📌 **${bookmark.symbolName}** (Ligne ${bookmark.line})`
                });
            }
        }

        editor.setDecorations(this.decorationType, decorations);
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.decorationType.dispose();
    }
}