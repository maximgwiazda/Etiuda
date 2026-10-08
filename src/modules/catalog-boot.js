import { eApplyCatalog, eResetCatalog, eCatalog, eCatalogAccepted, storedCatalog } from "./catalog.js";
import { layerNsOf, orbitOldLayer, setLayer } from "./storage.js";

/* The catalog this start applies, or null for the empty desk. */
function bootCatalog(){
  /* One stored catalog is the source of truth, whether it came from Import or from accepting
     the sibling file. Falling back to the sibling covers the boot where it was just accepted
     but the copy could not be written (storage full), so the user still gets what they chose. */
  const stored=storedCatalog();
  if(stored) return stored;
  const c=eCatalog();
  return (c && eCatalogAccepted(c)) ? c : null;
}
let E_APPLIED=null;
/** Whether a catalog is loaded, which the empty desk's loose layer is the absence of. */
function catalogLoaded(){ return !!E_APPLIED; }
function applyBootCatalog(){
  eResetCatalog();
  E_APPLIED=bootCatalog();
  if(E_APPLIED) eApplyCatalog(E_APPLIED);
  setLayer(layerNsOf(E_APPLIED));
  orbitOldLayer();
}

export {
  applyBootCatalog,
  catalogLoaded
};
