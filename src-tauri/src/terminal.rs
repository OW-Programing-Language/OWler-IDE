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
 let cwd=workspace::root(state)?;
 let pair=native_pty_system().openpty(PtySize{rows:36,cols:140,pixel_width:0,pixel_height:0}).map_err(|e|format!("PTY unavailable: {e}"))?;
 let mut builder=CommandBuilder::new(program);
 builder.args(args);
 builder.cwd(&cwd);
 let mut path=std::env::var("PATH").unwrap_or_default();
 if let Some(bundled)=crate::ow::bundled_bin(app){
   if cfg!(windows) {path=format!("{};{}",bundled.display(),path)}else{path=format!("{}:{}",bundled.display(),path)};
 }
 if let Ok(resources) = app.path().resource_dir() {
   let bundled = resources.join("ow-toolchain");
   let jdk = bundled.join("jdk");
   if jdk.is_dir() {
     builder.env("JAVA_HOME", &jdk);
     let sep = if cfg!(windows) { ";" } else { ":" };
     path = format!("{}{}{}", jdk.join("bin").display(), sep, path);
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
  "claude"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"claude".into()])}else{("claude".into(),vec![])},
  "codex"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"codex".into()])}else{("codex".into(),vec![])},
  "gemini"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"gemini".into()])}else{("gemini".into(),vec![])},
  "aider"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"aider".into()])}else{("aider".into(),vec![])},
  "opencode"=>if cfg!(windows){("cmd.exe".into(),vec!["/D".into(),"/C".into(),"opencode".into()])}else{("opencode".into(),vec![])},
  _=>return Err("Allowed terminals: shell, claude, codex, gemini, aider, opencode".into()),
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
 let root=workspace::root(state)?;
 let _ = workspace::existing_ow(&root,entry)?;
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
 create_session(app,state,prog,args)
}

#[tauri::command]
pub fn ow_task(action:String,entry:String,name:Option<String>,kind:Option<String>,app:AppHandle,state:State<'_,AppState>)->Result<String,String>{
 start_ow(&app,&state,&action,&entry,name,kind)
}
