/* What one card is worth against a typed query, and the order the evidence is applied in.
   Four modules feed it and nothing imports it back, so it sits outside them all. */
import { intentAffinityGroups, cardIntentAffinity, AFFINITY_W } from "./affinity.js";
import { SEARCH_FIELDS, cardSearchIndex } from "./card-search.js";
import { isFavourite } from "./pack.js";
import { termFieldQuality, FIELD_WEIGHT, SAME_FIELD_BONUS, proximityBonus, ADJACENT_BONUS,
         TITLE_START_BONUS, FAV_BONUS } from "./scoring.js";

/** {tier, score} for one card against the typed terms. Lower tier first, then higher score.
    `aterms` is intentAffinityGroups(); render computes it once and passes it in. */
function cardSearchScore(m, terms, aterms){
  const idx=cardSearchIndex(m);
  const fieldHasAll={title:true, keys:true, meta:true, body:true};
  let score=0, strong=true;
  for(let i=0;i<terms.length;i++){
    const term=terms[i];
    let best=0, inStrongField=false;
    for(let f=0;f<SEARCH_FIELDS.length;f++){
      const field=SEARCH_FIELDS[f];
      const q=termFieldQuality(idx, field, term);
      if(!q){ fieldHasAll[field]=false; continue; }
      const v=q*FIELD_WEIGHT[field];
      if(v>best) best=v;
      if(field!=="body") inStrongField=true;
    }
    if(!inStrongField) strong=false;   // needed the body to match at all
    score+=best;
  }
  if(SEARCH_FIELDS.some(f=>fieldHasAll[f])) score*=SAME_FIELD_BONUS;
  /* Added AFTER the same-field multiplier, not before: proximity is a flat piece of evidence
     about where the words sit, and multiplying it by 1.5 as well would make one observation
     count one and a half times. */
  score+=proximityBonus(idx, terms);
  const title=idx.fields.title;
  if(terms.length>1 && title.indexOf(terms.join(" "))!==-1) score+=ADJACENT_BONUS;
  if(title.indexOf(terms[0])===0) score+=TITLE_START_BONUS;
  // How central is this entry to the selected intent, on top of how well it matches the query
  if(aterms===undefined) aterms=intentAffinityGroups();
  if(aterms.length) score+=cardIntentAffinity(m, aterms)*AFFINITY_W;
  // Last, so it lifts the finished score rather than one component of it
  if(isFavourite(m&&m.id)) score*=FAV_BONUS;
  return {tier: strong?0:1, score};
}

export {
  cardSearchScore
};
