use crate::{AppState,workspace,ow};
use serde::Serialize;
use std::{fs,path::{Path,PathBuf},process::Command};
use tauri::{AppHandle,State};

#[derive(Clone,Serialize)]
pub struct TestResult {
    pub name:String,
    pub file:String,
    pub passed:bool,
    pub message:String,
}

#[derive(Serialize)]
pub struct TestReport {
    pub ok:bool,
    pub passed:usize,
    pub failed:usize,
    pub output:String,
    pub results:Vec<TestResult>,
    pub exit_code:Option<i32>,
}

fn parse_test_output(output:&str, root:&Path, prefix:&str, exit_code:Option<i32>)->TestReport {
    let mut file=String::new();
    let mut results=Vec::new();
    for line in output.lines() {
        let line=line.trim();
        if let Some(path)=line.strip_prefix("Running OW tests: ") {
            let raw=Path::new(path);
            let rel=raw.strip_prefix(root).unwrap_or(raw);
            let rel=rel.to_string_lossy().replace('\\',"/").trim_start_matches("./").to_string();
            file=if prefix.is_empty() {rel} else {format!("{prefix}/{rel}")};
        } else if let Some(name)=line.strip_prefix("[PASS] ") {
            results.push(TestResult{name:name.trim().into(),file:file.clone(),passed:true,message:String::new()});
        } else if let Some(failure)=line.strip_prefix("[FAIL] ") {
            let (name,message)=failure.split_once(": ").unwrap_or((failure,"Assertion failed"));
            results.push(TestResult{name:name.trim().into(),file:file.clone(),passed:false,message:message.into()});
        }
    }
    let passed=results.iter().filter(|result|result.passed).count();
    let failed=results.len()-passed;
    TestReport {ok:exit_code==Some(0)&&!results.is_empty(),passed,failed,output:output.into(),results,exit_code}
}

fn checked_target(root:&Path,relative:&str, filter:Option<&str>)->Result<PathBuf,String>{
    let path=root.join(relative);
    let canonical=fs::canonicalize(&path).map_err(|e|format!("Test target unavailable: {e}"))?;
    if !canonical.starts_with(root) {return Err("Test target escapes the selected workspace".into());}
    if canonical.is_file() && canonical.extension().and_then(|e|e.to_str())!=Some("ow"){
        return Err("Choose an OW source file or a test directory".into());
    }
    if !canonical.is_file() && !canonical.is_dir() {return Err("Test target must be a file or directory".into());}
    if filter.is_some() && !canonical.is_file(){
        return Err("Select a .ow file to run a single test method".into());
    }
    Ok(canonical)
}

fn checked_filter(filter:&str)->Result<(),String>{
    let names:Vec<_>=filter.split('.').collect();
    if names.is_empty() || names.len()>2 || names.iter().any(|s|{
        let mut chars=s.chars();
        !matches!(chars.next(),Some(c) if c=='_' || c.is_ascii_alphabetic())
          || !chars.all(|c|c=='_' || c.is_ascii_alphanumeric())
    }){
        return Err("Invalid test method name".into());
    }
    Ok(())
}

/// Run OWUnit in a background worker; return real CLI output and exit status.
/// A test failure is a report, not an IPC transport failure.
#[tauri::command]
pub async fn ow_test(target:String,filter:Option<String>,app:AppHandle,state:State<'_,AppState>)->Result<TestReport,String>{
    let (root,relative)=workspace::resolve(&state,&target)?;
    let root=fs::canonicalize(root).map_err(|e|e.to_string())?;
    checked_target(&root,&relative,filter.as_deref())?;
    if let Some(name)=filter.as_deref(){checked_filter(name)?;}
    let prefix=workspace::prefix_of(&target);
    let (program,mut args)=ow::toolchain(&app)?;
    args.extend(["test".into(),relative]);
    if let Some(name)=filter {args.extend(["--filter".into(),name]);}
    tauri::async_runtime::spawn_blocking(move||{
        let output=Command::new(program).args(args)
            .current_dir(ow::plain(&root)).output()
            .map_err(|e|format!("Cannot run OWUnit: {e}"))?;
        let stdout=String::from_utf8_lossy(&output.stdout);
        let stderr=String::from_utf8_lossy(&output.stderr);
        let combined=format!("{stdout}{stderr}");
        Ok(parse_test_output(&combined,&root,&prefix,output.status.code()))
    }).await.map_err(|e|format!("OWUnit task failed: {e}"))?
}

