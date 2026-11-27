import type {DiskUpdate,Tab} from './api';

/** Apply disk observations only if the tab still has the baseline captured
 * at the start of the request. Never overwrite an unsaved editor buffer. */
export function reconcileDiskTabs(previous:Tab[],requested:Map<string,string>,disk:Map<string,DiskUpdate>):Tab[]{
 let changed=false;
 const next=previous.map(tab=>{
  const observation=disk.get(tab.path);
  if(!observation||requested.get(tab.path)!==tab.saved)return tab;
  let result:Tab=tab;
  if(observation.status!=='present'){
   if(tab.diskState!==observation.status)result={...tab,diskState:observation.status};
  }else if(observation.text===tab.saved){
   if(tab.diskState)result={...tab,diskState:undefined};
  }else if(tab.content===tab.saved||tab.content===observation.text){
   result={...tab,content:observation.text,saved:observation.text,diskState:undefined};
  }else if(tab.diskState!=='changed'){
   result={...tab,diskState:'changed'};
  }
  if(result!==tab)changed=true;
  return result;
 });
 return changed?next:previous;
}
