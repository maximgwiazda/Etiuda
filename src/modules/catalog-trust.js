/* THE SIGNATURE A CATALOG ARRIVED WITH, read by the engine's own verifier against the key this desk
   trusts for it: on a desk that joined a team, its pinned lead's, and on any other desk the ring the
   host finds beside the catalogs (board 605). A warning and never a refusal: every state still
   loads. */
import { v2SigState, v2RingRead, V2_SIG_VALID, V2_SIG_NONE, V2_SIG_INVALID, V2_SIG_UNKNOWN, V2_SIG_ALG } from "./catalog-v2.js";
import { catalogDocOf, eCatalogSignature } from "./catalog.js";
import { eCatalogRing, eCatalogLeads } from "./host.js";
import { nsGet, nsSet, nsDel } from "./storage.js";
import { t } from "./ui-lang.js";
import { esc } from "./esc.js";
import { ICON_KEY } from "./icons.js";
import { leadKeyText } from "./team-join.js";

const TRUST_KEY="CatalogTrust";
const SIGNER_KEY="CatalogSigner";
const TRUST_WAIT_MS=2000;
const TRUST_OF=(typeof WeakMap==="function")?new WeakMap():null;
/* THE KEY THIS DESK TRUSTS. A desk that joined a team trusts its pinned lead's key alone, as the shell does when it
   chooses an edition (shell/main.js catalogLeadOk): valid only where a pinned lead's key verifies the file, with a ring
   beside it or none, and never valid otherwise, whatever the ring says, since the ring is the share's to write. The ring
   may still say what is wrong: a file changed since it was signed. A file naming a pinned lead's key id that the lead's
   key does not verify has changed since it was signed too, and any other signature is a key this desk does not know.
   A desk outside any team reads the ring alone, as before. */
function deskSigState(doc,leads){
  const byRing=()=>eCatalogRing().then(text=>v2SigState(doc,v2RingRead(text).ring));
  if(!leads.length) return byRing();
  const sig=doc.sig;
  if(!sig || typeof sig!=="object" || sig.value==null || String(sig.value)==="") return Promise.resolve(V2_SIG_NONE);
  const kid=String(sig.keyId==null?"":sig.keyId), id=String(doc.id==null?"":doc.id);
  // The shell's own test of the signature's form, so a value it would not verify is not verified here.
  const formed=sig.alg===V2_SIG_ALG && /^[0-9a-f]{128}$/.test(String(sig.value));
  const byLead=l=>formed ? v2SigState(doc,{[id]:{[kid]:l.public}}) : Promise.resolve("");
  return leads.reduce((was,l)=>was.then(s=>s===V2_SIG_VALID ? s : byLead(l)),Promise.resolve(""))
    .then(s=>s===V2_SIG_VALID ? s : byRing().then(r=>
      r===V2_SIG_INVALID || (r===V2_SIG_UNKNOWN && leads.some(l=>l.keyId===kid)) ? V2_SIG_INVALID : V2_SIG_UNKNOWN));
}
/* Begun once per catalog object, and "" for one with no document behind it. The document is
   copied before the leads and the ring are awaited, so the bytes verified are the file as it was read. */
function catalogTrust(c){
  const doc=catalogDocOf(c);
  if(!doc || !TRUST_OF) return Promise.resolve("");
  const had=TRUST_OF.get(c);
  if(had) return had.wait;
  let snap=null;
  try{ snap=JSON.parse(JSON.stringify(doc)); }catch(e){ snap=null; }
  const entry={done:false, state:""};
  entry.wait=(snap ? eCatalogLeads().then(leads=>deskSigState(snap,leads)) : Promise.resolve(""))
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
/* The signing key's id is kept only while the state is valid, so the floor held under one key is not one for another. */
function rememberSigner(c,state){
  const doc=catalogDocOf(c);
  const sig=doc&&doc.sig;
  const kid=state===V2_SIG_VALID && sig && sig.keyId ? String(sig.keyId) : "";
  if(kid) nsSet(SIGNER_KEY,kid); else nsDel(SIGNER_KEY);
}
/* Every activation writes the state of what it stores, or clears it, so the key never speaks for
   a catalog it was not read from. */
function recordCatalogTrust(c){
  const s=trustSettled(c);
  if(s) nsSet(TRUST_KEY,s); else nsDel(TRUST_KEY);
  rememberSigner(c,s);
}
function heldCatalogTrust(){ return nsGet(TRUST_KEY)||""; }
function heldCatalogSigner(){ return nsGet(SIGNER_KEY)||""; }
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
    rememberSigner(found,s);
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
  /* A keyId Studio derived is a fixed name and 16 hex: the hex is printed in fours with the key's sign, as the desks compare it. */
  const lead=/^studio-[0-9a-f]{16}$/.test(String(keyId||"")) ? String(keyId).slice(7) : "";
  const tip=state===V2_SIG_INVALID ? t("This file has changed since it was signed.")
    : state===V2_SIG_UNKNOWN ? t("This file is signed with a key this computer does not know.")
    : (state===V2_SIG_VALID && keyId) ? t("This file is signed with the key {KEY}.").split("{KEY}").join(lead?leadKeyText(lead):keyId) : "";
  return '<span class="ec-key'+(state===V2_SIG_VALID?" on":"")+'" role="img" data-trust="'+esc(state)+'" aria-label="'+word+'"'
    +(tip?' tabindex="0" data-tip="'+esc(tip)+'"'+(lead?' data-tip-key="'+lead+'" data-tip-kind="studio"':''):' title="'+word+'"')+'>'+ICON_KEY+'</span>';
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
  heldCatalogSigner,
  recheckHeldTrust,
  rearmTrustRecheck,
  trustKeyHtml,
  trustOfferLine
};
