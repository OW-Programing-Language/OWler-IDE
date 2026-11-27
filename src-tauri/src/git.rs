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
pub async fn git_status(state:State<'_,AppState>)->Result<GitSnapshot,String>{
 let root=workspace::root(&state)?;
 tauri::async_runtime::spawn_blocking(move||git_status_for(&root)).await.map_err(|e|e.to_string())?
}
fn git_status_for(root:&std::path::Path)->Result<GitSnapshot,String>{
 let branch=match cmd(&root,&["branch","--show-current"]){Ok(s)=>s,Err(_)=>return Ok(GitSnapshot{branch:String::new(),remote:String::new(),changes:vec![],last_commits:vec![],initialized:false})};
 let remote=cmd(&root,&["remote","get-url","origin"]).unwrap_or_default();
 let lines=cmd(&root,&["-c","core.quotePath=false","status","--porcelain=v1","--untracked-files=all"])?;
 let changes=lines.lines().filter_map(|l| if l.len()>=3{ Some(GitChange{status:l.get(..2)?.to_string(),path:l.get(3..)?.to_string()}) } else {None}).collect();
 let last_commits=cmd(&root,&["log","-6","--pretty=format:%h  %s"]).unwrap_or_default().lines().map(ToString::to_string).collect();
 Ok(GitSnapshot{branch,remote,changes,last_commits,initialized:true})
}

#[derive(Serialize)]
pub struct BranchList {pub current:String,pub branches:Vec<String>}
/// Structured branch listing so the UI can render a switcher that highlights the
/// checked-out branch without having to parse porcelain output itself.
#[tauri::command]
pub async fn git_branches(state:State<'_,AppState>)->Result<BranchList,String>{
 let root=workspace::root(&state)?;
 tauri::async_runtime::spawn_blocking(move||git_branches_for(&root)).await.map_err(|e|e.to_string())?
}
fn git_branches_for(root:&std::path::Path)->Result<BranchList,String>{
 let current=cmd(&root,&["branch","--show-current"]).unwrap_or_default();
 let raw=cmd(&root,&["branch","--list","--format=%(refname:short)"]).unwrap_or_default();
 let branches=raw.lines().map(|l|l.trim().to_string()).filter(|l|!l.is_empty()).collect();
 Ok(BranchList{current,branches})
}

