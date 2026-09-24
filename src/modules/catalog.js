import { eApplyRoles } from "./cat-roles.js";
import { intentStoreKeys, intentFieldKey, intentCount, catalogLangs, setContentLangs, setCommentLang, setIntentIds, CATS, SW_STORE } from "./content-model.js";
import { CAT_ICONS, setCatalogCatLooks, setCatalogCatLabels } from "./icons.js";
import { parseMacrosData } from "./macros-json.js";
import { M, FACTS, normWhoList, setCatalogFacts, setCatalogWho } from "./stock.js";
import { lsGet, lsSet, nsKey, nsGet, nsDel, E_LS_OK } from "./storage.js";
import { BASE_CATS, pack } from "./pack.js";
import { hueIsOffered } from "./cat-identity.js";
import { catalogFromV2, isV2, v2CatKey } from "./catalog-v2.js";
import { setCatalogGreet } from "./greeting.js";
import { setCatalogStop } from "./affinity.js";
import { fileStamp, toast } from "./ui-lang.js";

/* ---- catalog: Etiuda ships empty - a catalog supplies cards, intents, categories and
   facts, playing the role built-in content used to (pack.baseCards still overrides it,
   personal edits still layer on top). Applied before BASE_STORE is snapshotted and before
   rebuildBaseCards() reads M. Asked about once per signature: accept and it loads
   silently from then on; change it and it asks again. */
const E_CATALOG_KEY=nsKey("CatalogOk");      // signature of the sibling catalog the user accepted
const E_CATALOG_STORE=nsKey("Catalog");      // the active catalog itself
/* Read once and remembered, because boot asks more than once and the answer cannot change:
   a sibling script has run or it has not by the time anything here is called. */
let E_SIBLING=null, E_SIBLING_READ=false;
function eCatalog(){
  if(E_SIBLING_READ) return E_SIBLING;
  E_SIBLING_READ=true;
  const c=(typeof window!=="undefined") ? window.E_CATALOG : null;
  /* THROUGH THE WHITELIST, exactly as a picked file goes. normaliseCatalog is what refuses the
     reserved category key and a hue no build offers, and this route skipped it, so one file
     kept more by sitting beside Etiuda than by being imported. tests/catalog-routes.mjs holds
     the two routes to the same answer. */
  try{ E_SIBLING=isV2(c) ? normaliseCatalog(catalogFromV2(c)) : null; }catch(e){ E_SIBLING=null; }
  return E_SIBLING;
}
/* The active catalog, whether it arrived by import or by accepting the sibling file. Keeping a
   copy rather than re-reading the sibling every boot is what lets an imported catalog and a
   sibling catalog be the same thing: one stored catalog, one code path, and Reset clears it. */
function storedCatalog(){
  try{
    const t=lsGet(E_CATALOG_STORE);
    if(!t) return null;
    const c=JSON.parse(t);
    return (c && typeof c==="object" && Array.isArray(c.cards)) ? c : null;
  }catch(e){ return null; }
}
/* CHECKED, NOT ATTEMPTED. lsSet swallows the quota throw by design, so a try/catch here can
   never fire: a full disk reports success and the reload comes back on the PREVIOUS catalog
   with the personal layers already pruned against the new one. The value is read back,
   because a quota refusal is the failure that lies most cheaply. */
function storeCatalog(c){
  /* A store that forgets at the tab's edge cannot hold a catalog at all: activateCatalog
     reloads, and the reload is what discards it. Say so instead of reloading into nothing. */
  if(!E_LS_OK){ toast("This browser is not storing anything, so a catalog cannot be kept here"); return false; }
  let s=null;
  try{ s=JSON.stringify(c); }catch(e){ s=null; }
  if(s===null || !lsSet(E_CATALOG_STORE,s,true) || lsGet(E_CATALOG_STORE)!==s){
    toast("Could not save the catalog, perhaps because the browser's storage is full.");
    return false;
  }
  return true;
}

