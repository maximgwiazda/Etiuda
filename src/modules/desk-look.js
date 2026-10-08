/* A COLLEAGUE'S DESK FILE, as the Library shows it: the desk's name and key, the edition it is compared with, and the
   Look behind its eye, which is the edition panel told it is a desk. A changed card of that desk's is taken into this
   desk's own edits at once, since no load follows a look. */
import { editionChanges, editionFieldKeys } from "./edition-changes.js";
import { openEditionPanel, editionCountWords } from "./edition-panel.js";
import { parseCatalogFile, storedCatalog } from "./catalog.js";
import { eReadCatalogFile } from "./host.js";
import { pack, savePack } from "./pack.js";
import { baseCard, cardTitle, overrideAgainstBase } from "./card-model.js";
import { leadKeyText } from "./team-join.js";
import { hooks } from "./hooks.js";
import { t, toast, toastRefusal, uiLang } from "./ui-lang.js";
import { CATS, catalogLangs } from "./content-model.js";
import { v2CatKey } from "./catalog-v2.js";
import { catIconSvg } from "./cat-identity.js";
import { BASE_M } from "./pack.js";
import { catOrder, setCatOrder } from "./app-state.js";
import { lySet } from "./storage.js";
import { uid } from "./ids.js";
import { esc } from "./esc.js";
import { ICON_PLUS } from "./icons.js";
import { pills } from "./dom.js";

/* The desk's name as the agent gave it in Settings, else a colleague's. */
function deskName(f){
  const n=String(f && f.desk && f.desk.name || "").trim();
  return n ? t("{NAME}'s desk").split("{NAME}").join(n) : t("A colleague's desk");
}
// The 16 hex of the desk's id in four groups, as a lead's key is shown for comparing.
function deskKey(f){ return leadKeyText(String(f.desk.id).slice(2)); }
/* WHICH EDITION A COLLEAGUE'S FILE IS COMPARED WITH: the one it grew from, as the catalog in use or as a file in the
   folder; else the catalog in use where it is the same catalog; else the newest file of it. `files` is the folder's
   own rows, newest first. Only a comparison with the catalog in use can be taken into this desk's edits. */
function deskBase(f,files,held){
  const g=f && f.grew;
  if(!g) return null;
  const inUse=!!held && String(held.id||"")===g.id;
  if(inUse && held.pin===g.sha) return {held:true};
  const exact=files.find(x=>x.id===g.id && x.sha===g.sha);
  if(exact) return {file:exact};
  if(inUse) return {held:true};
  const any=files.find(x=>x.id===g.id);
  return any ? {file:any} : null;
}
// Each file read and parsed once per date: the rows' lines and the Look ask for the same two.
const deskReads=new Map();
function readParsed(name,desk,mtime){
  const at=(desk||"")+"/"+name+"|"+mtime;
  if(!deskReads.has(at)) deskReads.set(at, eReadCatalogFile(name,desk).then(got=>{
    try{ return got && got.text ? parseCatalogFile(got.text) : null; }catch(e){ return null; }
  }).catch(()=>null));
  return deskReads.get(at);
}
/* Both sides, or null where either would not read. A file that grew from nothing here is compared with no cards. */
function deskSides(f,base){
  const team=!base ? Promise.resolve(null) : base.held ? Promise.resolve(storedCatalog()) : readParsed(base.file.name,"",base.file.mtime);
  return Promise.all([readParsed(f.name,f.desk.id,f.mtime),team]).then(([hers,team])=>{
    if(!hers || (base && !team)) return null;
    return {hers:hers, team:team||{cards:[], langs:hers.langs}};
  });
}
/* What that desk changed against the edition it is compared with, as the offer counts an edition's changes. */
function deskChangeWords(f,base){
  return deskSides(f,base).then(s=>s ? editionCountWords(editionChanges(s.team,s.hers,base&&base.held?pack:null).counts) : null);
}
const cardIn=(c,id)=>((c&&c.cards)||[]).find(m=>String(m.id)===id)||null;
const deskText=v=>String(v==null?"":v);
// The card as this desk shows it: the catalog's, with this desk's own edit over it.
function deskCardNow(id){ const b=baseCard(id); return b ? Object.assign({},b,(pack.overrides||{})[id]||{}) : null; }
function deskTaken(it,hers){
  const m=deskCardNow(it.id), h=cardIn(hers,it.id);
  return !!m && !!h && it.fields.every(f=>deskText(m[f.key])===deskText(h[f.key]));
}
/* THE AGENT'S EDIT OF A CARD AS IT STOOD BEFORE A TAKE, with the edit the take made, kept across openings of Look for as
   long as the desk stays on this catalog: restartDesk forgets it. A take over an edit made since is a new first take. */
