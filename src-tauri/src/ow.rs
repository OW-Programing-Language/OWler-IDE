use std::{path::PathBuf,process::Command};
use tauri::{AppHandle,Manager};
use serde::Serialize;

#[derive(Serialize)]
pub struct ToolchainInfo {pub source:String,pub available:bool,pub version:String,pub build_note:String}

pub fn bundled_bin(app:&AppHandle)->Option<PathBuf>{
 let res=app.path().resource_dir().ok()?;
 let dir=res.join("ow-toolchain").join("bin");
 if dir.is_dir(){Some(dir)} else {None}
}

// Tauri's resource_dir() returns a Windows verbatim (\\?\) path. Launching java.exe
// through such a path breaks the JVM's java.home detection ("jimage file name is null"),
// so strip the prefix before handing paths to the toolchain process.
pub(crate) fn plain(p:&std::path::Path)->String{
 let s=p.to_string_lossy().into_owned();
 #[cfg(windows)]
 {
  if let Some(rest)=s.strip_prefix(r"\\?\UNC\"){return format!(r"\\{rest}");}
  if let Some(rest)=s.strip_prefix(r"\\?\"){return rest.to_string();}
 }
 s
}

/// Build the `(program, args)` to launch the bundled JDK on a jar, with every
/// path stripped of the Windows `\\?\` verbatim prefix. Pure + total so it can be
/// unit-tested against a spaced install directory.
pub(crate) fn launch_args(java:&std::path::Path,jar:&std::path::Path)->(String,Vec<String>){
 (plain(java),vec!["-jar".into(),plain(jar)])
}

/// Plain path to the bundled JDK's java(.exe), if present.
pub(crate) fn bundled_java(app:&AppHandle)->Option<String>{
 let res=app.path().resource_dir().ok()?;
 let java=res.join("ow-toolchain").join("jdk").join("bin").join(if cfg!(windows){"java.exe"}else{"java"});
 if java.is_file(){Some(plain(&java))}else{None}
}

pub fn toolchain(app:&AppHandle)->Result<(String,Vec<String>),String>{
 if let Ok(p)=std::env::var("OWLER_OW_BIN") {
   if !p.trim().is_empty(){return Ok((p,vec![]))}
 }
 if let Ok(res)=app.path().resource_dir(){
   let dir=res.join("ow-toolchain");
   let jar=dir.join("OwIDE.jar");
   let java=dir.join("jdk").join("bin").join(if cfg!(windows){"java.exe"}else{"java"});
   if jar.is_file()&&java.is_file(){return Ok(launch_args(&java,&jar));}
 }
 Ok(("ow".into(),vec![]))
}

#[tauri::command]
pub fn ow_toolchain_info(app:AppHandle)->ToolchainInfo{
 let result=toolchain(&app);
 let note="Native `ow build` supports the compiler's procedural subset; `ow package --type web` uses the OW runtime and requires a local JDK 17+ with jpackage.".to_string();
 match result {
  Ok((prog,args))=>{
   let source=if prog=="ow"{"PATH"}else if std::env::var("OWLER_OW_BIN").is_ok(){"Custom OWLER_OW_BIN"}else{"Bundled OW compiler + JDK"};
   // Run the probe from a plain temp dir: inheriting Owler's own (possibly
   // verbatim) cwd would break the bundled JDK's java.home detection.
   let mut c=Command::new(&prog);c.args(&args).arg("version").current_dir(std::env::temp_dir());
   match c.output(){Ok(o)=>ToolchainInfo{source:source.into(),available:o.status.success(),version:String::from_utf8_lossy(&o.stdout).trim().to_string(),build_note:note},Err(e)=>ToolchainInfo{source:source.into(),available:false,version:format!("OW is not available: {e}"),build_note:note}}
  },
  Err(e)=>ToolchainInfo{source:"Unavailable".into(),available:false,version:e,build_note:note}
 }
}


/// A check is deliberately a separate non-interactive command: it can report
/// compiler errors as editor markers without starting a long-running app.
#[derive(Clone,Serialize)]
pub struct OwDiagnostic {pub file:String,pub line:u32,pub column:u32,pub severity:String,pub message:String}
#[derive(Serialize)]
pub struct OwCheckReport {pub ok:bool,pub output:String,pub diagnostics:Vec<OwDiagnostic>}

fn parse_diagnostics(output:&str,entry:&str,ok:bool)->Vec<OwDiagnostic>{
    if ok {return vec![];}
    let location = regex::Regex::new(r"(?P<file>[^\s:]+\.ow):(?P<line>\d+)(?::(?P<column>\d+))?").expect("valid OW diagnostic regex");
    let line_only = regex::Regex::new(r"(?i)\bline\s+(?P<line>\d+)\b").expect("valid line regex");
    let messages:Vec<&str>=output.lines().filter(|s|{
        let t=s.trim();!t.is_empty()&&!t.starts_with("at ")&&!t.starts_with("Caused by:")&&!t.starts_with("...")
    }).collect();
    let display_message=messages.iter().find(|l|l.contains("Exception")||l.contains("error")||l.contains("Error"))
        .copied().or_else(||messages.first().copied()).unwrap_or("OW check failed").trim();
    let message=display_message.strip_prefix("Exception in thread \"main\" ").unwrap_or(display_message).to_string();
    if let Some(caps)=location.captures(output){
        let file=caps.name("file").map(|m|m.as_str()).unwrap_or(entry).to_string();
        let line=caps.name("line").and_then(|m|m.as_str().parse().ok()).unwrap_or(1);
        let column=caps.name("column").and_then(|m|m.as_str().parse().ok()).unwrap_or(1);
        return vec![OwDiagnostic{file,line,column,severity:"error".into(),message}]
    }
    let line=line_only.captures(output).and_then(|c|c.name("line")).and_then(|m|m.as_str().parse().ok()).unwrap_or(1);
    vec![OwDiagnostic{file:entry.into(),line,column:1,severity:"error".into(),message}]
}

#[tauri::command]
pub fn ow_check(entry:String,app:AppHandle,state:tauri::State<'_,crate::AppState>)->Result<OwCheckReport,String>{
    let (root,rel)=crate::workspace::resolve(&state,&entry)?;
    let _ = crate::workspace::existing_ow(&root,&rel)?;
    let prefix=crate::workspace::prefix_of(&entry);
    let (program,mut args)=toolchain(&app)?;
    args.push("check".into());args.push(rel.clone());
    // Launch from a plain (non-verbatim) cwd: a `\\?\` working directory breaks
    // the bundled JDK's java.home detection when the install path has a space.
    let output=Command::new(program).args(args).current_dir(plain(&root)).output().map_err(|e|format!("Unable to execute OW compiler: {e}"))?;
    let stdout=String::from_utf8_lossy(&output.stdout);
    let stderr=String::from_utf8_lossy(&output.stderr);
    let combined=format!("{stdout}{stderr}");
    let ok=output.status.success();
    let mut diagnostics=parse_diagnostics(&combined,&rel,ok);
    // Re-attach the root namespace so the editor can match markers to the tab.
    if !prefix.is_empty(){ for d in &mut diagnostics { d.file=format!("{prefix}/{}",d.file); } }
    Ok(OwCheckReport{ok,diagnostics,output:combined})
}

#[cfg(test)]
mod diagnostic_tests{
 use super::*;
 #[test] fn parses_span(){
  let errors=parse_diagnostics("Compiler error src/main.ow:19:7 bad type","src/main.ow",false);
  assert_eq!(errors[0].line,19);assert_eq!(errors[0].column,7);
 }
 #[test] fn passes_without_diagnostics(){assert!(parse_diagnostics("check passed","src/main.ow",true).is_empty());}
 #[test] fn falls_back_without_span(){
  let errors=parse_diagnostics("java.lang.IllegalArgumentException: invalid syntax at line 8","src/main.ow",false);
  assert_eq!(errors[0].line,8);
 }
}