/* ---- watching a catalog file. A handle is a live object the browser clones, so it cannot
   sit in localStorage with everything else - IndexedDB is the only store that takes one.
   Chrome and Edge only: Firefox ships no picker to obtain a handle from, hosted or not, so
   every entry point is behind eWatchSupported(). */
const E_IDB="EtiudaFiles", E_IDB_STORE="handles";
/* THE HANDLE IS NAMESPACED, like the name and the time that describe it. One fixed key was one
   slot for every build sharing a file:// origin, so a second copy was handed the first one's
   file and offered its catalog. The old shared slot is still READ where this build has a watch
   recorded and nothing under its own key, or upgrading would silently stop watching. */
const E_WATCH_KEY_SHARED="catalog";
function eWatchKey(){ return nsKey("catalog"); }
function eWatchSupported(){
  return typeof window!=="undefined" && typeof window.showOpenFilePicker==="function";
}
function idbRun(mode,fn){
  return new Promise((res,rej)=>{
    try{
      const r=indexedDB.open(E_IDB,1);
      r.onupgradeneeded=()=>{ try{ r.result.createObjectStore(E_IDB_STORE); }catch(e){} };
      r.onerror=()=>rej(r.error);
      r.onsuccess=()=>{
        try{
          const tx=r.result.transaction(E_IDB_STORE,mode);
          const rq=fn(tx.objectStore(E_IDB_STORE));
          tx.oncomplete=()=>res(rq?rq.result:undefined);
          tx.onerror=()=>rej(tx.error);
        }catch(e){ rej(e); }
      };
    }catch(e){ rej(e); }
  });
}
function eWatchGet(){
  return idbRun("readonly",st=>st.get(eWatchKey()))
    .then(h=>h || (eWatchName() ? idbRun("readonly",st=>st.get(E_WATCH_KEY_SHARED)) : null))
    .catch(()=>null);
}
function eWatchPut(h){ return idbRun("readwrite",st=>st.put(h,eWatchKey())).catch(()=>null); }
/* Name and last-edit time live in ordinary storage: the Library has to say WHICH file is
   watched without waiting on IndexedDB, and the time is the cheap skip at boot. */
function eWatchClear(){
  /* Read before the name goes: nothing under this build's own key means it was reading the
     shared slot, and that is then the one to drop. A build that was watching nothing drops
     neither, so stopping here cannot reach into a neighbouring copy. */
  const had=!!eWatchName();
  nsDel("WatchName"); nsDel("WatchSeen"); nsDel("WatchNo");
  const mine=eWatchKey();
  return idbRun("readonly",st=>st.get(mine))
    .then(h=>{
      if(h) return idbRun("readwrite",st=>st.delete(mine));
      return had ? idbRun("readwrite",st=>st.delete(E_WATCH_KEY_SHARED)) : null;
    })
    .catch(()=>null);
}
function eWatchName(){ return nsGet("WatchName")||""; }
/** Accepts a format 2 catalog: a .ec document, or that same JSON behind window.E_CATALOG in a
 *  file a page on file:// can load as a script. Parses, never runs. */
function parseCatalogFile(text){
  let raw=String(text||"").replace(/^﻿/,"").trim();
  if(!raw) throw new Error("file is empty");
  /* A .ec document parses as it stands. Anything else is the same JSON behind a
     `window.E_CATALOG =` wrapper, so the wrapper is stripped only once parsing has failed:
     searching for the name first would cut a file at a card that happened to mention it. */
  let data, got=false;
  try{ data=JSON.parse(raw); got=true; }catch(e){ got=false; }
  if(!got){
    const at=raw.indexOf("E_CATALOG");
    if(at>-1){
      const eq=raw.indexOf("=",at);
      if(eq>-1) raw=raw.slice(eq+1).trim().replace(/;\s*$/,"");
    }
    try{ data=JSON.parse(raw); }
    catch(e){ throw new Error("not a catalog - "+(e&&e.message?e.message:"could not parse")); }
  }
  return normaliseCatalog(catalogFromV2(data));
}
/** The whitelist, over a catalog the runtime can already read. Every route to a catalog ends
 *  here, so two catalogs are the same exactly when this returns the same thing. */
