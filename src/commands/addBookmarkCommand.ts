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
        const position = editor.selection.active;

        // Récupération des infos du symbole AST sous le curseur
        const symbol = await getSymbolAtPosition(document, position);

        // On force la Range à être UNIQUEMENT la ligne active du curseur
        const lineRange = new vscode.Range(
            position.line, 0,
            position.line, 0
        );

        // commands/addBookmarkCommand.ts (dans la méthode execute)

        const symbolInfo = symbol ? {
            name: `${symbol.name} (Ligne ${position.line + 1})`, // 👈 On ajoute la ligne pour distinguer les signets d'une même fonction
            kind: symbol.kind,
            range: lineRange,
            selectionRange: lineRange
        } : {
            name: `Ligne ${position.line + 1}`,
            kind: vscode.SymbolKind.Null,
            range: lineRange,
            selectionRange: lineRange
        };

        console.log(position.line);
        const bookmark = this.provider.toggle(symbolInfo, document.uri.fsPath, position.line);

        if (bookmark) {
            vscode.window.showInformationMessage(`📌 Signet ajouté : ${symbolInfo.name} (Ligne ${position.line + 1})`);
        } else {
            vscode.window.showInformationMessage(`🗑️ Signet supprimé (Ligne ${position.line + 1})`);
        }
    }
}