import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { BookmarkTagConfig, SymbolInfo } from '../types';
import { getSymbolAtPosition } from '../utils/symbols';

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

interface TagQuickPickItem extends vscode.QuickPickItem {
    rawTag?: BookmarkTagConfig;
    isCreateAction?: boolean;
}

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
        const filePath = document.uri.fsPath;
        const selection = editor.selection;
        const startLine = selection.start.line;
        const endLine = selection.end.line;

        const detectedSymbol = await getSymbolAtPosition(document, selection.start);
        const lineRange = new vscode.Range(startLine, 0, startLine, 0);

        const symbol: SymbolInfo = detectedSymbol ? {
            name: `${detectedSymbol.name} (Ligne ${startLine + 1})`,
            kind: detectedSymbol.kind,
            range: lineRange,
            selectionRange: lineRange
        } : {
            name: `Ligne ${startLine + 1}`,
            kind: vscode.SymbolKind.Null,
            range: lineRange,
            selectionRange: lineRange
        };

        let highlightRange: { startLine: number; endLine: number } | undefined = undefined;
        if (endLine > startLine) {
            highlightRange = {
                startLine: startLine,
                endLine: endLine
            };
        }

        // 1. Sélection ou Suppression de Tag via QuickPick interactif
        const selectedTagItem = await this.showTagQuickPickWithDelete();

        if (!selectedTagItem) { return; }

        let selectedTagLabel: string | undefined = undefined;

        if (selectedTagItem.isCreateAction) {
            const rawTagName = await vscode.window.showInputBox({
                prompt: 'Nom du nouveau tag (ex: SECURITY, OPTIM, REFAC)',
                placeHolder: 'SECURITY',
                ignoreFocusOut: true
            });

            if (!rawTagName || rawTagName.trim() === '') { return; }

            // Conversion forcée en MAJUSCULES
            const formattedTagName = rawTagName.trim().toUpperCase();

            const config = vscode.workspace.getConfiguration('smartbookmarks');
            let userTags = config.get<BookmarkTagConfig[]>('tags') || [];

            // VÉRIFICATION D'EXISTENCE
            const existingTag = userTags.find(t => t.label.toUpperCase() === formattedTagName);

            if (existingTag) {
                vscode.window.showInformationMessage(`Le tag "${formattedTagName}" existe déjà. Il a été sélectionné.`);
                selectedTagLabel = existingTag.label;
            } else {
                // S'il n'existe pas, on demande l'icône et on le crée
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
                    label: formattedTagName,
                    icon: selectedIcon,
                    description: newTagDesc?.trim() || ''
                };

                userTags.push(newTagObj);
                await config.update('tags', userTags, vscode.ConfigurationTarget.Global);

                selectedTagLabel = newTagObj.label;
            }
        } else if (selectedTagItem.rawTag) {
            selectedTagLabel = selectedTagItem.rawTag.label.toUpperCase();
        }

        // 2. Saisie du titre
        const rawTitle = await vscode.window.showInputBox({
            prompt: 'Entrez un titre pour ce signet',
            placeHolder: 'Ex: Vérification des droits d\'accès',
            ignoreFocusOut: true
        });

        if (rawTitle === undefined) { return; }
        const cleanTitle = rawTitle.trim().length > 0 ? rawTitle.trim() : undefined;

        // 3. Saisie du commentaire
        const rawComment = await this.askMultilineComment();
        const cleanComment = rawComment && rawComment.trim().length > 0 ? rawComment.trim() : undefined;

        // 4. Envoi au BookmarkProvider
        this.provider.toggle(
            symbol,
            filePath,
            startLine,
            highlightRange,
            cleanComment,
            selectedTagLabel,
            cleanTitle
        );
    }

    private showTagQuickPickWithDelete(): Promise<TagQuickPickItem | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick<TagQuickPickItem>();
            quickPick.placeholder = 'Sélectionnez ou créez un tag pour ce signet';
            quickPick.ignoreFocusOut = true;

            const updateItems = () => {
                const config = vscode.workspace.getConfiguration('smartbookmarks');
                const userTags = config.get<BookmarkTagConfig[]>('tags') || [];

                const items: TagQuickPickItem[] = userTags.map(tag => {
                    const iconPrefix = tag.icon ? (tag.icon.startsWith('$(') ? tag.icon : `$(${tag.icon})`) : '$(tag)';
                    return {
                        label: `${iconPrefix} ${tag.label.toUpperCase()}`,
                        description: tag.description,
                        rawTag: tag,
                        buttons: [{
                            iconPath: new vscode.ThemeIcon('trash'),
                            tooltip: `Supprimer le tag "${tag.label.toUpperCase()}"`
                        }]
                    };
                });

                items.push({
                    label: '$(add) ➕ Créer un nouveau tag...',
                    description: 'Ajouter un tag personnalisé avec choix visuel d\'icône',
                    isCreateAction: true
                });

                quickPick.items = items;
            };

            updateItems();

            quickPick.onDidTriggerItemButton(async (e) => {
                const tagToDelete = e.item.rawTag;
                if (!tagToDelete) { return; }

                const confirm = await vscode.window.showWarningMessage(
                    `Voulez-vous vraiment supprimer le tag "${tagToDelete.label.toUpperCase()}" ?`,
                    { modal: true },
                    'Supprimer'
                );

                if (confirm === 'Supprimer') {
                    const config = vscode.workspace.getConfiguration('smartbookmarks');
                    let userTags = config.get<BookmarkTagConfig[]>('tags') || [];
                    userTags = userTags.filter(t => t.label.toUpperCase() !== tagToDelete.label.toUpperCase());
                    await config.update('tags', userTags, vscode.ConfigurationTarget.Global);

                    vscode.window.showInformationMessage(`Tag "${tagToDelete.label.toUpperCase()}" supprimé.`);
                    updateItems();
                }
            });

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                quickPick.hide();
                resolve(selected);
            });

            quickPick.onDidHide(() => {
                resolve(undefined);
                quickPick.dispose();
            });

            quickPick.show();
        });
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

        return lines.length > 0 ? lines.join('\n') : undefined;
    }
}