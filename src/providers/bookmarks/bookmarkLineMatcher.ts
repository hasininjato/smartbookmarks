import * as vscode from 'vscode';

/**
 * Searches for a line whose content exactly matches (trimmed) the expected text,
 * within a radius around the original position.
 * - If only one matching candidate exists: return it directly.
 * - If multiple candidates match (repetitive code, e.g. two endpoints with
 *   an identical line): use the content of the previous line as
 *   disambiguation context. Only return a result if EXACTLY ONE
 *   candidate also has the expected previous line.
 */
export function findMatchingLine(
    document: vscode.TextDocument,
    expectedText: string,
    aroundLine: number,
    expectedContext?: string,
    searchRadius: number = 100
): number | null {
    const target = expectedText.trim();

    // Too short = unreliable (e.g. a line containing only "}" or "")
    if (target.length < 4) {
        return null;
    }

    const start = Math.max(0, aroundLine - searchRadius);
    const end = Math.min(document.lineCount - 1, aroundLine + searchRadius);

    const matches: number[] = [];
    for (let i = start; i <= end; i++) {
        if (document.lineAt(i).text.trim() === target) {
            matches.push(i);
        }
    }

    if (matches.length === 1) {
        return matches[0];
    }

    if (matches.length > 1 && expectedContext) {
        const ctx = expectedContext.trim();
        const contextMatches = matches.filter(
            (i) => i > 0 && document.lineAt(i - 1).text.trim() === ctx
        );
        if (contextMatches.length === 1) {
            return contextMatches[0];
        }
    }

    return null;
}