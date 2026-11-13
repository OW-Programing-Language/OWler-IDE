export const OW_KEYWORDS = [
  'main','fn','class','interface','model','enum','module','module_type','functor',
  'functor_type','type','include','import','set','return','print','call','if',
  'else','while','for','switch','case','default','break','continue','route',
  'respond','serve','save','find','delete','with_type','new','this','private',
  'public','true','false','null','and','or','not','assert'
];
const descriptions:Record<string,string>={
 main:'OW application entry point; executed by `ow run`.',
 fn:'Declare an OW function with optional typed parameters and return annotation.',
 class:'Define an object-oriented OW class with fields and methods.',
 module_type:'Declare a typed module signature.',
 functor:'Declare a parameterized OW module using a module_type signature.',
 model:'Declare a persistent OW table. Rows are stored automatically.',
 route:'Register an HTTP method and path in the Night web runtime.',
 serve:'Start the embedded OW HTTP server on the specified port.',
 respond:'Return an HTTP response from an OW route.',
 save:'Insert or update an OW model record.',
 find:'Query rows of an OW model, optionally filtering with `where`.',
 ui_run:'Start an OW user interface; choose web or native via OW_UI_MODE.',
 ui_run_native:'Start a native OW user interface.',
 ui_run_web:'Run an OW user interface in the browser.',
 import:'Import another .ow source file relative to the current file.'
};
const symbolPattern=/^\s*(fn|class|model|enum|interface|module|module_type|functor|functor_type)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
function symbolsInDocument(text:string){
 const out:Array<{name:string;kind:string;line:number;column:number}>=[];
 for(const match of text.matchAll(symbolPattern)){
  const before=text.slice(0,match.index);const line=before.split('\n').length;
  const column=(match[0].lastIndexOf(match[2]??'')+1);
  out.push({name:match[2],kind:match[1],line,column});
 }
 return out;
}
const builtins=['len','str','int','float','bool','array','mod','rand','time_ms','input','json','json_parse','body','body_json','param','query','response','ui_run','ui_run_web','ui_run_native','ui_heading','ui_text','ui_button','ui_image','ui_col','ui_row','ui_card','ui_grid','ui_bar','ui_space','ui_stop'];
const snippets:[string,string,string][]=[
 ['Function', 'fn ${1:name}(${2:arg}):\n  ${3:return: 0}', 'fn'],
 ['Main entry', 'main:\n  ${1:print: "Hello OW!"}', 'main'],
 ['OW class', 'class ${1:MyClass}:\n  field ${2:name}\n\n  fn new(${3:value}):\n    set this.${2:name}: ${3:value}', 'class'],
 ['Data model', 'model ${1:Item}:\n  ${2:title} string\n  ${3:done} bool', 'model'],
 ['REST route','route "${1:GET} /${2:items}":\n  respond: ${3:{ok: true}}','route'],
 ['Night server','main:\n  route "GET /":\n    respond: "Hello from Night!"\n  serve: ${1:8080}','server'],
 ['Module signature','module_type ${1:SERVICE}:\n  type ${2:entity}\n  fn ${3:execute}(${4:value} int) -> int','module_type'],
 ['Functor','functor ${1:MakeService}(${2:Service}: ${3:SERVICE}) -> ${4:RESULT}:\n  fn ${5:run}() -> int:\n    return: ${2:Service}.${6:execute}(1)','functor'],
 ['Condition','if ${1:condition}:\n  ${2:print: "yes"}\nelse:\n  ${3:print: "no"}','if'],
 ['UI widget','ui_col([ui_heading("${1:Title}"), ui_text("${2:Hello}"), ui_button("${3:Click}", "${4:handler}")])','ui']
];

