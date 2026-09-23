import { CATS, intentCount, SW_IDS } from "./content-model.js";
import { M, WHO_BASE, normWhoList } from "./stock.js";
import { E_KEY_RE, E_NS, eNsFor, lsDel, lsGet, lsKeys, lsSet, nsDel, nsGet, nsKey, ssDel, nsSet,
  eSaveTrouble, eDeskRefused, eDeskRefusedSeen } from "./storage.js";
import { eEmbeddedCatalog } from "./env.js";
import { t, toast, fileStamp } from "./ui-lang.js";
import { hooks } from "./hooks.js";

// Personal cards: stock built-ins in M; optional pack.baseCards (imported catalog)
// replaces M; edits/hides/customs in pack.overrides / .custom / .hidden. PAX and ROLE are
// per-tab session state, seeded in initTabs() from legacy localStorage if needed.
const BASE_CATS=Object.assign({},CATS);
let BASE_M=[];
/* The one place a card id is derived. A catalog FILE carries none, so anything comparing a
   stored id against an incoming catalog has to derive them the way the loader will.
   AN EXISTING id WINS: the importer disambiguates two cards sharing a category and title by
   suffixing the second, and re-deriving would hand both the first one's id - dropping the
   second card's star, hide and position on every activation. */
function catalogCardId(m){
  if(m && m.id) return m.id;
  return "b:"+((m&&m.c)||"open")+":"+((m&&m.t)||"Untitled");
}
function snapshotStockBaseCards(){
  return M.map(m=>{
    const o=Object.assign({},m);
    o.id=catalogCardId(m);
    o._base=1;
    return o;
  });
}
function normalizeBaseCardEntry(m){
  const o=Object.assign({},m||{});
  delete o._custom;
  delete o._overridden;
  delete o._base;
  if(!o.id) o.id=catalogCardId(o);
  o._base=1;
  return o;
}
/** Rebuild BASE_M from imported catalog (pack.baseCards) or stock M. */
function rebuildBaseCards(){
  if(Array.isArray(pack.baseCards)&&pack.baseCards.length){
    BASE_M=pack.baseCards.map(normalizeBaseCardEntry);
  } else {
    BASE_M=snapshotStockBaseCards();
  }
}
function emptyPack(){
  return {v:1,hidden:[],removed:[],removedCats:[],overrides:{},custom:[],catLabels:{},catLabelsPl:{},customCats:{},
    catRoles:{},catIcons:{},catColors:{},useCounts:{},useAt:{},intentCounts:{},searchMisses:0,langs:{en:0,pl:0},
    days:{},dayIds:[],daysSince:"",favourites:[],intentFavourites:[],cardOrder:[],facts:null,intentHidden:[],intentRemoved:[],
    intentOverrides:{},intentCustom:[],intentKeys:"",
    baseCards:null};
}
let pack=emptyPack();
/* 1.5.0 renamed pack keys (macroOrder -> cardOrder, baseMacros -> baseCards), and every
   browser and standalone in circulation holds the OLD names - this tool is distributed by
   copying a file. Read either, KEEP WRITING BOTH: writing only the new name silently costs
   someone their ordering in an older build. Drop the shim only when no pre-1.5.0 build is
   in use. Returns true if anything was migrated. */
function migratePackKeys(p){
  if(!p||typeof p!=="object") return false;
  let did=false;
  if(!Array.isArray(p.cardOrder) && Array.isArray(p.macroOrder)){ p.cardOrder=p.macroOrder; did=true; }
  if(p.baseCards===undefined && p.baseMacros!==undefined){ p.baseCards=p.baseMacros; did=true; }
  return did;
}
let packMigrationFailed=false;
/* Shown only if the key rename could not be applied to what was stored. Etiuda still
   runs on defaults, but the user would find their arrangement gone and blame the update -
   so say what happened and offer the one real fix. Dismissible: the arrangement is what
   is lost, not the content. */