const lookEdits=new Map();
function forgetLookEdits(){ lookEdits.clear(); lookCats.clear(); }
/* TAKEN, the fields where that desk's text differs become this desk's own edit of the card, nothing else of the card;
   given back, the edit returns to what it was before the take, or to the team's text. */
function deskToggle(it,hers){
  const base=baseCard(it.id), now=deskCardNow(it.id), h=cardIn(hers,it.id);
  if(!base || !now || !h || it.kind!=="changed") return false;
  if(!pack.overrides) pack.overrides={};
  const on=!deskTaken(it,hers), was=pack.overrides[it.id], held=lookEdits.get(it.id);
  if(on && (!held || held.after!==JSON.stringify(was||null))) lookEdits.set(it.id, {before:was ? JSON.parse(JSON.stringify(was)) : null, after:""});
  const set=from=>{ const moved={}; it.fields.forEach(f=>{ moved[f.key]=deskText(from[f.key]); }); return overrideAgainstBase(base,Object.assign(now,moved)); };
  const o=on ? set(h) : held ? held.before : set(base);
  if(on) lookEdits.get(it.id).after=JSON.stringify(o||null); else lookEdits.delete(it.id);
  if(o && Object.keys(o).length) pack.overrides[it.id]=o; else delete pack.overrides[it.id];
  savePack();
  hooks.rebuildCards();
  return true;
}
/* A COLLEAGUE'S NEW CARD, TAKEN, is this desk's own card in the category the agent puts it in: her words, note, flags and
   keywords, and the replies after it that live here; her intents stay behind, since they name her catalog's. Given
   back, the card goes, and so does a category Look added once nothing else stands in it, which is kept as lookEdits is. */
const lookCats=new Set();
const TAKE_LEFT=["id","c","intents","next","nextWas","retired"];
/* Taken is this desk holding an own card of her words, every text field in every language either holds; one the
   agent has since rewritten is the agent's, and hers can be taken again. */
function deskNewTaken(it,hers){
  const h=cardIn(hers,it.id);
  if(!h || it.kind!=="new") return null;
  const keys=editionFieldKeys(hers,hers).map(k=>k.key);
  const m=(pack.custom||[]).find(o=>o && keys.every(k=>deskText(o[k])===deskText(h[k])));
  return m ? {own:m.id, cat:m.c} : null;
}
// Her category: its key, its names in the catalog's first language and in Polish, and the one the interface reads.
function herCat(hers,c){
  const prim=catalogLangs(hers)[0], first=String(((hers&&hers.categories)||{})[c]||c);
  const pl=prim==="pl" ? first : String(((hers&&hers[v2CatKey("pl",prim)])||{})[c]||"");
  return {key:c, first:first, pl:pl, name:(uiLang()==="pl" && pl) || first};
}
// Her category as this desk has it, by her key or by a name of hers, as ensureCustomCat matches one; "" where it lacks it.
function herCatHere(hc){
  if(CATS[hc.key]) return hc.key;
  const names=[hc.first,hc.pl].filter(Boolean).map(n=>n.toLowerCase());
  return Object.keys(CATS).find(k=>names.indexOf(String(CATS[k]).toLowerCase())>-1)||"";
}
const deskCatName=k=>String(CATS[k]||k);
/** Takes her new card into `to`, one of this desk's categories, or into hers with `to` null, added where this desk
 *  lacks it. Answers whether it was taken. */
