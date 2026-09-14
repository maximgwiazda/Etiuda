import { $ } from "./dom.js";
import { t } from "./ui-lang.js";
import { lsGet } from "./storage.js";

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
/* The file this load is running, and the folder it was found in - which is not always the folder
   above: a catalog beside the installation still loads when the folder holds none. */
function eCatalogFile(){ const h=eHost(); return h?String(h.catalogFile||""):""; }
function eCatalogIn(){ const h=eHost(); return h?String(h.catalogIn||""):""; }
/* Resolves to the chosen folder, or "" for a dialog the person closed. The caption is passed in
   already translated: the shell has no t(). */
function ePickCatalogFolder(title){
  const h=eHost();
  if(!h || typeof h.pickCatalogFolder!=="function") return Promise.resolve("");
  try{ return Promise.resolve(h.pickCatalogFolder(String(title||""))).then(v=>String(v||"")); }
  catch(e){ return Promise.resolve(""); }
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

function wireHost(){
  const h=eHost(); if(!h) return;
  document.body.classList.add("e-host");
  if(h.backdrop) document.body.classList.add("e-backdrop");
  if(h.platform) document.body.classList.add("e-"+String(h.platform).replace(/[^a-z0-9]/gi,""));
  eSetMaximized(!!h.maximized);
  /* A double-click on the band maximises without a line of code here, and a DOM listener could
     not do it anyway: a draggable region swallows click and dblclick (Electron 1354, 37789).
     So the glyph follows the window rather than the button, and the window is what is asked. */
  if(typeof h.onMaximized==="function") h.onMaximized(eSetMaximized);
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
  eCatalogIn,
  eHost,
  ePickCatalogFolder,
  wireHost,
  eSetMaximized,
  syncBandHeight
};
