import { cardStorageKeys, cardRequiredKeys, cardFieldKey, cardFieldKeys, CARD_PLAIN_FIELDS,
  CARD_KEY_ALIAS } from "./card-fields.js";
import { catalogLangs, CONTENT_LANGS } from "./content-model.js";

// ---- Macros JSON (compliance access / backup) --------------------------------
// Format v1 pretty-printed JSON (editable in Notepad / any text editor):
// {
//   "format": 1,
//   "kind": "playbook-cards",
//   "exported": "ISO date",
//   "cards": [
//     { "id","c","t","en","pl", optional: text fields per cardStorageKeys() - today
//       "k","note","notePl","tPl" - plus "lockLang","alt","seq","firstOnly","paxVoc",
//       "allIntents","intentTop","intents" }
//   ]
// }
// Flag fields are 0/1. intents: numbers (base index) and/or strings ("i:0").
// Legacy kind "playbook-quality-cards" is still accepted on import.
function cardToExportPlain(m){
  // Effective wording only (local edits already merged into m; no runtime badges)
  const tKey=cardFieldKey("t",CONTENT_LANGS[0]);
  const o={ id:m.id||("b:"+(m.c||"open")+":"+(m[tKey]||"Untitled")), c:m.c||"open" };
  // The primary's title, then every declared language's body: the order the file has always had.
  o[tKey]=m[tKey]||"";
  cardFieldKeys("body").forEach(k=>{ o[k]=m[k]||""; });
  /* Every optional translation the table knows about; the required keys are written above. */
  cardStorageKeys().forEach(f=>{
    if(cardRequiredKeys().indexOf(f)>-1) return;
    if(m[f]) o[f]=m[f];
  });
  CARD_PLAIN_FIELDS.forEach(f=>{ if(m[f]) o[f]=m[f]; });
  if(m.alt) o.alt=1;
  if(m.seq) o.seq=1;
  if(m.firstOnly) o.firstOnly=1;
  // 0 is meaningful here, so this writes whenever the flag is SET rather than when it is true.
  if(m.paxVoc!=null) o.paxVoc=(+m.paxVoc)?1:0;
  if(m.allIntents) o.allIntents=1;
  if(m.intentTop) o.intentTop=1;
  if(Array.isArray(m.intents)&&m.intents.length) o.intents=m.intents.slice();
  return o;
}
/* One export, and it writes a full catalog - see exportCatalog. The cards-only
   "playbook-cards" kind is still accepted on import, so pre-1.0 files keep working. */
