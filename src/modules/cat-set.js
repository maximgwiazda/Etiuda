import { refreshCatRoles } from "./cat-roles.js";
import { CATS } from "./content-model.js";
import { CAT_LABELS_PL } from "./icons.js";
import { BASE_CATS, pack, savePack } from "./pack.js";
import { nsSet } from "./storage.js";
import { uiLang, toast } from "./ui-lang.js";
import { cardCounts } from "./card-counts.js";
import { rebuildCards } from "./rebuild.js";

function applyCatsToGlobal(){
  // Removed categories are skipped rather than deleted from BASE_CATS, so Reset brings the
  // catalog's own back. Custom ones are gone from pack.customCats outright - nothing to restore.
  const gone=new Set(pack.removedCats||[]);
  Object.keys(CATS).forEach(k=>{
    if(gone.has(k) || (!BASE_CATS[k] && !(pack.customCats&&pack.customCats[k]))) delete CATS[k];
  });
  /* Falling order of authority; every layer is something a PERSON wrote - the engine
     translates nothing. Polish: the user's Polish name, the catalog's, the user's English
     rename, the canonical. English: rename, then canonical. A name in the English box
     never appears as its own translation - only because nothing Polish was offered. */
  const pl=uiLang()==="pl";
  Object.keys(BASE_CATS).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(pl && (pack.catLabelsPl[k] || CAT_LABELS_PL[k]))
            || pack.catLabels[k] || BASE_CATS[k];
  });
  Object.keys(pack.customCats||{}).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(pl && pack.catLabelsPl[k]) || pack.catLabels[k] || pack.customCats[k] || k;
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
  if(pack.customCats && pack.customCats[k]) delete pack.customCats[k];
  else {
    if(!Array.isArray(pack.removedCats)) pack.removedCats=[];
    if(pack.removedCats.indexOf(k)<0) pack.removedCats.push(k);
  }
  if(pack.catLabels) delete pack.catLabels[k];
  // ...and its Polish name, or re-creating the key would inherit a name nothing on screen explains
  if(pack.catLabelsPl) delete pack.catLabelsPl[k];
  // Drop its role too, or re-creating a category with the same key would inherit it
  if(pack.catRoles) delete pack.catRoles[k];
  // ...and its icon and colour, the other two override bags resetCategory knows, for the same reason
  if(pack.catIcons) delete pack.catIcons[k];
  if(pack.catColors) delete pack.catColors[k];
  catOrder=catOrder.filter(x=>x!==k);
  cats=cats.filter(x=>x!==k);
  nsSet("CatOrder",JSON.stringify(catOrder));
  savePack(); rebuildCards();
  toast("Category deleted");
  return true;
}

export {
  applyCatsToGlobal,
  removeCategory
};
