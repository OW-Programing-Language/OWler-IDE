import {useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {listen} from '@tauri-apps/api/event';
import {ChevronDown,Maximize2,Plus,Square,TerminalSquare,X,Command,Code2,Zap} from 'lucide-react';
import {call,isDesktop,type TerminalChunk,type TerminalExit} from '../lib/api';

export type Session={id:string;name:string;kind:string};
type Props={sessions:Session[];onNew:(kind:'shell'|'claude'|'codex'|'gemini'|'aider'|'opencode')=>void;onRemove:(id:string)=>void;onHide:()=>void;onToggleSize:()=>void;maximized:boolean};

function SessionView({session,visible}:{session:Session;visible:boolean}){
 const element=useRef<HTMLDivElement>(null);
 const term=useRef<Terminal|null>(null);
 const fit=useRef<FitAddon|null>(null);
 useEffect(()=>{
  if(!element.current)return;
  const t=new Terminal({fontFamily:'Cascadia Code,JetBrains Mono,Consolas,monospace',fontSize:12.5,lineHeight:1.48,cursorBlink:true,scrollback:4000,theme:{background:'#0b101b',foreground:'#d3dceb',cursor:'#a78bfa',selectionBackground:'#48406b',black:'#172032',red:'#f08392',green:'#86d0a3',yellow:'#edd39b',blue:'#8ab9f8',magenta:'#c9a2fd',cyan:'#81dcd3',white:'#dce6f4'}});
  const f=new FitAddon(); t.loadAddon(f);t.open(element.current);fit.current=f;term.current=t;
  const resize=()=>{try{f.fit();if(isDesktop)void call('terminal_resize',{sessionId:session.id,cols:t.cols,rows:t.rows}).catch(()=>{});}catch{}};
  requestAnimationFrame(resize);
  t.writeln(`\x1b[38;2;162;127;243m Owler terminal\x1b[0m · ${session.name}`);
  if(!isDesktop)t.writeln('Open in Tauri desktop to start native tools.');
  const disposable=t.onData(data=>{void call('terminal_write',{sessionId:session.id,data}).catch(()=>{});});
  let active=true;
  let ready=false;
  const pending:TerminalChunk[]=[];
  const seen=new Set<number>();
  let unData:undefined|(()=>void),unExit:undefined|(()=>void);
  void listen<TerminalChunk>('terminal-data',e=>{
   if(e.payload.session_id!==session.id)return;
   if(!ready)pending.push(e.payload);
   else if(!seen.has(e.payload.seq)){seen.add(e.payload.seq);t.write(e.payload.data)}
  }).then(fn=>{
   if(!active){fn();return;}
   unData=fn;
   void call<TerminalChunk[]>('terminal_history',{sessionId:session.id}).then(history=>{
    if(!active)return;
    const all=[...history,...pending].sort((a,b)=>a.seq-b.seq);
    for(const chunk of all){if(!seen.has(chunk.seq)){seen.add(chunk.seq);t.write(chunk.data)}}
    ready=true;
   }).catch(()=>{ready=true;for(const chunk of pending)if(!seen.has(chunk.seq)){seen.add(chunk.seq);t.write(chunk.data)}});
  });
  void listen<TerminalExit>('terminal-exit',e=>{if(e.payload.session_id===session.id)t.writeln(`\r\n\x1b[38;2;107;122;146m[process exited ${e.payload.code}]\x1b[0m`)}).then(fn=>{if(active)unExit=fn;else fn()});
  const observer=new ResizeObserver(resize);observer.observe(element.current);
  return()=>{active=false;unData?.();unExit?.();observer.disconnect();disposable.dispose();t.dispose();};
 },[session.id,session.name]);
 useEffect(()=>{if(visible){const id=requestAnimationFrame(()=>{try{fit.current?.fit()}catch{}});return()=>cancelAnimationFrame(id)}},[visible]);
 return <div className="terminal-viewport" style={{display:visible?'block':'none'}} ref={element}/>;
}
export function TerminalPanel({sessions,onNew,onRemove,onHide,onToggleSize,maximized}:Props){
 const [selected,setSelected]=useState<string>('');
 useEffect(()=>{if(sessions.length)setSelected(sessions[sessions.length-1].id)},[sessions.length]);
 const current=sessions.find(s=>s.id===selected)?.id??sessions[sessions.length-1]?.id;
 const [menu,setMenu]=useState(false);
 return <div className="terminal-container">
  <div className="panel-head terminal-head">
   <div className="panel-head-title"><TerminalSquare size={15}/><b>TERMINAL</b><span className="panel-count">{sessions.length}</span></div>
   <div className="terminal-tabs">{sessions.map(s=><button key={s.id} className={`terminal-tab ${current===s.id?'active':''}`} onClick={()=>setSelected(s.id)}><span className="terminal-tab-mark">{s.kind==='claude'?'✳':s.kind==='codex'?'◈':s.kind==='ow'?'▶':'$'}</span>{s.name}<span onClick={e=>{e.stopPropagation();void call('terminal_stop',{sessionId:s.id}).catch(()=>{});onRemove(s.id)}} className="terminal-close"><X size={12}/></span></button>)}</div>
   <div className="terminal-actions">
    <div className="relative"><button title="New terminal" onClick={()=>setMenu(!menu)}><Plus size={15}/><ChevronDown size={12}/></button>
     {menu&&<div className="terminal-menu">{([['shell','System shell',Command],['claude','Claude Code',Zap],['codex','OpenAI Codex',Code2],['gemini','Gemini CLI',Zap],['aider','Aider',Code2],['opencode','OpenCode',Command]] as const).map(([k,label,I])=><button key={k} onClick={()=>{onNew(k);setMenu(false)}}><I size={14}/>{label}</button>)}</div>}
    </div>
    <button title={maximized?'Restore':'Maximize'} onClick={onToggleSize}><Maximize2 size={14}/></button>
    <button title="Hide panel" onClick={onHide}><X size={15}/></button>
   </div>
  </div>
  <div className="terminal-body">{sessions.map(s=><SessionView key={s.id} session={s} visible={s.id===current}/>)}
   {!sessions.length&&<div className="empty-terminal"><div className="empty-terminal-icon"><TerminalSquare size={28}/></div><strong>Integrated terminal</strong><span>OW compiler · Git · Claude Code · Codex</span><div className="inline-actions"><button onClick={()=>onNew('shell')}>New shell</button><button onClick={()=>onNew('claude')}>Claude Code</button><button onClick={()=>onNew('codex')}>Codex</button></div></div>}
  </div>
 </div>;
}
