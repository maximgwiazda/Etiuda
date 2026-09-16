import { E_CATALOG_KEY, E_CATALOG_STORE, eWatchClear } from "./catalog.js";
import { pack, savePack } from "./pack.js";
import { E_NS, eWipeLatch, lsDel, lsKeys, mgReopenAfterReload, nsDel, nsKey, ssDel, ssGet, ssSet } from "./storage.js";
import { TAB_KEY, tabSaveTimer } from "./tabs.js";
import { ask, t } from "./ui-lang.js";

/* Both doors (Library and Maintenance) open onto this pair. FORGETTING WHAT YOU MADE AND
   PUTTING THE CATALOG DOWN ARE TWO ACTS: one button doing both charged the common one the
   price of the rare one. The prefix filter is load-bearing - file:// pages can share one
   storage area, and another local page's keys must be left alone. The reload is what
   actually empties the engine: the catalog is applied once at boot. */
/* Asked for, not held: read at the top level this would take the two catalog keys while
   catalog.js is still being evaluated, which bundled reads undefined in silence. */
function catalogKeep(){ return [E_CATALOG_STORE,E_CATALOG_KEY,nsKey("Sample")]; }
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
  if(!ask(t("Clear Etiuda's local memory in this browser?")+"\n\n"
    +t("Removes every personal card, intent, edit, hide, category rename and quick-facts edit,")+" "
    +t("and forgets your agent name, theme and layout choices.")+" "
    +t("Catalog files on disk are not touched.")+"\n\n"
    +t("The loaded catalog stays, and Etiuda restarts with it."))) return;
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
  try{ lsKeys().filter(k=>(eKeyIsMine(k)||eKeyIsPref(k)) && catalogKeep().indexOf(k)<0)
         .forEach(k=>lsDel(k)); }catch(e){}
  ssDel(TAB_KEY);
  /* The reload waits for that delete, which is asynchronous and would otherwise be abandoned
     mid-transaction - but never for long: a wipe the user asked for must not hang on it. */
  if(watchGone && typeof watchGone.then==="function"){
    let done=false;
    const go=()=>{ if(!done){ done=true; location.reload(); } };
    watchGone.then(go,go);
    setTimeout(go,600);
  } else location.reload();
}
/* The other half. The personal layers go WITH the catalog because they only mean anything
   against its cards - the same reasoning activateCatalog applies when one catalog replaces
   another. Preferences stay: a name, a theme and a layout are yours, not the catalog's. */
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
function ejectCatalog(){
  if(!ask(t("Eject the catalog from this browser?")+"\n\n"
    +t("Your own cards, edits, stars and card order are KEPT, and come back where they were when you load this catalog again.")+" "
    +t("Loading a different catalog clears them, because they were written against this one.")+"\n\n"
    +t("Your agent name, theme and layout choices stay, and catalog files on disk are not touched.")+"\n\n"
    +t("Etiuda restarts empty. If a catalog file sits beside it you will be asked whether to load it."))) return;
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
  location.reload();
}

export {
  clearLocalMemory,
  ejectCatalog,
  ejectedJustNow
};