fn test_class_name(name:&str)->Result<String,String>{
    let stem=name.trim().trim_end_matches(".ow");
    if stem.is_empty() || stem.len()>64 || !stem.chars().all(|c|c.is_ascii_alphanumeric()||c=='_') ||
        !matches!(stem.chars().next(),Some(c) if c.is_ascii_alphabetic()||c=='_'){
        return Err("Use a simple test class name (letters, numbers and underscores)".into());
    }
    if stem.ends_with("Test") || stem.ends_with("_test"){Ok(stem.into())}
    else{Ok(format!("{stem}Test"))}
}

/// Generate a real OWUnit class-based test without replacing existing files.
/// File is placed under <selected root>/tests/ and starts with one runnable test.
#[tauri::command]
pub fn create_owunit_test(name:String,root_path:Option<String>,state:State<'_,AppState>)->Result<String,String>{
    let selector=root_path.unwrap_or_else(||".".into());
    let (root,relative)=workspace::resolve(&state,&selector)?;
    if relative!="." && !relative.is_empty(){
        return Err("Create OWUnit tests at a workspace root".into());
    }
    let root=fs::canonicalize(&root).map_err(|e|e.to_string())?;
    let classname=test_class_name(&name)?;
    let tests=root.join("tests");
    if tests.is_symlink(){return Err("Test directory cannot be a symlink".into());}
    fs::create_dir_all(&tests).map_err(|e|e.to_string())?;
    if !fs::canonicalize(&tests).map_err(|e|e.to_string())?.starts_with(&root){
        return Err("Test directory escapes workspace".into());
    }
    let filename=format!("{classname}.ow");
    let file=tests.join(&filename);
    let source=include_str!("../templates/owunit-test.ow").replace("__TEST_CLASS__",&classname);
    let mut output=fs::OpenOptions::new().write(true).create_new(true).open(&file)
        .map_err(|e|format!("Cannot create OWUnit test: {e}"))?;
    use std::io::Write;
    output.write_all(source.as_bytes()).map_err(|e|e.to_string())?;
    let path=format!("tests/{filename}");
    let prefix=workspace::prefix_of(&selector);
    Ok(if prefix.is_empty(){path}else{format!("{prefix}/{path}")})
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn extracts_real_pass_fail_and_file_locations(){
        let text="Running OW tests: tests/CalculatorTest.ow\n[PASS] CalculatorTest.addsNumbers\n[FAIL] CalculatorTest.divides: Assertion failed: bad quotient\nOW tests: 1 passed, 1 failed.\n";
        let report=parse_test_output(text,Path::new("/tmp/ow"),"",Some(1));
        assert!(!report.ok);
        assert_eq!(report.passed,1);assert_eq!(report.failed,1);
        assert_eq!(report.results[0].file,"tests/CalculatorTest.ow");
        assert_eq!(report.results[1].name,"CalculatorTest.divides");
        assert!(report.results[1].message.contains("bad quotient"));
    }
    #[test] fn supports_secondary_workspace_prefix(){
        let report=parse_test_output("Running OW tests: tests/DemoTest.ow\n[PASS] DemoTest.ok\n",Path::new("/tmp/a"),"@1",Some(0));
        assert!(report.ok); assert_eq!(report.results[0].file,"@1/tests/DemoTest.ow");
    }
    #[test] fn validates_exact_method_selector(){
        assert!(checked_filter("CalculatorTest.addsNumbers").is_ok());
        assert!(checked_filter("topLevel").is_ok());
        assert!(checked_filter("anything;shutdown").is_err());
        assert!(checked_filter("A.B.C").is_err());
    }
    #[test] fn validates_test_names(){
        assert_eq!(test_class_name("Calculator").unwrap(),"CalculatorTest");
        assert_eq!(test_class_name("MathTest.ow").unwrap(),"MathTest");
        assert!(test_class_name("../escape").is_err());
    }
    #[test] fn prevents_unsafe_test_targets(){
        let root=std::env::temp_dir().join(format!("owler-unit-check-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("MainTest.ow"),"@Test\nfn ok():\n  call: assert(true)\n").unwrap();
        assert!(checked_target(&root,"MainTest.ow",Some("ok")).is_ok());
        assert!(checked_target(&root,".",Some("ok")).is_err());
        assert!(checked_target(&root,"../",None).is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