function showPackMigrationWarning(){
  if(!packMigrationFailed || document.getElementById("eMigrateWarn")) return;
  const d=document.createElement("div");
  d.id="eMigrateWarn";
  d.style.cssText="position:fixed;left:0;right:0;top:0;z-index:2147483646;background:#78350f;"
    +"color:#fff;font:14px/1.5 system-ui,Segoe UI,sans-serif;padding:14px 18px;"
    +"box-shadow:0 2px 14px rgba(0,0,0,.4)";
  d.innerHTML='<b>Your saved card arrangement could not be read.</b> This version renamed how that '
    +'arrangement is stored, and the existing copy could not be converted. Etiuda is running '
    +'normally and your catalog is untouched - only the personal ordering, hidden cards and '
    +'favourites in this browser are affected.'
    +'<div style="margin-top:10px">'
    +'<button id="eMigrateReset" style="font:600 13px system-ui;padding:7px 14px;border:0;'
    +'border-radius:7px;background:#fff;color:#78350f">Reset personal data</button>'
    +'<button id="eMigrateHide" style="font:600 13px system-ui;padding:7px 14px;border:0;'
    +'border-radius:7px;background:rgba(255,255,255,.18);color:#fff;margin-left:10px">Dismiss</button>'
    +'</div>';
  (document.body||document.documentElement).appendChild(d);
  const r=document.getElementById("eMigrateReset");
  if(r) r.onclick=()=>{
    try{ lsKeys().filter(k=>E_KEY_RE.test(k)).forEach(k=>lsDel(k)); }catch(e){}
    try{ ssDel("eSessionTabs"); }catch(e){}
    location.replace(location.href.split("#")[0]);
  };
  const h=document.getElementById("eMigrateHide");
  if(h) h.onclick=()=>d.remove();
}
/* THE LASTING NOTICES, in the rescue banner's dress and stacked under one another at the top.
   Built from text nodes, so a path is never read as markup. */
function eNotice(id,lead,body,onDismiss){
  let box=document.getElementById("eNotices");
  if(!box){
    box=document.createElement("div");
    box.id="eNotices";
    box.style.cssText="position:fixed;left:0;right:0;top:0;z-index:2147483646;"
      +"box-shadow:0 2px 14px rgba(0,0,0,.4)";
    (document.body||document.documentElement).appendChild(box);
  }
  const d=document.createElement("div");
  d.id=id;
  d.style.cssText="background:#78350f;color:#fff;font:14px/1.5 system-ui,Segoe UI,sans-serif;"
    +"padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.18)";
  const b=document.createElement("b");
  b.textContent=lead;
  d.appendChild(b);
  d.appendChild(document.createTextNode(" "+body));
  const row=document.createElement("div");
  row.style.cssText="margin-top:10px";
  const x=document.createElement("button");
  x.type="button";
  x.textContent=t("Dismiss");
  x.style.cssText="font:600 13px system-ui;padding:7px 14px;border:0;border-radius:7px;"
    +"background:rgba(255,255,255,.18);color:#fff";
  x.onclick=()=>{ d.remove(); if(!box.firstChild) box.remove(); if(onDismiss) onDismiss(); };
  row.appendChild(x);
  d.appendChild(row);
  box.appendChild(d);
  return d;
}
/* Shown the moment a write fails and taken down by the write that settles it. A dismissal holds
   until then, and the person who saw the notice is told when the changes are safe again. */
let saveNoticeSeen=false, saveNoticeHeld=false;
function syncSaveNotice(){
  if(typeof document==="undefined") return;
  const tr=eSaveTrouble(), el=document.getElementById("eSaveWarn");
  if(!tr){
    if(el){ el.remove(); const box=document.getElementById("eNotices"); if(box && !box.firstChild) box.remove(); }
    if(saveNoticeSeen) toast(t("Your changes are saved again."));
    saveNoticeSeen=saveNoticeHeld=false;
    return;
  }
  if(el || saveNoticeHeld || !document.body) return;
  saveNoticeSeen=true;
  const body=tr.file
    ? t("Etiuda cannot write {FILE}, so they last only until it closes. The next save that succeeds writes them all.")
    : t("This browser is refusing to store them, perhaps because its storage is full, so they last only until this tab closes.");
  eNotice("eSaveWarn",t("Changes since {TIME} are not saved.").split("{TIME}").join(fileStamp(tr.since)),
    body.split("{FILE}").join(tr.file),()=>{ saveNoticeHeld=true; });
}
/* A desk file the host could not read was copied aside rather than lost, and this says where.
   It stays until dismissed, across launches, because the host keeps the record in the desk. */
