import { E_CATALOG_KEY, eApplyCatalog, eCatalog, eCatalogAccepted, eCatalogSignature, storedCatalog,
  storeCatalog } from "./catalog.js";
import { eEmbeddedCatalog } from "./env.js";
import { eCatalogFile, eCatalogMtime, eCatalogSample } from "./host.js";
import { ejectedJustNow } from "./local-memory.js";
import { lsGet, lsSet, nsGet, nsSet } from "./storage.js";

/* A FIRST RUN TAKES THE SAMPLE UP WITHOUT ASKING: somebody who has not yet seen a card is not asked
   about a catalog. Only the shipped sample, unedited, found by a host on a desk that holds no
   catalog and has refused none, and only once: the key keeps an eject or a Start empty final, and
   its shape keeps it out of every wipe, as the shell's own e~sampled is. It writes what accepting
   the offer writes, so the Library marks the file's row as loaded. */
const E_SAMPLE_TAKEN="e~sampleTaken";
function takeSampleAtBoot(c){
  if(!c || !c.sample || !eCatalogSample()) return false;
  if(lsGet(E_SAMPLE_TAKEN)==="1" || nsGet("CatalogNo") || ejectedJustNow()) return false;
  if(!storeCatalog(c)) return false;
  lsSet(E_CATALOG_KEY,eCatalogSignature(c));
  lsSet(E_SAMPLE_TAKEN,"1");
  nsSet("Sample","1");
  nsSet("CatalogFile",eCatalogFile());
  nsSet("CatalogFileAt",String(eCatalogMtime()));
  return true;
}

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
  if(c && (eCatalogAccepted(c) || takeSampleAtBoot(c))) eApplyCatalog(c);
}

export {
  applyBootCatalog
};
