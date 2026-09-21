import { intentStoreKeys, intentFieldKey, intentCount, SW_IDS, SW_STORE, CONTENT_LANGS } from "./content-model.js";
import { pack } from "./pack.js";
import { nsGet, nsSet } from "./storage.js";

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
  // The PRIMARY's clause column, which is English's only while English is declared first.
  BASE_N=(BASE_STORE[intentFieldKey("clause",CONTENT_LANGS[0])]||[]).length;
}
let intentOrder=[], intentOrderLoaded=false;
/* Both are replaced wholesale from outside this module, so both need a setter: an imported
   binding cannot be assigned to, and the accessor src/main.js installs for the monolith is a
   getter, so a bare write from either side is a silent no-op rather than an error. */
function setIntentOrder(v){ intentOrder=v; }
function setIntentOrderLoaded(v){ intentOrderLoaded=v; }
/* THE STABLE NAME OF ONE INTENT, and the join between a catalog keyed by tag id and a runtime
   that still counts positions. "t:" is a prefix rather than the bare id so that a catalog tag
   can never collide with a custom intent's own name or with a slot number. A built-in whose
   file carries no id keeps the slot number: that desk's layer has been set aside already. */
function intentIdAt(i){
  if(i<BASE_N){ const id=SW_IDS[i]; return id ? "t:"+id : "i:"+i; }
  const c=(pack.intentCustom||[])[i-BASE_N];
  return c&&c.id ? c.id : "ui:"+i;
}
function isIntentHiddenId(id){ return (pack.intentHidden||[]).indexOf(id)>-1; }
/* The reverse of intentIdAt. Open-coded in two places before a third wanted it. */
function intentIdxOfId(id){
  for(let i=0;i<intentCount();i++) if(intentIdAt(i)===String(id)) return i;
  return -1;
}
function isIntentHiddenIdx(i){ return isIntentHiddenId(intentIdAt(i)); }
function intentIsCustom(i){ return i>=BASE_N; }
function intentIsOverridden(i){
  return i<BASE_N && !!(pack.intentOverrides&&pack.intentOverrides[intentIdAt(i)]);
}
function intentIdxFromId(id){
  id=String(id||"");
  if(id.indexOf("t:")===0){
    const tag=id.slice(2);
    for(let i=0;i<BASE_N;i++) if(SW_IDS[i]===tag) return i;
    return -1;
  }
  if(id.indexOf("i:")===0){
    const n=+id.slice(2);
    return (Number.isInteger(n)&&n>=0&&n<BASE_N) ? n : -1;
  }
  const ix=(pack.intentCustom||[]).findIndex(x=>x&&x.id===id);
  return ix>=0 ? BASE_N+ix : -1;
}

/* THE DISPLAY ORDER IS STORED BY ID AND HELD AS INDICES. Every drawer holds indices, which mean
   nothing except against the catalog that is applied; what is stored has to survive an edition
   that inserts a request. An id this catalog does not have is dropped, exactly as an index past
   the end was. */
function loadIntentOrder(){
  let raw=null;
  try{ raw=JSON.parse(nsGet("IntentOrder")||"null"); }catch(e){}
  if(!Array.isArray(raw)) return [];
  return raw.map(v=>intentIdxFromId(v)).filter(i=>i>=0);
}
function saveIntentOrder(){
  try{ nsSet("IntentOrder",JSON.stringify(intentOrder.map(i=>intentIdAt(i)))); }catch(e){}
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
  intentIdxFromId,
  loadIntentOrder,
  saveIntentOrder
};
