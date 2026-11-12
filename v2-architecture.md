# Study Hub v2: Architecture & UX Overhaul

## Phase 1: Database & Backend Architecture (Rust/SQLite)
- **Decouple Flashcards from Notes:** Flashcards must no longer require a `note_id`. Introduce a `decks` table. Flashcards must belong to a Deck.
- **Advanced Card Types:** Update the flashcard schema to support `card_type` (Enum: `default`, `single_choice`, `multiple_choice`) and an `options` JSON column for the choice-based cards.
- **Smart Tags (Backlinks):** Add a `reference_tag` column to flashcards to store smart links back to specific note headers, replacing the old hard-anchored note relationship.
- **Import Capability:** Create a Tauri command (`import_deck`) that accepts a JSON or CSV file payload, parses it, and populates the `decks` and `flashcards` tables.

## Phase 2: Notes Workspace UI (React/Tailwind)
- **Layout Shift (Overleaf/Joplin Style):** Abandon the small WYSIWYG block editor. Utilize the full screen real estate for a split-pane layout: a raw markdown editor on the left (spanning the full vertical height) and a live rendered preview on the right.
- **Extended Markdown Support:** Integrate a plugin (e.g., `remark-directive` or similar) to allow syntax for text coloring inside the markdown editor, rendering appropriately in the preview pane.
- **Navigation Polish:** 
  - Make the breadcrumbs functional. Clicking "Workspace" must route to a new `Dashboard` view listing all notes and recent activity.
  - Make the app logo a functional home button returning to the Dashboard.
- **UI Cleanup:** Completely remove the "Linked Anki Flashcards" UI block from the bottom of the notes page.

## Phase 3: Study Mode & Flashcard UX (React/Three.js or Framer Motion)
- **Persistent Creation Modal:** 
  - Build a modal for creating flashcards within Study Mode.
  - The modal must contain full markdown editors for both the Front and Back fields.
  - Include a toggle to select the card type (Default, Single Choice, Multiple Choice).
  - **Crucial Interaction:** When the user clicks "Add Card", save the card via the Tauri backend, clear the fields, and **keep the modal open** for rapid, continuous entry.
- **3D Card Stack Animation:** 
  - Restructure the flashcard review interface into a stacked deck visual.
  - Use Framer Motion (or React Three Fiber/Three.js) to animate the cards. When a user reveals the answer and scores the card, animate the top card sliding off the screen and shuffling to the back of the deck (or disappearing), revealing the next card underneath.
