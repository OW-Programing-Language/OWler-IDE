import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {join,resolve,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {extractToolchainZip} from '../scripts/extract-toolchain-zip.mjs';

// This suite requires the freshly built OW compiler, not mocks or source scans.
// CI sets OW_JAR after bundle:ow; a missing compiler is reported as skipped locally.
const root=resolve(import.meta.dirname,'..');
const jar=process.env.OW_JAR?resolve(root,process.env.OW_JAR):null;
function compiler(args,cwd=root){
 const result=spawnSync('java',['-jar',jar,...args],{cwd,encoding:'utf8',timeout:120000});
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
 assert.match(result.stdout,/Hello, World!/);
});
test('real OW compiler supports YAML signatures, native arrays and dynamic strings',{skip:!jar},()=>{
 const entry=join(root,'src-tauri','templates','native-features.ow');
 const syntax=readFileSync(entry,'utf8');
 assert.match(syntax,/returns: string/);
 assert.match(syntax,/returns: array/);
 const checked=compiler(['check',entry]);
 assert.equal(checked.status,0,checked.stdout+'\n'+checked.stderr);
 const interpreted=compiler(['run',entry]);
 assert.equal(interpreted.status,0,interpreted.stdout+'\n'+interpreted.stderr);
 assert.deepEqual(interpreted.stdout.replaceAll('\r\n','\n').trim().split('\n'),['7','Hello, OW','4']);
 const temp=mkdtempSync(join(tmpdir(),'owler-llvm-'));
 try{
  const output=join(temp,'native-features.ll');
  const emitted=compiler(['llvm',entry,output]);
  assert.equal(emitted.status,0,emitted.stdout+'\n'+emitted.stderr);
  assert.ok(existsSync(output),'real OW compiler must write LLVM IR');
  const ll=readFileSync(output,'utf8');
  assert.match(ll,/%ow\.array/);
  assert.match(ll,/%ow\.string/);
  assert.match(ll,/@__ow_native_string_concat/);
 }finally{rmSync(temp,{recursive:true,force:true});}
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


test('real OWUnit integration runs a suite and a single annotated class method',{skip:!jar},()=>{
 const fixture=join(root,'tests','owunit-fixture');
 const all=compiler(['test','tests/CalculatorTest.ow'],fixture);
 assert.equal(all.status,0,all.stdout+'\n'+all.stderr);
 assert.match(all.stdout,/\[PASS\] CalculatorTest\.addsNumbers/);
 assert.match(all.stdout,/\[PASS\] CalculatorTest\.multiplicationWorks/);
 assert.match(all.stdout,/2 passed, 0 failed/);
 const single=compiler(['test','tests/CalculatorTest.ow','--filter','CalculatorTest.addsNumbers'],fixture);
 assert.equal(single.status,0,single.stdout+'\n'+single.stderr);
 assert.match(single.stdout,/\[PASS\] CalculatorTest\.addsNumbers/);
 assert.doesNotMatch(single.stdout,/\[PASS\] CalculatorTest\.multiplicationWorks/);
 assert.match(single.stdout,/1 passed, 0 failed/);
 const missing=compiler(['test','tests/CalculatorTest.ow','--filter','CalculatorTest.notFound'],fixture);
 assert.notEqual(missing.status,0,'Unknown test selector must fail');
 assert.match(missing.stdout,/No @Test matched filter/);
});

test('new compiler runs annotated injection and module discovery, parses repositories and transactions',{skip:!jar},()=>{
 const dir=mkdtempSync(join(tmpdir(),'owler-components-'));
 try{
  writeFileSync(join(dir,'main.ow'),"@Repository(\"app_users\", \"id\")\nclass UserRepository:\n\n@Service\nclass GreetingService:\n  fn message() -> string:\n    return: \"hello\"\n  @Transactional\n  fn save() -> int:\n    return: 1\n\n@Controller\nclass GreetingController:\n  @Inject\n  field private greeting GreetingService\n  @GetMapping(\"/hello\")\n  fn hello() -> string:\n    return: this.greeting.message()\n  @PostMapping(\"/hello\")\n  fn post() -> string:\n    return: this.greeting.message()\n\nmodule_type SAMPLE:\n  fn name() -> string\nmodule Example: SAMPLE\n  fn name() -> string:\n    return: \"module\"\nmain:\n  set controller: component_get(\"GreetingController\")\n  print: controller.hello()\n  call: assert(len(component_scan(\"Repository\")) == 1)\n  call: assert(len(module_scan(\"SAMPLE\")) == 1)\n");
  const result=compiler(['run','main.ow'],dir);
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.match(result.stdout,/hello/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('native collection LLVM emission and interpreter run agree on supported sample',{skip:!jar},()=>{
 const dir=mkdtempSync(join(tmpdir(),'owler-collections-'));
 try{
  const entry=join(dir,'main.ow');
  writeFileSync(entry,"fn names() -> string_array:\n  return: [\"OW\", \"IDE\"]\nmain:\n  set labels: names()\n  print: labels[0]\n  set config: {name: \"OW\", version: 2, nested: {value: 7}}\n  print: config[\"nested\"][\"value\"]\n  set keys: map_keys(config)\n  print: keys[0]\n");
  const result=compiler(['run',entry],dir);
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.deepEqual(result.stdout.replaceAll('\r\n','\n').trim().split('\n'),['OW','7','name']);
  const emitted=compiler(['llvm',entry,join(dir,'main.ll')],dir);
  assert.equal(emitted.status,0,emitted.stdout+'\n'+emitted.stderr);
  assert.ok(existsSync(join(dir,'main.ll')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
for(const kind of ['night','flow','owcord']){
 test('framework project dependency resolution and check: '+kind,{skip:!jar,timeout:300000},()=>{
  const dir=mkdtempSync(join(tmpdir(),'owler-'+kind+'-'));
  const template=path=>readFileSync(join(root,'src-tauri','templates',path),'utf8');
  function copy(from,to){const target=join(dir,to);mkdirSync(resolve(target,'..'),{recursive:true});writeFileSync(target,template(from));}
  try{
   copy(kind+'-dependencies.yml','dependencies.yml');copy(kind+'.ow','src/main.ow');
   if(kind==='night'){copy('GreetingService.ow','src/GreetingService.ow');copy('GreetingController.ow','src/GreetingController.ow');}
   if(kind==='flow'){copy('GreetingApi.ow','src/greeting/api/GreetingApi.ow');copy('GreetingModule.ow','src/greeting/infra/GreetingModule.ow');}
   const installed=compiler(['deps','install'],dir);
   assert.equal(installed.status,0,installed.stdout+'\n'+installed.stderr);
   const checked=compiler(['check','src/main.ow'],dir);
   assert.equal(checked.status,0,checked.stdout+'\n'+checked.stderr);
   if(kind==='flow'){const run=compiler(['run','src/main.ow'],dir);assert.equal(run.status,0,run.stdout+'\n'+run.stderr);assert.match(run.stdout,/Hello from flOW/);}
  }finally{rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
 });
}

test('real JVM ServiceLoader extension works with the IDE classpath launch shape',{skip:!jar},()=>{
 const dir=mkdtempSync(join(tmpdir(),'owler-extension-'));
 try{
  const classes=join(dir,'classes');
  mkdirSync(join(classes,'META-INF','services'),{recursive:true});
  writeFileSync(join(dir,'TestExtension.java'),[
   'import dev.oreo.RuntimeExtension;',
   'import java.util.List;',
   'public final class TestExtension implements RuntimeExtension {',
   '  public boolean supports(String name) { return name.equals("owler.test.ping"); }',
   '  public Object invoke(String name, List<Object> args) { return "extension-ok"; }',
   '}'
  ].join('\n'));
  const invoke=(program,args)=>{const r=spawnSync(program,args,{cwd:dir,encoding:'utf8',timeout:30000});if(r.error)throw r.error;assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout};
  invoke('javac',['-cp',jar,'-d',classes,join(dir,'TestExtension.java')]);
  writeFileSync(join(classes,'META-INF','services','dev.oreo.RuntimeExtension'),'TestExtension\n');
  const extension=join(dir,'trusted extension.jar');
  invoke('jar',['--create','--file',extension,'-C',classes,'.']);
  writeFileSync(join(dir,'main.ow'),'main:\n  print: extension("owler.test.ping")\n');
  const output=invoke('java',['-cp',[jar,extension].join(delimiter),'dev.oreo.Main','run','main.ow']);
  assert.match(output,/extension-ok/);
 }finally{rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});

test('JDK ZIP extraction handles nested toolchain folders and paths with spaces',{skip:!process.env.JAVA_HOME},()=>{
 const dir=mkdtempSync(join(tmpdir(),'owler zip fixture '));
 try{
  const source=join(dir,'source files');
  const folder='zig-x86_64-windows-0.14.1';
  mkdirSync(join(source,folder,'lib'),{recursive:true});
  writeFileSync(join(source,folder,'zig.exe'),'fixture executable');
  writeFileSync(join(source,folder,'lib','std.zig'),'fixture library');
  const archive=join(dir,'toolchain archive.zip');
  const jarTool=join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'jar.exe':'jar');
  const made=spawnSync(jarTool,['--create','--file',archive,'--no-manifest','-C',source,folder],{encoding:'utf8',timeout:30000});
  if(made.error)throw made.error;
  assert.equal(made.status,0,made.stdout+'\n'+made.stderr);
  const output=join(dir,'extracted files');
  extractToolchainZip(process.env.JAVA_HOME,archive,output);
  assert.equal(readFileSync(join(output,folder,'zig.exe'),'utf8'),'fixture executable');
  assert.equal(readFileSync(join(output,folder,'lib','std.zig'),'utf8'),'fixture library');
  const corrupt=join(dir,'bad.zip');writeFileSync(corrupt,'not a ZIP');
  assert.throws(()=>extractToolchainZip(process.env.JAVA_HOME,corrupt,join(dir,'bad extraction')));
 }finally{rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