#[tauri::command]
pub fn git_action(action:String,message:Option<String>,file:Option<String>,state:State<'_,AppState>)->Result<String,String>{
 // A namespaced file (from a non-primary workspace root) is staged/diffed in
 // its own repository; everything else targets the active root.
 let (root,path)=match file.as_deref(){
  Some(f) if f.starts_with('@')=>{let (r,rel)=workspace::resolve(&state,f)?;(r,rel)},
  other=>(workspace::root(&state)?,other.unwrap_or("").to_string()),
 };
 let path=path.as_str();
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
pub fn git_clone(url:String, parent:String, name:Option<String>)->Result<String,String>{
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
 // The frontend explicitly opens the cloned folder after confirming unsaved edits.
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


/// Parse the `owner/repo` slug from the origin remote so GitHub API calls can
/// target the current project. Supports HTTPS and SSH GitHub URLs.
fn origin_slug(root:&Path)->Result<String,String>{
 let url=cmd(root,&["remote","get-url","origin"]).map_err(|_|"No 'origin' remote is configured. Set a GitHub remote first.".to_string())?;
 let rest=url.trim().trim_end_matches(".git");
 let slug=rest.strip_prefix("https://github.com/")
  .or_else(||rest.strip_prefix("git@github.com:"))
  .or_else(||rest.strip_prefix("ssh://git@github.com/"))
  .ok_or("The origin remote is not a GitHub repository.")?;
 let parts:Vec<&str>=slug.split('/').filter(|s|!s.is_empty()).collect();
 if parts.len()!=2{return Err("Could not read owner/repository from the GitHub remote.".into())}
 Ok(format!("{}/{}",parts[0],parts[1]))
}

fn valid_login(s:&str)->bool{
 !s.is_empty()&&s.len()<=39&&s.chars().all(|c|c.is_ascii_alphanumeric()||c=='-')&&!s.starts_with('-')
}

/// Reports whether the local GitHub CLI holds a usable credential and, if so,
/// which account it belongs to. Used to show connection state in the UI.
#[derive(Serialize)]
pub struct GithubAuth {pub connected:bool,pub user:String,pub cli_available:bool}
#[tauri::command]
pub fn github_auth_status()->GithubAuth{
 let probe=Command::new("gh").args(["auth","status"]).output();
 let cli_available=probe.is_ok();
 let user=Command::new("gh").args(["api","user","--jq",".login"]).output()
  .ok().filter(|o|o.status.success())
  .map(|o|String::from_utf8_lossy(&o.stdout).trim().to_string())
  .unwrap_or_default();
 GithubAuth{connected:!user.is_empty(),user,cli_available}
}

/// Connect to GitHub with a personal access token. The token is handed to the
/// GitHub CLI over stdin (never written to disk by Owler, never logged) and gh
/// is configured as the Git credential helper so push/pull work over HTTPS.
#[tauri::command]
pub fn github_token_login(token:String)->Result<String,String>{
 use std::io::Write;
 let token=token.trim().to_string();
 if token.is_empty(){return Err("Paste a GitHub personal access token.".into())}
 if !token.chars().all(|c|c.is_ascii_graphic()){return Err("The token contains unexpected characters.".into())}
 let mut child=Command::new("gh").args(["auth","login","--with-token"])
  .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped())
  .spawn().map_err(|e|format!("GitHub CLI is required to connect with a token: {e}. Install gh from cli.github.com."))?;
 child.stdin.take().ok_or("Could not pass the token to gh")?.write_all(token.as_bytes()).map_err(|e|e.to_string())?;
 let out=child.wait_with_output().map_err(|e|e.to_string())?;
 if !out.status.success(){
  let err=String::from_utf8_lossy(&out.stderr).trim().to_string();
  return Err(if err.is_empty(){"GitHub rejected the token. Check that it has 'repo' scope and has not expired.".into()}else{err});
 }
 // Route Git HTTPS operations through the stored gh credential.
 let _=Command::new("gh").args(["auth","setup-git"]).output();
 let user=Command::new("gh").args(["api","user","--jq",".login"]).output()
  .ok().map(|o|String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
 Ok(if user.is_empty(){"Connected to GitHub.".into()}else{format!("Connected to GitHub as {user}.")})
}

/// Disconnect: drop the token from the GitHub CLI keyring.
#[tauri::command]
pub fn github_logout()->Result<String,String>{
 let out=Command::new("gh").args(["auth","logout","--hostname","github.com"]).output()
  .map_err(|e|format!("GitHub CLI not available: {e}"))?;
 if !out.status.success(){return Err(String::from_utf8_lossy(&out.stderr).trim().to_string())}
 Ok("Disconnected from GitHub.".into())
}

#[derive(Serialize,serde::Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Collaborator {pub login:String,pub permission:String,pub avatar_url:String,pub html_url:String}
/// List the collaborators on the origin repository via the GitHub API.
#[tauri::command]
pub fn github_collaborators(state:State<'_,AppState>)->Result<Vec<Collaborator>,String>{
 let root=workspace::root(&state)?;
 let slug=origin_slug(&root)?;
 let data=gh(&root,&["api",&format!("repos/{slug}/collaborators"),"--paginate",
  "--jq",".[]|{login:.login,permission:(.role_name//\"\"),avatarUrl:.avatar_url,htmlUrl:.html_url}"])?;
 // gh --jq streams one JSON object per line; wrap into an array for serde.
 let collaborators=data.lines().filter(|l|!l.trim().is_empty())
  .map(|l|serde_json::from_str::<Collaborator>(l)).collect::<Result<Vec<_>,_>>()
  .map_err(|e|format!("Could not parse collaborators: {e}"))?;
 Ok(collaborators)
}

const PERMISSIONS:[&str;5]=["pull","triage","push","maintain","admin"];
/// Invite a collaborator (or update their permission) on the origin repository.
#[tauri::command]
pub fn github_collaborator_add(username:String,permission:String,state:State<'_,AppState>)->Result<String,String>{
 let root=workspace::root(&state)?;
 let slug=origin_slug(&root)?;
 let username=username.trim();
 if !valid_login(username){return Err("Enter a valid GitHub username.".into())}
 if !PERMISSIONS.contains(&permission.as_str()){return Err("Choose a permission: pull, triage, push, maintain or admin.".into())}
 gh(&root,&["api","-X","PUT",&format!("repos/{slug}/collaborators/{username}"),"-f",&format!("permission={permission}")])?;
 Ok(format!("Invited {username} with {permission} access. They must accept the invitation on GitHub."))
}

/// Remove a collaborator (or revoke a pending invitation) from the origin repository.
#[tauri::command]
pub fn github_collaborator_remove(username:String,state:State<'_,AppState>)->Result<String,String>{
 let root=workspace::root(&state)?;
 let slug=origin_slug(&root)?;
 let username=username.trim();
 if !valid_login(username){return Err("Enter a valid GitHub username.".into())}
 gh(&root,&["api","-X","DELETE",&format!("repos/{slug}/collaborators/{username}")])?;
 Ok(format!("Removed {username} from {slug}."))
}

#[cfg(test)]
mod github_tests{
 #[test] fn validates_logins(){
  assert!(super::valid_login("octocat"));
  assert!(super::valid_login("OW-Programing-Language"));
  assert!(!super::valid_login("-bad"));
  assert!(!super::valid_login("has space"));
  assert!(!super::valid_login(""));
 }
}
