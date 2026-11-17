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

/// Resolve a (possibly namespaced) project path to its owning root and the path
/// relative to that root. Paths that start with `@<index>/` address an extra
/// workspace root; everything else belongs to the primary root (`roots[0]`),
/// so single-root paths stay exactly as before.
pub fn resolve(state: &State<'_, AppState>, path: &str) -> Result<(PathBuf, String), String> {
    let roots = state.roots.lock().map_err(|e| e.to_string())?;
    if let Some(rest) = path.strip_prefix('@') {
        let (idx_str, rel) = match rest.find('/') { Some(i) => (&rest[..i], &rest[i+1..]), None => (rest, "") };
        let idx: usize = idx_str.parse().map_err(|_| "Malformed workspace path".to_string())?;
        let root = roots.get(idx).ok_or("That workspace folder is no longer open")?.clone();
        Ok((root, rel.to_string()))
    } else {
        let root = roots.first().cloned()
            .or_else(|| state.workspace.lock().ok().and_then(|w| w.clone()))
            .ok_or("Open a folder first")?;
        Ok((root, path.to_string()))
    }
}

/// The `@<index>` namespace prefix of a path (empty for the primary root).
pub fn prefix_of(path: &str) -> String {
    match path.strip_prefix('@') {
        Some(rest) => format!("@{}", rest.split('/').next().unwrap_or("")),
        None => String::new(),
    }
}

/// Build the explorer tree. With a single root the contents are returned as
/// before; with several roots each folder is a top-level node whose children
/// carry an `@<index>/` prefix (the primary root stays unprefixed).
fn tree_for_roots(roots: &[PathBuf]) -> Vec<FileNode> {
    if roots.len() <= 1 {
        return roots.first().map(|r| scan(r, r, 8, "")).unwrap_or_default();
    }
    roots.iter().enumerate().map(|(i, r)| {
        let prefix = if i == 0 { String::new() } else { format!("@{i}") };
        let name = r.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| r.to_string_lossy().to_string());
        FileNode { name, path: prefix.clone(), directory: true, children: scan(r, r, 8, &prefix) }
    }).collect()
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

fn scan(base: &Path, dir: &Path, depth: usize, prefix: &str) -> Vec<FileNode> {
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
        let full = if prefix.is_empty() { rel } else { format!("{prefix}/{rel}") };
        Some(FileNode { name, path: full, directory, children: if directory {scan(base, &path, depth - 1, prefix)} else {vec![]} })
    }).collect()
}

#[tauri::command]
pub fn set_workspace(path: String, state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    let dir = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !dir.is_dir() { return Err("Select an existing directory".into()); }
    *state.workspace.lock().map_err(|e| e.to_string())? = Some(dir.clone());
    *state.roots.lock().map_err(|e| e.to_string())? = vec![dir.clone()];
    Ok(scan(&dir, &dir, 8, ""))
}

#[tauri::command]
pub fn get_workspace(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.workspace.lock().map_err(|e| e.to_string())?.as_ref().map(|p|p.to_string_lossy().to_string()))
}

/// Absolute paths of every open root (for the UI to show which folders are loaded).
#[tauri::command]
pub fn workspace_roots(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.roots.lock().map_err(|e| e.to_string())?.iter().map(|p| p.to_string_lossy().to_string()).collect())
}

/// Add another folder to the workspace and return the combined multi-root tree.
#[tauri::command]
pub fn add_root(path: String, state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    let dir = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !dir.is_dir() { return Err("Select an existing directory".into()); }
    let mut roots = state.roots.lock().map_err(|e| e.to_string())?;
    if roots.is_empty() { *state.workspace.lock().map_err(|e| e.to_string())? = Some(dir.clone()); }
    if !roots.contains(&dir) { roots.push(dir); }
    Ok(tree_for_roots(&roots))
}

/// Remove an open folder (by absolute path). If it was the primary root, the
/// next remaining root becomes primary.
#[tauri::command]
pub fn remove_root(path: String, state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    let dir = fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
    let mut roots = state.roots.lock().map_err(|e| e.to_string())?;
    roots.retain(|r| r != &dir);
    *state.workspace.lock().map_err(|e| e.to_string())? = roots.first().cloned();
    Ok(tree_for_roots(&roots))
}

/// Promote a root to primary (index 0) so git, the terminal and OW compile
/// target it.
#[tauri::command]
pub fn set_primary_root(path: String, state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    let dir = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let mut roots = state.roots.lock().map_err(|e| e.to_string())?;
    if let Some(pos) = roots.iter().position(|r| r == &dir) {
        roots.remove(pos);
        roots.insert(0, dir.clone());
        *state.workspace.lock().map_err(|e| e.to_string())? = Some(dir);
    }
    Ok(tree_for_roots(&roots))
}

#[tauri::command]
pub fn list_files(state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    let roots = state.roots.lock().map_err(|e| e.to_string())?;
    if roots.is_empty() { let r = root(&state)?; return Ok(scan(&r, &r, 8, "")); }
    Ok(tree_for_roots(&roots))
}

