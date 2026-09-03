import * as vscode from 'vscode';
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
  decorationProvider = new BookmarkDecorationProvider(provider);
  treeViewProvider = new BookmarkTreeViewProvider(provider);
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

  context.subscriptions.push(
    // Enregistrement des commandes standard
    vscode.commands.registerCommand(addCommand.commandId, () => addCommand.execute()),
    vscode.commands.registerCommand(nextCommand.commandId, () => nextCommand.execute()),
    vscode.commands.registerCommand(prevCommand.commandId, () => prevCommand.execute()),
    vscode.commands.registerCommand(listCommand.commandId, () => listCommand.execute()),
    vscode.commands.registerCommand(clearAllCommand.commandId, () => clearAllCommand.execute()),
    vscode.commands.registerCommand(clearFileCommand.commandId, () => clearFileCommand.execute()),
    vscode.commands.registerCommand(addBookmarkWithCommentCmd.commandId, () => addBookmarkWithCommentCmd.execute()),

    // Commande de renommage (F2 / Inline Edit)
    vscode.commands.registerCommand(renameCommand.commandId, (node?: BookmarkTreeItem) => renameCommand.execute(node)),

    // Suppression d'un seul signet depuis le TreeView
    vscode.commands.registerCommand('smartbookmarks.deleteSingleBookmark', (node: BookmarkTreeItem) => {
      if (node?.bookmark) {
        provider.delete(node.bookmark.id);
      }
    }),

    // Corbeille sur la ligne d'un FICHIER avec popup de confirmation
    vscode.commands.registerCommand('smartbookmarks.deleteFileBookmarksFromTree', async (node: BookmarkTreeItem) => {
      if (node?.filePath) {
        const count = provider.getForFile(node.filePath).length;

        const answer = await vscode.window.showWarningMessage(
          `Voulez-vous vraiment supprimer les ${count} signet(s) de ce fichier ?`,
          { modal: true },
          'Supprimer'
        );

        if (answer === 'Supprimer') {
          provider.clearForFile(node.filePath);
        }
      }
    }),
    treeView,
    tracker,
    decorationProvider,
    statusBarProvider
  );

  vscode.window.showInformationMessage('📚 Smart Bookmarks ready!');
}

export function deactivate(): void { }