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

  context.subscriptions.push(
    vscode.commands.registerCommand(addCommand.commandId, () => addCommand.execute()),
    vscode.commands.registerCommand(nextCommand.commandId, () => nextCommand.execute()),
    vscode.commands.registerCommand(prevCommand.commandId, () => prevCommand.execute()),
    vscode.commands.registerCommand(listCommand.commandId, () => listCommand.execute()),
    vscode.commands.registerCommand(clearAllCommand.commandId, () => clearAllCommand.execute()),
    vscode.commands.registerCommand(clearFileCommand.commandId, () => clearFileCommand.execute()),

    // --- NOUVELLES COMMANDES POUR LES CORBEILLES ---
    vscode.commands.registerCommand('smartbookmarks.deleteSingleBookmark', (node: BookmarkTreeItem) => {
      if (node?.bookmark) {
        provider.delete(node.bookmark.id);
      }
    }),
    vscode.commands.registerCommand('smartbookmarks.deleteFileBookmarksFromTree', (node: BookmarkTreeItem) => {
      if (node?.filePath) {
        provider.clearForFile(node.filePath);
      }
    })
  );

  const treeView = vscode.window.createTreeView('smartBookmarksView', {
    treeDataProvider: treeViewProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    tracker,
    decorationProvider,
    statusBarProvider
  );

  vscode.window.showInformationMessage('📚 Smart Bookmarks ready!');
}

export function deactivate(): void { }