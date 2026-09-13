import { SEARCH_FIELDS } from "./card-search.js";
import { sharedPrefixLen, wordMatchesTerm, WORD_PREFIX_MIN, WORD_STEM_MIN } from "./words.js";

/* Relevance ranking (macro search only). Filter first, score the survivors: a query
   leaves 15-30 of ~200 entries, so the cost follows the result set. Two tiers sit above
   the score because the missing distinction was "ABOUT my query, or merely mentions it" -
   half a typical result set matched on body alone and outranked the real answers whenever
   its category happened to sit higher in catOrder. */
const FIELD_WEIGHT={title:10, keys:6, meta:3, body:1};
const Q_EXACT=3, Q_PREFIX=2, Q_LOOSE=1;
const SAME_FIELD_BONUS=1.5;  // every term landed in one field ("flight change" in one title)
const ADJACENT_BONUS=8;      // terms consecutive and in order in the title
const TITLE_START_BONUS=4;   // title opens with the query
/* FAV_BONUS multiplies the SCORE and never touches the TIER: a favourite that merely
   mentions the query can never outrank a card genuinely about it; within a tier it
   overturns ties, not real gaps. 1.15 clears the measured title-start deficit.
   Multiplicative on purpose: scores scale with term count, so a flat bonus dominates
   one-word queries and vanishes in long ones. A star says "I reach for this often". */
const FAV_BONUS=1.15;
/* THE STEM CASE GRADES BOTH WAYS: change/changes is PREFIX whichever one is typed -
   one word is the other plus an ending, and argument order must not decide the grade.
   The floor is WORD_STEM_MIN, same as wordMatchesTerm, so "cat" is not "catalog"'s stem. */
function termWordQuality(word, term){
  if(word===term) return Q_EXACT;
  if(word.indexOf(term)===0) return Q_PREFIX;                                  // change -> changes
  if(word.length>=WORD_STEM_MIN && term.indexOf(word)===0) return Q_PREFIX;    // changes -> change
  /* A LONG SHARED STEM IS THE SAME WORD: cancelled/cancellation is one word wearing two
     endings (Q_PREFIX); fund/refund is a spelling accident worth the lowest grade -
     different kinds of evidence that must not share one grade. Bounded by the same floors
     wordMatchesTerm uses, so par/partner and pass/passport stay unmatched. */
  if(term.length>=WORD_PREFIX_MIN && sharedPrefixLen(word,term)>=WORD_PREFIX_MIN) return Q_PREFIX;
  return wordMatchesTerm(word,term) ? Q_LOOSE : 0;
}
function termFieldQuality(idx, field, term){
  const words=idx.words[field]||[];
  let best=0;
  for(let i=0;i<words.length;i++){
    const q=termWordQuality(words[i],term);
    if(q>best){ best=q; if(best===Q_EXACT) break; }
  }
  // Substring buried inside a word ("fund" in "refund") never surfaces as a word match.
  if(!best && idx.fields[field].indexOf(term)!==-1) best=Q_LOOSE;
  return best;
}
/* TERM RARITY (idf) WEIGHTING WAS BUILT AND MEASURED INERT - do not rebuild it on the
   same reasoning. A full-title match already collects same-field, adjacency and
   title-start together, and FIELD_WEIGHT separates cards by 10:1 - an order of magnitude
   past the spread idf produces at this catalog size. Also measured: rarity does NOT
   separate content words from filler here - any statistical stopword attempt must
   disprove that first. */
/* ---- PROXIMITY: the smallest window containing every term, per field, and the bonus
   decays as it widens - terms touching worth the most, opposite ends of a long card
   nothing. Order-INDEPENDENT on purpose: "bag damaged" is the same observation as
   "damaged bag"; the ordered, contiguous, in-the-title case is what ADJACENT_BONUS
   already pays a premium for - two different measurements, both worth having.
   MAX ACROSS FIELDS, never a sum - a phrase in both title and body is one piece of
   evidence, not two. PROX_FIELD keeps a body coincidence quieter than a title one, but
   deliberately not FIELD_WEIGHT's full 10:1: inside tier 1 ~3 points genuinely separates
   "damaged bag" from a card merely containing both words; in tier 0 the same 6 is a
   nudge against 30-90 - a tie-breaker between good answers, never a manufacturer of one.
   Positions come from the index's word arrays; the substring fallback has no position and
   is skipped - a term buried inside a longer word says nothing about where things sit. */
const PROX_BONUS=6;
const PROX_FIELD={title:1, keys:0.8, meta:0.6, body:0.5};
/** Word positions in one field whose word matches this term. */
function termPositions(idx, field, term){
  const words=idx.words[field]||[], out=[];
  for(let i=0;i<words.length;i++) if(termWordQuality(words[i],term)) out.push(i);
  return out;
}
/** Smallest window covering one position from every list, or -1 if any list is empty.
 *  Advances the lowest pointer each round - the standard sweep, and it cannot miss the minimum
 *  because any window is bounded below by some list's current head. */
function minWindowSpan(lists){
  for(let i=0;i<lists.length;i++) if(!lists[i].length) return -1;
  const ptr=new Array(lists.length).fill(0);
  let best=Infinity;
  for(;;){
    let lo=Infinity, hi=-Infinity, loIdx=0;
    for(let i=0;i<lists.length;i++){
      const v=lists[i][ptr[i]];
      if(v<lo){ lo=v; loIdx=i; }
      if(v>hi) hi=v;
    }
    const span=hi-lo+1;
    if(span<best) best=span;
    if(best===lists.length) break;            // contiguous - nothing can beat it
    ptr[loIdx]++;
    if(ptr[loIdx]>=lists[loIdx].length) break;
  }
  return best===Infinity ? -1 : best;
}
function proximityBonus(idx, terms){
  if(!terms || terms.length<2) return 0;
  let best=0;
  for(let f=0;f<SEARCH_FIELDS.length;f++){
    const field=SEARCH_FIELDS[f];
    const lists=terms.map(t=>termPositions(idx, field, t));
    const span=minWindowSpan(lists);
    if(span<0) continue;                      // this field does not hold every term
    const gap=Math.max(0, span-terms.length); // 0 when they are touching
    const v=PROX_BONUS*(PROX_FIELD[field]||0.5)/(1+gap);
    if(v>best) best=v;
  }
  return best;
}

export {
  termFieldQuality,
  proximityBonus,
  FIELD_WEIGHT,
  Q_EXACT,
  SAME_FIELD_BONUS,
  ADJACENT_BONUS,
  TITLE_START_BONUS,
  FAV_BONUS
};
