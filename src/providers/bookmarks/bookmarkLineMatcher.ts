import * as vscode from 'vscode';

/**
 * Recherche une ligne dont le contenu correspond exactement (trim) au texte attendu,
 * dans un rayon autour de la position d'origine.
 * - Si un seul candidat correspond : on le retourne directement.
 * - Si plusieurs candidats correspondent (code répétitif, ex: deux endpoints avec
 *   une ligne identique) : on utilise le contenu de la ligne précédente comme
 *   contexte de désambiguïsation. On ne retourne un résultat que si UN SEUL
 *   candidat a aussi la bonne ligne précédente.
 */
export function findMatchingLine(
    document: vscode.TextDocument,
    expectedText: string,
    aroundLine: number,
    expectedContext?: string,
    searchRadius: number = 100
): number | null {
    const target = expectedText.trim();

    // Trop court = pas fiable (ex: une ligne avec juste "}" ou "")
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