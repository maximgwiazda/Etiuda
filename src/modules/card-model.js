import { cardFieldKey, cardStorageKeys, CARD_PLAIN_FIELDS, CARD_BOOL_FLAGS, paxVocOn } from "./card-fields.js";
import { CONTENT_LANGS } from "./content-model.js";
import { uiLang } from "./ui-lang.js";
import { BASE_M, pack, savePack } from "./pack.js";
import { cards, lang } from "./app-state.js";
import { hooks } from "./hooks.js";
import { v2AltLabel, v2PartText } from "./catalog-v2.js";

/* CONTRACT: the search order is the answer. The list as it stands outranks the catalog it was
   built from, and both outrank the pack's customs. */
function findCard(id){
  return cards.find(m=>m.id===id)||BASE_M.find(m=>m.id===id)
    ||(pack.custom||[]).find(m=>m.id===id)||null;
}
function baseCard(id){ return BASE_M.find(m=>m.id===id)||null; }

// Cards flagged alt:1 hold ALTERNATIVES - split into separately copyable blocks.
// Everything else is one message and must copy whole, blank lines included.
function cardText(m,field,l){
  const key=m?cardFieldKey(field,l):"";
  return String((key&&m[key]!=null)?m[key]:"");
}
/* AGENT-FACING TEXT FOLLOWS THE INTERFACE LANGUAGE. A title, a note and a keyword are read by
   the agent and never sent, so they must not change because a chat turned Polish - the macro
   body is the opposite and follows cardLang(). Missing falls back to the primary language,
   because guidance in the other language beats a card that quietly loses it. */
function cardTextUi(m,field){
  return cardText(m,field,uiLang()) || cardText(m,field,CONTENT_LANGS[0]);
}
function cardTitle(m){ return cardTextUi(m,"t"); }
/* A note is guidance for the AGENT, so it follows the interface language and never the
   language of the macro being sent: a note must not change because a chat turned Polish.
   Falls back to English, since guidance in the other language beats a card that quietly
   loses its warning. */
function noteFor(m){ return cardTextUi(m,"note"); }
/* THE FALLBACK LIVES HERE, so every reader gets it: the tint, the badge, the token language and
   the copied text all follow this one answer. A card that does not carry the language on screen
   speaks the primary instead - which is what makes a second language additive rather than a tax
   on every card. The pin is checked against the declared list, not against two literals. */
function cardLang(m){
  const p=m&&m.lockLang;
  const want=(CONTENT_LANGS.indexOf(p)>-1) ? p : lang;
  return cardText(m,"body",want) ? want : CONTENT_LANGS[0];
}
function parts(m,l){
  const raw = cardText(m,"body",l);
  if(!raw) return [];
  if(!m.alt) return [raw];
  return raw.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean).map(v2PartText);
}
/* Spec 2.6: a labelled alternative shows its name in place of variant 1/2. Steps stay numbered. */
function altLabelAt(m,l,vi){
  if(!m||!m.alt||m.seq) return "";
  return v2AltLabel(splitPartsRaw(cardText(m,"body",l))[vi]||"");
}
function splitPartsRaw(raw){
  return String(raw==null?"":raw).split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
}
function joinPartsRaw(ps){
  return (ps||[]).join("\n\n");
}
/** Reorder alt/seq blocks in both languages (same indices) and persist via pack. */
function intentsEqualStored(a,b){
  const aa=Array.isArray(a)?a.map(String):[];
  const bb=Array.isArray(b)?b.map(String):[];
  if(aa.length!==bb.length) return false;
  for(let i=0;i<aa.length;i++) if(aa[i]!==bb[i]) return false;
  return true;
}
/* Build the override for a built-in: ONLY the fields that differ from the catalog's
   version - storing all twelve pinned a card's everything to remember one word, with an
   "edited" badge that could never clear. Equality against the BASE, never falsiness:
   unticking a flag the catalog sets must still write 0 - rebuildCards layers with
   Object.assign, so an omitted field lets the base's 1 through and the tick springs
   back. An empty result means nothing differs; the caller deletes the override. */
function overrideAgainstBase(base, full){
  if(!base) return full;
  const o={};
  const txt=v=>String(v==null?"":v);
  ["c"].concat(cardStorageKeys(), CARD_PLAIN_FIELDS).forEach(f=>{
    if(txt(full[f])!==txt(base[f])) o[f]=txt(full[f]);
  });
  CARD_BOOL_FLAGS.forEach(f=>{
    if(!!full[f]!==!!base[f]) o[f]=full[f]?1:0;
  });
  /* AGAINST THE MERGED CARD, NOT THE BASE. paxVoc falls back to firstOnly, and this same
     override may be changing firstOnly - so the base computes its effect under the OLD
     value, agrees by accident, stores nothing, and the saved card then falls back to the
     NEW value and answers the opposite. */
  const asSaved=Object.assign({},base,o); delete asSaved.paxVoc;
  if(paxVocOn(full)!==paxVocOn(asSaved)) o.paxVoc=paxVocOn(full)?1:0;
  if(!intentsEqualStored(full.intents, base.intents)) o.intents=full.intents;
  return o;
}
function reorderMacroBlocks(id, fromVi, toVi){
  const m=findCard(id);
  if(!m||!m.alt) return false;
  const enPs=splitPartsRaw(m.en);
  if(enPs.length<2) return false;
  if(fromVi===toVi||fromVi<0||toVi<0||fromVi>=enPs.length||toVi>=enPs.length) return false;
  const plPs=splitPartsRaw(m.pl);
  const newEn=enPs.slice();
  newEn.splice(toVi,0,newEn.splice(fromVi,1)[0]);
  let newPl=m.pl;
  if(plPs.length===enPs.length){
    const np=plPs.slice();
    np.splice(toVi,0,np.splice(fromVi,1)[0]);
    newPl=joinPartsRaw(np);
  }
  const enJoined=joinPartsRaw(newEn);
  if(m._custom){
    const ix=(pack.custom||[]).findIndex(x=>x&&x.id===id);
    if(ix<0) return false;
    pack.custom[ix].en=enJoined;
    pack.custom[ix].pl=newPl;
  } else {
    /* The editor's rule, so a reorder stores the order and nothing else: every field copied
       here would stand in front of the catalog's own for good, team fixes included. */
    const base=baseCard(id);
    if(!base) return false;
    const o=overrideAgainstBase(base, Object.assign({}, m, {en:enJoined, pl:newPl}));
    if(Object.keys(o).length) pack.overrides[id]=o; else delete pack.overrides[id];
  }
  savePack();
  hooks.rebuildCards();
  return true;
}
// After moving index `from` → `to` via splice, which old index is now at newI?
function reverseBlockIndex(newI, from, to){
  if(newI===to) return from;
  if(from<to){
    if(newI>=from && newI<to) return newI+1;
  } else if(from>to){
    if(newI>to && newI<=from) return newI-1;
  }
  return newI;
}

export {
  findCard,
  baseCard,
  cardText,
  cardTitle,
  noteFor,
  cardLang,
  parts,
  altLabelAt,
  splitPartsRaw,
  overrideAgainstBase,
  reorderMacroBlocks,
  reverseBlockIndex
};