function normaliseCatalog(data){
  const cardsOut=parseMacrosData(data);            // validates every card, dedupes ids
  if(!cardsOut.length) throw new Error("no cards in file");
  const cat={ format:1, kind:"playbook-catalog",
              name:(data&&data.name)?String(data.name):"Imported catalog",
              categories:{}, intents:null, cards:cardsOut,
              facts:(data&&typeof data.facts==="string")?data.facts:"" };
  /* Carried when declared, like roles and who (remember: this object is a WHITELIST - see
     the note below). An edition number the author stamps on the file; the offer dialog and
     Manage show it, so a maintainer can tell at a glance which edition a desk is running. */
  if(data&&data.version!=null) cat.version=String(data.version);
  /* The envelope fields the runtime has no home for yet. They are carried so that an export
     gives back the file it was handed: `id` is the namespace key, `rev` is how two editions
     are compared, and `langs` is what the catalog says it speaks. */
  if(data&&data.id!=null) cat.id=String(data.id);
  if(data&&data.rev!=null) cat.rev=+data.rev;
  if(data&&Array.isArray(data.langs)&&data.langs.length) cat.langs=data.langs;
  /* The two tables the catalog may bring for the languages it declares. Whitelisted here as
     well as read at the sibling load, or Import would drop what the auto-load keeps. */
  if(data&&data.greet&&typeof data.greet==="object") cat.greet=data.greet;
  if(data&&data.stop&&typeof data.stop==="object") cat.stop=data.stop;
  /* Index-aligned with the intent arrays, and carried for the same reason as `id`: it is what
     an export needs to hand a request back the id it came with. */
  if(data&&Array.isArray(data.intentIds)&&data.intentIds.length) cat.intentIds=data.intentIds.map(String);
  if(data&&data.commentLang) cat.commentLang=String(data.commentLang);
  if(data&&data.sample) cat.sample=1;
  if(data&&data.categories&&typeof data.categories==="object"){
    Object.keys(data.categories).forEach(k=>{
      /* "fav" stays refused on the way IN. The virtual category it collided with is gone,
         so nothing here would break any more - but the catalog linter still reserves the
         key, and an importer that quietly accepts what the linter rejects is two
         contracts where there should be one. Loosening it is a catalog-format decision
         and belongs to a catalog-format release. */
      if(k!=="fav") cat.categories[k]=String(data.categories[k]||k);
    });
  }
  /* Carried like the primary's names and refusing the same key. Without it an IMPORTED catalog
     shows the primary's categories under a Polish interface while the sibling auto-load, which
     never passes through here, shows Polish - and the editor offers an empty Polish field. ONE
     MAP PER NON-PRIMARY LANGUAGE, named by catLabelKey; categoriesPl is pl's legacy spelling. */
  const dataLangs=catalogLangs(data);
  dataLangs.slice(1).forEach(code=>{
    const key=v2CatKey(code,dataLangs[0]);
    const src=data&&data[key];
    if(!src||typeof src!=="object") return;
    const dest={};
    Object.keys(src).forEach(k=>{
      const v=String(src[k]==null?"":src[k]).trim();
      if(k!=="fav" && v) dest[k]=v;
    });
    cat[key]=dest;
  });
  /* Carried through, but only if the file declares it: a pre-roles catalog must stay undeclared
     rather than be stamped with the current session's roles, which may belong to another catalog
     entirely. `roles.opener` is dropped here - that role no longer exists. */
  if(data&&data.roles&&typeof data.roles==="object"){
    cat.roles={ always:Array.isArray(data.roles.always)?data.roles.always.map(String):[] };
  }
  /* Carried through like roles, and only when declared, so a pre-`who` catalog stays
     undeclared rather than inheriting the current session's list.
     NOTE: `cat` above is a WHITELIST - it copies named fields and drops everything else.
     Every new top-level catalog field must be added here AND to currentCatalog(), or
     Import silently discards it while the sibling auto-load (which bypasses this parser)
     keeps it - a mismatch that looks like the catalog's own fault. */
  /* Category looks, carried like roles and only when declared. Deliberately NOT validated
     against this engine's CAT_ICONS here: an import should preserve what the file said, and a
     key this build cannot draw is dropped later, at eApplyCatalog, so re-exporting from a
     newer catalog on an older build does not quietly strip icons it merely does not know yet. */
  if(data&&data.icons&&typeof data.icons==="object"){
    cat.icons={};
    Object.keys(data.icons).forEach(k=>{ const v=String(data.icons[k]||""); if(v) cat.icons[k]=v; });
  }
  if(data&&data.colors&&typeof data.colors==="object"){
    cat.colors={};
    Object.keys(data.colors).forEach(k=>{
      const n=parseInt(data.colors[k],10);
      if(hueIsOffered(n)) cat.colors[k]=n;
    });
  }
  if(data&&Array.isArray(data.who)) cat.who=normWhoList(data.who);
  const i=data&&data.intents;
  const fileLangs=catalogLangs(data);
  const clauseOf=l=>intentFieldKey("clause",l);
  if(i&&Array.isArray(i[clauseOf(fileLangs[0])])&&i[clauseOf(fileLangs[0])].length){
    const n=i[clauseOf(fileLangs[0])].length;
    const arr=(a,fill)=>{ const out=(Array.isArray(a)?a.slice(0,n):[]).map(x=>String(x==null?"":x));
                          while(out.length<n) out.push(fill); return out; };
    /* THE KEY ORDER IS A CONTRACT: eCatalogSignature hashes this object's JSON, so a reshuffle
       asks every desk again whether to take the sibling it already has. Every declared clause,
       the category row, the primary's action and topic, then the rest as the export writes
       them - absent, not empty. topicPl was once missing here and a catalog exported WITH
       Polish topics lost them coming back in. */
    cat.intents={};
    fileLangs.forEach(l=>{ cat.intents[clauseOf(l)]=arr(i[clauseOf(l)],""); });
    cat.intents.cat=(Array.isArray(i.cat)?i.cat.slice(0,n):[]);
    ["cmt","topic"].forEach(f=>{ const key=intentFieldKey(f,fileLangs[0]); cat.intents[key]=arr(i[key],""); });
    ["topic","cmt"].forEach(f=>fileLangs.slice(1).forEach(l=>{
      const key=intentFieldKey(f,l);
      if(Array.isArray(i[key])) cat.intents[key]=arr(i[key],"");
    }));
    while(cat.intents.cat.length<n) cat.intents.cat.push(Object.keys(cat.categories)[0]||"gen");
  }
  // A pre-1.0 cards-only file carries no categories; keep whatever is loaded rather than blanking
  if(!Object.keys(cat.categories).length){
    Object.keys(CATS).forEach(k=>{ cat.categories[k]=CATS[k]; });
  }
  if(!cat.intents){
    cat.intents={};
    intentStoreKeys().forEach(key=>{ cat.intents[key]=(SW_STORE[key]||[]).slice(); });
  }
  if(!cat.facts) cat.facts=(pack.facts!=null&&pack.facts!=="")?pack.facts:FACTS;
  return cat;
}
/* Full-content hash, not a count fingerprint: rewording a card must change the
   signature, or the updated sibling is never offered over the stale copy. djb2 over JSON
   plus length. Old-format signatures fail to match once and re-ask - the safe direction. */