pub(crate) fn collect_ow(base:&std::path::Path,dir:&std::path::Path,out:&mut Vec<PathBuf>){
 let skip=[".git","node_modules","target","dist","build",".packaging",".next",".idea"];
 let Ok(entries)=std::fs::read_dir(dir) else {return};
 for e in entries.flatten(){
  let p=e.path();
  let name=e.file_name().to_string_lossy().to_string();
  if skip.contains(&name.as_str())||p.is_symlink(){continue}
  if p.is_dir(){collect_ow(base,&p,out)}
  else if p.extension().and_then(|s|s.to_str())==Some("ow"){out.push(p)}
 }
}

/// Resolve the OW entry file that should actually be compiled/run. The native
/// and runtime compilers both require a `main:` block, so an open module like
/// `Achievements.ow` must never be used as the entry. Prefer the caller's file
/// when it has a `main:`, otherwise search the project (favouring `main.ow` and
/// shallow paths).
#[tauri::command]
pub fn ow_entry(preferred:Option<String>,state:tauri::State<'_,crate::AppState>)->Result<String,String>{
 let main_re=regex::Regex::new(r"(?m)^\s*main\s*:").expect("valid main regex");
 let has_main=|p:&std::path::Path|std::fs::read_to_string(p).map(|s|main_re.is_match(&s)).unwrap_or(false);
 // Search within the root that the preferred file belongs to (primary by default).
 let (root,prefix)=match preferred.as_ref().filter(|s|!s.is_empty()){
  Some(pref)=>{
   let (root,rel)=crate::workspace::resolve(&state,pref)?;
   if let Ok(full)=crate::workspace::existing_ow(&root,&rel){ if has_main(&full){return Ok(pref.clone())} }
   (root,crate::workspace::prefix_of(pref))
  },
  None=>(crate::workspace::root(&state)?,String::new()),
 };
 let mut candidates=Vec::new();
 collect_ow(&root,&root,&mut candidates);
 candidates.sort_by_key(|p|(p.file_name().and_then(|n|n.to_str())!=Some("main.ow"),p.components().count()));
 for p in &candidates{
  if has_main(p){
   if let Ok(rel)=p.strip_prefix(&root){
    let rel=rel.to_string_lossy().replace('\\',"/");
    return Ok(if prefix.is_empty(){rel}else{format!("{prefix}/{rel}")});
   }
  }
 }
 Err("No .ow file with a 'main:' block was found in this project. Open the file that starts your program and try again.".into())
}

