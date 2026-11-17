use crate::{AppState,workspace};
use portable_pty::{native_pty_system,CommandBuilder,PtySize};
use serde::Serialize;
use std::{io::Write,sync::{Arc,Mutex}};
use tauri::{Emitter,State,AppHandle,Manager};

pub struct TerminalSession {
 pub writer:Mutex<Box<dyn Write+Send>>,
 pub history:Mutex<Vec<TerminalChunk>>,
 pub master:Mutex<Box<dyn portable_pty::MasterPty+Send>>,
 pub killer:Mutex<Box<dyn portable_pty::ChildKiller+Send+Sync>>,
}

#[derive(Clone,Serialize)]
pub struct TerminalChunk {pub session_id:String,pub data:String,pub seq:u64}
#[derive(Clone,Serialize)]
struct TerminalExit {session_id:String,code:i32}

fn create_session(app:&AppHandle,state:&State<'_,AppState>,program:String,args:Vec<String>)->Result<String,String>{
 create_session_in(app,state,program,args,None)
}
fn create_session_in(app:&AppHandle,state:&State<'_,AppState>,program:String,args:Vec<String>,cwd:Option<std::path::PathBuf>)->Result<String,String>{
 let cwd=match cwd{Some(c)=>c,None=>workspace::root(state)?};
 // Hand the child a plain path, never a `\\?\` verbatim one: the bundled JDK's
 // java.home detection fails from a verbatim cwd when the install path has a space.
 let cwd=crate::ow::plain(&cwd);
 let pair=native_pty_system().openpty(PtySize{rows:36,cols:140,pixel_width:0,pixel_height:0}).map_err(|e|format!("PTY unavailable: {e}"))?;
 let mut builder=CommandBuilder::new(program);
 builder.args(args);
 builder.cwd(&cwd);
 let mut path=std::env::var("PATH").unwrap_or_default();
 if let Some(bundled)=crate::ow::bundled_bin(app){
   let bundled=crate::ow::plain(&bundled);
   if cfg!(windows) {path=format!("{};{}",bundled,path)}else{path=format!("{}:{}",bundled,path)};
 }
 if let Ok(resources) = app.path().resource_dir() {
   let bundled = resources.join("ow-toolchain");
   let jdk = bundled.join("jdk");
   if jdk.is_dir() {
     builder.env("JAVA_HOME", crate::ow::plain(&jdk));
     let sep = if cfg!(windows) { ";" } else { ":" };
     path = format!("{}{}{}", crate::ow::plain(&jdk.join("bin")), sep, path);
   }
   let zig=bundled.join("tools").join("zig").join(if cfg!(windows) {"zig.exe"} else {"zig"});
   if zig.is_file() {builder.env("OW_ZIG", zig);}
 }
 builder.env("PATH",path);
 let mut child=pair.slave.spawn_command(builder).map_err(|e|format!("Cannot start CLI: {e}. Check it is installed and available on PATH."))?;
 let mut reader=pair.master.try_clone_reader().map_err(|e|e.to_string())?;
 let writer=pair.master.take_writer().map_err(|e|e.to_string())?;
 drop(pair.slave);
 let id=uuid::Uuid::new_v4().to_string();
 let killer=child.clone_killer();
 let session=Arc::new(TerminalSession{writer:Mutex::new(writer),history:Mutex::new(Vec::new()),master:Mutex::new(pair.master),killer:Mutex::new(killer)});
 state.sessions.lock().map_err(|e|e.to_string())?.insert(id.clone(),session.clone());
 let app_copy=app.clone();let id_copy=id.clone();
 std::thread::spawn(move || {
   let mut buf=[0u8;8192];
   loop {match std::io::Read::read(&mut reader,&mut buf){Ok(0)=>break,Ok(n)=>{
     if let Ok(mut chunks)=session.history.lock(){
       let chunk=TerminalChunk{session_id:id_copy.clone(),data:String::from_utf8_lossy(&buf[..n]).to_string(),seq:chunks.last().map(|c|c.seq+1).unwrap_or(1)};
       chunks.push(chunk.clone());
       if chunks.len()>2000 {chunks.remove(0);}
       let _=app_copy.emit("terminal-data",chunk);
     }
   },Err(_)=>break}}
   let code=child.wait().ok().map(|e|e.exit_code() as i32).unwrap_or(-1);
   let _=app_copy.emit("terminal-exit",TerminalExit{session_id:id_copy,code});
 });
 Ok(id)
}

