const M=[];

// Built-in default; personal edits live in pack.facts (localStorage via savePack).
/* BROKEN INTO LINES BY HAND, necessarily: rendered under white-space:pre - never wraps,
   a long line widens the panel. One line per thought. Name only entries that exist: the
   pencil at the top of this panel is the only way in. */
let FACTS=`Quick facts are yours to write.

Use the pencil above to edit it - fees, deadlines, links, anything you use often.

A catalog can ship its own, and loading it replaces what is here.

What you type stays in this browser only.`;

/* Empty by default: who is on a chat is the business's property - shipping "booker" or
   "pax1" describes someone else's desk. The catalog supplies the list, the user edits it;
   ROLE stays free text, so an empty list costs nothing and no stored value can be
   invalidated. Declared before the catalog-apply IIFE - `let` has no hoisting. */
let WHO_BASE=[];
/* Trim, drop blanks, drop case-insensitive duplicates, keep the author's order and casing.
   Nothing is length-capped or silently discarded beyond that: this is a list somebody typed. */
function normWhoList(v){
  const src=Array.isArray(v)?v:String(v==null?"":v).split(",");
  const out=[], seen=Object.create(null);
  src.forEach(x=>{
    const s=String(x==null?"":x).trim();
    if(!s) return;
    const k=s.toLowerCase();
    if(seen[k]) return;
    seen[k]=1; out.push(s);
  });
  return out;
}
/* Written from the catalog and nowhere else; see setCatalogCatLooks for why through a call. */
function setCatalogFacts(text){ FACTS=text; }
function setCatalogWho(list){ WHO_BASE=list; }

export {
  M, FACTS, WHO_BASE, normWhoList, setCatalogFacts, setCatalogWho,
};
