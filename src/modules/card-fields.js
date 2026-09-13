import { CONTENT_LANGS } from "./content-model.js";

/* ---- Which language a card speaks: normally the EN/PL toggle decides; a card may
   PIN itself, and then shows that version and resolves every token in it whatever the
   toggle says. For internal comments - English on every desk - which today duplicate
   their English into the Polish field: works for the text, does nothing for the tokens. */
/* ONE TABLE SAYS WHERE EVERY TRANSLATABLE CARD FIELD LIVES, per language. Readers and the
   plumbing both go through it, so adding a language is an entry here rather than a new suffix
   threaded through the export, the importer, the override and the editor. CONTENT_LANGS is the
   declared order and its FIRST entry is primary: the language a card id is derived from, and
   the one a missing translation falls back to. */
const CARD_FIELD_KEY={
  t:    {en:"t",    pl:"tPl"},
  body: {en:"en",   pl:"pl"},
  note: {en:"note", pl:"notePl"}
};
const CARD_TEXT_FIELDS=Object.keys(CARD_FIELD_KEY);
/* Stored on a card, set from the editor, carried by the format - but neither a translation nor
   a boolean flag, so the two loops that handle those both used to miss it. Everything that
   copies a card field must include this list. */
const CARD_PLAIN_FIELDS=["lockLang"];
/* THE ADVANCED FLAGS, NAMED ONCE, with the box each one lives in. Six sites used to list
   this set by hand and four had drifted, every one of them dropping a different member.
   The id belongs here rather than beside the markup for exactly that reason: a second list
   is a second thing to forget. */
const CARD_FLAG_BOX={alt:"meAlt",seq:"meSeq",firstOnly:"meFirst",paxVoc:"meVoc",
  allIntents:"meAllIntents",intentTop:"meIntentTop"};
const CARD_FLAGS=Object.keys(CARD_FLAG_BOX);
/* paxVoc is the exception at every site. ABSENT means "follow firstOnly", so it compares by
   EFFECT through paxVocOn() and is stored even when 0 - deleting a false one the way a plain
   flag is deleted would let the fallback switch it back on. */
const CARD_BOOL_FLAGS=CARD_FLAGS.filter(f=>f!=="paxVoc");
/* ABSENT MEANS "as it behaved before this existed": the vocative rode on firstOnly, so a
   catalog written without the flag keeps exactly the sentences it had. Present decides for
   itself - including a 0 on a card that also fills the first name only, which is the case
   that had no way to be expressed. */
function paxVocOn(m){
  if(m && m.paxVoc!=null) return !!(+m.paxVoc);
  return !!(m && m.firstOnly);
}
/* KEYWORDS ARE NOT A TRANSLATION. A title, a macro and a note each have a VERSION per language;
   the words someone might type to find the card only accumulate. Splitting them asks the editor
   which language a reference code belongs to - a question with no answer - and would have it retyped in
   every tab a new language adds. Search reads one bag either way. */
const CARD_SHARED_FIELDS=["k"];
// A pre-1.0 file spelled the keyword field in full.
const CARD_KEY_ALIAS={k:"keywords"};
function cardFieldKey(field,l){ const map=CARD_FIELD_KEY[field]; return (map&&map[l])||""; }
/* Every storage key a field uses, in declared order - for the plumbing that must carry ALL of
   them rather than choose one. */
function cardFieldKeys(field){ return CONTENT_LANGS.map(l=>cardFieldKey(field,l)).filter(Boolean); }
function cardStorageKeys(){
  const out=[];
  CARD_TEXT_FIELDS.forEach(f=>cardFieldKeys(f).forEach(k=>{ if(out.indexOf(k)<0) out.push(k); }));
  CARD_SHARED_FIELDS.forEach(k=>{ if(out.indexOf(k)<0) out.push(k); });
  return out;
}
/* Written unconditionally by an export and demanded by the importer: both macro languages, and
   the primary title an id is built from. */
function cardRequiredKeys(){ return cardFieldKeys("body").concat(cardFieldKey("t",CONTENT_LANGS[0])); }

export {
  cardFieldKey,
  cardFieldKeys,
  cardStorageKeys,
  cardRequiredKeys,
  CARD_TEXT_FIELDS,
  CARD_PLAIN_FIELDS,
  CARD_FLAG_BOX,
  CARD_FLAGS,
  CARD_BOOL_FLAGS,
  paxVocOn,
  CARD_SHARED_FIELDS,
  CARD_KEY_ALIAS
};
