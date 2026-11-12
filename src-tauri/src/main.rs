// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Launches Study Hub v3 with SQLite persistence (`folders`, `notes`, `decks`, `flashcards`),
/// `save_image` local media storage (`study-hub-data/images`), and custom `studyhub://` / `asset://`
/// URI scheme protocols (`study_hub_lib::handle_studyhub_protocol`).
fn main() {
    let _protocol_handler = study_hub_lib::handle_studyhub_protocol::<tauri::Wry>;
    study_hub_lib::run()
}
