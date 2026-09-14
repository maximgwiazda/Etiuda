import { cardLang, parts } from "./card-model.js";
import { cardMatchesSearch } from "./card-search.js";
import { cardSearchScore } from "./card-score.js";
import { intentAffinityGroups } from "./affinity.js";
import { cardSearchTerms, dropCatalogVocab } from "./spell.js";
import { dropIntentKeywords } from "./intent-text.js";

function recountMacros(){
  eSCountsKey=null; eSCatRank=null; eSCatRankKey=null;   // cards rebuilding; the memos are stale
  dropCatalogVocab();                     // and so are the vocabulary and its corrections
  dropIntentKeywords();                   // and the rare-keyword sets built from those cards
  counts={}; cardCounts={};
  (cards||[]).forEach(m=>{
    if(!m) return;
    /* Both count what is put away. cardCounts answers whether a category can be deleted,
       which is a question about the DATA; counts is what the pill shows, and opening that
       category is exactly where a put-away card appears. Only All leaves them out. */
    cardCounts[m.c]=(cardCounts[m.c]||0)+1;
    counts[m.c]=(counts[m.c]||0)+macroBlockCount(m);
  });
}
/* Displayed counts are MACROS in the user's sense - what an agent chooses between.
   cardCounts keeps the container tally separately, and it is not cosmetic: it guards
   category deletion, since a card empty in this language contributes zero segments. */
let counts={}, cardCounts={};
/* cardLang, not lang: a pinned card splits into the same blocks whichever way the toggle
   points, so a tally that asked the toggle counted the wrong language's blocks for it. */
function macroBlockCount(m){ return m ? parts(m,cardLang(m)).length : 0; }
/* What ALL shows, so put-away is not in it. Each category's own count still carries them,
   because opening that category is where they appear. */
function totalMacroCount(){
  return (cards||[]).reduce((t,m)=>t+((m&&m._hidden)?0:macroBlockCount(m)),0);
}
/* Recomputed on language switch as well as on rebuild: segment counts are per-language, since a
   catalog may split a card into a different number of blocks in EN and PL. */
/* Per-category MATCH counts for the live query, null when nothing is typed: the pills
   already carry a number, so the number means matches while a query runs - the answer
   sits where you act on it. Same predicate as the list minus the category filter (the
   question is about categories you are NOT in); hidden stays out. Memoised on the query;
   recountMacros() drops the memo whenever `cards` is rebuilt. */
/* eSCatRank rides along: {cat: {tier, rank}} for the same query, built in the same pass because
   this loop has already filtered every card and the marginal cost is scoring the survivors.
   It is what lets the pill row lead with the category your query is ABOUT - see displayCatOrder. */
let eSCounts=null, eSCountsKey=null, eSCatRank=null;
function searchCounts(){
  const terms=cardSearchTerms();
  if(!terms.length){ eSCounts=null; eSCountsKey=null; eSCatRank=null; return null; }
  const key=terms.join(" ");
  if(key===eSCountsKey && eSCounts) return eSCounts;
  const out={__all:0};
  (cards||[]).forEach(m=>{
    if(!m || m._hidden) return;                 // a query never reaches one, so it never counts one
    if(!cardMatchesSearch(m,terms)) return;
    const n=macroBlockCount(m);
    out[m.c]=(out[m.c]||0)+n;
    out.__all+=n;
  });
  eSCounts=out; eSCountsKey=key;
  return out;
}
/* SEPARATE from searchCounts, its own memo key: the counts are cheap and per-keystroke,
   this scores every match and feeds the debounced ORDER. DAMPED SUM (best full, second
   half, third a third): one excellent card beats a pile of mediocre ones, several good
   still outweigh one - 1/i is the middle of sum and max. */
let eSCatRankKey=null;
function searchCatRank(){
  const terms=cardSearchTerms();
  if(!terms.length){ eSCatRank=null; eSCatRankKey=null; return null; }
  const key=terms.join(" ");
  if(key===eSCatRankKey && eSCatRank) return eSCatRank;
  const per={};
  const aterms=intentAffinityGroups();
  (cards||[]).forEach(m=>{
    if(!m || m._hidden) return;
    if(!cardMatchesSearch(m,terms)) return;
    const s=cardSearchScore(m,terms,aterms);
    const p=per[m.c] || (per[m.c]={tier:9, scores:[]});
    if(s.tier<p.tier) p.tier=s.tier;
    p.scores.push(s.score);
  });
  const rank={};
  Object.keys(per).forEach(k=>{
    const s=per[k].scores.sort((a,b)=>b-a);
    let v=0;
    for(let i=0;i<s.length;i++) v+=s[i]/(i+1);
    rank[k]={tier:per[k].tier, rank:v};
  });
  eSCatRank=rank; eSCatRankKey=key;
  return rank;
}
/* THE ONE PLACE THAT DECIDES WHERE A PUT-AWAY CARD MAY APPEAR: at the foot of its own
   category, and nowhere else. Not in All, because a card set aside does not belong among the
   ones that were not, and not in any search, because being offered is the thing you put it
   away to stop. So it wants a category chosen AND an empty box - together those mean "show me
   this shelf" rather than "find me something". Put-away is not a category of its own: the same
   ruling that took the Favourites pill away, and for the same reason. */
function cardInActiveCats(m,terms){
  if(!cats.length) return !(m&&m._hidden);
  if(m&&m._hidden && terms && terms.length) return false;
  return cats.some(k=>m.c===k);
}
export {
  cardInActiveCats,
  counts,
  cardCounts,
  macroBlockCount,
  totalMacroCount,
  searchCounts,
  searchCatRank,
  recountMacros,
};
