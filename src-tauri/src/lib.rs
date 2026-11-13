mod workspace;
mod git;
mod terminal;
mod ow;

use std::{collections::HashMap,path::PathBuf,sync::{Arc,Mutex}};

pub struct AppState {
 pub workspace:Mutex<Option<PathBuf>>,
 pub sessions:Mutex<HashMap<String,Arc<terminal::TerminalSession>>>,
}

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
 tauri::Builder::default()
 .plugin(tauri_plugin_dialog::init())
 .plugin(tauri_plugin_opener::init())
 .manage(AppState{workspace:Mutex::new(None),sessions:Mutex::new(HashMap::new())})
 .invoke_handler(tauri::generate_handler![
    workspace::set_workspace,workspace::get_workspace,workspace::list_files,
    workspace::read_file,workspace::write_file,workspace::new_entry,
    workspace::rename_entry,workspace::delete_entry,workspace::create_project,
    git::git_status,git::git_action,git::git_clone,git::github_publish,git::github_pr_list,git::github_pr_create,
    terminal::terminal_start,terminal::terminal_write,terminal::terminal_stop,terminal::terminal_history,terminal::terminal_resize,
    terminal::ow_task,ow::ow_toolchain_info,ow::ow_check,ow::environment_status,
 ])
 .run(tauri::generate_context!())
 .expect("Owler IDE could not start");
}
