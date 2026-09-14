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
/** Everything unfolded again. The caller clears the key; this is the set held in memory,
 *  which a delete alone would leave standing until the next reload. */
function expandAllGroups(){ eCollapsed=new Set(); }
/** Which group a card belongs to right now - the band, the favourites block, or its category. */
function groupKeyOf(m){
  if(inIntentBand(m)) return COLLAPSE_BAND;
  if(favBlockOn() && isFavourite(m&&m.id)) return COLLAPSE_FAV;
  return String((m&&m.c)||"");
}
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
  expandAllGroups,
  toggleCollapsed,
  groupKeyOf,
  collapseCtrlHtml,
  COLLAPSE_BAND,
  COLLAPSE_FAV
};
