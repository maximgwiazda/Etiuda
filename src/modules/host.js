import { $ } from "./dom.js";
import { t, toast } from "./ui-lang.js";
import { lsGet, lsSet, nsGet } from "./storage.js";
import { eCatalog, eCatalogAccepted, storedCatalog } from "./catalog.js";
import { pack } from "./pack.js";
import { statsDoc } from "./desk-stats.js";
import { E_VERSION } from "./env.js";

/* The desktop host, and the engine's whole knowledge of it: window.E_HOST is put there by the
   shell's preload and is absent in a browser, so nothing further down the tree asks what it is
   running in. Two body classes, because they are two facts. e-host: the window has no chrome of
   its own, so the band is the top bar and draws the three controls. e-backdrop: the host paints
   a material behind the window, so the band leaves its pixels for it. Windows 10 and Linux give
   the first without the second. */
function eHost(){
  try{ return (typeof window!=="undefined" && window.E_HOST) || null; }catch(e){ return null; }
}

/* WHERE CATALOGS COME FROM, per build, in one place so the four screens that say it cannot
   drift: a host reads every .ec in a folder of the desk's own, newest first, and a browser reads
   the one sibling script its tag can name. The KEY outranks what the host answered, because the
   host answered at boot and Settings may have moved the folder since. Empty string in a browser,
   which is the test every caller makes. */
const E_CATALOG_FOLDER_KEY="eCatalogFolder";
const E_CATALOG_SCRIPT="etiuda-catalog.js";
function eCatalogFolder(){
  const h=eHost(); if(!h) return "";
  return String(lsGet(E_CATALOG_FOLDER_KEY)||h.catalogFolder||"");
}
/* THE FOLDER AS WINDOWS NAMES IT, which is the last two segments: a full path is the answer to
   "where exactly" and belongs on hover, while the sentence in front of a person has to fit one
   line at the narrowest width the band allows. Either separator, since a setting may hold a path
   typed by hand, and the whole thing where there are not two segments to take. */
function eCatalogFolderShort(){
  const full=eCatalogFolder();
  const parts=full.split(/[\\/]+/).filter(Boolean);
  if(parts.length<2) return full;
  return parts.slice(-2).join(full.indexOf("\\")>-1?"\\":"/");
}
/* Opens that folder in the desk's own file manager. Answers false in a browser and false where
   the host could not open it, which is the caller's to speak about. */
function eOpenCatalogFolder(){
  const h=eHost();
  if(!h || typeof h.openCatalogFolder!=="function") return Promise.resolve(false);
  try{ return Promise.resolve(h.openCatalogFolder()).then(v=>!!v).catch(()=>false); }
  catch(e){ return Promise.resolve(false); }
}
/* The file this load is running, and the folder it was found in - which is not always the folder
   above: a catalog beside the installation still loads when the folder holds none. */
function eCatalogFile(){ const h=eHost(); return h?String(h.catalogFile||""):""; }
function eCatalogIn(){ const h=eHost(); return h?String(h.catalogIn||""):""; }
/* When that file was last written, as the host read it at boot. 0 in a browser and 0 where the
   host has no file, which is what every caller tests. */
function eCatalogMtime(){ const h=eHost(); return h?(+h.catalogMtime||0):0; }
/* Whether that file arrived because somebody double-clicked it, rather than because it is the
   newest in the folder. False in a browser, where no file is ever handed to a launch. */
function eOpenedWith(){ const h=eHost(); return !!(h && h.openedWith); }
/* The catalog folder's own listing,
   [{name,mtime,cards,edition,macros,intents,cats,awaiting,sample,id,catalogName}],
   in the host's own order: newest first, the sample last whatever its date - the rule and the
   reason are at sampleLast in shell/main.js. Empty in a browser. Asked for when a screen paints,
   never cached: the folder is a setting. Every count is -1 and `edition` "" where the host could
   not read the file as a catalog; what each count means is written at ecCounts in shell/main.js. */
