import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { BookmarkTagConfig, SymbolInfo } from '../types';
import { getSymbolAtPosition } from '../utils/symbols';

// Palette d'icônes prédéfinies avec prévisualisation directe
const PRESET_ICONS = [
    { label: '$(bug) bug', description: 'Dysfonctionnement / Bug' },
    { label: '$(tools) tools', description: 'Outillage / Refactoring' },
    { label: '$(shield) shield', description: 'Sécurité' },
    { label: '$(zap) zap', description: 'Performance / Optimisation' },
    { label: '$(star) star', description: 'Important / Favori' },
    { label: '$(alert) alert', description: 'Avertissement' },
    { label: '$(notebook) notebook', description: 'Note d\'information' },
    { label: '$(checklist) checklist', description: 'Tâche / TODO' },
    { label: '$(eye) eye', description: 'À relire / Review' },
    { label: '$(flame) flame', description: 'Urgent' },
    { label: '$(bookmark) bookmark', description: 'Signet standard' },
    { label: '$(heart) heart', description: 'Coup de cœur' }
];

export class AddBookmarkWithCommentCommand {
    public readonly commandId = 'smartbookmarks.addBookmarkWithComment';

    constructor(private provider: BookmarkProvider) { }

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Aucun éditeur de texte actif.');
            return;
        }

        // 1. Récupération des tags enregistrés
        const config = vscode.workspace.getConfiguration('smartbookmarks');
        let userTags = config.get<BookmarkTagConfig[]>('tags') || [];

        const quickPickItems: vscode.QuickPickItem[] = userTags.map(tag => {
            const iconPrefix = tag.icon ? (tag.icon.startsWith('$(') ? tag.icon : `$(${tag.icon})`) : '$(tag)';
            return {
                label: `${iconPrefix} ${tag.label}`,
                description: tag.description
            };
        });

        quickPickItems.push({
            label: '$(add) ➕ Créer un nouveau tag...',
            description: 'Ajouter un tag personnalisé avec choix visuel d\'icône'
        });

        const selectedTagItem = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Sélectionnez ou créez un tag pour ce signet',
            ignoreFocusOut: true
        });

        if (!selectedTagItem) { return; };

        let selectedTagLabel = '';

        // 2. Création d'un nouveau Tag avec sélection d'icône visuelle
        if (selectedTagItem.label.includes('Créer un nouveau tag...')) {
            const newTagName = await vscode.window.showInputBox({
                prompt: 'Nom du nouveau tag (ex: SECURITY, OPTIM, REFAC)',
                placeHolder: 'SECURITY',
                ignoreFocusOut: true
            });

            if (!newTagName) { return; };

            const iconChoice = await vscode.window.showQuickPick(PRESET_ICONS, {
                placeHolder: 'Choisissez une icône dans la liste visuelle',
                ignoreFocusOut: true
            });

            const selectedIcon = iconChoice
                ? iconChoice.label.replace(/^\$\((.*?)\).*/, '$1')
                : 'tag';

            const newTagDesc = await vscode.window.showInputBox({
                prompt: 'Description optionnelle',
                placeHolder: 'Remarque relative à la sécurité',
                ignoreFocusOut: true
            });

            const newTagObj: BookmarkTagConfig = {
                label: newTagName.trim().toUpperCase(),
                icon: selectedIcon,
                description: newTagDesc?.trim() || ''
            };

            userTags.push(newTagObj);
            await config.update('tags', userTags, vscode.ConfigurationTarget.Global);

            selectedTagLabel = newTagObj.label;
            vscode.window.showInformationMessage(`Tag "${newTagObj.label}" enregistré avec l'icône "${selectedIcon}" !`);
        } else {
            selectedTagLabel = selectedTagItem.label.replace(/^\$\(.*?\)\s*/, '').trim();
        }

        // 3. Titre du signet
        const title = await vscode.window.showInputBox({
            prompt: 'Entrez un titre pour ce signet',
            placeHolder: 'Ex: Vérification des droits d\'accès',
            ignoreFocusOut: true
        });

        if (title === undefined) { return; };

        // 4. Saisie multi-lignes interactive pour le commentaire
        const comment = await this.askMultilineComment();
        if (comment === undefined) { return; };

        // 5. Récupération des données du code et création du signet
        const document = editor.document;
        const selection = editor.selection;
        const cursorLine = selection.active.line;

        let highlightRange: { startLine: number; endLine: number } | undefined = undefined;
        if (!selection.isEmpty && selection.start.line !== selection.end.line) {
            highlightRange = {
                startLine: selection.start.line,
                endLine: selection.end.line
            };
        }

        const detectedSymbol = await getSymbolAtPosition(document, selection.active);
        const lineRange = new vscode.Range(cursorLine, 0, cursorLine, 0);
        const symbol: SymbolInfo = detectedSymbol ?? {
            name: `Ligne ${cursorLine + 1}`,
            kind: vscode.SymbolKind.File,
            range: lineRange,
            selectionRange: lineRange
        };

        this.provider.toggle(
            symbol,
            document.uri.fsPath,
            cursorLine,
            highlightRange,
            comment,
            selectedTagLabel,
            title
        );
    }

    private async askMultilineComment(): Promise<string | undefined> {
        const lines: string[] = [];
        let adding = true;

        while (adding) {
            const preview = lines.length > 0
                ? ` (Texte actuel: "${lines.join(' \\n ')}")`
                : '';

            const lineInput = await vscode.window.showInputBox({
                prompt: lines.length === 0
                    ? 'Saisissez la première ligne de votre commentaire'
                    : `Saisissez la ligne ${lines.length + 1}${preview}`,
                placeHolder: lines.length === 0 ? 'Ex: Vérifier le token JWT' : 'Laissez vide et validez pour terminer',
                ignoreFocusOut: true
            });

            if (lineInput === undefined) {
                return lines.length > 0 ? lines.join('\n') : undefined;
            }

            if (lineInput.trim() === '') {
                adding = false;
            } else {
                lines.push(lineInput);

                const choice = await vscode.window.showQuickPick([
                    { label: '$(check) ✅ Terminer et enregistrer', action: 'done' },
                    { label: '$(add) ➕ Ajouter une autre ligne', action: 'add' }
                ], {
                    placeHolder: `Ligne ${lines.length} ajoutée. Continuer ?`,
                    ignoreFocusOut: true
                });

                if (!choice || choice.action === 'done') {
                    adding = false;
                }
            }
        }

        return lines.join('\n');
    }
}