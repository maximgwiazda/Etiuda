import { E_CATALOG_KEY, E_CATALOG_STORE, eWatchClear, catalogStoreRefusal } from "./catalog.js";
import { pack, savePack } from "./pack.js";
import { E_NS, E_SS_OK, eDeskFileShown, eWipeLatch, lsDel, lsGet, lsKeys, lsSet, mgReopenAfterReload, nsDel, nsKey, ssDel, ssGet, ssSet } from "./storage.js";
import { reloadCovered } from "./motion.js";
import { TAB_KEY, saveTabSession, tabSaveTimer } from "./tabs.js";
import { askSure, offerUndo, t, toastRefusal } from "./ui-lang.js";
import { eHost } from "./host.js";

/* Both doors (Library and Maintenance) open onto this pair. FORGETTING WHAT YOU MADE AND
   PUTTING THE CATALOG DOWN ARE TWO ACTS: one button doing both charged the common one the
   price of the rare one. The prefix filter is load-bearing - file:// pages can share one
   storage area, and another local page's keys must be left alone. The reload is what
   actually empties the engine: the catalog is applied once at boot. */
/* Asked for, not held: read at the top level this would take the two catalog keys while
   catalog.js is still being evaluated, which bundled reads undefined in silence. */
function catalogKeep(){ return [E_CATALOG_STORE,E_CATALOG_KEY,nsKey("Sample"),nsKey("CatalogTrust")]; }
/* WHERE THE CATALOGS ARE IS NOT HOW THE DESK LOOKS. This one names a folder on the machine, so
   forgetting it does not return anything to a default: it sends the app looking somewhere else
   for files it was pointed at once, and the person has to find them again. Kept by the wipe and
   NOT by catalogKeep above, which the eject deletes. */
const E_WIPE_KEEP=["eCatalogFolder"];
/* WHOSE KEYS ARE THESE. Preferences are bare and deliberately machine-wide - a theme is
   shared, a catalog is not - so Reset forgets them wherever they were set. Everything else
   is namespaced, and the trap is that the plain engine's own namespace IS the bare prefix:
   matching by prefix therefore also matched every OTHER copy's "e<hash>~" keys, and a Reset
   run in one build was deleting a neighbouring copy's catalog, pack, stars and order. */
const E_PREF_KEYS=["eTheme","eGlassOff","eMotionOff","eUiLang","eLang","eAgent","ePax","eNoteHover",
  "eWho","ePills","ePillsLock","eRail","eRailLock","eRailW","eCollapsed","eFactsW",
  "eFactsH","eShortcuts","eHdrPills"];
function eKeyIsPref(k){ return E_PREF_KEYS.indexOf(k)>-1 || k.indexOf("eTour")===0; }
function eKeyIsMine(k){
  return E_NS==="e" ? /^e[A-Z]/.test(k) : k.indexOf(E_NS)===0;
}
function clearLocalMemory(){
  /* One t() per line, and every space kept OUTSIDE the key: a key with a trailing space
     can never be matched against the source, because what the scanner reads it trims. */
  askSure((eHost() ? t("Clear Etiuda's local memory on this computer?")
      : t("Clear Etiuda's local memory in this browser?"))+"\n\n"
    +t("Removes every personal card, intent, edit, hide, category rename and quick-facts edit,")+" "
    +t("and forgets your agent name, theme and layout choices.")+" "
    +t("Catalog files on disk are not touched.")+"\n\n"
    +t("The loaded catalog stays, and Etiuda restarts with it."), "Clear local memory", clearNow, true);
}
function clearNow(){
  /* Latch first, delete second - see eWiping: the reload does not stop timers, and a
     pending debounced save would write its key straight back. Cancelling the known timer as
     well is not redundant: the latch stops the write, this stops the work. */
  mgReopenAfterReload();            // before the latch, which ssSet obeys
  eWipeLatch();
  clearTimeout(tabSaveTimer);
  /* The watched-file HANDLE lives in IndexedDB, so a key sweep cannot reach it: deleting
     only WatchName left a live watch the interface no longer showed any control for, still
     free to announce an update about a file nobody could stop watching. */
  let watchGone=null;
  try{ watchGone=eWatchClear(); }catch(e){}
  try{ lsKeys().filter(k=>(eKeyIsMine(k)||eKeyIsPref(k))
         && catalogKeep().indexOf(k)<0 && E_WIPE_KEEP.indexOf(k)<0)
         .forEach(k=>lsDel(k)); }catch(e){}
  ssDel(TAB_KEY);
  /* The reload waits for that delete, which is asynchronous and would otherwise be abandoned
     mid-transaction - but never for long: a wipe the user asked for must not hang on it. */
  if(watchGone && typeof watchGone.then==="function"){
    let done=false;
    const go=()=>{ if(!done){ done=true; reloadCovered(); } };
    watchGone.then(go,go);
    setTimeout(go,600);
  } else reloadCovered();
}
/* The other half. The personal layers go WITH the catalog because they only mean anything
   against its cards. Preferences stay: a name, a theme and a layout are yours, not the catalog's. */