#[tauri::command]
pub fn terminal_start(kind:String,app:AppHandle,state:State<'_,AppState>)->Result<String,String>{
 let (program,args) = match kind.as_str(){
  "shell"=>if cfg!(windows){("powershell.exe".into(),vec!["-NoLogo".into()])}else{(std::env::var("SHELL").unwrap_or("/bin/sh".into()),vec![])},
  "powershell"=>if cfg!(windows){("powershell.exe".into(),vec!["-NoLogo".into()])}else{("pwsh".into(),vec!["-NoLogo".into()])},
  "claude"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"claude".into()])}else{("claude".into(),vec![])},
  "codex"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"codex".into()])}else{("codex".into(),vec![])},
  "gemini"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"gemini".into()])}else{("gemini".into(),vec![])},
  "aider"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"aider".into()])}else{("aider".into(),vec![])},
  "opencode"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"opencode".into()])}else{("opencode".into(),vec![])},
  _=>return Err("Allowed terminals: shell, powershell, claude, codex, gemini, aider, opencode".into()),
 };
 create_session(&app,&state,program,args)
}

#[tauri::command]
pub fn terminal_history(session_id:String,state:State<'_,AppState>)->Result<Vec<TerminalChunk>,String>{
 let session=state.sessions.lock().map_err(|e|e.to_string())?.get(&session_id).cloned().ok_or("Terminal no longer available")?;
 let chunks=session.history.lock().map_err(|e|e.to_string())?.clone();
 Ok(chunks)
}

#[tauri::command]
pub fn terminal_write(session_id:String,data:String,state:State<'_,AppState>)->Result<(),String>{
 let session=state.sessions.lock().map_err(|e|e.to_string())?.get(&session_id).cloned().ok_or("Terminal no longer available")?;
 let result=session.writer.lock().map_err(|e|e.to_string())?.write_all(data.as_bytes()).map_err(|e|e.to_string());
 result
}

#[tauri::command]
pub fn terminal_stop(session_id:String,state:State<'_,AppState>)->Result<(),String>{
 let session=state.sessions.lock().map_err(|e|e.to_string())?.remove(&session_id).ok_or("Terminal no longer available")?;
 session.killer.lock().map_err(|e|e.to_string())?.kill().map_err(|e|e.to_string())?;
 Ok(())
}

#[tauri::command]
pub fn terminal_resize(session_id:String,cols:u16,rows:u16,state:State<'_,AppState>)->Result<(),String>{
 if cols<2||rows<2||cols>1000||rows>500{return Err("Invalid terminal size".into())}
 let session=state.sessions.lock().map_err(|e|e.to_string())?.get(&session_id).cloned().ok_or("Terminal no longer available")?;
 let result=session.master.lock().map_err(|e|e.to_string())?.resize(PtySize{rows,cols,pixel_width:0,pixel_height:0}).map_err(|e|e.to_string());
 result
}

pub fn start_ow(app:&AppHandle,state:&State<'_,AppState>,action:&str,entry:&str,name:Option<String>,kind:Option<String>)->Result<String,String>{
 let (root,rel)=workspace::resolve(state,entry)?;
 let _ = workspace::existing_ow(&root,&rel)?;
 let entry=rel.as_str();
 let (prog,mut args)=crate::ow::toolchain(app)?;
 match action {
  "check"|"run"|"build"=>{args.push(action.into());args.push(entry.into());},
  "package"=>{
    args.push("package".into());args.push(entry.into());
    let name=name.unwrap_or_else(||"OwApplication".into());
    if name.is_empty()||!name.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err("Use a simple application name".into())}
    let kind=kind.unwrap_or("web".into());
    if !["web","console","gui"].contains(&kind.as_str()){return Err("Unsupported package type".into())}
    args.extend(["--name".into(),name,"--type".into(),kind,"--out".into(),"dist".into()]);
  },
  _=>return Err("Invalid OW action".into())
 }
 create_session_in(app,state,prog,args,Some(root))
}

