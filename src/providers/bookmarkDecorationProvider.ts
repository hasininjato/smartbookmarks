import * as vscode from 'vscode';
import * as fs from 'fs';
import { BookmarkProvider } from './bookmarkProvider';
import { Bookmark, BookmarkTagConfig } from '../types';

export class BookmarkDecorationProvider implements vscode.Disposable {
    /** Unique couleur de l'extension */
    private static readonly BRAND_BLUE = '#2196F3';

    /** Signet bleu (logo, resources/gutter.svg) pour les signets sans tag custom */
    private defaultGutterDecorationType: vscode.TextEditorDecorationType;
    /** Un type de décoration par tag custom (icône Codicon, bleue aussi) */
    private tagGutterDecorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    /** Ligne verticale bleue pour les signets de plage */
    private leftBorderDecorationType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];
    private iconUriCache: Map<string, vscode.Uri> = new Map();

    constructor(
        private provider: BookmarkProvider,
        private context: vscode.ExtensionContext
    ) {
        const gutterIconPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'resources',
            'gutter.svg'
        );

        this.defaultGutterDecorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath,
            gutterIconSize: '100%',
            overviewRulerColor: BookmarkDecorationProvider.BRAND_BLUE,
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        this.leftBorderDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            borderWidth: '0 0 0 4px',
            borderStyle: 'solid',
            borderColor: BookmarkDecorationProvider.BRAND_BLUE
        });

        this.disposables.push(
            this.provider.onDidChangeBookmarks(() => this.updateDecorations()),
            vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations()),
            vscode.window.onDidChangeVisibleTextEditors(() => this.updateDecorations()),
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (vscode.window.visibleTextEditors.some(ed => ed.document === e.document)) {
                    this.updateDecorations();
                }
            })
        );

        this.updateDecorations();
    }

    public updateDecorations(): void {
        // Tous les éditeurs visibles (gère les splits), pas seulement l'actif
        for (const editor of vscode.window.visibleTextEditors) {
            this.decorateEditor(editor);
        }
    }

    private decorateEditor(editor: vscode.TextEditor): void {
        const bookmarks = this.provider.getForFile(editor.document.uri.fsPath);
        const defaultDecs: vscode.DecorationOptions[] = [];
        const tagDecs: Map<string, vscode.DecorationOptions[]> = new Map();
        const leftBorderRanges: vscode.Range[] = [];

        const userTags = vscode.workspace.getConfiguration('smartbookmarks')
            .get<BookmarkTagConfig[]>('tags') || [];

        for (const bookmark of bookmarks) {
            const lineIndex = bookmark.line - 1;
            if (lineIndex < 0 || lineIndex >= editor.document.lineCount) { continue; }

            const lineRange = editor.document.lineAt(lineIndex).range;

            // Tag custom avec icône configurée ? Sinon signet bleu par défaut
            const tag = bookmark.tag;
            const tagConfig = tag
                ? userTags.find(t => t.label.toUpperCase() === tag.toUpperCase())
                : undefined;
            const hasTagIcon = !!(tagConfig && tagConfig.icon);

            // Hover : icône Codicon + symbole + ligne (+ tag)
            const hover = new vscode.MarkdownString();
            hover.supportThemeIcons = true;
            hover.appendMarkdown(
                `${hasTagIcon ? tagConfig!.icon : '$(bookmark-filled)'} **${bookmark.symbolName}** (Ligne ${bookmark.line})`
            );
            if (tag) {
                hover.appendMarkdown(` - \`[${tag}]\``);
            }

            const dec: vscode.DecorationOptions = { range: lineRange, hoverMessage: hover };

            // Ligne verticale bleue : appliquée à toute plage, tagguée ou non
            if (bookmark.highlightRange) {
                leftBorderRanges.push(new vscode.Range(
                    bookmark.highlightRange.startLine, 0,
                    bookmark.highlightRange.endLine, 0
                ));
            }

            if (hasTagIcon) {
                const key = tagConfig!.label.toUpperCase();
                if (!tagDecs.has(key)) { tagDecs.set(key, []); }
                tagDecs.get(key)!.push(dec);
            } else {
                defaultDecs.push(dec);
            }
        }

        // 1. Signets par défaut → logo bleu
        editor.setDecorations(this.defaultGutterDecorationType, defaultDecs);

        // 2. Tags custom → leur icône Codicon (bleue), distingués par la forme
        for (const [key, decs] of tagDecs.entries()) {
            editor.setDecorations(this.getOrCreateTagDecorationType(key, userTags), decs);
        }
        // Vide les tags qui n'ont plus de signet dans ce fichier
        for (const [key, decType] of this.tagGutterDecorationTypes.entries()) {
            if (!tagDecs.has(key)) {
                editor.setDecorations(decType, []);
            }
        }

        // 3. Ligne verticale bleue des plages
        editor.setDecorations(this.leftBorderDecorationType, leftBorderRanges);
    }

    /** Crée (ou réutilise) le type de décoration d'un tag custom */
    private getOrCreateTagDecorationType(
        tagKey: string,
        userTags: BookmarkTagConfig[]
    ): vscode.TextEditorDecorationType {
        const existing = this.tagGutterDecorationTypes.get(tagKey);
        if (existing) { return existing; }

        const tagConfig = userTags.find(t => t.label.toUpperCase() === tagKey);
        const iconName = (tagConfig?.icon || '$(bookmark-filled)')
            .replace(/^\$\((.*?)(?:~.*)?\)$/, '$1')
            .trim();

        const decType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: this.getOrCreateTintedIconUri(iconName),
            gutterIconSize: '80%',
            overviewRulerColor: BookmarkDecorationProvider.BRAND_BLUE,
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });
        this.tagGutterDecorationTypes.set(tagKey, decType);
        return decType;
    }

    /** Charge un SVG Codicon et le teint en bleu (Data URI, avec cache) */
    private getOrCreateTintedIconUri(iconName: string): vscode.Uri {
        const cached = this.iconUriCache.get(iconName);
        if (cached) { return cached; }

        let svgPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'node_modules', '@vscode/codicons', 'src', 'icons', `${iconName}.svg`
        ).fsPath;

        if (!fs.existsSync(svgPath)) {
            svgPath = vscode.Uri.joinPath(
                this.context.extensionUri,
                'node_modules', '@vscode/codicons', 'src', 'icons', 'bookmark-filled.svg'
            ).fsPath;
        }

        const blue = BookmarkDecorationProvider.BRAND_BLUE;
        let iconUri: vscode.Uri;
        try {
            let svgContent = fs.readFileSync(svgPath, 'utf8');
            if (svgContent.includes('fill=')) {
                svgContent = svgContent.replace(/fill="[^"]*"/g, `fill="${blue}"`);
            } else {
                svgContent = svgContent.replace('<svg', `<svg fill="${blue}"`);
            }
            iconUri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(svgContent));
        } catch {
            const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${blue}"><path d="M3 2h10a1 1 0 0 1 1 1v12l-6-3.5L2 15V3a1 1 0 0 1 1-1z"/></svg>`;
            iconUri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(fallbackSvg));
        }

        this.iconUriCache.set(iconName, iconUri);
        return iconUri;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.defaultGutterDecorationType.dispose();
        this.leftBorderDecorationType.dispose();
        this.tagGutterDecorationTypes.forEach(d => d.dispose());
        this.tagGutterDecorationTypes.clear();
        this.iconUriCache.clear();
    }
}