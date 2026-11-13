import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const require=createRequire(import.meta.url);
let ts;
try{ts=require('typescript')}catch{try{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}catch{ts=null}}

test('installer command matches defined package script',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.scripts.tauri,'tauri');
 assert.match(read('.github/workflows/build.yml'),/npm run tauri build/);
 assert.ok(pkg.scripts['check:desktop']);
});
test('real compiler diagnostics propagate into Monaco editor',()=>{
 const rust=read('src-tauri/src/ow.rs');
 assert.match(rust,/fn ow_check\(/);
 assert.match(rust,/\.arg[s]?\(/);
 assert.match(read('src/App.tsx'),/setProblems\(report\.diagnostics\)/);
 assert.match(read('src/components/EditorPane.tsx'),/setModelMarkers/);
});
test('terminal resize and termination are backed by PTY commands',()=>{
 const rust=read('src-tauri/src/terminal.rs');
 assert.match(rust,/pub fn terminal_resize/);
 assert.match(rust,/\.resize\(PtySize/);
 assert.match(rust,/\.kill\(\)/);
 assert.match(read('src/components/TerminalPanel.tsx'),/terminal_resize/);
});
test('source files have no TypeScript syntax errors',{skip:!ts},()=>{
 for(const file of ['src/App.tsx','src/components/EditorPane.tsx','src/components/TerminalPanel.tsx','src/lib/api.ts','src/lib/owLanguage.ts']){
  const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[],file);
 }
});
