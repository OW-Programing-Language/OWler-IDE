import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const compiled=ts.transpileModule(read('src/lib/owTests.ts'),{
 compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const {discoverOwTests,isOwTestFile}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

test('discovers class tests and top-level tests with exact gutter lines',()=>{
 const tests=discoverOwTests([
  '@Test',
  'fn topLevel():',
  '  call: assert(true)',
  '',
  'class CalculatorTest:',
  '  @BeforeEach',
  '  fn setup():',
  '    print: "ready"',
  '  @Test',
  '  fn additionWorks():',
  '    call: assert(true)',
  '  @Test',
  '  fn subtractionWorks():',
  '    call: assert(true)',
  '',
  'class Other:',
  '  fn regular():',
  '    return: 5'
 ].join('\n'));
 assert.deepEqual(tests.map(x=>x.name),['topLevel','CalculatorTest.additionWorks','CalculatorTest.subtractionWorks']);
 assert.deepEqual(tests.map(x=>x.functionLine),[2,10,13]);
});

test('does not offer gutter actions for normal functions or test-like comments',()=>{
 const tests=discoverOwTests('# @Test\nfn notAnnotated():\n  pass\n\n@AfterEach\nfn teardown():\n  pass\n');
 assert.equal(tests.length,0);
 assert.ok(isOwTestFile('tests/FooTest.ow'));
 assert.ok(isOwTestFile('tests/foo_test.ow'));
 assert.equal(isOwTestFile('src/main.ow'),false);
});

test('OWler wires test gutter icons, runner IPC, test creation and results',()=>{
 const editor=read('src/components/EditorPane.tsx');
 const app=read('src/App.tsx');
 const backend=read('src-tauri/src/owunit.rs');
 const lib=read('src-tauri/src/lib.rs');
 assert.match(editor,/GUTTER_GLYPH_MARGIN/);
 assert.match(editor,/onRunTestRef\.current/);
 assert.match(editor,/createDecorationsCollection/);
 assert.match(app,/Run all OWUnit tests/);
 assert.match(app,/setPanelMode\('tests'\)/);
 assert.match(app,/call<OwTestReport>\('ow_test'/);
 assert.match(app,/create_owunit_test/);
 assert.match(app,/onNavigate=\{result=>void navigateOwTest\(result\)\}/);
 assert.match(backend,/args\.extend\(\["test"\.into\(\),relative\]\)/);
 assert.match(backend,/--filter/);
 assert.match(backend,/output\.status\.code\(\)/);
 assert.match(lib,/owunit::ow_test/);
 assert.match(lib,/owunit::create_owunit_test/);
});

test('every generated project has an OWUnit template and pinned dependency',()=>{
 const source=read('src-tauri/src/workspace.rs');
 const yaml=read('src-tauri/templates/dependencies.yml');
 const owTest=read('src-tauri/templates/owunit-test.ow');
 assert.match(source,/tests\/ExampleTest\.ow/);
 assert.match(source,/owunit-test\.ow/);
 assert.match(yaml,/OW-Programing-Language\/OWUnit/);
 assert.match(yaml,/version: fde7cb6208305a4cda3bd623c9f520521f3137bf/);
 assert.match(owTest,/@BeforeEach/);
 assert.match(owTest,/@Test/);
 assert.match(owTest,/@AfterEach/);
 assert.match(owTest,/OWAssert/);
});
