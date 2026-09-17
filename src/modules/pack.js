import { CATS } from "./content-model.js";
import { M, WHO_BASE, normWhoList } from "./stock.js";
import { E_KEY_RE, E_NS, eNsFor, lsDel, lsGet, lsKeys, lsSet, nsGet, nsKey, ssDel, nsSet } from "./storage.js";
import { eEmbeddedCatalog } from "./env.js";
import { t, toast } from "./ui-lang.js";
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
    favourites:[],intentFavourites:[],cardOrder:[],facts:null,intentHidden:[],intentRemoved:[],
    intentOverrides:{},intentCustom:[],
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
  if(!pack.langs||typeof pack.langs!=="object"||Array.isArray(pack.langs)) pack.langs={en:0,pl:0};
  else pack.langs={en:pack.langs.en|0,pl:pack.langs.pl|0};
  if(pack.facts!=null && typeof pack.facts!=="string") pack.facts=null;
  // null = follow the catalog; an array = the user has edited the list, [] included
  if(pack.who!=null){ if(!Array.isArray(pack.who)) pack.who=null; else pack.who=normWhoList(pack.who); }
  // Imported card catalog: null / non-array = use stock M
  if(pack.baseCards!=null && !Array.isArray(pack.baseCards)) pack.baseCards=null;
  if(Array.isArray(pack.baseCards)&&!pack.baseCards.length) pack.baseCards=null;
  migrateBpToCin();
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
  try{ nsSet("Pack",JSON.stringify(out)); }catch(e){ toast("Could not save, perhaps because the browser's storage is full."); }
  /* Every pack mutation lands here, so this is the one hook that cannot be forgotten. Wiring
     the watermark to each individual edit path instead would mean the next new one silently
     leaves a "sample" mark over content somebody has already started rewriting. */
  hooks.syncSampleMark();
}
export {
  ePackEpoch,
  savePack,
  BASE_CATS, BASE_M, catalogCardId, rebuildBaseCards, pack, loadPack, adoptNameNsLayer,
  showPackMigrationWarning, whoOptions, isFavourite, isIntentFavourite,
};
