pub mod db;
pub mod media;
pub mod scheduler;
pub mod task_router;

use db::{CardType, Deck, Flashcard, Folder, ImportDeckResult, Note};
use rusqlite::Connection;
use scheduler::{calculate_sm2_schedule, ReviewSchedule};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};
use task_router::{AgentTask, RoutingDecision, TaskRouter};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub router: TaskRouter,
    pub images_dir: PathBuf,
}

// ============================================================================
// Phase 1: Folder & Nested Directory Commands
// ============================================================================

#[tauri::command]
fn get_folders(state: State<'_, AppState>) -> Result<Vec<Folder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_folder(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<i64>,
) -> Result<Folder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_folder(&conn, &name, parent_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_folder(
    state: State<'_, AppState>,
    id: i64,
    name: String,
    parent_id: Option<i64>,
) -> Result<Folder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_folder_by_id(&conn, id, &name, parent_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_folder(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_folder_by_id(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_note_to_folder(
    state: State<'_, AppState>,
    id: i64,
    folder_id: Option<i64>,
) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::move_note_to_folder(&conn, id, folder_id).map_err(|e| e.to_string())
}

// ============================================================================
// Notes Commands (with `folder_id` support)
// ============================================================================

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
fn create_note(
    state: State<'_, AppState>,
    title: String,
    content: String,
    folder_id: Option<i64>,
) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_note_in_folder(&conn, &title, &content, folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_note(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    content: String,
    folder_id: Option<i64>,
) -> Result<Note, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if folder_id.is_some() {
        db::update_note_with_folder(&conn, id, &title, &content, folder_id)
            .map_err(|e| e.to_string())
    } else {
        db::update_note_by_id(&conn, id, &title, &content).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn delete_note(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_note_by_id(&conn, id).map_err(|e| e.to_string())
}

// ============================================================================
// Phase 2: Local Image & Media Support (`save_image` & `studyhub://` Protocol)
// ============================================================================

/// Accepts an image payload (file path or base64 buffer from clipboard/drag-and-drop),
/// saves it into `study-hub-data/images`, and returns the persistent local file path.
#[tauri::command]
fn save_image(
    state: State<'_, AppState>,
    payload: Option<String>,
    image_payload: Option<String>,
    file_path: Option<String>,
    base64_data: Option<String>,
    filename: Option<String>,
) -> Result<String, String> {
    let raw = payload
        .or(image_payload)
        .or(file_path)
        .or(base64_data)
        .ok_or_else(|| {
            "Missing image payload: provide `payload`, `filePath`, or `base64Data`.".to_string()
        })?;
    media::save_image_to_dir(&state.images_dir, &raw, filename.as_deref())
}

/// Reads a saved image from `study-hub-data/images` as a `data:image/...;base64,...` URI.
#[tauri::command]
fn read_local_image(state: State<'_, AppState>, path_or_uri: String) -> Result<String, String> {
    media::read_image_as_data_url(&state.images_dir, &path_or_uri)
}

/// Custom Tauri URI scheme protocol handler (`studyhub://` and `asset://`) to securely serve
/// local image files from `study-hub-data/images` to the frontend.
pub fn handle_studyhub_protocol<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let uri_str = request.uri().to_string();
    let app_handle = ctx.app_handle();

    let images_dir = app_handle
        .try_state::<AppState>()
        .map(|s| s.images_dir.clone())
        .unwrap_or_else(|| {
            app_handle
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("study-hub-data")
                .join("images")
        });

    match media::resolve_studyhub_image_bytes(&images_dir, &uri_str) {
        Ok((bytes, mime)) => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "public, max-age=31536000, immutable")
            .body(bytes)
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
        Err(err_msg) => tauri::http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain; charset=utf-8")
            .header("Access-Control-Allow-Origin", "*")
            .body(err_msg.into_bytes())
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
    }
}

// ============================================================================
// Decks & Flashcards Commands
// ============================================================================

#[tauri::command]
fn get_decks(state: State<'_, AppState>) -> Result<Vec<Deck>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_decks(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_deck(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
) -> Result<Deck, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::insert_deck(&conn, &name, description.as_deref().unwrap_or("")).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_deck(
    state: State<'_, AppState>,
    id: i64,
    name: String,
    description: Option<String>,
) -> Result<Deck, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_deck_by_id(&conn, id, &name, description.as_deref().unwrap_or(""))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_deck(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_deck_by_id(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_deck(
    state: State<'_, AppState>,
    payload: String,
    deck_name: Option<String>,
    deck_description: Option<String>,
    format: Option<String>,
) -> Result<ImportDeckResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::import_deck_from_payload(
        &conn,
        &payload,
        deck_name.as_deref(),
        deck_description.as_deref(),
        format.as_deref(),
    )
}

#[tauri::command]
fn get_flashcards(
    state: State<'_, AppState>,
    deck_id: Option<i64>,
) -> Result<Vec<Flashcard>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_flashcards(&conn, deck_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_due_flashcards(
    state: State<'_, AppState>,
    deck_id: Option<i64>,
) -> Result<Vec<Flashcard>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::list_due_flashcards(&conn, deck_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_flashcard(
    state: State<'_, AppState>,
    deck_id: Option<i64>,
    front: String,
    back: String,
    card_type: Option<String>,
    options: Option<Vec<String>>,
    reference_tag: Option<String>,
) -> Result<Flashcard, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let ctype = card_type
        .as_deref()
        .map(CardType::from_str_lossy)
        .unwrap_or(CardType::Default);
    let opts = options.unwrap_or_default();
    db::insert_flashcard(
        &conn,
        deck_id,
        &front,
        &back,
        ctype,
        &opts,
        reference_tag.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_flashcard(
    state: State<'_, AppState>,
    id: i64,
    deck_id: Option<i64>,
    front: String,
    back: String,
    card_type: Option<String>,
    options: Option<Vec<String>>,
    reference_tag: Option<String>,
) -> Result<Flashcard, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let ctype = card_type.as_deref().map(CardType::from_str_lossy);
    db::update_flashcard_by_id(
        &conn,
        id,
        deck_id,
        &front,
        &back,
        ctype,
        options.as_deref(),
        reference_tag.as_deref(),
    )
    .map_err(|e| e.to_string())
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
        .register_uri_scheme_protocol("studyhub", handle_studyhub_protocol)
        .register_uri_scheme_protocol("asset", handle_studyhub_protocol)
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            std::fs::create_dir_all(&app_dir).ok();

            let images_dir = app_dir.join("study-hub-data").join("images");
            std::fs::create_dir_all(&images_dir).ok();

            let db_path = app_dir.join("study_hub.sqlite");
            let conn = db::init_database(&db_path)
                .expect("failed to initialize study_hub SQLite database");

            app.manage(AppState {
                db: Mutex::new(conn),
                router: TaskRouter::new(),
                images_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_folders,
            create_folder,
            update_folder,
            delete_folder,
            move_note_to_folder,
            get_notes,
            get_note,
            create_note,
            update_note,
            delete_note,
            save_image,
            read_local_image,
            get_decks,
            create_deck,
            update_deck,
            delete_deck,
            import_deck,
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
