use std::path::PathBuf;

use serde::Serialize;

use crate::data_location::{self, DB_FILE};
use crate::db::{self, DbState};

#[tauri::command]
pub fn get_all_settings(state: tauri::State<'_, DbState>) -> Result<Vec<(String, String)>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_all_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(
    state: tauri::State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_library_stats(state: tauri::State<'_, DbState>) -> Result<db::LibraryStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let data_dir = state.data_dir.lock().map_err(|e| e.to_string())?;
    let db_path = data_dir.join(DB_FILE);
    db::get_library_stats(&conn, &db_path.to_string_lossy()).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirInfo {
    /// The folder already holds a ckourse.db (from another computer, or an earlier move)
    has_database: bool,
    is_current: bool,
}

#[tauri::command]
pub fn inspect_data_dir(state: tauri::State<'_, DbState>, dir: String) -> Result<DataDirInfo, String> {
    let dir = PathBuf::from(dir);
    let current = state.data_dir.lock().map_err(|e| e.to_string())?;
    Ok(DataDirInfo {
        has_database: dir.join(DB_FILE).is_file(),
        is_current: data_location::same_dir(&dir, &current),
    })
}

/// Moves the database to `dir` and switches to it right away. The current file is
/// copied, not moved, so the old folder keeps a backup. When `dir` already holds a
/// database, `use_existing` picks it up as is; otherwise it is set aside as
/// `ckourse.db.bak-…` and replaced by a copy of the current one.
#[tauri::command]
pub fn change_data_dir(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
    dir: String,
    use_existing: bool,
) -> Result<String, String> {
    let target = PathBuf::from(dir);
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut current = state.data_dir.lock().map_err(|e| e.to_string())?;

    if data_location::same_dir(&target, &current) {
        return Err("Ckourse already keeps its data in this folder.".into());
    }
    std::fs::create_dir_all(&target).map_err(|e| format!("Couldn't use {}: {e}", target.display()))?;

    let target_db = target.join(DB_FILE);
    if !(use_existing && target_db.is_file()) {
        if target_db.exists() {
            data_location::set_aside(&target_db)?;
        }
        // A consistent copy that includes whatever is still in the WAL
        conn.execute("VACUUM INTO ?1", [target_db.to_string_lossy().into_owned()])
            .map_err(|e| format!("Couldn't copy the database: {e}"))?;
    }

    // Opening it runs the usual checks and migrations; refuse a file that won't open
    let new_conn = db::init_db(&target).map_err(|e| format!("The database in the new folder can't be opened: {e}"))?;
    new_conn
        .query_row("SELECT COUNT(*) FROM courses", [], |r| r.get::<_, i64>(0))
        .map_err(|e| format!("The database in the new folder can't be read: {e}"))?;

    data_location::save(&app, &target)?;

    // From here on every write goes to the new file; the old connection closes
    *conn = new_conn;
    *current = target;
    Ok(target_db.to_string_lossy().into_owned())
}