#[tauri::command]
pub fn read_file(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let (root, rel) = resolve(&state, &path)?;
    let full = valid_path(&root, &rel, false)?;
    if !full.is_file() { return Err("Not a file".into()); }
    if full.metadata().map_err(|e|e.to_string())?.len() > 5_000_000 { return Err("File is larger than the 5 MB editor limit".into()); }
    fs::read_to_string(full).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let (root, rel) = resolve(&state, &path)?;
    let full = valid_path(&root, &rel, true)?;
    if full.exists() && full.is_symlink() { return Err("Symlinked files cannot be edited".into()); }
    if content.len() > 5_000_000 { return Err("File exceeds editor size limit".into()); }
    fs::write(full, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn new_entry(path: String, directory: bool, state: State<'_, AppState>) -> Result<(), String> {
    let (root, rel) = resolve(&state, &path)?;
    let full = valid_path(&root, &rel, true)?;
    if full.exists() { return Err("That name is already in use".into()); }
    if directory { fs::create_dir(&full).map_err(|e|e.to_string())?; }
    else { fs::write(&full, "").map_err(|e|e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn rename_entry(path: String, new_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let (root_a, rel_a) = resolve(&state, &path)?;
    let (root_b, rel_b) = resolve(&state, &new_path)?;
    let old = valid_path(&root_a, &rel_a, false)?;
    let new = valid_path(&root_b, &rel_b, true)?;
    if new.exists() { return Err("Destination already exists".into()); }
    fs::rename(old, new).map_err(|e|e.to_string())
}

#[tauri::command]
pub fn delete_entry(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let (root, rel) = resolve(&state, &path)?;
    let full = valid_path(&root, &rel, false)?;
    if full.is_dir() { fs::remove_dir_all(full).map_err(|e|e.to_string()) }
    else { fs::remove_file(full).map_err(|e|e.to_string()) }
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ()).map_err(|e| e.to_string())
    }
}

/// Copy a file or folder (recursively) to a new relative path within the project.
#[tauri::command]
pub fn copy_entry(path: String, new_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let (root_a, rel_a) = resolve(&state, &path)?;
    let (root_b, rel_b) = resolve(&state, &new_path)?;
    let src = valid_path(&root_a, &rel_a, false)?;
    let dst = valid_path(&root_b, &rel_b, true)?;
    if dst.exists() { return Err("Destination already exists".into()); }
    if src.is_symlink() { return Err("Cannot copy a symlink".into()); }
    copy_recursive(&src, &dst)
}

fn create_file(root: &Path, path: &str, content: &str) -> Result<(), String> {
    let full = root.join(path);
    fs::create_dir_all(full.parent().unwrap()).map_err(|e|e.to_string())?;
    fs::write(full, content).map_err(|e|e.to_string())
}

/// Create a standard OW project without overwriting an existing directory.
/// All starter types use the same project-root dependency manifest.
fn scaffold_project(parent: &Path, name: &str, kind: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.len() > 50 ||
        !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Use 1–50 letters, digits, dashes, or underscores for the project name".into());
    }
    let template = match kind {
        "web" => include_str!("../templates/web.ow"),
        "ui" => include_str!("../templates/ui.ow"),
        "console" => include_str!("../templates/console.ow"),
        _ => return Err("Unknown project template".into()),
    };
    if !parent.is_dir() { return Err("Select a parent folder".into()); }
    let dir = parent.join(name);
    fs::create_dir(&dir).map_err(|e| format!("Could not create project: {e}"))?;
    let result = (|| -> Result<(), String> {
        create_file(&dir, "src/main.ow", template)?;
        create_file(&dir, "dependencies.yml", include_str!("../templates/dependencies.yml"))?;
        create_file(&dir, ".gitignore", ".ow/deps/\ndist/\nbuild/\now-data.json\n*.exe\n*.msi\n")?;
        create_file(&dir, "README.md", &format!(
            "# {name}\n\nCreated with OWler IDE.\n\n\
            ## Getting started\n\n```sh\now deps install\now check src/main.ow\now run src/main.ow\n```\n\n\
            `dependencies.yml` includes the OW Math Questions library and pins its Git version.\n\
            Add more OW repositories and libraries to that manifest, then use \
            `ow deps update` to refresh the generated `dependencies.lock.yml`.\n\
            Commit the manifest and lockfile, not the `.ow/deps/` cache.\n\n\
            To bundle this project:\n\n```sh\now package src/main.ow --name {name} --type {} --out dist\n```\n",
            if kind == "web" { "web" } else if kind == "ui" { "gui" } else { "console" },
        ))?;
        // Git is optional; the project remains usable without it.
        let _ = std::process::Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(&dir).output();
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&dir);
        return Err(error);
    }
    Ok(dir)
}

#[tauri::command]
pub fn create_project(base_dir: String, name: String, kind: String, state: State<'_, AppState>) -> Result<String, String> {
    let parent = fs::canonicalize(&base_dir).map_err(|e| e.to_string())?;
    let dir = scaffold_project(&parent, &name, &kind)?;
    *state.workspace.lock().map_err(|e| e.to_string())? = Some(dir.clone());
    *state.roots.lock().map_err(|e| e.to_string())? = vec![dir.clone()];
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
