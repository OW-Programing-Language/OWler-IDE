/** Optional IDE quick fix: convert a *single* legacy OW function signature
 * to the preferred YAML-like form without changing program semantics.
 *
 * Only ordinary fn declarations ending in ':' are handled: interface/module
 * signatures without bodies, constructors and non-function arrows are left
 * alone. Invalid or unfamiliar lines are never rewritten.
 */
export function modernizeOwFunctionSignature(line:string):string|null {
 const match=line.match(/^(\s*)fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([A-Za-z_]\w*))?\s*:\s*(#.*)?$/);
 if(!match)return null;
 const [,indent,name,rawArgs,returnType,comment]=match;
 const argumentsList=rawArgs.trim()?rawArgs.split(','):[];
 const converted:string[]=[];
 for(const argument of argumentsList){
  const raw=argument.trim();
  const field=raw.match(/^([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_]\w*)|\s+([A-Za-z_]\w*))?$/);
  if(!field)return null;
  const type=field[2]??field[3];
  converted.push(type?`${field[1]}: ${type}`:field[1]);
 }
 const header=`${indent}fn ${name}(${converted.join(', ')}):${comment?' '+comment:''}`;
 const result=returnType?`${header}\n${indent}  returns: ${returnType}`:header;
 return result===line?null:result;
}

/** Type suggestions are focused on YAML metadata, not every colon in OW. */
export function isOwTypePosition(lineBeforeCursor:string):boolean {
 return /^\s*(?:field\s+(?:private\s+)?|set\s+)[A-Za-z_]\w*\s+[A-Za-z_]*$/.test(lineBeforeCursor) ||
        /^\s*returns\s*:\s*[A-Za-z_]*$/.test(lineBeforeCursor) ||
        /\bfn\s+[A-Za-z_]\w*\s*\([^)]*\b[A-Za-z_]\w*\s*:\s*[A-Za-z_]*$/.test(lineBeforeCursor);
}
