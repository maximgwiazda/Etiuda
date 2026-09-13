/* ONE starter category, so a first card has somewhere to go - nothing else belongs here.
   "always" and "opener" are roles assigned from Manage, so the old built-in categories are
   ordinary catalog content. A catalog replaces this wholesale; do not add content here. */
const CATS={gen:"General"};

// The one canonical intent list. Index-aligned: picking a clause also points at its
// category, and both "Intent confirmed" cards share these exact arrays.
const SW_EN=[];
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
const INTENT_TEXT_FIELDS=["clause","cmt","topic"];
const INTENT_FIELD_KEY={
  clause:{en:"en",    pl:"pl"},
  cmt:   {en:"cmt",   pl:"cmtPl"},
  topic: {en:"topic", pl:"topicPl"}
};
/* AN OVERRIDE OF "" CLEARS a comment or a topic - that is the only way to remove one - but
   never a clause, which an intent cannot be without: an empty one falls back to the catalog's.
   Spelled out per field in rebuildIntents before; the rule belongs beside the table. */
const INTENT_BLANK_CLEARS={clause:false, cmt:true, topic:true};
const SW_STORE={en:SW_EN, pl:SW_PL, cmt:SW_CMT, cmtPl:SW_CMT_PL, topic:SW_TOPIC, topicPl:SW_TOPIC_PL};
function intentArr(field,l){
  const k=INTENT_FIELD_KEY[field];
  return k ? (SW_STORE[k[l]]||null) : null;
}
/* Every storage key the table names, in field then language order. */
function intentStoreKeys(){
  const out=[];
  INTENT_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
    const k=INTENT_FIELD_KEY[f][l];
    if(k && out.indexOf(k)<0) out.push(k);
  }));
  return out;
}

export {
  intentArr,
  intentStoreKeys,
  CATS,
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
