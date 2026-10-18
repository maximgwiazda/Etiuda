import { refreshCatRoles } from "./cat-roles.js";
import { CATS, CONTENT_LANGS } from "./content-model.js";
import { CAT_LABELS_BY_LANG } from "./icons.js";
import { v2CatKey } from "./catalog-v2.js";
import { BASE_CATS, pack, savePack, packSnapshot, packUndoFor } from "./pack.js";
import { lyGet, lySet } from "./storage.js";
import { uiLang, toast, offerUndo } from "./ui-lang.js";
import { cardCounts, setCatOrder, catOrder, setCats, cats } from "./app-state.js";
import { hooks } from "./hooks.js";

/* The personal layer's bag for one language's category names: the catalog's own key with
   "categories" read as "catLabels", so en-then-pl keeps catLabels and catLabelsPl. */
function catPackKey(l,primary){
  return v2CatKey(l,primary||CONTENT_LANGS[0]||"en").replace(/^categories/,"catLabels");
}
function catCatalogLabel(l,k){
  return (CAT_LABELS_BY_LANG[l] || {})[k] || "";
}
/* The pills' stored order, read at every start: the retired Boarding pass key becomes Check-in's,
   and a key naming no category is dropped. */
function loadCatOrder(){
  try{ setCatOrder(JSON.parse(lyGet("CatOrder")||"null")||[]); }catch(e){ setCatOrder([]); }
  setCatOrder(catOrder.map(k=>k==="bp"?"cin":k).filter((k,i,a)=>a.indexOf(k)===i));
  applyCatsToGlobal();
  setCatOrder(catOrder.filter(k=>CATS[k]));
}
function applyCatsToGlobal(){
  // Removed categories are skipped rather than deleted from BASE_CATS, so Reset brings the
  // catalog's own back. Custom ones are gone from pack.customCats outright - nothing to restore.
  const gone=new Set(pack.removedCats||[]);
  Object.keys(CATS).forEach(k=>{
    if(gone.has(k) || (!BASE_CATS[k] && !(pack.customCats&&pack.customCats[k]))) delete CATS[k];
  });
  /* Falling order of authority; every layer is something a PERSON wrote - the engine
     translates nothing. An interface language past the catalog's primary: the user's name in
     it, the catalog's, the user's primary rename, the canonical. The primary: rename, then
     canonical. A primary name stands in only because nothing in that language was offered. */
  const primary=CONTENT_LANGS[0]||"en", u=uiLang(), bag=u!==primary?catPackKey(u,primary):"";
  Object.keys(BASE_CATS).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(bag && ((pack[bag]&&pack[bag][k]) || catCatalogLabel(u,k)))
            || pack.catLabels[k] || BASE_CATS[k];
  });
  Object.keys(pack.customCats||{}).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(bag && pack[bag] && pack[bag][k]) || pack.catLabels[k] || pack.customCats[k] || k;
  });
  // Roles name categories, so they are re-resolved whenever the category set changes
  refreshCatRoles();
}
/** Delete an empty category. Empty-only everywhere, so no path silently destroys contents.
 *  No special-category guard: a category carries no roles, and the empty-only rule is what
 *  actually guards content. */
function removeCategory(k){
  if(!k) return false;
  if(cardCounts[k]){ toast("Move or delete the cards in this category first"); return false; }
  const was=packSnapshot(), wasOrder=catOrder.slice();
  if(pack.customCats && pack.customCats[k]) delete pack.customCats[k];
  else {
    if(!Array.isArray(pack.removedCats)) pack.removedCats=[];
    if(pack.removedCats.indexOf(k)<0) pack.removedCats.push(k);
  }
  if(pack.catLabels) delete pack.catLabels[k];
  // ...and its Polish name, or re-creating the key would inherit a name nothing on screen explains
  if(pack.catLabelsPl) delete pack.catLabelsPl[k];
  const primary=CONTENT_LANGS[0]||"en";
  CONTENT_LANGS.slice(1).forEach(l=>{
    const bag=catPackKey(l,primary);
    if(pack[bag]) delete pack[bag][k];
  });
  // Drop its role too, or re-creating a category with the same key would inherit it
  if(pack.catRoles) delete pack.catRoles[k];
  // ...and its icon and colour, the other two override bags resetCategory knows, for the same reason
  if(pack.catIcons) delete pack.catIcons[k];
  if(pack.catColors) delete pack.catColors[k];
  setCatOrder(catOrder.filter(x=>x!==k));
  setCats(cats.filter(x=>x!==k));
  lySet("CatOrder",JSON.stringify(catOrder));
  savePack(); hooks.rebuildCards();
  const back=packUndoFor(was), at=wasOrder.indexOf(k);
  offerUndo("Category deleted", ()=>{
    back();
    const order=catOrder.slice();
    if(at>-1 && order.indexOf(k)<0) order.splice(Math.min(at,order.length),0,k);
    setCatOrder(order);
    lySet("CatOrder",JSON.stringify(catOrder));
    hooks.rebuildCards(); applyCatsToGlobal(); hooks.drawPillsCore(); hooks.render(); hooks.drawIntentRail();
    // The Library shows the category again where it stands open.
    if(document.getElementById("mgCatList")) hooks.openManage();
  });
  return true;
}

export {
  catPackKey,
  catCatalogLabel,
  loadCatOrder,
  applyCatsToGlobal,
  removeCategory
};
