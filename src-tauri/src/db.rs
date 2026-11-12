use chrono::Utc;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A directory folder stored in the `folders` table (`parent_id` supports nested directories).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// A markdown note stored in the `notes` table with an optional `folder_id` foreign key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub folder_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// A flashcard deck stored in the `decks` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deck {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Supported flashcard interaction types in Study Hub v2.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CardType {
    #[default]
    Default,
    SingleChoice,
    MultipleChoice,
}

impl CardType {
    pub fn as_str(&self) -> &'static str {
        match self {
            CardType::Default => "default",
            CardType::SingleChoice => "single_choice",
            CardType::MultipleChoice => "multiple_choice",
        }
    }

    pub fn from_str_lossy(raw: &str) -> Self {
        match raw.trim().to_lowercase().replace('-', "_").as_str() {
            "single_choice" | "singlechoice" | "single" => CardType::SingleChoice,
            "multiple_choice" | "multiplechoice" | "multiple" | "multi_choice" => {
                CardType::MultipleChoice
            }
            _ => CardType::Default,
        }
    }
}

/// An Anki-scheduled flashcard belonging to a `Deck` in the `flashcards` table.
/// Decoupled from `Note` (no longer requires `note_id`) and uses `reference_tag`
/// for smart backlinks to note headers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flashcard {
    pub id: i64,
    pub deck_id: i64,
    pub note_id: Option<i64>,
    pub front: String,
    pub back: String,
    pub card_type: CardType,
    pub options: Vec<String>,
    pub reference_tag: Option<String>,
    pub interval: i64,
    pub ease: f64,
    pub repetitions: i64,
    pub next_review: String,
    pub created_at: String,
}

/// Result returned by `import_deck` after parsing JSON or CSV and populating `decks` and `flashcards`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportDeckResult {
    pub deck: Deck,
    pub flashcards: Vec<Flashcard>,
    pub imported_count: usize,
}

/// Input representation of a flashcard inside an imported JSON or CSV payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportCardItem {
    pub front: String,
    pub back: String,
    #[serde(default)]
    pub card_type: Option<String>,
    #[serde(default)]
    pub options: Option<serde_json::Value>,
    #[serde(default)]
    pub reference_tag: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ImportDeckJsonEnvelope {
    #[serde(alias = "deck_name", alias = "title")]
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(alias = "flashcards")]
    pub cards: Vec<ImportCardItem>,
}

/// Opens a SQLite connection at `db_path` (or in-memory for tests), enables foreign keys,
/// creates or migrates the `notes`, `decks`, and `flashcards` tables, and seeds starter data if empty.
pub fn init_database(db_path: &Path) -> SqlResult<Connection> {
    let conn = Connection::open(db_path)?;
    setup_schema(&conn)?;
    seed_if_empty(&conn)?;
    Ok(conn)
}

pub fn setup_schema(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            folder_id INTEGER NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS decks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        ",
    )?;

    // Migrate older v1/v2 `notes` table if `folder_id` column is missing
    let mut has_folder_id = false;
    {
        let mut stmt = conn.prepare("PRAGMA table_info(notes)")?;
        let cols = stmt.query_map([], |row| row.get::<_, String>(1))?;
        for col in cols.flatten() {
            if col == "folder_id" {
                has_folder_id = true;
                break;
            }
        }
    }
    if !has_folder_id {
        conn.execute_batch(
            "ALTER TABLE notes ADD COLUMN folder_id INTEGER NULL REFERENCES folders(id) ON DELETE SET NULL;",
        )?;
    }

    // Check if an older v1 `flashcards` table exists without `deck_id`
    let has_flashcards_table: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='flashcards'",
        [],
        |row| row.get(0),
    )?;

    if has_flashcards_table {
        let mut has_deck_id = false;
        let mut stmt = conn.prepare("PRAGMA table_info(flashcards)")?;
        let cols = stmt.query_map([], |row| row.get::<_, String>(1))?;
        for col in cols.flatten() {
            if col == "deck_id" {
                has_deck_id = true;
                break;
            }
        }

        if !has_deck_id {
            migrate_v1_flashcards_to_v2(conn)?;
            return Ok(());
        }
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id INTEGER NOT NULL,
            note_id INTEGER NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            card_type TEXT NOT NULL DEFAULT 'default' CHECK(card_type IN ('default', 'single_choice', 'multiple_choice')),
            options TEXT NOT NULL DEFAULT '[]',
            reference_tag TEXT DEFAULT NULL,
            interval INTEGER NOT NULL DEFAULT 0,
            ease REAL NOT NULL DEFAULT 2.5,
            repetitions INTEGER NOT NULL DEFAULT 0,
            next_review TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
        );
        ",
    )?;

    Ok(())
}

