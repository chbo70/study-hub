# UI Overhaul & Polish: Notion + Anki Hybrid

## 1. Unified Editor & Modern Design
- Replace the split WYSIWYG view with a single, seamless block-based rich-text editor (e.g., using `prosemirror` or `milkdown`).
- Apply a clean, modern Notion-like aesthetic using Tailwind CSS (off-white backgrounds, subtle borders, flat utility classes).

## 2. Data Formatting & Icons
- Integrate an icon library (like `lucide-react`) and add relevant icons to the sidebar navigation, notes list, and editor toolbar.
- Parse and format all raw data beautifully (e.g., format raw timestamps into human-readable relative dates like "2 days ago" or "Nov 12").
- Fix badge labels and UI text: replace raw variable names containing underscores with properly capitalized, human-readable tags.

## 3. Window Controls & Standalone App Configuration
- Update `src-tauri/tauri.conf.json` to ensure the window is resizable and native OS minimize/maximize controls are enabled (`"resizable": true`, `"maximizable": true`, `"minimizable": true`).
- Ensure the frontend build is production-ready so the app can be compiled into a standalone distributable.
