# Changelog - Smart Bookmarks

All notable changes to the "Smart Bookmarks" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-beta.1] - 2026-09-18

### ➕ Added
- **100% Custom Tag System**:
  - Default tag list starts **completely empty (0 default tags)** to give full control to the user.
  - Dynamic creation of new tags directly inside the QuickPick UI.
  - On-the-fly tag editing (label, icon, description) and deletion via inline action buttons (`edit`, `trash`).
  - Automatic tag renaming propagation across all active bookmarks (`renameTagInBookmarks`).
  - Visual icon picker powered by VS Code Codicons.
  - "No tag" option to allow creating or resetting bookmarks without labels.
- **Advanced Bookmark Addition & Editing (`ctrl+shift+c`)**:
  - Support for custom **Titles** and **Multiline Comments** on any bookmark.
  - Interactive editing flow for existing bookmarks (keep, rewrite, or clear comments).
  - Automatic symbol and code context detection under the cursor via Tree-sitter.
- **UI & Navigation**:
  - Dedicated Activity Bar container: `smartBookmarksContainer`.
  - Tree View for workspace files and bookmark management: `smartBookmarksView`.
  - Context menus for inline actions (delete single item, delete file bookmarks, rename).
- **Keybindings**:
  - `ctrl+shift+alt+m` (`cmd+shift+alt+m`): Toggle simple bookmark.
  - `ctrl+shift+c` (`cmd+shift+c`): Add/edit bookmark with title, tag, and multiline comment.
  - `ctrl+alt+n` / `ctrl+alt+p`: Navigate to next / previous bookmark.
  - `ctrl+alt+c` / `ctrl+alt+shift+c`: Clear all bookmarks in project / current file.
  - `F2`: Rename selected bookmark in Tree View.
- **Internationalization (l10n)**:
  - Integrated localization support (`vscode.l10n`) for UI strings and prompts.

### ⚙️ Configuration
- `smartbookmarks.persistBookmarks`: Enable/disable bookmark persistence in the workspace state.
- `smartbookmarks.autoFollowSymbols`: Automatically track moving code symbols.
- `smartbookmarks.tags`: Custom user tag configuration array.

### 🛠️ Changed
- Removed all hardcoded fallback tags (`TODO`, `FIXME`, `NOTE`) to ensure a completely neutral out-of-the-box installation.
- Refactored QuickPick lifecycle event handlers (`onDidAccept` / `onDidHide`) to prevent double-resolution and focus bugs.