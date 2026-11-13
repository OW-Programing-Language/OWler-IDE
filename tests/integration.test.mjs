import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,cpSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

// This suite requires the freshly built OW compiler, not mocks or source scans.
// CI sets OW_JAR after bundle:ow; a missing compiler is reported as skipped locally.
const root=resolve(import.meta.dirname,'..');
const jar=process.env.OW_JAR?resolve(root,process.env.OW_JAR):null;
function compiler(args,cwd=root){
 const result=spawnSync('java',['-jar',jar,...args],{cwd,encoding:'utf8',timeout:30000});
 if(result.error)throw result.error;
 return result;
}
for(const [name,file] of [['console','console.ow'],['Night web','web.ow'],['interactive UI','ui.ow']]){
 test(`real OW parser and type checker accepts ${name} project starter`,{skip:!jar},()=>{
  const actual=compiler(['check',join(root,'src-tauri','templates',file)]);
  assert.equal(actual.status,0,`${actual.stdout}\n${actual.stderr}`);
  assert.match(actual.stdout,/check passed/i);
 });
}
test('real OW runtime executes new console project',{skip:!jar},()=>{
 const result=compiler(['run',join(root,'src-tauri','templates','console.ow')]);
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
 assert.match(result.stdout,/Hello, Owler/);
});
test('real OW Night starter serves the actual HTTP health endpoint',{skip:!jar},async(t)=>{
 const dir=mkdtempSync(join(tmpdir(),'owler-night-test-'));
 cpSync(join(root,'src-tauri','templates','web.ow'),join(dir,'main.ow'));
 const child=spawn('java',['-jar',jar,'run','main.ow'],{cwd:dir,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>{logs+=d.toString()});child.stderr.on('data',d=>{logs+=d.toString()});
 t.after(()=>{child.kill();rmSync(dir,{recursive:true,force:true});});
 let response=null;
 for(let attempt=0;attempt<50;attempt++){
  if(child.exitCode!==null)break;
  try{
   const r=await fetch('http://127.0.0.1:8080/api/health',{signal:AbortSignal.timeout(750)});
   if(r.ok){response=await r.json();break;}
  }catch{}
  await new Promise(ok=>setTimeout(ok,200));
 }
 assert.ok(response,`OW server did not become available: ${logs}`);
 assert.equal(response.status,'ok');
 assert.equal(response.language,'OW');
});
