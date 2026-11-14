import { E_CATALOG_KEY, E_CATALOG_STORE, catalogStoreRefusal, storedCatalog } from "./catalog.js";
import { tellTaken } from "./catalog-file.js";
import { eCatalogEject, eHasBranch } from "./host.js";
import { esc } from "./esc.js";
import { dismissNode } from "./motion.js";
import { hangBubble } from "./bubble.js";
import { originOf } from "./dom.js";
import { flushStats } from "./pack.js";
import { E_NS, LAYER_KEYS, eDeskFileShown, eLayers, lsDel, lsGet, lsSet, nsKey, ssDel, ssGet, ssSet } from "./storage.js";
import { TAB_KEY, saveTabSession, tabSaveTimer } from "./tabs.js";
import { offerUndo, t, toastRefusal } from "./ui-lang.js";
import { hooks } from "./hooks.js";
import { edCatalogTaken } from "./dialog.js";

/* Clearing opens from the Library, the eject from Maintenance. FORGETTING WHAT YOU MADE AND
   PUTTING THE CATALOG DOWN ARE TWO ACTS: one button doing both charged the common one the
   price of the rare one. */
/* Asked for, not held: read at the top level this would take the two catalog keys while
   catalog.js is still being evaluated, which bundled reads undefined in silence. */
function catalogKeep(){ return [E_CATALOG_STORE,E_CATALOG_KEY,nsKey("Sample"),nsKey("DeskMark"),nsKey("CatalogTrust"),nsKey("CatalogSigner"),nsKey("CatalogSignerPub"),nsKey("CatalogFrom")]; }
/* CLEAR TAKES EVERY LOCAL CHANGE TO WHAT THE CATALOG SHOWS, in every personal layer this desk has written,
   and the catalog reads as delivered. A layer is all it touches: the catalog, its file and folder, the name,
   the settings, the team and the licence live outside one. Of a layer it keeps what is not a change to the
   content: the counts, and the keys that name the desk's own file in the share. A field or key moves to the
   kept side by being added here. */
const CLEAR_KEEP_LAYER=["Stats","Days","Exported","LooseId","Shared","SharedOwn","SharedFile","EditionMarks"];
const CLEAR_KEEP_PACK=["v","intentKeys","baseCards","baseMacros","useCounts","useAt","intentCounts","searchMisses","langs","days","dayIds","daysSince"];
function packKept(raw,keep){
  let p=null;
  try{ p=JSON.parse(raw); }catch(e){ p=null; }
  if(!p || typeof p!=="object" || Array.isArray(p)) return null;
  const o={};
  keep.forEach(k=>{ if(k in p) o[k]=p[k]; });
  return JSON.stringify(o);
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
  edCatalogTaken(false);
  hooks.restartDesk();
}
/* THE CLEARED LAYER STAYS ON THIS PAGE until it is brought back or the page closes. The toast's
   Undo is the short way; this hold is what the Library row keeps, and a later act does not drop
   it. Nothing here is written, so a restart forgets it. */
