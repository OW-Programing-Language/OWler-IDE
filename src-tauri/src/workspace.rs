use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};
use crate::AppState;
use tauri::State;

#[derive(Clone, Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub directory: bool,
    pub children: Vec<FileNode>,
}

pub fn root(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state.workspace.lock().map_err(|e| e.to_string())?
        .clone().ok_or_else(|| "Open a folder first".to_string())
}

fn valid_path(root: &Path, relative: &str, may_create: bool) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if relative.is_empty() || rel.is_absolute() || rel.components().any(|c| !matches!(c, std::path::Component::Normal(_))) {
        return Err("Only relative project paths without '..' are allowed".into());
    }
    let candidate = root.join(rel);
    let checked = if may_create {
        let parent = candidate.parent().ok_or("Invalid parent")?;
        fs::canonicalize(parent).map_err(|e| format!("Parent folder: {e}"))?
    } else {
        fs::canonicalize(&candidate).map_err(|e| e.to_string())?
    };
    if !checked.starts_with(root) { return Err("Path escapes the workspace".into()); }
    Ok(candidate)
}

/// Resolve an OW file without following links out of the active project.
pub fn existing_ow(root: &Path, entry: &str) -> Result<PathBuf, String> {
    let file = valid_path(root, entry, false)?;
    let canonical = fs::canonicalize(file).map_err(|e| e.to_string())?;
    if !canonical.is_file() || canonical.extension().and_then(|s| s.to_str()) != Some("ow") {
        return Err("Choose an existing .ow file inside the project".into());
    }
    Ok(canonical)
}

fn scan(base: &Path, dir: &Path, depth: usize) -> Vec<FileNode> {
    if depth == 0 { return vec![]; }
    let mut entries: Vec<_> = fs::read_dir(dir).ok().into_iter().flatten().filter_map(Result::ok).collect();
    entries.sort_by_key(|e| (!e.path().is_dir(), e.file_name().to_string_lossy().to_lowercase()));
    entries.into_iter().filter_map(|e| {
        let name = e.file_name().to_string_lossy().to_string();
        if [".git", "node_modules", "target", "dist", ".idea", ".next", "build", ".DS_Store"].contains(&name.as_str()) { return None; }
        let path = e.path();
        if path.is_symlink() { return None; }
        let directory = path.is_dir();
        let rel = path.strip_prefix(base).ok()?.to_string_lossy().replace('\\', "/");
        Some(FileNode { name, path: rel, directory, children: if directory {scan(base, &path, depth - 1)} else {vec![]} })
    }).collect()
}

#[tauri::command]
pub fn set_workspace(path: String, state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    let dir = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !dir.is_dir() { return Err("Select an existing directory".into()); }
    *state.workspace.lock().map_err(|e| e.to_string())? = Some(dir.clone());
    Ok(scan(&dir, &dir, 8))
}

#[tauri::command]
pub fn get_workspace(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.workspace.lock().map_err(|e| e.to_string())?.as_ref().map(|p|p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_files(state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    let root = root(&state)?;
    Ok(scan(&root, &root, 8))
}

#[tauri::command]
pub fn read_file(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let root = root(&state)?;
    let full = valid_path(&root, &path, false)?;
    if !full.is_file() { return Err("Not a file".into()); }
    if full.metadata().map_err(|e|e.to_string())?.len() > 5_000_000 { return Err("File is larger than the 5 MB editor limit".into()); }
    fs::read_to_string(full).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = root(&state)?;
    let full = valid_path(&root, &path, true)?;
    if full.exists() && full.is_symlink() { return Err("Symlinked files cannot be edited".into()); }
    if content.len() > 5_000_000 { return Err("File exceeds editor size limit".into()); }
    fs::write(full, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn new_entry(path: String, directory: bool, state: State<'_, AppState>) -> Result<(), String> {
    let root = root(&state)?;
    let full = valid_path(&root, &path, true)?;
    if full.exists() { return Err("That name is already in use".into()); }
    if directory { fs::create_dir(&full).map_err(|e|e.to_string())?; }
    else { fs::write(&full, "").map_err(|e|e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn rename_entry(path: String, new_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = root(&state)?;
    let old = valid_path(&root, &path, false)?;
    let new = valid_path(&root, &new_path, true)?;
    if new.exists() { return Err("Destination already exists".into()); }
    fs::rename(old, new).map_err(|e|e.to_string())
}

#[tauri::command]
pub fn delete_entry(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = root(&state)?;
    let full = valid_path(&root, &path, false)?;
    if full.is_dir() { fs::remove_dir_all(full).map_err(|e|e.to_string()) }
    else { fs::remove_file(full).map_err(|e|e.to_string()) }
}

fn create_file(root: &Path, path: &str, content: &str) -> Result<(), String> {
    let full = root.join(path);
    fs::create_dir_all(full.parent().unwrap()).map_err(|e|e.to_string())?;
    fs::write(full, content).map_err(|e|e.to_string())
}

#[tauri::command]
pub fn create_project(base_dir: String, name: String, kind: String, state: State<'_, AppState>) -> Result<String, String> {
    if name.is_empty() || name.len() > 50 || !name.chars().all(|c|c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Use 1–50 letters, digits, dashes, or underscores for the project name".into());
    }
    let template = match kind.as_str() {
        "web" => include_str!("../templates/web.ow"),
        "ui" => include_str!("../templates/ui.ow"),
        "console" => include_str!("../templates/console.ow"),
        _ => return Err("Unknown project template".into()),
    };
    let parent = fs::canonicalize(&base_dir).map_err(|e|e.to_string())?;
    if !parent.is_dir() { return Err("Select a parent folder".into()); }
    let dir = parent.join(&name);
    fs::create_dir(&dir).map_err(|e|format!("Could not create project: {e}"))?;
    create_file(&dir, "src/main.ow", template)?;
    create_file(&dir, ".gitignore", "dist/\nbuild/\now-data.json\n*.exe\n*.msi\n")?;
    create_file(&dir, "README.md", &format!("# {name}\n\nCreated with Owler IDE.\n\n```sh\now check src/main.ow\now run src/main.ow\n# For web / GUI application bundles:\now package src/main.ow --name {name} --type {} --out dist\n```\n", if kind=="web" {"web"} else if kind=="ui" {"gui"} else {"console"}))?;
    let _ = std::process::Command::new("git").args(["init", "-b", "main"]).current_dir(&dir).output();
    *state.workspace.lock().map_err(|e|e.to_string())?=Some(dir.clone());
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test] fn reject_traversal() {
    let dir = std::env::temp_dir();
    assert!(valid_path(&dir, "../secret", false).is_err());
    assert!(valid_path(&dir, "/etc/passwd", false).is_err());
  }
}