function deskTakeNew(it,hers,to){
  const h=cardIn(hers,it.id);
  if(!h || it.kind!=="new" || deskNewTaken(it,hers)) return false;
  let key=to;
  if(to==null){
    const hc=herCat(hers,h.c);
    key=herCatHere(hc);
    if(!key){
      key=hooks.ensureCustomCat(hc.first);
      lookCats.add(key);
      const icon=((hers.icons||{})[h.c]), hue=((hers.colors||{})[h.c]);
      if(hc.pl && hc.pl!==hc.first) pack.catLabelsPl[key]=hc.pl;
      if(icon) pack.catIcons[key]=icon;
      if(hue!=null) pack.catColors[key]=hue;
    }
  }
  if(!key || !CATS[key]) return false;
  const own={}, live=new Set(BASE_M.map(m=>String(m.id)).concat((pack.custom||[]).map(m=>String(m&&m.id))));
  Object.keys(h).forEach(k=>{ if(k.charAt(0)!=="_" && TAKE_LEFT.indexOf(k)<0) own[k]=h[k]; });
  own.id=uid("u:"); own.c=key;
  const next=(Array.isArray(h.next)?h.next:[]).filter(e=>e && live.has(String(e.to)));
  if(next.length) own.next=next;
  if(!Array.isArray(pack.custom)) pack.custom=[];
  pack.custom.push(own);
  savePack();
  hooks.rebuildCards();
  return true;
}
function deskGiveNew(it,hers){
  const h=deskNewTaken(it,hers);
  if(!h) return false;
  pack.custom=(pack.custom||[]).filter(m=>!(m && m.id===h.own));
  const k=h.cat;
  if(lookCats.has(k) && !pack.custom.some(m=>m && m.c===k) && !BASE_M.some(m=>m.c===k) && pack.customCats[k]!=null){
    ["customCats","catLabels","catLabelsPl","catIcons","catColors"].forEach(f=>{ if(pack[f]) delete pack[f][k]; });
    lookCats.delete(k);
    setCatOrder(catOrder.filter(x=>x!==k));
    lySet("CatOrder",JSON.stringify(catOrder));
  }
  savePack();
  hooks.rebuildCards();
  return true;
}
function deskNewSub(it,hers){
  const h=deskNewTaken(it,hers);
  return h ? t("Now in {CAT}").split("{CAT}").join(deskCatName(h.cat)) : "";
}

/* WHERE A NEW CARD GOES, under its text: a chip to drag onto a category of this desk's in the bar, or onto + for hers,
   and the chip pressed is the same choice as a list for the keyboard. Taken, the place it went and the way back. */
