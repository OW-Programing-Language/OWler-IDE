import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=path=>readFileSync(resolve(import.meta.dirname,'..',path),'utf8');

test('OW console starter is a runnable Hello World program',()=>{
 const entry=read('src-tauri/templates/console.ow');
 assert.match(entry,/^main:/m);
 assert.match(entry,/print: "Hello, World!"/);
});

test('every generated OW project declares GitHub Math Questions dependency',()=>{
 const manifest=read('src-tauri/templates/dependencies.yml');
 const rust=read('src-tauri/src/workspace.rs');
 assert.match(manifest,/^format: 1$/m);
 assert.match(manifest,/url: https:\/\/github.com/);
 assert.match(manifest,/OW-Programing-Language\/ow-math-questions/);
 assert.match(manifest,/version: [a-f0-9]{40}/);
 assert.match(rust,/create_file\(&dir, "dependencies.yml"/);
 assert.match(rust,/create_file\(&dir, "src\/main.ow"/);
 assert.match(rust,/\.ow\/deps\//);
 assert.match(rust,/fs::create_dir\(&dir\)/);
});

test('IDE exposes New OW Project under File and a reload command',()=>{
 const app=read('src/App.tsx');
 assert.match(app,/file-menu-trigger/);
 assert.match(app,/Create New OW Project/);
 assert.match(app,/Reload Project/);
 assert.match(app,/reloadProject/);
 assert.match(app,/setShowNewProject\(true\)/);
 assert.match(app,/e\.shiftKey&&e\.key\.toLowerCase\(\)===\x27r\x27/);
});

test('reload updates opened tabs without discarding unsaved changes',()=>{
 const app=read('src/App.tsx');
 assert.match(app,/call<FileNode\[]>\('list_files'\)/);
 assert.match(app,/call<string>\('read_file',\{path:tab\.path\}\)/);
 assert.match(app,/setTabs\(previous=>previous\.map/);
 assert.match(app,/tab\.content!==tab\.saved\)return tab/);
 assert.match(app,/content:text,saved:text/);
});

test('bundled OW revision contains project dependency resolver',()=>{
 const script=read('scripts/bundle-ow.mjs');
 assert.match(script,/f16f77ceb960b44e309ce2b8b55b85eead8a6387/);
});

test('right-click dependencies.yml invokes the real OW dependency update command',()=>{
 const app=read('src/App.tsx');
 const backend=read('src-tauri/src/terminal.rs');
 const handler=read('src-tauri/src/lib.rs');
 assert.match(app,/isDependencyManifest/);
 assert.match(app,/Reload Dependencies<\/button>/);
 assert.match(app,/call<string>\('reload_dependencies',\{path\}\)/);
 assert.match(app,/await reloadProject\(true\)/);
 assert.match(app,/modified&&.*confirm\(/);
 assert.match(backend,/async fn reload_dependencies\(/);
 assert.match(backend,/args\.extend\(\["deps"\.into\(\),"update"\.into\(\)\]\)/);
 assert.match(backend,/validate_dependency_manifest\(&root,&relative\)/);
 assert.match(backend,/output\.status\.success\(\)/);
 assert.match(handler,/terminal::reload_dependencies/);
});

test('unsaved dependency changes require confirmation before the manifest is saved',()=>{
 const app=read('src/App.tsx');
 assert.match(app,/const modified=tabs\.find/);
 assert.match(app,/if\(modified&&!confirm/);
 assert.match(app,/disk!==modified\.saved&&!confirm/);
 assert.match(app,/write_file',\{path,content:modified\.content\}/);
 assert.match(app,/reloadingDependencies/);
});
