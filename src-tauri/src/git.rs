use serde::Serialize;
use std::{path::Path,process::Command};
use tauri::State;
use crate::{AppState,workspace};

#[derive(Serialize)]
pub struct GitSnapshot { pub branch:String,pub remote:String,pub changes:Vec<GitChange>,pub last_commits:Vec<String>,pub initialized:bool }
#[derive(Serialize)]
pub struct GitChange {pub status:String,pub path:String}

fn cmd(root:&Path,args:&[&str])->Result<String,String>{
 let output=Command::new("git").args(args).current_dir(root).output().map_err(|e|format!("Could not launch git: {e}. Install Git and ensure it is on PATH."))?;
 let out=String::from_utf8_lossy(&output.stdout).trim().to_string();
 let err=String::from_utf8_lossy(&output.stderr).trim().to_string();
 if !output.status.success(){return Err(if err.is_empty(){out}else{err});}
 Ok(out)
}

#[tauri::command]
pub fn git_status(state:State<'_,AppState>)->Result<GitSnapshot,String>{
 let root=workspace::root(&state)?;
 let branch=match cmd(&root,&["branch","--show-current"]){Ok(s)=>s,Err(_)=>return Ok(GitSnapshot{branch:String::new(),remote:String::new(),changes:vec![],last_commits:vec![],initialized:false})};
 let remote=cmd(&root,&["remote","get-url","origin"]).unwrap_or_default();
 let lines=cmd(&root,&["-c","core.quotePath=false","status","--porcelain=v1","--untracked-files=all"])?;
 let changes=lines.lines().filter_map(|l| if l.len()>=3{ Some(GitChange{status:l.get(..2)?.to_string(),path:l.get(3..)?.to_string()}) } else {None}).collect();
 let last_commits=cmd(&root,&["log","-6","--pretty=format:%h  %s"]).unwrap_or_default().lines().map(ToString::to_string).collect();
 Ok(GitSnapshot{branch,remote,changes,last_commits,initialized:true})
}

#[tauri::command]
pub fn git_action(action:String,message:Option<String>,file:Option<String>,state:State<'_,AppState>)->Result<String,String>{
 let root=workspace::root(&state)?;
 let path=file.as_deref().unwrap_or("");
 // Restrict each UI action to an explicit git subcommand (never invoke a shell).
 match action.as_str(){
 "init"=>cmd(&root,&["init","-b","main"]),
 "stage_all"=>cmd(&root,&["add","-A"]),
 "stage"=>{ if path.is_empty() {return Err("Select a file".into())} cmd(&root,&["add","--",path]) },
 "unstage"=>{ if path.is_empty(){return Err("Select a file".into())} cmd(&root,&["restore","--staged","--",path]) },
 "commit"=>{let msg=message.as_deref().unwrap_or("");if msg.trim().is_empty(){return Err("Enter a commit message".into())}cmd(&root,&["commit","-m",msg])},
 "pull"=>cmd(&root,&["pull","--ff-only"]),
 "push"=>cmd(&root,&["push"]),
 "fetch"=>cmd(&root,&["fetch","--all","--prune"]),
 "diff"=>cmd(&root,&["diff","--",path]),
 "diff_staged"=>cmd(&root,&["diff","--cached"]),
 "log"=>cmd(&root,&["log","--oneline","-20"]),
 "branch_new"=>{let name=message.as_deref().unwrap_or("");if name.is_empty()||name.starts_with('-')||name.contains(' ') {return Err("Invalid branch name".into());}cmd(&root,&["switch","-c",name])},
 "branch_switch"=>{let name=message.as_deref().unwrap_or("");if name.is_empty()||name.starts_with('-'){return Err("Invalid branch name".into());}cmd(&root,&["switch",name])},
 "branches"=>cmd(&root,&["branch","--list"]),
 "remote_set"=>{let url=message.as_deref().unwrap_or("");if !(url.starts_with("https://github.com/")||url.starts_with("git@github.com:")){return Err("Only GitHub repository remotes supported here".into())}if url.starts_with('-'){return Err("Invalid URL".into())}if cmd(&root,&["remote","get-url","origin"]).is_ok(){cmd(&root,&["remote","set-url","origin",url])}else{cmd(&root,&["remote","add","origin",url])}},
 "push_upstream"=>cmd(&root,&["push","-u","origin","HEAD"]),
 _=>Err("Unsupported Git action".into())
 }
}