let lkPick=null, lkDrag=null, lkDragged=false;
function lkOptions(hers,it,q){
  const h=cardIn(hers,it.id), hc=herCat(hers,h?h.c:""), want=String(q||"").trim().toLowerCase();
  const fits=n=>!want || String(n).toLowerCase().indexOf(want)>-1;
  const mine=catOrder.filter(k=>CATS[k] && fits(CATS[k])).map(k=>({to:k, name:deskCatName(k)}));
  return herCatHere(hc) ? mine : mine.concat(fits(hc.name) ? [{to:"", name:hc.name, add:true}] : []);
}
function deskPlaceHtml(it,hers){
  const h=deskNewTaken(it,hers);
  if(h) return '<div class="lk-place lk-took"><span class="lk-in">'+catIconSvg(h.cat,"cat-ic")+esc(deskNewSub(it,hers))+'</span>'
    +'<button type="button" class="btn" data-lk-back="1">'+esc(t("Give it back"))+'</button></div>';
  const m=cardIn(hers,it.id), tip=t("Drag it onto one of your categories, or press Enter to choose one");
  const open=!!lkPick && lkPick.id===it.id;
  let pick="";
  if(open){
    const opts=lkOptions(hers,it,lkPick.q);
    lkPick.at=Math.max(0,Math.min(opts.length-1,lkPick.at|0));
    pick='<div class="lk-pick"><input type="text" id="lkFind" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list"'
      +' aria-expanded="true" aria-controls="lkHits" aria-label="'+esc(t("Find a category"))+'" placeholder="'+esc(t("a category's name"))+'"'
      +(opts.length ? ' aria-activedescendant="lkHit'+lkPick.at+'"' : "")+' value="'+esc(lkPick.q||"")+'">'
      +'<div class="nx-hits lk-hits" id="lkHits" role="listbox">'+opts.map((o,i)=>'<div class="nx-hit'+(i===lkPick.at?" on":"")+'" role="option" id="lkHit'+i
        +'" aria-selected="'+(i===lkPick.at)+'" data-lk-to="'+esc(o.to)+'">'+(o.add ? ICON_PLUS : catIconSvg(o.to,"cat-ic"))
        +'<span>'+esc(o.add ? t("Add {CAT} as a category of this desk").split("{CAT}").join(o.name) : o.name)+'</span></div>').join("")+'</div></div>';
  }
  return '<div class="lk-place"><button type="button" class="lk-chip" data-lk-chip="1" title="'+esc(tip)+'" aria-label="'+esc(tip)+'"'
    +' aria-expanded="'+open+'"><span class="nx-grip" aria-hidden="true"></span><span class="lk-t">'+esc(cardTitle(m||{})||it.id)+'</span></button>'+pick+'</div>';
}
// The bar's drop targets: a category's pill, and + for hers.
function lkTargetAt(x,y){
  const u=document.elementFromPoint(x,y), p=u && u.closest ? u.closest(".pill-add, .pill[data-k]") : null;
  if(!p || !pills || !pills.contains(p)) return null;
  return p.classList.contains("pill-add") ? {el:p, to:null} : p.dataset.k ? {el:p, to:p.dataset.k} : null;
}
function lkDragEnd(){
  const d=lkDrag; lkDrag=null;
  if(!d) return null;
  document.body.classList.remove("e-take-drag");
  if(d.ghost) d.ghost.remove();
  if(d.hint) d.hint.remove();
  if(d.over) d.over.el.classList.remove("lk-over");
  removeEventListener("keydown", d.key, true);
  return d;
}
function lkDragStart(d,hers,it){
  const h=cardIn(hers,it.id), hc=herCat(hers,h?h.c:"");
  document.body.classList.add("e-take-drag");
  d.ghost=document.createElement("div");
  d.ghost.className="lk-ghost";
  d.ghost.innerHTML='<span class="nx-grip" aria-hidden="true"></span><span>'+esc(cardTitle(h||{})||it.id)+'</span>';
  d.hint=document.createElement("div");
  d.hint.className="lk-hint";
  d.hint.setAttribute("data-i18n-skip","");
  d.hint.textContent=herCatHere(hc) ? t("Drop it on one of your categories.")
    : t("Drop it on one of your categories, or on + to add {CAT}.").split("{CAT}").join(hc.name);
  document.body.appendChild(d.ghost);
  document.body.appendChild(d.hint);
  // Under the bar as it opens to every line, which its measured open height says before the opening has run.
  const slot=document.getElementById("pillsSlot"), r=pills ? pills.getBoundingClientRect() : null;
  const full=slot ? parseFloat(getComputedStyle(slot).getPropertyValue("--pills-full")) : NaN;
  if(r) d.hint.style.top=Math.round(r.top+Math.max(r.height, full||0)+22)+"px";
  // Escape while dragging puts the card down where it was, and leaves the panel open.
  d.key=e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); lkDragEnd(); } };
  addEventListener("keydown", d.key, true);
}
function wireDeskPlace(pane,it,hers,done){
  const chip=pane.querySelector("[data-lk-chip]"), back=pane.querySelector("[data-lk-back]"), q=pane.querySelector("#lkFind");
  const take=to=>{ lkPick=null; if(deskTakeNew(it,hers,to)) done(); };
  if(back) back.onclick=()=>{ deskGiveNew(it,hers); done(); };
  if(!chip) return;
  const pick=()=>{ if(!lkPick || lkPick.id!==it.id) lkPick={id:it.id, q:"", at:0}; done("#lkFind"); };
  chip.onclick=()=>{ if(lkDragged){ lkDragged=false; return; } pick(); };
  // Enter, Space and the down arrow open the list, the keyboard's way to what the drag does.
  chip.addEventListener("keydown", e=>{
    if(e.key!=="Enter" && e.key!==" " && e.key!=="ArrowDown") return;
    e.preventDefault(); e.stopPropagation();
    pick();
  });
  chip.addEventListener("pointerdown", e=>{
    if(e.button!==0 || e.pointerType==="touch") return;
    lkDragged=false;
    lkDrag={x:e.clientX, y:e.clientY, moved:false, over:null};
    try{ chip.setPointerCapture(e.pointerId); }catch(_){}
  });
  chip.addEventListener("pointermove", e=>{
    const d=lkDrag;
    if(!d) return;
    if(!d.moved){ if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)<6) return; d.moved=true; lkDragStart(d,hers,it); }
    d.ghost.style.transform="translate("+Math.round(e.clientX+10)+"px,"+Math.round(e.clientY-14)+"px)";
    const o=lkTargetAt(e.clientX,e.clientY);
    if((o&&o.el)!==(d.over&&d.over.el)){ if(d.over) d.over.el.classList.remove("lk-over"); if(o) o.el.classList.add("lk-over"); }
    d.over=o;
  });
  const up=e=>{
    const d=lkDragEnd();
    if(!d || !d.moved) return;
    // The click this gesture ends with is not a press of the chip; it lands before a timer can run.
    lkDragged=true; setTimeout(()=>{ lkDragged=false; },0);
    if(e && e.type==="pointerup" && d.over) take(d.over.to);
  };
  ["pointerup","pointercancel","lostpointercapture"].forEach(k=>chip.addEventListener(k, up));
  if(!q) return;
  q.addEventListener("input", ()=>{ lkPick.q=q.value; lkPick.at=0; done("#lkFind"); });
  q.addEventListener("keydown", e=>{
    const opts=lkOptions(hers,it,lkPick.q);
    if(e.key==="ArrowDown" || e.key==="ArrowUp"){
      e.preventDefault(); e.stopPropagation();
      if(opts.length){ lkPick.at=(lkPick.at+(e.key==="ArrowDown" ? 1 : opts.length-1))%opts.length; done("#lkFind"); }
    } else if(e.key==="Enter"){
      e.preventDefault(); e.stopPropagation();
      const o=opts[lkPick.at];
      if(o) take(o.add ? null : o.to);
    } else if(e.key==="Escape"){
      e.preventDefault(); e.stopPropagation();
      lkPick=null; done("[data-lk-chip]");
    }
  });
  pane.querySelectorAll("[data-lk-to]").forEach(o=>{
    o.addEventListener("pointerdown", e=>e.preventDefault());
    o.onclick=()=>{ const to=o.getAttribute("data-lk-to"); take(to ? to : null); };
  });
}

