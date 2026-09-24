import { BASE_M, BASE_CATS, catalogCardId, pack, rebuildBaseCards, savePack } from "./pack.js";
import { intentIdAt, BASE_STORE } from "./intent-id.js";
import { CONTENT_LANGS, intentFieldKey } from "./content-model.js";
import { uid } from "./ids.js";
import { nsGet, nsSet, ssGet, ssSet, ssDel } from "./storage.js";
import { catalogCountsLine, toast } from "./ui-lang.js";
import { CAT_LABELS_PL } from "./icons.js";

/* WHAT A PERSON MADE OUTLIVES THE CATALOG UNDER IT. A card still there keeps its edit, star, hide
   and place; an edit whose card is gone becomes an own card, carrying all three; a star on a card
   that is gone has nothing left to mark, and the desk is told how many went. */
const ID_LISTS=["favourites","hidden","cardOrder","removed"];
const CARRIED="eCarriedNow";
let bootStars=0, bootKept=0;

function renameCard(from,to){
  const ov=pack.overrides||{};
  if(ov[from]!=null){ if(ov[to]==null) ov[to]=ov[from]; delete ov[from]; }
  ID_LISTS.forEach(n=>{
    if(!Array.isArray(pack[n])) return;
    pack[n]=pack[n].map(x=>x===from?to:x).filter((x,i,a)=>a.indexOf(x)===i);
  });
  ["useCounts","useAt"].forEach(n=>{
    const o=pack[n];
    if(o && o[from]!=null){ if(o[to]==null) o[to]=o[from]; delete o[from]; }
  });
  const d=pack.dayIds, at=Array.isArray(d)?d.indexOf(from):-1;
  if(at>-1 && d.indexOf(to)<0) d[at]=to;
}
/* A 1.16.7 DESK KEYED A CARD "b:" + CATEGORY + ":" + TITLE, and tools/catalog-v2 mints the new id
   from the same two, the category becoming the shelf "t-" + key. So an old key names the one card
   with that exact title on that shelf; where there is not exactly one, nothing is guessed. */
function rekeyOldCards(list,alive){
  const byTitle=Object.create(null);
  list.forEach(m=>{ const k=String((m&&m.t)||"").trim(); (byTitle[k]=byTitle[k]||[]).push(m); });
  const held=new Set(Object.keys(pack.overrides||{}));
  ID_LISTS.forEach(n=>(pack[n]||[]).forEach(id=>held.add(id)));
  let n=0;
  held.forEach(id=>{
    const k=alive.has(id) ? null : /^b:([^:]*):([\s\S]*)$/.exec(String(id));
    if(!k) return;
    const hits=(byTitle[k[2].trim()]||[]).filter(m=>m.c===k[1]||m.c==="t-"+k[1]);
    if(hits.length!==1) return;
    renameCard(id,catalogCardId(hits[0]));
    n++;
  });
  return n;
}
/* The same conversion makes each category key the shelf "t-" + key, so a layer naming the old
   key follows it wherever the new catalog has that shelf and not the key. */
const CAT_MAPS=["catLabels","catLabelsPl","catRoles","catIcons","catColors"];
function rekeyOldShelves(cats){
  const to=k=>(k && !cats[k] && cats["t-"+k]) ? "t-"+k : k;
  let n=0;
  const move=m=>{ if(m && m.c && to(m.c)!==m.c){ m.c=to(m.c); n++; } };
  (pack.custom||[]).forEach(move);
  Object.keys(pack.overrides||{}).forEach(id=>move(pack.overrides[id]));
  CAT_MAPS.forEach(name=>{
    const o=pack[name]||{};
    Object.keys(o).forEach(k=>{
      const k2=to(k);
      if(k2===k) return;
      if(o[k2]==null) o[k2]=o[k];
      delete o[k]; n++;
    });
  });
  if(Array.isArray(pack.removedCats)) pack.removedCats=pack.removedCats.map(to);
  try{
    const order=JSON.parse(nsGet("CatOrder")||"null");
    if(Array.isArray(order) && order.some(k=>to(k)!==k)) nsSet("CatOrder",JSON.stringify(order.map(to)));
  }catch(e){}
  return n;
}
/* A POSITION IN A LINK LIST MEANS WHATEVER SITS THERE IN THE NEXT CATALOG. Positions come from
   the catalog's own cards, and from links saved against one whose requests carry no id (see
   storeIntentIds). Each becomes the request's own id; failing that, the one request of the next
   catalog with its exact clause in the primary language, as rekeyOldCards finds a card, and
   none where either catalog has that clause twice. What finds none is kept aside, never dropped. */
