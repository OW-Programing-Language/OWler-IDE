import {isOwTypePosition,modernizeOwFunctionSignature} from './owModernize';

export const OW_KEYWORDS = [
  'main','fn','class','interface','model','enum','module','module_type','functor',
  'functor_type','type','include','import','set','return','print','call','if',
  'else','while','for','switch','case','default','break','continue','returns','route',
  'respond','serve','save','find','delete','with_type','new','this','private',
  'public','field','where','true','false','null','and','or','not','assert','try','catch','finally','throw'
];
export const OW_ANNOTATIONS = {
 Test:'OWUnit test function or method.',
 BeforeEach:'OWUnit setup hook.',
 AfterEach:'OWUnit teardown hook.',
 Service:'Interpreter-only singleton service class.',
 Controller:'Interpreter-only singleton HTTP controller class.',
 Repository:'Experimental generated repository: @Repository("table", "id_column"). Requires Night JDBC for CRUD; class must be empty.',
 Inject:'Typed field injection of a concrete annotated singleton after construction.',
 Transactional:'Interpreter-only REQUIRED transaction through the Night JDBC runtime extension.',
 GetMapping:'Public zero-argument controller method mapped to a static GET path.',
 PostMapping:'Public zero-argument controller method mapped to a static POST path.'
} as const;
export const OW_REPOSITORY_METHODS = [
 ['save','save(${1:record})','INSERT only; duplicate keys fail.'],
 ['updateById','updateById(${1:id}, ${2:fields})','Update explicit non-ID fields; returns affected rows.'],
 ['findById','findById(${1:id})','Returns record or 0 if missing.'],
 ['existsById','existsById(${1:id})','Returns 1 or 0.'],
 ['deleteById','deleteById(${1:id})','Returns affected rows.'],
 ['findAll','findAll()','At most 500 records ordered by ID.'],
 ['page','page(${1:"name"}, ${2:20}, ${3:0})','Bounded page; prefix column with - for descending order.']
] as const;
export function isRepositoryReceiver(lineBeforeCursor:string,source:string):boolean{
 const receiver=lineBeforeCursor.match(/(?:this\.)?([A-Za-z_]\w*)\.[A-Za-z_]*$/)?.[1];
 if(!receiver)return false;
 const repositories=new Set(Array.from(source.matchAll(/^\s*@Repository\s*\([^\n]*\)\s*\n\s*class\s+([A-Za-z_]\w*)/gm),m=>m[1]));
 const typed=Array.from(source.matchAll(new RegExp('^\\s*(?:field\\s+(?:private\\s+)?|set\\s+)'+receiver+'\\s+([A-Za-z_]\\w*)','gm')),m=>m[1]);
 const direct=Array.from(source.matchAll(new RegExp('^\\s*set\\s+'+receiver+'\\s*:\\s*component_get\\("([A-Za-z_]\\w*)"\\)','gm')),m=>m[1]);
 return [...typed,...direct].some(t=>repositories.has(t));
}
const descriptions:Record<string,string>={
 ...OW_ANNOTATIONS,
 module_scan:'Discover loaded publicly reachable modules by structural signature. Interpreter only.',
 component_scan:'Discover annotated singleton components by stereotype, or All.',
 component_get:'Retrieve a concrete annotated singleton by class name.',
 component_mount:'Mount explicit or annotated controller routes; interpreter only.',
 extension:'Invoke a trusted installed JVM RuntimeExtension by operation name.',
 map_get:'Read a map key with a lazy fallback.',
 map_set:'Insert or replace a map key.',
 map_delete:'Remove a map key.',
 map_has:'Check whether a map key exists.',
 map_size:'Count map entries.',
 map_keys:'Insertion-order snapshot of dictionary keys.',
 map_values:'Insertion-order snapshot of dictionary values.',
 load:'Load a JSON value from disk.',
 exists:'Check whether a file exists.',
 now_ms:'Monotonic milliseconds since interpreter start.',
 sleep:'Block for the specified milliseconds.',

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
export const OW_TYPES=[
 {name:'int',detail:'32-bit integer (native LLVM + interpreter)'},
 {name:'string',detail:'UTF-8 string (native: string + string, len(), ==, !=; interpreter supports more)'},
 {name:'bool',detail:'Boolean value (native LLVM + interpreter)'},
 {name:'array',detail:'Integer array (native LLVM subset; broader in interpreter)'},
 {name:'string_array',detail:'Native reference-counted string array'},
 {name:'int_map',detail:'Native string-keyed integer dictionary'},
 {name:'string_map',detail:'Native string-keyed string dictionary'},
 {name:'mixed_map',detail:'Native string-keyed tagged integer/string/nested-map dictionary'},
 {name:'mixed',detail:'Native tagged integer/string/nested-map value'},
 {name:'mixed_array',detail:'Native ordered snapshot of mixed map values (read-only indexed access)'},
 {name:'float',detail:'Floating point (interpreter; not yet native LLVM)'}
] as const;
const builtins=['module_scan','component_scan','component_get','component_mount','extension','map_get','map_set','map_delete','map_has','map_size','map_keys','map_values','load','exists','sleep','now_ms','len','str','int','float','bool','array','mod','rand','time_ms','input','json','json_parse','body','body_json','param','query','response','ui_run','ui_run_web','ui_run_native','ui_heading','ui_text','ui_button','ui_image','ui_col','ui_row','ui_card','ui_grid','ui_bar','ui_space','ui_stop'];
const snippets:[string,string,string][]=[
 ['Annotated service','@Service\nclass ${1:ExampleService}:\n  fn message():\n    returns: string\n    return: "${2:Hello}"','Service'],
 ['Annotated controller','@Controller\nclass ${1:ExampleController}:\n  @Inject\n  field private service ${2:ExampleService}\n\n  @GetMapping("/api/example")\n  fn get():\n    returns: string\n    return: this.service.message()','Controller'],
 ['Generated repository','@Repository("${1:app_users}", "${2:id}")\nclass ${3:UserRepository}:','Repository'],
 ['Transactional method','@Transactional\nfn ${1:save}():\n  returns: int\n  return: ${2:1}','Transactional'],
 ['Native dictionary','set ${1:config}: {host: "localhost", port: 8080}','map'],
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
   [/^\s*@(Service|Controller|Repository|Inject|Transactional|GetMapping|PostMapping)\b/,'ow.annotation'],
   [/\b(?:GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/,'type.identifier'],
   [/\b(?:int|string|bool|array|float|string_array|int_map|string_map|mixed_map|mixed_array|mixed)\b/,'type.identifier'],
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
   {token:'ow.annotation',foreground:'f5cc7e',fontStyle:'bold'},
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
  triggerCharacters:['@','.'],
  provideCompletionItems:(model,position)=>{
   const word=model.getWordUntilPosition(position);
   const range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};
   const lineBeforeCursor=model.getLineContent(position.lineNumber).slice(0,position.column-1);
   const typeSuggestions=OW_TYPES.map(t=>({label:t.name,kind:editor.languages.CompletionItemKind.TypeParameter,
      insertText:t.name,range,detail:t.detail,sortText:'0'+t.name}));
   if(isOwTypePosition(lineBeforeCursor))return {suggestions:typeSuggestions};
   if(/^\s*@[A-Za-z_]*$/.test(lineBeforeCursor)){
    return {suggestions:Object.entries(OW_ANNOTATIONS).map(([name,detail])=>({
     label:'@'+name,kind:editor.languages.CompletionItemKind.Keyword,
     insertText:name==='Repository'?'Repository("${1:table}", "${2:id}")':
      name==='GetMapping'||name==='PostMapping'?name+'("${1:/api/path}")':name,
     insertTextRules:editor.languages.CompletionItemInsertTextRule.InsertAsSnippet,range,detail
    }))};
   }
   const source=editor.editor.getModels().filter(m=>m.getLanguageId()==='ow').map(m=>m.getValue()).join('\n');
   if(isRepositoryReceiver(lineBeforeCursor,source))return {suggestions:OW_REPOSITORY_METHODS.map(([label,insertText,detail])=>({
     label,insertText,detail:'Night repository · '+detail,range,kind:editor.languages.CompletionItemKind.Method,
     insertTextRules:editor.languages.CompletionItemInsertTextRule.InsertAsSnippet
   }))};
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