/** Look at a colleague's file: `f` its listing row, `base` from deskBase, `name` the catalog it is compared with, and
 *  the panel's two ways out. Resolves to whether the panel stood. */
function openDeskLook(f,base,name,work,back){
  return deskSides(f,base).then(s=>{
    if(!s){ toastRefusal(t("{FILE} could not be read.").split("{FILE}").join(String(f.name||""))); return false; }
    const inUse=!!(base && base.held), changes=editionChanges(s.team,s.hers,inUse?pack:null);
    if(!changes.items.length){ toast(t("That desk's cards match the team's edition.")); return false; }
    const who=deskName(f);
    lkPick=null;
    openEditionPanel({c:s.hers, held:s.team, changes:changes, version:"", name:name, keep:back, load:work, back:back, taken:()=>{},
      desk:{title:who, was:t("In the team's edition"), now:t("At {DESK}").split("{DESK}").join(who),
        keep:t("Back to the Library"), load:t("Work from this file").split("{DESK}").join(who),
        take:inUse ? t("Take this text").split("{DESK}").join(who) : "",
        taken:it=>deskTaken(it,s.hers), toggle:it=>deskToggle(it,s.hers),
        place:inUse ? it=>deskPlaceHtml(it,s.hers) : null, wirePlace:inUse ? (pane,it,done)=>wireDeskPlace(pane,it,s.hers,done) : null,
        sub:it=>(it.kind==="changed" && inUse && deskTaken(it,s.hers)) ? t("Now in your edits") : (it.kind==="new" && inUse) ? deskNewSub(it,s.hers)
          : it.own ? t("you have your own version") : ""}});
    return true;
  });
}

export {
  deskName,
  deskKey,
  deskBase,
  deskChangeWords,
  forgetLookEdits,
  deskTakeNew,
  deskGiveNew,
  openDeskLook
};
