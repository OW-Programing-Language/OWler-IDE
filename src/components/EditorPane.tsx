import Editor,{type OnMount} from '@monaco-editor/react';
import {useCallback,useEffect,useMemo,useRef} from 'react';
import {Code2,FileCode2,X,Play,Save,Braces} from 'lucide-react';
import type * as monaco from 'monaco-editor';
import {registerOwLanguage} from '../lib/owLanguage';
import {fileLanguage,fileName,type Tab,type OwDiagnostic} from '../lib/api';

type Props={tabs:Tab[];active:string;onActivate:(path:string)=>void;onClose:(path:string)=>void;onChange:(path:string,content:string)=>void;onSave:()=>void;onRun:()=>void;diagnostics:OwDiagnostic[];jump:{path:string;line:number;column:number;nonce:number}|null};
export default function EditorPane({tabs,active,onActivate,onClose,onChange,onSave,onRun,diagnostics,jump}:Props){
 const current=tabs.find(t=>t.path===active);
 const editorRef=useRef<monaco.editor.IStandaloneCodeEditor|null>(null);
 const monacoRef=useRef<typeof import('monaco-editor')|null>(null);
 useEffect(()=>{
  const editor=editorRef.current, instance=monacoRef.current;
  const model=editor?.getModel();
  if(!model||!instance)return;
  const related=diagnostics.filter(d=>d.file.replaceAll('\\','/').endsWith(active));
  instance.editor.setModelMarkers(model,'ow-compiler',related.map(d=>({
   startLineNumber:Math.max(1,d.line),startColumn:Math.max(1,d.column),
   endLineNumber:Math.max(1,d.line),endColumn:Math.max(2,d.column+1),
   severity:d.severity==='warning'?instance.MarkerSeverity.Warning:instance.MarkerSeverity.Error,
   message:d.message,source:'OW compiler'
  })));
 },[diagnostics,active]);
 useEffect(()=>{
  if(!jump||jump.path!==active||!editorRef.current)return;
  editorRef.current.revealLineInCenter(jump.line);
  editorRef.current.setPosition({lineNumber:jump.line,column:jump.column});
  editorRef.current.focus();
 },[jump,active]);
 const onMount=useCallback<OnMount>((editor,monacoInstance)=>{
  editorRef.current=editor;
  monacoRef.current=monacoInstance;
  registerOwLanguage(monacoInstance);
  const matching=diagnostics.filter(d=>d.file.replaceAll('\\','/').endsWith(active));
  if(editor.getModel())monacoInstance.editor.setModelMarkers(editor.getModel()!,'ow-compiler',matching.map(d=>({startLineNumber:Math.max(1,d.line),startColumn:Math.max(1,d.column),endLineNumber:Math.max(1,d.line),endColumn:Math.max(2,d.column+1),severity:monacoInstance.MarkerSeverity.Error,message:d.message,source:'OW compiler'})));
  editor.addCommand(monacoInstance.KeyMod.CtrlCmd|monacoInstance.KeyCode.KeyS,()=>onSave());
  editor.addCommand(monacoInstance.KeyCode.F5,()=>onRun());
 },[onSave,onRun,diagnostics,active]);
 const opts=useMemo<monaco.editor.IStandaloneEditorConstructionOptions>(()=>({
  fontFamily:"'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  fontSize:13,fontLigatures:true,lineHeight:23,wordWrap:'off',minimap:{enabled:true,scale:0.72,renderCharacters:false,side:'right'},
  glyphMargin:true,folding:true,foldingStrategy:'indentation',bracketPairColorization:{enabled:true},guides:{bracketPairs:true,indentation:true},
  renderLineHighlight:'line',smoothScrolling:true,cursorBlinking:'smooth',cursorSmoothCaretAnimation:'on',scrollBeyondLastLine:false,
  automaticLayout:true,padding:{top:22,bottom:20},quickSuggestions:{other:true,strings:false,comments:false},
  suggestOnTriggerCharacters:true,tabSize:2,insertSpaces:true,renderWhitespace:'selection',formatOnPaste:false,
  overviewRulerBorder:false,stickyScroll:{enabled:true},wordBasedSuggestions:'currentDocument'
 }),[]);
 return <div className="editor-column">
  <div className="editor-tabs">{tabs.map(tab=><div key={tab.path} className={`editor-tab ${tab.path===active?'active':''}`} onClick={()=>onActivate(tab.path)}><FileCode2 size={14} className={tab.path.endsWith('.ow')?'ow-file':''}/><span>{fileName(tab.path)}</span>{tab.content!==tab.saved&&<span className="dirty-dot"/>}<span className="tab-close" onClick={e=>{e.stopPropagation();onClose(tab.path)}}><X size={13}/></span></div>)}
    <div className="editor-tabs-fill"/>
    {current&&<><button className="tab-action" title="Save file (Ctrl+S)" onClick={onSave}><Save size={15}/></button><button className="tab-action run" title="Run OW (F5)" onClick={onRun}><Play size={14}/></button></>}
  </div>
  {current? <><div className="editor-breadcrumb"><Code2 size={13}/><span>{current.path.split('/').join('  /  ')}</span><span className="editor-breadcrumb-type"><Braces size={13}/>{fileLanguage(current.path).toUpperCase()}</span></div><div className="monaco-wrapper"><Editor key={current.path} theme="owler-midnight" language={fileLanguage(current.path)} path={current.path} value={current.content} onMount={onMount} beforeMount={registerOwLanguage} onChange={v=>onChange(current.path,v??'')} options={opts} loading={<div className="editor-loading">Loading editor…</div>}/></div></>:
  <div className="editor-placeholder"><div className="hero-glyph"><span>O</span><span>W</span></div><p>THE NATIVE DEVELOPMENT ENVIRONMENT</p><h2>Make something <em>remarkable.</em></h2><div className="placeholder-keys"><div><kbd>Ctrl</kbd> + <kbd>P</kbd> <span>Quick open a file</span></div><div><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> <span>Command palette</span></div><div><kbd>F5</kbd><span>Run your OW project</span></div><div><kbd>Ctrl</kbd> + <kbd>`</kbd><span>Toggle terminal</span></div></div><div className="placeholder-foot">OW LANGUAGE <span>·</span> NIGHT FRAMEWORK <span>·</span> FLOW MODULITH</div></div>}
 </div>;
}
