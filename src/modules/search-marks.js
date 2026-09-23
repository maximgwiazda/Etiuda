/* The words a search matched, marked where they stand in the cards once the search has settled.
   The Highlight API paints ranges without touching the DOM, so no card is rebuilt and nothing
   reflows. Word starts only, by the search's own rule, so a mark never claims a match the list
   did not make. */
import { list } from "./dom.js";
import { mgReduceMotion, afterPaint } from "./motion.js";
import { pageScroller } from "./page-scroll.js";
import { foldDiacritics, sharedPrefixLen, wordMatchesTerm } from "./words.js";

const HIT_WORD=/[\p{L}\p{N}]+/gu;
let eHitTerms="", eHitInT=0, eHitScrollT=0, eHitScrollOn=false;

function hitsPaintable(){
  return typeof CSS!=="undefined" && !!CSS.highlights && typeof Highlight==="function";
}
function clearSearchMarks(){
  clearTimeout(eHitInT);
  if(!hitsPaintable()) return;
  CSS.highlights.delete("e-hit");
  CSS.highlights.delete("e-hit-in");
}
// How much of a folded word the term accounts for, or 0 when the search would not match it.
function hitLen(word, term){
  if(!wordMatchesTerm(word, term)) return 0;
  if(word.indexOf(term)===0) return term.length;
  if(term.indexOf(word)===0) return word.length;
  return sharedPrefixLen(word, term);
}
// Folding can lengthen a letter (ß, æ), so a folded length is walked back to the raw one.
function rawLen(word, folded){
  let n=0, i=0;
  for(const ch of word){
    if(n>=folded) break;
    n+=foldDiacritics(ch.toLowerCase()).length;
    i+=ch.length;
  }
  return i;
}
/* Cards within a screen of the view, and the scroll marks the rest as they arrive: a whole
   catalog's text walked at every settle is the cost this avoids. The rects are painted ones and
   the settle's glide may be moving them, but a glide starts and ends within 200px of the view. */
function hitRanges(terms){
  const out=[], vh=window.innerHeight;
  list.querySelectorAll(".card[data-id]").forEach(card=>{
    const r=card.getBoundingClientRect();
    if(!r.width || r.bottom<-vh || r.top>2*vh) return;
    card.querySelectorAll(".ctitle, .txt").forEach(el=>{
      const walk=document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for(let n=walk.nextNode(); n; n=walk.nextNode()){
        if(n.parentElement && n.parentElement.closest(".tag")) continue;
        HIT_WORD.lastIndex=0;
        let m;
        while((m=HIT_WORD.exec(n.data))){
          const w=foldDiacritics(m[0].toLowerCase());
          let best=0;
          terms.forEach(tm=>{ best=Math.max(best, hitLen(w, tm)); });
          if(!best) continue;
          const g=document.createRange();
          g.setStart(n, m.index);
          g.setEnd(n, m.index+rawLen(m[0], best));
          out.push(g);
        }
      }
    });
  });
  return out;
}
/* A new query's marks arrive in two steps 70ms apart, a fade the eye reads with nothing
   animated per frame; the same query marked again (a pill, a scroll) lands at once. */
function paintHits(fresh){
  if(!eHitTerms || !list) return;
  const hi=new Highlight(...hitRanges(eHitTerms.split(" ")));
  clearTimeout(eHitInT);
  if(!fresh || mgReduceMotion()){
    CSS.highlights.delete("e-hit-in");
    CSS.highlights.set("e-hit", hi);
    return;
  }
  CSS.highlights.delete("e-hit");
  CSS.highlights.set("e-hit-in", hi);
  eHitInT=setTimeout(()=>{
    CSS.highlights.delete("e-hit-in");
    CSS.highlights.set("e-hit", hi);
  },70);
}
function onHitScroll(){
  if(!eHitTerms) return;
  clearTimeout(eHitScrollT);
  eHitScrollT=setTimeout(()=>paintHits(false),160);
}
/* render() calls this with the terms it filtered by, and a keystroke never reaches render(), so
   marks change only when the list does. Single letters mark nothing: they start half the words. */
function markSearchHits(terms){
  if(!hitsPaintable()) return;
  const use=(terms||[]).filter(tm=>tm.length>=2);
  const key=use.join(" ");
  if(!key){ eHitTerms=""; clearSearchMarks(); return; }
  if(!eHitScrollOn){
    eHitScrollOn=true;
    pageScroller().addEventListener("scroll", onHitScroll, {passive:true});
  }
  const fresh=key!==eHitTerms;
  eHitTerms=key;
  afterPaint(()=>paintHits(fresh));
}

export {
  markSearchHits
};
