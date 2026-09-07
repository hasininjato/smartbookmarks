import * as vscode from 'vscode';
import { Bookmark } from '../../types';
import { findMatchingLine } from './bookmarkLineMatcher';

/**
 * Applique un changement de texte VS Code aux signets d'un fichier :
 * décale, met à jour ou supprime les signets impactés en fonction du diff.
 * Retourne true si au moins un signet a été modifié.
 */
export function handleTextChange(
    document: vscode.TextDocument,
    fileBookmarks: Bookmark[],
    change: vscode.TextDocumentContentChangeEvent,
    deleteBookmark: (id: string) => void
): boolean {
    let hasChanged = false;

    const linesAdded = (change.text.match(/\n/g) || []).length;
    const linesRemoved = change.range.end.line - change.range.start.line;
    const lineDelta = linesAdded - linesRemoved;

    const changeStartLine = change.range.start.line;
    const changeEndLine = change.range.end.line;
    const changeStartChar = change.range.start.character;
    const documentLineCount = document.lineCount;

    for (const bookmark of fileBookmarks) {
        const startLine = bookmark.line - 1;
        const highlightRange = bookmark.highlightRange;
        const endLine = highlightRange ? highlightRange.endLine : startLine;

        const startsAtLineHead =
            changeStartLine < startLine ||
            (changeStartLine === startLine && changeStartChar === 0);

        const isSelectionUpwardsFromBookmark =
            changeStartLine < startLine &&
            changeEndLine === startLine;

        // 1. Suppression du signet
        const isLineDeleted = !isSelectionUpwardsFromBookmark && (
            (startsAtLineHead && changeEndLine > endLine) ||
            (changeStartLine < startLine && changeEndLine >= startLine && lineDelta < 0) ||
            (bookmark.line > documentLineCount)
        );

        if (isLineDeleted) {
            // Avant de supprimer définitivement : le contenu de la ligne existe-t-il
            // encore ailleurs dans le fichier (undo, ligne redescendue plus loin) ?
            const recoveredLine = bookmark.lineText
                ? findMatchingLine(document, bookmark.lineText, startLine, bookmark.lineTextContext)
                : null;

            if (recoveredLine !== null) {
                bookmark.line = recoveredLine + 1;
                bookmark.range = new vscode.Range(recoveredLine, 0, recoveredLine, 0);
                bookmark.updatedAt = Date.now();
                hasChanged = true;
                continue;
            }

            deleteBookmark(bookmark.id);
            hasChanged = true;
            continue;
        }

        // 2. Remontée via sélection vers le haut
        // NOTE : ce cas est ambigu (fusion possible avec du contenu existant),
        // donc on NE touche PAS à bookmark.lineText/lineTextContext ici — l'ancre
        // d'origine est préservée pour permettre une future récupération (voir
        // vérification de dérive en fin de boucle).
        if (isSelectionUpwardsFromBookmark) {
            const targetLine = changeStartLine + 1;
            const diff = targetLine - bookmark.line;

            bookmark.line = targetLine;
            bookmark.range = new vscode.Range(changeStartLine, 0, changeStartLine, 0);

            if (highlightRange) {
                highlightRange.startLine += diff;
                highlightRange.endLine += diff;
            }

            bookmark.updatedAt = Date.now();
            hasChanged = true;
        }
        // 3. Décalage vertical standard (modification avant le signet)
        // Cas non-ambigu : le contenu de la ligne du signet n'est jamais touché,
        // seul son numéro de ligne change. L'ancre reste donc valide telle quelle.
        else if (changeEndLine < startLine) {
            if (lineDelta !== 0) {
                bookmark.line = Math.max(1, bookmark.line + lineDelta);
                const newLineIndex = bookmark.line - 1;
                bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                if (highlightRange) {
                    highlightRange.startLine += lineDelta;
                    highlightRange.endLine += lineDelta;
                }
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            }
        }
        // 4. Édition sur la ligne même du signet
        else if (changeStartLine === startLine) {
            if (lineDelta > 0) {
                const lineText = document.lineAt(changeStartLine).text;
                const textBeforeChange = lineText.substring(0, changeStartChar);

                if (textBeforeChange.trim() === '') {
                    // Insertion pure avant tout contenu réel : le contenu du signet
                    // descend intact, l'ancre reste donc valide sans modification.
                    bookmark.line += lineDelta;
                    const newLineIndex = bookmark.line - 1;
                    bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                    if (highlightRange) {
                        highlightRange.startLine += lineDelta;
                        highlightRange.endLine += lineDelta;
                    }
                }
                // Cas ambigu (insertion au milieu de la ligne, ex: undo d'une fusion) :
                // on ne touche NI à l'ancre NI au highlight ici. Si c'est effectivement
                // la restauration d'une fusion, la vérification de dérive plus bas va
                // retrouver l'ancienne ligne et repositionner tout le highlightRange
                // (startLine ET endLine) en un seul coup via son propre diff — l'ajuster
                // aussi ici provoquerait un double décalage de endLine.
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            } else if (lineDelta < 0) {
                // Fusion de lignes : cas ambigu, on NE touche PAS à l'ancre —
                // elle reste la référence pour une récupération future.
                if (highlightRange) {
                    highlightRange.endLine += lineDelta;
                }
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            } else {
                // Édition sans changement de nombre de lignes : édition intentionnelle
                // du contenu de la ligne bookmarkée elle-même. On rafraîchit lineText
                // pour suivre cette évolution volontaire (le contexte au-dessus n'a
                // pas bougé, pas besoin de le rafraîchir).
                bookmark.lineText = document.lineAt(startLine).text;
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            }
        }
        // 5. Édition à l'intérieur d'une plage multi-lignes
        else if (changeStartLine > startLine && changeStartLine <= endLine) {
            if (highlightRange && lineDelta !== 0) {
                let shouldUpdateEndLine = true;

                if (changeStartLine === endLine) {
                    if (lineDelta > 0) {
                        // Entrée sur la dernière ligne : ne pas étendre si on est au tout dernier caractère
                        const isAtLastChar = document.lineAt(changeStartLine + lineDelta).text.trim() === '';
                        if (isAtLastChar) {
                            shouldUpdateEndLine = false;
                        }
                    } else if (lineDelta < 0) {
                        // Ctrl+Z ou fusion de la ligne du dessous : la suppression est hors du bloc, ne pas réduire
                        shouldUpdateEndLine = false;
                    }
                }
                if (shouldUpdateEndLine) {
                    highlightRange.endLine += lineDelta;
                    bookmark.updatedAt = Date.now();
                    hasChanged = true;
                }
            }
        }

        // Vérification de dérive : si le contenu de la ligne actuelle du signet ne
        // correspond plus à son ancre textuelle, on tente de la retrouver ailleurs
        // dans le fichier (undo qui restaure une fusion, déplacement manuel du bloc).
        if (bookmark.lineText) {
            const currentLineIndex = bookmark.line - 1;
            if (currentLineIndex >= 0 && currentLineIndex < documentLineCount) {
                const currentText = document.lineAt(currentLineIndex).text.trim();
                const anchorText = bookmark.lineText.trim();

                if (currentText !== anchorText) {
                    const recoveredLine = findMatchingLine(
                        document,
                        bookmark.lineText,
                        currentLineIndex,
                        bookmark.lineTextContext
                    );

                    if (recoveredLine !== null && recoveredLine !== currentLineIndex) {
                        const diff = recoveredLine - currentLineIndex;
                        bookmark.line = recoveredLine + 1;
                        bookmark.range = new vscode.Range(recoveredLine, 0, recoveredLine, 0);

                        if (highlightRange) {
                            highlightRange.startLine += diff;
                            highlightRange.endLine += diff;
                        }

                        bookmark.updatedAt = Date.now();
                        hasChanged = true;
                    }
                }
            }
        }

        // Normalisation des bornes du HighlightRange
        if (highlightRange) {
            highlightRange.startLine = Math.max(0, highlightRange.startLine);
            highlightRange.endLine = Math.max(highlightRange.startLine, highlightRange.endLine);
        }
    }

    return hasChanged;
}