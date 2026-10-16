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
const SIGNER_PUB_KEY="CatalogSignerPub";
const TRUST_WAIT_MS=2000;
const TRUST_OF=(typeof WeakMap==="function")?new WeakMap():null;
/* The first 16 hex of the SHA-256 of a raw public, the print the shell gives a lead (leadPrint) and the desks compare.
   "" for anything that is not a public, or where there is no digest. */
function keyPrintOf(pubHex){
  const subtle=globalThis.crypto&&globalThis.crypto.subtle;
  if(!subtle || !/^[0-9a-f]{64}$/.test(String(pubHex||""))) return Promise.resolve("");
  const raw=new Uint8Array(32);
  for(let i=0;i<32;i++) raw[i]=parseInt(pubHex.slice(i*2,i*2+2),16);
  return subtle.digest("SHA-256", raw).then(buf=>{
    const b=new Uint8Array(buf);
    let hex="";
    for(let i=0;i<8;i++) hex+=b[i].toString(16).padStart(2,"0");
    return hex;
  }).catch(()=>"");
}
/* THE KEY THIS DESK TRUSTS. A desk that joined a team trusts its pinned lead's key alone, as the shell does when it
   chooses an edition (shell/main.js catalogLeadOk): valid only where a pinned lead's key verifies the file, with a ring
   beside it or none, and never valid otherwise, whatever the ring says, since the ring is the share's to write. The ring
   may still say what is wrong: a file changed since it was signed. A file naming a pinned lead's key id that the lead's
   key does not verify has changed since it was signed too, and any other signature is a key this desk does not know.
   A desk outside any team reads the ring alone, as before. Resolves {state, pub}, pub the public that verified it. */
function deskSigState(doc,leads){
  const sig=doc.sig;
  const kid=String(sig&&sig.keyId!=null?sig.keyId:""), id=String(doc.id==null?"":doc.id);
  const byRing=()=>eCatalogRing().then(text=>{
    const ring=v2RingRead(text).ring;
    return v2SigState(doc,ring).then(s=>({state:s, pub:s===V2_SIG_VALID ? String(ring[id][kid]) : ""}));
  });
  if(!leads.length) return byRing();
  if(!sig || typeof sig!=="object" || sig.value==null || String(sig.value)==="") return Promise.resolve({state:V2_SIG_NONE, pub:""});
  // The shell's own test of the signature's form, so a value it would not verify is not verified here.
  const formed=sig.alg===V2_SIG_ALG && /^[0-9a-f]{128}$/.test(String(sig.value));
  const byLead=l=>formed ? v2SigState(doc,{[id]:{[kid]:l.public}}).then(s=>s===V2_SIG_VALID ? l.public : "") : Promise.resolve("");
  return leads.reduce((was,l)=>was.then(pub=>pub || byLead(l)),Promise.resolve(""))
    .then(pub=>pub ? {state:V2_SIG_VALID, pub:pub} : byRing().then(r=>({pub:"", state:
      r.state===V2_SIG_INVALID || (r.state===V2_SIG_UNKNOWN && leads.some(l=>l.keyId===kid)) ? V2_SIG_INVALID : V2_SIG_UNKNOWN})));
}
/* Begun once per catalog object, and "" for one with no document behind it. The document is
   copied before the leads and the ring are awaited, so the bytes verified are the file as it was read.
   A valid answer keeps the public that verified it and that public's print, which is how the key is named. */
function catalogTrust(c){
  const doc=catalogDocOf(c);
  if(!doc || !TRUST_OF) return Promise.resolve("");
  const had=TRUST_OF.get(c);
  if(had) return had.wait;
  let snap=null;
  try{ snap=JSON.parse(JSON.stringify(doc)); }catch(e){ snap=null; }
  const entry={done:false, state:"", pub:"", print:""};
  entry.wait=(snap ? eCatalogLeads().then(leads=>deskSigState(snap,leads)) : Promise.resolve({state:"", pub:""}))
    .then(r=>keyPrintOf(r.pub).then(print=>({state:r.state, pub:r.pub, print:print})))
    .catch(()=>({state:"", pub:"", print:""}))
    .then(r=>{
      entry.done=true; entry.state=String(r.state||"");
      entry.pub=entry.state===V2_SIG_VALID ? String(r.pub||"") : ""; entry.print=entry.pub ? String(r.print||"") : "";
      return entry.state;
    });
  TRUST_OF.set(c,entry);
  return entry.wait;
}
function trustEntry(c){
  const e=TRUST_OF && c && typeof c==="object" ? TRUST_OF.get(c) : null;
  return (e && e.done) ? e : null;
}
function trustSettled(c){ const e=trustEntry(c); return e ? e.state : ""; }
/* The print of the public that verified this catalog, once its check has answered valid; "" otherwise. */
function trustPrint(c){ const e=trustEntry(c); return e ? e.print : ""; }
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
/* WHAT THE DESK HOLDS FOR THE CATALOG IN USE: the state, and while it is valid the signing key's id (the floor's) and the
   public that verified it (a pinned lead's question, settleHeldTrust), all written or cleared together from one check. */
