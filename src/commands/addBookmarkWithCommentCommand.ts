import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { getSymbolAtPosition } from '../utils/symbols';
import { SymbolInfo } from '../types';

export class AddBookmarkWithCommentCommand {
    public readonly commandId = 'smartbookmarks.addBookmarkWithComment';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Aucun éditeur de texte actif.');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const cursorLine = selection.active.line;

        // 1. Saisie de la note
        const comment = await vscode.window.showInputBox({
            prompt: 'Entrez une note ou étiquette pour ce signet',
            placeHolder: 'Ex: FIXME: refactoriser cette boucle',
            ignoreFocusOut: true
        });

        // Si l'utilisateur annule (Echap)
        if (comment === undefined) {
            return;
        }

        // 2. Détection du range (si sélection plurilignes)
        let highlightRange: { startLine: number; endLine: number } | undefined = undefined;
        if (!selection.isEmpty && selection.start.line !== selection.end.line) {
            highlightRange = {
                startLine: selection.start.line,
                endLine: selection.end.line
            };
        }

        // 3. Récupération du symbole (renvoie SymbolInfo | null)
        const detectedSymbol = await getSymbolAtPosition(document, selection.active);

        // --- FALLBACK SI NUL : Crée un symbole générique par défaut ---
        const symbol: SymbolInfo = detectedSymbol ?? {
            name: `Ligne ${cursorLine + 1}`,
            kind: vscode.SymbolKind.File
        };

        // 4. Appel à toggle avec un SymbolInfo garanti non null
        const bookmark = this.provider.toggle(
            symbol,
            document.uri.fsPath,
            cursorLine,
            highlightRange,
            comment
        );

        if (bookmark) {
            vscode.window.setStatusBarMessage(`Signet créé avec note : "${bookmark.comment || ''}"`, 3000);
        }
    }
}