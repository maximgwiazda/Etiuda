import { BASE_M, BASE_CATS, catalogCardId, pack, rebuildBaseCards, savePack } from "./pack.js";
import { intentIdAt } from "./intent-id.js";
import { uid } from "./ids.js";
import { nsGet, nsSet, ssGet, ssSet, ssDel } from "./storage.js";
import { catalogCountsLine, toast } from "./ui-lang.js";
import { CAT_LABELS_PL } from "./icons.js";

/* WHAT A PERSON MADE OUTLIVES THE CATALOG UNDER IT. A card still there keeps its edit, star, hide
   and place; an edit whose card is gone becomes an own card, carrying all three; a star on a card
   that is gone has nothing left to mark, and the desk is told how many went. */
const ID_LISTS=["favourites","hidden","cardOrder","removed"];
const CARRIED="eCarriedNow";
let bootStars=0;

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
   storeIntentIds). Each becomes the intent's own id first; one with no id to become is dropped. */
function pinLinks(l){
  if(!Array.isArray(l)) return l;
  return l.map(x=>(typeof x==="number")?intentIdAt(x):String(x)).filter(x=>x && !/^u?i:\d+$/.test(x));
}
/* BASE_M is still the catalog being put down, so the card an edit was written against is at hand.
   One with no base is dormant already, written against a catalog gone before this one, and stays. */
function rescueEdits(alive){
  const ov=pack.overrides||{}, removed=new Set(pack.removed||[]);
  let kept=0;
  Object.keys(ov).forEach(id=>{
    if(alive.has(id) || removed.has(id)) return;
    const base=BASE_M.find(m=>m.id===id);
    if(!base) return;
    const full=Object.assign({},base,ov[id]), own={};
    Object.keys(full).forEach(k=>{ if(k.charAt(0)!=="_") own[k]=full[k]; });
    own.id=uid("u:");
    if(own.intents) own.intents=pinLinks(own.intents);
    pack.custom.push(own);
    delete ov[id];
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
  (pack.custom||[]).forEach(m=>{ if(m&&m.intents) m.intents=pinLinks(m.intents); });
  Object.keys(pack.overrides||{}).forEach(id=>{
    const o=pack.overrides[id];
    if(o&&o.intents) o.intents=pinLinks(o.intents);
  });
  const kept=rescueEdits(alive);
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
    if(rekeyOldCards(BASE_M,alive)+rekeyOldShelves(BASE_CATS)) savePack();
    bootStars=(pack.favourites||[]).filter(id=>!alive.has(id)).length;
  }
  tellCarried();
}
function tellCarried(){
  let kept=0, stars=bootStars;
  try{
    const v=JSON.parse(ssGet(CARRIED)||"null");
    ssDel(CARRIED);
    if(v){ kept=v.kept|0; stars+=v.stars|0; }
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
