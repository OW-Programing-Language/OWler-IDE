import { invoke } from '@tauri-apps/api/core';

export type FileNode = {name:string;path:string;directory:boolean;children:FileNode[]};
export type GitChange = {status:string;path:string};
export type GitSnapshot = {branch:string;remote:string;changes:GitChange[];last_commits:string[];initialized:boolean};
export type CliAvailability={name:string;available:boolean};
export type GithubPullRequest = {number:number;title:string;url:string;state:string;headRefName:string;baseRefName:string;isDraft:boolean};
export type ToolchainInfo = {source:string;available:boolean;version:string;build_note:string};
export type TerminalChunk = {session_id:string;data:string;seq:number};
export type OwDiagnostic = {file:string;line:number;column:number;severity:'error'|'warning';message:string};
export type OwCheckReport = {ok:boolean;output:string;diagnostics:OwDiagnostic[]};
export type TerminalExit = {session_id:string;code:number};
export type Tab = {path:string;content:string;saved:string};
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function call<T>(command:string,args:Record<string,unknown>={}):Promise<T>{
 if (!isDesktop) throw new Error('Start Owler with `npm run desktop` to use local projects, Git and the OW compiler. The browser is a UI preview only.');
 return invoke<T>(command,args);
}
export function flattenNodes(nodes:FileNode[]):FileNode[]{return nodes.flatMap(n=>[n,...flattenNodes(n.children)]);}
export function fileLanguage(path:string):string{
 const ext=path.split('.').pop()?.toLowerCase();
 const langs:Record<string,string>={ow:'ow',ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',rs:'rust',json:'json',md:'markdown',html:'html',css:'css',yaml:'yaml',yml:'yaml',toml:'ini',sh:'shell',py:'python',java:'java',xml:'xml',sql:'sql'};
 return langs[ext??'']??'plaintext';
}
export function statusName(s:string):string{
 if(s==='??') return 'U';
 if(s.includes('D')) return 'D';
 if(s.includes('A')) return 'A';
 if(s.includes('R')) return 'R';
 return 'M';
}
export function fileName(path:string):string{return path.split('/').pop()||path;}
export function dirname(path:string):string {const i=path.lastIndexOf('/');return i<0?'':path.slice(0,i+1);}