function showDeskRefused(){
  const r=eDeskRefused()[0];
  if(!r || document.getElementById("eDeskWarn")) return;
  const body=r.restored
    ? t("The file is kept unchanged at {FILE}, and Etiuda has opened the copy saved {TIME}.")
    : t("The file is kept unchanged at {FILE}, and Etiuda has started afresh.");
  eNotice("eDeskWarn",t("Etiuda could not read its saved file."),
    body.split("{FILE}").join(r.kept).split("{TIME}").join(fileStamp(Date.parse(r.restored)||0)),
    eDeskRefusedSeen);
}
function showDeskNotices(){
  showDeskRefused();
  syncSaveNotice();
}
/* WHAT MAY CROSS A CATALOG BOUNDARY: everything addressed by CONTENT. A card id is derived
   from the card, so it either matches over there or is filtered out harmlessly - but every
   layer written before the tag model addressed an intent by its INDEX, and these carry that
   index into a namespace that reads it as a tag id. IntentOrder is out of NS_CARRY for the
   same reason, and baseCards would replace the card set wholesale. */
const NS_CARRY=["Pack","CatOrder","Cols","Floor"];
const NS_DROP_POSITIONAL=["intentOverrides","intentHidden","intentFavourites","intentRemoved","baseCards"];
function packWithoutPositional(raw){
  try{
    const p=JSON.parse(raw);
    if(!p||typeof p!=="object") return null;
    NS_DROP_POSITIONAL.forEach(k=>{ delete p[k]; });
    return JSON.stringify(p);
  }catch(e){ return null; }   // unparseable: loadPack could not have used it either
}
/* The one mover both adoptions below use. A key this namespace already holds is never
   overwritten: what is here is later than what is anywhere else, whatever brought it. */
function carryNsLayer(from){
  let moved=0;
  NS_CARRY.forEach(n=>{
    let v=lsGet(from+n);
    if(v==null || lsGet(nsKey(n))!=null) return;
    if(n==="Pack"){ v=packWithoutPositional(v); if(v==null) return; }
    if(lsSet(nsKey(n),v)) moved++;
  });
  // Deferred: the toast host does not exist this early in the boot.
  if(moved) setTimeout(()=>{ try{ toast(t("Restored your cards and stars from an earlier build.")); }catch(e){} },1400);
  return moved;
}
/* ONE SHOT PER SOURCE, and the marker is what makes it one: it sits OUTSIDE E_KEY_RE, so a
   Clear cannot take it with it and hand the same layer back at the next boot, undoing the
   Clear. Written wherever the question was actually answered - "this namespace already has a
   layer" is an answer - and never where there is nothing yet to answer. */
const NS_ADOPTED="e~nsAdopted:";
/* THE LAYER THIS CATALOG'S OWN DESK WROTE BEFORE THE ID KEYED THE NAMESPACE. The seed is the
   catalog's id from 2026-09-15; a desk that loaded this same catalog on an earlier build holds
   its cards, stars and columns under a hash of the NAME. The source is known exactly here,
   which the stranded rule below can never say - and the layer still travels stripped, because
   its intent keys are positions and this namespace reads them as tag ids. */
function adoptNameNsLayer(){
  try{
    const c=eEmbeddedCatalog();
    const id=String((c&&c.id)||"").trim(), name=String((c&&c.name)||"").trim();
    if(!id || !name) return false;
    const from=eNsFor(name);
    if(from===E_NS) return false;
    const mark=NS_ADOPTED+from;
    if(lsGet(mark)!=null) return false;                    // a second id sharing the name finds this
    if(!lsKeys().some(k=>k.indexOf(from)===0)) return false;
    const moved=nsGet("Pack") ? 0 : carryNsLayer(from);
    lsSet(mark,"1");
    return moved>0;
  }catch(e){ return false; }
}
/* The general case, where the source is inferred rather than known: exactly ONE other pack is
   stranded in the storage area file:// pages share. Two would mean a machine with two catalogs
   on it, and guessing between them is worse than leaving both alone. Runs only for a build that
   HAS an embedded catalog - the bare engine's pack belongs to whatever catalog was imported
   into it, which is not this one. */
function adoptStrandedPack(){
  try{
    if(E_NS==="e") return false;
    const mine=nsKey("Pack");
    const found=lsKeys().filter(k=>k!==mine && /^e[0-9a-z]+~Pack$/.test(k));
    if(found.length!==1) return false;
    const from=found[0].slice(0,-"Pack".length);
    const mark=NS_ADOPTED+from;
    if(lsGet(mark)!=null) return false;
    const moved=nsGet("Pack") ? 0 : carryNsLayer(from);
    lsSet(mark,"1");
    return moved>0;
  }catch(e){ return false; }
}
/* ---- positions, then tag ids ---------------------------------------------------------------
   Everything in the layer that names an intent named it by its POSITION before 2.0.0, and this
   build reads those names as tag ids. The re-key runs once, against the catalog applied at this
   boot, which is the one the layer was made against: a stored catalog, or the build's own. */
