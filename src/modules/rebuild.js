import { dropLabelStats } from "./affinity.js";
import { BASE_N, BASE_STORE, intentOrderLoaded, setIntentOrder, setIntentOrderLoaded, intentOrder, isIntentHiddenIdx } from "./intent-id.js";
import { pack, rebuildBaseCards, BASE_M } from "./pack.js";
import { INTENT_TEXT_FIELDS, CONTENT_LANGS, INTENT_FIELD_KEY, INTENT_BLANK_CLEARS, SW_STORE, intentStoreKeys, SW_EN, CATS } from "./content-model.js";
import { nsGet } from "./storage.js";
import { syncIntentInput } from "./intent-clear.js";
import { drawPills } from "./tabs.js";
import { applyCatsToGlobal } from "./cat-set.js";
import { setIntentIdxs, intentIdxs, setCards, cards, setCatOrder, catOrder, setCats, cats } from "./app-state.js";
import { hooks } from "./hooks.js";

function rebuildIntents(){
  dropLabelStats();    // the labels are about to change; their word frequencies go with them
  for(let i=0;i<BASE_N;i++){
    const o=(pack.intentOverrides||{})["i:"+i]||{};
    INTENT_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
      const k=INTENT_FIELD_KEY[f][l], v=o[k];
      const kept=INTENT_BLANK_CLEARS[f] ? (v!=null) : (v!=null && v!=="");
      SW_STORE[k][i]= kept ? v : BASE_STORE[k][i];
    }));
  }
  intentStoreKeys().forEach(k=>{ SW_STORE[k].length=BASE_N; });
  (pack.intentCustom||[]).forEach(c=>{
    intentStoreKeys().forEach(k=>{ SW_STORE[k].push(c[k]||""); });
  });
  const n=SW_EN.length;
  if(!intentOrderLoaded){
    try{ setIntentOrder(JSON.parse(nsGet("IntentOrder")||"null")||[]); }catch(e){ setIntentOrder([]); }
    setIntentOrderLoaded(true);
  }
  setIntentOrder(intentOrder.filter(i=>Number.isInteger(i)&&i>=0&&i<n));
  for(let i=0;i<n;i++) if(intentOrder.indexOf(i)<0) intentOrder.push(i);
  // Drop selection of hidden intents; keep full order for Manage list position
  setIntentIdxs(intentIdxs.filter(i=>intentOrder.indexOf(i)>-1 && !isIntentHiddenIdx(i)));
  // Favourites first, then regulars (rail + dropdown share intentOrder)
  hooks.syncIntentOrder();
  syncIntentInput();
  hooks.drawIntentRail();
}
function refreshAfterIntents(){
  rebuildIntents();
  drawPills();
  hooks.render();
}
// Rebuilding what the list draws from: the intents out of the catalog and the pack, then the
// cards out of the same pair. Both end by drawing, because nothing else would.

function rebuildCards(){
  applyCatsToGlobal();
  rebuildBaseCards();
  rebuildIntents();
  /* Hidden and removed are different states: HIDDEN stays listed - greyed, bottom, out of
     search, never ringed - visibly existing, which is what makes hiding reversible in
     practice; favourite status survives. REMOVED never enters `cards`: gone from the
     interface and from exports, back on Reset because the catalog still has it. */
  const hidden=new Set(pack.hidden||[]);
  const removed=new Set(pack.removed||[]);
  const ov=pack.overrides||{};
  setCards([]);
  BASE_M.forEach(base=>{
    if(removed.has(base.id)) return;
    const o=ov[base.id];
    const m=o ? Object.assign({},base,o,{id:base.id,_base:1,_overridden:1})
              : Object.assign({},base);
    if(hidden.has(base.id)) m._hidden=1;
    cards.push(m);
  });
  (pack.custom||[]).forEach(m=>{
    if(!m||!m.id||removed.has(m.id)) return;
    const c=Object.assign({},m,{_custom:1});
    if(hidden.has(m.id)) c._hidden=1;
    cards.push(c);
  });
  hooks.syncFavouritesMeta();          // drops dead favourites, then recounts
  /* Every category that exists gets a pill, empty or not - requiring counts[k] made
     Manage list categories the header silently omitted. A 0 badge is honest and gives the
     first card of that kind somewhere to drop. */
  /* Migration off the retired "fav" pseudo-category: stored orders and filters carrying
     it drop it here on the first boot after the upgrade. */
  setCatOrder(catOrder.filter(k=>CATS[k]));
  Object.keys(CATS).forEach(k=>{
    if(catOrder.indexOf(k)<0) catOrder.push(k);
  });
  setCats(cats.filter(k=>CATS[k]));
  drawPills();
  hooks.render();
}
export {
  rebuildIntents,
  refreshAfterIntents,
  rebuildCards,
};
