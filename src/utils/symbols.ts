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

    // Find the highest-level symbol (function/class) that contains the position
    const findFunctionOrClass = (items: vscode.DocumentSymbol[]): vscode.DocumentSymbol | null => {
        for (const item of items) {
            if (item.range && item.range.contains(position)) {
                // If it is a function, method, or class, take it DIRECTLY
                if (item.kind === vscode.SymbolKind.Function ||
                    item.kind === vscode.SymbolKind.Method ||
                    item.kind === vscode.SymbolKind.Class) {
                    return item;
                }
                // Otherwise, look through its children
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