use chrono::Utc;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A markdown note stored in the `notes` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

/// An Anki-scheduled flashcard linked to a `Note` in the `flashcards` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flashcard {
    pub id: i64,
    pub note_id: i64,
    pub front: String,
    pub back: String,
    pub interval: i64,
    pub ease: f64,
    pub repetitions: i64,
    pub next_review: String,
    pub created_at: String,
}

/// Opens a SQLite connection at `db_path` (or in-memory for tests), enables foreign keys,
/// creates the `notes` and `flashcards` tables, and seeds starter data if empty.
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

        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            interval INTEGER NOT NULL DEFAULT 0,
            ease REAL NOT NULL DEFAULT 2.5,
            repetitions INTEGER NOT NULL DEFAULT 0,
            next_review TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );
        ",
    )?;
    Ok(())
}

fn seed_if_empty(conn: &Connection) -> SqlResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let now = Utc::now().to_rfc3339();
    let today = Utc::now().format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            "Spaced Repetition & Memory Systems",
            "# Spaced Repetition & Memory Systems\n\nWelcome to **Study Hub** — a Notion + Anki hybrid workspace.\n\n## Core Concepts\n- **Active Recall**: Testing yourself strengthens memory traces far more effectively than passive re-reading.\n- **SM-2 Algorithm**: Calculates the optimal `next_review` date using `interval`, `ease`, and recall quality.\n- **FSRS (Free Spaced Repetition Scheduler)**: Models memory stability and retrievability.\n\n> Tip: Add flashcards directly underneath this note and switch to **Study Mode** to review due cards!",
            &now,
            &now,
        ],
    )?;
    let note1_id = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            "Rust & Tauri Architecture",
            "# Rust & Tauri Architecture\n\n## Overview\nTauri combines a lightweight **Rust** core with a system webview frontend.\n\n### Key Components\n1. `rusqlite` manages local SQLite persistence safely.\n2. `#[tauri::command]` exposes strongly-typed IPC endpoints to React/TypeScript.\n3. `TaskRouter` statically routes UI/Markdown tasks to the lightweight pipeline and Rust/SQLite/Anki tasks to the reasoning pipeline.",
            &now,
            &now,
        ],
    )?;
    let note2_id = conn.last_insert_rowid();

    let starter_cards = [
        (
            note1_id,
            "What are the three primary scheduling fields in the SM-2 flashcard table?",
            "interval (days until next review), ease (ease factor multiplier, default 2.5), and next_review (scheduled ISO date).",
        ),
        (
            note1_id,
            "What happens to a flashcard's interval when rated 'Again' (quality < 3) in SM-2?",
            "Repetitions reset to 0, the interval resets to 1 day, and the ease factor is reduced (down to a minimum of 1.3).",
        ),
        (
            note2_id,
            "How does the Multi-Model TaskRouter route tasks?",
            "UI/Markdown rendering tasks go to the Lightweight model pipeline; Rust backend, SQLite persistence, and Anki algorithm logic go to the Reasoning model pipeline.",
        ),
    ];

    for (note_id, front, back) in starter_cards {
        conn.execute(
            "INSERT INTO flashcards (note_id, front, back, interval, ease, repetitions, next_review, created_at)
             VALUES (?1, ?2, ?3, 0, 2.5, 0, ?4, ?5)",
            params![note_id, front, back, &today, &now],
        )?;
    }

    Ok(())
}

pub fn list_notes(conn: &Connection) -> SqlResult<Vec<Note>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn get_note_by_id(conn: &Connection, id: i64) -> SqlResult<Note> {
    conn.query_row(
        "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1",
        params![id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
}

pub fn insert_note(conn: &Connection, title: &str, content: &str) -> SqlResult<Note> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![title, content, &now, &now],
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

pub fn delete_note_by_id(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_flashcards(conn: &Connection, note_id: Option<i64>) -> SqlResult<Vec<Flashcard>> {
    match note_id {
        Some(nid) => {
            let mut stmt = conn.prepare(
                "SELECT id, note_id, front, back, interval, ease, repetitions, next_review, created_at
                 FROM flashcards WHERE note_id = ?1 ORDER BY id ASC",
            )?;
            let rows = stmt.query_map(params![nid], map_flashcard_row)?;
            rows.collect()
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT id, note_id, front, back, interval, ease, repetitions, next_review, created_at
                 FROM flashcards ORDER BY next_review ASC, id ASC",
            )?;
            let rows = stmt.query_map([], map_flashcard_row)?;
            rows.collect()
        }
    }
}

pub fn list_due_flashcards(conn: &Connection) -> SqlResult<Vec<Flashcard>> {
    let today = Utc::now().format("%Y-%m-%d").to_string();
    let mut stmt = conn.prepare(
        "SELECT id, note_id, front, back, interval, ease, repetitions, next_review, created_at
         FROM flashcards
         WHERE substr(next_review, 1, 10) <= ?1
         ORDER BY next_review ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![today], map_flashcard_row)?;
    rows.collect()
}

pub fn get_flashcard_by_id(conn: &Connection, id: i64) -> SqlResult<Flashcard> {
    conn.query_row(
        "SELECT id, note_id, front, back, interval, ease, repetitions, next_review, created_at
         FROM flashcards WHERE id = ?1",
        params![id],
        map_flashcard_row,
    )
}

pub fn insert_flashcard(
    conn: &Connection,
    note_id: i64,
    front: &str,
    back: &str,
) -> SqlResult<Flashcard> {
    let now = Utc::now().to_rfc3339();
    let today = Utc::now().format("%Y-%m-%d").to_string();
    conn.execute(
        "INSERT INTO flashcards (note_id, front, back, interval, ease, repetitions, next_review, created_at)
         VALUES (?1, ?2, ?3, 0, 2.5, 0, ?4, ?5)",
        params![note_id, front, back, &today, &now],
    )?;
    let id = conn.last_insert_rowid();
    get_flashcard_by_id(conn, id)
}

pub fn update_flashcard_content(
    conn: &Connection,
    id: i64,
    front: &str,
    back: &str,
) -> SqlResult<Flashcard> {
    conn.execute(
        "UPDATE flashcards SET front = ?1, back = ?2 WHERE id = ?3",
        params![front, back, id],
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
    Ok(Flashcard {
        id: row.get(0)?,
        note_id: row.get(1)?,
        front: row.get(2)?,
        back: row.get(3)?,
        interval: row.get(4)?,
        ease: row.get(5)?,
        repetitions: row.get(6)?,
        next_review: row.get(7)?,
        created_at: row.get(8)?,
    })
}