/* THE ONE-SHOT THAT KEEPS THE FOLDER'S OFFER OFF THE RESTART BELOW. The Library is reopened
   over that load and is already listing every file in the folder, so asking there is the app
   arguing with somebody who has just answered. Session, like the reopen it rides with, written
   before the latch that stops every write, and read once so the next launch asks as usual. */
const E_EJECTED="eEjectedNow";
function ejectedJustNow(){
  const v=ssGet(E_EJECTED);
  if(v) ssDel(E_EJECTED);
  return !!v;
}
/* EJECT HAPPENS AT ONCE, and its Undo loads the same catalog straight back: what the eject takes
   is parked in the session for the restart and read once by the next boot (offerEjectUndo). Only a
   session that cannot hold the park still asks first, since nothing would carry the Undo across. */
const E_EJECT_PARK="eEjectPark";
function ejectParkKeys(){ return catalogKeep().concat([nsKey("CatalogNo"),nsKey("CatalogFile"),nsKey("CatalogFileAt")]); }
function ejectCatalog(){
  try{ saveTabSession(); }catch(e){}
  const park={keys:{}, tabs:ssGet(TAB_KEY), base:pack.baseCards||null};
  ejectParkKeys().forEach(k=>{ park.keys[k]=lsGet(k); });
  let s=null;
  try{ s=JSON.stringify(park); }catch(e){ s=null; }
  if(E_SS_OK && s!==null){
    ssSet(E_EJECT_PARK,s);
    if(ssGet(E_EJECT_PARK)===s){ ejectNow(); return; }
    ssDel(E_EJECT_PARK);
  }
  askSure((eHost() ? t("Eject the catalog?") : t("Eject the catalog from this browser?"))+"\n\n"
    +t("Your own cards, edits, stars and card order are KEPT, and come back where they were when you load this catalog again.")+"\n\n"
    +t("Your agent name, theme and layout choices stay, and catalog files on disk are not touched.")+"\n\n"
    +t("Etiuda restarts empty. If a catalog file sits beside it you will be asked whether to load it."), "Eject catalog", ejectNow, true);
}
function ejectNow(){
  /* The ONE personal field that has to go: an older import route stored the catalog itself
     here, and BASE_M is built from it, so leaving it would hand the cards straight back. */
  pack.baseCards=null;
  savePack();                       // written BEFORE the latch, or the change never lands
  mgReopenAfterReload();            // and so is this, for the same reason
  ssSet(E_EJECTED,"1");             // and so is this
  eWipeLatch();
  clearTimeout(tabSaveTimer);
  catalogKeep().forEach(k=>lsDel(k));
  nsDel("CatalogNo");
  // The file's name and date go with the catalog: nothing is loaded, so no row is the loaded one.
  nsDel("CatalogFile"); nsDel("CatalogFileAt");
  ssDel(TAB_KEY);
  reloadCovered();
}
/** The boot after an eject: the park is taken whatever happens, so a later reload finds nothing. */
function offerEjectUndo(){
  const s=ssGet(E_EJECT_PARK);
  ssDel(E_EJECT_PARK);
  let park=null;
  try{ park=s ? JSON.parse(s) : null; }catch(e){ park=null; }
  if(!park || !park.keys || typeof park.keys!=="object") return false;
  offerUndo("Catalog ejected", ()=>undoEject(park));
  return true;
}
/* The eject run backwards, on the same latch-then-reload terms as every catalog route. */
function undoEject(park){
  const put=park.keys[E_CATALOG_STORE];
  if(put!=null && (!lsSet(E_CATALOG_STORE,put,true) || lsGet(E_CATALOG_STORE)!==put)){
    toastRefusal(catalogStoreRefusal(eDeskFileShown()));
    return false;
  }
  Object.keys(park.keys).forEach(k=>{
    if(k===E_CATALOG_STORE) return;
    const v=park.keys[k];
    if(v==null) lsDel(k); else lsSet(k,v);
  });
  if(park.base){ pack.baseCards=park.base; savePack(); }
  if(park.tabs!=null) ssSet(TAB_KEY,park.tabs);
  mgReopenAfterReload();
  eWipeLatch();
  clearTimeout(tabSaveTimer);
  reloadCovered();
  return true;
}

export {
  clearLocalMemory,
  ejectCatalog,
  ejectedJustNow,
  offerEjectUndo
};