const TAG_KEYED="tag";
const ASIDE="IntentsAside";
const INTENT_LISTS=["intentHidden","intentFavourites","intentRemoved"];
function storedIntentOrder(){
  try{ const v=JSON.parse(nsGet("IntentOrder")||"null"); return Array.isArray(v)?v:null; }catch(e){ return null; }
}
function cardIntentsOf(m){ return (m&&Array.isArray(m.intents))?m.intents:null; }
function eachPersonalCard(fn){
  (pack.custom||[]).forEach(fn);
  Object.keys(pack.overrides||{}).forEach(k=>fn(pack.overrides[k]));
}
/** Does this layer name an intent at all? Nothing to re-key is not a desk to warn. */
function namesAnIntent(order){
  let found=Object.keys(pack.intentOverrides||{}).length>0
    || Object.keys(pack.intentCounts||{}).length>0
    || INTENT_LISTS.some(n=>(pack[n]||[]).length>0)
    || (Array.isArray(order)&&order.length>0);
  eachPersonalCard(m=>{ const l=cardIntentsOf(m); if(l&&l.some(x=>typeof x==="number")) found=true; });
  return found;
}
function rekeyIntentLayer(order){
  const n=intentCount();
  /* A slot number under the OLD reading to the id that slot carries now. Past the built-ins it
     is a custom intent, which has carried its own id all along. */
  const at=x=>{
    if(!Number.isInteger(x)||x<0) return "";
    if(x<n) return SW_IDS[x] ? "t:"+SW_IDS[x] : "";
    const c=(pack.intentCustom||[])[x-n];
    return (c&&c.id) ? String(c.id) : "";
  };
  const key=k=>{ const m=/^i:(\d+)$/.exec(String(k)); return m ? at(+m[1]) : String(k); };
  const remap=o=>{
    const out={};
    Object.keys(o||{}).forEach(k=>{ const to=key(k); if(to) out[to]=o[k]; });
    return out;
  };
  pack.intentOverrides=remap(pack.intentOverrides);
  pack.intentCounts=remap(pack.intentCounts);
  INTENT_LISTS.forEach(name=>{ pack[name]=(pack[name]||[]).map(key).filter(Boolean); });
  /* A personal card links a built-in intent by index - see storeIntentIds, which wrote numbers
     on purpose. Those are the same positions under another name. */
  eachPersonalCard(m=>{
    const l=cardIntentsOf(m);
    if(l) m.intents=l.map(x=>(typeof x==="number")?at(x):String(x)).filter(Boolean);
  });
  if(Array.isArray(order))
    nsSet("IntentOrder",JSON.stringify(order.map(x=>(typeof x==="number")?at(x):String(x)).filter(Boolean)));
}
/* NOTHING IS GUESSED. Where the catalog carries no id for an intent, no rule can say which
   request a stored index meant, and the wrong answer points somebody's own wording at another
   customer-facing clause. The layer is kept whole under its own key instead, the desk starts
   clean on what names an intent, and it is told once. */