let clearedHold=null;
function clearedHeld(){ return !!clearedHold; }
/* THE CLEAR ITSELF, at once once asked, and its Undo puts every key back. */
function clearLocalMemory(){
  const from=originOf(document.getElementById("mgWipe"), ()=>document.getElementById("mgBring"));
  let keep={layer:[], pack:[]};
  keep={layer:CLEAR_KEEP_LAYER, pack:CLEAR_KEEP_PACK}; /* plant:clear-keep-list */
  const spaces=[E_NS].concat(eLayers());
  const keys=[];
  spaces.forEach(ns=>LAYER_KEYS.forEach(n=>{ if(keep.layer.indexOf(n)<0 && lsGet(ns+n)!=null) keys.push(ns+n); }));
  const was=keepKeys(keys);
  keys.forEach(k=>{ const half=/Pack$/.test(k) ? packKept(was.keys[k],keep.pack) : null; if(half!=null) lsSet(k,half); else lsDel(k); });
  if(!clearedHold) clearedHold=was;
  edCatalogTaken(false);
  hooks.restartDesk();
  offerUndo("Local changes cleared", ()=>{ if(clearedHold===was) clearedHold=null; putBack(was); }, null, from);
}
function bringBackCleared(){
  const was=clearedHold;
  if(!was) return false;
  clearedHold=null;
  putBack(was);
  return true;
}
/* THE QUESTION BEFORE THE CLEAR: Cancel holds the focus, so Enter and Escape both keep the changes. */
function askClearLocal(){
  const was=document.getElementById("eClearAsk");
  if(was) was.remove();
  const el=document.createElement("div");
  el.className="bub bub-ask e-undo e-clear-ask";
  el.id="eClearAsk";
  el.setAttribute("role","alertdialog");
  el.setAttribute("data-side","none");
  el.setAttribute("aria-labelledby","eClearAskT");
  el.innerHTML='<h3 id="eClearAskT">'+esc(t("Clear local changes?"))+'</h3>'
    +'<p>'+esc(t("Every change made to the content on this computer goes: your edits to cards, your own cards and intents, changes to categories, roles and variables, and stars, hidden cards and the order of cards. The catalog is left as delivered."))+'</p>'
    +(eHasBranch() ? '<p>'+esc(t("On a team, the changes this desk shared with the team's lead go too, any the lead has not yet reviewed included."))+'</p>' : '')
    +'<p>'+esc(t("The catalog file, the team, the licence, the folder setting and the agent's name stay. Undo brings the changes back on this desk until Etiuda closes; after a restart, nothing comes back."))+'</p>'
    +'<div class="tour-actions"><button type="button" class="btn" id="eClearGo">'+esc(t("Clear local changes"))+'</button>'
    +'<button type="button" class="btn primary" id="eClearStay">'+esc(t("Cancel"))+'</button></div>';
  document.body.appendChild(el);
  hangBubble(el, ()=>document.getElementById("mgWipe"));
  el.querySelector("#eClearGo").onclick=()=>{ dismissNode(el); clearLocalMemory(); };
  el.querySelector("#eClearStay").onclick=()=>dismissNode(el);
  el.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation(); dismissNode(el);
  });
  try{ el.querySelector("#eClearStay").focus({preventScroll:true}); }catch(_){}
}
/* EJECT HAPPENS AT ONCE, and its Undo loads the same catalog straight back. The personal layer
   stays where it is, with the catalog it orbits, and the empty desk shows its own. */
function ejectKeys(){ return catalogKeep().concat([nsKey("CatalogNo"),nsKey("CatalogFile"),nsKey("CatalogFileAt")]); }
/* Wired as a click handler: the event names the Eject pressed. */
function ejectCatalog(e){
  const at=e && e.currentTarget && e.currentTarget.nodeType===1 ? e.currentTarget : null;
  const from=originOf(at, ()=>document.getElementById("catNow"));
  const keys=ejectKeys();
  const was=keepKeys(keys);
  keys.forEach(k=>lsDel(k));
  ssDel(TAB_KEY);
  /* Told before the restart, so the shell drops its copy first. A browser, and a run of this
     function outside the module, has no binding and ejects as before. */
  if(typeof eCatalogEject==="function") eCatalogEject();
  edCatalogTaken(false);
  hooks.restartDesk();
  offerUndo("Catalog ejected", ()=>undoEject(was), null, from);
}
function undoEject(was){
  const put=was.keys[E_CATALOG_STORE];
  if(put!=null && (!lsSet(E_CATALOG_STORE,put,true) || lsGet(E_CATALOG_STORE)!==put)){
    toastRefusal(catalogStoreRefusal(eDeskFileShown()));
    return false;
  }
  putBack(was);
  /* Told after the keys are back, so the shell names this catalog again. A browser, and a run of
     this function outside the module, has no binding and undoes as before. */
  if(typeof tellTaken==="function" && typeof storedCatalog==="function") tellTaken(storedCatalog());
  return true;
}

export {
  askClearLocal,
  bringBackCleared,
  clearLocalMemory,
  clearedHeld,
  ejectCatalog
};
