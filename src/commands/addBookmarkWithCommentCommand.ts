import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { Bookmark, BookmarkTagConfig, SymbolInfo } from '../types';
import { getSymbolAtPosition } from '../utils/symbols';
import { getExtendedPresetIcons } from '../utils/codicon';

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
            vscode.window.showWarningMessage(vscode.l10n.t('No active text editor.'));
            return;
        }

        const document = editor.document;
        const filePath = document.uri.fsPath;
        const selection = editor.selection;
        const startLine = selection.start.line;
        const endLine = selection.end.line;

        // 0. Vérification si un signet existe déjà
        const existingBookmark: Bookmark | undefined = this.provider.getBookmark(filePath, startLine);
        const isEditing = !!existingBookmark;

        const detectedSymbol = await getSymbolAtPosition(document, selection.start);
        const lineRange = new vscode.Range(startLine, 0, startLine, 0);

        const symbol: SymbolInfo = detectedSymbol ? {
            name: `${detectedSymbol.name} (${vscode.l10n.t('Line {0}', startLine + 1)})`,
            kind: detectedSymbol.kind,
            range: lineRange,
            selectionRange: lineRange
        } : {
            name: vscode.l10n.t('Line {0}', startLine + 1),
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

        // 1. Sélection / Édition / Suppression du Tag
        const selectedTagItem = await this.showTagQuickPickWithActions(existingBookmark?.tag);
        if (!selectedTagItem) { return; }

        let selectedTagLabel: string | undefined = undefined;

        if (selectedTagItem.isNoTagAction) {
            selectedTagLabel = undefined;
        } else if (selectedTagItem.isCreateAction) {
            const rawTagName = await vscode.window.showInputBox({
                prompt: vscode.l10n.t('New tag name (e.g. SECURITY, OPTIM, REFAC)'),
                placeHolder: 'SECURITY',
                ignoreFocusOut: true
            });

            if (!rawTagName || rawTagName.trim() === '') { return; }

            const formattedTagName = rawTagName.trim().toUpperCase();
            const config = vscode.workspace.getConfiguration('smartbookmarks');
            let userTags = config.get<BookmarkTagConfig[]>('tags') || [];

            const existingTag = userTags.find(t => t.label.toUpperCase() === formattedTagName);

            if (existingTag) {
                vscode.window.showInformationMessage(vscode.l10n.t('Tag "{0}" already exists. It has been selected.', formattedTagName));
                selectedTagLabel = existingTag.label;
            } else {
                const selectedIcon = await this.showIconPicker();
                if (!selectedIcon) { return; }

                const newTagDesc = await vscode.window.showInputBox({
                    prompt: vscode.l10n.t('Optional tag description'),
                    placeHolder: vscode.l10n.t('Security note'),
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

        // 2. Titre
        const rawTitle = await vscode.window.showInputBox({
            prompt: isEditing ? vscode.l10n.t('Edit bookmark title') : vscode.l10n.t('Enter a title for this bookmark'),
            value: existingBookmark?.title || '',
            placeHolder: vscode.l10n.t('E.g. Access rights check'),
            ignoreFocusOut: true
        });

        if (rawTitle === undefined) { return; }
        const cleanTitle = rawTitle.trim().length > 0 ? rawTitle.trim() : undefined;

        // 3. Commentaire
        const rawComment = await this.askMultilineComment(existingBookmark?.comment);
        if (rawComment === false) { return; }
        const cleanComment = rawComment && rawComment.trim().length > 0 ? rawComment.trim() : undefined;

        // 4. Sauvegarde
        if (isEditing) {
            this.provider.updateBookmark(filePath, startLine, {
                symbol,
                title: cleanTitle,
                comment: cleanComment,
                tag: selectedTagLabel,
                highlightRange
            });
            vscode.window.showInformationMessage(vscode.l10n.t('Bookmark updated at line {0}.', startLine + 1));
        } else {
            const bookmark = this.provider.toggle(
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

            if (bookmark) {
                vscode.window.showInformationMessage(vscode.l10n.t('📌 Bookmark added: {0}', symbol.name));
            } else {
                vscode.window.showInformationMessage(vscode.l10n.t('🗑️ Bookmark removed (Line {0})', startLine + 1));
            }
        }
    }

    private showTagQuickPickWithActions(currentTagLabel?: string): Promise<TagQuickPickItem | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick<TagQuickPickItem>();
            quickPick.placeholder = currentTagLabel
                ? vscode.l10n.t('Current tag: {0} (Select to change)', currentTagLabel.toUpperCase())
                : vscode.l10n.t('Select, create or edit a tag');
            quickPick.ignoreFocusOut = true;

            const updateItems = () => {
                const config = vscode.workspace.getConfiguration('smartbookmarks');
                const userTags = config.get<BookmarkTagConfig[]>('tags') || [];

                const items: TagQuickPickItem[] = [];

                items.push({
                    label: `$(circle-slash) ${vscode.l10n.t('No tag')}`,
                    description: vscode.l10n.t('Do not use a tag for this bookmark'),
                    isNoTagAction: true
                });

                const tagItems: TagQuickPickItem[] = userTags.map(tag => {
                    const isCurrent = currentTagLabel?.toUpperCase() === tag.label.toUpperCase();
                    const iconPrefix = tag.icon ? (tag.icon.startsWith('$(') ? tag.icon : `$(${tag.icon})`) : '$(tag)';
                    const tagLabel = isCurrent
                        ? vscode.l10n.t('{0} (Current)', tag.label.toUpperCase())
                        : tag.label.toUpperCase();
                    return {
                        label: `${iconPrefix} ${tagLabel}`,
                        description: tag.description,
                        rawTag: tag,
                        buttons: [
                            {
                                iconPath: new vscode.ThemeIcon('edit'),
                                tooltip: vscode.l10n.t('Edit tag "{0}"', tag.label.toUpperCase())
                            },
                            {
                                iconPath: new vscode.ThemeIcon('trash'),
                                tooltip: vscode.l10n.t('Delete tag "{0}"', tag.label.toUpperCase())
                            }
                        ]
                    };
                });

                items.push(...tagItems);

                items.push({
                    label: `$(add) ➕ ${vscode.l10n.t('Create a new tag...')}`,
                    description: vscode.l10n.t('Add a custom tag with visual icon selection'),
                    isCreateAction: true
                });

                quickPick.items = items;
            };

            updateItems();

            // Gestion des clics sur les boutons des items (Éditer ou Supprimer)
            quickPick.onDidTriggerItemButton(async (e) => {
                const tag = e.item.rawTag;
                if (!tag) { return; }

                const iconId = (e.button.iconPath as vscode.ThemeIcon).id;

                if (iconId === 'trash') {
                    // --- SUPPRESSION ---
                    const deleteLabel = vscode.l10n.t('Delete');
                    const confirm = await vscode.window.showWarningMessage(
                        vscode.l10n.t('Are you sure you want to delete the tag "{0}"?', tag.label.toUpperCase()),
                        { modal: true },
                        deleteLabel
                    );

                    if (confirm === deleteLabel) {
                        const config = vscode.workspace.getConfiguration('smartbookmarks');
                        let userTags = config.get<BookmarkTagConfig[]>('tags') || [];
                        userTags = userTags.filter(t => t.label.toUpperCase() !== tag.label.toUpperCase());
                        await config.update('tags', userTags, vscode.ConfigurationTarget.Global);

                        vscode.window.showInformationMessage(vscode.l10n.t('Tag "{0}" deleted.', tag.label.toUpperCase()));
                        updateItems();
                    }
                } else if (iconId === 'edit') {
                    // --- MODIFICATION (Titre, Icône, Description) ---
                    const oldLabel = tag.label.toUpperCase();

                    // 1. Nouveau Titre
                    const newLabelInput = await vscode.window.showInputBox({
                        prompt: vscode.l10n.t('New tag name'),
                        value: tag.label,
                        ignoreFocusOut: true
                    });
                    if (newLabelInput === undefined || newLabelInput.trim() === '') { return; }
                    const newLabel = newLabelInput.trim().toUpperCase();

                    // 2. Nouvelle Icône
                    const newIcon = await this.showIconPicker(tag.icon);
                    if (!newIcon) { return; }

                    // 3. Nouvelle Description
                    const newDescInput = await vscode.window.showInputBox({
                        prompt: vscode.l10n.t('New tag description (optional)'),
                        value: tag.description || '',
                        ignoreFocusOut: true
                    });
                    if (newDescInput === undefined) { return; }

                    // Mise à jour de la configuration utilisateur
                    const config = vscode.workspace.getConfiguration('smartbookmarks');
                    let userTags = config.get<BookmarkTagConfig[]>('tags') || [];
                    const index = userTags.findIndex(t => t.label.toUpperCase() === oldLabel);

                    if (index !== -1) {
                        userTags[index] = {
                            label: newLabel,
                            icon: newIcon,
                            description: newDescInput.trim()
                        };
                        await config.update('tags', userTags, vscode.ConfigurationTarget.Global);

                        // Si le nom du tag a changé, mettre à jour tous les signets qui possédaient l'ancien nom
                        if (oldLabel !== newLabel) {
                            this.provider.renameTagInBookmarks(oldLabel, newLabel);
                        } else {
                            // Rafraîchir les décorations au cas où l'icône seule a changé
                            this.provider.refresh();
                        }

                        vscode.window.showInformationMessage(vscode.l10n.t('Tag "{0}" updated successfully.', newLabel));
                        updateItems();
                    }
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

    private async showIconPicker(currentIcon?: string): Promise<string | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = currentIcon
                ? vscode.l10n.t('Current icon: $({0}) {0}. Search to change...', currentIcon)
                : vscode.l10n.t('Search for an icon (e.g. bug, shield, zap, cloud...)');
            quickPick.ignoreFocusOut = true;

            const baseItems: vscode.QuickPickItem[] = getExtendedPresetIcons().map(i => ({
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
                        description: vscode.l10n.t('Use Codicon "$({0})"', search)
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

    private async askMultilineComment(existingComment?: string): Promise<string | undefined | false> {
        if (existingComment) {
            const action = await vscode.window.showQuickPick([
                { label: `$(check) ${vscode.l10n.t('Keep current comment')}`, action: 'keep', description: existingComment.replace(/\n/g, ' \\ ') },
                { label: `$(edit) ${vscode.l10n.t('Rewrite / Edit comment')}`, action: 'edit' },
                { label: `$(trash) ${vscode.l10n.t('Clear comment')}`, action: 'clear' }
            ], {
                placeHolder: vscode.l10n.t('Existing comment detected'),
                ignoreFocusOut: true
            });

            if (!action) { return false; }
            if (action.action === 'keep') { return existingComment; }
            if (action.action === 'clear') { return undefined; }
        }

        const lines: string[] = [];
        let adding = true;

        while (adding) {
            const preview = lines.length > 0
                ? vscode.l10n.t(' (Current text: "{0}")', lines.join(' \\n '))
                : '';

            const lineInput = await vscode.window.showInputBox({
                prompt: lines.length === 0
                    ? vscode.l10n.t('Enter the first line of your comment')
                    : vscode.l10n.t('Enter line {0}{1}', lines.length + 1, preview),
                placeHolder: lines.length === 0
                    ? vscode.l10n.t('E.g. Check JWT token')
                    : vscode.l10n.t('Leave empty and submit to finish'),
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
                    { label: `$(check) ✅ ${vscode.l10n.t('Finish and save')}`, action: 'done' },
                    { label: `$(add) ➕ ${vscode.l10n.t('Add another line')}`, action: 'add' }
                ], {
                    placeHolder: vscode.l10n.t('Line {0} added. Continue?', lines.length),
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