import {isOwTypePosition,modernizeOwFunctionSignature} from './owModernize';

export const OW_KEYWORDS = [
  'main','fn','class','interface','model','enum','module','module_type','functor',
  'functor_type','type','include','import','set','return','print','call','if',
  'else','while','for','switch','case','default','break','continue','returns','route',
  'respond','serve','save','find','delete','with_type','new','this','private',
  'public','true','false','null','and','or','not','assert','try','catch','finally','throw'
];
const descriptions:Record<string,string>={
 main:'OW application entry point; executed by `ow run`.',
 fn:'Declare a function using OW YAML-style parameters: fn greet(name: string): followed by returns: string. Legacy -> syntax remains valid.',
 returns:'Declare a function or method return type as YAML metadata (first line of body). Use return: to return a value.',
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
 import:'Import an OW source module, including @library aliases from dependencies.yml.',
 throw:'Raise a catchable OW exception.',
 try:'Begin a try/catch/finally block.',
 catch:'Bind the caught exception message as a string.',
 finally:'Run cleanup code after a try block.',
 return:'Return a value from an OW function. This is different from the returns: type declaration.',
 array:'Construct an integer array using array(size, fill). Native LLVM currently supports i32 elements only.'
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
const OW_TYPES=[
 {name:'int',detail:'32-bit integer (native LLVM + interpreter)'},
 {name:'string',detail:'UTF-8 string (native: string + string, len(), ==, !=; interpreter supports more)'},
 {name:'bool',detail:'Boolean value (native LLVM + interpreter)'},
 {name:'array',detail:'Integer array (native LLVM subset; broader in interpreter)'},
 {name:'float',detail:'Floating point (interpreter; not yet native LLVM)'}
] as const;
const builtins=['len','str','int','float','bool','array','mod','rand','time_ms','input','json','json_parse','body','body_json','param','query','response','ui_run','ui_run_web','ui_run_native','ui_heading','ui_text','ui_button','ui_image','ui_col','ui_row','ui_card','ui_grid','ui_bar','ui_space','ui_stop'];
const snippets:[string,string,string][]=[
 ['YAML typed function','fn ${1:name}(${2:arg}: ${3:int}):\n  returns: ${4:int}\n  return: ${5:0}','fn'],
 ['Return type declaration','returns: ${1:int}','returns'],
 ['Native array function','fn ${1:create}(size: int):\n  returns: array\n  return: array(size, ${2:0})','array'],
 ['Native string function','fn ${1:greet}(name: string):\n  returns: string\n  return: "Hello " + name','string'],
 ['Try/catch/finally','try:\n  ${1:call: work()}\ncatch ${2:message}:\n  print: ${2:message}\nfinally:\n  ${3:print: "cleanup"}','try'],
 ['Main entry', 'main:\n  ${1:print: "Hello OW!"}', 'main'],
 ['OW class', 'class ${1:MyClass}:\n  field ${2:name}\n\n  fn new(${3:value}):\n    set this.${2:name}: ${3:value}', 'class'],
 ['Data model', 'model ${1:Item}:\n  ${2:title} string\n  ${3:done} bool', 'model'],
 ['REST route','route "${1:GET} /${2:items}":\n  respond: ${3:{ok: true}}','route'],
 ['Night server','main:\n  route "GET /":\n    respond: "Hello from Night!"\n  serve: ${1:8080}','server'],
 ['Module signature','module_type ${1:SERVICE}:\n  fn ${2:execute}(${3:value}: int):\n    returns: int','module_type'],
 ['Functor','functor ${1:MakeService}(${2:Service}: ${3:SERVICE}) -> ${4:RESULT}:\n  fn ${5:run}() -> int:\n    return: ${2:Service}.${6:execute}(1)','functor'],
 ['Condition','if ${1:condition}:\n  ${2:print: "yes"}\nelse:\n  ${3:print: "no"}','if'],
 ['OWUnit test class','class ${1:ExampleTest}:\n  @BeforeEach\n  fn setUp():\n    ${2:print: "ready"}\n\n  @Test\n  fn ${3:exampleWorks}():\n    call: assert(${4:true}, "${5:test failed}")\n\n  @AfterEach\n  fn tearDown():\n    ${6:print: "finished"}','test'],
 ['OWUnit test method','@Test\nfn ${1:exampleWorks}():\n  call: assert(${2:true}, "${3:test failed}")','test'],
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
   [/^\s*@(Test|BeforeEach|AfterEach)\b/,'owunit.annotation'],
   [/\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/,'type.identifier'],
   [/\b(?:int|string|bool|array|float)\b/,'type.identifier'],
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
   {token:'owunit.annotation',foreground:'80dbae',fontStyle:'bold'},
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
   const lineBeforeCursor=model.getLineContent(position.lineNumber).slice(0,position.column-1);
   const typeSuggestions=OW_TYPES.map(t=>({label:t.name,kind:editor.languages.CompletionItemKind.TypeParameter,
      insertText:t.name,range,detail:t.detail,sortText:'0'+t.name}));
   if(isOwTypePosition(lineBeforeCursor))return {suggestions:typeSuggestions};
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
 // Opt-in code action; never rewrites user files implicitly.
 editor.languages.registerCodeActionProvider('ow',{
  provideCodeActions:(model,range)=>{
   const lineNumber=range.startLineNumber;
   const current=model.getLineContent(lineNumber);
   const converted=modernizeOwFunctionSignature(current);
   if(!converted)return {actions:[],dispose:()=>{}};
   const edit={range:new editor.Range(lineNumber,1,lineNumber,model.getLineMaxColumn(lineNumber)),text:converted};
   return {actions:[{title:'Modernize OW function signature to YAML style',kind:'refactor.rewrite',
     edit:{edits:[{resource:model.uri,textEdit:edit,versionId:model.getVersionId()}]} }],dispose:()=>{}};
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