#[tauri::command]
pub fn ow_task(action:String,entry:String,name:Option<String>,kind:Option<String>,app:AppHandle,state:State<'_,AppState>)->Result<String,String>{
 start_ow(&app,&state,&action,&entry,name,kind)
}

/// Reject arbitrary files and symlinked manifests. Multi-root workspace paths
/// are resolved to their owning project before this validation runs.
fn validate_dependency_manifest(root: &std::path::Path, relative: &str) -> Result<(), String> {
 if relative != "dependencies.yml" {
  return Err("Reload Dependencies is only available for a project-root dependencies.yml".into());
 }
 let manifest=root.join(relative);
 if manifest.is_symlink() {
  return Err("Cannot reload dependencies from a symlinked dependencies.yml".into());
 }
 if !manifest.is_file() {
  return Err("Project dependencies.yml does not exist".into());
 }
 let canonical=std::fs::canonicalize(&manifest).map_err(|e|e.to_string())?;
 if !canonical.starts_with(root) {
  return Err("Dependency manifest escapes the workspace".into());
 }
 Ok(())
}

/// Apply the edited project-root manifest using OW's own dependency manager.
/// Changing a pinned dependency in dependencies.yml requires updating the lock.
#[tauri::command]
pub async fn reload_dependencies(path:String,app:AppHandle,state:State<'_,AppState>)->Result<String,String>{
 let (root,relative)=workspace::resolve(&state,&path)?;
 validate_dependency_manifest(&root,&relative)?;
 let (program,mut args)=crate::ow::toolchain(&app)?;
 args.extend(["deps".into(),"update".into()]);
 tauri::async_runtime::spawn_blocking(move||{
  let output=std::process::Command::new(program)
   .args(args)
   .current_dir(crate::ow::plain(&root))
   .output()
   .map_err(|e|format!("Could not launch OW dependencies: {e}"))?;
  let logs=format!("{}{}",String::from_utf8_lossy(&output.stdout),String::from_utf8_lossy(&output.stderr));
  if !output.status.success(){
   return Err(format!("OW dependency reload failed (exit {}): {}",
    output.status.code().map(|n|n.to_string()).unwrap_or_else(||"unknown".into()),
    logs.trim()));
  }
  Ok(if logs.trim().is_empty(){"Dependencies reloaded successfully".into()}else{logs.trim().to_string()})
 }).await.map_err(|e|format!("OW dependency reload task failed: {e}"))?
}

#[cfg(test)]
mod dependency_reload_tests {
 use super::*;
 #[test]
 fn permits_only_real_project_root_manifest() {
  let root=std::env::temp_dir().join(format!("owler-deps-reload-{}",uuid::Uuid::new_v4()));
  std::fs::create_dir_all(&root).unwrap();
  std::fs::write(root.join("dependencies.yml"),"format: 1\nrepositories: []\ndependencies: []\n").unwrap();
  assert!(validate_dependency_manifest(&root,"dependencies.yml").is_ok());
  assert!(validate_dependency_manifest(&root,"src/dependencies.yml").is_err());
  assert!(validate_dependency_manifest(&root,"../dependencies.yml").is_err());
  assert!(validate_dependency_manifest(&root,"other.yml").is_err());
  std::fs::remove_dir_all(&root).unwrap();
 }
 #[test]
 fn rejects_missing_manifest() {
  let root=std::env::temp_dir().join(format!("owler-deps-absent-{}",uuid::Uuid::new_v4()));
  std::fs::create_dir_all(&root).unwrap();
  assert!(validate_dependency_manifest(&root,"dependencies.yml").is_err());
  std::fs::remove_dir_all(&root).unwrap();
 }
}

