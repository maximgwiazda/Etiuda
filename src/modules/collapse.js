import { ICON_CHEVRON_R } from "./icons.js";
import { lsGet, lsSet } from "./storage.js";
import { t } from "./ui-lang.js";
import { isFavourite } from "./pack.js";
import { esc } from "./esc.js";
import { inIntentBand, favBlockOn } from "./card-order.js";

/* ---- Collapsed groups: stored with the settings, NOT in the pack - folding is a view
   choice of the theme's kind and must not ride along when a catalog is shared. Keys are
   the category key or the two sentinels, which cannot collide with one - a category key
   never starts with a colon. */
const COLLAPSE_BAND=":band", COLLAPSE_FAV=":fav";
let eCollapsed=null;
function collapsedSet(){
  if(eCollapsed) return eCollapsed;
  eCollapsed=new Set();
  try{
    const raw=lsGet("eCollapsed");
    if(raw) JSON.parse(raw).forEach(k=>eCollapsed.add(String(k)));
  }catch(e){}
  return eCollapsed;
}
function isCollapsed(key){ return !!key && collapsedSet().has(String(key)); }
function toggleCollapsed(key){
  const set=collapsedSet();
  if(set.has(key)) set.delete(key); else set.add(key);
  try{ lsSet("eCollapsed", JSON.stringify(Array.from(set))); }catch(e){}
}
/** The folds read again from storage at their next use: the set held in memory would otherwise
 *  outlive a change to the key. */
function rereadCollapsed(){ eCollapsed=null; }
/** Which group a card belongs to right now - the band, the favourites block, or its category. */
function groupKeyOf(m){
  if(inIntentBand(m)) return COLLAPSE_BAND;
  if(favBlockOn() && isFavourite(m&&m.id)) return COLLAPSE_FAV;
  return String((m&&m.c)||"");
}
/* A card's own fold shares the groups' storage under a key of its own: the prefix starts with a colon, as the two
   sentinels do, so no category key can equal one. It is drawn only where a group's fold is, which render() says:
   a search draws no groups, and a hit is never hidden behind a fold. */
const COLLAPSE_CARD=":card:";
let cardsFoldable=false;
function setCardsFoldable(on){ cardsFoldable=!!on; }
function cardFoldKey(id){ return COLLAPSE_CARD+String(id); }
function cardFoldOffered(id){ return cardsFoldable && !!id; }
function isCardFolded(id){ return cardsFoldable && !!id && isCollapsed(cardFoldKey(id)); }
function toggleCardFold(id){ if(id) toggleCollapsed(cardFoldKey(id)); }
/** "n" where no fold is drawn, else "f" or "o": part of a card's signature, so a fold rebuilds that card alone. */
function cardFoldSig(id){ return !cardsFoldable ? "n" : (isCardFolded(id) ? "f" : "o"); }
/** The chevron and the count that every separator carries. */
function collapseCtrlHtml(key,count){
  const shut=isCollapsed(key);
  return '<span class="sep-n">'+count+'</span>'
    +'<button type="button" class="sep-fold'+(shut?" shut":"")+'" data-fold-key="'+esc(key)+'"'
    +' title="'+esc(t(shut?"Show these cards":"Fold this group away"))+'"'
    +' aria-expanded="'+(shut?"false":"true")+'">'+ICON_CHEVRON_R+'</button>';
}

export {
  isCollapsed,
  rereadCollapsed,
  toggleCollapsed,
  groupKeyOf,
  collapseCtrlHtml,
  setCardsFoldable,
  cardFoldOffered,
  cardFoldKey,
  isCardFolded,
  toggleCardFold,
  cardFoldSig,
  COLLAPSE_BAND,
  COLLAPSE_FAV
};
