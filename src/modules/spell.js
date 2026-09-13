import { cardSearchIndex } from "./card-search.js";
import { foldDiacritics, wordMatchesTerm } from "./words.js";

/* ---- TYPO TOLERANCE: SPELL CORRECTION, NOT FUZZY MATCHING - fuzzy would relax every
   term (change/charge are one edit apart). A term is REPLACED, once, before the search,
   and ONLY when it currently matches NOTHING - no query that works today can be loosened.
   Replacements come from the catalog's own vocabulary (ties to the most-carded word);
   eSpellFix records the substitution for the UI to own up to. Length floor 5: under it,
   distance 1 means a different word, not a typo. */
const TYPO_MIN_LEN=5;
let eVocab=null;          // every distinct word in the catalog; cleared by recountMacros
let eTypoFix=new Map();   // raw term -> corrected term or "" ; same lifetime
let eSpellFix=[];         // [{from,to}] for the last cardSearchTerms() call - read by the UI
/* One lifetime, so they go together; called from recountMacros. See setCatalogCatLooks. */
function dropCatalogVocab(){ eVocab=null; eTypoFix.clear(); }
function catalogVocab(){
  if(eVocab) return eVocab;
  const v=new Map();       // word -> how many cards contain it
  (cards||[]).forEach(m=>{
    if(!m) return;
    const seen=new Set(cardSearchIndex(m).allWords);
    seen.forEach(w=>{ if(w.length>=TYPO_MIN_LEN-1) v.set(w,(v.get(w)||0)+1); });
  });
  eVocab=v;
  return v;
}
/** True when a and b are one insertion, deletion, substitution or transposition apart. Linear:
 *  walk to the first difference, then require ONE of the four repairs to leave the tails equal. */
function editDistance1(a,b){
  if(a===b) return false;                       // identical is not a correction
  const la=a.length, lb=b.length;
  if(Math.abs(la-lb)>1) return false;
  let i=0;
  while(i<la && i<lb && a.charCodeAt(i)===b.charCodeAt(i)) i++;
  if(la===lb){
    // substitution: tails must match after skipping one char each
    if(a.slice(i+1)===b.slice(i+1)) return true;
    // transposition of the two characters at the seam
    return a[i]===b[i+1] && a[i+1]===b[i] && a.slice(i+2)===b.slice(i+2);
  }
  // one longer: drop its extra character and require the rest to line up
  return la>lb ? a.slice(i+1)===b.slice(i) : b.slice(i+1)===a.slice(i);
}
/** Does this term reach anything at all, by any of the normal rules? Vocabulary-only, so it
 *  costs a scan of the distinct words rather than of every card and every field. */
function termReachesSomething(term){
  const v=catalogVocab();
  for(const w of v.keys()){
    if(w.indexOf(term)!==-1) return true;       // covers the substring rule ("fund" in "refund")
    if(wordMatchesTerm(w,term)) return true;
  }
  return false;
}
/** The correction for a term that reaches nothing, or "" when there is no confident one. */
function correctTerm(term){
  if(eTypoFix.has(term)) return eTypoFix.get(term);
  let fix="";
  if(term.length>=TYPO_MIN_LEN && !termReachesSomething(term)){
    let bestN=0;
    catalogVocab().forEach((n,w)=>{
      if(w.length<TYPO_MIN_LEN || !editDistance1(term,w)) return;
      if(n>bestN){ bestN=n; fix=w; }            // the reading that appears in the most cards
    });
  }
  eTypoFix.set(term,fix);
  return fix;
}
function cardSearchTerms(){
  const t=foldDiacritics(String(intentEl&&intentEl.value||"").trim().toLowerCase());
  if(!t) return []; // bare / mode - no filter until more characters
  const raw=t.split(/\s+/).filter(Boolean);
  const fixes=[];
  const out=raw.map(term=>{
    const fix=correctTerm(term);
    if(fix){ fixes.push({from:term,to:fix}); return fix; }
    return term;
  });
  /* Recorded rather than returned, so every existing caller keeps its signature - and there are
     several (render, searchCounts, the pill row), all of which must agree on the same terms or
     the counts and the list would tell different stories. */
  eSpellFix=fixes;
  return out;
}

export {
  dropCatalogVocab,
  cardSearchTerms,
  eSpellFix
};
