import * as vscode from 'vscode';
import * as fs from 'fs';
import { BookmarkProvider } from './bookmarkProvider';
import { Bookmark, BookmarkTagConfig } from '../types';

export class BookmarkDecorationProvider implements vscode.Disposable {
    /** Unique extension color */
    private static readonly BRAND_BLUE = '#2196F3';

    /** Blue bookmark (logo, resources/gutter.svg) for bookmarks without a custom tag */
    private defaultGutterDecorationType: vscode.TextEditorDecorationType;
    /** One decoration type per custom tag (Codicon icon, also blue) */
    private tagGutterDecorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    /** Blue vertical line for range bookmarks */
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
            borderWidth: '0 0 0 3px',
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
        // All visible editors (handles splits), not just the active one
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

            // Custom tag with a configured icon? Otherwise use the default blue bookmark
            const tag = bookmark.tag;
            const tagConfig = tag
                ? userTags.find(t => t.label.toUpperCase() === tag.toUpperCase())
                : undefined;
            const hasTagIcon = !!(tagConfig && tagConfig.icon);

            // Hover: Codicon icon + symbol + line (+ tag)
            const hover = new vscode.MarkdownString();
            hover.supportThemeIcons = true;
            hover.appendMarkdown(
                `${hasTagIcon ? tagConfig!.icon : '$(bookmark-filled)'} **${bookmark.symbolName}** (Line ${bookmark.line})`
            );
            if (tag) {
                hover.appendMarkdown(` - \`[${tag}]\``);
            }

            const dec: vscode.DecorationOptions = { range: lineRange, hoverMessage: hover };

            // Blue vertical line: applied to the entire range, tagged or not
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

        // 1. Default bookmarks → blue logo
        editor.setDecorations(this.defaultGutterDecorationType, defaultDecs);

        // 2. Custom tags → their Codicon icon (blue), distinguished by shape
        for (const [key, decs] of tagDecs.entries()) {
            editor.setDecorations(this.getOrCreateTagDecorationType(key, userTags), decs);
        }
        // Clear tags that no longer have a bookmark in this file
        for (const [key, decType] of this.tagGutterDecorationTypes.entries()) {
            if (!tagDecs.has(key)) {
                editor.setDecorations(decType, []);
            }
        }

        // 3. Blue vertical line for ranges
        editor.setDecorations(this.leftBorderDecorationType, leftBorderRanges);
    }

    /** Creates (or reuses) the decoration type for a custom tag */
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

    /** Loads a Codicon SVG and tints it blue (Data URI, with cache) */
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