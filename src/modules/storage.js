import { eEmbeddedCatalog } from "./env.js";

/* ---- storage namespace: Chrome gives EVERY file:// page one localStorage, so a build
   and a plain engine share an origin - without this a standalone quietly shows another
   copy's stored catalog. Content is namespaced per build; PREFERENCES stay shared (a
   machine-wide theme is wanted, a machine-wide catalog is not). Plain engine keeps bare
   "pb" so nothing already stored migrates. */
/* THE CATALOG'S NAME, NEVER ITS SHAPE. Seeding this on the card/intent/category counts meant
   every edition that added a single card moved every agent to a fresh namespace, and their own
   cards, stars and ordering went with it - invisibly, because preferences are NOT namespaced
   and so looked untouched. Two different catalogs still separate, which is the whole job here;
   successive editions of one stop looking like strangers to each other. */
const E_NS=(function(){
  const c=eEmbeddedCatalog();
  const name=String((c&&c.name)||"").trim();
  if(!name) return "pb";
  let h=5381;
  for(let i=0;i<name.length;i++) h=(((h<<5)+h)^name.charCodeAt(i))>>>0;
  return "pb"+h.toString(36)+"~";        // still starts with "pb", so Reset still finds it
})();
/* ---- storage that cannot brick the app -----------------------------------------------------
   Firefox can leave a file:// origin's localStorage database corrupt, and then EVERY access
   throws NS_ERROR_FILE_CORRUPTED - reads, writes and deletes alike. A single bare
   `localStorage.pbTheme` is therefore enough to kill the boot, and a "reset" button is useless
   because clearing is exactly the operation that fails. Chrome has its own ways to make storage
   unavailable: private windows, quota, enterprise policy.

   So nothing touches localStorage directly. This probes it once with a real write, and on
   failure everything falls back to an in-memory store: Etiuda runs completely normally for
   the session and simply forgets when the tab closes. That is a far better failure than a page
   that will not start, and it degrades identically in every browser. */
const E_MEM=Object.create(null), E_MEM_S=Object.create(null);
/* The probe takes a thunk: reading window.localStorage is ITSELF the throwing operation
   when Firefox finds the origin's DB corrupt - the property getter fails, not just the
   methods - so the property access has to happen inside the try as well. */
function probeStore(get){
  try{ const s=get(), k="__pbprobe"; s.setItem(k,"1"); s.removeItem(k); return true; }
  catch(e){ return false; }
}
const E_LS_OK=probeStore(()=>window.localStorage);
const E_SS_OK=probeStore(()=>window.sessionStorage);
function lsGet(k){
  if(!E_LS_OK) return (k in E_MEM)?E_MEM[k]:null;
  try{ return localStorage.getItem(k); }catch(e){ return null; }
}
/* ONCE A WIPE IS DECIDED, NOTHING MAY PERSIST AGAIN. location.reload() does not stop the
   page - timers and handlers run until the navigation commits, far longer than any
   debounce, so a pending save writes its key straight back after the delete. The latch
   guards the two functions that WRITE: any of the seventeen sites that arm a save is one
   stray event from the same trick, and a future feature cannot silently escape this
   version of the fix. */
let eWiping=false;
/* The one way up. A module's binding cannot be assigned from outside it, so the three sites
   that raise the latch call this rather than writing the flag. It never comes down: the page
   is on its way to a reload by the time it is called. */
function eWipeLatch(){ eWiping=true; }
/* Returns whether the value actually landed. Swallowing the quota throw is right for the
   hundred small writes that would rather forget than interrupt, but a caller holding
   something it cannot rebuild needs to be told - see storeCatalog. */
function lsSet(k,v){
  if(eWiping) return false;
  if(!E_LS_OK){ E_MEM[k]=String(v); return true; }
  try{ localStorage.setItem(k,String(v)); return true; }catch(e){ return false; }
}
function lsDel(k){
  if(!E_LS_OK){ delete E_MEM[k]; return; }
  try{ localStorage.removeItem(k); }catch(e){}
}
function lsKeys(){
  if(!E_LS_OK) return Object.keys(E_MEM);
  try{ return Object.keys(localStorage); }catch(e){ return []; }
}
function ssGet(k){
  if(!E_SS_OK) return (k in E_MEM_S)?E_MEM_S[k]:null;
  try{ return sessionStorage.getItem(k); }catch(e){ return null; }
}
function ssSet(k,v){
  if(eWiping) return;                      // see the latch above lsSet
  if(!E_SS_OK){ E_MEM_S[k]=String(v); return; }
  try{ sessionStorage.setItem(k,String(v)); }catch(e){}
}
function ssDel(k){
  if(!E_SS_OK){ delete E_MEM_S[k]; return; }
  try{ sessionStorage.removeItem(k); }catch(e){}
}
/* COMING BACK TO THE LIBRARY. Eject and Clear do not close the dialog - they restart the
   app, and a reload cannot carry a screen with it. The intent is written to the session so
   boot can honour it, and it must be written BEFORE eWiping goes up, because ssSet obeys
   that latch. Session, not local: it belongs to this tab and this act, not to the user. */
const MG_REOPEN="pbReopenLibrary";
function mgReopenAfterReload(){ try{ ssSet(MG_REOPEN,"1"); }catch(e){} }
/** Namespaced key for anything belonging to one catalog. Preferences do not use this. */
function nsKey(name){ return E_NS===("pb") ? "pb"+name : E_NS+name; }
function nsGet(name){ return lsGet(nsKey(name)); }
function nsSet(name,v){ lsSet(nsKey(name),v); }
function nsDel(name){ lsDel(nsKey(name)); }

export {
  lsGet,
  eWipeLatch,
  lsSet,
  lsDel,
  lsKeys,
  ssGet,
  ssSet,
  ssDel,
  mgReopenAfterReload,
  nsKey,
  nsGet,
  nsSet,
  nsDel,
  E_NS,
  E_LS_OK,
  E_SS_OK,
  MG_REOPEN
};
