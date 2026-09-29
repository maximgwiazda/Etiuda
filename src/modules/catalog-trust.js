/* THE SIGNATURE A CATALOG ARRIVED WITH, read by the engine's own verifier against the ring the
   host finds beside the catalogs (board 605). A warning and never a refusal: every state still
   loads. */
import { v2SigState, v2RingRead, V2_SIG_VALID, V2_SIG_NONE, V2_SIG_INVALID, V2_SIG_UNKNOWN } from "./catalog-v2.js";
import { catalogDocOf, eCatalogSignature } from "./catalog.js";
import { eCatalogRing } from "./host.js";
import { nsGet, nsSet, nsDel } from "./storage.js";
import { t } from "./ui-lang.js";
import { esc } from "./esc.js";
import { ICON_KEY } from "./icons.js";

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
/* A ROW'S SIGNATURE IS A KEY beside its act, never a line: gold where the signature holds, grey
   otherwise, its word the name. What more can be said rides data-tip, for a bubble on hover or
   focus, and a key with a bubble carries no title so the two never show at once. An unknown
   state keeps the slot and draws nothing, so the acts stay in one column. */
function trustKeyHtml(state,keyId){
  if(!state) return '<span class="ec-key" aria-hidden="true"></span>';
  const word=esc(t(state===V2_SIG_NONE?"Unsigned":"Signed"));
  const tip=state===V2_SIG_INVALID ? t("This file has changed since it was signed.")
    : state===V2_SIG_UNKNOWN ? t("This file is signed with a key this computer does not know.")
    : (state===V2_SIG_VALID && keyId) ? t("This file is signed with the key {KEY}.").split("{KEY}").join(keyId) : "";
  return '<span class="ec-key'+(state===V2_SIG_VALID?" on":"")+'" role="img" data-trust="'+esc(state)+'" aria-label="'+word+'"'
    +(tip?' tabindex="0" data-tip="'+esc(tip)+'"':' title="'+word+'"')+'>'+ICON_KEY+'</span>';
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
  trustKeyHtml,
  trustOfferLine
};