function setAsideIntentLayer(order){
  const aside={ intentOverrides:pack.intentOverrides, intentCounts:pack.intentCounts,
                IntentOrder:order, cards:{} };
  INTENT_LISTS.forEach(name=>{ aside[name]=pack[name]||[]; });
  eachPersonalCard(m=>{
    const l=cardIntentsOf(m);
    if(!l || !l.some(x=>typeof x==="number")) return;
    if(m.id) aside.cards[m.id]=l;
    m.intents=l.filter(x=>typeof x!=="number");
  });
  try{ nsSet(ASIDE,JSON.stringify(aside)); }catch(e){}
  pack.intentOverrides={};
  pack.intentCounts={};
  INTENT_LISTS.forEach(name=>{ pack[name]=[]; });
  nsDel("IntentOrder");
  // Deferred with the same hand as the adoption above: no toast host exists this early.
  setTimeout(()=>{ try{ toast(t("Your intent edits and stars are set aside: this catalog cannot say which intent each belongs to.")); }catch(e){} },1400);
}
function migrateIntentKeys(){
  if(pack.intentKeys===TAG_KEYED) return "";
  const n=intentCount();
  if(!n) return "";                       // no catalog applied: there is nothing to decide yet
  const order=storedIntentOrder();
  if(namesAnIntent(order)){
    let exact=true;
    for(let i=0;i<n;i++) if(!SW_IDS[i]) exact=false;
    if(exact) rekeyIntentLayer(order); else setAsideIntentLayer(order);
  }
  pack.intentKeys=TAG_KEYED;
  savePack();
  return "done";
}
function loadPack(){
  let p=null;
  adoptNameNsLayer();                    // the known source before the inferred one
  adoptStrandedPack();
  try{ const raw=nsGet("Pack"); if(raw) p=JSON.parse(raw); }catch(e){}
  /* If the rename cannot be applied to what is stored, say so rather than starting quietly with
     an empty ordering - the user would see their arrangement gone with no explanation. The boot
     banner offers Reset, which is the honest remedy. */
  try{ migratePackKeys(p); }
  catch(e){ packMigrationFailed=true; try{ console.error("pack migration failed",e); }catch(_){} }
  pack=Object.assign(emptyPack(), p||{});
  if(!Array.isArray(pack.hidden)) pack.hidden=[];
  if(!pack.overrides||typeof pack.overrides!=="object") pack.overrides={};
  if(!Array.isArray(pack.custom)) pack.custom=[];
  if(!pack.catLabels||typeof pack.catLabels!=="object") pack.catLabels={};
  /* The user's Polish name for a category, beside their English one. Absent in every pack
     written before this, which is why it is normalised here rather than assumed. */
  if(!pack.catLabelsPl||typeof pack.catLabelsPl!=="object") pack.catLabelsPl={};
  /* Absent in older packs; both fall back to a name guess, so an upgrade shows icons at
     once and stores nothing until the user actually picks one. */
  if(!pack.catIcons||typeof pack.catIcons!=="object") pack.catIcons={};
  if(!pack.catColors||typeof pack.catColors!=="object") pack.catColors={};
  if(!pack.customCats||typeof pack.customCats!=="object") pack.customCats={};
  if(!Array.isArray(pack.intentHidden)) pack.intentHidden=[];
  if(!pack.intentOverrides||typeof pack.intentOverrides!=="object") pack.intentOverrides={};
  if(!Array.isArray(pack.intentCustom)) pack.intentCustom=[];
  if(!Array.isArray(pack.favourites)) pack.favourites=[];
  if(!Array.isArray(pack.intentFavourites)) pack.intentFavourites=[];
  if(!Array.isArray(pack.cardOrder)) pack.cardOrder=[];
  if(!pack.useCounts||typeof pack.useCounts!=="object"||Array.isArray(pack.useCounts)) pack.useCounts={};
  if(!pack.useAt||typeof pack.useAt!=="object"||Array.isArray(pack.useAt)) pack.useAt={};
  if(!pack.intentCounts||typeof pack.intentCounts!=="object"||Array.isArray(pack.intentCounts)) pack.intentCounts={};
  pack.searchMisses=pack.searchMisses|0;
  /* One counter per language this desk has actually copied in, keyed by code. Open, because
     the languages are the catalog's; a key that is not a usable code is dropped rather than
     carried into the statistics document. */
  if(!pack.langs||typeof pack.langs!=="object"||Array.isArray(pack.langs)) pack.langs={};
  else {
    const was=pack.langs; pack.langs={};
    Object.keys(was).forEach(code=>{ if(code&&!/[\s:]/.test(code)) pack.langs[code]=was[code]|0; });
  }
  // The day buckets a span's answer is summed from (desk-stats.js); absent in every older pack.
  if(!pack.days||typeof pack.days!=="object"||Array.isArray(pack.days)) pack.days={};
  if(!Array.isArray(pack.dayIds)) pack.dayIds=[];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(pack.daysSince||""))) pack.daysSince="";
  if(pack.facts!=null && typeof pack.facts!=="string") pack.facts=null;
  // null = follow the catalog; an array = the user has edited the list, [] included
  if(pack.who!=null){ if(!Array.isArray(pack.who)) pack.who=null; else pack.who=normWhoList(pack.who); }
  // Imported card catalog: null / non-array = use stock M
  if(pack.baseCards!=null && !Array.isArray(pack.baseCards)) pack.baseCards=null;
  if(Array.isArray(pack.baseCards)&&!pack.baseCards.length) pack.baseCards=null;
  if(pack.intentKeys!==TAG_KEYED) pack.intentKeys="";
  migrateBpToCin();
  /* Last, so it re-keys what the normalisation above has already made whole - and after
     migrateBpToCin, whose own remap reads intentOverrides by whatever key it finds. */
  migrateIntentKeys();
}
// Boarding pass (bp) was merged into Check-in (cin). Remap saved packs so nothing
// still points at the removed category key.
function migrateBpToCin(){
  if(pack.catLabels && pack.catLabels.bp!=null){
    if(pack.catLabels.cin==null){
      pack.catLabels.cin = pack.catLabels.bp==="Boarding pass" ? "Check-in" : pack.catLabels.bp;
    }
    delete pack.catLabels.bp;
  }
  if(pack.customCats && pack.customCats.bp!=null){
    if(pack.customCats.cin==null) pack.customCats.cin = pack.customCats.bp;
    delete pack.customCats.bp;
  }
  (pack.custom||[]).forEach(m=>{ if(m && m.c==="bp") m.c="cin"; });
  Object.keys(pack.overrides||{}).forEach(id=>{
    const o=pack.overrides[id];
    if(o && o.c==="bp") o.c="cin";
  });
  Object.keys(pack.intentOverrides||{}).forEach(id=>{
    const o=pack.intentOverrides[id];
    if(o && o.cat==="bp") o.cat="cin";
    if(o && Array.isArray(o.cat)) o.cat=o.cat.map(k=>k==="bp"?"cin":k);
  });
  (pack.intentCustom||[]).forEach(c=>{
    if(!c) return;
    if(c.cat==="bp") c.cat="cin";
    if(Array.isArray(c.cat)) c.cat=c.cat.map(k=>k==="bp"?"cin":k);
  });
  // Drop orphan hide/override keys for the old built-in boarding-pass ids
  if(Array.isArray(pack.hidden)){
    pack.hidden=pack.hidden.map(id=>String(id).replace(/^b:bp:/,"b:cin:"));
  }
  if(Array.isArray(pack.favourites)){
    pack.favourites=pack.favourites.map(id=>String(id).replace(/^b:bp:/,"b:cin:"));
  }
  Object.keys(pack.overrides||{}).forEach(id=>{
    if(/^b:bp:/.test(id)){
      const neu=id.replace(/^b:bp:/,"b:cin:");
      if(!pack.overrides[neu]) pack.overrides[neu]=pack.overrides[id];
      delete pack.overrides[id];
    }
  });
}

