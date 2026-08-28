import * as vscode from 'vscode';
import { BookmarkProvider } from './bookmarkProvider';

export class BookmarkStatusBarProvider implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor(private provider: BookmarkProvider) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'smartbookmarks.listBookmarks';
        this.statusBarItem.tooltip = 'Smart Bookmarks';

        this.disposables.push(
            this.statusBarItem,
            this.provider.onDidChangeBookmarks(() => this.update()),
            vscode.window.onDidChangeActiveTextEditor(() => this.update())
        );

        this.update();
    }

    private update(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.statusBarItem.hide();
            return;
        }

        const bookmarks = this.provider.getForFile(editor.document.uri.fsPath);
        const count = bookmarks.length;

        if (count === 0) {
            this.statusBarItem.hide();
            return;
        }

        this.statusBarItem.text = `$(bookmark) ${count}`;
        this.statusBarItem.show();
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}