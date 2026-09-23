import { eEmbeddedCatalog } from "./env.js";
import { mgOpen } from "./app-state.js";
import { hooks } from "./hooks.js";

/* ---- storage namespace: Chrome gives EVERY file:// page one localStorage, so a build
   and a plain engine share an origin - without this a standalone quietly shows another
   copy's stored catalog. Content is namespaced per build; PREFERENCES stay shared (a
   machine-wide theme is wanted, a machine-wide catalog is not). Plain engine keeps the bare
   prefix; a build appends a hash of the catalog id, or of the name when the file carries none. */
/* THE SHAPE IS THE FILTER, NEVER THE LETTER. Every key is "e" plus a capitalised name, or
   "e<hash>~" plus one for a build, and every sweep matches THAT: on file:// a bare "e" would
   take a neighbouring page's keys with it. The boot script in the template carries the same
   shape as a literal, because it shares nothing with this file. */
const E_KEY_RE=/^e(?:[A-Z]|[0-9a-z]+~)/;
/* THE CATALOG'S ID, THE NAME WHEN THERE IS NONE, NEVER ITS SHAPE. Seeding this on the
   card/intent/category counts meant every edition that added a single card moved every agent
   to a fresh namespace, and their own cards, stars and ordering went with it - invisibly,
   because preferences are NOT namespaced and so looked untouched. Two different catalogs
   still separate; successive editions of one stop looking like strangers to each other. */
/* A function rather than a line inside E_NS: pack.js has to address the namespace an EARLIER
   seed produced, and a second copy of this arithmetic is a second hash the day one is touched. */
function eNsFor(seed){
  const s=String(seed);
  let h=5381;
  for(let i=0;i<s.length;i++) h=(((h<<5)+h)^s.charCodeAt(i))>>>0;
  return "e"+h.toString(36)+"~";         // base36, so E_KEY_RE's second arm finds it
}
const E_NS=(function(){
  const c=eEmbeddedCatalog();
  const id=String((c&&c.id)||"").trim();
  const name=String((c&&c.name)||"").trim();
  const seed=id||name;
  return seed ? eNsFor(seed) : "e";
})();
/* ---- storage that cannot brick the app -----------------------------------------------------
   Firefox can leave a file:// origin's localStorage database corrupt, and then EVERY access
   throws NS_ERROR_FILE_CORRUPTED - reads, writes and deletes alike. A single bare
   `localStorage.eTheme` is therefore enough to kill the boot, and a "reset" button is useless
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
  try{ const s=get(), k="__eprobe"; s.setItem(k,"1"); s.removeItem(k); return true; }
  catch(e){ return false; }
}
/* ---- the desk in a file, where the host offers one -----------------------------------------
   A shell hands the whole desk over at load and takes it back on every write, so only the four
   functions below change: a JSON file with a schema and its own backups, which a person can
   copy, read and keep, instead of a leveldb inside a browser profile that only Chromium opens.
   window.E_HOST is absent in a browser, E_DESK is null there, and every line below then behaves
   exactly as it did. Text across the bridge, never an object: see the preload's catalog. */
function eHostDesk(){
  try{
    const h=(typeof window!=="undefined") ? window.E_HOST : null;
    if(!h || typeof h.deskRead!=="function" || typeof h.deskSave!=="function") return null;
    const text=h.deskRead();
    const map=Object.create(null);
    if(text){ const o=JSON.parse(text); Object.keys(o).forEach(k=>{ map[k]=String(o[k]); }); }
    return {map:map,save:h.deskSave,host:h};
  }catch(e){ return null; }              // a host that answers badly is a host that is not there
}
const E_DESK=eHostDesk();
function deskSave(){
  let ok;
  try{ ok=E_DESK.save(JSON.stringify(E_DESK.map))!==false; }catch(e){ ok=false; }
  noteSave(ok,"");
  return ok;
}
/* WHETHER WHAT THE PERSON DID IS ON THE DISK. A desk writes its whole map every time, so one
   good write settles every earlier failure; a browser writes key by key, so each failed key is
   settled only by its own next write. The notice that reads this is syncSaveNotice in pack.js. */
let eUnsaved=null, eSavedAt=0;
function noteSave(ok,k){
  const was=!!eUnsaved;
  if(ok){
    eSavedAt=Date.now();
    if(eUnsaved && (E_DESK || (eUnsaved.delete(k) && !eUnsaved.size))) eUnsaved=null;
  } else {
    if(!eUnsaved) eUnsaved=new Map();
    if(!eUnsaved.has(k)) eUnsaved.set(k,Date.now());
  }
  if(was!==!!eUnsaved){ try{ hooks.syncSaveNotice(); }catch(e){} }
}
/** {since, file} while something the person did is not stored, else null. `file` is the desk's
 *  path, "" in a browser. */
function eSaveTrouble(){
  if(!eUnsaved) return null;
  let since=0;
  eUnsaved.forEach(at=>{ if(!since || at<since) since=at; });
  return {since:since, file:eHomeless(eDeskFile(),eDeskHome())};
}
function eLastSaved(){ return eSavedAt; }
/* The desk's path and the files the host refused to read, both asked of the host, which alone
   can see its folder. Empty in a browser and from a host that does not answer. */
