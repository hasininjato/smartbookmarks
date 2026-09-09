import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { Bookmark, BookmarkTagConfig, SymbolInfo } from '../types';
import { getSymbolAtPosition } from '../utils/symbols';
import { EXTENDED_PRESET_ICONS } from '../utils/codicon';

interface TagQuickPickItem extends vscode.QuickPickItem {
    rawTag?: BookmarkTagConfig;
    isCreateAction?: boolean;
    isNoTagAction?: boolean;
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

        // 0. Vérification si un signet existe déjà sur cette ligne
        const existingBookmark: Bookmark | undefined = this.provider.getBookmark(filePath, startLine);
        const isEditing = !!existingBookmark;

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

        let highlightRange: { startLine: number; endLine: number } | undefined = existingBookmark?.highlightRange;
        if (endLine > startLine) {
            highlightRange = {
                startLine: startLine,
                endLine: endLine
            };
        }

        const lineText = document.lineAt(startLine).text;
        const lineTextContext = startLine > 0 ? document.lineAt(startLine - 1).text : undefined;

        // 1. Sélection / Modification / Suppression du Tag
        const selectedTagItem = await this.showTagQuickPickWithDelete(existingBookmark?.tag);
        if (!selectedTagItem) { return; }

        let selectedTagLabel: string | undefined = undefined;

        if (selectedTagItem.isNoTagAction) {
            // Option "Aucun tag" sélectionnée
            selectedTagLabel = undefined;
        } else if (selectedTagItem.isCreateAction) {
            // Création d'un nouveau tag
            const rawTagName = await vscode.window.showInputBox({
                prompt: 'Nom du nouveau tag (ex: SECURITY, OPTIM, REFAC)',
                placeHolder: 'SECURITY',
                ignoreFocusOut: true
            });

            if (!rawTagName || rawTagName.trim() === '') { return; }

            const formattedTagName = rawTagName.trim().toUpperCase();
            const config = vscode.workspace.getConfiguration('smartbookmarks');
            let userTags = config.get<BookmarkTagConfig[]>('tags') || [];

            const existingTag = userTags.find(t => t.label.toUpperCase() === formattedTagName);

            if (existingTag) {
                vscode.window.showInformationMessage(`Le tag "${formattedTagName}" existe déjà. Il a été sélectionné.`);
                selectedTagLabel = existingTag.label;
            } else {
                const selectedIcon = await this.showIconPicker();
                if (!selectedIcon) { return; }

                const newTagDesc = await vscode.window.showInputBox({
                    prompt: 'Description optionnelle du tag',
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

        // 2. Titre (Pré-rempli si édition)
        const rawTitle = await vscode.window.showInputBox({
            prompt: isEditing ? 'Modifier le titre du signet' : 'Entrez un titre pour ce signet',
            value: existingBookmark?.title || '',
            placeHolder: 'Ex: Vérification des droits d\'accès',
            ignoreFocusOut: true
        });

        if (rawTitle === undefined) { return; }
        const cleanTitle = rawTitle.trim().length > 0 ? rawTitle.trim() : undefined;

        // 3. Commentaire (Pré-rempli si édition)
        const rawComment = await this.askMultilineComment(existingBookmark?.comment);
        if (rawComment === false) { return; } // Action annulée par l'utilisateur
        const cleanComment = rawComment && rawComment.trim().length > 0 ? rawComment.trim() : undefined;

        // 4. Envoi au Provider (Ajout ou Mise à jour)
        if (isEditing) {
            this.provider.updateBookmark(filePath, startLine, {
                symbol,
                title: cleanTitle,
                comment: cleanComment,
                tag: selectedTagLabel, // Mise à jour du tag (peut être redéfini ou mis à undefined)
                highlightRange
            });
            vscode.window.showInformationMessage(`Signet mis à jour à la ligne ${startLine + 1}.`);
        } else {
            this.provider.toggle(
                symbol,
                filePath,
                startLine,
                lineText,
                lineTextContext,
                highlightRange,
                cleanComment,
                selectedTagLabel,
                cleanTitle
            );
        }
    }

    private async showIconPicker(): Promise<string | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = 'Recherchez une icône (ex: bug, shield, zap, cloud...)';
            quickPick.ignoreFocusOut = true;

            const baseItems: vscode.QuickPickItem[] = EXTENDED_PRESET_ICONS.map(i => ({
                label: i.label,
                description: i.description
            }));

            quickPick.items = baseItems;

            quickPick.onDidChangeValue((value) => {
                const search = value.trim().toLowerCase();
                if (search.length === 0) {
                    quickPick.items = baseItems;
                    return;
                }

                const filtered = baseItems.filter(item =>
                    item.label.toLowerCase().includes(search) ||
                    (item.description && item.description.toLowerCase().includes(search))
                );

                if (filtered.length === 0) {
                    quickPick.items = [{
                        label: `$(${search}) ${search}`,
                        description: `Utiliser l'icône Codicon "$(${search})"`
                    }];
                } else {
                    quickPick.items = filtered;
                }
            });

            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected) {
                    const iconName = selected.label.replace(/^\$\((.*?)\).*/, '$1');
                    quickPick.hide();
                    resolve(iconName);
                }
            });

