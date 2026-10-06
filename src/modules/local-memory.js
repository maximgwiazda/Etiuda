import { E_CATALOG_KEY, E_CATALOG_STORE, eWatchClear, eWatchGet, eWatchPut, catalogStoreRefusal } from "./catalog.js";
import { LOOSE_FIELDS } from "./catalog-file.js";
import { flushStats } from "./pack.js";
import { E_NS, eDeskFileShown, eLayers, lsDel, lsGet, lsKeys, lsSet, nsKey, ssDel, ssGet, ssSet } from "./storage.js";
import { TAB_KEY, saveTabSession, tabSaveTimer } from "./tabs.js";
import { offerUndo, toastRefusal } from "./ui-lang.js";
import { hooks } from "./hooks.js";

/* Both doors (Library and Maintenance) open onto this pair. FORGETTING WHAT YOU MADE AND
   PUTTING THE CATALOG DOWN ARE TWO ACTS: one button doing both charged the common one the
   price of the rare one. The prefix filter is load-bearing - file:// pages can share one
   storage area, and another local page's keys must be left alone. */
/* Asked for, not held: read at the top level this would take the two catalog keys while
   catalog.js is still being evaluated, which bundled reads undefined in silence. */
function catalogKeep(){ return [E_CATALOG_STORE,E_CATALOG_KEY,nsKey("Sample"),nsKey("CatalogTrust"),nsKey("CatalogFrom")]; }
/* WHERE THE CATALOGS ARE IS NOT HOW THE DESK LOOKS. This one names a folder on the machine, so
   forgetting it does not return anything to a default: it sends the app looking somewhere else
   for files it was pointed at once, and the person has to find them again. Kept by the wipe and
   NOT by catalogKeep above, which the eject deletes. */
const E_WIPE_KEEP=["eCatalogFolder"];
/* CLEAR FORGETS WHAT LIVES ONLY ON THIS DESK. What the desk's own file in the shared folder carries stays: the
   pack's LOOSE_FIELDS with the fields their ids are keyed by, the keys naming that file, the name it is signed with
   and the list of layers holding them. Emptied, a layer would take its file out of the share at the next write. */
const SHARE_KEEP=["eAgent","eLayers"];
const PACK_KEEP=["v","intentKeys","editBases","baseCards","macroOrder","baseMacros"];
const LAYER_KEEP=["Exported","LooseId","Shared","SharedOwn","SharedFile"];
function packFileHalf(raw){
  let p=null;
  try{ p=JSON.parse(raw); }catch(e){ p=null; }
  if(!p || typeof p!=="object" || Array.isArray(p) || !LOOSE_FIELDS.some(k=>k in p)) return null;
  const o={};
  LOOSE_FIELDS.concat(PACK_KEEP).forEach(k=>{ if(k in p) o[k]=p[k]; });
  return JSON.stringify(o);
}
/* WHOSE KEYS ARE THESE. Preferences are bare and deliberately machine-wide - a theme is
   shared, a catalog is not - so Reset forgets them wherever they were set. Everything else
   is namespaced, and the trap is that the plain engine's own namespace IS the bare prefix:
   matching by prefix therefore also matched every OTHER copy's "e<hash>~" keys, and a Reset
   run in one build was deleting a neighbouring copy's catalog, pack, stars and order. The
   layers this desk has written are its own by the list storage.js keeps of them. */
const E_PREF_KEYS=["eTheme","eGlassOff","eMotionOff","eUiLang","eLang","eAgent","ePax","eNoteHover",
  "eWho","ePills","ePillsLock","eRail","eRailLock","eRailW","eCollapsed","eFactsW",
  "eFactsH","eShortcuts","eHdrPills"];
function eKeyIsPref(k){ return E_PREF_KEYS.indexOf(k)>-1 || k.indexOf("eTour")===0; }
function eKeyIsMine(k,layers){
  if(E_NS==="e" ? /^e[A-Z]/.test(k) : k.indexOf(E_NS)===0) return true;
  return layers.some(ns=>k.indexOf(ns)===0);
}
/* WHAT AN ACT PUTS DOWN IS KEPT UNTIL ITS UNDO GOES: every key it touches as it stood, and the
   tabs. In memory, since the desk starts again in place and nothing has to cross a reload. What
   the layer in view still owes its keys is written first, so the copy is the whole of it. */
function keepKeys(keys){
  try{ hooks.flushPillState(); }catch(e){}
  flushStats();
  clearTimeout(tabSaveTimer);
  try{ saveTabSession(); }catch(e){}
  const was={keys:{}, tabs:ssGet(TAB_KEY)};
  keys.forEach(k=>{ was.keys[k]=lsGet(k); });
  return was;
}
function putBack(was){
  Object.keys(was.keys).forEach(k=>{ const v=was.keys[k]; if(v==null) lsDel(k); else lsSet(k,v); });
  if(was.tabs!=null) ssSet(TAB_KEY,was.tabs); else ssDel(TAB_KEY);
  hooks.restartDesk();
}
/* CLEARING HAPPENS AT ONCE, and its Undo puts every key back. The watched file's HANDLE lives in
   IndexedDB, out of any key sweep, so it is read before it goes and given back with the rest. */
function clearLocalMemory(){
  const layers=eLayers(), spaces=[E_NS].concat(layers);
  const kept=new Set(ejectKeys().concat(E_WIPE_KEEP, SHARE_KEEP, ...spaces.map(ns=>LAYER_KEEP.map(n=>ns+n))));
  const packs=new Set(spaces.map(ns=>ns+"Pack"));
  const keys=lsKeys().filter(k=>(eKeyIsMine(k,layers)||eKeyIsPref(k)) && !kept.has(k));
  const was=keepKeys(keys);
  let handle=null;
  eWatchGet().then(h=>{ handle=h||null; });
  eWatchClear();
  keys.forEach(k=>{ const half=packs.has(k) ? packFileHalf(was.keys[k]) : null; if(half!=null) lsSet(k,half); else lsDel(k); });
  ssDel(TAB_KEY);
  hooks.restartDesk();
  offerUndo("Local memory cleared", ()=>{
    // The tour a forgotten first run started goes with the forgetting.
    try{ if(hooks.tourActive()) hooks.endTour(false); }catch(e){}
    if(handle) eWatchPut(handle);
    putBack(was);
  });
}
/* EJECT HAPPENS AT ONCE, and its Undo loads the same catalog straight back. The personal layer
   stays where it is, with the catalog it orbits, and the empty desk shows its own. */
function ejectKeys(){ return catalogKeep().concat([nsKey("CatalogNo"),nsKey("CatalogFile"),nsKey("CatalogFileAt")]); }
function ejectCatalog(){
  const keys=ejectKeys();
  const was=keepKeys(keys);
  keys.forEach(k=>lsDel(k));
  ssDel(TAB_KEY);
  hooks.restartDesk();
  offerUndo("Catalog ejected", ()=>undoEject(was));
}
function undoEject(was){
  const put=was.keys[E_CATALOG_STORE];
  if(put!=null && (!lsSet(E_CATALOG_STORE,put,true) || lsGet(E_CATALOG_STORE)!==put)){
    toastRefusal(catalogStoreRefusal(eDeskFileShown()));
    return false;
  }
  putBack(was);
  return true;
}

export {
  clearLocalMemory,
  ejectCatalog
};