export function registerOwLanguage(editor:typeof import('monaco-editor')){
 if(editor.languages.getLanguages().some(l=>l.id==='ow'))return;
 editor.languages.register({id:'ow',extensions:['.ow'],aliases:['OW','Ow']});
 editor.languages.setLanguageConfiguration('ow',{
  comments:{lineComment:'#'},brackets:[['(',')'],['[',']'],['{','}']],
  autoClosingPairs:[{open:'(',close:')'},{open:'[',close:']'},{open:'{',close:'}'},{open:'"',close:'"'}],
  surroundingPairs:[{open:'(',close:')'},{open:'[',close:']'},{open:'{',close:'}'},{open:'"',close:'"'}],
  indentationRules:{increaseIndentPattern:/^.*:\s*(?:#.*)?$/,decreaseIndentPattern:/^\s*(?:else|case|default)\b/}
 });
 editor.languages.setMonarchTokensProvider('ow',{
  keywords:OW_KEYWORDS,
  builtins,
  tokenizer:{root:[
   [/^\s*#[^\n]*/,'comment'],
   [/\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/,'type.identifier'],
   [/[a-zA-Z_][\w]*/,{cases:{'@keywords':'keyword','@builtins':'predefined','@default':'identifier'}}],
   [/\b\d+(?:\.\d+)?\b/,'number'],
   [/"([^"\\]|\\.)*"/,'string'],
   [/'([^'\\]|\\.)*'/,'string'],
   [/[:=+\-*\/!<>|&]+/,'operator'],
   [/[{}()\[\]]/,'delimiter.bracket'],
   [/[,.]/,'delimiter']
  ]}
 });
 editor.editor.defineTheme('owler-midnight',{
  base:'vs-dark',inherit:true,
  rules:[
   {token:'keyword',foreground:'c5a0fa',fontStyle:'bold'},
   {token:'predefined',foreground:'82dacc'},
   {token:'string',foreground:'e2b683'},
   {token:'number',foreground:'f0a988'},
   {token:'comment',foreground:'6a778e',fontStyle:'italic'},
   {token:'operator',foreground:'a5b6d0'},
   {token:'type.identifier',foreground:'8dbafb',fontStyle:'bold'}
  ],
  colors:{
   'editor.background':'#0d1320',
   'editor.foreground':'#d8e3f2',
   'editorLineNumber.foreground':'#3f4c61',
   'editorLineNumber.activeForeground':'#8093aa',
   'editorCursor.foreground':'#a78bfa',
   'editor.lineHighlightBackground':'#151e2c',
   'editor.selectionBackground':'#7252b13d',
   'editor.inactiveSelectionBackground':'#7252b11c',
   'editorIndentGuide.background1':'#1c2737',
   'editorIndentGuide.activeBackground1':'#394763',
   'editorBracketMatch.background':'#594b8520',
   'editorBracketMatch.border':'#8e79bb66',
   'editorWidget.background':'#151d2d',
   'editorSuggestWidget.background':'#151d2d'
  }
 });
 editor.languages.registerCompletionItemProvider('ow',{
  provideCompletionItems:(model,position)=>{
   const word=model.getWordUntilPosition(position);
   const range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};
   return {suggestions:[
    ...snippets.map(([label,insertText,trigger])=>({label:`${trigger} · ${label}`,kind:editor.languages.CompletionItemKind.Snippet,insertText,insertTextRules:editor.languages.CompletionItemInsertTextRule.InsertAsSnippet,range,detail:'OW snippet'})),
    ...[...OW_KEYWORDS,...builtins].map(k=>({label:k,kind:editor.languages.CompletionItemKind.Keyword,insertText:k,range,detail:descriptions[k]})),
    ...editor.editor.getModels().filter(m=>m.getLanguageId()==='ow').flatMap(m=>symbolsInDocument(m.getValue()).map(sym=>({
      label:sym.name,kind:['class','model','interface','module','module_type'].includes(sym.kind)?editor.languages.CompletionItemKind.Class:editor.languages.CompletionItemKind.Function,
      insertText:sym.name,range,detail:`${sym.kind} · ${m.uri.path.split('/').pop()}`
    })))
   ]};
  }
 });
 editor.languages.registerDefinitionProvider('ow',{
  provideDefinition:(model,position)=>{
   const token=model.getWordAtPosition(position)?.word;if(!token)return null;
   for(const candidate of editor.editor.getModels().filter(m=>m.getLanguageId()==='ow')){
    const symbol=symbolsInDocument(candidate.getValue()).find(s=>s.name===token);
    if(symbol)return {uri:candidate.uri,range:new editor.Range(symbol.line,symbol.column,symbol.line,symbol.column+symbol.name.length)};
   }
   return null;
  }
 });
 editor.languages.registerDocumentSymbolProvider('ow',{
  provideDocumentSymbols:(model)=>symbolsInDocument(model.getValue()).map(s=>({
   name:s.name,detail:`OW ${s.kind}`,kind:['class','model','interface'].includes(s.kind)?editor.languages.SymbolKind.Class:editor.languages.SymbolKind.Function,
   range:new editor.Range(s.line,1,s.line,model.getLineMaxColumn(s.line)),
   selectionRange:new editor.Range(s.line,s.column,s.line,s.column+s.name.length),tags:[]
  }))
 });
 editor.languages.registerHoverProvider('ow',{
  provideHover:(model,position)=>{
   const token=model.getWordAtPosition(position)?.word;
   if(!token||!descriptions[token])return null;
   return {contents:[{value:`**${token}** · OW language`},{value:descriptions[token]}]};
  }
 });
}

