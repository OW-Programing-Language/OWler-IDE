import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const read=p=>readFileSync(resolve(import.meta.dirname,'..',p),'utf8');

test('Tauri commands include build, run, package, Git, workspace, and terminals',()=>{
 const lib=read('src-tauri/src/lib.rs');
 for(const name of ['workspace::read_file','workspace::write_file','workspace::create_project','git::git_status','git::git_clone','git::github_publish','terminal::terminal_start','terminal::terminal_write','terminal::ow_task'])assert.ok(lib.includes(name),name);
});

test('Native build, Night web packaging and static check use actual OW CLI commands',()=>{
 const terminal=read('src-tauri/src/terminal.rs');
 for(const token of ['"check"','"run"','"build"','"package"','"web"','"console"','"gui"'])assert.ok(terminal.includes(token),token);
});

test('Night template includes real OW runtime routes',()=>{
 const web=read('src-tauri/templates/web.ow');
 assert.match(web,/route "GET \/"/);
 assert.match(web,/route "GET \/api\/health"/);
 assert.match(web,/serve: 8080/);
});

test('Toolchain staging bundles current compiler and full JDK',()=>{
 const script=read('scripts/bundle-ow.mjs');
 assert.match(script,/OwIDE\.jar/);
 assert.match(script,/jpackage/);
 assert.match(script,/OW_REF/);
 assert.match(script,/javaHome/);
});

test('Tauri configuration includes platform installers and OW resource mapping',()=>{
 const config=JSON.parse(read('src-tauri/tauri.conf.json'));
 assert.equal(config.productName,'Owler IDE');
 assert.ok(Object.keys(config.bundle.resources).some(k=>k.includes('vendor/ow')));
 assert.ok(existsSync(resolve(import.meta.dirname,'../src-tauri/icons/icon.ico')));
});

test('OW syntax language configured for Monaco',()=>{
 const source=read('src/lib/owLanguage.ts');
 assert.match(source,/registerOwLanguage/);
 assert.match(source,/CompletionItemKind.Snippet/);
 assert.match(source,/functor_type/);
});
