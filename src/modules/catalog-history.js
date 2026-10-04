/* THE DESK'S EARLIER VERSIONS OF ITS CATALOGS, which the host keeps and this lists, one file at a time. Every version
   opens on this desk through the offer every route ends in; one the host says may go back is put back in the catalog
   folder, with an Undo. */
import { eHost, eCatalogFolderShort } from "./host.js";
import { openDialog } from "./dialog.js";
import { t, toast, toastRefusal, offerUndo, fileStamp, catalogCountsLine } from "./ui-lang.js";
import { esc } from "./esc.js";
import { hooks } from "./hooks.js";
import { parseCatalogFile, catalogVersionLabel, E_CATALOG_KEY } from "./catalog.js";
import { activateCatalog } from "./catalog-file.js";
import { eOfferCatalogDialog } from "./catalog-offer.js";
import { lsSet } from "./storage.js";
import { ICON_LOAD } from "./icons.js";

function historyHost(){
  const h=eHost();
  return h && typeof h.historyList==="function" && typeof h.historyRead==="function" && typeof h.historyPut==="function" ? h : null;
}
/* The Library's door to this view, which only a host has: a browser keeps no history. */
function eHasHistory(){ return !!historyHost(); }
/* One group per file, the file seen most recently first, and in each its versions newest first. */
function historyGroups(list){
  const by=new Map();
  (Array.isArray(list)?list:[]).forEach(v=>{
    if(!v || typeof v.path!=="string" || typeof v.sha!=="string") return;
    if(!by.has(v.path)) by.set(v.path,[]);
    by.get(v.path).push(v);
  });
  const newest=(a,b)=>(+b.first||0)-(+a.first||0) || (a.sha<b.sha?-1:a.sha>b.sha?1:0);
  const groups=Array.from(by.values()).map(vs=>vs.sort(newest));
  return groups.sort((a,b)=>newest(a[0],b[0]) || (a[0].path<b[0].path?-1:1));
}
/* What a row offers: every version opens, and only one the host may put back, never the one its file holds now. */
function historyActs(v){ return v && v.put===true && !v.current ? ["open","put"] : ["open"]; }
/* This desk's own file is named for the catalog it grew from, without the id's tail the file name carries. */
function historyFileName(g){
  const v=g[0], name=String(v.name||"");
  if(!name) return t("Unnamed catalog");
  return v.place==="own" ? name.replace(/-[0-9a-f]{8}(\.ec)$/i,"$1") : name;
}
function historyHeadHtml(g){
  const v=g[0];
  const where=v.place==="own" ? '<small>'+esc(t("This desk's own file"))+'</small>'
    : v.place==="other" && v.dir ? '<small title="'+esc(v.dir)+'">'+esc(eCatalogFolderShort(v.dir))+'</small>' : '';
  return '<div class="eh-head"><b data-i18n-skip>'+esc(historyFileName(g))+'</b>'+where+'</div>';
}
function historyRowHtml(v,key){
  const meta=[catalogVersionLabel(v.date),
    +v.cards>=0 ? catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",+v.cards,+v.macros,+v.intents,+v.cats) : ""]
    .filter(Boolean).map(esc).join(" · ");
  const acts=historyActs(v), open=t("Open this version");
  return '<div class="ec-row'+(v.current?" is-current":"")+'">'
    +'<span class="ec-name"><b>'+esc(fileStamp(v.first))+'</b>'+(meta?'<small class="ec-meta">'+meta+'</small>':'')+'</span>'
    +(v.current?'<span class="ec-tag">'+esc(t("Current"))+'</span>':'')
    +(v.wrote && v.place!=="own"?'<span class="ec-tag">'+esc(t("Written by this desk"))+'</span>':'')
    +(acts.indexOf("put")>-1?'<button type="button" class="btn" data-eh-put="'+key+'" title="'
      +esc(t("Put this version back in the catalog folder, in place of the file there now"))+'">'+esc(t("Put back"))+'</button>':'')
    +'<button type="button" class="btn icbtn ec-act" data-eh-open="'+key+'" title="'+esc(open)+'" aria-label="'+esc(open)+'">'
      +ICON_LOAD+'</button>'
    +'</div>';
}
function historyBodyHtml(groups){
  if(!groups.length)
    return '<div class="ec-list"><div class="ec-row ec-empty">'
      +esc(t("Earlier versions of each catalog this desk reads or writes stay here for 30 days."))+'</div></div>';
  let n=0;
  return groups.map(g=>historyHeadHtml(g)+'<div class="ec-list">'+g.map(v=>historyRowHtml(v,n++)).join("")+'</div>').join("");
}
/* A version opens as a file somebody pointed at does: asked about over a loaded catalog, at once on an empty desk. It names
   no file in the catalog folder, since the folder's file may since have changed. */
function historyOpen(v){
  const h=historyHost(); if(!h) return;
  Promise.resolve(h.historyRead(v.sha,v.path)).then(got=>{
    const name=String((got&&got.name)||v.name||"");
    if(!got || !got.text){ toastRefusal(t("{FILE} could not be read.").split("{FILE}").join(name)); return; }
    let c=null;
    try{ c=parseCatalogFile(String(got.text)); }
    catch(e){ toastRefusal(t("{FILE} is not a catalog Etiuda can read.").split("{FILE}").join(name)); return; }
    const shown=eOfferCatalogDialog(c,{ file:name, force:true, asked:true, direct:true,
      foundHtml:esc(t("{FILE} as it was on {WHEN}, kept on this desk.")).split("{FILE}").join('<code>'+esc(name)+'</code>')
        .split("{WHEN}").join(esc(fileStamp(v.first))),
      accept:sig=>{ lsSet(E_CATALOG_KEY,sig); return activateCatalog(c,{from:name}); } });
    if(!shown) toast(t("That file matches the catalog you already have."));
  }).catch(()=>{});
}
function historyPutBack(v){
  const h=historyHost(); if(!h) return;
  const refuse=()=>toastRefusal(t("{FILE} could not be put back in the catalog folder.").split("{FILE}").join(String(v.name||"")));
  Promise.resolve(h.historyPut(v.sha,v.path)).then(r=>{
    if(!r || !r.ok){ refuse(); return; }
    if(document.getElementById("ehView")) openHistory();
    if(r.replaced) offerUndo("Version put back",()=>Promise.resolve(h.historyPut(r.replaced,v.path)).then(u=>{
      if(!u || !u.ok) refuse();
      else if(document.getElementById("ehView")) openHistory();
    }));
  }).catch(refuse);
}
function openHistory(){
  const h=historyHost(); if(!h) return;
  Promise.resolve(h.historyList()).then(list=>{
    const groups=historyGroups(list), flat=[].concat.apply([],groups);
    openDialog({
      title:"Earlier versions",
      back:()=>hooks.openManage(),
      body:'<div id="ehView">'+historyBodyHtml(groups)+'</div>',
      actions:'<button type="button" class="btn" id="ehClose">'+esc(t("Close"))+'</button>',
      wire:()=>{
        const box=document.getElementById("ehView");
        box.querySelectorAll("[data-eh-open]").forEach(b=>{ b.onclick=()=>historyOpen(flat[+b.getAttribute("data-eh-open")]); });
        box.querySelectorAll("[data-eh-put]").forEach(b=>{ b.onclick=()=>historyPutBack(flat[+b.getAttribute("data-eh-put")]); });
        document.getElementById("ehClose").onclick=()=>hooks.openManage();
      }
    });
  }).catch(()=>{});
}

export {
  eHasHistory,
  historyGroups,
  historyActs,
  openHistory
};