#[derive(serde::Serialize)]
pub struct WebRun { pub session_id:String, pub port:u16, pub url:String }

/// Start an OW web application and report where it will serve, so the IDE can
/// open the preview — unlike `package`, this actually runs the server. It finds
/// the file that declares `serve: <port>`, runs an optional `scripts/build-web`
/// step, and launches from the directory the server expects.
#[tauri::command]
pub fn ow_serve(entry:Option<String>,app:AppHandle,state:State<'_,AppState>)->Result<WebRun,String>{
 let port_re=regex::Regex::new(r"(?m)^\s*serve\s*:\s*(\d+)").expect("serve regex");
 let serves=|p:&std::path::Path|->Option<u16>{
  std::fs::read_to_string(p).ok().and_then(|s|port_re.captures(&s).and_then(|c|c.get(1)).and_then(|m|m.as_str().parse().ok()))
 };
 // Resolve the serving entry: prefer the caller's file if it declares a port,
 // otherwise search the project (favouring main_ui.ow / main.ow).
 let (root,rel,port)=match entry.as_ref().filter(|s|!s.is_empty()){
  Some(e)=>{
   let (root,rel)=workspace::resolve(&state,e)?;
   match serves(&root.join(&rel)){Some(p)=>(root,rel,p),None=>find_web_entry(&root,&serves)?}
  },
  None=>{let root=workspace::root(&state)?;find_web_entry(&root,&serves)?},
 };
 workspace::existing_ow(&root,&rel)?;
 // Web servers resolve assets relative to the folder above `src/` (matching the
 // common OW layout); fall back to the project root.
 let (cwd,run_entry)=match rel.find("src/"){
  Some(i)=>(root.join(&rel[..i]),rel[i..].to_string()),
  None=>(root.clone(),rel.clone()),
 };
 // Best-effort asset build if the project ships one (e.g. generated/page.json).
 let build=cwd.join("scripts").join("build-web.mjs");
 if build.is_file(){ let _=std::process::Command::new("node").arg("scripts/build-web.mjs").current_dir(&cwd).output(); }
 // The generic `ow`/bundled runtime may not implement `web_ui`. Prefer a
 // web-capable runtime: OW_JAR, or the project's packaged OW-lang runtime jar.
 let web_jar=std::env::var("OW_JAR").ok().map(std::path::PathBuf::from).filter(|p|p.is_file())
  .or_else(||{let p=root.join(".packaging").join("ow-lang").join("target").join("OwIDE.jar");if p.is_file(){Some(p)}else{None}});
 let (prog,mut args)=match web_jar{
  Some(jar)=>{let java=crate::ow::bundled_java(&app).unwrap_or_else(||"java".into());(java,vec!["-jar".into(),crate::ow::plain(&jar)])},
  None=>crate::ow::toolchain(&app)?,
 };
 args.push("run".into());args.push(run_entry);
 let session_id=create_session_in(&app,&state,prog,args,Some(cwd))?;
 Ok(WebRun{session_id,port,url:format!("http://127.0.0.1:{port}/")})
}

fn find_web_entry(root:&std::path::Path,serves:&dyn Fn(&std::path::Path)->Option<u16>)->Result<(std::path::PathBuf,String,u16),String>{
 let mut candidates=Vec::new();
 crate::ow::collect_ow(root,root,&mut candidates);
 candidates.sort_by_key(|p|{
  let n=p.file_name().and_then(|n|n.to_str()).unwrap_or("");
  (n!="main_ui.ow",n!="main.ow",p.components().count())
 });
 for p in &candidates{
  if let Some(port)=serves(p){
   let rel=p.strip_prefix(root).map_err(|e|e.to_string())?.to_string_lossy().replace('\\',"/");
   return Ok((root.to_path_buf(),rel,port));
  }
 }
 Err("No OW web entry found — expected a file with a `serve: <port>` route.".into())
}
