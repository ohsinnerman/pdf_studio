//! Atomic file saving (docs/ARCHITECTURE.md §9).
//!
//! A plain `fs::write` over the original truncates it first. If the app crashes,
//! the disk fills up or the power goes out halfway through, the user is left with
//! a broken PDF. Instead we:
//!
//! 1. write the new bytes to a temporary file in the SAME folder (so the final
//!    rename never crosses drives, which would turn it into a copy),
//! 2. flush them to disk (`sync_all`),
//! 3. rename the temporary file over the original in one step.
//!
//! The rename is the commit point: before it the original is untouched; after it
//! the new file is complete. On Windows, `std::fs::rename` replaces an existing
//! file (it uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`).

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::Duration;

/// How many times to retry the final rename. OneDrive, antivirus scanners and
/// search indexers briefly lock files they are looking at; a short wait usually
/// clears it.
const RENAME_ATTEMPTS: u32 = 6;
const RENAME_BACKOFF: Duration = Duration::from_millis(150);

pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = temp_path_for(path)?;

    let result = (|| {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file); // Windows can't rename a file that is still open.
        rename_with_retry(&tmp, path)
    })();

    if result.is_err() {
        // Best effort: don't leave temp files behind next to the user's document.
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// `report.pdf` -> `.report.pdf.pdfstudio-<pid>-<nanos>.tmp`, in the same folder.
fn temp_path_for(path: &Path) -> io::Result<PathBuf> {
    let dir = path
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?
        .to_string_lossy();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    Ok(dir.join(format!(
        ".{name}.pdfstudio-{}-{nanos}.tmp",
        std::process::id()
    )))
}

fn rename_with_retry(from: &Path, to: &Path) -> io::Result<()> {
    let mut attempt = 1;
    loop {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            // PermissionDenied is what Windows reports for "file in use by another process".
            Err(err)
                if attempt < RENAME_ATTEMPTS && err.kind() == io::ErrorKind::PermissionDenied =>
            {
                sleep(RENAME_BACKOFF * attempt);
                attempt += 1;
            }
            Err(err) => return Err(err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_a_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new.pdf");
        write_atomic(&path, b"%PDF-1.7 new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"%PDF-1.7 new");
    }

    #[test]
    fn replaces_an_existing_file_and_leaves_no_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("doc.pdf");
        fs::write(&path, b"old contents that are longer").unwrap();
        write_atomic(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        let entries: Vec<_> = fs::read_dir(dir.path()).unwrap().collect();
        assert_eq!(entries.len(), 1, "temp file left behind");
    }

    #[test]
    fn leaves_the_original_untouched_when_the_write_fails() {
        let dir = tempfile::tempdir().unwrap();
        // The target is a directory, so the final rename must fail.
        let path = dir.path().join("folder.pdf");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("inside.txt"), b"keep me").unwrap();
        assert!(write_atomic(&path, b"new").is_err());
        assert_eq!(fs::read(path.join("inside.txt")).unwrap(), b"keep me");
        let leftovers = fs::read_dir(dir.path())
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp")
            })
            .count();
        assert_eq!(leftovers, 0, "temp file left behind after failure");
    }

    #[test]
    fn temp_file_is_hidden_and_in_the_same_folder() {
        let tmp = temp_path_for(Path::new("C:/docs/report.pdf")).unwrap();
        assert_eq!(tmp.parent().unwrap(), Path::new("C:/docs"));
        let name = tmp.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with(".report.pdf.pdfstudio-"));
        assert!(name.ends_with(".tmp"));
    }
}
