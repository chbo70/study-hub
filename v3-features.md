# Study Hub v3: Organization, Media & Automation

## Phase 1: Note Organization (Directories)
- **Database Architecture:** Create a `folders` table (id, name, parent_id for nesting). Add a foreign key `folder_id` column to the `notes` table.
- **Workspace UI:** Update the Notes Workspace to feature a collapsible file-tree sidebar. Users must be able to create folders, drag-and-drop notes into them, and navigate a nested directory structure.

## Phase 2: Local Image & Media Support
- **Backend Asset Handling:** Write a Tauri Rust command (`save_image`) that accepts an image payload (file path or base64 buffer from clipboard), saves it to a dedicated local directory (e.g., `study-hub-data/images`), and returns a persistent local file path.
- **Tauri Custom Protocol:** Configure a custom Tauri protocol (e.g., `asset://` or `studyhub://`) in `tauri.conf.json` and `main.rs` to securely serve these local image files to the frontend.
- **Markdown Editor Integration:** Enable drag-and-drop and clipboard pasting of images directly into the raw markdown editor pane. The editor must upload the image via the Tauri command and automatically insert the resulting markdown image tag (e.g., `![image](studyhub://...)`) into the text.

## Phase 3: Automated Flashcard Generation
- **Generation Engine:** Add a "Generate Flashcards" action within the note editor header.
- **Processing Logic:** Create a module that takes the raw markdown of the current note and parses it into flashcards. Implement this either by allowing the user to configure a local LLM endpoint (like Ollama) / API key to process the text, or by parsing specific markdown syntax (e.g., clozes or bolded questions). Create a Settings Menu Point where you either login to Gemini and connect this so the Ai will be routed to a gemini model.
- **Review Pipeline:** Instead of saving instantly, load the generated cards into the Flashcard Creation Modal for user review, editing, and deck assignment before committing them to the database.

## Phase 4: CI/CD Pipeline (Windows Build)
- **GitHub Actions Workflow:** Create a file at `.github/workflows/windows-build.yml`.
- **Pipeline Configuration:** Set the workflow to trigger on `push` to the `main` branch. 
- **Build Steps:** Include steps to checkout the code, install Node.js, install the stable Rust toolchain, run `npm install`, and execute `npm run tauri build`.
- **Artifact Upload:** Configure the workflow to upload the compiled `.exe` and `.msi` files from `src-tauri/target/release/bundle/` as downloadable GitHub Actions artifacts.
