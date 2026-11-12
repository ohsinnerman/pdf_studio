//! PDF Studio's native side.
//!
//! Deliberately thin: all PDF logic lives in TypeScript (see docs/ARCHITECTURE.md §13).
//! Rust only owns the window and OS access.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running PDF Studio");
}
