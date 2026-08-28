import * as vscode from 'vscode';
import { SymbolInfo } from '../types';

export async function getSymbolAtPosition(
    doc: vscode.TextDocument,
    position: vscode.Position
): Promise<SymbolInfo | null> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        doc.uri
    );

    if (!symbols || symbols.length === 0) {
        return null;
    }

    // Trouve le symbole le plus haut niveau (fonction/classe) qui contient la position
    const findFunctionOrClass = (items: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
        for (const item of items) {
            if (item.range && item.range.contains(position)) {
                // Si c'est une fonction, méthode ou classe, on le prend DIRECTEMENT
                if (item.kind === vscode.SymbolKind.Function ||
                    item.kind === vscode.SymbolKind.Method ||
                    item.kind === vscode.SymbolKind.Class) {
                    return item;
                }
                // Sinon on regarde dans ses enfants
                if (item.children && item.children.length > 0) {
                    const found = findFunctionOrClass(item.children);
                    if (found) { return found; }
                }
            }
        }
        return null;
    };

    const symbol = findFunctionOrClass(symbols);
    if (!symbol) {
        return null;
    }

    if (!symbol.range) {
        return null;
    }

    return {
        name: symbol.name,
        kind: symbol.kind,
        range: symbol.range,
        selectionRange: symbol.selectionRange || symbol.range
    };
}