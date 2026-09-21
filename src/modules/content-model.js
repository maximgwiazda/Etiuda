/* ONE starter category, so a first card has somewhere to go - nothing else belongs here.
   "always" and "opener" are roles assigned from Manage, so the old built-in categories are
   ordinary catalog content. A catalog replaces this wholesale; do not add content here. */
const CATS={gen:"General"};

// The one canonical intent list. Index-aligned: picking a clause also points at its
// category, and both "Intent confirmed" cards share these exact arrays.
const SW_EN=[];
/* THE CATALOG'S OWN ID FOR EACH INTENT, index-aligned with the arrays here and filled at
   eApplyCatalog. Since 2.0.0 it is what the personal layer is keyed by: an index moves when a
   request is inserted or deleted, and an override that moves has been applied to the wrong
   clause in silence. Empty for a file older than request ids - loadPack says what happens then. */
const SW_IDS=[];
function setIntentIds(ids){
  SW_IDS.length=0;
  (Array.isArray(ids)?ids:[]).forEach(v=>SW_IDS.push(String(v==null?"":v)));
}
const SW_PL=[];
// SW_CMT = what was DONE; SW_TOPIC = the subject ("advised about X").
const SW_CMT=[];
/* The Polish half of ACTION, optional exactly as topicPl is: a catalog that leaves it
   empty renders the English, which is what a desk writing English-only comments wants.
   It exists because "we do not use it" is a statement about one desk, not about the tool. */
const SW_CMT_PL=[];
/* Reads as "advised about {TOPIC}" - written as natural English, since a click costs
   the same as shorthand. Countable things on the booking take "the"; mass nouns and
   gerunds correctly take no article. */
const SW_TOPIC=[];
/* The Polish half of TOPIC. Optional: a catalog without it falls back to the English
   value, so nothing that worked before this stops working. */
const SW_TOPIC_PL=[];
/* WHERE EACH FIELD OF EACH LANGUAGE LIVES, so a reader names the two rather than the array.
   The card side has carried the same table since its own languages became additive - see
   CARD_FIELD_KEY - and this is that table for the intent list. The storage keys are the
   catalog's own, which is what keeps the format unchanged while the readers stop naming it. */
/* DECLARED HERE, not beside the card table that documents it: a catalog is adopted while the
   page is still parsing, and both field tables are read on that path. The note on its meaning
   lives with CARD_FIELD_KEY, which is the table it was written for. */
const CONTENT_LANGS=["en","pl"];
/* WHERE A LANGUAGE THE TABLES DO NOT NAME LIVES: the field name, a colon, the code - "t:de",
   "clause:de". A colon occurs in no key the two-language shape ever wrote, so the derived
   namespace cannot collide with the legacy one, and the tables' own entries stay the legacy
   spelling of the founding pair - read for ever, written until the format's next version,
   which is what keeps an existing desk.json and an exported macro file valid. The derived key
   becomes FORMAT the day a desk saves an override in such a language. */
function langColumn(field,l){
  const code=String(l==null?"":l);
  return code ? field+":"+code : "";
}
const BUILT_IN_LANGS=CONTENT_LANGS.slice();
const INTENT_TEXT_FIELDS=["clause","cmt","topic"];
const INTENT_FIELD_KEY={
  clause:{en:"en",    pl:"pl"},
  cmt:   {en:"cmt",   pl:"cmtPl"},
  topic: {en:"topic", pl:"topicPl"}
};
// The code's OWN entry or none: the trap is at v2ColKey in catalog-v2.js.
function intentFieldKey(field,l){
  const map=INTENT_FIELD_KEY[field];
  if(!map) return "";
  return Object.prototype.hasOwnProperty.call(map,l) ? map[l] : langColumn(field,l);
}
/* AN OVERRIDE OF "" CLEARS a comment or a topic - that is the only way to remove one - but
   never a clause, which an intent cannot be without: an empty one falls back to the catalog's.
   Spelled out per field in rebuildIntents before; the rule belongs beside the table. */
