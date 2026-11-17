/** Lightweight editor-side discovery for OWUnit gutter actions.
 * The OW interpreter remains the authoritative test parser/executor.
 */
export type OwTestDeclaration={
 name:string;
 annotationLine:number;
 functionLine:number;
 className?:string;
};

export function discoverOwTests(source:string):OwTestDeclaration[]{
 const lines=source.split(/\r?\n/);
 const declarations:OwTestDeclaration[]=[];
 let currentClass:{name:string;indent:number}|null=null;
 let pending:{line:number;indent:number}|null=null;
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  const trimmed=line.trim();
  if(!trimmed||trimmed.startsWith('#'))continue;
  const indentation=(line.match(/^\s*/)?.[0]??'').replaceAll('\t','  ').length;
  if(currentClass&&indentation<=currentClass.indent)currentClass=null;
  const classMatch=trimmed.match(/^class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:/);
  if(classMatch){
   currentClass={name:classMatch[1],indent:indentation};
   pending=null;
   continue;
  }
  if(trimmed==='@Test'){
   pending={line:index+1,indent:indentation};
   continue;
  }
  if(pending){
   const functionMatch=trimmed.match(/^fn\s+([A-Za-z_]\w*)\s*\(/);
   if(functionMatch&&indentation===pending.indent){
    declarations.push({
     name:currentClass?currentClass.name+'.'+functionMatch[1]:functionMatch[1],
     annotationLine:pending.line,
     functionLine:index+1,
     ...(currentClass?{className:currentClass.name}:{})
    });
   }
   pending=null;
  }
 }
 return declarations;
}

export function isOwTestFile(path:string):boolean{
 const filename=path.split('/').pop()??'';
 return filename.endsWith('Test.ow')||filename.endsWith('_test.ow');
}
