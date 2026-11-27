use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};
use crate::AppState;
use tauri::State;

#[derive(Clone, Serialize, Hash)]
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
        if name == "deps" && dir.file_name().and_then(|n| n.to_str()) == Some(".ow") { return None; }
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


/// A snapshot is bound to the exact root ordering, because @index paths are
/// otherwise ambiguous after opening, removing or promoting workspace roots.
fn checked_roots(state: &State<'_, AppState>, expected: &[String]) -> Result<Vec<PathBuf>, String> {
    let roots = state.roots.lock().map_err(|e| e.to_string())?.clone();
    if roots.len() != expected.len() || roots.iter().zip(expected).any(|(actual, wanted)| {
        actual != &PathBuf::from(wanted)
    }) {
        return Err("Workspace changed; retry after the explorer reloads".into());
    }
    Ok(roots)
}

fn resolve_snapshot(roots: &[PathBuf], path: &str) -> Result<(PathBuf, String), String> {
    let (index, relative) = if let Some(rest) = path.strip_prefix('@') {
        let (index, rel) = rest.split_once('/').ok_or("Malformed workspace path")?;
        (index.parse::<usize>().map_err(|_| "Malformed workspace path")?, rel)
    } else { (0, path) };
    let root = roots.get(index).ok_or("Workspace folder no longer open")?;
    let rel = Path::new(relative);
    if relative.is_empty() || rel.is_absolute() ||
        rel.components().any(|c| !matches!(c, std::path::Component::Normal(_))) {
        return Err("Invalid project-relative path".into());
    }
    Ok((root.clone(), relative.to_string()))
}

fn disk_text(root: &Path, rel: &str) -> Result<Option<String>, String> {
    let path = root.join(rel);
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
        Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() =>
            return Err("Not a regular editor file".into()),
        Ok(meta) if meta.len() > 5_000_000 => return Err("File exceeds editor size limit".into()),
        Ok(_) => {}
    }
    let full = valid_path(root, rel, false)?;
    fs::read_to_string(full).map(Some).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize, Hash, Debug, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
enum DiskState {
    Present { text: String },
    Missing,
    Unreadable,
}

#[derive(Serialize)]
struct DiskUpdate {
    path: String,
    revision: String,
    #[serde(flatten)]
    state: DiskState,
}

#[derive(Serialize)]
pub struct WorkspaceSnapshot {
    tree: Option<Vec<FileNode>>,
    tree_revision: String,
    files: Vec<DiskUpdate>,
}

fn revision(value: &impl std::hash::Hash) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn snapshot(roots: &[PathBuf], paths: &[String], known: &std::collections::HashMap<String, String>,
            tree_revision: Option<&str>) -> WorkspaceSnapshot {
    let tree = tree_for_roots(roots);
    let next_tree_revision = revision(&tree);
    let files = paths.iter().filter_map(|path| {
        let state = match resolve_snapshot(roots, path).and_then(|(root, rel)| disk_text(&root, &rel)) {
            Ok(Some(text)) => DiskState::Present { text },
            Ok(None) => DiskState::Missing,
            Err(_) => DiskState::Unreadable,
        };
        let next_revision = revision(&state);
        if known.get(path) == Some(&next_revision) { return None; }
        Some(DiskUpdate { path: path.clone(), revision: next_revision, state })
    }).collect();
    WorkspaceSnapshot {
        tree: if tree_revision == Some(next_tree_revision.as_str()) { None } else { Some(tree) },
        tree_revision: next_tree_revision,
        files,
    }
}

/// Poll asynchronously so filesystem traversal never blocks the Tauri UI thread.
#[tauri::command]
pub async fn sync_workspace(paths: Vec<String>, known: std::collections::HashMap<String, String>,
                            tree_revision: Option<String>, expected_roots: Vec<String>,
                            state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    let roots = checked_roots(&state, &expected_roots)?;
    let result = tauri::async_runtime::spawn_blocking(move ||
        snapshot(&roots, &paths, &known, tree_revision.as_deref())
    ).await.map_err(|e| e.to_string())?;
    checked_roots(&state, &expected_roots)?;
    Ok(result)
}

fn checked_write(root: &Path, rel: &str, content: &str, expected: Option<&str>) -> Result<(), String> {
    if content.len() > 5_000_000 { return Err("File exceeds editor size limit".into()); }
    let full = valid_path(root, rel, true)?;
    let actual = disk_text(root, rel)?;
    if actual.as_deref() != expected {
        return Err("File changed on disk; reload or confirm the current external version before saving".into());
    }
    // create_new prevents replacing a file that appeared after a missing-file check.
    if expected.is_none() {
        use std::io::Write;
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(full).map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes()).map_err(|e| e.to_string())
    } else {
        fs::write(full, content).map_err(|e| e.to_string())
    }
}

