import { intentStoreKeys, SW_EN, SW_STORE } from "./content-model.js";
import { pack } from "./pack.js";

// Which intent is which: the stable id behind every slot, and the user's display order.
// Snapshot built-in intents; runtime SW_* arrays are mutated in place so cards that
// hold sw:SW_EN keep working, and export stays a single source of truth.
const BASE_STORE={};
let BASE_N=0;
/* The snapshot cannot be this module's top level. A module is evaluated before the monolith,
   and the SW_* arrays hold the catalog's intents only once applyBootCatalog() has run, so the
   monolith calls this at the line the snapshot used to occupy. */
function snapshotBaseIntents(){
  intentStoreKeys().forEach(k=>{ BASE_STORE[k]=SW_STORE[k].slice(); });
  BASE_N=BASE_STORE.en.length;
}
let intentOrder=[], intentOrderLoaded=false;
/* Both are replaced wholesale from outside this module, so both need a setter: an imported
   binding cannot be assigned to, and the accessor src/main.js installs for the monolith is a
   getter, so a bare write from either side is a silent no-op rather than an error. */
function setIntentOrder(v){ intentOrder=v; }
function setIntentOrderLoaded(v){ intentOrderLoaded=v; }
function intentIdAt(i){
  if(i<BASE_N) return "i:"+i;
  const c=(pack.intentCustom||[])[i-BASE_N];
  return c&&c.id ? c.id : "ui:"+i;
}
function isIntentHiddenId(id){ return (pack.intentHidden||[]).indexOf(id)>-1; }
/* The reverse of intentIdAt. Open-coded in two places before a third wanted it. */
function intentIdxOfId(id){
  for(let i=0;i<SW_EN.length;i++) if(intentIdAt(i)===String(id)) return i;
  return -1;
}
function isIntentHiddenIdx(i){ return isIntentHiddenId(intentIdAt(i)); }
function intentIsCustom(i){ return i>=BASE_N; }
function intentIsOverridden(i){
  return i<BASE_N && !!(pack.intentOverrides&&pack.intentOverrides["i:"+i]);
}
function intentIdxFromId(id){
  id=String(id||"");
  if(id.indexOf("i:")===0){
    const n=+id.slice(2);
    return (Number.isInteger(n)&&n>=0&&n<BASE_N) ? n : -1;
  }
  const ix=(pack.intentCustom||[]).findIndex(x=>x&&x.id===id);
  return ix>=0 ? BASE_N+ix : -1;
}

export {
  BASE_STORE,
  BASE_N,
  snapshotBaseIntents,
  intentOrder,
  intentOrderLoaded,
  setIntentOrder,
  setIntentOrderLoaded,
  intentIdAt,
  intentIdxOfId,
  isIntentHiddenIdx,
  intentIsCustom,
  intentIsOverridden,
  intentIdxFromId
};
