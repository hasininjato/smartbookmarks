import * as vscode from 'vscode';
import { Bookmark } from '../../types';
import { findMatchingLine } from './bookmarkLineMatcher';

/**
 * Applies a VS Code text change to the bookmarks of a file:
 * shifts, updates, or deletes affected bookmarks based on the diff.
 * Returns true if at least one bookmark was modified.
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

        // 1. Bookmark deletion
        const isLineDeleted = !isSelectionUpwardsFromBookmark && (
            (startsAtLineHead && changeEndLine > endLine) ||
            (changeStartLine < startLine && changeEndLine >= startLine && lineDelta < 0) ||
            (bookmark.line > documentLineCount)
        );

        if (isLineDeleted) {
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

        // 2. Move upward via selection
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
        // 3. Standard vertical shift (change before the bookmark)
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
        // 4. Edit on the first line of the range (startLine)
        else if (changeStartLine === startLine) {
            if (lineDelta > 0) {
                const lineText = document.lineAt(changeStartLine).text;
                const textBeforeChange = lineText.substring(0, changeStartChar);
                const pushedText = document.lineAt(changeStartLine + lineDelta).text;

                const bookmarkKeyText = bookmark.lineText ? bookmark.lineText.trim() : '';

                const isWholeBookmarkPushedDown =
                    textBeforeChange.trim() === '' ||
                    (bookmarkKeyText !== '' && !textBeforeChange.includes(bookmarkKeyText) && pushedText.includes(bookmarkKeyText));

                if (isWholeBookmarkPushedDown) {
                    bookmark.line += lineDelta;
                    const newLineIndex = bookmark.line - 1;
                    bookmark.range = new vscode.Range(newLineIndex, 0, newLineIndex, 0);

                    if (highlightRange) {
                        highlightRange.startLine += lineDelta;
                        highlightRange.endLine += lineDelta;
                    }
                    if (newLineIndex >= 0 && newLineIndex < documentLineCount) {
                        bookmark.lineText = document.lineAt(newLineIndex).text;
                    }
                } else if (highlightRange) {
                    // FIX: Increment endLine directly without requiring (startLine < endLine)
                    highlightRange.endLine += lineDelta;
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
        // 5. Edit inside or on the last line of the range
        else if (changeStartLine > startLine && changeStartLine <= endLine) {
            if (highlightRange && lineDelta !== 0) {
                let shouldUpdateEndLine = true;

                if (changeStartLine === endLine) {
                    if (lineDelta > 0) {
                        const isAtLastChar = document.lineAt(changeStartLine + lineDelta).text.trim() === '';
                        if (isAtLastChar) {
                            shouldUpdateEndLine = false;
                        }
                    } else if (lineDelta < 0) {
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

        // Drift check
        if (bookmark.lineText) {
            const currentLineIndex = bookmark.line - 1;
            if (currentLineIndex >= 0 && currentLineIndex < documentLineCount) {
                const currentText = document.lineAt(currentLineIndex).text.trim();
                const anchorText = bookmark.lineText.trim();

                if (currentText !== anchorText) {
                    const isAnchorStillPresent = anchorText !== '' && currentText.includes(anchorText);

                    if (!isAnchorStillPresent) {
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
        }

        // Normalize HighlightRange boundaries
        if (highlightRange) {
            highlightRange.startLine = Math.max(0, highlightRange.startLine);
            highlightRange.endLine = Math.max(highlightRange.startLine, highlightRange.endLine);
        }
    }

    return hasChanged;
}