function eCatalogFiles(){
  const h=eHost();
  if(!h || typeof h.catalogFiles!=="function") return Promise.resolve([]);
  try{
    return Promise.resolve(h.catalogFiles())
      .then(v=>Array.isArray(v)?v.map(f=>({name:String(f&&f.name||""),mtime:+(f&&f.mtime)||0,
                                           cards:(f&&f.cards!=null)?+f.cards:-1,
                                           edition:String(f&&f.edition||""),
                                           macros:(f&&f.macros!=null)?+f.macros:-1,
                                           intents:(f&&f.intents!=null)?+f.intents:-1,
                                           cats:(f&&f.cats!=null)?+f.cats:-1,
                                           /* Board 505's awaiting class, [{code,n}] in the
                                              file's declared order; empty for a file with
                                              nothing waiting and for one that did not read. */
                                           awaiting:(Array.isArray(f&&f.awaiting)?f.awaiting:[])
                                             .map(a=>({code:String(a&&a.code||""),n:+(a&&a.n)||0}))
                                             .filter(a=>a.code&&a.n>0),
                                           sample:!!(f&&f.sample),
                                           /* The catalog's own identity, for the rule of board
                                              431; empty where the file did not read. */
                                           id:String(f&&f.id||""),
                                           catalogName:String(f&&f.catalogName||"")}))
                                 .filter(f=>f.name):[])
      .catch(()=>[]);
  }catch(e){ return Promise.resolve([]); }
}
/* WHICH FILE IN THAT FOLDER IS THE ONE LOADED, so a list can mark it. The name is written when a
   catalog is activated from the folder and blanked by every other route, so "" means the loaded
   catalog came from somewhere else. A desk that predates the key has no answer at all, and the
   fallback is the file THIS load read: only where its signature is the accepted one, or a folder
   holding a newer catalog would mark the wrong row. */
function eLoadedCatalogFile(){
  const set=nsGet("CatalogFile");     // written in catalog-file.js, where the rule is
  if(set!=null) return String(set);
  return eCatalogAccepted(eCatalog()) ? eCatalogFile() : "";
}
/* CHOOSING THE FOLDER, from either door: Settings' row and the Library's button both end here,
   so the two cannot drift about what a closed dialog or a refused write means. Resolves to the
   folder actually set, and "" for anything that leaves the setting where it was. */
function eChooseCatalogFolder(title){
  return ePickCatalogFolder(title).then(dir=>{
    if(!dir || dir===eCatalogFolder()) return "";
    if(lsSet(E_CATALOG_FOLDER_KEY,dir)===false){ toast(t("That setting could not be saved.")); return ""; }
    return dir;
  });
}
/* One file out of that folder, by name. {name,text} or null; an empty text is a file that would
   not read, which is the caller's to speak about. */
function eReadCatalogFile(name){
  const h=eHost();
  if(!h || typeof h.readCatalogFile!=="function") return Promise.resolve(null);
  try{
    return Promise.resolve(h.readCatalogFile(String(name||"")))
      .then(v=>(v&&typeof v==="object")?{name:String(v.name||""),text:String(v.text||"")}:null)
      .catch(()=>null);
  }catch(e){ return Promise.resolve(null); }
}
/* Resolves to the chosen folder, or "" for a dialog the person closed. The caption is passed in
   already translated: the shell has no t(). */
function ePickCatalogFolder(title){
  const h=eHost();
  if(!h || typeof h.pickCatalogFolder!=="function") return Promise.resolve("");
  try{ return Promise.resolve(h.pickCatalogFolder(String(title||""))).then(v=>String(v||"")); }
  catch(e){ return Promise.resolve(""); }
}
/* The host's own Import dialog, and the test every caller makes before offering it: a browser
   answers false here and keeps its picker. The caption and the filter's label are passed in
   already translated, like the folder picker's. */
function eHasCatalogPicker(){
  const h=eHost();
  return !!h && typeof h.pickCatalogFile==="function";
}
/* {name,text} for a file chosen, null for a dialog closed. An empty text is a file that would
   not read, which is the caller's to say something about. */
function ePickCatalogFile(title,label){
  if(!eHasCatalogPicker()) return Promise.resolve(null);
  try{
    return Promise.resolve(eHost().pickCatalogFile(String(title||""),String(label||"")))
      .then(v=>(v&&typeof v==="object")?{name:String(v.name||""),text:String(v.text||"")}:null)
      .catch(()=>null);
  }catch(e){ return Promise.resolve(null); }
}
/* Export's save dialog, the host's for the reason Import's is: the engine calls no OS API, and the
   host writes the bytes and says whether they landed. {name,ok} for a file chosen, null for a
   dialog closed. */
function eHasCatalogSaver(){
  const h=eHost();
  return !!h && typeof h.saveCatalogFile==="function";
}
function eSaveCatalogFile(title,name,text,label){
  if(!eHasCatalogSaver()) return Promise.resolve(null);
  try{
    return Promise.resolve(eHost().saveCatalogFile(String(title||""),String(name||""),String(text||""),String(label||"")))
      .then(v=>(v&&typeof v==="object")?{name:String(v.name||name||""),ok:v.ok===true}:null)
      .catch(()=>({name:String(name||""),ok:false}));
  }catch(e){ return Promise.resolve({name:String(name||""),ok:false}); }
}
/* A file somebody double-clicked that this launch could not open, {name,why} once and then null:
   the host forgets it as it answers, so a reload does not say it twice. */
function eOpenedRefused(){
  const h=eHost(), r=h && h.openedRefused;
  return (r && typeof r==="object" && r.name) ? {name:String(r.name),why:String(r.why||"")} : null;
}