// Three layers, same shape as roles and facts: engine (nothing) -> catalog -> user edit.
// It lives with the top layer so that stock.js, which owns the bottom two, reads nothing here.
function whoOptions(){
  return Array.isArray(pack&&pack.who) ? pack.who : WHO_BASE;
}

// Two questions about the pack's own lists, asked from the sort, the rail and Manage.
function isFavourite(id){
  return !!(id && Array.isArray(pack.favourites) && pack.favourites.indexOf(id)>-1);
}
function isIntentFavourite(id){
  return !!(id && Array.isArray(pack.intentFavourites) && pack.intentFavourites.indexOf(id)>-1);
}

/* Bumped by the one hook every pack mutation already passes through, so a card's signature
   notices an edit, a star, a hide or a reorder without enumerating them. */
let ePackEpoch=0;
function savePack(){
  ePackEpoch++;
  /* Written under BOTH names - see migratePackKeys(): an older build opened against the
     same storage reads macroOrder/baseMacros and finds them. The duplicates are written
     here rather than kept on `pack`, so the live object carries the new vocabulary only. */
  let out=pack;
  try{
    out=Object.assign({},pack,{macroOrder:pack.cardOrder,baseMacros:pack.baseCards});
  }catch(e){ out=pack; }
  /* A refused write raises the lasting notice from the storage layer; see syncSaveNotice. */
  let ok=false;
  try{ ok=nsSet("Pack",JSON.stringify(out)); }catch(e){ ok=false; }
  /* Every pack mutation lands here, so this is the one hook that cannot be forgotten. Wiring
     the watermark to each individual edit path instead would mean the next new one silently
     leaves a "sample" mark over content somebody has already started rewriting. */
  hooks.syncSampleMark();
  return ok;
}
export {
  ePackEpoch,
  savePack,
  BASE_CATS, BASE_M, catalogCardId, rebuildBaseCards, pack, loadPack, adoptNameNsLayer,
  showPackMigrationWarning, syncSaveNotice, showDeskNotices, whoOptions, isFavourite, isIntentFavourite,
};
