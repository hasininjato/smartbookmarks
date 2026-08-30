import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { getSymbolAtPosition } from '../utils/symbols';

export class AddBookmarkCommand {
    public readonly commandId = 'smartbookmarks.addBookmark';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Aucun éditeur actif');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;

        const startLine = selection.start.line;
        const endLine = selection.end.line;

        // Récupération du symbole sur la première ligne de la sélection
        const symbol = await getSymbolAtPosition(document, selection.start);

        const lineRange = new vscode.Range(startLine, 0, startLine, 0);

        const symbolInfo = symbol ? {
            name: `${symbol.name} (Ligne ${startLine + 1})`,
            kind: symbol.kind,
            range: lineRange,
            selectionRange: lineRange
        } : {
            name: `Ligne ${startLine + 1}`,
            kind: vscode.SymbolKind.Null,
            range: lineRange,
            selectionRange: lineRange
        };

        // Si plusieurs lignes sont sélectionnées, on sauvegarde la plage complète (1re à dernière ligne)
        let highlightRange: { startLine: number; endLine: number } | undefined = undefined;
        if (endLine > startLine) {
            highlightRange = {
                startLine: startLine,
                endLine: endLine
            };
        }

        const bookmark = this.provider.toggle(symbolInfo, document.uri.fsPath, startLine, highlightRange);

        if (bookmark) {
            vscode.window.showInformationMessage(`📌 Signet ajouté : ${symbolInfo.name}`);
        } else {
            vscode.window.showInformationMessage(`🗑️ Signet supprimé (Ligne ${startLine + 1})`);
        }
    }
}