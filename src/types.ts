import * as vscode from 'vscode';

export interface Bookmark {
    id: string;
    symbolName: string;
    symbolKind: vscode.SymbolKind;
    filePath: string;
    range: vscode.Range;
    line: number;
    // Ancre textuelle pour la récupération après suppression/fusion :
    // - lineText : contenu de la ligne du signet
    // - lineTextContext : contenu de la ligne juste au-dessus, utilisé pour
    //   désambiguïser quand lineText seul correspond à plusieurs lignes du fichier
    //   (ex: du code répétitif comme deux endpoints avec une ligne identique)
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
    icon?: string; // Ex: 'bug', 'tools', ou un emoji '🐛'
    description?: string;
}