function eDeskFile(){
  try{ return E_DESK ? String(E_DESK.host.deskFile||"") : ""; }catch(e){ return ""; }
}
function eDeskHome(){
  try{ return E_DESK ? String(E_DESK.host.home||"") : ""; }catch(e){ return ""; }
}
/* A PATH SHOWN TO A PERSON CARRIES NO ACCOUNT NAME: the copied report is sent to whoever helps,
   so the home folder is written %USERPROFILE%, which Explorer still opens. Case-blind, and only
   at a separator, so C:\Users\Ann does not swallow C:\Users\Anna. */
function eHomeless(p,home){
  const s=String(p||""), h=String(home||"").replace(/[\\/]+$/,"");
  if(!h || s.length<=h.length || s.slice(0,h.length).toLowerCase()!==h.toLowerCase()) return s;
  return /[\\/]/.test(s.charAt(h.length)) ? "%USERPROFILE%"+s.slice(h.length) : s;
}
function eDeskFileShown(){ return eHomeless(eDeskFile(),eDeskHome()); }
function eDeskRefused(){
  try{
    const v=(E_DESK && typeof E_DESK.host.deskRefused==="function") ? JSON.parse(E_DESK.host.deskRefused()||"[]") : [];
    return Array.isArray(v) ? v.filter(x=>x && typeof x.kept==="string" && x.kept) : [];
  }catch(e){ return []; }
}
function eDeskRefusedSeen(){
  try{ if(E_DESK && typeof E_DESK.host.deskRefusedSeen==="function") E_DESK.host.deskRefusedSeen(); }catch(e){}
}
/* A desk IS working storage, so the question storeCatalog asks - can anything be kept here -
   is answered yes without probing a localStorage the desk is not using. */
const E_LS_OK=!!E_DESK||probeStore(()=>window.localStorage);
const E_SS_OK=probeStore(()=>window.sessionStorage);
function lsGet(k){
  if(E_DESK) return (k in E_DESK.map)?E_DESK.map[k]:null;
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
   something it cannot rebuild needs to be told - see storeCatalog. THE DESK'S SAVE IS
   SYNCHRONOUS FOR THAT REASON: a write reported before the bytes are on the disk would turn
   storeCatalog's read-back into a formality, since it reads the map this just wrote.
   `own` is a caller that speaks about its own failure, so a browser does not count it as lost. */
function lsSet(k,v,own){
  if(eWiping) return false;
  if(E_DESK){ E_DESK.map[k]=String(v); return deskSave(); }
  if(!E_LS_OK){ E_MEM[k]=String(v); return true; }
  let ok=true;
  try{ localStorage.setItem(k,String(v)); }catch(e){ ok=false; }
  if(ok || !own) noteSave(ok,k);
  return ok;
}
function lsDel(k){
  if(E_DESK){ delete E_DESK.map[k]; deskSave(); return; }
  if(!E_LS_OK){ delete E_MEM[k]; return; }
  try{ localStorage.removeItem(k); noteSave(true,k); }catch(e){}
}
function lsKeys(){
  if(E_DESK) return Object.keys(E_DESK.map);
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
/* COMING BACK TO THE LIBRARY. Import, Load, Eject and Clear do not close the dialog - they
   restart the app, and a reload cannot carry a screen with it. Which folds were open is written
   to the session so boot can put them back, and it must be written BEFORE eWiping goes up,
   because ssSet obeys that latch. Session, not local: it belongs to this tab and this act.
   ONLY WHERE THE LIBRARY IS ACTUALLY OPEN, which its list is the presence of: Maintenance
   offers the same two acts, and coming back to a screen nobody opened is its own fault. */
const MG_REOPEN="eReopenLibrary";
function mgReopenAfterReload(){
  if(typeof document==="undefined" || !document.getElementById("mgCatList")) return;
  try{ ssSet(MG_REOPEN, Array.from(mgOpen).join(",")||"1"); }catch(e){}
}
/** Namespaced key for anything belonging to one catalog. Preferences do not use this. */
function nsKey(name){ return E_NS+name; }
function nsGet(name){ return lsGet(nsKey(name)); }
function nsSet(name,v){ return lsSet(nsKey(name),v); }
function nsDel(name){ lsDel(nsKey(name)); }
/* ---- carrying a 1.16.7 desk across. Those keys are these names under "pb", and each value
   is COPIED, never moved: a colleague may still open the 1.x engine on the same file://
   storage area. A key this build has already written is never overwritten, so a second pass
   cannot undo a later change, and the marker sits OUTSIDE E_KEY_RE deliberately - a Reset
   that cleared it would hand the old values back at the next boot. The IndexedDB watch
   handle does not travel: it is namespaced too, and points at a file 2.x does not read. */
const E_CARRIED="e~carried";
const E_OLD_KEY_RE=/^pb(?:[A-Z]|[0-9a-z]+~)/;
function eCarryOldKeys(){
  if(lsGet(E_CARRIED)!=null) return 0;
  let moved=0;
  try{
    lsKeys().forEach(k=>{
      if(!E_OLD_KEY_RE.test(k)) return;
      const to="e"+k.slice(2);
      if(lsGet(to)!=null) return;
      const v=lsGet(k);
      if(v!=null && lsSet(to,v)) moved++;
    });
  }catch(e){}
  lsSet(E_CARRIED,"1");
  return moved;
}

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
  eCarryOldKeys,
  eSaveTrouble,
  eLastSaved,
  eDeskFile,
  eDeskFileShown,
  eDeskHome,
  eHomeless,
  eDeskRefused,
  eDeskRefusedSeen,
  eNsFor,
  E_NS,
  E_KEY_RE,
  E_LS_OK,
  E_SS_OK,
  MG_REOPEN
};
