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

pub fn toolchain(app:&AppHandle)->Result<(String,Vec<String>),String>{
 if let Ok(p)=std::env::var("OWLER_OW_BIN") {
   if !p.trim().is_empty(){return Ok((p,vec![]))}
 }
 if let Ok(res)=app.path().resource_dir(){
   let dir=res.join("ow-toolchain");
   let jar=dir.join("OwIDE.jar");
   let java=dir.join("jdk").join("bin").join(if cfg!(windows){"java.exe"}else{"java"});
   if jar.is_file()&&java.is_file(){return Ok((java.to_string_lossy().to_string(),vec!["-jar".into(),jar.to_string_lossy().to_string()]));}
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
   let mut c=Command::new(&prog);c.args(&args).arg("version");
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
    let root=crate::workspace::root(&state)?;
    let _ = crate::workspace::existing_ow(&root,&entry)?;
    let (program,mut args)=toolchain(&app)?;
    args.push("check".into());args.push(entry.clone());
    let output=Command::new(program).args(args).current_dir(&root).output().map_err(|e|format!("Unable to execute OW compiler: {e}"))?;
    let stdout=String::from_utf8_lossy(&output.stdout);
    let stderr=String::from_utf8_lossy(&output.stderr);
    let combined=format!("{stdout}{stderr}");
    let ok=output.status.success();
    Ok(OwCheckReport{ok,diagnostics:parse_diagnostics(&combined,&entry,ok),output:combined})
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
