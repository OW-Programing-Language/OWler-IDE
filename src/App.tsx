import {Fragment,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {openUrl} from '@tauri-apps/plugin-opener';
import {
  Activity,ArrowDownToLine,ArrowLeft,ArrowRight,ArrowUpRight,BookOpen,Box,Braces,Check,
  ChevronDown,ChevronRight,ChevronsUpDown,ClipboardPaste,Cloud,Code2,Command,Copy,Download,ExternalLink,FileCode2,
  Pencil,Scissors,
  FilePlus,Files,Folder,FolderOpen,FolderPlus,GitBranch,GitCommitHorizontal,GitPullRequest,Globe,
  FlaskConical,Info,KeyRound,Layers,Loader2,LogOut,Menu,MoreHorizontal,Package,PanelBottom,Play,Plus,RefreshCw,Search,
  Save,Settings2,ShieldCheck,SquareTerminal,TerminalSquare,Trash2,UploadCloud,UserMinus,UserPlus,Users,WandSparkles,X,Zap
} from 'lucide-react';
import EditorPane from './components/EditorPane';
import OwTestPanel from './components/OwTestPanel';
import {reconcileDiskTabs} from './lib/liveSync';
import {discoverOwTests,isOwTestFile} from './lib/owTests';
import {TerminalPanel,type Session} from './components/TerminalPanel';
import {call,isDesktop,flattenNodes,fileName,dirname,statusName,COLLAB_PERMISSIONS,type FileNode,type GitSnapshot,type Tab,type DiskUpdate,type WorkspaceSnapshot,type ToolchainInfo,type OwDiagnostic,type OwCheckReport,type OwTestReport,type OwTestResult,type GithubPullRequest,type CliAvailability,type BranchList,type GithubAuth,type Collaborator} from './lib/api';

type Section='files'|'search'|'git'|'tools';
type Toast={id:number;message:string;error?:boolean};
type NewProject={name:string;kind:'console'|'web'|'ui'|'night'|'flow'|'owcord'};
const org='https://github.com/OW-Programing-Language';
const night='https://github.com/OW-Programing-Language/night';
const emptyGit:GitSnapshot={branch:'',remote:'',changes:[],last_commits:[],initialized:false};
const blankToolchain:ToolchainInfo={source:'Checking...',available:false,version:'',build_note:''};
function isOw(path:string){return path.toLowerCase().endsWith('.ow')}
function fileIcon(node:FileNode){return node.directory?<Folder size={15}/>:isOw(node.path)?<span className="file-ow-icon">ow</span>:<FileCode2 size={15}/>}

export default function App(){
 const [workspace,setWorkspacePath]=useState<string>('');
 const [roots,setRoots]=useState<string[]>([]);
 const [tree,setTree]=useState<FileNode[]>([]);
 const [expanded,setExpanded]=useState<Set<string>>(new Set(['src','docs']));
 const [ctxMenu,setCtxMenu]=useState<{x:number;y:number;node:FileNode}|null>(null);
 const [clipboard,setClipboard]=useState<{node:FileNode;mode:'copy'|'cut'}|null>(null);
 const [mainEntry,setMainEntry]=useState('');
 const [dragPath,setDragPath]=useState('');
 const [dropTarget,setDropTarget]=useState('');
 const [showSettings,setShowSettings]=useState(false);
 const [settings,setSettings]=useState(()=>{try{return {fontSize:13,tabSize:2,wordWrap:false,minimap:true,discord:true,...JSON.parse(localStorage.getItem('owler:settings')||'{}')}}catch{return {fontSize:13,tabSize:2,wordWrap:false,minimap:true,discord:true}}});
 const updateSetting=useCallback((k:string,v:unknown)=>setSettings((s:Record<string,unknown>)=>{const next={...s,[k]:v};localStorage.setItem('owler:settings',JSON.stringify(next));return next}),[]);
 const [tabs,setTabs]=useState<Tab[]>([]);
 const tabsRef=useRef(tabs);tabsRef.current=tabs;
 const rootsRef=useRef(roots);rootsRef.current=roots;
 const syncEpoch=useRef(0);
 const syncPaused=useRef(0);
 const gitRefreshId=useRef(0);
 const [syncStatus,setSyncStatus]=useState<'idle'|'live'|'error'>('idle');
 const [active,setActive]=useState('');
 const [section,setSection]=useState<Section>('files');
 const [toolchain,setToolchain]=useState<ToolchainInfo>(blankToolchain);
 const [runtimeJars,setRuntimeJars]=useState<string[]>([]);
 useEffect(()=>{let current=true;setRuntimeJars([]);if(workspace)void call<string[]>('get_runtime_extensions').then(v=>{if(current)setRuntimeJars(v)}).catch(()=>{});return()=>{current=false}},[workspace]);
 const [environment,setEnvironment]=useState<CliAvailability[]>([]);
 const [git,setGit]=useState<GitSnapshot>(emptyGit);
 const [gitBusy,setGitBusy]=useState(false);
 const [commitMessage,setCommitMessage]=useState('');
 const [gitOutput,setGitOutput]=useState('');
 const [pullRequests,setPullRequests]=useState<GithubPullRequest[]>([]);
 const [prError,setPrError]=useState('');
 const [showCreatePr,setShowCreatePr]=useState(false);
 const [branches,setBranches]=useState<BranchList>({current:'',branches:[]});
 const [showBranches,setShowBranches]=useState(false);
 const [newBranch,setNewBranch]=useState('');
 const [githubAuth,setGithubAuth]=useState<GithubAuth>({connected:false,user:'',cli_available:false});
 const [showConnect,setShowConnect]=useState(false);
 const [token,setToken]=useState('');
 const [connectBusy,setConnectBusy]=useState(false);
 const [showCollaborators,setShowCollaborators]=useState(false);
 const [collaborators,setCollaborators]=useState<Collaborator[]>([]);
 const [collabError,setCollabError]=useState('');
 const [collabName,setCollabName]=useState('');
 const [collabPerm,setCollabPerm]=useState<string>('push');
 const [collabBusy,setCollabBusy]=useState(false);
 const [showUpdate,setShowUpdate]=useState(false);
 const [updateState,setUpdateState]=useState<'idle'|'checking'|'available'|'downloading'|'current'|'error'>('idle');
 const [updateInfo,setUpdateInfo]=useState<{version:string;notes:string}|null>(null);
 const [updateProgress,setUpdateProgress]=useState(0);
 const [updateError,setUpdateError]=useState('');
 const [prTitle,setPrTitle]=useState('');
 const [prBody,setPrBody]=useState('');
 const [prBase,setPrBase]=useState('main');
 const [search,setSearch]=useState('');
 const [searchResults,setSearchResults]=useState<Array<{path:string;line:number;text:string}>>([]);
 const [searchBusy,setSearchBusy]=useState(false);
 const [sessions,setSessions]=useState<Session[]>([]);
 const [terminalVisible,setTerminalVisible]=useState(true);
 const [panelMode,setPanelMode]=useState<'terminal'|'problems'|'preview'|'tests'>('terminal');
 const [testReport,setTestReport]=useState<OwTestReport|null>(null);
 const [testBusy,setTestBusy]=useState(false);
 const [testTarget,setTestTarget]=useState('');
 const [testFilter,setTestFilter]=useState<string|undefined>();
 const [problems,setProblems]=useState<OwDiagnostic[]>([]);
 const [jump,setJump]=useState<{path:string;line:number;column:number;nonce:number}|null>(null);
 const [previewInput,setPreviewInput]=useState('http://127.0.0.1:8080/');
 const [previewUrl,setPreviewUrl]=useState('http://127.0.0.1:8080/');
 const [maxTerminal,setMaxTerminal]=useState(false);
 const [sidebarWidth,setSidebarWidth]=useState(()=>Number(localStorage.getItem('owler:sidebar-width'))||255);
 const [panelHeight,setPanelHeight]=useState(()=>Number(localStorage.getItem('owler:panel-height'))||268);
 const [sidebarVisible,setSidebarVisible]=useState(true);
 const [palette,setPalette]=useState(false);
 const [paletteQuery,setPaletteQuery]=useState('');
 const [showNewProject,setShowNewProject]=useState(false);
 const [showFileMenu,setShowFileMenu]=useState(false);
 const [reloadingDependencies,setReloadingDependencies]=useState(false);
 const [newProject,setNewProject]=useState<NewProject>({name:'my-ow-project',kind:'console'});
 const [showClone,setShowClone]=useState(false);
 const [cloneUrl,setCloneUrl]=useState('');
 const [showPublish,setShowPublish]=useState(false);
 const [diffPreview,setDiffPreview]=useState<{path:string;content:string}|null>(null);
 const [publishName,setPublishName]=useState('');
 const [publishVisibility,setPublishVisibility]=useState<'public'|'private'>('public');
 const [publishDescription,setPublishDescription]=useState('Created with Owler IDE');
 const [toasts,setToasts]=useState<Toast[]>([]);
 const toast=useCallback((message:string,error=false)=>{setToasts(v=>[...v.slice(-3),{id:Date.now()+Math.random(),message,error}]);setTimeout(()=>setToasts(v=>v.slice(1)),4300)},[]);
 const startSidebarDrag=useCallback((e:React.MouseEvent)=>{
  e.preventDefault();const startX=e.clientX,startW=sidebarWidth;
  const onMove=(ev:MouseEvent)=>setSidebarWidth(Math.max(190,Math.min(620,startW+(ev.clientX-startX))));
  const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);document.body.style.cursor='';document.body.style.userSelect='';setSidebarWidth(w=>{localStorage.setItem('owler:sidebar-width',String(w));return w})};
  window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);document.body.style.cursor='col-resize';document.body.style.userSelect='none';
 },[sidebarWidth]);
 const startPanelDrag=useCallback((e:React.MouseEvent)=>{
  e.preventDefault();const startY=e.clientY,startH=panelHeight;
  const onMove=(ev:MouseEvent)=>setPanelHeight(Math.max(120,Math.min(window.innerHeight-220,startH+(startY-ev.clientY))));
  const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);document.body.style.cursor='';document.body.style.userSelect='';setPanelHeight(h=>{localStorage.setItem('owler:panel-height',String(h));return h})};
  window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);document.body.style.cursor='row-resize';document.body.style.userSelect='none';
 },[panelHeight]);
 const refreshTree=useCallback(async()=>{
  if(!isDesktop)return;
  try{setTree(await call<FileNode[]>('list_files'))}catch(e){toast(String(e),true)}
 },[toast]);
 const refreshGit=useCallback(async()=>{
  if(!isDesktop)return;
  const id=++gitRefreshId.current,epoch=syncEpoch.current;
  const [gitResult,branchResult]=await Promise.all([
   call<GitSnapshot>('git_status').catch(()=>emptyGit),
   call<BranchList>('git_branches').catch(()=>({current:'',branches:[]}))
  ]);
  if(id===gitRefreshId.current&&epoch===syncEpoch.current){setGit(gitResult);setBranches(branchResult)}
 },[]);

 // Poll only while a desktop workspace is open. One request at a time,
 // background Rust traversal, unchanged tree/content omitted from IPC.
 // The cached observations are reapplied to the current editor state so an
 // undo or save can resolve a conflict without requiring another disk edit.
 const rootKey=JSON.stringify(roots);
 useEffect(()=>{
  if(!isDesktop||!roots.length){setSyncStatus('idle');return}
  let cancelled=false,busy=false,timer:ReturnType<typeof setTimeout>|undefined;
  const expectedRoots=JSON.parse(rootKey) as string[];
  let treeRevision:string|undefined;
  const disk=new Map<string,DiskUpdate>();
  let ticks=0,gitBusy=false;
  const tick=async()=>{
   if(cancelled||busy)return;
   busy=true;
   const epoch=syncEpoch.current;
   try{
    if(syncPaused.current)return;
    const requested=new Map(tabsRef.current.map(t=>[t.path,t.saved]));
    for(const path of disk.keys())if(!requested.has(path))disk.delete(path);
    const known=Object.fromEntries([...disk].map(([path,value])=>[path,value.revision]));
    const snapshot=await call<WorkspaceSnapshot>('sync_workspace',{
     paths:[...requested.keys()],known,treeRevision,expectedRoots
    });
    if(cancelled||epoch!==syncEpoch.current||syncPaused.current)return;
    treeRevision=snapshot.tree_revision;
    if(snapshot.tree)setTree(snapshot.tree);
    for(const update of snapshot.files)disk.set(update.path,update);
    setTabs(previous=>reconcileDiskTabs(previous,requested,disk));
    setSyncStatus('live');
    if((snapshot.tree||snapshot.files.length||++ticks%5===0)&&!gitBusy){gitBusy=true;void refreshGit().finally(()=>{gitBusy=false})}
   }catch{
    if(!cancelled&&epoch===syncEpoch.current)setSyncStatus('error');
   }finally{
    busy=false;
    if(!cancelled)timer=setTimeout(tick,1200);
   }
  };
  const focus=()=>{if(timer)clearTimeout(timer);void tick()};
  window.addEventListener('focus',focus);
  void tick();
  return()=>{cancelled=true;if(timer)clearTimeout(timer);window.removeEventListener('focus',focus)};
 },[rootKey,refreshGit]);

 // Refresh the explorer AND all open editor buffers from disk. Claude/Codex may
 // edit files outside of Monaco, so refreshing only the tree is insufficient.
 // Never overwrite an editor buffer that has unsaved user changes.
 const reloadProject=useCallback(async(silent=false)=>{
  if(!workspace){toast('Open an OW project to reload',true);return}
  if(!isDesktop){toast('Reload Project requires the desktop app',true);return}
  const epoch=syncEpoch.current;
  try{
   const freshTree=await call<FileNode[]>('list_files');
   const disk=await Promise.all(tabs.map(async tab=>{
    try{return {path:tab.path,text:await call<string>('read_file',{path:tab.path}),error:false}}
    catch{return {path:tab.path,text:'',error:true}}
   }));
   if(epoch!==syncEpoch.current)return;
   const contents=new Map(disk.filter(item=>!item.error).map(item=>[item.path,item.text]));
   const changed=tabs.filter(tab=>contents.has(tab.path)&&contents.get(tab.path)!==tab.saved);
   const protectedTabs=changed.filter(tab=>tab.content!==tab.saved);
   const safeCount=changed.length-protectedTabs.length;
   setTree(freshTree);
   setTabs(previous=>previous.map(tab=>{
    const text=contents.get(tab.path);
    if(text===undefined||text===tab.saved||tab.content!==tab.saved)return tab;
    return {...tab,content:text,saved:text};
   }));
   await refreshGit();
   const missing=disk.filter(item=>item.error).length;
   if(silent)return;
   if(protectedTabs.length||missing){
    toast('Reloaded '+safeCount+' file(s). Kept '+protectedTabs.length+' unsaved tab(s) unchanged'+(missing?', '+missing+' unreadable/deleted file(s)':'')+'.',protectedTabs.length>0||missing>0);
   }else{
    toast('Project reloaded'+(safeCount?' · '+safeCount+' open file(s) refreshed':' · files already up to date'));
   }
  }catch(e){toast('Could not reload project: '+String(e),true)}
 },[workspace,tabs,refreshGit,toast]);
 useEffect(()=>{
  if(!showFileMenu)return;
  const close=(event:MouseEvent)=>{
   if(!(event.target instanceof Element&&event.target.closest('.file-menu')))setShowFileMenu(false);
  };
  window.addEventListener('mousedown',close);
  return()=>window.removeEventListener('mousedown',close);
 },[showFileMenu]);
 // Reload the exact project whose manifest was right-clicked (including extra roots).
 // Save only the manifest when it has unsaved Monaco edits, never unrelated tabs.
 const reloadDependencies=useCallback(async(path:string)=>{
  if(reloadingDependencies||syncPaused.current)return;
  if(!/^(?:@\d+\/)?dependencies\.yml$/.test(path)){
   toast('Select the project-root dependencies.yml file',true);return;
  }
  if(!isDesktop){toast('Dependency management is available in the desktop app',true);return}
  const modified=tabs.find(tab=>tab.path===path&&tab.content!==tab.saved);
  if(modified&&!confirm('Save changes to dependencies.yml before reloading OW libraries?'))return;
  setReloadingDependencies(true);
  const expectedRoots=[...rootsRef.current];
  syncEpoch.current++;syncPaused.current++;
  try{
   if(modified){
    const disk=await call<string>('read_file',{path});
    if(disk!==modified.saved&&!confirm('dependencies.yml was also modified outside OWler. Overwrite the external changes with the open editor version?'))return;
    await call('write_file_checked',{path,content:modified.content,expectedContent:disk,expectedRoots});
    setTabs(previous=>previous.map(tab=>tab.path===path?{...tab,saved:modified.content}:tab));
   }
   toast('Reloading OW dependencies from dependencies.yml…');
   await call<string>('reload_dependencies',{path});
   await reloadProject(true);
   toast('OW dependencies reloaded · dependencies.lock.yml updated');
  }catch(e){toast('Could not reload dependencies: '+String(e).slice(0,350),true)}
  finally{syncPaused.current--;syncEpoch.current++;setReloadingDependencies(false)}
 },[reloadingDependencies,tabs,reloadProject,toast]);
 const refreshAuth=useCallback(async()=>{
  if(!isDesktop)return;
  try{setGithubAuth(await call<GithubAuth>('github_auth_status'))}catch{/* gh not installed */}
 },[]);
 useEffect(()=>{if(section==='git')void refreshAuth()},[section,refreshAuth]);
 useEffect(()=>{setMainEntry(workspace?localStorage.getItem('owler:main:'+workspace)||'':'')},[workspace]);
 useEffect(()=>{if(roots.length>1)setExpanded(p=>{const n=new Set(p);n.add('');roots.forEach((_,i)=>{if(i>0)n.add('@'+i)});return n})},[roots.length]);
 // Discord Rich Presence — "Playing OWler IDE" + "Editing <file>".
 useEffect(()=>{if(!isDesktop)return;const t=setTimeout(()=>{
   const base=workspace.split(/[\\/]/).filter(Boolean).pop()||'';
   if(settings.discord===false){void call('discord_clear').catch(()=>{});return}
   const details=active?`Editing ${fileName(active)}`:workspace?`Browsing ${base}`:'Idle';
   void call('discord_activity',{details,stateLine:base||undefined}).catch(()=>{});
  },1500);return()=>clearTimeout(t)},[active,workspace,settings.discord]);
 const setAsMain=useCallback((node:FileNode)=>{if(!workspace)return;localStorage.setItem('owler:main:'+workspace,node.path);setMainEntry(node.path);toast(`${fileName(node.path)} is now the main entry point`)},[workspace,toast]);
 const clearMain=useCallback(()=>{if(!workspace)return;localStorage.removeItem('owler:main:'+workspace);setMainEntry('');toast('Main entry cleared — the IDE will auto-detect it')},[workspace,toast]);
 const addFolder=useCallback(async()=>{
  if(!workspace){void pickOpen();return}
  const picked=await open({directory:true,multiple:false,title:'Add a folder to this workspace'});
  if(!picked||Array.isArray(picked)||syncPaused.current)return;
  syncEpoch.current++;syncPaused.current++;
  try{const t=await call<FileNode[]>('add_root',{path:picked});setTree(t);setRoots(await call<string[]>('workspace_roots'));toast(`Added ${String(picked).split(/[\\/]/).pop()}`)}catch(e){toast(String(e),true)}finally{syncPaused.current--;syncEpoch.current++}
 },[workspace,toast]);
 const removeFolder=useCallback(async(abs:string)=>{
  if(syncPaused.current)return;
  if(tabsRef.current.some(t=>t.content!==t.saved)&&!confirm('Changing workspace roots closes open tabs. Discard unsaved edits?'))return;
  syncEpoch.current++;syncPaused.current++;
  try{const t=await call<FileNode[]>('remove_root',{path:abs});setTree(t);const rs=await call<string[]>('workspace_roots');setTabs([]);setActive('');setRoots(rs);if(rs.length){setWorkspacePath(rs[0]);void refreshGit()}else{setWorkspacePath('')}toast('Removed folder from workspace')}catch(e){toast(String(e),true)}finally{syncPaused.current--;syncEpoch.current++}
 },[refreshGit,toast]);
 const makePrimaryFolder=useCallback(async(abs:string)=>{
  if(syncPaused.current)return;
  if(tabsRef.current.some(t=>t.content!==t.saved)&&!confirm('Changing workspace roots closes open tabs. Discard unsaved edits?'))return;
  syncEpoch.current++;syncPaused.current++;
  try{const t=await call<FileNode[]>('set_primary_root',{path:abs});setTree(t);setTabs([]);setActive('');setRoots(await call<string[]>('workspace_roots'));setWorkspacePath(abs);void refreshGit();toast(`${abs.split(/[\\/]/).pop()} is now the primary folder`)}catch(e){toast(String(e),true)}finally{syncPaused.current--;syncEpoch.current++}
 },[refreshGit,toast]);
 // Map a tree root node (path '' or '@i') to its absolute folder path.
 const rootAbs=useCallback((nodePath:string)=>{const m=nodePath.match(/^@(\d+)$/);return roots[m?Number(m[1]):0]||''},[roots]);
 const isRootNode=useCallback((node:FileNode)=>node.directory&&(node.path===''||/^@\d+$/.test(node.path)),[]);
 const openWorkspace=useCallback(async(path:string)=>{
  if(syncPaused.current)return false;
  if(tabsRef.current.some(t=>t.content!==t.saved)&&!confirm('Open another project and discard unsaved edits?'))return false;
  syncEpoch.current++;syncPaused.current++;
  try{const entries=await call<FileNode[]>('set_workspace',{path});setWorkspacePath(path);setRoots(await call<string[]>('workspace_roots'));setTree(entries);setTabs([]);setActive('');setProblems([]);setTestReport(null);setGit(emptyGit);localStorage.setItem('owler:last-workspace',path);setSection('files');
   // Live sync refreshes Git after the explorer is available; don't block opening.
   toast(`Opened ${path.split(/[\\/]/).pop()}`);return true;
  }catch(e){toast(String(e),true);return false}finally{syncPaused.current--;syncEpoch.current++}
 },[toast]);
 useEffect(()=>{
  if(!isDesktop)return;
  // Let the first frame paint before restoring a project or starting a JVM.
  const restore=setTimeout(()=>{const path=localStorage.getItem('owler:last-workspace');if(path&&!rootsRef.current.length&&!syncPaused.current)void openWorkspace(path)},100);
  const probe=setTimeout(()=>{void call<ToolchainInfo>('ow_toolchain_info').then(setToolchain).catch(()=>setToolchain({...blankToolchain,source:'Unavailable'}))},750);
  return()=>{clearTimeout(restore);clearTimeout(probe)};
 },[openWorkspace]);
 useEffect(()=>{if(isDesktop&&section==='tools')void call<CliAvailability[]>('environment_status').then(setEnvironment).catch(()=>{})},[section]);
 const pickOpen=useCallback(async()=>{if(!isDesktop){toast('Open the desktop app to access local folders',true);return}const selected=await open({directory:true,multiple:false,title:'Open a folder in Owler'});if(typeof selected==='string')void openWorkspace(selected)},[openWorkspace,toast]);
 const openFile=useCallback(async(path:string)=>{
  setSection('files');
  if(tabs.some(t=>t.path===path)){setActive(path);return}
  const epoch=syncEpoch.current;
  try{const content=await call<string>('read_file',{path});if(epoch!==syncEpoch.current)return;setTabs(t=>t.some(tab=>tab.path===path)?t:[...t,{path,content,saved:content}]);setActive(path)}catch(e){toast(String(e),true)}
 },[tabs,toast]);
 const closeFile=useCallback((path:string)=>{
  const t=tabs.find(t=>t.path===path);
  if(t&&t.content!==t.saved&&!confirm(`Close ${path} and discard unsaved changes?`))return;
  const next=tabs.filter(t=>t.path!==path);
  setTabs(next);if(active===path)setActive(next[next.length-1]?.path??'');
 },[tabs,active]);
 const changeFile=useCallback((path:string,content:string)=>setTabs(ts=>ts.map(t=>t.path===path?{...t,content}:t)),[]);
 const saveAll=useCallback(async()=>{
  const dirty=tabsRef.current.filter(t=>t.content!==t.saved);
  if(!dirty.length)return true;
  if(syncPaused.current)return false;
  const expectedRoots=[...rootsRef.current];
  syncEpoch.current++;syncPaused.current++;
  try{
   for(const t of dirty){
    let expected:string|null=t.saved;
    if(t.diskState==='missing'){
     if(!confirm(t.path+' was deleted or renamed outside OWler. Recreate it with your editor contents?'))return false;
     expected=null;
    }else{
     const disk=await call<string>('read_file',{path:t.path});
     if(disk!==t.saved){
      if(!confirm(t.path+' changed outside OWler. Overwrite the latest disk version with your editor contents? Cancel to keep both versions.'))return false;
      expected=disk;
     }
    }
    await call('write_file_checked',{path:t.path,content:t.content,expectedContent:expected,expectedRoots});
    setTabs(ts=>ts.map(tab=>tab.path===t.path?{...tab,saved:t.content,diskState:undefined}:tab));
   }
   void refreshGit();toast('Saved '+dirty.length+' file(s)');return true;
  }catch(e){toast(String(e),true);return false;}
  finally{syncPaused.current--;syncEpoch.current++}
 },[refreshGit,toast]);
 const reloadDiskFile=useCallback(async(path:string)=>{
  const tab=tabsRef.current.find(t=>t.path===path);
  if(!tab)return;
  if(tab.content!==tab.saved&&!confirm('Discard unsaved editor changes and load the current disk version of '+path+'?'))return;
  const epoch=syncEpoch.current;
  try{
   const text=await call<string>('read_file',{path});
   if(epoch!==syncEpoch.current)return;
   setTabs(previous=>previous.map(t=>t.path===path&&t.content===tab.content&&t.saved===tab.saved?
    {...t,content:text,saved:text,diskState:undefined}:t));
   toast('Reloaded '+path);
  }catch(e){toast('Cannot reload disk version: '+String(e),true)}
 },[toast]);
 const runOwTests=useCallback(async(target='.',filter?:string)=>{
  if(!workspace){toast('Open an OW project before running tests',true);return}
  if(testBusy)return;
  if(!(await saveAll()))return;
  setTestTarget(target);setTestFilter(filter);setTestBusy(true);setTestReport(null);
  setPanelMode('tests');setTerminalVisible(true);
  try{
   const report=await call<OwTestReport>('ow_test',{target,filter});
   setTestReport(report);
   toast(report.ok?('OWUnit: '+report.passed+' test(s) passed'):('OWUnit failed: '+report.passed+' passed, '+report.failed+' failed'),!report.ok);
  }catch(e){
   const error=String(e);
   setTestReport({ok:false,passed:0,failed:0,results:[],exit_code:null,output:error});
   toast('OWUnit: '+error.slice(0,240),true);
  }finally{setTestBusy(false)}
 },[workspace,testBusy,saveAll,toast]);

 const createOwUnitTest=useCallback(async(rootPath?:string)=>{
  if(!workspace){toast('Open an OW project first',true);return}
  const name=prompt('New OWUnit test class name','CalculatorTest');
  if(!name)return;
  try{
   const file=await call<string>('create_owunit_test',{name,rootPath:rootPath??'.'});
   await refreshTree();
   const folder=file.slice(0,file.lastIndexOf('/'));
   setExpanded(previous=>new Set(previous).add(folder));
   await openFile(file);
   toast('Created OWUnit test: '+file);
  }catch(e){toast('Cannot create OWUnit test: '+String(e),true)}
 },[workspace,refreshTree,openFile,toast]);

 const navigateOwTest=useCallback(async(result:OwTestResult)=>{
  if(!result.file){toast('No source file location was provided by OWUnit',true);return}
  try{
   const contents=await call<string>('read_file',{path:result.file});
   const declaration=discoverOwTests(contents).find(t=>t.name===result.name);
   await openFile(result.file);
   setJump({path:result.file,line:declaration?.functionLine??1,column:1,nonce:Date.now()});
  }catch(e){toast('Cannot open test: '+String(e),true)}
 },[openFile,toast]);
 const startSession=useCallback(async(kind:'shell'|'powershell'|'claude'|'codex'|'gemini'|'aider'|'opencode')=>{
  if(!workspace){toast('Open a project first',true);return}
  try{const id=await call<string>('terminal_start',{kind});setSessions(ts=>[...ts,{id,name:({shell:'Shell',powershell:'PowerShell',claude:'Claude Code',codex:'Codex CLI',gemini:'Gemini CLI',aider:'Aider',opencode:'OpenCode'} as const)[kind],kind}]);setTerminalVisible(true);setPanelMode('terminal')}catch(e){toast(String(e),true)}
 },[workspace,toast]);
 const entry=useMemo(()=>isOw(active)?active:flattenNodes(tree).find(n=>n.path==='src/main.ow')?.path??flattenNodes(tree).find(n=>isOw(n.path))?.path??'',[active,tree]);
 const runOw=useCallback(async(action:'check'|'run'|'build'|'llvm'|'package',packKind?:string)=>{
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
    // Run/Build/Package all need a file with a `main:` block — resolve it rather
    // than compiling whatever module happens to be the active tab.
    // A pinned "main entry" (right-click → Set as main entry) wins; otherwise
    // fall back to the active tab, and the backend finds a file with `main:`.
    const preferred=mainEntry||entry;let target=preferred;
    try{target=await call<string>('ow_entry',{preferred})}catch(e){toast(String(e),true);return}
    if(target!==active)toast(`Entry: ${target}`);
    const id=await call<string>('ow_task',{action,entry:target,name:appName,kind:packKind||'web'});
    const label=action==='package'?`Package ${packKind||'web'}`:action==='build'?'Native Build':action==='llvm'?'LLVM IR':'OW Run';
    setSessions(ts=>[...ts,{id,name:label,kind:'ow'}]);setTerminalVisible(true);setPanelMode('terminal');
    toast(`${label} started`);
  }catch(e){toast(String(e),true)}
 },[entry,active,mainEntry,saveAll,toast,workspace]);
 const runWebApp=useCallback(async()=>{
  if(!workspace){toast('Open a project first',true);return}
  if(!(await saveAll()))return;
  try{
   const r=await call<{session_id:string;port:number;url:string}>('ow_serve',{entry:mainEntry||(isOw(active)?active:undefined)});
   setSessions(ts=>[...ts,{id:r.session_id,name:`Web :${r.port}`,kind:'ow'}]);
   setTerminalVisible(true);setPanelMode('terminal');setPreviewInput(r.url);
   toast(`Web server starting on ${r.url}`);
   // Give the server a moment to bind, then show the preview.
   setTimeout(()=>{setPreviewUrl(r.url);setPreviewInput(r.url);setPanelMode('preview');setTerminalVisible(true)},2600);
  }catch(e){toast(String(e),true)}
 },[workspace,active,mainEntry,saveAll,toast]);
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
  setGitBusy(true);try{const result=await call<string>('git_action',{action,message,file});setGitOutput(result||`${action} finished`);if(action==='commit')setCommitMessage('');await refreshGit();if(action==='pull'||action==='branch_switch')void reloadProject();toast(`Git ${action.replace('_',' ')} completed`)}catch(e){setGitOutput(String(e));toast(String(e),true)}finally{setGitBusy(false)}
 },[workspace,refreshGit,reloadProject,toast]);
 const switchBranch=useCallback(async(name:string)=>{
  setShowBranches(false);if(name===branches.current)return;
  await gitAction('branch_switch',name);
 },[branches.current,gitAction]);
 const createBranch=useCallback(async()=>{
  const name=newBranch.trim();if(!name)return;
  setShowBranches(false);setNewBranch('');await gitAction('branch_new',name);
 },[newBranch,gitAction]);
 const connectToken=useCallback(async()=>{
  if(!token.trim())return;
  setConnectBusy(true);try{const msg=await call<string>('github_token_login',{token});setToken('');setShowConnect(false);setGitOutput(msg);await refreshAuth();toast('Connected to GitHub')}catch(e){setGitOutput(String(e));toast(String(e),true)}finally{setConnectBusy(false)}
 },[token,refreshAuth,toast]);
 const disconnectGithub=useCallback(async()=>{
  try{const msg=await call<string>('github_logout');setGitOutput(msg);await refreshAuth();toast('Disconnected from GitHub')}catch(e){toast(String(e),true)}
 },[refreshAuth,toast]);
 const refreshCollaborators=useCallback(async()=>{
  if(!workspace)return;
  try{setCollabError('');setCollaborators(await call<Collaborator[]>('github_collaborators'))}
  catch(e){setCollabError(String(e));setCollaborators([])}
 },[workspace]);
 const addCollaborator=useCallback(async()=>{
  const username=collabName.trim();if(!username)return;
  setCollabBusy(true);try{const msg=await call<string>('github_collaborator_add',{username,permission:collabPerm});setCollabName('');toast(msg);await refreshCollaborators()}catch(e){toast(String(e),true)}finally{setCollabBusy(false)}
 },[collabName,collabPerm,refreshCollaborators,toast]);
 const removeCollaborator=useCallback(async(username:string)=>{
  if(!confirm(`Remove ${username} from this repository?`))return;
  setCollabBusy(true);try{const msg=await call<string>('github_collaborator_remove',{username});toast(msg);await refreshCollaborators()}catch(e){toast(String(e),true)}finally{setCollabBusy(false)}
 },[refreshCollaborators,toast]);
 const openCollaborators=useCallback(()=>{setShowCollaborators(true);void refreshCollaborators()},[refreshCollaborators]);
 const checkForUpdates=useCallback(async()=>{
  if(!isDesktop){toast('Updates are available in the desktop app only',true);return}
  setShowUpdate(true);setUpdateState('checking');setUpdateError('');setUpdateProgress(0);
  try{const {check}=await import('@tauri-apps/plugin-updater');const update=await check();
   if(update){setUpdateInfo({version:update.version,notes:update.body||''});setUpdateState('available')}
   else{setUpdateState('current')}
  }catch(e){setUpdateState('error');setUpdateError(String(e))}
 },[toast]);
 const installUpdate=useCallback(async()=>{
  setUpdateState('downloading');setUpdateProgress(0);
  try{const {check}=await import('@tauri-apps/plugin-updater');const {relaunch}=await import('@tauri-apps/plugin-process');
   const update=await check();
   if(!update){setUpdateState('current');return}
   let total=0,received=0;
   await update.downloadAndInstall(e=>{
    if(e.event==='Started')total=e.data.contentLength||0;
    else if(e.event==='Progress'){received+=e.data.chunkLength;setUpdateProgress(total?Math.min(100,Math.round(received/total*100)):0)}
    else if(e.event==='Finished')setUpdateProgress(100);
   });
   toast('Update installed — restarting Owler…');await relaunch();
  }catch(e){setUpdateState('error');setUpdateError(String(e))}
 },[toast]);
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
 const parentDir=useCallback((node:FileNode)=>node.directory?node.path:dirname(node.path).replace(/\/$/,''),[]);
 const newEntryIn=useCallback(async(node:FileNode,directory:boolean)=>{
  const base=parentDir(node);const name=prompt(directory?'New folder name':'New file name',directory?'new-folder':'new-file.ow');
  if(!name)return;const path=base?`${base}/${name}`:name;
  try{await call('new_entry',{path,directory});setExpanded(p=>new Set(p).add(base));await refreshTree();if(!directory)void openFile(path)}catch(e){toast(String(e),true)}
 },[parentDir,refreshTree,openFile,toast]);
 const quickCreate=useCallback(async(node:FileNode,ext:string,placeholder:string)=>{
  const base=parentDir(node);const input=prompt(`New ${ext.toUpperCase()} file name`,placeholder);
  if(!input)return;const name=input.endsWith(`.${ext}`)?input:`${input}.${ext}`;const path=base?`${base}/${name}`:name;
  try{await call('new_entry',{path,directory:false});setExpanded(p=>new Set(p).add(base));await refreshTree();void openFile(path)}catch(e){toast(String(e),true)}
 },[parentDir,refreshTree,openFile,toast]);
 const pasteInto=useCallback(async(node:FileNode)=>{
  if(!clipboard)return;const base=parentDir(node);const name=fileName(clipboard.node.path);
  let target=base?`${base}/${name}`:name;
  if(target===clipboard.node.path&&clipboard.mode==='copy'){const dot=name.lastIndexOf('.');const copy=dot>0?`${name.slice(0,dot)} copy${name.slice(dot)}`:`${name} copy`;target=base?`${base}/${copy}`:copy}
  try{
   if(clipboard.mode==='copy')await call('copy_entry',{path:clipboard.node.path,newPath:target});
   else{await call('rename_entry',{path:clipboard.node.path,newPath:target});setClipboard(null)}
   setExpanded(p=>new Set(p).add(base));await refreshTree();toast(clipboard.mode==='copy'?'Pasted':'Moved')
  }catch(e){toast(String(e),true)}
 },[clipboard,parentDir,refreshTree,toast]);
 const absOf=useCallback((p:string)=>{const m=p.match(/^@(\d+)(?:\/(.*))?$/);if(m){const base=roots[Number(m[1])]||'';return `${base}/${m[2]||''}`.replace(/\/$/,'')}return `${workspace}/${p}`.replace(/\/$/,'')},[roots,workspace]);
 const revealEntry=useCallback((node:FileNode)=>{if(!workspace)return;const folder=node.directory?node.path:dirname(node.path).replace(/\/$/,'');void openUrl(absOf(folder).replace(/\//g,'\\'))},[workspace,absOf]);
 const moveEntry=useCallback(async(src:string,destDir:string)=>{
  if(!src)return;const name=fileName(src);const target=destDir?`${destDir}/${name}`:name;
  if(target===src)return;
  if(destDir===src||destDir.startsWith(src+'/')){toast("A folder can't be moved into itself",true);return}
  if((dirname(src).replace(/\/$/,''))===destDir)return; // already there
  try{await call('rename_entry',{path:src,newPath:target});
   setTabs(ts=>ts.map(t=>t.path===src?{...t,path:target}:t.path.startsWith(src+'/')?{...t,path:target+t.path.slice(src.length)}:t));
   if(active===src)setActive(target);else if(active.startsWith(src+'/'))setActive(target+active.slice(src.length));
   if(destDir)setExpanded(p=>new Set(p).add(destDir));await refreshTree();toast(`Moved ${name}`)
  }catch(e){toast(String(e),true)}
 },[active,refreshTree,toast]);
 const selectRuntimeJars=useCallback(async()=>{
  if(!workspace)return;
  try{
   const chosen=await open({multiple:true,filters:[{name:'JVM runtime extension',extensions:['jar']}],title:'Select trusted runtime extension JARs'});
   if(!chosen)return;
   const paths=Array.isArray(chosen)?chosen:[chosen];
   if(!confirm('Runtime JARs execute Java code with your account permissions. Only enable trusted files. Replace the selected JARs for this project?'))return;
   setRuntimeJars(await call<string[]>('set_runtime_extensions',{paths,expectedRoot:workspace}));
   toast('Runtime extensions configured for this session');
  }catch(e){toast(String(e),true)}
 },[workspace,toast]);
 const clearRuntimeJars=useCallback(async()=>{
  try{setRuntimeJars(await call<string[]>('set_runtime_extensions',{paths:[],expectedRoot:workspace}));toast('Runtime extensions cleared')}catch(e){toast(String(e),true)}
 },[workspace,toast]);
 const createProject=useCallback(async()=>{
  if(!isDesktop){toast('Use the desktop app',true);return}
  const parent=await open({directory:true,multiple:false,title:'Choose where to create the OW project'});
  if(typeof parent!=='string')return;
  try{const path=await call<string>('create_project',{baseDir:parent,name:newProject.name,kind:newProject.kind});setShowNewProject(false);if(await openWorkspace(path)){const content=await call<string>('read_file',{path:'src/main.ow'});setTabs([{path:'src/main.ow',content,saved:content}]);setActive('src/main.ow')}}catch(e){toast(String(e),true)}
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
 const paletteItems=useMemo(()=>palette?[
  {name:'Open folder',hint:'File',run:pickOpen},
  {name:'New OW project',hint:'File',run:()=>setShowNewProject(true)},
  {name:'New OWUnit test',hint:'Test',run:()=>{void createOwUnitTest()}},
  {name:'Run all OWUnit tests',hint:'Test',run:()=>{void runOwTests('tests')}},
  {name:'Run OWUnit tests in current file',hint:'Test',run:()=>{if(isOw(active))void runOwTests(active)}},
   {name:'Reload project',hint:'Ctrl+Shift+R',run:()=>{void reloadProject()}},
  {name:'Add folder to workspace',hint:'Explorer',run:()=>{void addFolder()}},
  {name:'Clone GitHub repository',hint:'Git',run:()=>setShowClone(true)},
  {name:'Publish project to GitHub',hint:'GitHub',run:()=>{setPublishName(workspace.split(/[\\/]/).pop()?.toLowerCase().replace(/[^a-z0-9-_]/g,'-')||'owler-project');setShowPublish(true)}},
  {name:'Save all files',hint:'Ctrl+S',run:()=>{void saveAll()}},
  {name:'Run OW application',hint:'F5',run:()=>{void runOw('run')}},
  {name:'Check OW source',hint:'Build',run:()=>{void runOw('check')}},
  {name:'Build native executable (LLVM)',hint:'Build',run:()=>{void runOw('build')}},
   {name:'Emit LLVM IR (.ll)',hint:'Build',run:()=>{void runOw('llvm')}},
  {name:'Run web app (serve + preview)',hint:'Run',run:()=>{void runWebApp()}},
  {name:'Package Night web app',hint:'Build',run:()=>{void runOw('package','web')}},
  {name:'Package native GUI',hint:'Build',run:()=>{void runOw('package','gui')}},
  {name:'Open Claude Code',hint:'Agent',run:()=>{void startSession('claude')}},
  {name:'Open Codex CLI',hint:'Agent',run:()=>{void startSession('codex')}},
  {name:'Open Gemini CLI',hint:'Agent',run:()=>{void startSession('gemini')}},
  {name:'Open Aider',hint:'Agent',run:()=>{void startSession('aider')}},
  {name:'Open OpenCode',hint:'Agent',run:()=>{void startSession('opencode')}},
  {name:'Open system terminal',hint:'Terminal',run:()=>{void startSession('shell')}},
  {name:'Open PowerShell terminal',hint:'Terminal',run:()=>{void startSession('powershell')}},
  {name:'Push to GitHub',hint:'Git',run:()=>{void gitAction('push')}},
  {name:'Pull from GitHub',hint:'Git',run:()=>{void gitAction('pull')}},
  ...flattenNodes(tree).filter(n=>!n.directory).map(n=>({name:n.path,hint:'File',run:()=>{void openFile(n.path)}}))
 ]:[],[palette,pickOpen,saveAll,runOw,runWebApp,addFolder,startSession,gitAction,openFile,reloadProject,createOwUnitTest,runOwTests,active,tree,workspace]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void saveAll()}
   else if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();setPalette(true);setPaletteQuery('>')}
   else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();setPalette(true);setPaletteQuery('')}
   else if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='r'){e.preventDefault();void reloadProject()}
    else if((e.ctrlKey||e.metaKey)&&e.key==='`'){e.preventDefault();setTerminalVisible(v=>!v)}
   else if(e.key==='F5'){e.preventDefault();void runOw('run')}
   else if(e.key==='Escape'){setPalette(false);setCtxMenu(null);setShowFileMenu(false)}
  };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)
 },[saveAll,runOw,reloadProject]);

 const modifiedPaths=useMemo(()=>new Set(git.changes.map(c=>c.path)),[git.changes]);
 // Render keyed rows rather than defining a new component type on every App render.
 function renderTreeItem(node:FileNode,depth=0):React.ReactNode{
  const isExpanded=expanded.has(node.path);
  const modified=modifiedPaths.has(node.path);
  const dropDir=node.directory?node.path:dirname(node.path).replace(/\/$/,'');
  return <Fragment key={node.path}><div className={`tree-item ${node.path===active?'selected':''} ${dropTarget===node.path?'drop-target':''}`} style={{paddingLeft:11+depth*13}} draggable onDragStart={e=>{e.stopPropagation();setDragPath(node.path);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragPath('');setDropTarget('')}} onDragOver={e=>{if(dragPath&&dragPath!==node.path){e.preventDefault();e.dataTransfer.dropEffect='move';setDropTarget(node.path)}}} onDragLeave={()=>setDropTarget(t=>t===node.path?'':t)} onDrop={e=>{e.preventDefault();e.stopPropagation();const src=dragPath;setDragPath('');setDropTarget('');if(src)void moveEntry(src,dropDir)}} onClick={()=>node.directory?setExpanded(prev=>{const n=new Set(prev);if(n.has(node.path))n.delete(node.path);else n.add(node.path);return n;}):void openFile(node.path)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtxMenu({x:e.clientX,y:e.clientY,node})}}>
   <span className="tree-chevron">{node.directory?(isExpanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>):null}</span>
   <span className={`tree-icon ${isOw(node.path)?'ow':''}`}>{node.directory?isExpanded?<FolderOpen size={15}/>:<Folder size={15}/>:fileIcon(node)}</span><span className="tree-label">{node.name}</span>{node.path===mainEntry&&<span className="tree-main" title="Main entry point"><Play size={10} fill="currentColor"/></span>}{modified&&<span className="tree-modified">M</span>}
  </div>{node.directory&&isExpanded&&node.children.map(n=>renderTreeItem(n,depth+1))}</Fragment>;
 }
 const testCommand=testTarget?('ow test '+testTarget+(testFilter?' --filter '+testFilter:'')):'';
 const basename=workspace.split(/[\\/]/).filter(Boolean).pop()||'NO FOLDER';
 const visiblePalette=paletteItems.filter(i=>i.name.toLowerCase().includes(paletteQuery.toLowerCase().replace(/^>/,''))).slice(0,18);
 return <div className="app">
  <div className="titlebar"><div className="title-brand"><span className="brand-icon"><span>o</span><span>w</span></span><span className="brand-name">owler<span className="brand-name-dim"> IDE</span></span><span className="brand-beta">BETA</span></div>
   <div className="file-menu"><button className="file-menu-trigger" type="button" aria-expanded={showFileMenu} onClick={()=>setShowFileMenu(v=>!v)}>File <ChevronDown size={12}/></button>{showFileMenu&&<div className="file-menu-dropdown">
    <button onClick={()=>{setShowFileMenu(false);setShowNewProject(true)}}><FilePlus size={15}/> Create New OW Project…</button>
    <button disabled={!workspace} onClick={()=>{setShowFileMenu(false);void createOwUnitTest()}}><FlaskConical size={15}/> New OWUnit Test…</button>
    <button disabled={!workspace||testBusy} onClick={()=>{setShowFileMenu(false);void runOwTests('tests')}}><Play size={15}/> Run All OWUnit Tests</button>
    <button onClick={()=>{setShowFileMenu(false);void pickOpen()}}><FolderOpen size={15}/> Open Folder…</button>
    <div className="file-menu-separator"/>
    <button disabled={!workspace} onClick={()=>{setShowFileMenu(false);void reloadProject()}}><RefreshCw size={15}/> Reload Project <kbd>Ctrl+Shift+R</kbd></button>
    <button disabled={!workspace} onClick={()=>{setShowFileMenu(false);void saveAll()}}><Save size={15}/> Save All <kbd>Ctrl+S</kbd></button>
   </div>}</div>
    <div className="title-project"><Code2 size={14}/><span>{workspace?basename:'Welcome to Owler'}</span><ChevronDown size={13}/></div>
   <div className="title-right"><span className={`runtime-indicator ${toolchain.available?'ready':''}`}><span/>{toolchain.available?'OW READY':toolchain.source==='Checking...'?'OW CHECKING':'OW TOOLCHAIN'}</span><button title="Command palette" onClick={()=>{setPalette(true);setPaletteQuery('')}}><Command size={15}/><span>Command palette</span><kbd>⌘ K</kbd></button><div className="title-avatar">OW</div></div>
  </div>
  <div className="toolbar"><div className="toolbar-leading"><button title="Toggle sidebar" onClick={()=>setSidebarVisible(v=>!v)}><Menu size={16}/></button><span className="toolbar-divider"/><span className="toolbar-label">WORKSPACE</span><ChevronRight size={13}/><b>{basename}</b></div>
   <div className="toolbar-center"><button className="toolbar-action muted" onClick={()=>void runOwTests('tests')} title="Run all OWUnit tests" disabled={!workspace||testBusy}><FlaskConical size={15}/> Test</button><button className="toolbar-action muted" onClick={()=>void runOw('check')} title="Compile-time check"><Check size={15}/> Check</button><button className="toolbar-action muted" onClick={()=>void runOw('build')} title="Build native OW program (experimental LLVM subset)"><Package size={15}/> Build</button><button className="toolbar-action muted" onClick={()=>void runOw('llvm')} title="Emit LLVM IR to build/owler (experimental)"><Code2 size={15}/> LLVM IR</button><button className="toolbar-action muted" onClick={()=>void runWebApp()} title="Run web app (serve + open preview)"><Globe size={15}/> Run web</button><div className="dropdown"><button className="toolbar-action muted" onClick={()=>void runOw('package','web')} title="Package complete OW/Night web app"><Package size={15}/> Web app</button></div><button className="run-button" onClick={()=>void runOw('run')}><Play size={14} fill="currentColor"/> Run OW <kbd>F5</kbd></button></div>
   <div className="toolbar-trailing"><button onClick={()=>void reloadProject()} disabled={!workspace} title="Reload project and open files from disk (Ctrl+Shift+R)"><RefreshCw size={16}/></button><button onClick={()=>setTerminalVisible(v=>!v)} title="Toggle terminal"><PanelBottom size={17}/></button><button onClick={()=>{setSection('tools');setSidebarVisible(true)}} title="Development tools"><Settings2 size={17}/></button></div>
  </div>
  <div className="main-layout">
   <div className="activity-rail"><div className="rail-top">
    {([['files',Files,'Explorer'],['search',Search,'Search'],['git',GitBranch,'Source control'],['tools',Layers,'Tools & extensions']] as const).map(([key,Icon,label])=><button key={key} className={section===key&&sidebarVisible?'active':''} title={label} onClick={()=>{setSection(key);setSidebarVisible(true)}}><Icon size={20}/>{key==='git'&&git.changes.length>0&&<span className="rail-dot"/>}</button>)}
   </div><div className="rail-bottom"><button title="GitHub Organization" onClick={()=>void openUrl(org)}><Cloud size={20}/></button><button title="Settings" onClick={()=>setShowSettings(true)}><Settings2 size={20}/></button></div></div>
   {sidebarVisible&&<aside className="sidebar" style={{width:sidebarWidth,minWidth:sidebarWidth}}>
    {section==='files'&&<><div className="sidebar-heading"><span>EXPLORER {workspace&&<span className={'explorer-sync '+syncStatus} title={syncStatus==='live'?'Automatically synchronized with disk':syncStatus==='error'?'Disk synchronization failed; retrying':'Starting disk synchronization'}>{syncStatus==='live'?'● LIVE':syncStatus==='error'?'● RETRY':'● SYNC'}</span>}</span><div><button onClick={()=>void newEntry(false)} title="New file"><FilePlus size={15}/></button><button onClick={()=>void newEntry(true)} title="New folder"><FolderPlus size={15}/></button><button onClick={()=>void addFolder()} title="Add folder to workspace"><FolderPlus size={15}/><span className="plus-mini">+</span></button><button onClick={()=>void reloadProject()} title="Reload project (refresh open files and explorer)"><RefreshCw size={14}/></button></div></div>
     {workspace&&roots.length<=1&&<button className="workspace-fold" onClick={()=>void pickOpen()}><ChevronDown size={15}/><b>{basename.toUpperCase()}</b><MoreHorizontal size={14}/></button>}
     <div className="explorer-tree" onContextMenu={e=>{if(!workspace)return;e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,node:{name:basename,path:'',directory:true,children:[]}})}} onDragOver={e=>{if(dragPath){e.preventDefault();e.dataTransfer.dropEffect='move'}}} onDrop={e=>{e.preventDefault();const src=dragPath;setDragPath('');setDropTarget('');if(src&&dirname(src))void moveEntry(src,'')}}>{workspace?tree.map(node=>renderTreeItem(node)):<div className="sidebar-start"><FolderOpen size={28}/><p>No project opened</p><button onClick={()=>void pickOpen()}>Open folder</button><button className="secondary" onClick={()=>setShowNewProject(true)}>New OW project</button></div>}</div>
     <div className="sidebar-section-heading"><ChevronDown size={13}/> OUTLINE</div><div className="outline-hint">{active?'Symbols in the active editor':'Open a file to see its symbols'}</div>
     {active&&<div className="outline-list">{tabs.find(t=>t.path===active)?.content.split('\n').filter(l=>/^\s*(fn |class |model |module |functor |interface |main:|route )/.test(l)).slice(0,30).map((s,i)=><div key={i}><Braces size={12}/>{s.trim().slice(0,48)}</div>)}</div>}
    </>}
    {section==='git'&&<><div className="sidebar-heading"><span>SOURCE CONTROL</span><div><button title="Refresh Git" onClick={()=>void refreshGit()}><RefreshCw size={14}/></button><button title="Fetch" onClick={()=>void gitAction('fetch')}><Cloud size={15}/></button></div></div>
     {!git.initialized?<div className="sidebar-start"><GitBranch size={28}/><p>This folder isn't a Git repository yet.</p><button onClick={()=>void gitAction('init')}>Initialize repository</button></div>:<>
       <div className="git-branch-banner"><button className="branch-switcher" title="Switch or create branch" onClick={()=>setShowBranches(v=>!v)}><GitBranch size={15}/><b>{git.branch||'(detached)'}</b><ChevronsUpDown size={13}/></button><span>{git.changes.length} changes</span>
        {showBranches&&<div className="branch-menu"><div className="branch-menu-head">SWITCH BRANCH</div><div className="branch-menu-list">{branches.branches.length===0&&<div className="subtle-message">No branches yet.</div>}{branches.branches.map(b=><button key={b} className={b===branches.current?'active':''} disabled={gitBusy} onClick={()=>void switchBranch(b)}><GitBranch size={13}/>{b}{b===branches.current&&<Check size={13}/>}</button>)}</div><div className="branch-menu-new"><input placeholder="new-branch-name" value={newBranch} onChange={e=>setNewBranch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createBranch()}}/><button title="Create branch" disabled={!newBranch.trim()||gitBusy} onClick={()=>void createBranch()}><Plus size={14}/></button></div></div>}
       </div>
       <div className="commit-form"><textarea placeholder="Message (Ctrl+Enter to commit)" rows={3} value={commitMessage} onChange={e=>setCommitMessage(e.target.value)} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter')void gitAction('commit',commitMessage)}}/><button disabled={!commitMessage.trim()||gitBusy} onClick={()=>void gitAction('commit',commitMessage)}><GitCommitHorizontal size={15}/> Commit staged files</button></div>
       <div className="git-toolbar"><button title="Stage all changes" onClick={()=>void gitAction('stage_all')}><Plus size={14}/> Stage all</button><button title="Pull" onClick={()=>void gitAction('pull')}><ArrowDownToLine size={14}/> Pull</button><button title="Push" onClick={()=>void gitAction('push')}><UploadCloud size={14}/> Push</button></div>
       <div className="sidebar-section-heading">CHANGES <span className="pill-counter">{git.changes.length}</span></div><div className="changes-list">{git.changes.map((c,i)=><div className="change-row" key={c.path+i}><span className={`git-status-badge ${statusName(c.status)}`}>{statusName(c.status)}</span><span title={c.path} onClick={()=>void previewDiff(c.path)}>{fileName(c.path)}<small>{dirname(c.path)}</small></span><button title="View diff" onClick={()=>void previewDiff(c.path)}><FileCode2 size={14}/></button><button title="Stage file" onClick={()=>void gitAction('stage',undefined,c.path)}><Plus size={14}/></button><button title="Unstage file" onClick={()=>void gitAction('unstage',undefined,c.path)}>−</button></div>)}{git.changes.length===0&&<div className="subtle-message">Working tree clean.</div>}</div>
       <div className="sidebar-section-heading">GITHUB PULL REQUESTS <button title="Refresh pull requests" onClick={()=>void refreshPrs()}><RefreshCw size={12}/></button><button title="Create pull request" onClick={()=>setShowCreatePr(true)}><Plus size={13}/></button></div>
       <div className="owler-pr-list">{pullRequests.map(pr=><button key={pr.number} onClick={()=>void openUrl(pr.url)}><GitPullRequest size={13}/><span><b>#{pr.number} {pr.title}</b><small>{pr.headRefName} → {pr.baseRefName}{pr.isDraft?' · Draft':''}</small></span></button>)}{prError&&<p>{prError}</p>}</div>
       <div className="sidebar-section-heading">GITHUB ACCOUNT</div>
       <div className="github-account">{githubAuth.connected?<><span className="github-chip"><Check size={13}/> Connected as <b>{githubAuth.user}</b></span><div className="github-account-actions"><button onClick={openCollaborators}><Users size={14}/> Collaborators</button><button title="Disconnect" onClick={()=>void disconnectGithub()}><LogOut size={14}/> Disconnect</button></div></>:<><span className="github-chip off">Not connected to GitHub</span><button className="github-connect-btn" onClick={()=>setShowConnect(true)}><KeyRound size={14}/> Connect with token</button></>}</div>
       <div className="sidebar-section-heading">RECENT COMMITS</div><div className="commit-list">{git.last_commits.map((l,i)=><div key={i}><GitCommitHorizontal size={13}/><span title={l}>{l}</span></div>)}</div>
       <div className="git-footer"><button onClick={()=>{const url=prompt('GitHub remote URL',git.remote||`${org}/my-project.git`);if(url)void gitAction('remote_set',url)}}><Cloud size={14}/>{git.remote?'Edit remote':'Set GitHub remote'}</button><button onClick={()=>void gitAction('push_upstream')}>Push upstream <ArrowUpRight size={13}/></button></div>
     </>}<div className="git-publish"><button onClick={()=>{setPublishName(basename.toLowerCase().replace(/[^a-z0-9-_]/g,'-'));setShowPublish(true)}}><UploadCloud size={15}/> Publish new repo to GitHub</button></div>{gitOutput&&<div className="git-output" title={gitOutput}>{gitOutput.slice(0,800)}</div>}
    </>}
    {section==='search'&&<><div className="sidebar-heading"><span>SEARCH</span></div><div className="search-area"><div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void doSearch()}} placeholder="Search across workspace"/></div><button onClick={()=>void doSearch()} disabled={!search||searchBusy}>{searchBusy?<Loader2 size={15} className="spin"/>:<Search size={15}/>} Find in files</button><small>Searches up to 180 text files, 250 matches.</small></div><div className="sidebar-section-heading">RESULTS <span className="pill-counter">{searchResults.length}</span></div><div className="search-results">{searchResults.map((r,i)=><button key={i} onClick={()=>{void openFile(r.path).then(()=>setJump({path:r.path,line:r.line,column:1,nonce:Date.now()}))}}><b>{fileName(r.path)} <small>:{r.line}</small></b><span>{r.text}</span><small>{r.path}</small></button>)}</div></>}
    {section==='tools'&&<><div className="sidebar-heading"><span>DEVELOPMENT TOOLS</span></div><div className="tool-side-head">OW INTEGRATION</div><div className="tool-status"><span className={`status-dot ${toolchain.available?'good':''}`}/><div><b>{toolchain.available?'OW toolchain detected':toolchain.source==='Checking...'?'Checking toolchain…':'Toolchain not found'}</b><small>{toolchain.source}<br/>{toolchain.version||'Start via Tauri to detect the OW runtime'}{toolchain.revision&&<><br/>Compiler commit: <code title={toolchain.revision}>{toolchain.revision.slice(0,12)}</code></>}</small></div></div><div className="side-menu">
      <button onClick={()=>void runOw('check')}><Check size={16}/> Check OW syntax</button><button onClick={()=>void runOw('run')}><Play size={16}/> Run OW application</button><button onClick={()=>void runOwTests('tests')} disabled={!workspace||testBusy}><FlaskConical size={16}/> Run all OWUnit tests</button><button onClick={()=>void createOwUnitTest()} disabled={!workspace}><FilePlus size={16}/> New OWUnit test</button><button onClick={()=>void runWebApp()}><Globe size={16}/> Run web app (serve + preview)</button><button onClick={()=>void runOw('build')}><Package size={16}/> Build native executable</button><button onClick={()=>void runOw('llvm')}><Code2 size={16}/> Emit LLVM IR (.ll)</button><button onClick={()=>void runOw('package','web')}><Globe size={16}/> Package web service</button><button onClick={()=>void runOw('package','gui')}><Box size={16}/> Package GUI app</button><button onClick={()=>void runOw('package','console')}><TerminalSquare size={16}/> Package console app</button><button onClick={()=>{setPanelMode('preview');setTerminalVisible(true)}}><Globe size={16}/> Web preview (localhost)</button>
     </div><div className="tool-side-head">JVM RUNTIME EXTENSIONS</div><div className="side-menu"><button disabled={!workspace} onClick={()=>void selectRuntimeJars()}><Layers size={16}/> Select trusted JARs</button><button disabled={!workspace||!runtimeJars.length} onClick={()=>void clearRuntimeJars()}><X size={16}/> Clear extensions</button></div><div className="tool-note">Session only · primary workspace · used by Run, Check, Test and web preview. {runtimeJars.length?runtimeJars.map(path=><div key={path} title={path}>{path.split(/[\\/]/).pop()}</div>):"No runtime extensions selected."}</div><div className="tool-side-head">AI CODING AGENTS</div><div className="side-menu"><button onClick={()=>void startSession('claude')}><Zap size={16}/> Claude Code CLI</button><button onClick={()=>void startSession('codex')}><WandSparkles size={16}/> OpenAI Codex CLI</button><button onClick={()=>void startSession('shell')}><SquareTerminal size={16}/> System terminal</button><button onClick={()=>void startSession('powershell')}><TerminalSquare size={16}/> PowerShell</button><button onClick={()=>void startSession('gemini')}><Zap size={16}/> Gemini CLI</button><button onClick={()=>void startSession('aider')}><Code2 size={16}/> Aider</button><button onClick={()=>void startSession('opencode')}><WandSparkles size={16}/> OpenCode</button></div><div className="tool-side-head">DETECTED DEVELOPMENT TOOLS <button onClick={()=>void call<CliAvailability[]>('environment_status').then(setEnvironment).catch(e=>toast(String(e),true))}><RefreshCw size={12}/></button></div><div className="owler-cli-status">{[...environment,{name:'ow compiler',available:toolchain.available}].map(item=><div key={item.name}><span className={`status-dot ${item.available?'good':''}`}/><b>{item.name}</b><small>{item.available?'Available':'Not installed'}</small></div>)}</div><div className="tool-side-head">SOFTWARE UPDATES</div><div className="side-menu"><button onClick={()=>void checkForUpdates()}><Download size={16}/> Check for updates</button></div><div className="tool-side-head">FRAMEWORKS & DOCS</div><div className="side-menu"><button onClick={()=>void openUrl('https://github.com/OW-Programing-Language/ow-lang')}><Code2 size={16}/> OW language <ExternalLink size={12}/></button><button onClick={()=>void openUrl(night)}><Globe size={16}/> Night web framework <ExternalLink size={12}/></button><button onClick={()=>void openUrl(`${org}/flOW---OW-Modular-Framework`)}><Layers size={16}/> flOW Modulith <ExternalLink size={12}/></button></div><div className="tool-note">{toolchain.build_note||'The bundled OW compiler will be staged during installer builds.'}</div></>}
   </aside>}
   {sidebarVisible&&<div className="v-resizer" title="Drag to resize · double-click to reset" onMouseDown={startSidebarDrag} onDoubleClick={()=>{setSidebarWidth(255);localStorage.setItem('owler:sidebar-width','255')}}/>}
   <main className="work-area"><div className="editor-surface" style={{flex:maxTerminal?'0 0 0':'1 1 auto',minHeight:maxTerminal?0:120,overflow:'hidden'}}><EditorPane tabs={tabs} active={active} onActivate={setActive} onClose={closeFile} onChange={changeFile} onReloadDisk={reloadDiskFile} onSave={()=>void saveAll()} onRun={()=>void runOw('run')} onRunTest={(path,filter)=>void runOwTests(path,filter)} diagnostics={problems} jump={jump} settings={settings}/></div>
    {terminalVisible&&!maxTerminal&&<div className="h-resizer" title="Drag to resize · double-click to reset" onMouseDown={startPanelDrag} onDoubleClick={()=>{setPanelHeight(268);localStorage.setItem('owler:panel-height','268')}}/>}
    {terminalVisible&&<div className={`bottom-panel ${maxTerminal?'maximized':''}`} style={maxTerminal?undefined:{height:panelHeight,minHeight:120}}>
     <div className="owler-panel-tabs"><button className={panelMode==='terminal'?'selected':''} onClick={()=>setPanelMode('terminal')}><TerminalSquare size={13}/> Terminal</button><button className={panelMode==='problems'?'selected':''} onClick={()=>setPanelMode('problems')}><ShieldCheck size={13}/> Problems <span>{problems.length}</span></button><button className={panelMode==='tests'?'selected':''} onClick={()=>setPanelMode('tests')}><FlaskConical size={13}/> Tests <span>{testReport?testReport.results.length:0}</span></button><button className={panelMode==='preview'?'selected':''} onClick={()=>setPanelMode('preview')}><Globe size={13}/> Web preview</button><span className="owler-panel-spacer"/><button onClick={()=>setTerminalVisible(false)} title="Close panel"><X size={14}/></button></div>
     <div className="owler-panel-content" style={{display:panelMode==='terminal'?'block':'none'}}><TerminalPanel sessions={sessions} onNew={startSession} onRemove={id=>setSessions(ts=>ts.filter(s=>s.id!==id))} onHide={()=>setTerminalVisible(false)} onToggleSize={()=>setMaxTerminal(v=>!v)} maximized={maxTerminal}/></div>
     {panelMode==='tests'&&<OwTestPanel report={testReport} busy={testBusy} command={testCommand} onRunAll={()=>void runOwTests('tests')} onRerun={()=>void runOwTests(testTarget,testFilter)} onNavigate={result=>void navigateOwTest(result)}/>}
      {panelMode==='problems'&&<div className="owler-problems">{problems.length?problems.map((d,i)=><button key={i} onClick={()=>void navigateProblem(d)}><span className="problem-error">●</span><b>{d.message}</b><small>{d.file}:{d.line}:{d.column}</small></button>):<div className="owler-no-problems"><ShieldCheck size={19}/> No compiler errors reported. Run <b>Check</b> to validate the active OW file.</div>}</div>}
     {panelMode==='preview'&&<div className="owler-preview"><div className="owler-preview-bar"><Globe size={14}/><input aria-label="Local preview URL" value={previewInput} onChange={e=>setPreviewInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')showPreview()}}/><button onClick={showPreview}><RefreshCw size={14}/> Open</button><button onClick={()=>void openUrl(previewUrl)} title="Open in browser"><ExternalLink size={14}/></button></div><iframe title="Local OW web application" src={previewUrl} referrerPolicy="no-referrer"/></div>}
    </div>}
   </main>
   <div className="right-rail"><button title="New project" onClick={()=>setShowNewProject(true)}><Plus size={19}/></button><button title="GitHub repository" onClick={()=>void openUrl(org)}><GitPullRequest size={19}/></button><span className="right-rail-spacer"/><button title="OW docs" onClick={()=>void openUrl(`${org}/owdocs`)}><BookOpen size={19}/></button></div>
  </div>
  <div className="statusbar"><div className="status-left"><button onClick={()=>{setSection('git');setSidebarVisible(true)}}><GitBranch size={13}/>{git.branch||'No Git'}</button><span className="status-counter">{git.changes.length?`${git.changes.length} modified`:'✓'}</span><button onClick={()=>{setSection('tools');setSidebarVisible(true)}}><ShieldCheck size={13}/>{toolchain.available?'Toolchain ready':'Setup OW'}</button></div><div className="status-right"><span>{active?'UTF-8':'Owler IDE'}</span><span>Spaces: 2</span><span className="status-language"><span className="small-ow">ow</span> {active?active.split('.').pop()?.toUpperCase():'OW'}</span><button className="status-live" title="Check for updates" onClick={()=>void checkForUpdates()}><Activity size={12}/> v0.2.0</button></div></div>
  {palette&&<div className="overlay" onMouseDown={()=>setPalette(false)}><div className="palette" onMouseDown={e=>e.stopPropagation()}><div className="palette-search"><Command size={20}/><input autoFocus value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&visiblePalette.length){visiblePalette[0].run();setPalette(false)}else if(e.key==='Escape')setPalette(false)}} placeholder="Search files and commands…"/><kbd>ESC</kbd></div><div className="palette-body"><p>COMMANDS & FILES</p>{visiblePalette.map((item,i)=><button key={i} onClick={()=>{item.run();setPalette(false)}}><span>{item.name}</span><small>{item.hint}</small></button>)}</div><div className="palette-footer">↵ to select <span>·</span> ESC to close <span>·</span> OWLER COMMANDS</div></div></div>}
  {showNewProject&&<div className="overlay" onMouseDown={()=>setShowNewProject(false)}><div className="dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><Box size={21}/></span><button onClick={()=>setShowNewProject(false)}><X size={19}/></button></div><h2>Create a new OW project</h2><p>Creates src/main.ow, dependencies.yml with OW Math Questions + OWUnit, and tests/ExampleTest.ow with a runnable @Test. Git is initialized when available.</p><label>PROJECT NAME</label><input className="dialog-input" value={newProject.name} onChange={e=>setNewProject(p=>({...p,name:e.target.value}))} placeholder="my-awesome-app"/><label>PROJECT TEMPLATE</label><div className="template-list">{([['console','Console application','A clean OW entry point with a typed function.',TerminalSquare],['web','Night web app','A REST API, JSON routes and persistent model.',Globe],['ui','OW interactive UI','Build a clickable OW user interface.',Layers],['night','Night annotated API','Controller, service and typed injection.',Globe],['flow','flOW modular application','Typed contracts and module lifecycle.',Layers],['owcord','OWCord Discord bot','Slash command starter with runtime JAR setup.',Box]] as const).map(([key,title,description,I])=><button key={key} className={newProject.kind===key?'selected':''} onClick={()=>setNewProject(v=>({...v,kind:key}))}><span className="template-icon"><I size={20}/></span><span><b>{title}</b><small>{description}</small></span><span className="radio-dot"/></button>)}</div><div className="dialog-actions"><button className="cancel" onClick={()=>setShowNewProject(false)}>Cancel</button><button className="primary" onClick={()=>void createProject()}><Plus size={17}/> Create project</button></div></div></div>}
  {showPublish&&<div className="overlay" onMouseDown={()=>setShowPublish(false)}><div className="dialog clone-dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><Cloud size={21}/></span><button onClick={()=>setShowPublish(false)}><X size={19}/></button></div><h2>Publish to OW GitHub</h2><p>Create a new repository under <b>OW-Programing-Language</b> and push your commits using the GitHub CLI (<code>gh auth login</code>). No token is stored in Owler.</p><label>REPOSITORY NAME</label><input className="dialog-input" value={publishName} onChange={e=>setPublishName(e.target.value)} placeholder="my-ow-app"/><label>DESCRIPTION</label><input className="dialog-input" value={publishDescription} onChange={e=>setPublishDescription(e.target.value)}/><label>VISIBILITY</label><div className="publish-visibility"><button className={publishVisibility==='public'?'selected':''} onClick={()=>setPublishVisibility('public')}>Public</button><button className={publishVisibility==='private'?'selected':''} onClick={()=>setPublishVisibility('private')}>Private</button></div><div className="dialog-actions"><button className="cancel" onClick={()=>setShowPublish(false)}>Cancel</button><button className="primary" disabled={!publishName} onClick={()=>void publishToGitHub()}><UploadCloud size={17}/> Create and push</button></div></div></div>}
  {diffPreview&&<div className="overlay" onMouseDown={()=>setDiffPreview(null)}><div className="owler-diff-dialog" onMouseDown={e=>e.stopPropagation()}><div className="owler-diff-header"><FileCode2 size={17}/><b>Git diff · {diffPreview.path}</b><button onClick={()=>setDiffPreview(null)}><X size={16}/></button></div><pre>{diffPreview.content}</pre></div></div>}
  {showCreatePr&&<div className="overlay" onMouseDown={()=>setShowCreatePr(false)}><div className="dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><GitPullRequest size={19}/></span><button onClick={()=>setShowCreatePr(false)}><X size={18}/></button></div><h2>Create GitHub pull request</h2><p>Push your branch first. Owler uses your signed-in GitHub CLI.</p><label>TITLE</label><input className="dialog-input" value={prTitle} onChange={e=>setPrTitle(e.target.value)} placeholder="feat: implement OW feature"/><label>BASE BRANCH</label><input className="dialog-input" value={prBase} onChange={e=>setPrBase(e.target.value)}/><label>DESCRIPTION</label><textarea className="dialog-input" rows={5} value={prBody} onChange={e=>setPrBody(e.target.value)}/><div className="dialog-actions"><button className="cancel" onClick={()=>setShowCreatePr(false)}>Cancel</button><button className="primary" disabled={!prTitle.trim()} onClick={()=>void createPullRequest()}><GitPullRequest size={16}/> Create PR</button></div></div></div>}
  {showClone&&<div className="overlay" onMouseDown={()=>setShowClone(false)}><div className="dialog clone-dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><GitBranch size={21}/></span><button onClick={()=>setShowClone(false)}><X size={19}/></button></div><h2>Clone from GitHub</h2><p>Use HTTPS or SSH. Git authentication is handled by your local Git credential manager or SSH keys.</p><label>REPOSITORY URL</label><input className="dialog-input" value={cloneUrl} onChange={e=>setCloneUrl(e.target.value)} placeholder="https://github.com/OW-Programing-Language/ow-lang.git"/><div className="dialog-actions"><button className="cancel" onClick={()=>setShowClone(false)}>Cancel</button><button className="primary" disabled={!cloneUrl} onClick={()=>void cloneProject()}><Download size={17}/> Clone repository</button></div></div></div>}
  {showConnect&&<div className="overlay" onMouseDown={()=>setShowConnect(false)}><div className="dialog clone-dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><KeyRound size={21}/></span><button onClick={()=>setShowConnect(false)}><X size={19}/></button></div><h2>Connect to GitHub</h2><p>Paste a <b>personal access token</b> with the <code>repo</code> scope (plus <code>admin:org</code> if you manage org repos). Owler hands it to the GitHub CLI, which stores it securely and uses it for push, pull and collaborator management. The token is never written to disk by Owler.{!githubAuth.cli_available&&<><br/><b>GitHub CLI (gh) is not installed.</b> Install it from cli.github.com first.</>}</p><label>PERSONAL ACCESS TOKEN</label><input className="dialog-input" type="password" autoFocus value={token} onChange={e=>setToken(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void connectToken()}} placeholder="ghp_… or github_pat_…"/><p className="dialog-hint"><button className="linkish" onClick={()=>void openUrl('https://github.com/settings/tokens/new?scopes=repo&description=Owler%20IDE')}>Create a token on GitHub <ExternalLink size={11}/></button></p><div className="dialog-actions"><button className="cancel" onClick={()=>setShowConnect(false)}>Cancel</button><button className="primary" disabled={!token.trim()||connectBusy} onClick={()=>void connectToken()}>{connectBusy?<Loader2 size={16} className="spin"/>:<KeyRound size={16}/>} Connect</button></div></div></div>}
  {showCollaborators&&<div className="overlay" onMouseDown={()=>setShowCollaborators(false)}><div className="dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><Users size={21}/></span><button onClick={()=>setShowCollaborators(false)}><X size={19}/></button></div><h2>Manage collaborators</h2><p>Add or remove people on the <b>origin</b> GitHub repository. New collaborators receive an invitation they must accept.</p>
   <div className="collab-add"><input className="dialog-input" value={collabName} onChange={e=>setCollabName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void addCollaborator()}} placeholder="github-username"/><select value={collabPerm} onChange={e=>setCollabPerm(e.target.value)}>{COLLAB_PERMISSIONS.map(p=><option key={p} value={p}>{p}</option>)}</select><button className="primary" disabled={!collabName.trim()||collabBusy} onClick={()=>void addCollaborator()}><UserPlus size={15}/> Add</button></div>
   <div className="sidebar-section-heading">CURRENT COLLABORATORS <button title="Refresh" onClick={()=>void refreshCollaborators()}><RefreshCw size={12}/></button></div>
   <div className="collab-list">{collaborators.map(c=><div className="collab-row" key={c.login}>{c.avatarUrl?<img src={c.avatarUrl} alt=""/>:<span className="collab-avatar"><Users size={14}/></span>}<span className="collab-ident" onClick={()=>void openUrl(c.htmlUrl)}><b>{c.login}</b><small>{c.permission||'collaborator'}</small></span><button title={`Remove ${c.login}`} disabled={collabBusy} onClick={()=>void removeCollaborator(c.login)}><UserMinus size={15}/></button></div>)}{collaborators.length===0&&!collabError&&<div className="subtle-message">No collaborators found yet.</div>}{collabError&&<p className="collab-error">{collabError}</p>}</div>
   <div className="dialog-actions"><button className="cancel" onClick={()=>setShowCollaborators(false)}>Close</button></div></div></div>}
  {showUpdate&&<div className="overlay" onMouseDown={()=>{if(updateState!=='downloading')setShowUpdate(false)}}><div className="dialog clone-dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><Download size={21}/></span>{updateState!=='downloading'&&<button onClick={()=>setShowUpdate(false)}><X size={19}/></button>}</div>
   <h2>Software update</h2>
   {updateState==='checking'&&<p><Loader2 size={14} className="spin"/> Checking for a newer version of Owler IDE…</p>}
   {updateState==='current'&&<p>You're up to date — Owler IDE <b>v0.2.0</b> is the latest version.</p>}
   {updateState==='available'&&updateInfo&&<><p>A new version <b>v{updateInfo.version}</b> is available (you have v0.2.0). Installing replaces your current version automatically and restarts the IDE.</p>{updateInfo.notes&&<pre className="update-notes">{updateInfo.notes.slice(0,1200)}</pre>}</>}
   {updateState==='downloading'&&<><p>Downloading and installing v{updateInfo?.version}… Owler will restart when it finishes.</p><div className="update-bar"><div style={{width:`${updateProgress}%`}}/></div><div className="update-pct">{updateProgress}%</div></>}
   {updateState==='error'&&<p className="collab-error">Update failed: {updateError}</p>}
   <div className="dialog-actions">{updateState!=='downloading'&&<button className="cancel" onClick={()=>setShowUpdate(false)}>Close</button>}{updateState==='available'&&<button className="primary" onClick={()=>void installUpdate()}><Download size={16}/> Install and restart</button>}{updateState==='error'&&<button className="primary" onClick={()=>void checkForUpdates()}><RefreshCw size={15}/> Retry</button>}</div></div></div>}
  {!workspace&&<div className="welcome-float"><div className="welcome-line">START BUILDING WITH OW</div><div className="welcome-buttons"><button onClick={()=>setShowNewProject(true)}><Plus size={15}/> New project</button><button onClick={()=>void pickOpen()}><FolderOpen size={15}/> Open folder</button><button onClick={()=>setShowClone(true)}><GitBranch size={15}/> Clone repo</button></div></div>}
  {showSettings&&<div className="overlay" onMouseDown={()=>setShowSettings(false)}><div className="dialog" onMouseDown={e=>e.stopPropagation()}><div className="dialog-top"><span className="dialog-icon"><Settings2 size={21}/></span><button onClick={()=>setShowSettings(false)}><X size={19}/></button></div><h2>Preferences</h2><p>Editor settings apply instantly and are saved on this machine.</p>
   <div className="settings-row"><div><b>Font size</b><small>Editor text size in pixels</small></div><div className="settings-stepper"><button onClick={()=>updateSetting('fontSize',Math.max(10,settings.fontSize-1))}>−</button><span>{settings.fontSize}</span><button onClick={()=>updateSetting('fontSize',Math.min(24,settings.fontSize+1))}>+</button></div></div>
   <div className="settings-row"><div><b>Tab size</b><small>Spaces per indentation level</small></div><div className="settings-seg">{[2,4,8].map(n=><button key={n} className={settings.tabSize===n?'on':''} onClick={()=>updateSetting('tabSize',n)}>{n}</button>)}</div></div>
   <div className="settings-row"><div><b>Word wrap</b><small>Wrap long lines in the editor</small></div><button className={`settings-toggle ${settings.wordWrap?'on':''}`} onClick={()=>updateSetting('wordWrap',!settings.wordWrap)}><span/></button></div>
   <div className="settings-row"><div><b>Minimap</b><small>Show the code overview on the right</small></div><button className={`settings-toggle ${settings.minimap?'on':''}`} onClick={()=>updateSetting('minimap',!settings.minimap)}><span/></button></div>
   <div className="settings-row"><div><b>Discord Rich Presence</b><small>Show “Playing OWler IDE · Editing &lt;file&gt;” on your Discord profile</small></div><button className={`settings-toggle ${settings.discord!==false?'on':''}`} onClick={()=>updateSetting('discord',settings.discord===false)}><span/></button></div>
   <div className="dialog-actions"><button className="cancel" onClick={()=>{const d={fontSize:13,tabSize:2,wordWrap:false,minimap:true,discord:true};setSettings(d);localStorage.setItem('owler:settings',JSON.stringify(d))}}>Reset defaults</button><button className="primary" onClick={()=>setShowSettings(false)}>Done</button></div></div></div>}
  {ctxMenu&&(()=>{const n=ctxMenu.node;const isRoot=isRootNode(n);const namespacedRoot=/^@\d+$/.test(n.path);const close=()=>setCtxMenu(null);const run=(f:()=>void)=>{close();f()};const staged=!n.directory;const isDependencyManifest=!n.directory&&/^(?:@\d+\/)?dependencies\.yml$/.test(n.path);return <div className="ctx-overlay" onMouseDown={close} onContextMenu={e=>{e.preventDefault();close()}}><div className="ctx-menu" style={{left:Math.min(ctxMenu.x,window.innerWidth-220),top:Math.min(ctxMenu.y,window.innerHeight-430)}} onMouseDown={e=>e.stopPropagation()}>
   {isRoot&&<div className="ctx-title">{n.name||basename}{roots.length>1&&!namespacedRoot?' · primary':''}</div>}
   {isRoot&&<button onClick={()=>run(()=>void addFolder())}><FolderPlus size={14}/> Add folder to workspace…</button>}
   {namespacedRoot&&<button onClick={()=>run(()=>void makePrimaryFolder(rootAbs(n.path)))}><Play size={13}/> Set as primary folder</button>}
   {isRoot&&roots.length>1&&<button className="ctx-danger" onClick={()=>run(()=>void removeFolder(rootAbs(n.path)))}><X size={14}/> Remove folder from workspace</button>}
   {isRoot&&<div className="ctx-sep"/>}
   {!n.directory&&<button onClick={()=>run(()=>void openFile(n.path))}><FileCode2 size={14}/> Open</button>}
   {!n.directory&&isOwTestFile(n.path)&&<button disabled={testBusy} onClick={()=>run(()=>void runOwTests(n.path))}><FlaskConical size={14}/> Run OWUnit tests in file</button>}
   {n.directory&&<button disabled={testBusy} onClick={()=>run(()=>void runOwTests(isRoot?(n.path?n.path+'/tests':'tests'):n.path))}><FlaskConical size={14}/> Run OWUnit tests in folder</button>}
   {isRoot&&<button onClick={()=>run(()=>void createOwUnitTest(n.path||'.'))}><FilePlus size={14}/> New OWUnit test…</button>}
   {isDependencyManifest&&<button disabled={reloadingDependencies} onClick={()=>run(()=>void reloadDependencies(n.path))}>{reloadingDependencies?<Loader2 size={14} className="spin"/>:<RefreshCw size={14}/>} Reload Dependencies</button>}
   {!n.directory&&isOw(n.path)&&(n.path===mainEntry?<button onClick={()=>run(clearMain)}><Play size={13} fill="currentColor"/> Clear main entry</button>:<button onClick={()=>run(()=>setAsMain(n))}><Play size={13}/> Set as main entry</button>)}
   <button onClick={()=>run(()=>void newEntryIn(n,false))}><FilePlus size={14}/> New file…</button>
   <button onClick={()=>run(()=>void quickCreate(n,'ow','main.ow'))}><span className="ctx-ext ow">ow</span> New OW file</button>
   <button onClick={()=>run(()=>void quickCreate(n,'md','README.md'))}><span className="ctx-ext">md</span> New Markdown file</button>
   <button onClick={()=>run(()=>void quickCreate(n,'txt','notes.txt'))}><span className="ctx-ext">txt</span> New text file</button>
   <button onClick={()=>run(()=>void newEntryIn(n,true))}><FolderPlus size={14}/> New folder…</button>
   <div className="ctx-sep"/>
   {!isRoot&&<><button onClick={()=>run(()=>setClipboard({node:n,mode:'cut'}))}><Scissors size={14}/> Cut</button>
   <button onClick={()=>run(()=>setClipboard({node:n,mode:'copy'}))}><Copy size={14}/> Copy</button></>}
   <button disabled={!clipboard} onClick={()=>run(()=>void pasteInto(n))}><ClipboardPaste size={14}/> Paste{clipboard?` “${fileName(clipboard.node.path)}”`:''}</button>
   <div className="ctx-sep"/>
   {!isRoot&&<><button onClick={()=>run(()=>void navigator.clipboard.writeText(absOf(n.path).replace(/\//g,'\\')))}><Copy size={14}/> Copy path</button>
   <button onClick={()=>run(()=>void navigator.clipboard.writeText(n.path))}><Copy size={14}/> Copy relative path</button></>}
   <button onClick={()=>run(()=>revealEntry(n))}><FolderOpen size={14}/> Reveal in File Explorer</button>
   {staged&&<><div className="ctx-sep"/><button onClick={()=>run(()=>void gitAction('stage',undefined,n.path))}><Plus size={14}/> Git: Stage</button>
   <button onClick={()=>run(()=>void gitAction('unstage',undefined,n.path))}><GitBranch size={14}/> Git: Unstage</button></>}
   {!isRoot&&<><div className="ctx-sep"/>
   <button onClick={()=>run(()=>void renameNode(n))}><Pencil size={14}/> Rename…</button>
   <button className="ctx-danger" onClick={()=>run(()=>void deleteNode(n))}><Trash2 size={14}/> Delete</button></>}
  </div></div>})()}
  <div className="toast-stack">{toasts.map(t=><div className={`toast ${t.error?'error':''}`} key={t.id}><span className="toast-symbol">{t.error?'!':'✓'}</span>{t.message}<button onClick={()=>setToasts(v=>v.filter(x=>x.id!==t.id))}><X size={12}/></button></div>)}</div>
  {!isDesktop&&<div className="preview-banner">UI PREVIEW — Native file access, Git, OW compiling and AI terminals require the Tauri desktop app. <code>npm run desktop</code></div>}
 </div>
}
