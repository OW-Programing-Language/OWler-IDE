#!/usr/bin/env node
/**
 * Stage OW compiler + full JDK into Tauri resources at build time.
 * Pinned to a tested OW source revision (not the older v1.2.2 release jar).
 * Set OW_REF to deliberately upgrade the compiler after testing compatibility.
 * Requires Java 21+, Maven, Git. Optional Windows Zig native toolchain.
 */
import {execFileSync} from 'node:child_process';
import {existsSync,cpSync,mkdirSync,mkdtempSync,rmSync,writeFileSync,copyFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const OW_REF=process.env.OW_REF||'232e3bd1d41d7b69850b7bb8c2f193e242043876';
const sourceUrl='https://github.com/OW-Programing-Language/ow-lang.git';
const root=resolve(import.meta.dirname,'..');
const dest=join(root,'vendor','ow');
const temporary=mkdtempSync(join(tmpdir(),'owler-build-'));
const log=(msg)=>console.log(`[Owler toolchain] ${msg}`);
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32'&&['mvn','mvn.cmd'].includes(cmd)});
const javaHome=process.env.JAVA_HOME;
if(!javaHome||!existsSync(join(javaHome,'bin',process.platform==='win32'?'jpackage.exe':'jpackage'))){
 console.error('A full JDK 17+ with jpackage is required. Set JAVA_HOME before packaging Owler.');
 process.exit(1);
}
try{
 const owSource=process.env.OW_SOURCE_DIR?resolve(process.env.OW_SOURCE_DIR):join(temporary,'ow-lang');
 if(!process.env.OW_SOURCE_DIR){
  log(`Fetching pinned OW compiler ${OW_REF.slice(0,12)}…`);
  run('git',['clone','--filter=blob:none','--no-checkout',sourceUrl,owSource],temporary);
  run('git',['checkout',OW_REF],owSource);
 }
 log('Building OW from source with Maven…');
 run(process.platform==='win32'?'mvn.cmd':'mvn',['-B','-q','-DskipTests','clean','package'],owSource);
 const jar=join(owSource,'target','OwIDE.jar');
 if(!existsSync(jar))throw new Error(`Expected compiler jar missing: ${jar}`);
 rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});
 copyFileSync(jar,join(dest,'OwIDE.jar'));
 if(existsSync(join(owSource,'LICENSE')))copyFileSync(join(owSource,'LICENSE'),join(dest,'OW-LICENSE'));
 log('Bundling a full JDK (java, javac and jpackage) so OW applications can build after install…');
 cpSync(javaHome,join(dest,'jdk'),{recursive:true,force:true,dereference:true,filter:(src)=>!/(^|[\\/])(demo|sample|src\.zip)$/.test(src)});
 const bin=join(dest,'bin');mkdirSync(bin,{recursive:true});
 if(process.platform==='win32'){
  writeFileSync(join(bin,'ow.cmd'),'@echo off\r\n"%~dp0..\\jdk\\bin\\java.exe" -jar "%~dp0..\\OwIDE.jar" %*\r\n');
 }else{
  const path=join(bin,'ow');writeFileSync(path,'#!/bin/sh\nDIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"\nexec "$DIR/jdk/bin/java" -jar "$DIR/OwIDE.jar" "$@"\n',{mode:0o755});
 }
 if(process.platform==='win32'&&process.env.OW_BUNDLE_ZIG==='1'){
  log('Downloading Zig 0.14.1 to support native OW builds on Windows…');
  const zip=join(temporary,'zig.zip');
  const url='https://ziglang.org/download/0.14.1/zig-x86_64-windows-0.14.1.zip';
  const response=await fetch(url);if(!response.ok)throw new Error(`Zig download HTTP ${response.status}`);
  writeFileSync(zip,Buffer.from(await response.arrayBuffer()));
  const extracted=join(temporary,'zig-extracted');mkdirSync(extracted);
  run('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${zip.replaceAll("'","''")}' -DestinationPath '${extracted.replaceAll("'","''")}' -Force`],temporary);
  const folder=readdirSync(extracted).map(x=>join(extracted,x)).find(x=>existsSync(join(x,'zig.exe')));
  if(!folder)throw new Error('Zig archive does not include zig.exe');
  mkdirSync(join(dest,'tools'),{recursive:true});cpSync(folder,join(dest,'tools','zig'),{recursive:true});
 }
 writeFileSync(join(dest,'toolchain.json'),JSON.stringify({ow_ref:OW_REF,includes_jdk:true,includes_zig:existsSync(join(dest,'tools','zig','zig.exe'))},null,2));
 log(`Ready at ${dest}. OW ${OW_REF.slice(0,12)} and JDK from ${javaHome} bundled.`);
}catch(error){console.error(error);process.exitCode=1;}finally{rmSync(temporary,{recursive:true,force:true});}
