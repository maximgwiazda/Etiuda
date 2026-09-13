import { CATS } from "./content-model.js";

/* ---- What makes a card ring ----------------------------------------------------------
   GREEN is a fact about a CARD: "does this relate to what the customer asked". Only the
   card can carry it - a category-level version existed, duplicated the flag at a coarser
   grain and silently overrode the card's own toggle.
   BLUE is a fact about a CATEGORY: SUPPORTING - useful whatever they asked. Every real use
   covers a whole category; a per-card version was tried and removed as unused plumbing.
   Where they meet, GREEN WINS - answering the question asked is the stronger statement.
   Three layers, lowest first: engine (none), catalog (roles:{always:[...]}), user
   (pack.catRoles, the asterisk in Manage). Layer 3 overrides per category; Reset restores
   the catalog's and an export writes the effective set. Role names are filtered against
   categories that exist, so a stale role degrades to "no role", never a ghost. */
let CATALOG_ROLES={always:[]};             // layer 2, as declared by the loaded catalog
let ALWAYS_CATS=[];                        // layer 3 applied on top
function isAlwaysCat(k){ return !!k && ALWAYS_CATS.indexOf(k)>-1; }
/** Recompute the effective roles from catalog + pack. Call after anything that changes either. */
function refreshCatRoles(){
  const real=k=>!!(k && CATS[k]);
  const over=(pack&&pack.catRoles)||{};
  const always=[];
  Object.keys(CATS).forEach(k=>{
    if(!real(k)) return;
    const o=over[k];
    const on=(o && typeof o.always==="boolean") ? o.always : CATALOG_ROLES.always.indexOf(k)>-1;
    if(on) always.push(k);
  });
  ALWAYS_CATS=always;
}
function setCatAlways(k,on){
  if(!k||!CATS[k]) return;
  if(!pack.catRoles) pack.catRoles={};
  if(!pack.catRoles[k]) pack.catRoles[k]={};
  pack.catRoles[k].always=!!on;
  savePack(); refreshCatRoles();
}
/** Record a catalog's declared roles (layer 2). Runs after its categories are installed, so CATS
 *  is the authority on what is real. `roles.opener` is read and discarded - that role was removed,
 *  and a card marks itself as linked to every intent instead. */
function eApplyRoles(roles){
  const real=k=>!!(k && CATS[k]);
  const want=(roles && Array.isArray(roles.always)) ? roles.always.map(String) : [];
  const dropped=want.filter(k=>!real(k));
  CATALOG_ROLES={ always:want.filter(real) };
  if(dropped.length)
    console.warn("Etiuda: supporting categories (roles.always) named but not defined by the catalog - ignored: "+dropped.join(", "));
  if(roles && roles.opener)
    console.info("Etiuda: this catalog declares an opener category. That role was removed - a "
      +"card marks itself as linked to every intent instead, so the declaration is ignored.");
  refreshCatRoles();
}

export {
  isAlwaysCat,
  refreshCatRoles,
  setCatAlways,
  eApplyRoles,
  CATALOG_ROLES,
  ALWAYS_CATS
};