/* Two catalogs are the same if they NORMALISE the same - run back through
   parseCatalogFile(), the one function that decides what a catalog is; hashing the raw
   stringify differed by ROUTE and offered to replace the loaded catalog with itself. Falls
   back to the raw hash on throw; WeakMap-cached - boot asks more than once. */
const E_SIG_CACHE=(typeof WeakMap==="function")?new WeakMap():null;
function eCatalogSignature(c){
  if(!c) return "";
  if(E_SIG_CACHE && typeof c==="object"){
    const hit=E_SIG_CACHE.get(c);
    if(hit!=null) return hit;
  }
  let s;
  try{ s=JSON.stringify(normaliseCatalog(c)); }
  catch(e){
    try{ s=JSON.stringify(c); }catch(e2){ s=String(c.name||"catalog"); }
  }
  let h=5381;
  for(let i=0;i<s.length;i++) h=(((h<<5)+h)^s.charCodeAt(i))>>>0;
  const out=String(c.name||"catalog")+"|"+s.length+"|"+h.toString(36);
  if(E_SIG_CACHE && typeof c==="object"){ try{ E_SIG_CACHE.set(c,out); }catch(e){} }
  return out;
}
/* A bare number wants a "v" ("v3"); anything else is already a label. Free-form on
   purpose - the author picks whatever answers "is this current?" for their desk - so this
   formats what it is given rather than imposing a scheme. */
