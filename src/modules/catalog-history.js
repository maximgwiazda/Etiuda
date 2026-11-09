/* THE DESK'S EARLIER VERSIONS OF ITS CATALOGS, which the host keeps and this lists, one file at a time. Every version
   opens on this desk through the offer every route ends in; one the host says may go back is put back in the catalog
   folder, with an Undo. */
import { eHost, eCatalogFolderShort } from "./host.js";
import { t, toastRefusal, offerUndo, fileStamp, catalogCountsLine } from "./ui-lang.js";
import { esc } from "./esc.js";
import { hooks } from "./hooks.js";
import { parseCatalogFile, eUnreadableLine, fileReadCode, fileReadLine, editionNameOf, editionLabel, E_CATALOG_KEY } from "./catalog.js";
import { activateCatalog } from "./catalog-file.js";
import { eOfferCatalogDialog, toastIfSameCatalog } from "./catalog-offer.js";
import { lsSet } from "./storage.js";
import { ICON_LOAD } from "./icons.js";
import { screenOn } from "./screen-tabs.js";

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
  const ed=editionNameOf({version:v.date, rev:v.rev});
  const meta=[(ed.r!=null || ed.e) ? editionLabel(ed) : "",
    +v.cards>=0 ? catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",+v.cards,+v.macros,+v.intents,+v.cats) : ""]
    .filter(Boolean).map(esc).join(" · ");
  const acts=historyActs(v), open=t("Open this copy");
  return '<div class="ec-row'+(v.current?" is-current":"")+'">'
    +'<span class="ec-name"><b>'+esc(fileStamp(v.first))+'</b>'+(meta?'<small class="ec-meta">'+meta+'</small>':'')+'</span>'
    +(v.current?'<span class="ec-tag">'+esc(t("Current"))+'</span>':'')
    +(v.wrote && v.place!=="own"?'<span class="ec-tag">'+esc(t("Saved on this desk"))+'</span>':'')
    +(acts.indexOf("put")>-1?'<button type="button" class="btn" data-eh-put="'+key+'" title="'
      +esc(t("Put this version back in the catalog folder, in place of the file there now"))+'">'+esc(t("Put back"))+'</button>':'')
    +'<button type="button" class="btn icbtn ec-act" data-eh-open="'+key+'" title="'+esc(open)+'" aria-label="'+esc(open)+'">'
      +ICON_LOAD+'</button>'
    +'</div>';
}
function historyBodyHtml(groups){
  if(!groups.length)
    return '<div class="ec-list"><div class="ec-row ec-empty">'
      +esc(t("Each catalog this desk opens or saves leaves a copy here, kept for 30 days."))+'</div></div>';
  let n=0;
  return groups.map(g=>historyHeadHtml(g)+'<div class="ec-list">'+g.map(v=>historyRowHtml(v,n++)).join("")+'</div>').join("");
}
/* A version opens as a file somebody pointed at does: asked about over a loaded catalog, at once on an empty desk. It names
   no file in the catalog folder, since the folder's file may since have changed. */
function historyOpen(v){
  const h=historyHost(); if(!h) return;
  Promise.resolve(h.historyRead(v.sha,v.path)).then(got=>{
    const name=String((got&&got.name)||v.name||"");
    if(!got || !got.text){ toastRefusal(fileReadLine(name, fileReadCode(got))); return; }
    let c=null;
    try{ c=parseCatalogFile(String(got.text)); }
    catch(e){ toastRefusal(eUnreadableLine(e,name)); return; }
    const offTeam=!!(got && got.notOnTeam);
    const shown=eOfferCatalogDialog(c,{ file:name, force:true, asked:true, direct:!offTeam, offTeam:offTeam,
      foundHtml:esc(t("{FILE} as it was on {WHEN}, kept on this desk.")).split("{FILE}").join('<code>'+esc(name)+'</code>')
        .split("{WHEN}").join(esc(fileStamp(v.first))),
      accept:sig=>{ hooks.openManage(true); lsSet(E_CATALOG_KEY,sig); return activateCatalog(c,{from:name}); } });
    if(!shown) toastIfSameCatalog(c);
  }).catch(()=>{});
}
function historyPutBack(v){
  const h=historyHost(); if(!h) return;
  const refuse=()=>toastRefusal(t("{FILE} could not be put back in the catalog folder. The version stays here, ready to try again.").split("{FILE}").join(String(v.name||"")));
  Promise.resolve(h.historyPut(v.sha,v.path)).then(r=>{
    if(!r || !r.ok){ refuse(); return; }
    if(document.getElementById("ehView")) openHistory();
    if(r.replaced) offerUndo("Version put back",()=>Promise.resolve(h.historyPut(r.replaced,v.path)).then(u=>{
      if(!u || !u.ok) refuse();
      else if(document.getElementById("ehView")) openHistory();
    }));
  }).catch(refuse);
}
/* EARLIER VERSIONS IS A PAGE OF THE LIBRARY'S TAB, painted into the tab's host, and Back returns to the Library's list.
   A list read after the tab went behind another is dropped, so it never paints over that one. */
function openHistory(host){
  const h=historyHost(); if(!h) return;
  const box=host||document.getElementById("screenHost");
  if(!box) return;
  Promise.resolve(h.historyList()).then(list=>{
    if(box.hidden || (screenOn && screenOn!=="library")) return;
    const groups=historyGroups(list), flat=[].concat.apply([],groups);
    const view=(box.id==="ehView"?box:(box.querySelector&&box.querySelector("#ehView")))||null;
    if(view){
      view.innerHTML=historyBodyHtml(groups);
    } else {
      box.innerHTML='<div class="screen-page lib-screen lib-history" tabindex="-1">'
        +'<div class="screen-head"><h2>'+esc(t("Saved copies"))+'</h2></div>'
        +'<div class="screen-body"><div id="ehView">'+historyBodyHtml(groups)+'</div></div>'
        +'<div class="screen-actions"><button type="button" class="btn primary" id="ehClose">'+esc(t("Back to the Library"))+'</button></div></div>';
    }
    const ehView=document.getElementById("ehView");
    if(ehView){
      ehView.querySelectorAll("[data-eh-open]").forEach(b=>{ b.onclick=()=>historyOpen(flat[+b.getAttribute("data-eh-open")]); });
      ehView.querySelectorAll("[data-eh-put]").forEach(b=>{ b.onclick=()=>historyPutBack(flat[+b.getAttribute("data-eh-put")]); });
    }
    const back=document.getElementById("ehClose");
    if(back) back.onclick=()=>hooks.openManage();
    try{ if(back) back.focus({preventScroll:true}); }catch(e){}
  }).catch(()=>{});
}

export {
  eHasHistory,
  historyGroups,
  historyActs,
  openHistory
};
