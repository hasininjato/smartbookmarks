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
    createdDateFormatted?: string;
    author?: string;
    comment?: string;
    tag?: string;
    title?: string;
}

export interface SymbolInfo {
    name: string;
    kind: vscode.SymbolKind;
    range?: vscode.Range;
    selectionRange?: vscode.Range;
}

export interface BookmarkGroup {
    symbolName: string;
    bookmarks: Bookmark[];
}

export interface BookmarkTagConfig {
    label: string;
    icon?: string; // Ex: 'bug', 'tools', ou un emoji '🐛'
    description?: string;
}