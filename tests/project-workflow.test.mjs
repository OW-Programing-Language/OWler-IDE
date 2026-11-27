import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';

const read=path=>readFileSync(resolve(import.meta.dirname,'..',path),'utf8');

test('OW console starter is a runnable Hello World program',()=>{
 const entry=read('src-tauri/templates/console.ow');
 assert.match(entry,/^main:/m);
 assert.match(entry,/fn greet\(name: string\):/);
 assert.match(entry,/returns: string/);
 assert.match(entry,/print: greet\("World"\)/);
});

test('native OW showcase covers arrays, string ARC and YAML syntax',()=>{
 const sample=read('src-tauri/templates/native-features.ow');
 const rust=read('src-tauri/src/workspace.rs');
 assert.match(sample,/returns: array/);
 assert.match(sample,/return: array\(count, 3\)/);
 assert.match(sample,/set numbers\[1\]: 7/);
 assert.match(sample,/len\("hé🙂"\)/);
 assert.match(rust,/examples\/native-features\.ow/);
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
 assert.match(script,/377b7c18981b9028e7f9dbbda4f6bf6aa8bfed32/);
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
 assert.match(app,/write_file_checked',\{path,content:modified\.content/);
 assert.match(app,/reloadingDependencies/);
});

test('live disk reconciliation protects dirty buffers and stale observations',async()=>{
 const source=ts.transpileModule(read('src/lib/liveSync.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {reconcileDiskTabs}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const path='src/main.ow', requested=new Map([[path,'original']]);
 const disk=new Map([[path,{path,revision:'2',status:'present',text:'agent edit'}]]);
 const clean={path,content:'original',saved:'original'};
 const dirty={...clean,content:'my edit'};
 assert.deepEqual(reconcileDiskTabs([clean],requested,disk)[0],{path,content:'agent edit',saved:'agent edit',diskState:undefined});
 const conflict=reconcileDiskTabs([dirty],requested,disk)[0];
 assert.equal(conflict.content,'my edit');assert.equal(conflict.saved,'original');assert.equal(conflict.diskState,'changed');
 const stale={path,content:'new save',saved:'new save'};
 assert.equal(reconcileDiskTabs([stale],requested,disk)[0],stale);
 const absent=new Map([[path,{path,revision:'3',status:'missing'}]]);
 assert.equal(reconcileDiskTabs([dirty],requested,absent)[0].diskState,'missing');
 assert.equal(reconcileDiskTabs([dirty],requested,absent)[0].content,'my edit');
 const unreadable=new Map([[path,{path,revision:'4',status:'unreadable'}]]);
 assert.equal(reconcileDiskTabs([clean],requested,unreadable)[0].diskState,'unreadable');
 const unchanged=[clean];
 assert.equal(reconcileDiskTabs(unchanged,requested,new Map()),unchanged);
});
test('desktop explorer polls independently of editor and protects saves',()=>{
 const app=read('src/App.tsx'),backend=read('src-tauri/src/workspace.rs');
 assert.match(app,/sync_workspace/);
 assert.match(app,/setTimeout\(tick,1200\)/);
 assert.match(app,/reconcileDiskTabs/);
 assert.match(app,/write_file_checked/);
 assert.match(backend,/spawn_blocking/);
 assert.match(backend,/checked_write/);
 assert.match(read('src/components/EditorPane.tsx'),/Reload disk version/);
});

test('workspace creation and cloning do not replace the live roots before user opens the project',()=>{
 const rust=read('src-tauri/src/workspace.rs'),git=read('src-tauri/src/git.rs');
 const create=rust.slice(rust.indexOf('pub fn create_project('),rust.indexOf('#[cfg(test)]',rust.indexOf('pub fn create_project(')));
 const clone=git.slice(git.indexOf('pub fn git_clone('),git.indexOf('/// Publish an existing',git.indexOf('pub fn git_clone(')));
 assert.doesNotMatch(create,/state\.roots\.lock/);
 assert.doesNotMatch(clone,/state\.workspace\.lock/);
});

test('cold start defers probes and loads compiler only once',()=>{
 const app=read('src/App.tsx'),ow=read('src-tauri/src/ow.rs'),git=read('src-tauri/src/git.rs'),discord=read('src-tauri/src/discord.rs');
 assert.match(app,/const restore=setTimeout/);
 assert.match(app,/const probe=setTimeout/);
 assert.match(app,/if\(section==='git'\)void refreshAuth/);
 assert.match(app,/section==='tools'\)void call<CliAvailability\[\]>/);
 assert.match(ow,/pub async fn ow_toolchain_info/);
 assert.match(ow,/spawn_blocking\(move\|\|probe_toolchain/);
 assert.match(ow,/pub async fn environment_status/);
 assert.doesNotMatch(ow.slice(ow.indexOf('fn detect_cli_tools'),ow.indexOf('mod environment_tests')),/ow_toolchain_info/);
 assert.match(git,/spawn_blocking\(probe_github_auth\)/);
 assert.match(discord,/spawn_blocking\(move\|\|update_activity/);
});
test('workspace opening and heavy frontend modules avoid synchronous initial rendering',()=>{
 const workspace=read('src-tauri/src/workspace.rs'),app=read('src/App.tsx');
 assert.match(workspace,/pub async fn set_workspace/);
 assert.match(workspace,/spawn_blocking\(move \|\| tree_for_roots/);
 assert.match(workspace,/e\.file_type\(\)/);
 assert.match(app,/palette\?\[/);
 assert.match(app,/modifiedPaths\.has\(node\.path\)/);
 assert.match(read('src/components/EditorPane.tsx'),/lazy\(\(\)=>import\('@monaco-editor\/react'\)\)/);
 assert.match(read('src/components/TerminalPanel.tsx'),/import\('@xterm\/xterm'\)/);
});
