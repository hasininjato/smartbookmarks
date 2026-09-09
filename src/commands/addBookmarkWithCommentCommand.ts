import * as vscode from 'vscode';
import { BookmarkProvider } from '../providers/bookmarkProvider';
import { BookmarkTagConfig, SymbolInfo } from '../types';
import { getSymbolAtPosition } from '../utils/symbols';

// Catalogue exhaustif d'icônes Codicon de VS Code classées
const EXTENDED_PRESET_ICONS: { label: string; description: string }[] = [
    // 🛠️ Développement & Code
    { label: '$(bug) bug', description: 'Bugs, anomalies' },
    { label: '$(code) code', description: 'Extrait de code, fonction' },
    { label: '$(tools) tools', description: 'Outillage, refactoring, helpers' },
    { label: '$(terminal) terminal', description: 'Commandes, scripts shell' },
    { label: '$(gear) gear', description: 'Configuration, paramètres' },
    { label: '$(symbol-keyword) symbol-keyword', description: 'Logique métier, algorithme' },
    { label: '$(symbol-class) symbol-class', description: 'Composant, classe' },
    { label: '$(database) database', description: 'Requête BDD, modèle de données' },
    { label: '$(git-merge) git-merge', description: 'Branchement Git, fusion' },
    { label: '$(bracket) bracket', description: 'Structure, crochets' },

    // 🛡️ Sécurité & Performance
    { label: '$(shield) shield', description: 'Sécurité, authentification, tokens' },
    { label: '$(lock) lock', description: 'Permissions, accès restreint' },
    { label: '$(key) key', description: 'Clés API, secrets' },
    { label: '$(pulse) pulse', description: 'Monitoring, métriques, santé' },
    { label: '$(flame) flame', description: 'Urgence maximale, hotfix' },

    // 📋 Organisation & Tâches
    { label: '$(checklist) checklist', description: 'Tâches, TODOs, vérifications' },
    { label: '$(notebook) notebook', description: 'Notes de documentation' },
    { label: '$(eye) eye', description: 'À réviser, Code Review' },
    { label: '$(pin) pin', description: 'Épinglé, référence importante' },
    { label: '$(target) target', description: 'Objectif, étape clé' },
    { label: '$(bookmark) bookmark', description: 'Signet standard' },
    { label: '$(tag) tag', description: 'Étiquette standard' },

    // ⚠️ Statuts & Alertes
    { label: '$(star) star', description: 'Important, favori' },
    { label: '$(alert) alert', description: 'Avertissement, attention' },
    { label: '$(warning) warning', description: 'Point critique' },
    { label: '$(info) info', description: 'Information complémentaire' },
    { label: '$(verified) verified', description: 'Validé, vérifié' },
    { label: '$(pass) pass', description: 'Succès, test validé' },

    // 🎨 Interface & UI
    { label: '$(heart) heart', description: 'Coup de cœur, UI/UX' },
    { label: '$(paintcan) paintcan', description: 'Design, styles, CSS' },
    { label: '$(lightbulb) lightbulb', description: 'Idée, proposition' },
    { label: '$(globe) globe', description: 'Réseau, API, Web, i18n' },
    { label: '$(cloud) cloud', description: 'Services Cloud, Serverless' },
    { label: '$(server) server', description: 'Serveur, Backend' },
    { label: '$(bell) bell', description: 'Notifications, événements' }
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

        // Ancre textuelle : contenu de la ligne au moment de la création du signet,
        // utilisée pour retrouver le signet si sa ligne est supprimée puis restaurée
        // (undo) ou déplacée manuellement ailleurs dans le fichier.
        const lineText = document.lineAt(startLine).text;

        // Contexte de désambiguïsation : contenu de la ligne juste au-dessus.
        // Nécessaire quand lineText seul correspond à plusieurs lignes du fichier
        // (ex: du code répétitif comme deux endpoints avec une ligne identique).
        const lineTextContext = startLine > 0 ? document.lineAt(startLine - 1).text : undefined;

        // 1. Sélection / Suppression de Tag
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

            const formattedTagName = rawTagName.trim().toUpperCase();
            const config = vscode.workspace.getConfiguration('smartbookmarks');
            let userTags = config.get<BookmarkTagConfig[]>('tags') || [];

            // Vérification si le tag existe déjà
            const existingTag = userTags.find(t => t.label.toUpperCase() === formattedTagName);

            if (existingTag) {
                vscode.window.showInformationMessage(`Le tag "${formattedTagName}" existe déjà. Il a été sélectionné.`);
                selectedTagLabel = existingTag.label;
            } else {
                // Choix d'icône avec filtrage visuel
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

        // 2. Titre
        const rawTitle = await vscode.window.showInputBox({
            prompt: 'Entrez un titre pour ce signet',
            placeHolder: 'Ex: Vérification des droits d\'accès',
            ignoreFocusOut: true
        });

        if (rawTitle === undefined) { return; }
        const cleanTitle = rawTitle.trim().length > 0 ? rawTitle.trim() : undefined;

        // 3. Commentaire
        const rawComment = await this.askMultilineComment();
        const cleanComment = rawComment && rawComment.trim().length > 0 ? rawComment.trim() : undefined;

        // 4. Envoi au Provider
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

    /**
     * Permet de choisir une icône dans la liste exhaustive ou d'en taper n'importe quelle autre
     */
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

                // Filtrage dynamique des icônes
                const filtered = baseItems.filter(item =>
                    item.label.toLowerCase().includes(search) ||
                    (item.description && item.description.toLowerCase().includes(search))
                );

                // Option d'utiliser directement l'identifiant saisi si aucun résultat exact
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