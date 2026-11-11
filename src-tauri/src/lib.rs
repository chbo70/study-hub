pub mod db;
pub mod scheduler;
pub mod task_router;

use db::{Flashcard, Note};
use rusqlite::Connection;
use scheduler::{calculate_sm2_schedule, ReviewSchedule};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};
use task_router::{AgentTask, RoutingDecision, TaskRouter};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub router: TaskRouter,
}

#[tauri::command]
fn get_notes(state: State<'_, AppState>) -> Result<Vec<Note>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_notes(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_note(state: State<'_, AppState>, id: i64) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_note_by_id(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_note(state: State<'_, AppState>, title: String, content: String) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_note(&conn, &title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_note(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    content: String,
) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_note_by_id(&conn, id, &title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_note_by_id(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_flashcards(
    state: State<'_, AppState>,
    note_id: Option<i64>,
) -> Result<Vec<Flashcard>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_flashcards(&conn, note_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_due_flashcards(state: State<'_, AppState>) -> Result<Vec<Flashcard>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_due_flashcards(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_flashcard(
    state: State<'_, AppState>,
    note_id: i64,
    front: String,
    back: String,
) -> Result<Flashcard, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_flashcard(&conn, note_id, &front, &back).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_flashcard(
    state: State<'_, AppState>,
    id: i64,
    front: String,
    back: String,
) -> Result<Flashcard, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_flashcard_content(&conn, id, &front, &back).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_flashcard(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_flashcard_by_id(&conn, id).map_err(|e| e.to_string())
}

/// Calculates the next review schedule (interval, ease, repetitions, next_review)
/// and persists it if `flashcard_id` is provided.
#[tauri::command]
fn calculate_next_review(
    state: State<'_, AppState>,
    flashcard_id: Option<i64>,
    interval: Option<i64>,
    ease: Option<f64>,
    repetitions: Option<i64>,
    quality: u8,
) -> Result<ReviewSchedule, String> {
    if let Some(card_id) = flashcard_id {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let card = db::get_flashcard_by_id(&conn, card_id).map_err(|e| e.to_string())?;
        let schedule = calculate_sm2_schedule(card.interval, card.ease, card.repetitions, quality);
        db::update_flashcard_schedule(
            &conn,
            card_id,
            schedule.interval,
            schedule.ease,
            schedule.repetitions,
            &schedule.next_review,
        )
        .map_err(|e| e.to_string())?;
        Ok(schedule)
    } else {
        Ok(calculate_sm2_schedule(
            interval.unwrap_or(0),
            ease.unwrap_or(2.5),
            repetitions.unwrap_or(0),
            quality,
        ))
    }
}

/// Reviews a flashcard by ID using quality grade (0..=5) and returns the updated Flashcard.
#[tauri::command]
fn review_flashcard(
    state: State<'_, AppState>,
    id: i64,
    quality: u8,
) -> Result<Flashcard, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let card = db::get_flashcard_by_id(&conn, id).map_err(|e| e.to_string())?;
    let schedule = calculate_sm2_schedule(card.interval, card.ease, card.repetitions, quality);
    db::update_flashcard_schedule(
        &conn,
        id,
        schedule.interval,
        schedule.ease,
        schedule.repetitions,
        &schedule.next_review,
    )
    .map_err(|e| e.to_string())
}

/// Routes a single agent task using the static Multi-Model `TaskRouter`.
#[tauri::command]
fn route_agent_task(state: State<'_, AppState>, task: AgentTask) -> RoutingDecision {
    state.router.route_task(&task)
}

/// Routes a batch of upcoming agent tasks using the static Multi-Model `TaskRouter`.
#[tauri::command]
fn route_agent_tasks(state: State<'_, AppState>, tasks: Vec<AgentTask>) -> Vec<RoutingDecision> {
    state.router.route_batch(&tasks)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("study_hub.sqlite");
            let conn = db::init_database(&db_path)
                .expect("failed to initialize study_hub SQLite database");

            app.manage(AppState {
                db: Mutex::new(conn),
                router: TaskRouter::new(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_notes,
            get_note,
            create_note,
            update_note,
            delete_note,
            get_flashcards,
            get_due_flashcards,
            create_flashcard,
            update_flashcard,
            delete_flashcard,
            calculate_next_review,
            review_flashcard,
            route_agent_task,
            route_agent_tasks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
