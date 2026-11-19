//! Where `ckourse.db` lives.
//!
//! By default it sits in the OS app-data folder. From Settings → Library the user
//! can move it to any folder; the choice is recorded in a small file next to the
//! executable, so a copy of the app on an external drive finds its data on that
//! drive on every computer. When the data folder is on the same drive as the app,
//! the drive letter is left out of that file, so the drive may mount as E: on one
//! machine and F: on another.

use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub const DB_FILE: &str = "ckourse.db";
const POINTER_FILE: &str = "ckourse-data-location.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pointer {
    data_dir: String,
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

pub fn default_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// The pointer next to the executable wins; the one in the default folder is the
/// fallback for installs whose own folder is read-only (e.g. Program Files).
fn pointer_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(dir) = exe_dir() {
        paths.push(dir.join(POINTER_FILE));
    }
    if let Ok(dir) = default_dir(app) {
        paths.push(dir.join(POINTER_FILE));
    }
    paths
}

/// The folder to open the database from. Falls back to the default folder when no
/// pointer exists or the folder it names is missing (e.g. a drive not plugged in),
/// so the app still starts instead of failing on launch.
pub fn resolve(app: &AppHandle) -> Result<PathBuf, String> {
    for pointer in pointer_paths(app) {
        let Ok(text) = std::fs::read_to_string(&pointer) else { continue };
        let Ok(parsed) = serde_json::from_str::<Pointer>(&text) else { continue };
        match expand(&parsed.data_dir) {
            Some(dir) if dir.is_dir() => return Ok(dir),
            _ => eprintln!("ckourse: data folder in {} is unavailable, using the default", pointer.display()),
        }
    }
    default_dir(app)
}

/// Completes a stored path: drive-less ("\ckourse-data") gets the executable's drive,
/// relative ("data") is taken from the executable's folder.
fn expand(stored: &str) -> Option<PathBuf> {
    let path = PathBuf::from(stored);
    if path.is_absolute() {
        return Some(path);
    }
    let exe = exe_dir()?;
    if path.has_root() {
        // Windows only: rooted but without a drive. Pushing it onto the bare drive
        // prefix keeps the prefix and replaces the rest.
        let Some(Component::Prefix(prefix)) = exe.components().next() else { return None };
        let mut out = PathBuf::from(prefix.as_os_str());
        out.push(&path);
        return Some(out);
    }
    Some(exe.join(path))
}

/// Leaves the drive out when `dir` is on the executable's drive.
fn compact(dir: &Path) -> String {
    if let (Some(exe), Some(Component::Prefix(dir_prefix))) = (exe_dir(), dir.components().next()) {
        if let Some(Component::Prefix(exe_prefix)) = exe.components().next() {
            if dir_prefix.as_os_str().eq_ignore_ascii_case(exe_prefix.as_os_str()) {
                let rest: PathBuf = dir.components().skip(1).collect();
                return rest.to_string_lossy().into_owned();
            }
        }
    }
    dir.to_string_lossy().into_owned()
}

pub fn same_dir(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn remove_if_present(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Records `dir` as the data folder. Choosing the default folder again removes the
/// pointers instead, so the app is back to its stock behaviour.
pub fn save(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let pointers = pointer_paths(app);
    if same_dir(dir, &default_dir(app)?) {
        for p in &pointers {
            remove_if_present(p).map_err(|e| format!("Couldn't remove {}: {e}", p.display()))?;
        }
        return Ok(());
    }

    let body = serde_json::to_string_pretty(&Pointer { data_dir: compact(dir) }).map_err(|e| e.to_string())?;
    let mut last_error = String::from("No place to record the data folder");
    for (i, p) in pointers.iter().enumerate() {
        match std::fs::write(p, &body) {
            Ok(()) => {
                // Drop the lower-priority pointers so they can't disagree later
                for other in &pointers[i + 1..] {
                    remove_if_present(other).ok();
                }
                return Ok(());
            }
            Err(e) => last_error = format!("Couldn't write {}: {e}", p.display()),
        }
    }
    Err(last_error)
}

/// Renames an existing database (and its WAL sidecars) out of the way, keeping it
/// as `ckourse.db.bak-<unix time>`.
pub fn set_aside(db: &Path) -> Result<PathBuf, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = db.with_file_name(format!("{DB_FILE}.bak-{stamp}"));
    std::fs::rename(db, &backup).map_err(|e| format!("Couldn't set aside the existing database: {e}"))?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", db.display()));
        if side.exists() {
            let side_backup = PathBuf::from(format!("{}{suffix}", backup.display()));
            std::fs::rename(&side, side_backup).map_err(|e| format!("Couldn't set aside {}: {e}", side.display()))?;
        }
    }
    Ok(backup)
}

#[cfg(test)]
mod copy_tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ckourse-test-{name}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copy_takes_wal_contents_and_backup_keeps_the_old_file() {
        let from = scratch("from");
        let to = scratch("to");

        // Source in WAL mode with a row still sitting in the WAL
        let conn = crate::db::init_db(&from).unwrap();
        conn.execute("INSERT INTO settings (key, value) VALUES ('probe', 'new')", []).unwrap();

        // Target already holds an older database
        let old = rusqlite::Connection::open(to.join(DB_FILE)).unwrap();
        old.execute_batch("CREATE TABLE marker (x); INSERT INTO marker VALUES (1);").unwrap();
        drop(old);

        let backup = set_aside(&to.join(DB_FILE)).unwrap();
        assert!(backup.is_file() && !to.join(DB_FILE).exists());

        let target = to.join(DB_FILE);
        conn.execute("VACUUM INTO ?1", [target.to_string_lossy().into_owned()]).unwrap();

        let copy = crate::db::init_db(&to).unwrap();
        let v: String = copy.query_row("SELECT value FROM settings WHERE key = 'probe'", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "new");
        let kept: i64 = rusqlite::Connection::open(&backup)
            .unwrap()
            .query_row("SELECT x FROM marker", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, 1);

        drop((conn, copy));
        std::fs::remove_dir_all(&from).ok();
        std::fs::remove_dir_all(&to).ok();
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn compact_and_expand_round_trip_on_the_exe_drive() {
        let exe = exe_dir().unwrap();
        let Some(Component::Prefix(prefix)) = exe.components().next() else { panic!("no drive") };
        let drive = prefix.as_os_str().to_string_lossy().into_owned();

        let dir = PathBuf::from(format!("{drive}\\ckourse-data\\db"));
        let stored = compact(&dir);
        assert_eq!(stored, "\\ckourse-data\\db");
        assert_eq!(expand(&stored).unwrap(), dir);
    }

    #[test]
    fn other_drives_keep_their_letter() {
        let exe = exe_dir().unwrap();
        let other = if exe.to_string_lossy().starts_with("Z:") { "Y:\\data" } else { "Z:\\data" };
        assert_eq!(compact(Path::new(other)), other);
        assert_eq!(expand(other).unwrap(), PathBuf::from(other));
    }

    #[test]
    fn relative_paths_are_taken_from_the_exe_folder() {
        assert_eq!(expand("data").unwrap(), exe_dir().unwrap().join("data"));
    }
}
