//! PDF Studio's native side.
//!
//! Deliberately thin: all PDF logic lives in TypeScript (see docs/ARCHITECTURE.md §13).
//! Rust owns the window, OS dialogs and file access, plus one custom command:
//! `save_atomic`.

mod save;

use std::path::PathBuf;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

/// Writes the PDF bytes to `path` atomically (see save.rs).
///
/// The bytes arrive as the raw IPC body (no JSON/base64 overhead for a 50 MB file);
/// the target path arrives percent-encoded in the `x-path` header, because a raw
/// body leaves no room for named arguments.
///
/// Security: the path must already be in the fs scope, which only happens when
/// the user picked it in an Open or Save dialog. The webview can't write anywhere
/// else even if a bug tried to.
#[tauri::command]
async fn save_atomic<R: Runtime>(app: AppHandle<R>, request: Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .map(|v| PathBuf::from(percent_decode_str(v).decode_utf8_lossy().into_owned()))
        .ok_or("missing x-path header")?;

    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes in the request body".into());
    };

    if !app.fs_scope().is_allowed(&path) {
        return Err(format!("not allowed to write {}", path.display()));
    }

    save::write_atomic(&path, bytes)
        .map_err(|err| format!("could not save {}: {err}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_atomic])
        .run(tauri::generate_context!())
        .expect("error while running PDF Studio");
}