function truthyFlag(v){
  return v===1||v===true||v==="1"||v==="true";
}
function isMacrosJsonKind(kind){
  // "playbook-catalog" is the 1.0 format; the two older kinds are pre-1.0 cards-only files
  return kind==null||kind==="playbook-catalog"||kind==="playbook-cards"||kind==="playbook-quality-cards";
}
/** Validation split out of the text parser so a catalog can reuse it on already-parsed data. */
function parseMacrosData(data){
  let items=null;
  if(Array.isArray(data)) items=data;
  else if(data&&typeof data==="object"&&Array.isArray(data.cards)) items=data.cards;
  else throw new Error("expected { cards: [...] } or an array of cards");
  if(data&&typeof data==="object"&&!Array.isArray(data)&&data.kind!=null&&!isMacrosJsonKind(data.kind)){
    throw new Error("unexpected kind (want playbook-cards)");
  }
  if(data&&typeof data==="object"&&!Array.isArray(data)&&data.format!=null&&+data.format!==1){
    throw new Error("unsupported format version "+data.format);
  }
  /* THE FILE'S OWN LANGUAGES, not the desk's: this runs inside normaliseCatalog, which runs
     BEFORE setContentLangs, so the live list still names the catalog being replaced. A pl-only
     file was refused here for having no `t` and no `en`, and so was every set without them. */
  const codes=catalogLangs(data);
  const tKey=cardFieldKey("t",codes[0]), bodyKey=cardFieldKey("body",codes[0]);
  const bodyKeys=cardFieldKeys("body",codes);
  const out=[];
  items.forEach((rawM,bi)=>{
    if(!rawM||typeof rawM!=="object") throw new Error("card "+(bi+1)+": not an object");
    const title=String(rawM[tKey]!=null?rawM[tKey]:(rawM.title!=null?rawM.title:"")).trim();
    const cat=String(rawM.c!=null?rawM.c:(rawM.category!=null?rawM.category:"open")).trim()||"open";
    const body=String(rawM[bodyKey]!=null?rawM[bodyKey]:"");
    if(!title) throw new Error("card "+(bi+1)+": title ("+tKey+") is required");
    /* ONLY THE PRIMARY IS REQUIRED, the rule the editor states and the reader relies on: a
       missing translation falls back (see cardLang). Demanding both here refused a file this
       app had just written, since a card with no Polish is exported with an empty one. */
    if(!body.trim()) throw new Error("card "+(bi+1)+' ("'+title+'"): '
      +codes[0].toUpperCase()+" ("+bodyKey+") is required");
    let id=String(rawM.id!=null?rawM.id:"").trim();
    /* THE ENGINE'S ONE MINTING, and its shape is a contract rather than a choice: the same
       string pack.js catalogCardId derives, and the one a 1.16.7 desk keyed its stars, hides
       and card order by. A format 2 card always carries an id, so this fires for a catalog
       carried over from such a desk, and another shape would orphan all three lists. It
       freezes the title, which is why an id that exists is never derived again. */
    if(!id) id="b:"+cat+":"+title;
    const entry={id,c:cat};
    entry[tKey]=title;
    // Every declared language's body, present even when empty, exactly as an export writes them.
    bodyKeys.forEach(k=>{ entry[k]=String(rawM[k]!=null?rawM[k]:""); });
    /* A pin names a language THIS CATALOG DECLARES or it does not exist: anything else would
       silence a card in a language nothing can select. */
    const lk=String(rawM.lockLang!=null?rawM.lockLang:"").trim();
    if(codes.indexOf(lk)>-1) entry.lockLang=lk;
    /* Optional translations, straight off the table - the required keys are read above. A key
       missing from the table is dropped here, which is the whitelist working as intended. */
    cardStorageKeys(codes).forEach(f=>{
      if(cardRequiredKeys(codes).indexOf(f)>-1) return;
      let v=rawM[f];
      if(v==null && CARD_KEY_ALIAS[f]!=null) v=rawM[CARD_KEY_ALIAS[f]];
      v=String(v!=null?v:"").trim();
      if(v) entry[f]=v;
    });
    if(truthyFlag(rawM.alt)) entry.alt=1;
    if(truthyFlag(rawM.seq)) entry.seq=1;
    if(truthyFlag(rawM.firstOnly)) entry.firstOnly=1;
    if(rawM.paxVoc!=null) entry.paxVoc=truthyFlag(rawM.paxVoc)?1:0;
    if(truthyFlag(rawM.allIntents)) entry.allIntents=1;
    if(truthyFlag(rawM.intentTop)) entry.intentTop=1;
    if(Array.isArray(rawM.intents)&&rawM.intents.length){
      entry.intents=rawM.intents.map(x=>{
        if(typeof x==="number"&&Number.isFinite(x)) return x;
        const s=String(x).trim();
        if(/^\d+$/.test(s)) return +s;
        return s;
      }).filter(x=>x!==""&&x!=null);
    }
    out.push(entry);
  });
  // Stable ids if duplicates
  const seen={};
  out.forEach(m=>{
    let id=m.id;
    if(!seen[id]){ seen[id]=1; return; }
    let n=2, cand;
    do{ cand=id+"~"+n; n++; }while(seen[cand]);
    seen[cand]=1;
    m.id=cand;
  });
  return out;
}

export {
  cardToExportPlain,
  parseMacrosData
};