const LINKS_ASIDE="LinksAside";
function linkFinder(c){
  const key=intentFieldKey("clause",CONTENT_LANGS[0]);
  const words=a=>(Array.isArray(a)?a:[]).map(v=>String(v==null?"":v).trim());
  const was=words(BASE_STORE[key]), now=words(c&&c.intents&&c.intents[key]);
  const ids=(c&&Array.isArray(c.intentIds))?c.intentIds:[];
  const once=(a,v)=>a.indexOf(v)===a.lastIndexOf(v);
  return i=>{
    const v=was[i]||"", at=v?now.indexOf(v):-1;
    return (at>-1 && once(was,v) && once(now,v) && ids[at]) ? "t:"+String(ids[at]) : "";
  };
}
function pinLinks(l,find,lost){
  if(!Array.isArray(l)) return l;
  const out=[];
  l.forEach(x=>{
    const id=(typeof x==="number")?intentIdAt(x):String(x);
    const pos=/^i:(\d+)$/.exec(id);
    const to=pos ? find(+pos[1]) : (/^ui:\d+$/.test(id) ? "" : id);
    if(to) out.push(to);
    else if(pos) lost.push(+pos[1]);
  });
  return out;
}
// A position alone means nothing once its catalog is gone, so what is kept aside keeps its words.
function clauseAt(at){
  const clause={};
  CONTENT_LANGS.forEach(l=>{ const v=(BASE_STORE[intentFieldKey("clause",l)]||[])[at]; if(v) clause[l]=String(v); });
  return clause;
}
// Under the card's id.
function setLinksAside(lost){
  const ids=Object.keys(lost);
  if(!ids.length) return;
  let rec=null;
  try{ rec=JSON.parse(nsGet(LINKS_ASIDE)||"null"); }catch(e){}
  if(!rec || typeof rec!=="object" || Array.isArray(rec)) rec={};
  ids.forEach(id=>{
    rec[id]=(Array.isArray(rec[id])?rec[id]:[]).concat(lost[id].map(at=>({at,clause:clauseAt(at)})));
  });
  try{ nsSet(LINKS_ASIDE,JSON.stringify(rec)); }catch(e){}
}
/* THE REQUESTS' OWN LAYER, keyed "i:" + position wherever the catalog put down gave a request no
   id, follows by the finder above. What finds no request is kept aside, one entry per request,
   and so is an edit whose request already holds one under its id; no position survives for the
   next catalog to read as one of its own. */
const REQUESTS_ASIDE="RequestsAside";
const INTENT_LISTS=["intentHidden","intentFavourites","intentRemoved"];
function carryIntentLayer(find){
  const aside={};
  const put=(n,k,v)=>{ (aside[n]=aside[n]||{at:n,clause:clauseAt(n)})[k]=v; };
  const posOf=k=>{ const m=/^i:(\d+)$/.exec(String(k)); return m ? +m[1] : -1; };
  ["intentOverrides","intentCounts"].forEach(name=>{
    const o=pack[name];
    if(!o || typeof o!=="object") return;
    Object.keys(o).forEach(k=>{
      const n=posOf(k);
      if(n<0) return;
      const to=find(n);
      if(to && name==="intentCounts") o[to]=(o[to]|0)+(o[k]|0);
      else if(to && o[to]==null) o[to]=o[k];
      else put(n,name,o[k]);
      delete o[k];
    });
  });
  const follow=(list,mark)=>list.map((k,i)=>{
    const n=posOf(k);
    if(n<0) return k;
    const to=find(n);
    if(!to) mark(n,i);
    return to;
  }).filter((x,i,a)=>x && a.indexOf(x)===i);
  INTENT_LISTS.forEach(name=>{
    if(Array.isArray(pack[name])) pack[name]=follow(pack[name],n=>put(n,name,true));
  });
  let order=null;
  try{ order=JSON.parse(nsGet("IntentOrder")||"null"); }catch(e){}
  if(Array.isArray(order) && order.some(k=>posOf(k)>-1)){
    try{ nsSet("IntentOrder",JSON.stringify(follow(order,(n,i)=>put(n,"order",i)))); }catch(e){}
  }
  // A day bucket names an id by its place in dayIds (desk-stats.js), so the place is renamed.
  const ids=pack.dayIds, days=pack.days||{};
  if(Array.isArray(ids)) ids.forEach((k,at)=>{
    const n=posOf(k);
    if(n<0) return;
    const to=find(n), into=to ? ids.indexOf(to) : -1;
    ids[at]=(to && into<0) ? to : null;
    if(ids[at]) return;
    const kept={};
    Object.keys(days).forEach(d=>{
      const b=days[d]&&days[d].i;
      if(!b || b[at]==null) return;
      if(into>-1) b[into]=(b[into]|0)+(b[at]|0); else kept[d]=b[at];
      delete b[at];
    });
    if(Object.keys(kept).length) put(n,"days",kept);
  });
  const add=Object.keys(aside).map(n=>aside[n]);
  if(!add.length) return;
  let rec=null;
  try{ rec=JSON.parse(nsGet(REQUESTS_ASIDE)||"null"); }catch(e){}
  try{ nsSet(REQUESTS_ASIDE,JSON.stringify((Array.isArray(rec)?rec:[]).concat(add))); }catch(e){}
}
/* The card an edit was written against: BASE_M while the catalog being put down is still in it,
   else the copy the desk's own save kept (pack.js keepEditBases). One with neither stays dormant. */