#[derive(Clone,Serialize)]
pub struct CliAvailability {pub name:String,pub available:bool}
fn executable_present(name:&str)->bool{
 let variants:Vec<String>=if cfg!(windows){vec![format!("{name}.exe"),format!("{name}.cmd"),format!("{name}.bat"),name.into()]}
 else{vec![name.into()]};
 std::env::var_os("PATH").map(|paths|std::env::split_paths(&paths).any(|dir|variants.iter().any(|file|dir.join(file).is_file()))).unwrap_or(false)
}
#[tauri::command]
pub fn environment_status(app:AppHandle)->Vec<CliAvailability>{
 let mut info:Vec<CliAvailability>=["git","gh","java","clang","zig","claude","codex","gemini","aider","opencode"]
  .iter().map(|name|CliAvailability{name:(*name).into(),available:executable_present(name)}).collect();
 info.push(CliAvailability{name:"ow compiler".into(),available:ow_toolchain_info(app).available});
 info
}
#[cfg(test)]
mod environment_tests{use super::*;
 #[test] fn never_claims_fake_binary(){assert!(!executable_present("owler-absolutely-nonexistent-cli-bc4e06"));}
}

#[cfg(test)]
mod verbatim_tests{
 use super::plain;
 use std::path::Path;
 // A `\\?\` prefix on java.exe/the jar/the cwd breaks the bundled JDK's java.home
 // detection ("jimage file name is null"). The install path "Owler IDE" has a
 // space, which is exactly what pushes Windows into the verbatim fallback, so the
 // spawned command line must never contain `\\?\`.
 #[test] fn strips_verbatim_prefix_even_with_spaces(){
  let jar=Path::new(r"\\?\C:\Program Files\Owler IDE\ow-toolchain\OwIDE.jar");
  let out=plain(jar);
  #[cfg(windows)]{
   assert!(!out.contains(r"\\?\"), "verbatim prefix leaked into: {out}");
   assert_eq!(out, r"C:\Program Files\Owler IDE\ow-toolchain\OwIDE.jar");
   assert!(out.contains("Owler IDE"), "space-containing directory was lost: {out}");
  }
 }
 #[test] fn strips_unc_verbatim_prefix(){
  let p=Path::new(r"\\?\UNC\server\share\Owler IDE\jdk\bin\java.exe");
  let out=plain(p);
  #[cfg(windows)]{
   assert!(!out.contains(r"\\?\"), "UNC verbatim prefix leaked into: {out}");
   assert_eq!(out, r"\\server\share\Owler IDE\jdk\bin\java.exe");
  }
 }
 #[test] fn leaves_plain_paths_unchanged(){
  let p=Path::new(r"C:\Program Files\Owler IDE\jdk\bin\java.exe");
  assert_eq!(plain(p), r"C:\Program Files\Owler IDE\jdk\bin\java.exe");
 }
 // The whole assembled command line — program + every arg — must be free of the
 // verbatim prefix when the install directory ("Owler IDE") contains a space.
 #[test] fn assembled_launch_has_no_verbatim_prefix(){
  let res=Path::new(r"\\?\C:\Users\elias\AppData\Local\Owler IDE");
  let dir=res.join("ow-toolchain");
  let jar=dir.join("OwIDE.jar");
  let java=dir.join("jdk").join("bin").join("java.exe");
  let (prog,args)=super::launch_args(&java,&jar);
  let line=std::iter::once(prog).chain(args).collect::<Vec<_>>().join(" ");
  #[cfg(windows)]{
   assert!(!line.contains(r"\\?\"), "verbatim prefix leaked into command line: {line}");
   assert!(line.contains("Owler IDE"), "space-containing install dir was lost: {line}");
  }
 }
}
