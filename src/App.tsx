import {useCallback,useEffect,useMemo,useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {openUrl} from '@tauri-apps/plugin-opener';
import {
  Activity,ArrowDownToLine,ArrowLeft,ArrowRight,ArrowUpRight,BookOpen,Box,Braces,Check,
  ChevronDown,ChevronRight,ChevronsUpDown,Cloud,Code2,Command,Download,ExternalLink,FileCode2,
  FilePlus,Files,Folder,FolderOpen,FolderPlus,GitBranch,GitCommitHorizontal,GitPullRequest,Globe,
  Info,Layers,Loader2,Menu,MoreHorizontal,Package,PanelBottom,Play,Plus,RefreshCw,Search,
  Settings2,ShieldCheck,SquareTerminal,TerminalSquare,Trash2,UploadCloud,WandSparkles,X,Zap
} from 'lucide-react';
import EditorPane from './components/EditorPane';
import {TerminalPanel,type Session} from './components/TerminalPanel';
import {call,isDesktop,flattenNodes,fileName,dirname,statusName,type FileNode,type GitSnapshot,type Tab,type ToolchainInfo,type OwDiagnostic,type OwCheckReport,type GithubPullRequest,type CliAvailability} from './lib/api';

type Section='files'|'search'|'git'|'tools';
type Toast={id:number;message:string;error?:boolean};
type NewProject={name:string;kind:'console'|'web'|'ui'};
const org='https://github.com/OW-Programing-Language';
const night='https://github.com/OW-Programing-Language/night';
const emptyGit:GitSnapshot={branch:'',remote:'',changes:[],last_commits:[],initialized:false};
const blankToolchain:ToolchainInfo={source:'Checking...',available:false,version:'',build_note:''};
function isOw(path:string){return path.toLowerCase().endsWith('.ow')}
function fileIcon(node:FileNode){return node.directory?<Folder size={15}/>:isOw(node.path)?<span className="file-ow-icon">ow</span>:<FileCode2 size={15}/>}

export default function App(){
 const [workspace,setWorkspacePath]=useState<string>('');
 const [tree,setTree]=useState<FileNode[]>([]);
 const [expanded,setExpanded]=useState<Set<string>>(new Set(['src','docs']));
 const [tabs,setTabs]=useState<Tab[]>([]);
 const [active,setActive]=useState('');
 const [section,setSection]=useState<Section>('files');
 const [toolchain,setToolchain]=useState<ToolchainInfo>(blankToolchain);
 const [environment,setEnvironment]=useState<CliAvailability[]>([]);
 const [git,setGit]=useState<GitSnapshot>(emptyGit);
 const [gitBusy,setGitBusy]=useState(false);
 const [commitMessage,setCommitMessage]=useState('');
 const [gitOutput,setGitOutput]=useState('');
 const [pullRequests,setPullRequests]=useState<GithubPullRequest[]>([]);
 const [prError,setPrError]=useState('');
 const [showCreatePr,setShowCreatePr]=useState(false);
 const [prTitle,setPrTitle]=useState('');
 const [prBody,setPrBody]=useState('');
 const [prBase,setPrBase]=useState('main');
 const [search,setSearch]=useState('');
 const [searchResults,setSearchResults]=useState<Array<{path:string;line:number;text:string}>>([]);
 const [searchBusy,setSearchBusy]=useState(false);
 const [sessions,setSessions]=useState<Session[]>([]);
 const [terminalVisible,setTerminalVisible]=useState(true);
 const [panelMode,setPanelMode]=useState<'terminal'|'problems'|'preview'>('terminal');
 const [problems,setProblems]=useState<OwDiagnostic[]>([]);
 const [jump,setJump]=useState<{path:string;line:number;column:number;nonce:number}|null>(null);
 const [previewInput,setPreviewInput]=useState('http://127.0.0.1:8080/');
 const [previewUrl,setPreviewUrl]=useState('http://127.0.0.1:8080/');
 const [maxTerminal,setMaxTerminal]=useState(false);
 const [sidebarVisible,setSidebarVisible]=useState(true);
 const [palette,setPalette]=useState(false);
 const [paletteQuery,setPaletteQuery]=useState('');
 const [showNewProject,setShowNewProject]=useState(false);
 const [newProject,setNewProject]=useState<NewProject>({name:'my-ow-app',kind:'web'});
 const [showClone,setShowClone]=useState(false);
 const [cloneUrl,setCloneUrl]=useState('');
 const [showPublish,setShowPublish]=useState(false);
 const [diffPreview,setDiffPreview]=useState<{path:string;content:string}|null>(null);
 const [publishName,setPublishName]=useState('');
 const [publishVisibility,setPublishVisibility]=useState<'public'|'private'>('public');
 const [publishDescription,setPublishDescription]=useState('Created with Owler IDE');
 const [toasts,setToasts]=useState<Toast[]>([]);
 const toast=useCallback((message:string,error=false)=>{setToasts(v=>[...v.slice(-3),{id:Date.now()+Math.random(),message,error}]);setTimeout(()=>setToasts(v=>v.slice(1)),4300)},[]);
 const refreshTree=useCallback(async()=>{
  if(!isDesktop)return;
  try{setTree(await call<FileNode[]>('list_files'))}catch(e){toast(String(e),true)}
 },[toast]);
 const refreshGit=useCallback(async()=>{
  if(!isDesktop)return;
  try{setGit(await call<GitSnapshot>('git_status'))}catch{setGit(emptyGit)}
 },[]);
 const openWorkspace=useCallback(async(path:string)=>{
  try{const entries=await call<FileNode[]>('set_workspace',{path});setWorkspacePath(path);setTree(entries);setTabs([]);setActive('');setProblems([]);setGit(emptyGit);localStorage.setItem('owler:last-workspace',path);setSection('files');
   const snapshot=await call<GitSnapshot>('git_status');setGit(snapshot);
   toast(`Opened ${path.split(/[\\/]/).pop()}`);
  }catch(e){toast(String(e),true)}
 },[toast]);
 useEffect(()=>{
  if(!isDesktop)return;
  void call<ToolchainInfo>('ow_toolchain_info').then(setToolchain).catch(()=>{});
  void call<CliAvailability[]>('environment_status').then(setEnvironment).catch(()=>{});
  const path=localStorage.getItem('owler:last-workspace');if(path)void openWorkspace(path);
 },[openWorkspace]);
 const pickOpen=useCallback(async()=>{if(!isDesktop){toast('Open the desktop app to access local folders',true);return}const selected=await open({directory:true,multiple:false,title:'Open a folder in Owler'});if(typeof selected==='string')void openWorkspace(selected)},[openWorkspace,toast]);
 const openFile=useCallback(async(path:string)=>{
  setSection('files');
  if(tabs.some(t=>t.path===path)){setActive(path);return}
  try{const content=await call<string>('read_file',{path});setTabs(t=>[...t,{path,content,saved:content}]);setActive(path)}catch(e){toast(String(e),true)}
 },[tabs,toast]);
 const closeFile=useCallback((path:string)=>{
  const t=tabs.find(t=>t.path===path);
  if(t&&t.content!==t.saved&&!confirm(`Close ${path} and discard unsaved changes?`))return;
  const next=tabs.filter(t=>t.path!==path);
  setTabs(next);if(active===path)setActive(next[next.length-1]?.path??'');
 },[tabs,active]);
 const changeFile=useCallback((path:string,content:string)=>setTabs(ts=>ts.map(t=>t.path===path?{...t,content}:t)),[]);
 const saveAll=useCallback(async()=>{
  const dirty=tabs.filter(t=>t.content!==t.saved);
  if(!dirty.length)return true;
  try{for(const t of dirty)await call('write_file',{path:t.path,content:t.content});setTabs(ts=>ts.map(t=>{const saved=dirty.find(d=>d.path===t.path);return saved?{...t,saved:saved.content}:t}));void refreshGit();toast(`Saved ${dirty.length} file${dirty.length===1?'':'s'}`);return true;}catch(e){toast(String(e),true);return false;}
 },[tabs,refreshGit,toast]);
 const startSession=useCallback(async(kind:'shell'|'claude'|'codex'|'gemini'|'aider'|'opencode')=>{
  if(!workspace){toast('Open a project first',true);return}
  try{const id=await call<string>('terminal_start',{kind});setSessions(ts=>[...ts,{id,name:({shell:'Shell',claude:'Claude Code',codex:'Codex CLI',gemini:'Gemini CLI',aider:'Aider',opencode:'OpenCode'} as const)[kind],kind}]);setTerminalVisible(true);setPanelMode('terminal')}catch(e){toast(String(e),true)}
 },[workspace,toast]);
 const entry=useMemo(()=>isOw(active)?active:flattenNodes(tree).find(n=>n.path==='src/main.ow')?.path??flattenNodes(tree).find(n=>isOw(n.path))?.path??'',[active,tree]);
 const runOw=useCallback(async(action:'check'|'run'|'build'|'package',packKind?:string)=>{
  if(!entry){toast('Open a .ow file or an OW project first',true);return}
  if(!(await saveAll()))return;
  if(action==='check'){
   try{
    const report=await call<OwCheckReport>('ow_check',{entry});
    setProblems(report.diagnostics);setPanelMode('problems');setTerminalVisible(true);
    toast(report.ok?'OW compiler check passed':`${report.diagnostics.length} compiler problem(s)`,!report.ok);
   }catch(e){toast(String(e),true)}
   return;
  }
  try{const appName=workspace.split(/[\\/]/).pop()?.replace(/[^\w-]/g,'')||'OwApp';
    const id=await call<string>('ow_task',{action,entry,name:appName,kind:packKind||'web'});
    const label=action==='package'?`Package ${packKind||'web'}`:action==='build'?'Native Build':'OW Run';
    setSessions(ts=>[...ts,{id,name:label,kind:'ow'}]);setTerminalVisible(true);setPanelMode('terminal');
    toast(`${label} started`);
  }catch(e){toast(String(e),true)}
 },[entry,saveAll,toast,workspace]);
 const showPreview=useCallback(()=>{
  if(!/^https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}(?:\/|$)/i.test(previewInput.trim())){
   toast('Preview accepts local development URLs only, e.g. http://127.0.0.1:8080/',true);return;
  }
  setPreviewUrl(previewInput.trim());setPanelMode('preview');setTerminalVisible(true);
 },[previewInput,toast]);
 const navigateProblem=useCallback(async(problem:OwDiagnostic)=>{
  const normalized=problem.file.replaceAll('\\','/');
  const matched=flattenNodes(tree).find(n=>!n.directory&&(normalized===n.path||normalized.endsWith('/'+n.path)));
  const path=matched?.path||entry;
  if(path){await openFile(path);setJump({path,line:problem.line,column:problem.column,nonce:Date.now()});}
 },[tree,entry,openFile]);
 const gitAction=useCallback(async(action:string,message?:string,file?:string)=>{
  if(!workspace){toast('Open a repository first',true);return}
  setGitBusy(true);try{const result=await call<string>('git_action',{action,message,file});setGitOutput(result||`${action} finished`);if(action==='commit')setCommitMessage('');await refreshGit();if(action==='pull')void refreshTree();toast(`Git ${action.replace('_',' ')} completed`)}catch(e){setGitOutput(String(e));toast(String(e),true)}finally{setGitBusy(false)}
 },[workspace,refreshGit,refreshTree,toast]);
 const refreshPrs=useCallback(async()=>{
  if(!workspace)return;
  try{setPrError('');setPullRequests(await call<GithubPullRequest[]>('github_pr_list'))}
  catch(e){setPrError(String(e));}
 },[workspace]);
 const createPullRequest=useCallback(async()=>{
  if(!prTitle.trim())return;
  try{const url=await call<string>('github_pr_create',{title:prTitle,body:prBody,base:prBase});setShowCreatePr(false);setPrTitle('');setPrBody('');toast('Pull request created');void openUrl(url.trim());void refreshPrs();}
  catch(e){toast(String(e),true)}
 },[prTitle,prBody,prBase,refreshPrs,toast]);
 const previewDiff=useCallback(async(path:string)=>{
  try{let content=await call<string>('git_action',{action:'diff',file:path});if(!content){content=await call<string>('git_action',{action:'diff_staged'});}
    setDiffPreview({path,content:content||'No tracked diff yet (new files must be staged before Git can show a diff).'});
  }catch(e){toast(String(e),true)}
 },[toast]);
 const newEntry=useCallback(async(directory:boolean)=>{
  if(!workspace){toast('Open a project first',true);return}
  const path=prompt(directory?'Folder path (relative to project root)':'File path (relative to project root)',directory?'src/components':'src/new.ow');
  if(!path)return;
  try{await call('new_entry',{path,directory});await refreshTree();if(!directory)void openFile(path)}catch(e){toast(String(e),true)}
 },[workspace,refreshTree,openFile,toast]);
 const renameNode=useCallback(async(node:FileNode)=>{
  const newPath=prompt('Rename to (relative to project root)',node.path);
  if(!newPath||newPath===node.path)return;
  try{await call('rename_entry',{path:node.path,newPath});setTabs(ts=>ts.filter(t=>t.path!==node.path));if(active===node.path)setActive('');await refreshTree();toast('Renamed')}catch(e){toast(String(e),true)}
 },[active,refreshTree,toast]);
 const deleteNode=useCallback(async(node:FileNode)=>{
  if(!confirm(`Permanently delete ${node.path}${node.directory?' and all its contents':''}?`))return;
  try{await call('delete_entry',{path:node.path});setTabs(ts=>ts.filter(t=>t.path!==node.path&&!t.path.startsWith(node.path+'/')));if(active===node.path||active.startsWith(node.path+'/'))setActive('');await refreshTree();toast('Deleted')}catch(e){toast(String(e),true)}
 },[active,refreshTree,toast]);
 const createProject=useCallback(async()=>{
  if(!isDesktop){toast('Use the desktop app',true);return}
  const parent=await open({directory:true,multiple:false,title:'Choose where to create the OW project'});
  if(typeof parent!=='string')return;
  try{const path=await call<string>('create_project',{baseDir:parent,name:newProject.name,kind:newProject.kind});setShowNewProject(false);await openWorkspace(path);await refreshTree();void openFile('src/main.ow')}catch(e){toast(String(e),true)}
 },[newProject,openWorkspace,openFile,refreshTree,toast]);
 const cloneProject=useCallback(async()=>{
  const parent=await open({directory:true,multiple:false,title:'Choose where to clone this GitHub repository'});
  if(typeof parent!=='string')return;
  try{const path=await call<string>('git_clone',{url:cloneUrl,parent});setShowClone(false);setCloneUrl('');await openWorkspace(path)}catch(e){toast(String(e),true)}
 },[cloneUrl,openWorkspace,toast]);
 const publishToGitHub=useCallback(async()=>{
  if(!git.initialized||!git.last_commits.length){toast('Initialize Git and make at least one commit before publishing',true);return}
  try{const result=await call<string>('github_publish',{owner:'OW-Programing-Language',name:publishName,visibility:publishVisibility,description:publishDescription});setShowPublish(false);setGitOutput(result);await refreshGit();toast('Published to the OW organization!')}catch(e){toast(String(e),true)}
 },[git.initialized,publishName,publishVisibility,publishDescription,refreshGit,toast]);
 const doSearch=useCallback(async()=>{
  if(!search.trim()||!workspace)return;
  setSearchBusy(true);setSearchResults([]);
  const result:Array<{path:string;line:number;text:string}>=[];
  const leaves=flattenNodes(tree).filter(n=>!n.directory&&!/\.(png|jpg|gif|ico|icns|exe|jar|woff|zip|pdf|lock)$/i.test(n.path)).slice(0,180);
  for(const file of leaves){try{const text=await call<string>('read_file',{path:file.path});const lines=text.split('\n');for(let i=0;i<lines.length;i++){if(lines[i].toLowerCase().includes(search.toLowerCase())){result.push({path:file.path,line:i+1,text:lines[i].trim().slice(0,180)});if(result.length>=250)break}}if(result.length>=250)break;}catch{/* ignore non-text and large files */}}
  setSearchResults(result);setSearchBusy(false);
 },[search,workspace,tree]);
 const paletteItems=useMemo(()=>[
  {name:'Open folder',hint:'File',run:pickOpen},
  {name:'New OW project',hint:'Project',run:()=>setShowNewProject(true)},
  {name:'Clone GitHub repository',hint:'Git',run:()=>setShowClone(true)},
  {name:'Publish project to GitHub',hint:'GitHub',run:()=>{setPublishName(workspace.split(/[\\/]/).pop()?.toLowerCase().replace(/[^a-z0-9-_]/g,'-')||'owler-project');setShowPublish(true)}},
  {name:'Save all files',hint:'Ctrl+S',run:()=>{void saveAll()}},
  {name:'Run OW application',hint:'F5',run:()=>{void runOw('run')}},
  {name:'Check OW source',hint:'Build',run:()=>{void runOw('check')}},
  {name:'Build native executable',hint:'Build',run:()=>{void runOw('build')}},
  {name:'Package Night web app',hint:'Build',run:()=>{void runOw('package','web')}},
  {name:'Package native GUI',hint:'Build',run:()=>{void runOw('package','gui')}},
  {name:'Open Claude Code',hint:'Agent',run:()=>{void startSession('claude')}},
  {name:'Open Codex CLI',hint:'Agent',run:()=>{void startSession('codex')}},
  {name:'Open Gemini CLI',hint:'Agent',run:()=>{void startSession('gemini')}},
  {name:'Open Aider',hint:'Agent',run:()=>{void startSession('aider')}},
  {name:'Open OpenCode',hint:'Agent',run:()=>{void startSession('opencode')}},
  {name:'Open system terminal',hint:'Terminal',run:()=>{void startSession('shell')}},
  {name:'Push to GitHub',hint:'Git',run:()=>{void gitAction('push')}},
  {name:'Pull from GitHub',hint:'Git',run:()=>{void gitAction('pull')}},
  ...flattenNodes(tree).filter(n=>!n.directory).map(n=>({name:n.path,hint:'File',run:()=>{void openFile(n.path)}}))
 ],[pickOpen,saveAll,runOw,startSession,gitAction,openFile,tree,workspace]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void saveAll()}
   else if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();setPalette(true);setPaletteQuery('>')}
   else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();setPalette(true);setPaletteQuery('')}
   else if((e.ctrlKey||e.metaKey)&&e.key==='`'){e.preventDefault();setTerminalVisible(v=>!v)}
   else if(e.key==='F5'){e.preventDefault();void runOw('run')}
   else if(e.key==='Escape')setPalette(false);
  };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)
 },[saveAll,runOw]);

 function TreeItem({node,depth=0}:{node:FileNode;depth?:number}){
  const isExpanded=expanded.has(node.path);
  const modified=git.changes.some(c=>c.path===node.path);
  return <><div className={`tree-item ${node.path===active?'selected':''}`} style={{paddingLeft:11+depth*13}} onClick={()=>node.directory?setExpanded(prev=>{const n=new Set(prev);if(n.has(node.path))n.delete(node.path);else n.add(node.path);return n;}):void openFile(node.path)} onContextMenu={e=>{e.preventDefault();const choice=prompt(`Action for ${node.path}: rename / delete / copy path`,'rename');if(choice==='rename')void renameNode(node);else if(choice==='delete')void deleteNode(node);else if(choice==='copy path')void navigator.clipboard.writeText(node.path)}}>
   <span className="tree-chevron">{node.directory?(isExpanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>):null}</span>
   <span className={`tree-icon ${isOw(node.path)?'ow':''}`}>{node.directory?isExpanded?<FolderOpen size={15}/>:<Folder size={15}/>:fileIcon(node)}</span><span className="tree-label">{node.name}</span>{modified&&<span className="tree-modified">M</span>}
  </div>{node.directory&&isExpanded&&node.children.map(n=><TreeItem node={n} depth={depth+1} key={n.path}/>)}</>;
 }
 const basename=workspace.split(/[\\/]/).filter(Boolean).pop()||'NO FOLDER';
 const visiblePalette=paletteItems.filter(i=>i.name.toLowerCase().includes(paletteQuery.toLowerCase().replace(/^>/,''))).slice(0,18);
 return <div className="app">
  <div className="titlebar"><div className="title-brand"><span className="brand-icon"><span>o</span><span>w</span></span><span className="brand-name">owler<span className="brand-name-dim"> IDE</span></span><span className="brand-beta">BETA</span></div>
   <div className="title-project"><Code2 size={14}/><span>{workspace?basename:'Welcome to Owler'}</span><ChevronDown size={13}/></div>
   <div className="title-right"><span className={`runtime-indicator ${toolchain.available?'ready':''}`}><span/>{toolchain.available?'OW READY':'OW TOOLCHAIN'}</span><button title="Command palette" onClick={()=>{setPalette(true);setPaletteQuery('')}}><Command size={15}/><span>Command palette</span><kbd>⌘ K</kbd></button><div className="title-avatar">OW</div></div>
  </div>
  <div className="toolbar"><div className="toolbar-leading"><button title="Toggle sidebar" onClick={()=>setSidebarVisible(v=>!v)}><Menu size={16}/></button><span className="toolbar-divider"/><span className="toolbar-label">WORKSPACE</span><ChevronRight size={13}/><b>{basename}</b></div>
   <div className="toolbar-center"><button className="toolbar-action muted" onClick={()=>void runOw('check')} title="Compile-time check"><Check size={15}/> Check</button><button className="toolbar-action muted" onClick={()=>void runOw('build')} title="Build native OW program"><Package size={15}/> Build</button><div className="dropdown"><button className="toolbar-action muted" onClick={()=>void runOw('package','web')} title="Package complete OW/Night web app"><Globe size={15}/> Web app</button></div><button className="run-button" onClick={()=>void runOw('run')}><Play size={14} fill="currentColor"/> Run OW <kbd>F5</kbd></button></div>
   <div className="toolbar-trailing"><button onClick={()=>setTerminalVisible(v=>!v)} title="Toggle terminal"><PanelBottom size={17}/></button><button onClick={()=>{setSection('tools');setSidebarVisible(true)}} title="Development tools"><Settings2 size={17}/></button></div>
  </div>
  <div className="main-layout">
   <div className="activity-rail"><div className="rail-top">
    {([['files',Files,'Explorer'],['search',Search,'Search'],['git',GitBranch,'Source control'],['tools',Layers,'Tools & extensions']] as const).map(([key,Icon,label])=><button key={key} className={section===key&&sidebarVisible?'active':''} title={label} onClick={()=>{setSection(key);setSidebarVisible(true)}}><Icon size={20}/>{key==='git'&&git.changes.length>0&&<span className="rail-dot"/>}</button>)}
   </div><div className="rail-bottom"><button title="GitHub Organization" onClick={()=>void openUrl(org)}><Cloud size={20}/></button><button title="Settings" onClick={()=>{setSection('tools');setSidebarVisible(true)}}><Settings2 size={20}/></button></div></div>
   {sidebarVisible&&<aside className="sidebar">
    {section==='files'&&<><div className="sidebar-heading"><span>EXPLORER</span><div><button onClick={()=>void newEntry(false)} title="New file"><FilePlus size={15}/></button><button onClick={()=>void newEntry(true)} title="New folder"><FolderPlus size={15}/></button><button onClick={()=>void refreshTree()} title="Refresh"><RefreshCw size={14}/></button></div></div>
     <button className="workspace-fold" onClick={()=>void pickOpen()}><ChevronDown size={15}/><b>{basename.toUpperCase()}</b><MoreHorizontal size={14}/></button>
     <div className="explorer-tree">{workspace?tree.map(node=><TreeItem key={node.path} node={node}/>):<div className="sidebar-start"><FolderOpen size={28}/><p>No project opened</p><button onClick={()=>void pickOpen()}>Open folder</button><button className="secondary" onClick={()=>setShowNewProject(true)}>New OW project</button></div>}</div>
     <div className="sidebar-section-heading"><ChevronDown size={13}/> OUTLINE</div><div className="outline-hint">{active?'Symbols in the active editor':'Open a file to see its symbols'}</div>
     {active&&<div className="outline-list">{tabs.find(t=>t.path===active)?.content.split('\n').filter(l=>/^\s*(fn |class |model |module |functor |interface |main:|route )/.test(l)).slice(0,30).map((s,i)=><div key={i}><Braces size={12}/>{s.trim().slice(0,48)}</div>)}</div>}
    </>}
    {section==='git'&&<><div className="sidebar-heading"><span>SOURCE CONTROL</span><div><button title="Refresh Git" onClick={()=>void refreshGit()}><RefreshCw size={14}/></button><button title="Fetch" onClick={()=>void gitAction('fetch')}><Cloud size={15}/></button></div></div>
     {!git.initialized?<div className="sidebar-start"><GitBranch size={28}/><p>This folder isn't a Git repository yet.</p><button onClick={()=>void gitAction('init')}>Initialize repository</button></div>:<>
       <div className="git-branch-banner"><GitBranch size={15}/><b>{git.branch||'(detached)'}</b><span>{git.changes.length} changes</span></div>
       <div className="commit-form"><textarea placeholder="Message (Ctrl+Enter to commit)" rows={3} value={commitMessage} onChange={e=>setCommitMessage(e.target.value)} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter')void gitAction('commit',commitMessage)}}/><button disabled={!commitMessage.trim()||gitBusy} onClick={()=>void gitAction('commit',commitMessage)}><GitCommitHorizontal size={15}/> Commit staged files</button></div>
       <div className="git-toolbar"><button title="Stage all changes" onClick={()=>void gitAction('stage_all')}><Plus size={14}/> Stage all</button><button title="Pull" onClick={()=>void gitAction('pull')}><ArrowDownToLine size={14}/> Pull</button><button title="Push" onClick={()=>void gitAction('push')}><UploadCloud size={14}/> Push</button></div>
       <div className="sidebar-section-heading">CHANGES <span className="pill-counter">{git.changes.length}</span></div><div className="changes-list">{git.changes.map((c,i)=><div className="change-row" key={c.path+i}><span className={`git-status-badge ${statusName(c.status)}`}>{statusName(c.status)}</span><span title={c.path} onClick={()=>void previewDiff(c.path)}>{fileName(c.path)}<small>{dirname(c.path)}</small></span><button title="View diff" onClick={()=>void previewDiff(c.path)}><FileCode2 size={14}/></button><button title="Stage file" onClick={()=>void gitAction('stage',undefined,c.path)}><Plus size={14}/></button><button title="Unstage file" onClick={()=>void gitAction('unstage',undefined,c.path)}>−</button></div>)}{git.changes.length===0&&<div className="subtle-message">Working tree clean.</div>}</div>
       <div className="sidebar-section-heading">GITHUB PULL REQUESTS <button title="Refresh pull requests" onClick={()=>void refreshPrs()}><RefreshCw size={12}/></button><button title="Create pull request" onClick={()=>setShowCreatePr(true)}><Plus size={13}/></button></div>
       <div className="owler-pr-list">{pullRequests.map(pr=><button key={pr.number} onClick={()=>void openUrl(pr.url)}><GitPullRequest size={13}/><span><b>#{pr.number} {pr.title}</b><small>{pr.headRefName} → {pr.baseRefName}{pr.isDraft?' · Draft':''}</small></span></button>)}{prError&&<p>{prError}</p>}</div>
       <div className="sidebar-section-heading">RECENT COMMITS</div><div className="commit-list">{git.last_commits.map((l,i)=><div key={i}><GitCommitHorizontal size={13}/><span title={l}>{l}</span></div>)}</div>
       <div className="git-footer"><button onClick={()=>{const url=prompt('GitHub remote URL',git.remote||`${org}/my-project.git`);if(url)void gitAction('remote_set',url)}}><Cloud size={14}/>{git.remote?'Edit remote':'Set GitHub remote'}</button><button onClick={()=>void gitAction('push_upstream')}>Push upstream <ArrowUpRight size={13}/></button></div>
     </>}<div className="git-publish"><button onClick={()=>{setPublishName(basename.toLowerCase().replace(/[^a-z0-9-_]/g,'-'));setShowPublish(true)}}><UploadCloud size={15}/> Publish new repo to GitHub</button></div>{gitOutput&&<div className="git-output" title={gitOutput}>{gitOutput.slice(0,800)}</div>}
    </>}
    {section==='search'&&<><div className="sidebar-heading"><span>SEARCH</span></div><div className="search-area"><div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void doSearch()}} placeholder="Search across workspace"/></div><button onClick={()=>void doSearch()} disabled={!search||searchBusy}>{searchBusy?<Loader2 size={15} className="spin"/>:<Search size={15}/>} Find in files</button><small>Searches up to 180 text files, 250 matches.</small></div><div className="sidebar-section-heading">RESULTS <span className="pill-counter">{searchResults.length}</span></div><div className="search-results">{searchResults.map((r,i)=><button key={i} onClick={()=>{void openFile(r.path).then(()=>setJump({path:r.path,line:r.line,column:1,nonce:Date.now()}))}}><b>{fileName(r.path)} <small>:{r.line}</small></b><span>{r.text}</span><small>{r.path}</small></button>)}</div></>}
    {section==='tools'&&<><div className="sidebar-heading"><span>DEVELOPMENT TOOLS</span></div><div className="tool-side-head">OW INTEGRATION</div><div className="tool-status"><span className={`status-dot ${toolchain.available?'good':''}`}/><div><b>{toolchain.available?'OW toolchain detected':'Toolchain not found'}</b><small>{toolchain.source}<br/>{toolchain.version||'Start via Tauri to detect the OW runtime'}</small></div></div><div className="side-menu">
      <button onClick={()=>void runOw('check')}><Check size={16}/> Check OW syntax</button><button onClick={()=>void runOw('run')}><Play size={16}/> Run OW application</button><button onClick={()=>void runOw('build')}><Package size={16}/> Native compiler</button><button onClick={()=>void runOw('package','web')}><Globe size={16}/> Package web service</button><button onClick={()=>void runOw('package','gui')}><Box size={16}/> Package GUI app</button><button onClick={()=>void runOw('package','console')}><TerminalSquare size={16}/> Package console app</button><button onClick={()=>{setPanelMode('preview');setTerminalVisible(true)}}><Globe size={16}/> Web preview (localhost)</button>
     </div><div className="tool-side-head">AI CODING AGENTS</div><div className="side-menu"><button onClick={()=>void startSession('claude')}><Zap size={16}/> Claude Code CLI</button><button onClick={()=>void startSession('codex')}><WandSparkles size={16}/> OpenAI Codex CLI</button><button onClick={()=>void startSession('shell')}><SquareTerminal size={16}/> System terminal</button><button onClick={()=>void startSession('gemini')}><Zap size={16}/> Gemini CLI</button><button onClick={()=>void startSession('aider')}><Code2 size={16}/> Aider</button><button onClick={()=>void startSession('opencode')}><WandSparkles size={16}/> OpenCode</button></div><div className="tool-side-head">DETECTED DEVELOPMENT TOOLS <button onClick={()=>void call<CliAvailability[]>('environment_status').then(setEnvironment).catch(e=>toast(String(e),true))}><RefreshCw size={12}/></button></div><div className="owler-cli-status">{environment.map(item=><div key={item.name}><span className={`status-dot ${item.available?'good':''}`}/><b>{item.name}</b><small>{item.available?'Available':'Not installed'}</small></div>)}</div><div className="tool-side-head">FRAMEWORKS & DOCS</div><div className="side-menu"><button onClick={()=>void openUrl('https://github.com/OW-Programing-Language/ow-lang')}><Code2 size={16}/> OW language <ExternalLink size={12}/></button><button onClick={()=>void openUrl(night)}><Globe size={16}/> Night web framework <ExternalLink size={12}/></button><button onClick={()=>void openUrl(`${org}/flOW---OW-Modular-Framework`)}><Layers size={16}/> flOW Modulith <ExternalLink size={12}/></button></div><div className="tool-note">{toolchain.build_note||'The bundled OW compiler will be staged during installer builds.'}</div></>}
   </aside>}
   <main className="work-area"><div className="editor-surface" style={{flex:maxTerminal?'0 0 0':'1 1 auto',minHeight:maxTerminal?0:120,overflow:'hidden'}}><EditorPane tabs={tabs} active={active} onActivate={setActive} onClose={closeFile} onChange={changeFile} onSave={()=>void saveAll()} onRun={()=>void runOw('run')} diagnostics={problems} jump={jump}/></div>
    {terminalVisible&&<div className={`bottom-panel ${maxTerminal?'maximized':''}`}>
     <div className="owler-panel-tabs"><button className={panelMode==='terminal'?'selected':''} onClick={()=>setPanelMode('terminal')}><TerminalSquare size={13}/> Terminal</button><button className={panelMode==='problems'?'selected':''} onClick={()=>setPanelMode('problems')}><ShieldCheck size={13}/> Problems <span>{problems.length}</span></button><button className={panelMode==='preview'?'selected':''} onClick={()=>setPanelMode('preview')}><Globe size={13}/> Web preview</button><span className="owler-panel-spacer"/><button onClick={()=>setTerminalVisible(false)} title="Close panel"><X size={14}/></button></div>
     <div className="owler-panel-content" style={{display:panelMode==='terminal'?'block':'none'}}><TerminalPanel sessions={sessions} onNew={startSession} onRemove={id=>setSessions(ts=>ts.filter(s=>s.id!==id))} onHide={()=>setTerminalVisible(false)} onToggleSize={()=>setMaxTerminal(v=>!v)} maximized={maxTerminal}/></div>
     {panelMode==='problems'&&<div className="owler-problems">{problems.length?problems.map((d,i)=><button key={i} onClick={()=>void navigateProblem(d)}><span className="problem-error">●</span><b>{d.message}</b><small>{d.file}:{d.line}:{d.column}</small></button>):<div className="owler-no-problems"><ShieldCheck size={19}/> No compiler errors reported. Run <b>Check</b> to validate the active OW file.</div>}</div>}
     {panelMode==='preview'&&<div className="owler-preview"><div className="owler-preview-bar"><Globe size={14}/><input aria-label="Local preview URL" value={previewInput} onChange={e=>setPreviewInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')showPreview()}}/><button onClick={showPreview}><RefreshCw size={14}/> Open</button><button onClick={()=>void openUrl(previewUrl)} title="Open in browser"><ExternalLink size={14}/></button></div><iframe title="Local OW web application" src={previewUrl} referrerPolicy="no-referrer"/></div>}
    </div>}
   </main>
   <div className="right-rail"><button title="New project" onClick={()=>setShowNewProject(true)}><Plus size={19}/></button><button title="GitHub repository" onClick={()=>void openUrl(org)}><GitPullRequest size={19}/></button><span className="right-rail-spacer"/><button title="OW docs" onClick={()=>void openUrl(`${org}/owdocs`)}><BookOpen size={19}/></button></div>
  </div>
  <div className="statusbar"><div className="status-left"><button onClick={()=>{setSection('git');setSidebarVisible(true)}}><GitBranch size={13}/>{git.branch||'No Git'}</button><span className="status-counter">{git.changes.length?`${git.changes.length} modified`:'✓'}</span><button onClick={()=>{setSection('tools');setSidebarVisible(true)}}><ShieldCheck size={13}/>{toolchain.available?'Toolchain ready':'Setup OW'}</button></div><div className="status-right"><span>{active?'UTF-8':'Owler IDE'}</span><span>Spaces: 2</span><span className="status-language"><span className="small-ow">ow</span> {active?active.split('.').pop()?.toUpperCase():'OW'}</span><span className="status-live"><Activity size={12}/> v0.1.0</span></div></div>
  {palette&&<div className="overlay" onMouseDown={()=>setPalette(false)}><div className="palette" onMouseDown={e=>e.stopPropagation()}><div className="palette-search"><Command size={20}/><input autoFocus value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&visiblePalette.length){visiblePalette[0].run();setPalette(false)}else if(e.key==='Escape')setPalette(false)}} placeholder="Search files and commands…"/><kbd>ESC</kbd></div><div className="palette-body"><p>COMMANDS & FILES</p>{visiblePalette.map((item,i)=><button key={i} onClick={()=>{item.run();setPalette(false)}}><span>{item.name}</span><small>{item.hint}</small></button>)}</div><div className="palette-footer">↵ to select <span>·</span> ESC to close <span>·</span> OWLER COMMANDS</div></div></div>}
  {showNewProject&&<div className="overlay" onMouseDown={()=>setShowNewProject(false)}><div className="dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><Box size={21}/></span><button onClick={()=>setShowNewProject(false)}><X size={19}/></button></div><h2>Create a new OW project</h2><p>Pick a starter. Owler will create the source files and initialize Git.</p><label>PROJECT NAME</label><input className="dialog-input" value={newProject.name} onChange={e=>setNewProject(p=>({...p,name:e.target.value}))} placeholder="my-awesome-app"/><label>PROJECT TEMPLATE</label><div className="template-list">{([['console','Console application','A clean OW entry point with a typed function.',TerminalSquare],['web','Night web app','A REST API, JSON routes and persistent model.',Globe],['ui','OW interactive UI','Build a clickable OW user interface.',Layers]] as const).map(([key,title,description,I])=><button key={key} className={newProject.kind===key?'selected':''} onClick={()=>setNewProject(v=>({...v,kind:key}))}><span className="template-icon"><I size={20}/></span><span><b>{title}</b><small>{description}</small></span><span className="radio-dot"/></button>)}</div><div className="dialog-actions"><button className="cancel" onClick={()=>setShowNewProject(false)}>Cancel</button><button className="primary" onClick={()=>void createProject()}><Plus size={17}/> Create project</button></div></div></div>}
  {showPublish&&<div className="overlay" onMouseDown={()=>setShowPublish(false)}><div className="dialog clone-dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><Cloud size={21}/></span><button onClick={()=>setShowPublish(false)}><X size={19}/></button></div><h2>Publish to OW GitHub</h2><p>Create a new repository under <b>OW-Programing-Language</b> and push your commits using the GitHub CLI (<code>gh auth login</code>). No token is stored in Owler.</p><label>REPOSITORY NAME</label><input className="dialog-input" value={publishName} onChange={e=>setPublishName(e.target.value)} placeholder="my-ow-app"/><label>DESCRIPTION</label><input className="dialog-input" value={publishDescription} onChange={e=>setPublishDescription(e.target.value)}/><label>VISIBILITY</label><div className="publish-visibility"><button className={publishVisibility==='public'?'selected':''} onClick={()=>setPublishVisibility('public')}>Public</button><button className={publishVisibility==='private'?'selected':''} onClick={()=>setPublishVisibility('private')}>Private</button></div><div className="dialog-actions"><button className="cancel" onClick={()=>setShowPublish(false)}>Cancel</button><button className="primary" disabled={!publishName} onClick={()=>void publishToGitHub()}><UploadCloud size={17}/> Create and push</button></div></div></div>}
  {diffPreview&&<div className="overlay" onMouseDown={()=>setDiffPreview(null)}><div className="owler-diff-dialog" onMouseDown={e=>e.stopPropagation()}><div className="owler-diff-header"><FileCode2 size={17}/><b>Git diff · {diffPreview.path}</b><button onClick={()=>setDiffPreview(null)}><X size={16}/></button></div><pre>{diffPreview.content}</pre></div></div>}
  {showCreatePr&&<div className="overlay" onMouseDown={()=>setShowCreatePr(false)}><div className="dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><GitPullRequest size={19}/></span><button onClick={()=>setShowCreatePr(false)}><X size={18}/></button></div><h2>Create GitHub pull request</h2><p>Push your branch first. Owler uses your signed-in GitHub CLI.</p><label>TITLE</label><input className="dialog-input" value={prTitle} onChange={e=>setPrTitle(e.target.value)} placeholder="feat: implement OW feature"/><label>BASE BRANCH</label><input className="dialog-input" value={prBase} onChange={e=>setPrBase(e.target.value)}/><label>DESCRIPTION</label><textarea className="dialog-input" rows={5} value={prBody} onChange={e=>setPrBody(e.target.value)}/><div className="dialog-actions"><button className="cancel" onClick={()=>setShowCreatePr(false)}>Cancel</button><button className="primary" disabled={!prTitle.trim()} onClick={()=>void createPullRequest()}><GitPullRequest size={16}/> Create PR</button></div></div></div>}
  {showClone&&<div className="overlay" onMouseDown={()=>setShowClone(false)}><div className="dialog clone-dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><GitBranch size={21}/></span><button onClick={()=>setShowClone(false)}><X size={19}/></button></div><h2>Clone from GitHub</h2><p>Use HTTPS or SSH. Git authentication is handled by your local Git credential manager or SSH keys.</p><label>REPOSITORY URL</label><input className="dialog-input" value={cloneUrl} onChange={e=>setCloneUrl(e.target.value)} placeholder="https://github.com/OW-Programing-Language/ow-lang.git"/><div className="dialog-actions"><button className="cancel" onClick={()=>setShowClone(false)}>Cancel</button><button className="primary" disabled={!cloneUrl} onClick={()=>void cloneProject()}><Download size={17}/> Clone repository</button></div></div></div>}
  {!workspace&&<div className="welcome-float"><div className="welcome-line">START BUILDING WITH OW</div><div className="welcome-buttons"><button onClick={()=>setShowNewProject(true)}><Plus size={15}/> New project</button><button onClick={()=>void pickOpen()}><FolderOpen size={15}/> Open folder</button><button onClick={()=>setShowClone(true)}><GitBranch size={15}/> Clone repo</button></div></div>}
  <div className="toast-stack">{toasts.map(t=><div className={`toast ${t.error?'error':''}`} key={t.id}><span className="toast-symbol">{t.error?'!':'✓'}</span>{t.message}<button onClick={()=>setToasts(v=>v.filter(x=>x.id!==t.id))}><X size={12}/></button></div>)}</div>
  {!isDesktop&&<div className="preview-banner">UI PREVIEW — Native file access, Git, OW compiling and AI terminals require the Tauri desktop app. <code>npm run desktop</code></div>}
 </div>
}