fn migrate_v1_flashcards_to_v2(conn: &Connection) -> SqlResult<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO decks (name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            "General Study Deck",
            "Default deck migrated from Study Hub v1",
            &now,
            &now
        ],
    )?;
    let default_deck_id = conn.last_insert_rowid();

    conn.execute_batch(
        "
        ALTER TABLE flashcards RENAME TO flashcards_v1_backup;

        CREATE TABLE flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id INTEGER NOT NULL,
            note_id INTEGER NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            card_type TEXT NOT NULL DEFAULT 'default' CHECK(card_type IN ('default', 'single_choice', 'multiple_choice')),
            options TEXT NOT NULL DEFAULT '[]',
            reference_tag TEXT DEFAULT NULL,
            interval INTEGER NOT NULL DEFAULT 0,
            ease REAL NOT NULL DEFAULT 2.5,
            repetitions INTEGER NOT NULL DEFAULT 0,
            next_review TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
        );
        ",
    )?;

    conn.execute(
        "INSERT INTO flashcards (id, deck_id, note_id, front, back, card_type, options, reference_tag, interval, ease, repetitions, next_review, created_at)
         SELECT id, ?1, note_id, front, back, 'default', '[]', NULL, interval, ease, repetitions, next_review, created_at
         FROM flashcards_v1_backup",
        params![default_deck_id],
    )?;

    conn.execute("DROP TABLE flashcards_v1_backup", [])?;
    Ok(())
}

