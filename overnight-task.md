# Objective: Notion + Anki Hybrid App (Tauri)

Build the v1 foundation of a desktop application using Tauri (Rust backend, React/TS frontend).

## 1. Backend (Rust / Tauri Core)
- Implement `rusqlite` to handle local database storage.
- Create two tables: `notes` (markdown content) and `flashcards` (linked to notes, containing Anki SM-2/FSRS scheduling fields: interval, ease, next_review).
- Expose Tauri commands (`#[tauri::command]`) for standard CRUD operations and a command to calculate the next review date.
- Implement the `TaskRouter` defined in AGENTS.md to categorize upcoming agent tasks.

## 2. Frontend (React / TypeScript)
- Set up a clean, Notion-style layout (sidebar for notes, main editor area).
- Integrate a basic WYSIWYG markdown editor (e.g., ProseMirror, Milkdown, or a simple textarea with markdown preview if dependencies fail).
- Create a "Study Mode" view that fetches flashcards due for review via the Tauri backend commands.

## 3. Constraints
- Ensure the project compiles successfully using `cargo check` and `npm run build`.
- Do not run the Tauri dev window (`tauri dev`) during this headless generation.
