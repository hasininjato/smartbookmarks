import * as vscode from 'vscode';

export interface Bookmark {
    id: string;
    symbolName: string;
    symbolKind: vscode.SymbolKind;
    filePath: string;
    range: vscode.Range;
    line: number;
    createdAt: number;
    updatedAt: number;
    highlightRange?: {
        startLine: number;
        endLine: number;
    };
}

export interface SymbolInfo {
    name: string;
    kind: vscode.SymbolKind;
    range: vscode.Range;
    selectionRange: vscode.Range;
}

export interface BookmarkGroup {
    symbolName: string;
    bookmarks: Bookmark[];
}