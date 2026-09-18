import * as vscode from 'vscode';

export interface Bookmark {
    id: string;
    symbolName: string;
    symbolKind: vscode.SymbolKind;
    filePath: string;
    range: vscode.Range;
    line: number;
    // Text anchor used for recovery after deletion/merging:
    // - lineText: content of the bookmarked line
    // - lineTextContext: content of the line immediately above, used to
    //   disambiguate when lineText alone matches multiple lines in the file
    //   (e.g. repetitive code such as two endpoints with an identical line)
    lineText?: string;
    lineTextContext?: string;
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
    icon?: string; // E.g. 'bug', 'tools', or an emoji '🐛'
    description?: string;
}