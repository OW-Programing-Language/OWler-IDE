import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const compiled=ts.transpileModule(read('src/lib/owModernize.ts'),{
 compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const {modernizeOwFunctionSignature,isOwTypePosition}=await import(
 'data:text/javascript;base64,'+Buffer.from(compiled).toString('base64')
);

test('rewrites legacy arrows and space-typed params to valid YAML syntax',()=>{
 assert.equal(modernizeOwFunctionSignature('fn greet(name string) -> string:'),
  'fn greet(name: string):\n  returns: string');
 assert.equal(modernizeOwFunctionSignature('  fn sum(a int, b: int) -> int:'),
  '  fn sum(a: int, b: int):\n    returns: int');
 assert.equal(modernizeOwFunctionSignature('fn identity(x int):'),
  'fn identity(x: int):');
 assert.equal(modernizeOwFunctionSignature('fn plain(x):'),null);
});

test('does not rewrite non-function arrows, comments, or YAML signatures',()=>{
 assert.equal(modernizeOwFunctionSignature('functor Make(A: API) -> OUT:'),null);
 assert.equal(modernizeOwFunctionSignature('  # fn old(x int) -> int:'),null);
 assert.equal(modernizeOwFunctionSignature('fn greet(name: string):'),null);
 assert.equal(modernizeOwFunctionSignature('fn unsupported(x: list[int]) -> int:'),null);
});

test('contextual type hints only appear after returns: or a parameter colon',()=>{
 assert.equal(isOwTypePosition('  returns: '),true);
 assert.equal(isOwTypePosition('  returns: st'),true);
 assert.equal(isOwTypePosition('fn greet(name: '),true);
 assert.equal(isOwTypePosition('fn greet(a: int, b: str'),true);
 assert.equal(isOwTypePosition('  return: '),false);
 assert.equal(isOwTypePosition('  print: '),false);
 assert.equal(isOwTypePosition('  route "GET /": '),false);
});

test('Monaco advertises YAML signatures, native strings and OWUnit test support',()=>{
 const source=read('src/lib/owLanguage.ts');
 assert.match(source,/'returns'/);
 assert.match(source,/OW_TYPES/);
 assert.match(source,/isOwTypePosition/);
 assert.match(source,/registerCodeActionProvider/);
 assert.match(source,/modernizeOwFunctionSignature/);
 assert.match(source,/\@Test/);
 assert.match(source,/string \+ string/);
});

test('bundler is pinned to the merged OW YAML-signature compiler',()=>{
 assert.match(read('scripts/bundle-ow.mjs'),/377b7c18981b9028e7f9dbbda4f6bf6aa8bfed32/);
 assert.match(read('README.md'),/YAML-style/);
});

test('editor recognizes new OW annotations, native collections and discovery builtins',()=>{
 const source=read('src/lib/owLanguage.ts');
 for(const name of ['Service','Controller','Repository','Inject','Transactional','GetMapping','PostMapping','string_array','int_map','string_map','mixed_map','mixed_array','module_scan','component_scan','component_get','component_mount','map_keys','map_values','updateById','findById']) assert.ok(source.includes(name),name);
 assert.match(source,/triggerCharacters/);
 assert.match(source,/OW_REPOSITORY_METHODS/);
});

test('repository completion recognizes typed injection and component lookup but not ordinary receivers',async()=>{
 const source=read('src/lib/owLanguage.ts').replace("from './owModernize'","from '"+'data:text/javascript;base64,'+Buffer.from(compiled).toString('base64')+"'");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {isRepositoryReceiver,OW_REPOSITORY_METHODS}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const fixture='@Repository("users", "id")\nclass UserRepository:\n\n@Service\nclass UserService:\n  @Inject\n  field private users UserRepository\n  field private plain OtherService\nmain:\n  set repo: component_get("UserRepository")\n';
 assert.equal(isRepositoryReceiver('  call: this.users.up',fixture),true);
 assert.equal(isRepositoryReceiver('  set value: repo.',fixture),true);
 assert.equal(isRepositoryReceiver('  call: this.plain.',fixture),false);
 assert.equal(isRepositoryReceiver('  call: something.',fixture),false);
 assert.equal(OW_REPOSITORY_METHODS.length,7);
});
