/* THE SIGNATURE A CATALOG ARRIVED WITH, read by the engine's own verifier against the ring the
   host finds beside the catalogs (board 605). A warning and never a refusal: every state still
   loads, and a valid signature says nothing. */
import { v2SigState, v2RingRead, V2_SIG_VALID, V2_SIG_NONE, V2_SIG_INVALID, V2_SIG_UNKNOWN } from "./catalog-v2.js";
import { catalogDocOf, eCatalogSignature } from "./catalog.js";
import { eCatalogRing } from "./host.js";
import { nsGet, nsSet, nsDel } from "./storage.js";
import { t } from "./ui-lang.js";
import { esc } from "./esc.js";

const TRUST_KEY="CatalogTrust";
const TRUST_WAIT_MS=2000;
const TRUST_OF=(typeof WeakMap==="function")?new WeakMap():null;
/* Begun once per catalog object, and "" for one with no document behind it. The document is
   copied before the ring is awaited, so the bytes verified are the file as it was read. */
function catalogTrust(c){
  const doc=catalogDocOf(c);
  if(!doc || !TRUST_OF) return Promise.resolve("");
  const had=TRUST_OF.get(c);
  if(had) return had.wait;
  let snap=null;
  try{ snap=JSON.parse(JSON.stringify(doc)); }catch(e){ snap=null; }
  const entry={done:false, state:""};
  entry.wait=(snap ? eCatalogRing().then(text=>v2SigState(snap,v2RingRead(text).ring)) : Promise.resolve(""))
    .catch(()=>"")
    .then(s=>{ entry.done=true; entry.state=String(s||""); return entry.state; });
  TRUST_OF.set(c,entry);
  return entry.wait;
}
function trustSettled(c){
  const e=TRUST_OF && c && typeof c==="object" ? TRUST_OF.get(c) : null;
  return (e && e.done) ? e.state : "";
}
/* Settles with the state, or with "" once the wait is over: loading never hangs on a signature. */
function whenTrusted(c){
  return new Promise(done=>{
    const late=setTimeout(()=>done(trustSettled(c)),TRUST_WAIT_MS);
    catalogTrust(c).then(s=>{ clearTimeout(late); done(s); });
  });
}
/* Every activation writes the state of what it stores, or clears it, so the key never speaks for
   a catalog it was not read from. */
function recordCatalogTrust(c){
  const s=trustSettled(c);
  if(s) nsSet(TRUST_KEY,s); else nsDel(TRUST_KEY);
}
function heldCatalogTrust(){ return nsGet(TRUST_KEY)||""; }
/* THE RING MAY ARRIVE AFTER THE CATALOG. Where the file this load was handed is the catalog in
   use, it is read again once a load, and a changed answer replaces the held one. */
let trustRechecked=false;
function rearmTrustRecheck(){ trustRechecked=false; }
function recheckHeldTrust(found,held,then){
  if(trustRechecked || !found || !held) return;
  trustRechecked=true;
  if(eCatalogSignature(found)!==eCatalogSignature(held)) return;
  catalogTrust(found).then(s=>{
    if(!s || s===heldCatalogTrust()) return;
    nsSet(TRUST_KEY,s);
    if(typeof then==="function") then();
  });
}
/* The loaded row's line of its own, below the counts every row shares: nothing for a valid
   signature, nor for the sample's absent one. */
function trustMetaHtml(state,sample){
  const said=state===V2_SIG_INVALID ? t("changed since it was signed")
    : state===V2_SIG_UNKNOWN ? t("signed with a key this computer does not know")
    : (state===V2_SIG_NONE && !sample) ? t("unsigned") : "";
  return said ? '<small class="ec-trust" data-trust="'+esc(state)+'">'+esc(said)+'</small>' : "";
}
/* The offer's line. Unsigned is said there only where it undoes a signature the desk now has. */
function trustOfferLine(state,updating){
  if(state===V2_SIG_INVALID) return t("This file has changed since it was signed.");
  if(state===V2_SIG_UNKNOWN) return t("This file is signed with a key this computer does not know.");
  if(state===V2_SIG_NONE && updating && heldCatalogTrust()===V2_SIG_VALID)
    return t("The catalog loaded now is signed, and this edition is not.");
  return "";
}

export {
  catalogTrust,
  trustSettled,
  whenTrusted,
  recordCatalogTrust,
  heldCatalogTrust,
  recheckHeldTrust,
  rearmTrustRecheck,
  trustMetaHtml,
  trustOfferLine
};
