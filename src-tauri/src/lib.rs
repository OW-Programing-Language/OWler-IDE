mod workspace;
mod git;
mod terminal;
mod ow;
mod discord;
mod owunit;

use std::{collections::HashMap,path::PathBuf,sync::{Arc,Mutex}};

pub struct AppState {
 // `workspace` is the active/primary root (drives git, terminal, OW compile).
 // `roots` holds every open folder; roots[0] mirrors `workspace`.
 pub workspace:Mutex<Option<PathBuf>>,
 pub roots:Mutex<Vec<PathBuf>>,
 pub sessions:Mutex<HashMap<String,Arc<terminal::TerminalSession>>>,
 pub discord:Mutex<discord::Discord>,
 pub runtime_extensions:Mutex<HashMap<PathBuf,Vec<PathBuf>>>,
}

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
 let mut builder=tauri::Builder::default()
 .plugin(tauri_plugin_dialog::init())
 .plugin(tauri_plugin_opener::init());
 #[cfg(not(any(target_os="android",target_os="ios")))]
 {
  builder=builder
   .plugin(tauri_plugin_process::init())
   .plugin(tauri_plugin_updater::Builder::new().build());
 }
 builder
 .manage(AppState{workspace:Mutex::new(None),roots:Mutex::new(Vec::new()),sessions:Mutex::new(HashMap::new()),discord:Mutex::new(discord::Discord::default()),runtime_extensions:Mutex::new(HashMap::new())})
 .invoke_handler(tauri::generate_handler![
    workspace::set_workspace,workspace::get_workspace,workspace::list_files,
    workspace::read_file,workspace::write_file,workspace::new_entry,
    workspace::rename_entry,workspace::delete_entry,workspace::copy_entry,workspace::create_project,
    workspace::workspace_roots,workspace::add_root,workspace::remove_root,workspace::set_primary_root,
    git::git_status,git::git_action,git::git_branches,git::git_clone,git::github_publish,git::github_pr_list,git::github_pr_create,
    git::github_auth_status,git::github_token_login,git::github_logout,
    git::github_collaborators,git::github_collaborator_add,git::github_collaborator_remove,
    terminal::terminal_start,terminal::terminal_write,terminal::terminal_stop,terminal::terminal_history,terminal::terminal_resize,
    owunit::ow_test,owunit::create_owunit_test,
    terminal::ow_task,terminal::ow_serve,terminal::reload_dependencies,ow::ow_toolchain_info,ow::set_runtime_extensions,ow::get_runtime_extensions,ow::ow_check,ow::ow_entry,ow::environment_status,
    discord::discord_activity,discord::discord_clear,
 ])
 .run(tauri::generate_context!())
 .expect("Owler IDE could not start");
}
