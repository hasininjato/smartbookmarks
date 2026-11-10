import * as vscode from 'vscode';
import * as path from 'path';
import { BookmarkProvider } from './providers/bookmarkProvider';
import { SymbolTracker } from './providers/symbolTracker';
import { BookmarkDecorationProvider } from './providers/bookmarkDecorationProvider';
import { BookmarkTreeViewProvider, BookmarkTreeItem } from './providers/bookmarkTreeViewProvider';
import { BookmarkStatusBarProvider } from './providers/bookmarkStatusBarProvider';
import { AddBookmarkCommand } from './commands/addBookmarkCommand';
import { NextBookmarkCommand } from './commands/nextBookmarkCommand';
import { PreviousBookmarkCommand } from './commands/previousBookmarkCommand';
import { ListBookmarksCommand } from './commands/listBookmarksCommand';
import { ClearAllBookmarksCommand } from './commands/clearAllBookmarksCommand';
import { ClearFileBookmarksCommand } from './commands/clearFileBookmarksCommand';
import { AddBookmarkWithCommentCommand } from './commands/addBookmarkWithCommentCommand';
import { RenameBookmarkCommand } from './commands/renameBookmarkCommand';

let provider: BookmarkProvider;
let tracker: SymbolTracker;
let decorationProvider: BookmarkDecorationProvider;
let treeViewProvider: BookmarkTreeViewProvider;
let statusBarProvider: BookmarkStatusBarProvider;

export function activate(context: vscode.ExtensionContext): void {
  provider = new BookmarkProvider(context);
  tracker = new SymbolTracker(provider);
  decorationProvider = new BookmarkDecorationProvider(provider, context);
  treeViewProvider = new BookmarkTreeViewProvider(provider, context.extensionUri);
  statusBarProvider = new BookmarkStatusBarProvider(provider);

  const addCommand = new AddBookmarkCommand(provider);
  const nextCommand = new NextBookmarkCommand(provider);
  const prevCommand = new PreviousBookmarkCommand(provider);
  const listCommand = new ListBookmarksCommand(provider);
  const clearAllCommand = new ClearAllBookmarksCommand(provider);
  const clearFileCommand = new ClearFileBookmarksCommand(provider);
  const addBookmarkWithCommentCmd = new AddBookmarkWithCommentCommand(provider);

  const treeView = vscode.window.createTreeView('smartBookmarksView', {
    treeDataProvider: treeViewProvider,
    showCollapseAll: true
  });

  const renameCommand = new RenameBookmarkCommand(provider, treeView);

  // Function to update the badge and tooltip based on the active file's context
  const updateBadgeAndTooltip = () => {
    const editor = vscode.window.activeTextEditor;
    let count = 0;
    let contextLabel = '';

    if (editor) {
      const currentFilePath = editor.document.uri.fsPath;
      const normalizedFilePath = path.normalize(currentFilePath).toLowerCase();
      const workspaceFolders = vscode.workspace.workspaceFolders;

      let contextKey = normalizedFilePath;
      let isWorkspace = false;

      if (workspaceFolders && workspaceFolders.length > 0) {
        for (const folder of workspaceFolders) {
          const normalizedFolder = path.normalize(folder.uri.fsPath).toLowerCase();
          if (normalizedFilePath.startsWith(normalizedFolder + path.sep) || normalizedFilePath === normalizedFolder) {
            contextKey = normalizedFolder;
            isWorkspace = true;
            break;
          }
        }
      }

      const allBookmarks = provider.getBookmarks();

      if (isWorkspace) {
        // Count bookmarks for the entire workspace
        count = allBookmarks.filter(b => {
          const p = path.normalize(b.filePath).toLowerCase();
          return p.startsWith(contextKey + path.sep) || p === contextKey;
        }).length;
        contextLabel = vscode.l10n.t('in this workspace');
      } else {
        // Count bookmarks for this standalone file only
        count = allBookmarks.filter(b => {
          const p = path.normalize(b.filePath).toLowerCase();
          return p === contextKey;
        }).length;
        contextLabel = vscode.l10n.t('in this file');
      }
    } else {
      // Fallback when no file is open: show global total
      count = provider.getBookmarks().length;
      contextLabel = vscode.l10n.t('total');
    }

    if (count > 0) {
      const formattedCount = count > 1
        ? vscode.l10n.t('{0} bookmarks', count)
        : vscode.l10n.t('{0} bookmark', count);

      // 1. Numbered badge on the Activity Bar icon
      treeView.badge = {
        value: count,
        tooltip: `Smart Bookmarks – ${formattedCount} ${contextLabel}`
      };

      // 2. Set the title and description
      treeView.title = 'Smart Bookmarks';
      treeView.description = `– ${formattedCount}`;
    } else {
      treeView.badge = undefined;
      treeView.title = 'Smart Bookmarks';
      treeView.description = undefined;
    }
  };

  // Initialize on startup
  updateBadgeAndTooltip();

  // Reorganize bookmarks on startup (migrates standalone files into workspaces if applicable)
  provider.storage.reorganizeByContext();

  // Listen for changes to refresh the badge
  const onBookmarksChangedSub = provider.onDidChangeBookmarks(() => updateBadgeAndTooltip());
  const onActiveEditorChangedSub = vscode.window.onDidChangeActiveTextEditor(() => updateBadgeAndTooltip());

  // Reorganize bookmarks when workspace folders change and update badge
  const onWorkspaceChangedSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    provider.storage.reorganizeByContext();
    updateBadgeAndTooltip();
  });

  context.subscriptions.push(
    // Register standard commands
    vscode.commands.registerCommand(addCommand.commandId, () => addCommand.execute()),
    vscode.commands.registerCommand(nextCommand.commandId, () => nextCommand.execute()),
    vscode.commands.registerCommand(prevCommand.commandId, () => prevCommand.execute()),
    vscode.commands.registerCommand(listCommand.commandId, () => listCommand.execute()),
    vscode.commands.registerCommand(clearAllCommand.commandId, () => clearAllCommand.execute()),
    vscode.commands.registerCommand(clearFileCommand.commandId, () => clearFileCommand.execute()),
    vscode.commands.registerCommand(addBookmarkWithCommentCmd.commandId, () => addBookmarkWithCommentCmd.execute()),

    // Rename command (F2 / Inline Edit)
    vscode.commands.registerCommand(renameCommand.commandId, (node?: BookmarkTreeItem) => renameCommand.execute(node)),

    // Delete a single bookmark from the TreeView
    vscode.commands.registerCommand('smartbookmarks.deleteSingleBookmark', (node: BookmarkTreeItem) => {
      if (node?.bookmark) {
        provider.delete(node.bookmark.id);
      }
    }),

    // Trash icon on a FILE row with confirmation popup
    vscode.commands.registerCommand('smartbookmarks.deleteFileBookmarksFromTree', async (node: BookmarkTreeItem) => {
      if (node?.filePath) {
        const count = provider.getForFile(node.filePath).length;

        const deleteLabel = vscode.l10n.t('Delete');
        const answer = await vscode.window.showWarningMessage(
          vscode.l10n.t('Are you sure you want to delete {0} bookmark(s) from this file?', count),
          { modal: true },
          deleteLabel
        );

        if (answer === deleteLabel) {
          provider.clearForFile(node.filePath);
        }
      }
    }),

    treeView,
    onBookmarksChangedSub,
    onActiveEditorChangedSub,
    onWorkspaceChangedSub,
    tracker,
    decorationProvider,
    statusBarProvider
  );

  vscode.window.showInformationMessage(vscode.l10n.t('Smart Bookmarks ready!'));
}

export function deactivate(): void { }