fn seed_if_empty(conn: &Connection) -> SqlResult<()> {
    let note_count: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))?;
    let deck_count: i64 = conn.query_row("SELECT COUNT(*) FROM decks", [], |row| row.get(0))?;
    if note_count > 0 || deck_count > 0 {
        return Ok(());
    }

    let now = Utc::now().to_rfc3339();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    // Seed nested directory structure (`folders` table with `parent_id`)
    conn.execute(
        "INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params!["Cognitive Science", Option::<i64>::None, &now, &now],
    )?;
    let cog_folder_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            "Memory & Spaced Repetition",
            Some(cog_folder_id),
            &now,
            &now
        ],
    )?;
    let mem_subfolder_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params!["Systems Engineering", Option::<i64>::None, &now, &now],
    )?;
    let sys_folder_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params!["Rust & Tauri Internals", Some(sys_folder_id), &now, &now],
    )?;
    let rust_subfolder_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO notes (title, content, folder_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            "Spaced Repetition & Memory Systems",
            "# Spaced Repetition & Memory Systems\n\nWelcome to **Study Hub v3** — featuring nested directories, `studyhub://` local image assets, and automated flashcard generation.\n\n## Core Concepts\n- :emerald[**Active Recall**]: Testing yourself strengthens memory traces far more effectively than passive re-reading.\n- :amber[**SM-2 Algorithm**]: Calculates the optimal next review date using interval, ease factor, and recall quality.\n- :sky[**FSRS Scheduler**]: Models memory stability and retrievability over long horizons.\n\n## SM-2 Scheduling\nWhen reviewing a card, quality grades below `3` (:rose[Again]) reset repetitions to `0` and schedule the card for `1 day`.\n\n## Flashcard Generation Syntax\n**Q:** What is the minimum ease factor allowed in the SM-2 algorithm?\n**A:** The minimum ease factor is `1.30` (130%), preventing cards from entering an unrecoverable interval spiral.\n\n- Cloze example: Synaptic consolidation relies on {{c1::Long-Term Potentiation (LTP)}} in the {{c2::hippocampus}}.",
            Some(mem_subfolder_id),
            &now,
            &now,
        ],
    )?;

    conn.execute(
        "INSERT INTO notes (title, content, folder_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            "Rust & Tauri Architecture",
            "# Rust & Tauri Architecture\n\n## Overview\nTauri combines a lightweight **Rust** core with a system webview frontend.\n\n## Key Components\n1. :emerald[**SQLite Persistence**]: Manages local folders, notes, decks, and flashcards storage safely.\n2. :sky[**Tauri IPC Commands**]: Exposes strongly-typed backend endpoints (`save_image`, `import_deck`, `create_flashcard`, `review_flashcard`) to React and TypeScript.\n3. :violet[**Task Router**]: Statically routes UI and Markdown tasks to the Lightweight pipeline and Rust, SQLite, and Anki tasks to the Reasoning pipeline.\n\n## Local Asset Protocol\n**Q:** How does Study Hub v3 securely serve pasted or dropped images in the Markdown preview?\n**A:** Through the `save_image` Rust command saving to `study-hub-data/images` and the custom `studyhub://` URI scheme protocol.",
            Some(rust_subfolder_id),
            &now,
            &now,
        ],
    )?;

    conn.execute(
        "INSERT INTO decks (name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            "Cognitive Science & Memory",
            "Core spaced repetition algorithms, active recall, and memory consolidation.",
            &now,
            &now,
        ],
    )?;
    let deck1_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO decks (name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            "Rust & Tauri Systems",
            "Backend architecture, SQLite schema design, and multi-model task routing.",
            &now,
            &now,
        ],
    )?;
    let deck2_id = conn.last_insert_rowid();

    insert_flashcard_v2(
        conn,
        deck1_id,
        None,
        "What are the three primary scheduling parameters in the **SM-2** flashcard algorithm?",
        "**Interval** (days until next review), **Ease Factor** (multiplier, default `2.5`), and **Next Review Date**.",
        CardType::Default,
        &[],
        Some("Spaced Repetition & Memory Systems#Core Concepts"),
        &today,
        &now,
    )?;

    insert_flashcard_v2(
        conn,
        deck1_id,
        None,
        "What happens to a flashcard's interval when rated **Again** (`quality < 3`) in SM-2?",
        "Interval resets to 1 day, repetitions reset to 0, and ease factor decreases by 0.20 (minimum 1.3).",
        CardType::SingleChoice,
        &[
            "Interval resets to 1 day and repetitions reset to 0".to_string(),
            "Interval is multiplied by 1.2x".to_string(),
            "Interval remains unchanged".to_string(),
            "Card is archived permanently".to_string(),
        ],
        Some("Spaced Repetition & Memory Systems#SM-2 Scheduling"),
        &today,
        &now,
    )?;

    insert_flashcard_v2(
        conn,
        deck2_id,
        None,
        "Which of the following tasks are routed to the **Reasoning Model Pipeline** by `TaskRouter`?",
        "Rust backend commands, SQLite persistence/migrations, and Anki SM-2 algorithm calculations.",
        CardType::MultipleChoice,
        &[
            "Rust backend IPC commands".to_string(),
            "SQLite persistence & schema migrations".to_string(),
            "Anki SM-2 scheduling logic".to_string(),
            "Markdown preview & UI layout rendering".to_string(),
        ],
        Some("Rust & Tauri Architecture#Key Components"),
        &today,
        &now,
    )?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn insert_flashcard_v2(
    conn: &Connection,
    deck_id: i64,
    note_id: Option<i64>,
    front: &str,
    back: &str,
    card_type: CardType,
    options: &[String],
    reference_tag: Option<&str>,
    today: &str,
    now: &str,
) -> SqlResult<i64> {
    let options_json = serde_json::to_string(options).unwrap_or_else(|_| "[]".to_string());
    let cleaned_tag = reference_tag
        .map(str::trim)
        .filter(|s| !s.is_empty());

    conn.execute(
        "INSERT INTO flashcards (deck_id, note_id, front, back, card_type, options, reference_tag, interval, ease, repetitions, next_review, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 2.5, 0, ?8, ?9)",
        params![
            deck_id,
            note_id,
            front,
            back,
            card_type.as_str(),
            options_json,
            cleaned_tag,
            today,
            now
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

// ============================================================================
// Folders CRUD (Nested Directories)
// ============================================================================

pub fn list_folders(conn: &Connection) -> SqlResult<Vec<Folder>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, parent_id, created_at, updated_at FROM folders ORDER BY name ASC, id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            name: row.get(1)?,
            parent_id: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn get_folder_by_id(conn: &Connection, id: i64) -> SqlResult<Folder> {
    conn.query_row(
        "SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE id = ?1",
        params![id],
        |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
}

pub fn insert_folder(
    conn: &Connection,
    name: &str,
    parent_id: Option<i64>,
) -> SqlResult<Folder> {
    let now = Utc::now().to_rfc3339();
    let cleaned_name = {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            "Untitled Folder"
        } else {
            trimmed
        }
    };
    conn.execute(
        "INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![cleaned_name, parent_id, &now, &now],
    )?;
    let id = conn.last_insert_rowid();
    get_folder_by_id(conn, id)
}

pub fn update_folder_by_id(
    conn: &Connection,
    id: i64,
    name: &str,
    parent_id: Option<i64>,
) -> SqlResult<Folder> {
    // Prevent direct self-parenting cycle
    let safe_parent = match parent_id {
        Some(pid) if pid == id => None,
        other => other,
    };
    let now = Utc::now().to_rfc3339();
    let cleaned_name = {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            "Untitled Folder"
        } else {
            trimmed
        }
    };
    conn.execute(
        "UPDATE folders SET name = ?1, parent_id = ?2, updated_at = ?3 WHERE id = ?4",
        params![cleaned_name, safe_parent, &now, id],
    )?;
    get_folder_by_id(conn, id)
}

pub fn delete_folder_by_id(conn: &Connection, id: i64) -> SqlResult<()> {
    // Detach notes in this folder (and child folders via ON DELETE SET NULL) before deleting
    conn.execute(
        "UPDATE notes SET folder_id = NULL WHERE folder_id = ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}

// ============================================================================
// Notes CRUD
// ============================================================================

pub fn list_notes(conn: &Connection) -> SqlResult<Vec<Note>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, folder_id, created_at, updated_at FROM notes ORDER BY updated_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            folder_id: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn get_note_by_id(conn: &Connection, id: i64) -> SqlResult<Note> {
    conn.query_row(
        "SELECT id, title, content, folder_id, created_at, updated_at FROM notes WHERE id = ?1",
        params![id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                folder_id: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
}

pub fn insert_note(conn: &Connection, title: &str, content: &str) -> SqlResult<Note> {
    insert_note_in_folder(conn, title, content, None)
}

pub fn insert_note_in_folder(
    conn: &Connection,
    title: &str,
    content: &str,
    folder_id: Option<i64>,
) -> SqlResult<Note> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notes (title, content, folder_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title, content, folder_id, &now, &now],
    )?;
    let id = conn.last_insert_rowid();
    get_note_by_id(conn, id)
}

pub fn update_note_by_id(conn: &Connection, id: i64, title: &str, content: &str) -> SqlResult<Note> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        params![title, content, &now, id],
    )?;
    get_note_by_id(conn, id)
}

pub fn update_note_with_folder(
    conn: &Connection,
    id: i64,
    title: &str,
    content: &str,
    folder_id: Option<i64>,
) -> SqlResult<Note> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, folder_id = ?3, updated_at = ?4 WHERE id = ?5",
        params![title, content, folder_id, &now, id],
    )?;
    get_note_by_id(conn, id)
}

