/* WHAT A NEW EDITION CHANGES, card by card, worked out on this computer before anything is loaded: the
   offer lists it, the panel shows it, and the load that follows settles the desk's own edits against
   the same comparison. Pure: no page, no storage, nothing but the two catalogs and the layer handed in. */
import { CARD_TEXT_FIELDS, cardFieldKey } from "./card-fields.js";
import { catalogLangs } from "./content-model.js";

// The order the offer lists the kinds in.
const EDITION_KINDS=["changed","new","restored","retired","removed"];

/* Every text field of a card in every language either edition declares: the title, the text and the
   note. Keywords, links, flags and the card's place are left out, as the order of the cards is. */
function editionFieldKeys(a,b){
  const codes=catalogLangs(a).concat(catalogLangs(b)).filter((c,i,all)=>all.indexOf(c)===i);
  const out=[];
  CARD_TEXT_FIELDS.forEach(field=>codes.forEach(code=>{
    const key=cardFieldKey(field,code);
    if(key && !out.some(k=>k.key===key)) out.push({field:field, code:code, key:key});
  }));
  return out;
}
function editionText(m,key){ return String(m && m[key]!=null ? m[key] : ""); }
/** `held` is the catalog loaded now and `offered` the one asked about, both as the runtime keeps them;
 *  `layer` is this desk's own: overrides, removed and favourites. A card the desk removed is nobody's
 *  news. `own` marks a changed card where a field the lead changed is one the agent wrote otherwise. */
function editionChanges(held,offered,layer){
  const lay=layer||{}, ov=lay.overrides||{};
  const gone=new Set(lay.removed||[]), stars=new Set(lay.favourites||[]);
  const keys=editionFieldKeys(held,offered);
  const was=new Map(((held&&held.cards)||[]).map(m=>[String(m.id),m]));
  const now=new Map(((offered&&offered.cards)||[]).map(m=>[String(m.id),m]));
  const items=[];
  now.forEach((m,id)=>{
    const b=was.get(id);
    if(!b){ if(!m.retired) items.push({id:id, kind:"new", fields:[]}); return; }
    if(gone.has(id) || (m.retired && b.retired)) return;
    if(m.retired){ items.push({id:id, kind:"retired", fields:[], asleep:stars.has(id)||!!ov[id]}); return; }
    if(b.retired){ items.push({id:id, kind:"restored", fields:[]}); return; }
    const fields=keys.filter(k=>editionText(b,k.key)!==editionText(m,k.key));
    if(!fields.length) return;
    const mine=ov[id];
    items.push({id:id, kind:"changed", fields:fields,
      own:!!mine && fields.some(k=>mine[k.key]!=null && String(mine[k.key])!==editionText(m,k.key))});
  });
  was.forEach((b,id)=>{ if(!now.has(id) && !gone.has(id) && !b.retired) items.push({id:id, kind:"removed", fields:[]}); });
  const at=k=>EDITION_KINDS.indexOf(k);
  items.sort((x,y)=>at(x.kind)-at(y.kind));
  const counts={};
  EDITION_KINDS.forEach(k=>{ counts[k]=0; });
  items.forEach(i=>{ counts[i.kind]++; });
  return {items:items, counts:counts};
}
/* The lead's note for an edition, in the interface's language where the lead wrote one, else the
   catalog's first language, else whichever the lead did write. "" where there is none. */
function editionNoteText(c,ui){
  const n=c && c.notes;
  if(!n || typeof n!=="object") return "";
  const pick=[ui].concat(catalogLangs(c), Object.keys(n));
  for(const code of pick){
    const v=Object.prototype.hasOwnProperty.call(n,code) ? n[code] : null;
    if(typeof v==="string" && v.trim()) return v.trim();
  }
  return "";
}
/* WORD BY WORD, the spaces kept as tokens of their own so the two sides join back to their texts.
   What the common prefix and suffix leave is compared by the longest common run; past the cap the
   middle is said to have changed whole, which is true and costs nothing. */
const EDITION_DIFF_CAP=250000;
function wordDiff(a,b){
  const A=String(a==null?"":a).match(/\s+|\S+/g)||[], B=String(b==null?"":b).match(/\s+|\S+/g)||[];
  let s=0, ea=A.length, eb=B.length;
  while(s<ea && s<eb && A[s]===B[s]) s++;
  while(ea>s && eb>s && A[ea-1]===B[eb-1]){ ea--; eb--; }
  const out=[];
  const put=(op,text)=>{ if(!text) return; const l=out[out.length-1]; if(l && l.op===op) l.text+=text; else out.push({op:op, text:text}); };
  put("same",A.slice(0,s).join(""));
  const a2=A.slice(s,ea), b2=B.slice(s,eb), n=a2.length, m=b2.length;
  if(n*m>EDITION_DIFF_CAP){ put("del",a2.join("")); put("ins",b2.join("")); }
  else {
    const w=m+1, L=new Uint32Array((n+1)*w);
    for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
      L[i*w+j]=a2[i]===b2[j] ? L[(i+1)*w+j+1]+1 : Math.max(L[(i+1)*w+j], L[i*w+j+1]);
    let i=0, j=0;
    while(i<n && j<m){
      if(a2[i]===b2[j]){ put("same",a2[i]); i++; j++; }
      else if(L[(i+1)*w+j]>=L[i*w+j+1]){ put("del",a2[i]); i++; }
      else { put("ins",b2[j]); j++; }
    }
    while(i<n) put("del",a2[i++]);
    while(j<m) put("ins",b2[j++]);
  }
  put("same",A.slice(ea).join(""));
  return out;
}

export {
  EDITION_KINDS,
  editionFieldKeys,
  editionChanges,
  editionNoteText,
  wordDiff
};