function rescueEdits(alive,pin,lost){
  const ov=pack.overrides||{}, removed=new Set(pack.removed||[]), bases=pack.editBases||{};
  let kept=0;
  Object.keys(ov).forEach(id=>{
    if(alive.has(id) || removed.has(id)) return;
    const base=BASE_M.find(m=>m.id===id) || bases[id];
    if(!base) return;
    const full=Object.assign({},base,ov[id]), own={};
    Object.keys(full).forEach(k=>{ if(k.charAt(0)!=="_") own[k]=full[k]; });
    own.id=uid("u:");
    if(lost[id]){ lost[own.id]=lost[id]; delete lost[id]; }
    if(own.intents) own.intents=pin(own.id,own.intents);
    pack.custom.push(own);
    delete ov[id];
    delete bases[id];
    renameCard(id,own.id);
    alive.add(own.id);
    kept++;
  });
  return kept;
}
/* An own card needs a shelf to stand on, so one the new catalog lacks comes along as an own
   category under the name it had. */
function keepOwnShelves(cats){
  (pack.custom||[]).forEach(m=>{
    const k=m&&m.c;
    if(!k || cats[k] || pack.customCats[k]) return;
    pack.customCats[k]=pack.catLabels[k]||BASE_CATS[k]||k;
    if(CAT_LABELS_PL[k] && !pack.catLabelsPl[k]) pack.catLabelsPl[k]=CAT_LABELS_PL[k];
  });
}
/** Before a catalog is put down: every personal layer re-read against the one arriving. Returns
 *  the ids that live on, for the prune that follows. The count rides the reload in the session. */
function carryCardLayer(c){
  const list=(c&&c.cards)||[];
  const alive=new Set(list.map(catalogCardId));
  (pack.custom||[]).forEach(m=>{ if(m&&m.id) alive.add(m.id); });
  rekeyOldCards(list,alive);
  rekeyOldShelves((c&&c.categories)||{});
  const find=linkFinder(c), lost={};
  const pin=(id,l)=>{
    const gone=[], out=pinLinks(l,find,gone);
    if(gone.length) lost[id]=(lost[id]||[]).concat(gone);
    return out;
  };
  (pack.custom||[]).forEach(m=>{ if(m&&m.intents) m.intents=pin(m.id,m.intents); });
  Object.keys(pack.overrides||{}).forEach(id=>{
    const o=pack.overrides[id];
    if(o&&o.intents) o.intents=pin(id,o.intents);
  });
  const kept=rescueEdits(alive,pin,lost);
  setLinksAside(lost);
  carryIntentLayer(find);
  keepOwnShelves((c&&c.categories)||{});
  const stars=(pack.favourites||[]).filter(id=>!alive.has(id)).length;
  if(kept||stars){ try{ ssSet(CARRIED,JSON.stringify({kept,stars})); }catch(e){} }
  return alive;
}
/** The boot half, for a layer that arrives with no activation: a 1.16.7 desk's keys copied across,
 *  or a build carrying a new edition of its own catalog. Before the first rebuild, which is what
 *  drops a star whose card is not here. */
function carryAtBoot(){
  rebuildBaseCards();
  if(BASE_M.length){
    const alive=new Set(BASE_M.map(m=>m.id));
    (pack.custom||[]).forEach(m=>{ if(m&&m.id) alive.add(m.id); });
    const moved=rekeyOldCards(BASE_M,alive)+rekeyOldShelves(BASE_CATS);
    // No catalog is put down here, so the links stay as written: the boot re-pins nothing.
    bootKept=rescueEdits(alive,(id,l)=>l,{});
    if(bootKept) keepOwnShelves(BASE_CATS);
    if(moved+bootKept) savePack();
    bootStars=(pack.favourites||[]).filter(id=>!alive.has(id)).length;
  }
  tellCarried();
}
function tellCarried(){
  let kept=bootKept, stars=bootStars;
  try{
    const v=JSON.parse(ssGet(CARRIED)||"null");
    ssDel(CARRIED);
    if(v){ kept+=v.kept|0; stars+=v.stars|0; }
  }catch(e){}
  if(!kept && !stars) return;
  const say=[];
  if(kept) say.push(catalogCountsLine("Edited cards this catalog does not have are kept as your own: {CARDS}.",kept,0,0,0));
  if(stars) say.push(catalogCountsLine("Starred cards this catalog does not have are off your list: {CARDS}.",stars,0,0,0));
  // After any toast already up: the boot's other carries speak at the same moment.
  const speak=()=>{
    const el=document.getElementById("toast");
    if(el && el.classList.contains("show")) return setTimeout(speak,400);
    toast(say.join(" "));
  };
  setTimeout(speak,1400);
}

export {
  carryCardLayer,
  carryAtBoot
};