pub fn move_note_to_folder(
    conn: &Connection,
    note_id: i64,
    folder_id: Option<i64>,
) -> SqlResult<Note> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notes SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![folder_id, &now, note_id],
    )?;
    get_note_by_id(conn, note_id)
}

pub fn delete_note_by_id(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(())
}

// ============================================================================
// Decks CRUD
// ============================================================================

pub fn list_decks(conn: &Connection) -> SqlResult<Vec<Deck>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, created_at, updated_at FROM decks ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Deck {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn get_deck_by_id(conn: &Connection, id: i64) -> SqlResult<Deck> {
    conn.query_row(
        "SELECT id, name, description, created_at, updated_at FROM decks WHERE id = ?1",
        params![id],
        |row| {
            Ok(Deck {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
}

pub fn insert_deck(conn: &Connection, name: &str, description: &str) -> SqlResult<Deck> {
    let now = Utc::now().to_rfc3339();
    let cleaned_name = {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            "Untitled Deck"
        } else {
            trimmed
        }
    };
    conn.execute(
        "INSERT INTO decks (name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![cleaned_name, description.trim(), &now, &now],
    )?;
    let id = conn.last_insert_rowid();
    get_deck_by_id(conn, id)
}

pub fn update_deck_by_id(
    conn: &Connection,
    id: i64,
    name: &str,
    description: &str,
) -> SqlResult<Deck> {
    let now = Utc::now().to_rfc3339();
    let cleaned_name = {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            "Untitled Deck"
        } else {
            trimmed
        }
    };
    conn.execute(
        "UPDATE decks SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
        params![cleaned_name, description.trim(), &now, id],
    )?;
    get_deck_by_id(conn, id)
}

pub fn delete_deck_by_id(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM flashcards WHERE deck_id = ?1", params![id])?;
    conn.execute("DELETE FROM decks WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn ensure_default_deck(conn: &Connection) -> SqlResult<Deck> {
    let decks = list_decks(conn)?;
    if let Some(first) = decks.into_iter().next() {
        return Ok(first);
    }
    insert_deck(
        conn,
        "General Study Deck",
        "Default study deck for spaced repetition cards.",
    )
}

// ============================================================================
// Flashcards CRUD & Scheduling
// ============================================================================

const SELECT_FLASHCARD_COLS: &str = "id, deck_id, note_id, front, back, card_type, options, reference_tag, interval, ease, repetitions, next_review, created_at";

pub fn list_flashcards(conn: &Connection, deck_id: Option<i64>) -> SqlResult<Vec<Flashcard>> {
    match deck_id {
        Some(did) => {
            let sql = format!(
                "SELECT {SELECT_FLASHCARD_COLS} FROM flashcards WHERE deck_id = ?1 ORDER BY id ASC"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(params![did], map_flashcard_row)?;
            rows.collect()
        }
        None => {
            let sql = format!(
                "SELECT {SELECT_FLASHCARD_COLS} FROM flashcards ORDER BY next_review ASC, id ASC"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([], map_flashcard_row)?;
            rows.collect()
        }
    }
}

pub fn list_due_flashcards(
    conn: &Connection,
    deck_id: Option<i64>,
) -> SqlResult<Vec<Flashcard>> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    match deck_id {
        Some(did) => {
            let sql = format!(
                "SELECT {SELECT_FLASHCARD_COLS}
                 FROM flashcards
                 WHERE deck_id = ?1 AND substr(next_review, 1, 10) <= ?2
                 ORDER BY next_review ASC, id ASC"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(params![did, today], map_flashcard_row)?;
            rows.collect()
        }
        None => {
            let sql = format!(
                "SELECT {SELECT_FLASHCARD_COLS}
                 FROM flashcards
                 WHERE substr(next_review, 1, 10) <= ?1
                 ORDER BY next_review ASC, id ASC"
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map(params![today], map_flashcard_row)?;
            rows.collect()
        }
    }
}

pub fn get_flashcard_by_id(conn: &Connection, id: i64) -> SqlResult<Flashcard> {
    let sql = format!("SELECT {SELECT_FLASHCARD_COLS} FROM flashcards WHERE id = ?1");
    conn.query_row(&sql, params![id], map_flashcard_row)
}

pub fn insert_flashcard(
    conn: &Connection,
    deck_id: Option<i64>,
    front: &str,
    back: &str,
    card_type: CardType,
    options: &[String],
    reference_tag: Option<&str>,
) -> SqlResult<Flashcard> {
    let resolved_deck_id = match deck_id {
        Some(id) => id,
        None => ensure_default_deck(conn)?.id,
    };
    let now = Utc::now().to_rfc3339();
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let id = insert_flashcard_v2(
        conn,
        resolved_deck_id,
        None,
        front,
        back,
        card_type,
        options,
        reference_tag,
        &today,
        &now,
    )?;
    get_flashcard_by_id(conn, id)
}

pub fn update_flashcard_content(
    conn: &Connection,
    id: i64,
    front: &str,
    back: &str,
    card_type: Option<CardType>,
    options: Option<&[String]>,
    reference_tag: Option<&str>,
) -> SqlResult<Flashcard> {
    update_flashcard_by_id(conn, id, None, front, back, card_type, options, reference_tag)
}

#[allow(clippy::too_many_arguments)]
pub fn update_flashcard_by_id(
    conn: &Connection,
    id: i64,
    deck_id: Option<i64>,
    front: &str,
    back: &str,
    card_type: Option<CardType>,
    options: Option<&[String]>,
    reference_tag: Option<&str>,
) -> SqlResult<Flashcard> {
    let existing = get_flashcard_by_id(conn, id)?;
    let next_deck_id = deck_id.unwrap_or(existing.deck_id);
    let next_type = card_type.unwrap_or(existing.card_type);
    let next_options = options
        .map(|o| o.to_vec())
        .unwrap_or(existing.options);
    let options_json = serde_json::to_string(&next_options).unwrap_or_else(|_| "[]".to_string());
    let next_tag = match reference_tag {
        Some(t) if t.trim().is_empty() => None,
        Some(t) => Some(t.trim().to_string()),
        None => existing.reference_tag,
    };

    conn.execute(
        "UPDATE flashcards
         SET deck_id = ?1, front = ?2, back = ?3, card_type = ?4, options = ?5, reference_tag = ?6
         WHERE id = ?7",
        params![
            next_deck_id,
            front.trim(),
            back.trim(),
            next_type.as_str(),
            options_json,
            next_tag,
            id
        ],
    )?;

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE decks SET updated_at = ?1 WHERE id = ?2",
        params![&now, next_deck_id],
    )?;

    get_flashcard_by_id(conn, id)
}

pub fn update_flashcard_schedule(
    conn: &Connection,
    id: i64,
    interval: i64,
    ease: f64,
    repetitions: i64,
    next_review: &str,
) -> SqlResult<Flashcard> {
    conn.execute(
        "UPDATE flashcards
         SET interval = ?1, ease = ?2, repetitions = ?3, next_review = ?4
         WHERE id = ?5",
        params![interval, ease, repetitions, next_review, id],
    )?;
    get_flashcard_by_id(conn, id)
}

pub fn delete_flashcard_by_id(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM flashcards WHERE id = ?1", params![id])?;
    Ok(())
}

fn map_flashcard_row(row: &rusqlite::Row<'_>) -> SqlResult<Flashcard> {
    let raw_type: String = row.get(5)?;
    let raw_options: String = row.get(6)?;
    let parsed_options: Vec<String> = serde_json::from_str(&raw_options).unwrap_or_default();

    Ok(Flashcard {
        id: row.get(0)?,
        deck_id: row.get(1)?,
        note_id: row.get(2)?,
        front: row.get(3)?,
        back: row.get(4)?,
        card_type: CardType::from_str_lossy(&raw_type),
        options: parsed_options,
        reference_tag: row.get(7)?,
        interval: row.get(8)?,
        ease: row.get(9)?,
        repetitions: row.get(10)?,
        next_review: row.get(11)?,
        created_at: row.get(12)?,
    })
}

// ============================================================================
// Import Capability (`import_deck`: JSON & CSV)
// ============================================================================

fn parse_options_value(val: Option<&serde_json::Value>) -> Vec<String> {
    let Some(v) = val else {
        return Vec::new();
    };
    match v {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|item| match item {
                serde_json::Value::String(s) => Some(s.trim().to_string()),
                serde_json::Value::Number(n) => Some(n.to_string()),
                serde_json::Value::Bool(b) => Some(b.to_string()),
                serde_json::Value::Object(map) => map
                    .get("text")
                    .or_else(|| map.get("label"))
                    .or_else(|| map.get("value"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string()),
                _ => None,
            })
            .filter(|s| !s.is_empty())
            .collect(),
        serde_json::Value::String(s) => parse_options_str(s),
        _ => Vec::new(),
    }
}

fn parse_options_str(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if trimmed.starts_with('[') {
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(trimmed) {
            return arr
                .into_iter()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
    }
    let sep = if trimmed.contains('|') {
        '|'
    } else if trimmed.contains(';') {
        ';'
    } else {
        ','
    };
    trimmed
        .split(sep)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Parses RFC-4180-style CSV text into rows of string fields.
fn parse_csv_rows(input: &str) -> Vec<Vec<String>> {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_field = String::new();
    let mut in_quotes = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_quotes {
            if ch == '"' {
                if chars.peek() == Some(&'"') {
                    current_field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                current_field.push(ch);
            }
        } else {
            match ch {
                '"' => {
                    in_quotes = true;
                }
                ',' => {
                    current_row.push(current_field.trim().to_string());
                    current_field.clear();
                }
                '\r' => {
                    if chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    current_row.push(current_field.trim().to_string());
                    current_field.clear();
                    if current_row.iter().any(|c| !c.is_empty()) {
                        rows.push(current_row);
                    }
                    current_row = Vec::new();
                }
                '\n' => {
                    current_row.push(current_field.trim().to_string());
                    current_field.clear();
                    if current_row.iter().any(|c| !c.is_empty()) {
                        rows.push(current_row);
                    }
                    current_row = Vec::new();
                }
                _ => {
                    current_field.push(ch);
                }
            }
        }
    }

    if !current_field.is_empty() || !current_row.is_empty() {
        current_row.push(current_field.trim().to_string());
        if current_row.iter().any(|c| !c.is_empty()) {
            rows.push(current_row);
        }
    }

    rows
}

/// Imports a deck and its flashcards from a JSON or CSV string payload.
pub fn import_deck_from_payload(
    conn: &Connection,
    payload: &str,
    deck_name_override: Option<&str>,
    deck_description_override: Option<&str>,
    format_hint: Option<&str>,
) -> Result<ImportDeckResult, String> {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return Err("Import payload cannot be empty.".to_string());
    }

    let is_json = match format_hint.map(|f| f.trim().to_lowercase()) {
        Some(ref f) if f == "json" => true,
        Some(ref f) if f == "csv" => false,
        _ => trimmed.starts_with('{') || trimmed.starts_with('['),
    };

    let mut resolved_name = deck_name_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);
    let mut resolved_desc = deck_description_override
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);

    struct ParsedCard {
        front: String,
        back: String,
        card_type: CardType,
        options: Vec<String>,
        reference_tag: Option<String>,
    }

    let mut parsed_cards: Vec<ParsedCard> = Vec::new();

    if is_json {
        if trimmed.starts_with('{') {
            let env: ImportDeckJsonEnvelope = serde_json::from_str(trimmed)
                .map_err(|e| format!("Failed to parse JSON deck object: {e}"))?;
            if resolved_name.is_none() {
                resolved_name = env.name.filter(|s| !s.trim().is_empty());
            }
            if resolved_desc.is_none() {
                resolved_desc = env.description.filter(|s| !s.trim().is_empty());
            }
            for item in env.cards {
                if item.front.trim().is_empty() || item.back.trim().is_empty() {
                    continue;
                }
                let ctype = item
                    .card_type
                    .as_deref()
                    .map(CardType::from_str_lossy)
                    .unwrap_or(CardType::Default);
                let opts = parse_options_value(item.options.as_ref());
                parsed_cards.push(ParsedCard {
                    front: item.front.trim().to_string(),
                    back: item.back.trim().to_string(),
                    card_type: ctype,
                    options: opts,
                    reference_tag: item
                        .reference_tag
                        .map(|t| t.trim().to_string())
                        .filter(|t| !t.is_empty()),
                });
            }
        } else {
            let items: Vec<ImportCardItem> = serde_json::from_str(trimmed)
                .map_err(|e| format!("Failed to parse JSON flashcards array: {e}"))?;
            for item in items {
                if item.front.trim().is_empty() || item.back.trim().is_empty() {
                    continue;
                }
                let ctype = item
                    .card_type
                    .as_deref()
                    .map(CardType::from_str_lossy)
                    .unwrap_or(CardType::Default);
                let opts = parse_options_value(item.options.as_ref());
                parsed_cards.push(ParsedCard {
                    front: item.front.trim().to_string(),
                    back: item.back.trim().to_string(),
                    card_type: ctype,
                    options: opts,
                    reference_tag: item
                        .reference_tag
                        .map(|t| t.trim().to_string())
                        .filter(|t| !t.is_empty()),
                });
            }
        }
    } else {
        let rows = parse_csv_rows(trimmed);
        if rows.is_empty() {
            return Err("CSV payload contains no rows.".to_string());
        }

        // Check if first row is a header row
        let first_lower: Vec<String> = rows[0].iter().map(|c| c.to_lowercase()).collect();
        let has_header = first_lower.iter().any(|c| {
            c == "front"
                || c == "question"
                || c == "prompt"
                || c == "back"
                || c == "answer"
                || c == "card_type"
        });

        let (start_idx, col_front, col_back, col_type, col_options, col_tag) = if has_header {
            let find_col = |names: &[&str]| -> Option<usize> {
                first_lower
                    .iter()
                    .position(|h| names.iter().any(|n| h == n))
            };
            (
                1usize,
                find_col(&["front", "question", "prompt"]).unwrap_or(0),
                find_col(&["back", "answer", "explanation"]).unwrap_or(1),
                find_col(&["card_type", "type", "cardtype"]),
                find_col(&["options", "choices"]),
                find_col(&["reference_tag", "tag", "reference", "backlink"]),
            )
        } else {
            (0usize, 0usize, 1usize, Some(2usize), Some(3usize), Some(4usize))
        };

        for row in rows.into_iter().skip(start_idx) {
            let front = row.get(col_front).cloned().unwrap_or_default();
            let back = row.get(col_back).cloned().unwrap_or_default();
            if front.trim().is_empty() || back.trim().is_empty() {
                continue;
            }
            let ctype = col_type
                .and_then(|idx| row.get(idx))
                .map(|s| CardType::from_str_lossy(s))
                .unwrap_or(CardType::Default);
            let opts = col_options
                .and_then(|idx| row.get(idx))
                .map(|s| parse_options_str(s))
                .unwrap_or_default();
            let tag = col_tag
                .and_then(|idx| row.get(idx))
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            parsed_cards.push(ParsedCard {
                front: front.trim().to_string(),
                back: back.trim().to_string(),
                card_type: ctype,
                options: opts,
                reference_tag: tag,
            });
        }
    }

    if parsed_cards.is_empty() {
        return Err("No valid flashcards found in import payload.".to_string());
    }

    let deck_title = resolved_name.unwrap_or_else(|| "Imported Study Deck".to_string());
    let deck_desc = resolved_desc.unwrap_or_else(|| {
        format!(
            "Imported {} flashcards via Study Hub v2 deck importer.",
            parsed_cards.len()
        )
    });

    let deck = insert_deck(conn, &deck_title, &deck_desc).map_err(|e| e.to_string())?;
    let mut created_cards = Vec::with_capacity(parsed_cards.len());

    for item in parsed_cards {
        let card = insert_flashcard(
            conn,
            Some(deck.id),
            &item.front,
            &item.back,
            item.card_type,
            &item.options,
            item.reference_tag.as_deref(),
        )
        .map_err(|e| e.to_string())?;
        created_cards.push(card);
    }

    let imported_count = created_cards.len();
    Ok(ImportDeckResult {
        deck,
        flashcards: created_cards,
        imported_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_v2_schema_decks_and_advanced_flashcards() {
        let conn = init_database(&PathBuf::from(":memory:")).expect("in-memory db init");
        let decks = list_decks(&conn).expect("list decks");
        assert!(decks.len() >= 2);

        let cards = list_flashcards(&conn, None).expect("list flashcards");
        assert!(cards.len() >= 3);

        // Verify choice cards and reference_tag exist in seeded cards
        let has_single = cards.iter().any(|c| {
            c.card_type == CardType::SingleChoice
                && !c.options.is_empty()
                && c.reference_tag.is_some()
                && c.note_id.is_none()
        });
        let has_multi = cards
            .iter()
            .any(|c| c.card_type == CardType::MultipleChoice && c.options.len() >= 3);
        assert!(has_single);
        assert!(has_multi);
    }

    #[test]
    fn test_import_deck_json_and_csv() {
        let conn = init_database(&PathBuf::from(":memory:")).expect("in-memory db init");

        let json_payload = r#"{
            "name": "Neurobiology 101",
            "description": "Synaptic plasticity and LTP",
            "cards": [
                {
                    "front": "What receptor is essential for LTP induction?",
                    "back": "NMDA glutamate receptor",
                    "card_type": "single_choice",
                    "options": ["AMPA receptor", "NMDA glutamate receptor", "GABA-A receptor"],
                    "reference_tag": "Neurobiology#Synaptic Plasticity"
                },
                {
                    "front": "Define Hebbian learning.",
                    "back": "Cells that fire together, wire together.",
                    "card_type": "default",
                    "reference_tag": "Neurobiology#Hebbian Theory"
                }
            ]
        }"#;

        let json_res =
            import_deck_from_payload(&conn, json_payload, None, None, Some("json")).unwrap();
        assert_eq!(json_res.deck.name, "Neurobiology 101");
        assert_eq!(json_res.imported_count, 2);
        assert_eq!(json_res.flashcards[0].card_type, CardType::SingleChoice);
        assert_eq!(json_res.flashcards[0].options.len(), 3);
        assert_eq!(
            json_res.flashcards[0].reference_tag.as_deref(),
            Some("Neurobiology#Synaptic Plasticity")
        );

        let csv_payload = "\
front,back,card_type,options,reference_tag
\"Which ions flow through NMDA receptors?\",\"Calcium (Ca2+) and Sodium (Na+)\",multiple_choice,\"Calcium (Ca2+)|Sodium (Na+)|Chloride (Cl-)\",\"Neurobiology#Ion Channels\"
\"What is the resting membrane potential of a typical neuron?\",\"Approximately -70 mV\",default,\"\",\"Neurobiology#Membrane Potential\"
";

        let csv_res = import_deck_from_payload(
            &conn,
            csv_payload,
            Some("CSV Imported Deck"),
            None,
            Some("csv"),
        )
        .unwrap();
        assert_eq!(csv_res.deck.name, "CSV Imported Deck");
        assert_eq!(csv_res.imported_count, 2);
        assert_eq!(csv_res.flashcards[0].card_type, CardType::MultipleChoice);
        assert_eq!(csv_res.flashcards[0].options.len(), 3);
        assert_eq!(
            csv_res.flashcards[0].reference_tag.as_deref(),
            Some("Neurobiology#Ion Channels")
        );
    }

    #[test]
    fn test_v3_folders_nesting_and_note_folder_assignment() {
        let conn = init_database(&PathBuf::from(":memory:")).expect("in-memory db init");

        // Verify seeded folders and nested parent_id
        let seeded_folders = list_folders(&conn).expect("list seeded folders");
        assert!(seeded_folders.len() >= 4);
        assert!(seeded_folders.iter().any(|f| f.parent_id.is_some()));

        // Create root folder and nested subfolder
        let root_folder =
            insert_folder(&conn, "Computer Science", None).expect("create root folder");
        let sub_folder = insert_folder(&conn, "Distributed Systems", Some(root_folder.id))
            .expect("create nested folder");
        assert_eq!(sub_folder.parent_id, Some(root_folder.id));

        // Create note in root and move to nested subfolder
        let note = insert_note_in_folder(&conn, "Raft Consensus", "# Raft\nLeader election", None)
            .expect("create note");
        assert_eq!(note.folder_id, None);

        let moved = move_note_to_folder(&conn, note.id, Some(sub_folder.id)).expect("move note");
        assert_eq!(moved.folder_id, Some(sub_folder.id));

        // Deleting folder sets note's folder_id back to NULL
        delete_folder_by_id(&conn, sub_folder.id).expect("delete subfolder");
        let reloaded = get_note_by_id(&conn, note.id).expect("reload note");
        assert_eq!(reloaded.folder_id, None);
    }

    #[test]
    fn test_deck_and_flashcard_management_crud() {
        let conn = init_database(&PathBuf::from(":memory:")).expect("in-memory db init");

        // Create and edit a deck
        let deck_a = insert_deck(&conn, "Algorithms", "Sorting and graphs").expect("insert deck");
        let deck_b = insert_deck(&conn, "Databases", "B-trees and WAL").expect("insert deck B");

        let updated_deck_a = update_deck_by_id(
            &conn,
            deck_a.id,
            "Advanced Algorithms",
            "Dynamic programming, graphs, and amortized analysis",
        )
        .expect("update deck");
        assert_eq!(updated_deck_a.name, "Advanced Algorithms");
        assert_eq!(
            updated_deck_a.description,
            "Dynamic programming, graphs, and amortized analysis"
        );

        // Create a flashcard in deck A, then edit its content, type, options, and move to deck B
        let card = insert_flashcard(
            &conn,
            Some(deck_a.id),
            "What is Dijkstra's time complexity?",
            "O((V + E) log V) with a binary heap",
            CardType::Default,
            &[],
            Some("Algorithms#Shortest Paths"),
        )
        .expect("insert card");
        assert_eq!(card.deck_id, deck_a.id);

        let edited_card = update_flashcard_by_id(
            &conn,
            card.id,
            Some(deck_b.id),
            "Which data structure is used in SQLite indexes?",
            "B-Tree",
            Some(CardType::SingleChoice),
            Some(&[
                "B-Tree".to_string(),
                "Skip List".to_string(),
                "Trie".to_string(),
            ]),
            Some("Databases#Indexing"),
        )
        .expect("edit flashcard");
        assert_eq!(edited_card.deck_id, deck_b.id);
        assert_eq!(
            edited_card.front,
            "Which data structure is used in SQLite indexes?"
        );
        assert_eq!(edited_card.back, "B-Tree");
        assert_eq!(edited_card.card_type, CardType::SingleChoice);
        assert_eq!(edited_card.options.len(), 3);
        assert_eq!(
            edited_card.reference_tag.as_deref(),
            Some("Databases#Indexing")
        );

        // Deleting deck B cascades and deletes its flashcards
        delete_deck_by_id(&conn, deck_b.id).expect("delete deck B");
        let remaining_in_b = list_flashcards(&conn, Some(deck_b.id)).expect("list deck B cards");
        assert!(remaining_in_b.is_empty());
    }
}