let heldPrint="";
function holdTrust(c,state){
  if(state) nsSet(TRUST_KEY,state); else nsDel(TRUST_KEY);
  rememberSigner(c,state);
  const e=trustEntry(c), pub=state===V2_SIG_VALID && e ? e.pub : "";
  if(pub) nsSet(SIGNER_PUB_KEY,pub); else nsDel(SIGNER_PUB_KEY);
  heldPrint=pub ? e.print : "";
}
/* Every activation writes the state of what it stores, or clears it, so the key never speaks for
   a catalog it was not read from. */
function recordCatalogTrust(c){ holdTrust(c,trustSettled(c)); }
function heldCatalogTrust(){ return nsGet(TRUST_KEY)||""; }
function heldCatalogSigner(){ return nsGet(SIGNER_KEY)||""; }
/* The print of the key the held catalog verified under, while it is held valid and this load has read it. */
function heldCatalogPrint(){ return heldCatalogTrust()===V2_SIG_VALID ? heldPrint : ""; }
/* THE RING MAY ARRIVE AFTER THE CATALOG. Where the file this load was handed is the catalog in
   use, it is read again once a load, and a changed answer replaces the held one. */
let trustRechecked=false;
function rearmTrustRecheck(){ trustRechecked=false; }
function recheckHeldTrust(found,held,then){
  if(trustRechecked || !found || !held) return;
  trustRechecked=true;
  if(eCatalogSignature(found)!==eCatalogSignature(held)) return;
  catalogTrust(found).then(s=>{
    const e=trustEntry(found);
    if(!s || (s===heldCatalogTrust() && (e ? e.pub : "")===(nsGet(SIGNER_PUB_KEY)||""))) return;
    holdTrust(found,s);
    if(typeof then==="function") then();
  });
}
/* A HELD "VALID" ANSWERS TO THE PINNED LEAD AT EVERY LOAD, whether the shell hands a file this load or not. The stored
   catalog keeps no document, so beside its state the desk keeps the public that verified it when it was stored. With a
   lead pinned, valid stands where that public is a pinned lead's. Otherwise the file handed this load decides, where it is
   the catalog held, checked as any file is; and where no check this load can confirm it, the held catalog is a key this
   desk does not know, drawn grey. A desk outside any team keeps what it holds, as before. Settles with whether it lowered
   a held valid once its answer is written, with the held key's print read for the Library, and never rejects. */
function settleHeldTrust(found,held){
  let lowered=false;
  return eCatalogLeads().then(leads=>{
    const pub=nsGet(SIGNER_PUB_KEY)||"";
    if(!leads.length || heldCatalogTrust()!==V2_SIG_VALID || leads.some(l=>l.public===pub)) return;
    const unconfirmed=()=>{ nsSet(TRUST_KEY,V2_SIG_UNKNOWN); nsDel(SIGNER_KEY); nsDel(SIGNER_PUB_KEY); lowered=true; };
    if(!found || !held || eCatalogSignature(found)!==eCatalogSignature(held)){ unconfirmed(); return; }
    return catalogTrust(found).then(s=>{ if(!s){ unconfirmed(); return; } holdTrust(found,s); lowered=s!==V2_SIG_VALID; });
  }).then(()=>keyPrintOf(nsGet(SIGNER_PUB_KEY)||"")).then(p=>{ heldPrint=p; }).catch(()=>{}).then(()=>lowered);
}
/* The same answer for a list being drawn, or false once TRUST_WAIT_MS is over, as whenTrusted caps a row's wait: a host
   that never answers cannot hold the Library unpainted. */
function settleHeldTrustWithin(found,held){
  return new Promise(done=>{
    const late=setTimeout(()=>done(false),TRUST_WAIT_MS);
    settleHeldTrust(found,held).then(lowered=>{ clearTimeout(late); done(lowered); });
  });
}
/* A ROW'S SIGNATURE IS A KEY beside its act, never a line: gold where the signature holds, grey
   otherwise, its word the name. What more can be said rides data-tip, for a bubble on hover or
   focus, and a key with a bubble carries no title so the two never show at once. An unknown
   state keeps the slot and draws nothing, so the acts stay in one column. */
function trustKeyHtml(state,print){
  if(!state) return '<span class="ec-key" aria-hidden="true"></span>';
  const word=esc(t(state===V2_SIG_NONE?"Unsigned":"Signed"));
  /* A valid key is named by the print of the public that verified the file, printed in fours with the key's sign as the
     desks compare it, and never by the key id the file gives itself, which any writer of the share chooses. */
  const lead=state===V2_SIG_VALID && /^[0-9a-f]{16}$/.test(String(print||"")) ? String(print) : "";
  const tip=state===V2_SIG_INVALID ? t("This file has changed since it was signed.")
    : state===V2_SIG_UNKNOWN ? t("This file is signed with a key this computer does not know.")
    : lead ? t("This file is signed with the key {KEY}.").split("{KEY}").join(leadKeyText(lead)) : "";
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
  trustPrint,
  keyPrintOf,
  recordCatalogTrust,
  heldCatalogTrust,
  heldCatalogSigner,
  heldCatalogPrint,
  recheckHeldTrust,
  settleHeldTrust,
  settleHeldTrustWithin,
  rearmTrustRecheck,
  trustKeyHtml,
  trustOfferLine
};
