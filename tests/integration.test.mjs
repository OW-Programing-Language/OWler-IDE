import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:net';
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
// Bind the test to its own port: port 8080 may already be occupied on CI.
async function availablePort(){
 const server=createServer();
 try{
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  return address.port;
 }finally{
  if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
}
test('real OW Night starter serves the actual HTTP health endpoint',{skip:!jar},async(t)=>{
 const dir=mkdtempSync(join(tmpdir(),'owler-night-test-'));
 const entry=join(dir,'main.ow');
 const port=await availablePort();
 const source=readFileSync(join(root,'src-tauri','templates','web.ow'),'utf8');
 assert.match(source,/serve: 8080/,'Night starter needs an expected listen port');
 writeFileSync(entry,source.replace('serve: 8080',`serve: ${port}`));
 const child=spawn('java',['-jar',jar,'run','main.ow'],{cwd:dir,stdio:['ignore','pipe','pipe']});
 // Windows holds a process working directory open until the Java child exits.
 // Register the close listener immediately to avoid missing a fast exit.
 let closed=false;
 const childClosed=new Promise(resolve=>child.once('close',()=>{closed=true;resolve()}));
 let logs='';
 child.stdout.on('data',d=>{logs+=d.toString()});
 child.stderr.on('data',d=>{logs+=d.toString()});
 child.on('error',error=>{logs+=`\nUnable to start OW Java process: ${error.message}`});
 t.after(async()=>{
  if(!closed)child.kill();
  await childClosed;
  // Windows AV / process-handle release can briefly delay directory removal.
  rmSync(dir,{recursive:true,force:true,maxRetries:15,retryDelay:200});
 });
 let response=null;
 for(let attempt=0;attempt<50;attempt++){
  if(closed)break;
  try{
   const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(750)});
   if(r.ok){response=await r.json();break;}
  }catch{}
  await new Promise(ok=>setTimeout(ok,200));
 }
 assert.ok(response,`OW server did not become available: ${logs}`);
 assert.equal(response.status,'ok');
 assert.equal(response.language,'OW');
});