            quickPick.onDidHide(() => {
                resolve(undefined);
                quickPick.dispose();
            });

            quickPick.show();
        });
    }

    private showTagQuickPickWithDelete(currentTagLabel?: string): Promise<TagQuickPickItem | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick<TagQuickPickItem>();
            quickPick.placeholder = currentTagLabel
                ? `Tag actuel : ${currentTagLabel.toUpperCase()} (Sélectionnez pour changer)`
                : 'Sélectionnez ou créez un tag pour ce signet';
            quickPick.ignoreFocusOut = true;

            const updateItems = () => {
                const config = vscode.workspace.getConfiguration('smartbookmarks');
                const userTags = config.get<BookmarkTagConfig[]>('tags') || [];

                const items: TagQuickPickItem[] = [];

                // Option pour retirer/ne pas mettre de tag
                items.push({
                    label: '$(circle-slash) Aucun tag',
                    description: 'Ne pas utiliser de tag pour ce signet',
                    isNoTagAction: true
                });

                // Liste des tags configurés
                const tagItems: TagQuickPickItem[] = userTags.map(tag => {
                    const isCurrent = currentTagLabel?.toUpperCase() === tag.label.toUpperCase();
                    const iconPrefix = tag.icon ? (tag.icon.startsWith('$(') ? tag.icon : `$(${tag.icon})`) : '$(tag)';
                    return {
                        label: `${iconPrefix} ${tag.label.toUpperCase()}${isCurrent ? ' (Actuel)' : ''}`,
                        description: tag.description,
                        rawTag: tag,
                        buttons: [{
                            iconPath: new vscode.ThemeIcon('trash'),
                            tooltip: `Supprimer le tag "${tag.label.toUpperCase()}"`
                        }]
                    };
                });

                items.push(...tagItems);

                // Option pour créer un nouveau tag
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

    private async askMultilineComment(existingComment?: string): Promise<string | undefined | false> {
        if (existingComment) {
            const action = await vscode.window.showQuickPick([
                { label: '$(check) Conserver le commentaire actuel', action: 'keep', description: existingComment.replace(/\n/g, ' \\ ') },
                { label: '$(edit) Réécrire / Modifier le commentaire', action: 'edit' },
                { label: '$(trash) Effacer le commentaire', action: 'clear' }
            ], {
                placeHolder: 'Commentaire existant détecté',
                ignoreFocusOut: true
            });

            if (!action) { return false; } // Annulé
            if (action.action === 'keep') { return existingComment; }
            if (action.action === 'clear') { return undefined; }
        }

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