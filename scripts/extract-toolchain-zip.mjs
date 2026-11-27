import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';

// Use the already-required full JDK's ZIP extractor, not PowerShell's
// Archive module, whose .NET overloads differ between PowerShell editions.
// No shell interpolation: absolute archive paths and directories with spaces work.
export function extractToolchainZip(javaHome,archive,destination){
 const jar=join(javaHome,'bin',process.platform==='win32'?'jar.exe':'jar');
 mkdirSync(destination,{recursive:true});
 execFileSync(jar,['--extract','--file',resolve(archive)],{
  cwd:resolve(destination),stdio:'inherit',shell:false
 });
}
