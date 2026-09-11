import * as vscode from 'vscode';
import * as fs from 'fs';
import { BookmarkProvider } from './bookmarkProvider';
import { Bookmark, BookmarkTagConfig } from '../types';

export class BookmarkDecorationProvider implements vscode.Disposable {
    private gutterDecorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private leftBorderDecorationType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];
    private iconUriCache: Map<string, vscode.Uri> = new Map();

    constructor(
        private provider: BookmarkProvider,
        private context: vscode.ExtensionContext
    ) {
        // Ligne verticale violette à gauche (sur la zone surlignée)
        this.leftBorderDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            borderWidth: '0 0 0 4px',
            borderStyle: 'solid',
            borderColor: '#A855F7'
        });

        this.disposables.push(
            this.provider.onDidChangeBookmarks(() => this.updateDecorations()),
            vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations()),
            vscode.workspace.onDidChangeTextDocument((e) => {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor && e.document === activeEditor.document) {
                    this.updateDecorations();
                }
            })
        );

        this.updateDecorations();
    }

    public updateDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const bookmarks = this.provider.getForFile(editor.document.uri.fsPath);
        const decorationsByIcon: Map<string, vscode.DecorationOptions[]> = new Map();
        const leftBorderRanges: vscode.Range[] = [];

        const config = vscode.workspace.getConfiguration('smartbookmarks');
        const userTags = config.get<BookmarkTagConfig[]>('tags') || [];

        for (const bookmark of bookmarks) {
            const lineIndex = bookmark.line - 1;

            if (lineIndex >= 0 && lineIndex < editor.document.lineCount) {
                const lineRange = editor.document.lineAt(lineIndex).range;
                const iconName = this.resolveIconName(bookmark, userTags);

                if (!decorationsByIcon.has(iconName)) {
                    decorationsByIcon.set(iconName, []);
                }

                // 1. Création du MarkdownString avec support des icônes Codicon
                const hoverMarkdown = new vscode.MarkdownString();
                hoverMarkdown.supportThemeIcons = true; // Indispensable pour interpréter $(icon-name)

                // 2. Affichage dynamique de l'icône $(iconName)
                hoverMarkdown.appendMarkdown(`$(${iconName}) **${bookmark.symbolName}** (Ligne ${bookmark.line})`);
                if (bookmark.tag) {
                    hoverMarkdown.appendMarkdown(` - \`[${bookmark.tag}]\``);
                }

                decorationsByIcon.get(iconName)!.push({
                    range: lineRange,
                    hoverMessage: hoverMarkdown
                });

                if (bookmark.highlightRange) {
                    leftBorderRanges.push(new vscode.Range(
                        bookmark.highlightRange.startLine, 0,
                        bookmark.highlightRange.endLine, 0
                    ));
                }
            }
        }

        // Création dynamique des types de décoration par icône Codicon
        for (const iconName of decorationsByIcon.keys()) {
            if (!this.gutterDecorationTypes.has(iconName)) {
                const iconUri = this.getOrCreateBlueIconUri(iconName);

                const decType = vscode.window.createTextEditorDecorationType({
                    gutterIconPath: iconUri,
                    gutterIconSize: '80%',
                    overviewRulerColor: '#2196F3',
                    overviewRulerLane: vscode.OverviewRulerLane.Right
                });
                this.gutterDecorationTypes.set(iconName, decType);
            }
        }

        // Application des icônes dans la marge
        for (const [iconName, decType] of this.gutterDecorationTypes.entries()) {
            const decs = decorationsByIcon.get(iconName) || [];
            editor.setDecorations(decType, decs);
        }

        // Application des bordures à gauche
        editor.setDecorations(this.leftBorderDecorationType, leftBorderRanges);
    }

    /**
     * Retourne le nom du Codicon défini pour le tag custom,
     * ou 'bookmark-filled' pour le signet par défaut.
     */
    private resolveIconName(bookmark: Bookmark, userTags: BookmarkTagConfig[]): string {
        if (bookmark.tag) {
            const foundTag = userTags.find(t => t.label.toUpperCase() === bookmark.tag?.toUpperCase());
            if (foundTag && foundTag.icon) {
                // Extrait le nom Codicon (ex: "$(bug)" -> "bug")
                return foundTag.icon.replace(/^\$\((.*?)(?:~.*)?\)$/, '$1').trim();
            }
        }

        // Signet par défaut
        return 'bookmark-filled';
    }

    /**
     * Charge le SVG Codicon depuis node_modules/@vscode/codicons,
     * le tinte en bleu (#2196F3) et retourne un Data URI vscode.Uri.
     */
    private getOrCreateBlueIconUri(iconName: string): vscode.Uri {
        if (this.iconUriCache.has(iconName)) {
            return this.iconUriCache.get(iconName)!;
        }

        let svgPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'node_modules',
            '@vscode/codicons',
            'src',
            'icons',
            `${iconName}.svg`
        ).fsPath;

        // Si le nom du Codicon n'existe pas, fallback sur bookmark-filled.svg
        if (!fs.existsSync(svgPath)) {
            svgPath = vscode.Uri.joinPath(
                this.context.extensionUri,
                'node_modules',
                '@vscode/codicons',
                'src',
                'icons',
                'bookmark-filled.svg'
            ).fsPath;
        }

        let iconUri: vscode.Uri;

        try {
            let svgContent = fs.readFileSync(svgPath, 'utf8');

            // Force la couleur bleue #2196F3 sur le SVG
            if (svgContent.includes('fill=')) {
                svgContent = svgContent.replace(/fill="[^"]*"/g, 'fill="#2196F3"');
            } else {
                svgContent = svgContent.replace('<svg', '<svg fill="#2196F3"');
            }

            iconUri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(svgContent));
        } catch {
            // Secours SVG bleu en cas de problème d'E/S
            const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="#2196F3"><path d="M3 2h10a1 1 0 0 1 1 1v12l-6-3.5L2 15V3a1 1 0 0 1 1-1z"/></svg>`;
            iconUri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(fallbackSvg));
        }

        this.iconUriCache.set(iconName, iconUri);
        return iconUri;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.leftBorderDecorationType.dispose();
        this.gutterDecorationTypes.forEach(d => d.dispose());
        this.gutterDecorationTypes.clear();
        this.iconUriCache.clear();
    }
}