const INTENT_BLANK_CLEARS={clause:false, cmt:true, topic:true};
const SW_STORE={en:SW_EN, pl:SW_PL, cmt:SW_CMT, cmtPl:SW_CMT_PL, topic:SW_TOPIC, topicPl:SW_TOPIC_PL};
function intentArr(field,l){
  const k=intentFieldKey(field,l);
  return k ? (SW_STORE[k]||null) : null;
}
/* HOW MANY INTENTS THERE ARE, which is the PRIMARY's clause column and not English's: a
   catalog declaring neither en nor pl leaves SW_EN empty, and every list that asked it for a
   length then showed nothing. Every column is padded to this at eApplyCatalog. */
function intentCount(){
  return (intentArr("clause",CONTENT_LANGS[0])||[]).length;
}
/* THE CATALOG SAYS WHICH LANGUAGES IT SPEAKS AND IN WHICH ORDER, and the first of them is
   primary everywhere that asks for one. Filled in place, never rebound: every reader holds
   this array. ANY CODE IS ACCEPTED, the column being derived where the tables name none, and a
   catalog that declares none keeps the built-in pair. The store gains an array per declared
   column here, because every reader past this point reaches it by key. */
function setContentLangs(codes){
  const want=(Array.isArray(codes)?codes:[])
    .map(c=>String(c==null?"":c))
    .filter((c,i,all)=>c && all.indexOf(c)===i);
  const use=want.length?want:BUILT_IN_LANGS;
  CONTENT_LANGS.length=0;
  use.forEach(c=>CONTENT_LANGS.push(c));
  intentStoreKeys().forEach(k=>{ if(!SW_STORE[k]) SW_STORE[k]=[]; });
  if(CONTENT_LANGS.indexOf(COMMENT_LANG)<0) COMMENT_LANG="";
}
/* WHAT A CATALOG OBJECT DECLARES, read off the object and never off the live list: a file is
   validated before setContentLangs has run, so asking CONTENT_LANGS there answers with the
   OUTGOING catalog's languages. A file declaring none is the historical pair. */
function catalogLangs(c){
  const raw=(c&&Array.isArray(c.langs))?c.langs:[];
  const out=raw.map(x=>String((x&&x.code)||"")).filter((v,i,all)=>v&&all.indexOf(v)===i);
  return out.length?out:BUILT_IN_LANGS.slice();
}
/* THE LANGUAGE AFTER THIS ONE, cyclically, which is what "the other language" has to mean once
   there can be more than two of them - the shortcut's rule at the spec's three and four, read
   by every caller that used to flip between a pair. */
function nextContentLang(l){
  const i=CONTENT_LANGS.indexOf(l);
  if(i<0||CONTENT_LANGS.length<2) return CONTENT_LANGS[0]||String(l==null?"":l);
  return CONTENT_LANGS[(i+1)%CONTENT_LANGS.length];
}
/* Spec 2.1: a missing action or topic falls back to this language, never to empty.
   Optional; defaults to langs[0]. A code this catalog does not speak is ignored. */
let COMMENT_LANG="";
function setCommentLang(code){
  const c=String(code==null?"":code);
  COMMENT_LANG=(CONTENT_LANGS.indexOf(c)>-1)?c:"";
}
function commentLang(){
  return COMMENT_LANG || CONTENT_LANGS[0];
}
/* Every storage key the table names, in field then language order. */
function intentStoreKeys(){
  const out=[];
  INTENT_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
    const k=intentFieldKey(f,l);
    if(k && out.indexOf(k)<0) out.push(k);
  }));
  return out;
}

export {
  catalogLangs,
  nextContentLang,
  intentArr,
  intentCount,
  intentFieldKey,
  intentStoreKeys,
  langColumn,
  setContentLangs,
  setCommentLang,
  commentLang,
  setIntentIds,
  CATS,
  SW_IDS,
  SW_EN,
  SW_PL,
  SW_CMT,
  SW_CMT_PL,
  SW_TOPIC,
  SW_TOPIC_PL,
  CONTENT_LANGS,
  INTENT_TEXT_FIELDS,
  INTENT_FIELD_KEY,
  INTENT_BLANK_CLEARS,
  SW_STORE
};