#[tauri::command]
pub fn git_clone(url:String, parent:String, name:Option<String>,state:State<'_,AppState>)->Result<String,String>{
 if !(url.starts_with("https://github.com/")||url.starts_with("git@github.com:"))||url.starts_with('-') {return Err("Provide a GitHub HTTPS or SSH clone URL".into());}
 let parent=std::fs::canonicalize(parent).map_err(|e|e.to_string())?;
 if !parent.is_dir(){return Err("Pick a destination folder".into())}
 let mut args=vec!["clone".to_string(),"--".to_string(),url];
 if let Some(n)=name{if n.is_empty()||!n.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err("Invalid folder name".into())}args.push(n);}
 let output=Command::new("git").args(&args).current_dir(&parent).output().map_err(|e|e.to_string())?;
 if !output.status.success(){return Err(String::from_utf8_lossy(&output.stderr).to_string())}
 let destination=String::from_utf8_lossy(&output.stderr);
 let _=destination;
 let files=std::fs::read_dir(&parent).map_err(|e|e.to_string())?;
 // Prefer explicitly named target, otherwise infer GitHub clone directory.
 let dir=if let Some(n)=args.last().filter(|_|args.len()==4){parent.join(n)}else{
 let repo=args[2].rsplit('/').next().unwrap_or("project").trim_end_matches(".git");parent.join(repo)
 };
 if !dir.is_dir(){return Err(format!("Clone finished but the expected directory was not found; candidates: {}",files.count()))}
 *state.workspace.lock().map_err(|e|e.to_string())?=Some(std::fs::canonicalize(&dir).map_err(|e|e.to_string())?);
 Ok(dir.to_string_lossy().to_string())
}

/// Publish an existing local repository using GitHub CLI authentication.
/// This intentionally does not accept or persist GitHub tokens.
#[tauri::command]
pub fn github_publish(owner:String,name:String,visibility:String,description:String,state:State<'_,AppState>)->Result<String,String>{
 let root=workspace::root(&state)?;
 let valid=|s:&str|!s.is_empty()&&s.len()<=80&&s.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_');
 if !valid(&owner)||!valid(&name){return Err("Invalid repository owner or name".into())}
 if !["public","private"].contains(&visibility.as_str()){return Err("Select public or private".into())}
 let slug=format!("{owner}/{name}");
 let vis=if visibility=="public"{"--public"}else{"--private"};
 let output=Command::new("gh")
 .args(["repo","create",&slug,"--source",".","--remote","origin",vis,"--description",&description,"--push"])
 .current_dir(&root).output().map_err(|e|format!("GitHub CLI is required for publishing: {e}. Install gh and run `gh auth login`."))?;
 let out=String::from_utf8_lossy(&output.stdout).trim().to_string();
 let err=String::from_utf8_lossy(&output.stderr).trim().to_string();
 if !output.status.success(){return Err(if err.is_empty(){out}else{err})}
 Ok(format!("Created https://github.com/{slug}\n{out}"))
}


/// GitHub PR actions use the authenticated, locally installed gh CLI. They do
/// not accept credentials and never evaluate a shell command string.
#[derive(Serialize,serde::Deserialize)]
#[serde(rename_all="camelCase")]
pub struct GithubPullRequest {
 pub number:u64,pub title:String,pub url:String,pub state:String,
 pub head_ref_name:String,pub base_ref_name:String,pub is_draft:bool,
}
fn gh(root:&Path,args:&[&str])->Result<String,String>{
 let output=Command::new("gh").args(args).current_dir(root).output().map_err(|e|format!("GitHub CLI not installed: {e}. Install gh and run 'gh auth login'."))?;
 let out=String::from_utf8_lossy(&output.stdout).to_string();
 if !output.status.success(){return Err(format!("{}{}",out,String::from_utf8_lossy(&output.stderr)))}
 Ok(out)
}
#[tauri::command]
pub fn github_pr_list(state:State<'_,AppState>)->Result<Vec<GithubPullRequest>,String>{
 let root=workspace::root(&state)?;
 let data=gh(&root,&["pr","list","--limit","40","--json","number,title,url,state,headRefName,baseRefName,isDraft"])?;
 serde_json::from_str(&data).map_err(|e|format!("Could not parse GitHub pull requests: {e}"))
}
#[tauri::command]
pub fn github_pr_create(title:String,body:String,base:String,state:State<'_,AppState>)->Result<String,String>{
 let root=workspace::root(&state)?;
 if title.trim().is_empty()||title.len()>250{return Err("Provide a PR title (maximum 250 characters)".into())}
 if base.trim().is_empty()||base.starts_with('-')||base.contains(' ')||base.len()>120{return Err("Invalid base branch".into())}
 if body.len()>100_000{return Err("PR description is too long".into())}
 gh(&root,&["pr","create","--base",&base,"--title",title.trim(),"--body",&body])
}
