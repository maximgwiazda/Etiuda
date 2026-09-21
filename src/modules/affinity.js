import { cardSearchIndex } from "./card-search.js";
import { intentArr, CONTENT_LANGS } from "./content-model.js";
import { termFieldQuality, FIELD_WEIGHT } from "./scoring.js";
import { splitWords } from "./words.js";
import { intentIdxs } from "./app-state.js";

/* Intent affinity: two entries both linked and both matching can differ in being ABOUT
   the intent versus merely touching it - the discriminating signal is the intent's own
   label words in the central entry's title and keywords. Title and keywords ONLY: meta is
   identical across a category and cannot discriminate, and bodies mention topics in
   passing. Reading the same fields as everything else means custom intents and custom
   entries work with no special case; labels in both languages, diacritics folded. */
const AFFINITY_FIELDS=["title","keys"];
const AFFINITY_MIN_LEN=4;      // "your" / "oraz" are noise; "name" and "seat" are not
const AFFINITY_W=1;            // affinity is a peer of the query score, not a tiebreaker
const AFFINITY_STOP={your:1,with:1,from:1,this:1,that:1,they:1,have:1,been:1,when:1,what:1,
  will:1,into:1,about:1,twoje:1,twojego:1,twoja:1,swoje:1,oraz:1,jest:1,przez:1};
/* A catalog names the noise words of its own trade, per language, and its list stands in for
   the built-in ONE LANGUAGE AT A TIME: a catalog that speaks to its Polish and leaves English
   alone must not lose the English filler with it. Split by the same splitter that produced the
   word being tested, so a list may be written as it is spoken and case and diacritics decide
   nothing. */
let CATALOG_STOP=null;
function setCatalogStop(map){
  if(!map||typeof map!=="object"){ CATALOG_STOP=null; return; }
  const out={};
  Object.keys(map).forEach(code=>{
    const one={}; let any=false;
    (Array.isArray(map[code])?map[code]:[]).forEach(s=>splitWords(s).forEach(w=>{ one[w]=1; any=true; }));
    if(any) out[code]=one;
  });
  CATALOG_STOP=Object.keys(out).length?out:null;
}
function affinityStop(l){ return (CATALOG_STOP&&CATALOG_STOP[l])||AFFINITY_STOP; }
/* One group per (intent, language); affinity takes the MAX across groups, never the
   sum: the English and Polish labels are one concept expressed twice - matching both is
   the same evidence. Summing paid EN 40 + PL 36 = 76 to an entry whose Polish keywords
   echoed the Polish label, where an English-only list capped near 40. */
/* HOW MUCH A LABEL WORD DISCRIMINATES: the catalog says itself which words it is
   saturated with - no hand-written stoplist can know. Per LANGUAGE: <=10% of labels
   counts in full, >25% for nothing, a straight line between. THE FLAT TOP MATTERS:
   log(N/df) discounted the discriminating words too - a word in a seventh of the labels
   still tells intents apart. Affinity is a bare sum, so this weighting IS the ordering -
   the same idf that measured inert for query terms, opposite verdict, structural reason. */
const AFFINITY_FULL_SHARE=0.10;   // in a tenth of the labels or fewer: counts in full
const AFFINITY_MAX_SHARE=0.25;    // in more than a quarter: counts for nothing
let eLabelStats=null;
/* Dropped from rebuildIntents; see setCatalogCatLooks. */
function dropLabelStats(){ eLabelStats=null; }
function affinityLabelStats(){
  if(eLabelStats) return eLabelStats;
  const mk=arr=>{
    const df=new Map(); let n=0;
    (arr||[]).forEach(s=>{
      const t=String(s==null?"":s);
      if(!t.trim()) return;
      n++;
      new Set(splitWords(t)).forEach(w=>df.set(w,(df.get(w)||0)+1));
    });
    return {df,n};
  };
  /* RAW arrays, never intentFieldAt: an intent with no Polish clause must contribute nothing
     to the Polish statistics rather than contributing the English words a second time. */
  eLabelStats={};
  CONTENT_LANGS.forEach(l=>{ eLabelStats[l]=mk(intentArr("clause",l)||[]); });
  return eLabelStats;
}
/** 0 for a word too common across labels to mean anything, else 0..1 by rarity. */
function affinityWordWeight(w, lang){
  /* THE BUCKET THIS LANGUAGE'S OWN, not one of two: the line above builds one per declared
     language, and reading it through a pair meant a third language's statistics were computed
     and then thrown away while it was weighed by English's. */
  const st=affinityLabelStats()[lang];
  if(!st || st.n<2) return 1;
  const df=st.df.get(w)||0;
  // Absent from every label: a custom intent's own words. Nothing says they are common.
  if(!df) return 1;
  const share=df/st.n;
  if(share>=AFFINITY_MAX_SHARE) return 0;
  if(share<=AFFINITY_FULL_SHARE) return 1;
  // Clamped: the ramp is only valid between the two shares, and a stray share outside them
  // would otherwise produce a NEGATIVE weight - a label word that subtracts.
  const ramp=(AFFINITY_MAX_SHARE-share)/(AFFINITY_MAX_SHARE-AFFINITY_FULL_SHARE);
  return ramp<0?0:(ramp>1?1:ramp);
}
function intentAffinityGroups(){
  if(!intentIdxs.length) return [];
  const groups=[];
  intentIdxs.forEach(i=>{
    CONTENT_LANGS.map(l=>{ const a=intentArr("clause",l); return [l, a?a[i]:""]; }).forEach(pair=>{
      const lang=pair[0], label=pair[1];
      const seen={}, terms=[], stop=affinityStop(lang);
      splitWords(label||"").forEach(w=>{
        if(w.length<AFFINITY_MIN_LEN || stop[w] || seen[w]) return;
        seen[w]=1;
        // Dropped here rather than zero-weighted later, so a label of nothing but common
        // words produces no group at all instead of a group worth nothing.
        if(!affinityWordWeight(w,lang)) return;
        terms.push(w);
      });
      if(terms.length) groups.push({lang, terms});
    });
  });
  return groups;
}
function cardIntentAffinity(m, groups){
  if(!groups || !groups.length) return 0;
  const idx=cardSearchIndex(m);
  let best=0;
  for(let g=0; g<groups.length; g++){
    const terms=groups[g].terms, lang=groups[g].lang;
    let s=0;
    for(let i=0;i<terms.length;i++){
      let b=0;
      for(let f=0;f<AFFINITY_FIELDS.length;f++){
        const field=AFFINITY_FIELDS[f];
        const q=termFieldQuality(idx, field, terms[i]);
        if(q){ const v=q*FIELD_WEIGHT[field]; if(v>b) b=v; }
      }
      // Scaled by how much this word tells one intent from another - see affinityWordWeight.
      s+=b*affinityWordWeight(terms[i],lang);
    }
    // Several intents selected: the best single (intent, language) match wins, so a macro
    // central to one of them is not diluted by the others.
    if(s>best) best=s;
  }
  return best;
}

export {
  dropLabelStats,
  setCatalogStop,
  affinityWordWeight,
  intentAffinityGroups,
  cardIntentAffinity,
  AFFINITY_W
};
