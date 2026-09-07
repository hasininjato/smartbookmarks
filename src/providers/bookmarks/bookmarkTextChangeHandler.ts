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
        // 4. Édition sur la première ligne de la plage (startLine)
        else if (changeStartLine === startLine) {
            if (lineDelta > 0) {
                const lineText = document.lineAt(changeStartLine).text;
                const textBeforeChange = lineText.substring(0, changeStartChar);
                const pushedText = document.lineAt(changeStartLine + lineDelta).text;

                const bookmarkKeyText = bookmark.lineText ? bookmark.lineText.trim() : '';

                // Détermine si TOUT le contenu du signet a été repoussé sur la ligne suivante :
                // - Soit Entrée au tout début / dans l'indentation (textBeforeChange est vide)
                // - Soit Entrée juste avant le texte du signet après une fusion (Ctrl+Z ou ré-séparation)
                const isWholeBookmarkPushedDown =
                    textBeforeChange.trim() === '' ||
                    (bookmarkKeyText !== '' && !textBeforeChange.includes(bookmarkKeyText) && pushedText.includes(bookmarkKeyText));

                if (isWholeBookmarkPushedDown) {
                    // Tout le signet descend d'une ligne (startLine et endLine décalés ensemble)
                    bookmark.line += lineDelta;
                    const newLineIndex = bookmark.line - 1;
                    bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                    if (highlightRange) {
                        highlightRange.startLine += lineDelta;
                        highlightRange.endLine += lineDelta;
                    }
                } else if (highlightRange) {
                    // Entrée au milieu du texte du signet : on étend la fin de la plage
                    if (startLine < endLine) {
                        highlightRange.endLine += lineDelta;
                    }
                }
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            } else if (lineDelta < 0) {
                if (highlightRange) {
                    highlightRange.endLine += lineDelta;
                }
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            } else {
                bookmark.lineText = document.lineAt(startLine).text;
                bookmark.updatedAt = Date.now();
                hasChanged = true;
            }
        }
        // 5. Édition à l'intérieur ou sur la dernière ligne de la plage
        else if (changeStartLine > startLine && changeStartLine <= endLine) {
            if (highlightRange && lineDelta !== 0) {
                let shouldUpdateEndLine = true;

                // Si l'édition se fait exactement sur la DERNIÈRE ligne du bloc
                if (changeStartLine === endLine) {
                    if (lineDelta > 0) {
                        // Si la ligne créée est vide, c'est qu'on a fait Entrée au dernier caractère (écriture HORS du bloc)
                        const isAtLastChar = document.lineAt(changeStartLine + lineDelta).text.trim() === '';
                        if (isAtLastChar) {
                            shouldUpdateEndLine = false;
                        }
                    } else if (lineDelta < 0) {
                        // Ctrl+Z ou fusion depuis la ligne du dessous (hors bloc) : ne pas réduire la plage
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