/* The band's height, published for the one rule that needs it: under a backdrop the header's
   opaque surface starts where the band ends, and the band's height is the row's, which changes
   with the shed ladder and with zoom. Measured rather than declared, so the two cannot drift. */
let eBandRO=null;
function syncBandHeight(){
  const row=$(".row"); if(!row) return;
  const h=Math.round(row.getBoundingClientRect().height);
  if(h>0) document.documentElement.style.setProperty("--band-h",h+"px");
}

/* THE BAND'S SCRIM FOLLOWS THE DESK'S ACCENT, and the brand cobalt is where it lands whenever
   the answer is anything else. A custom property rather than a class: what changes is one colour
   and it arrives as a value, so the sheet keeps its light and dark treatment untouched. */
/* WHICH WAY AN ACCENTED BAND FACES, decided the way Windows decides its caption colour rather
   than by eye: the accent as the eye meets it, at 62 per cent over a mid ground because the
   material behind the window cannot be known, then dark ink above 0.199 relative luminance,
   which is where dark ink's contrast on that ground crosses white's. Solved once, not tuned. */
function eBandPale(hex){
  const n=parseInt(String(hex).slice(1),16);
  const lin=c=>{ const v=(c*.62+128*.38)/255; return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4); };
  return .2126*lin((n>>16)&255)+.7152*lin((n>>8)&255)+.0722*lin(n&255)>.199;
}
function eSetAccent(hex){
  const root=document.documentElement, ok=/^#[0-9a-f]{6}$/i.test(String(hex||""));
  if(ok) root.style.setProperty("--band-accent",String(hex));
  else root.style.removeProperty("--band-accent");
  /* Both classes come off without an accent: the theme answers it in the sheet. */
  const pale=ok&&eBandPale(hex);
  document.body.classList.toggle("e-band-pale",pale);
  document.body.classList.toggle("e-band-deep",ok&&!pale);
}

function answerStats(req){
  const h=eHost();
  if(!h || typeof h.writeStats!=="function") return;
  const cat=storedCatalog();
  const doc=statsDoc(pack,{
    engine:E_VERSION,
    period:{from:req&&req.from,to:req&&req.to},
    catalog:cat&&cat.id?{id:cat.id,rev:cat.rev}:null
  });
  Promise.resolve(h.writeStats(JSON.stringify(doc))).then(r=>{
    if(r&&r.ok&&r.syncMs) lsSet("eLastSync",String(r.syncMs));
  }).catch(()=>{});
}

function wireHost(){
  const h=eHost(); if(!h) return;
  document.body.classList.add("e-host");
  if(typeof h.onStatsAsk==="function") h.onStatsAsk(answerStats);
  if(h.backdrop) document.body.classList.add("e-backdrop");
  if(h.platform) document.body.classList.add("e-"+String(h.platform).replace(/[^a-z0-9]/gi,""));
  eSetMaximized(!!h.maximized);
  /* A double-click on the band maximises without a line of code here, and a DOM listener could
     not do it anyway: a draggable region swallows click and dblclick (Electron 1354, 37789).
     So the glyph follows the window rather than the button, and the window is what is asked. */
  if(typeof h.onMaximized==="function") h.onMaximized(eSetMaximized);
  eSetAccent(h.accent);
  if(typeof h.onAccent==="function") h.onAccent(eSetAccent);
  const min=$("#winMin"), max=$("#winMax"), close=$("#winClose");
  if(min) min.onclick=()=>{ try{ h.minimize(); }catch(e){} };
  if(max) max.onclick=()=>{ try{ h.maximize(); }catch(e){} };
  if(close) close.onclick=()=>{ try{ h.close(); }catch(e){} };
  if(h.backdrop){
    syncBandHeight();
    try{
      eBandRO=new ResizeObserver(syncBandHeight);
      const row=$(".row"); if(row) eBandRO.observe(row);
    }catch(e){ addEventListener("resize",syncBandHeight,{passive:true}); }
  }
}

function eSetMaximized(on){
  document.body.classList.toggle("e-max",!!on);
  const max=$("#winMax"); if(!max) return;
  const label=t(on?"Restore":"Maximise");
  max.title=label; max.setAttribute("aria-label",label);
}

export {
  E_CATALOG_FOLDER_KEY,
  E_CATALOG_SCRIPT,
  eCatalogFile,
  eCatalogFolder,
  eCatalogFolderShort,
  eCatalogFiles,
  eChooseCatalogFolder,
  eLoadedCatalogFile,
  eCatalogIn,
  eCatalogMtime,
  eHasCatalogPicker,
  eHasCatalogSaver,
  eHost,
  eOpenCatalogFolder,
  eOpenedWith,
  eOpenedRefused,
  ePickCatalogFile,
  ePickCatalogFolder,
  eReadCatalogFile,
  eSaveCatalogFile,
  wireHost,
  eSetAccent,
  eSetMaximized,
  syncBandHeight
};