function catalogVersionLabel(v){
  const s=String(v==null?"":v).trim();
  if(!s) return "";
  return /^[0-9][0-9.]*$/.test(s) ? "v"+s : s;
}
/* THE ONE DATE A CATALOG SHOWS: its own edition, the string its author stamped, which is what the
   offer dialog, the Library and the empty screen's offer all name. The file's write time stands
   in only where there is no edition to read - it answers a different question, since copying a
   file rewrites it, and two dates for one catalog on one screen is item 406. The write time is
   still measured: the Newer tag is that and nothing else. */
function catalogStamp(edition,mtime){
  return catalogVersionLabel(edition)||fileStamp(mtime);
}
function eCatalogAccepted(c){
  try{ return lsGet(E_CATALOG_KEY)===eCatalogSignature(c); }catch(e){ return false; }
}
function eApplyCatalog(c){
  if(!c) return false;
  if(c.categories && typeof c.categories==="object"){
    /* BASE_CATS as well as CATS, and it is NOT optional: applyCatsToGlobal() deletes any
       category missing from BASE_CATS on every rebuildCards(), so setting only CATS looked
       correct for one frame and was wiped back to the starters, taking every catalog
       category with it. If another BASE_* snapshot is ever added above here, update it too. */
    Object.keys(CATS).forEach(k=>{ delete CATS[k]; });
    Object.keys(BASE_CATS).forEach(k=>{ delete BASE_CATS[k]; });
    Object.keys(c.categories).forEach(k=>{ CATS[k]=c.categories[k]; BASE_CATS[k]=c.categories[k]; });
  }
  /* Kept apart from BASE_CATS: that is the canonical name, the one an export writes. This
     is a translation OF it and must stay separable, or the export would bake the screen's
     language into the field every engine reads. Only keys the catalog declares. */
  const byLang={};
  const cLangs=catalogLangs(c);
  cLangs.slice(1).forEach(code=>{
    const src=c[v2CatKey(code,cLangs[0])];
    if(!src || typeof src!=="object") return;
    const m={};
    Object.keys(src).forEach(k=>{ const v=src[k]; if(typeof v==="string" && v.trim()) m[k]=v; });
    byLang[code]=m;
  });
  setCatalogCatLabels(byLang);
  /* Two parallel maps keyed by category id - the shape `roles` uses, so the format does
     not change and an older engine ignores the keys. The catalog names an ICON, it never
     carries one: drawings live in the engine, and a key this engine cannot draw is dropped
     here rather than stored, so a newer catalog degrades to the name-guess, not a blank. */
  const catIcons={}, catColors={};
  if(c.icons && typeof c.icons==="object"){
    Object.keys(c.icons).forEach(k=>{
      const v=String(c.icons[k]||"");
      if(CAT_ICONS[v]) catIcons[k]=v;
    });
  }
  if(c.colors && typeof c.colors==="object"){
    Object.keys(c.colors).forEach(k=>{
      const n=parseInt(c.colors[k],10);
      /* Same gate as catSlot: a catalog may CHOOSE from the engine's palette, it may not name a
         colour the engine no longer offers. Dropped here rather than at use, so a stale slot never
         reaches the renderer at all. */
      if(hueIsOffered(n)) catColors[k]=n;
    });
  }
  setCatalogCatLooks(catIcons, catColors);
  /* BEFORE THE INTENT ARRAYS, because intentStoreKeys() is derived from the languages and the
     loop below fills the keys it names. The file decides which languages the runtime speaks and
     in which order; the first of them is primary wherever one is asked for. */
  setContentLangs((Array.isArray(c.langs)?c.langs:[]).map(x=>x&&x.code));
  /* After the languages, because the code is checked against that list. Absent means the
     primary, which is the default. */
  setCommentLang(c.commentLang);
  /* The greeting phrases and the noise words go to the modules that own those tables, and a
     catalog that brings neither leaves both standing. Absent is passed on as absent, so
     loading a plain catalog over a rich one takes the rich one's tables away with it. */
  setCatalogGreet((c.greet&&typeof c.greet==="object")?c.greet:null);
  setCatalogStop((c.stop&&typeof c.stop==="object")?c.stop:null);
  // After the categories, never before: roles are resolved against what actually exists.
  const i=c.intents||{};
  /* Every field of every language, named by the table rather than one line each. The pad
     keeps them index-aligned whatever the catalog supplied - a block may carry fewer.
     EVERY key of the store is emptied, not only the ones the languages name: a catalog that
     drops a language would otherwise leave the old one's clauses standing behind it. */
  Object.keys(SW_STORE).forEach(k=>{ SW_STORE[k].length=0; });
  intentStoreKeys().forEach(k=>{ const a=SW_STORE[k]; a.length=0; (i[k]||[]).forEach(v=>a.push(v)); });
  const n=intentCount();
  intentStoreKeys().forEach(k=>{ const a=SW_STORE[k]; while(a.length<n) a.push(""); });
  /* The ids the file carries for those intents, padded the same way: a slot with no id keeps
     the positional key, which is the whole of what the migration in loadPack decides about. */
  const ids=(Array.isArray(c.intentIds)?c.intentIds:[]).slice(0,n);
  while(ids.length<n) ids.push("");
  setIntentIds(ids);
  // After the categories, never before: roles are resolved against what actually exists.
  eApplyRoles(c.roles);
  M.length=0; (c.cards||[]).forEach(m=>M.push(m));

  if(typeof c.facts==="string" && c.facts) setCatalogFacts(c.facts);
  if(Array.isArray(c.who)) setCatalogWho(normWhoList(c.who));
  E_CATALOG_NAME=String(c.name||"");
  /* Captured from whichever catalog actually APPLIED - stored, embedded or sibling.
     Reading storedCatalog() looked equivalent and was not: an integrated build has no
     stored catalog, so an export from a build silently dropped its edition number. */
  E_CATALOG_VERSION=(c.version!=null)?String(c.version):null;
  return true;
}
let E_CATALOG_NAME="", E_CATALOG_VERSION=null;

export {
  eCatalog,
  storedCatalog,
  storeCatalog,
  eWatchSupported,
  eWatchGet,
  eWatchPut,
  eWatchClear,
  eWatchName,
  parseCatalogFile,
  normaliseCatalog,
  eCatalogSignature,
  catalogVersionLabel,
  catalogStamp,
  eCatalogAccepted,
  eApplyCatalog,
  E_CATALOG_KEY,
  E_CATALOG_STORE,
  E_CATALOG_NAME,
  E_CATALOG_VERSION
};
