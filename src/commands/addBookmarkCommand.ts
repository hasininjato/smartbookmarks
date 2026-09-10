import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { getSymbolAtPosition } from '../utils/symbols';

export class AddBookmarkCommand {
    public readonly commandId = 'smartbookmarks.addBookmark';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(vscode.l10n.t('No active editor'));
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
            name: `${symbol.name} (${vscode.l10n.t('Line {0}', startLine + 1)})`,
            kind: symbol.kind,
            range: lineRange,
            selectionRange: lineRange
        } : {
            name: vscode.l10n.t('Line {0}', startLine + 1),
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

        // Ancre textuelle : contenu de la ligne au moment de la création du signet
        const lineText = document.lineAt(startLine).text;

        // Contexte de désambiguïsation : contenu de la ligne juste au-dessus
        const lineTextContext = startLine > 0 ? document.lineAt(startLine - 1).text : undefined;

        const bookmark = this.provider.toggle(
            symbolInfo,
            document.uri.fsPath,
            startLine,
            lineText,
            lineTextContext,
            highlightRange
        );

        if (bookmark) {
            vscode.window.showInformationMessage(vscode.l10n.t('📌 Bookmark added: {0}', symbolInfo.name));
        } else {
            vscode.window.showInformationMessage(vscode.l10n.t('🗑️ Bookmark removed (Line {0})', startLine + 1));
        }
    }
}