/// Compare the actual on-disk contents with the user's acknowledged baseline.
/// An external writer can still race after the comparison (no cross-process lock).
#[tauri::command]
pub fn write_file_checked(path: String, content: String, expected_content: Option<String>,
                          expected_roots: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    // Keep root ordering stable during resolution and write.
    let roots = state.roots.lock().map_err(|e| e.to_string())?;
    if roots.len() != expected_roots.len() || roots.iter().zip(&expected_roots).any(|(actual, wanted)| actual != &PathBuf::from(wanted)) {
        return Err("Workspace changed; save cancelled".into());
    }
    let (root, rel) = resolve_snapshot(&roots, &path)?;
    checked_write(&root, &rel, &content, expected_content.as_deref())
}

#[cfg(test)]
mod live_sync_tests {
    use super::*;
    use std::collections::HashMap;
    #[test]
    fn snapshots_detect_external_create_edit_rename_delete_and_skip_unchanged() {
        let root = std::env::temp_dir().join(format!("owler-sync-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/main.ow"), "first").unwrap();
        let roots = vec![fs::canonicalize(&root).unwrap()];
        let paths = vec!["src/main.ow".to_string()];
        let first = snapshot(&roots, &paths, &HashMap::new(), None);
        assert!(first.tree.is_some());
        assert_eq!(first.files[0].state, DiskState::Present { text: "first".into() });
        let known = HashMap::from([(paths[0].clone(), first.files[0].revision.clone())]);
        let unchanged = snapshot(&roots, &paths, &known, Some(&first.tree_revision));
        assert!(unchanged.tree.is_none());
        assert!(unchanged.files.is_empty());
        fs::write(root.join("src/main.ow"), "other").unwrap();
        fs::write(root.join("src/new.ow"), "new").unwrap();
        let changed = snapshot(&roots, &paths, &known, Some(&first.tree_revision));
        assert!(changed.tree.is_some());
        assert_eq!(changed.files[0].state, DiskState::Present { text: "other".into() });
        fs::rename(root.join("src/main.ow"), root.join("src/renamed.ow")).unwrap();
        let renamed = snapshot(&roots, &paths, &known, Some(&changed.tree_revision));
        assert!(renamed.tree.is_some());
        assert_eq!(renamed.files[0].state, DiskState::Missing);
        fs::remove_file(root.join("src/new.ow")).unwrap();
        assert!(snapshot(&roots, &paths, &known, Some(&renamed.tree_revision)).tree.is_some());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn checked_save_refuses_stale_or_deleted_baselines() {
        let root = std::env::temp_dir().join(format!("owler-save-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let root = fs::canonicalize(root).unwrap();
        let path = root.join("main.ow");
        fs::write(&path, "agent edit").unwrap();
        assert!(checked_write(&root, "main.ow", "mine", Some("old")).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "agent edit");
        assert!(checked_write(&root, "main.ow", "mine", None).is_err());
        checked_write(&root, "main.ow", "mine", Some("agent edit")).unwrap();
        fs::remove_file(&path).unwrap();
        assert!(checked_write(&root, "main.ow", "mine", Some("mine")).is_err());
        checked_write(&root, "main.ow", "recreated", None).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "recreated");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn multi_root_snapshot_never_confuses_identical_relative_paths() {
        let base = std::env::temp_dir().join(format!("owler-roots-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(base.join("a")).unwrap();
        fs::create_dir_all(base.join("b")).unwrap();
        fs::write(base.join("a/main.ow"), "a").unwrap();
        fs::write(base.join("b/main.ow"), "b").unwrap();
        let roots = vec![fs::canonicalize(base.join("a")).unwrap(), fs::canonicalize(base.join("b")).unwrap()];
        let snap = snapshot(&roots, &["main.ow".into(), "@1/main.ow".into(), "../outside".into()], &HashMap::new(), None);
        assert_eq!(snap.files[0].state, DiskState::Present { text: "a".into() });
        assert_eq!(snap.files[1].state, DiskState::Present { text: "b".into() });
        assert_eq!(snap.files[2].state, DiskState::Unreadable);
        fs::remove_dir_all(base).unwrap();
    }
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
/// Framework starters include their own pinned project-root dependency manifest.
fn scaffold_project(parent: &Path, name: &str, kind: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.len() > 50 ||
        !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Use 1–50 letters, digits, dashes, or underscores for the project name".into());
    }
    let template = match kind {
        "web" => include_str!("../templates/web.ow"),
        "ui" => include_str!("../templates/ui.ow"),
        "console" => include_str!("../templates/console.ow"),
        "night" => include_str!("../templates/night.ow"),
        "flow" => include_str!("../templates/flow.ow"),
        "owcord" => include_str!("../templates/owcord.ow"),
        _ => return Err("Unknown project template".into()),
    };
    if !parent.is_dir() { return Err("Select a parent folder".into()); }
    let dir = parent.join(name);
    fs::create_dir(&dir).map_err(|e| format!("Could not create project: {e}"))?;
    let result = (|| -> Result<(), String> {
        create_file(&dir, "src/main.ow", template)?;
        let manifest=match kind {
            "night"=>include_str!("../templates/night-dependencies.yml"),
            "flow"=>include_str!("../templates/flow-dependencies.yml"),
            "owcord"=>include_str!("../templates/owcord-dependencies.yml"),
            _=>include_str!("../templates/dependencies.yml"),
        };
        create_file(&dir, "dependencies.yml", manifest)?;
        if kind=="night" {
            create_file(&dir,"src/GreetingService.ow",include_str!("../templates/GreetingService.ow"))?;
            create_file(&dir,"src/GreetingController.ow",include_str!("../templates/GreetingController.ow"))?;
        }
        if kind=="flow" {
            create_file(&dir,"src/greeting/api/GreetingApi.ow",include_str!("../templates/GreetingApi.ow"))?;
            create_file(&dir,"src/greeting/infra/GreetingModule.ow",include_str!("../templates/GreetingModule.ow"))?;
        }
        if kind=="owcord" {
            create_file(&dir,".env.example","DISCORD_BOT_TOKEN=replace-with-token\nDISCORD_APPLICATION_ID=replace-with-id\nDISCORD_GUILD_ID=replace-with-id\nOWCORD_STORAGE=sqlite\n")?;
            create_file(&dir,"RUNTIME.md","Build the pinned OWCord runtime-bridge with Maven (install OW compiler first). Select the built owcord-runtime JAR in Tools > JVM Runtime Extensions. Set DISCORD_* environment variables before launching OWler. Never commit tokens. The IDE does not automatically load .env. Use a development guild.\n")?;
        }
        if kind=="night" {
            create_file(&dir,"RUNTIME.md","The annotated HTTP starter needs no extra JAR. For generated @Repository CRUD or @Transactional, build the matching Night platform JAR and select it in Tools > JVM Runtime Extensions. Configure Night JDBC and create the schema before invoking CRUD.\n")?;
            create_file(&dir,"examples/UserRepository.ow","@Repository(\"app_users\", \"id\")\nclass UserRepository:\n")?;
        }
        create_file(&dir, "tests/ExampleTest.ow",
            &include_str!("../templates/owunit-test.ow").replace("__TEST_CLASS__", "ExampleTest"))?;
        create_file(&dir, "examples/native-features.ow",
            include_str!("../templates/native-features.ow"))?;
        create_file(&dir, ".gitignore", ".ow/deps/\ndist/\nbuild/\now-data.json\n.owcord-data/\n.env\n.env.*\n!.env.example\n*.exe\n*.msi\n")?;
        create_file(&dir, "README.md", &format!(
            "# {name}\n\nCreated with OWler IDE.\n\n\
            ## Getting started\n\n```sh\now deps install\now check src/main.ow\now run src/main.ow\now test tests/\n```\n\n\
            `dependencies.yml` includes the OW Math Questions library and pins its Git version.\n\
            Add more OW repositories and libraries to that manifest, then use \
            `ow deps update` to refresh the generated `dependencies.lock.yml`.\n\
            Commit the manifest and lockfile, not the `.ow/deps/` cache.\n\n\
            {}\n",
            if kind=="owcord" { "See RUNTIME.md for extension setup. This application cannot be packaged with the current OW package command." .to_string() } else {format!("To bundle this project:\n\n```sh\now package src/main.ow --name {name} --type {} --out dist\n```", if kind == "web" || kind == "night" { "web" } else if kind == "ui" { "gui" } else { "console" })},
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

  #[test] fn scaffold_contains_hello_world_and_versioned_math_dependency() {
    let base = std::env::temp_dir().join(format!("owler-scaffold-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&base).unwrap();
    let result = (|| {
      let project = scaffold_project(&base, "hello-world", "console")?;
      let entry = fs::read_to_string(project.join("src/main.ow")).unwrap();
      let manifest = fs::read_to_string(project.join("dependencies.yml")).unwrap();
      let ignore = fs::read_to_string(project.join(".gitignore")).unwrap();
      assert!(entry.contains("main:"));
      assert!(entry.contains("fn greet(name: string):"));
      assert!(entry.contains("returns: string"));
      assert!(entry.contains("print: greet(\"World\")"));
      let native_example = fs::read_to_string(project.join("examples/native-features.ow")).unwrap();
      assert!(native_example.contains("returns: array"));
      assert!(native_example.contains("return: array(count, 3)"));
      assert!(manifest.contains("repositories:"));
      assert!(manifest.contains("OW-Programing-Language/ow-math-questions"));
      assert!(manifest.contains("version: c22d01cfee6be18d96d4c55b95b7e79892bca9f6"));
      assert!(ignore.contains(".ow/deps/"));
      assert!(scaffold_project(&base, "hello-world", "console").is_err());
      assert!(scaffold_project(&base, "../escape", "console").is_err());
      Ok::<(), String>(())
    })();
    fs::remove_dir_all(&base).unwrap();
    result.unwrap();
  }

  #[test] fn every_project_starter_receives_dependencies_yml() {
    let base = std::env::temp_dir().join(format!("owler-starters-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&base).unwrap();
    let result = (|| {
      for kind in ["console", "web", "ui", "night", "flow", "owcord"] {
        let project = scaffold_project(&base, kind, kind)?;
        assert!(project.join("src/main.ow").is_file());
        assert!(project.join("dependencies.yml").is_file());
        assert!(project.join("examples/native-features.ow").is_file());
      }
      Ok::<(), String>(())
    })();
    fs::remove_dir_all(&base).unwrap();
    result.unwrap();
  }
}
