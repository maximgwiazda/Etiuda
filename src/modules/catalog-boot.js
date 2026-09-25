import { eApplyCatalog, eCatalog, eCatalogAccepted, storedCatalog } from "./catalog.js";
import { eEmbeddedCatalog } from "./env.js";

function applyBootCatalog(){
  /* One stored catalog is the source of truth, whether it came from Import or from accepting
     the sibling file. Falling back to the sibling covers the boot where it was just accepted
     but the copy could not be written (storage full), so the user still gets what they chose. */
  const stored=storedCatalog();
  if(stored){ eApplyCatalog(stored); return; }
  /* An embedded catalog outranks the sibling and loads without being asked - it is part
     of this file, already consented to. It sits BELOW a stored catalog, which is what
     makes "import something else" work and lets Reset fall back to the built-in content. */
  const emb=eEmbeddedCatalog();
  if(emb){ eApplyCatalog(emb); return; }
  const c=eCatalog();
  if(c && eCatalogAccepted(c)) eApplyCatalog(c);
}

export {
  applyBootCatalog
};
