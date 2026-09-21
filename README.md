# Smart Bookmarks

<p align="center">
  <img src="https://raw.githubusercontent.com/hasininjato/smartbookmarks/main/resources/smartbookmarks-readme.png" alt="Smart Bookmarks — Code moves. Bookmarks follow." height="250">
</p>

**Bookmarks that follow your code, not your line numbers.**

Smart Bookmarks is a VS Code extension designed to make code bookmarks more useful and resilient. Bookmarks can be attached to code symbols or to selected lines, with visual markers directly in the editor.

## Features

### Smart, semantic bookmarks

Create a bookmark on the code element under your cursor:

* Functions
* Classes
* Methods
* Variables
* Control-flow blocks
* Regular lines when no code symbol can be detected

Bookmarks store contextual information about the code, allowing them to remain useful after refactoring.

### Bookmark a range of lines

Select one or more lines and create a bookmark for the entire selection.

A **vertical purple line** is displayed in the editor to clearly highlight the bookmarked code range.

This is useful for marking:

* A block of code
* A section that needs review
* A complex piece of logic
* Several related lines
* Code that does not correspond to a single symbol

### Resilient to code changes

Smart Bookmarks can automatically relocate bookmarks when code moves or changes.

The matching strategy progressively uses:

1. AST path and symbol information
2. Symbol name and type
3. Function/method signature
4. Surrounding code context
5. Fuzzy matching

### Notes and tags

Attach context directly to your code by adding custom titles, multiline notes, and personalized tags to your bookmarks.

Smart Bookmarks starts with a completely clean slate (0 default tags). There are no pre-configured tags—you have total freedom to build your own tagging system from scratch based entirely on your workflow.

* 100% Custom Tags: Create tags on the fly with custom names, optional descriptions, and VS Code Codicons during bookmark creation (Ctrl+Shift+C)
* Inline Management: Create, edit (label, icon, description), or delete tags directly inside the QuickPick menu (Ctrl+Shift+C)
* Smart Propagation: Renaming a tag automatically updates all existing bookmarks assigned to that tag across your entire workspace

### Bookmark panel

The **Smart Bookmarks** view provides a centralized list of your bookmarks.

From the panel you can:

* Browse bookmarks by file
* Navigate directly to a bookmark
* Rename bookmarks
* Delete individual bookmarks
* Delete all bookmarks belonging to a file
* Delete all bookmarks

### Visual markers

Bookmarks are displayed directly in the editor.

* **Symbol bookmarks** are displayed in the editor gutter.
* **Line-range bookmarks** display a **vertical purple line** alongside the bookmarked code.
* Visual markers make bookmarked code easy to identify while working.

### 💾 Persistent storage

Bookmarks can be persisted between VS Code sessions.

The extension is designed to keep bookmark information independent from simple line numbers, making it more suitable for long-lived development projects.

---

## ⌨️ Commands & Shortcuts

| Command                            | Windows / Linux    | macOS             |
| ---------------------------------- | ------------------ | ----------------- |
| **Add / Remove Bookmark**          | `Ctrl+Shift+Alt+M` | `Cmd+Shift+Alt+M` |
| **Next Bookmark**                  | `Ctrl+Alt+N`       | `Cmd+Alt+N`       |
| **Previous Bookmark**              | `Ctrl+Alt+P`       | `Cmd+Alt+P`       |
| **Add Bookmark with Notes**        | `Ctrl+Shift+C`     | `Cmd+Shift+C`     |
| **Clear Bookmarks in Active File** | `Ctrl+Alt+Shift+C` | `Cmd+Alt+Shift+C` |
| **Clear All Bookmarks**            | `Ctrl+Alt+C`       | `Cmd+Alt+C`       |
| **Rename Bookmark**                | `F2`*              | `F2`*             |

* `F2` is active when the **Smart Bookmarks** view is focused.

All commands are also available through the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`).

---

## Getting Started

1. Open a source file.
2. Place your cursor on a function, class, method, variable, or line.
3. **Or select a range of lines** you want to bookmark.
4. Press `Ctrl+Shift+Alt+M` (`Cmd+Shift+Alt+M` on macOS).
5. The bookmark appears in the editor and in the **Smart Bookmarks** panel.
6. For a selected range, a **purple vertical line** highlights the bookmarked code.
7. Navigate between bookmarks using `Ctrl+Alt+N` / `Ctrl+Alt+P`.
8. Press `Ctrl+Shift+C` (`Cmd+Shift+C` on macOS) to add a customized bookmark, choose a tag or create a new one, fill in the title of the bookmark and a description

You can also use the Command Palette and search for **Smart Bookmark** commands.

---

## Why Smart Bookmarks?

Traditional bookmarks are usually tied to a specific line:

```text
Bookmark → line 142
```

After adding or removing code above it, line 142 may no longer contain the code you wanted.

Smart Bookmarks instead aim to preserve the relationship with the code itself:

```text
Bookmark → calculateTotal()
```

Or, for a selected range:

```text
Bookmark → lines 142–157
           ┃
           ┃  highlighted in purple
           ┃
```

This makes bookmarks much more useful during:

* Refactoring
* Code reviews
* Debugging
* Large codebases
* Long-running development tasks
* Marking temporary areas of code

---

## Technology

Smart Bookmarks is built for VS Code using:

* **TypeScript**
* **VS Code Extension API**
* **Tree-sitter** for code parsing and symbol detection
* **Web Tree-sitter** for AST processing
* Persistent local storage
* Fuzzy/context-based matching for resilient bookmark relocation

---

## Project Status

Smart Bookmarks is currently under active development.

The goal is to provide a lightweight, local-first bookmarking system that understands the structure of your code instead of treating bookmarks as simple line numbers.

---

## License

Open source. See the repository for license information.
