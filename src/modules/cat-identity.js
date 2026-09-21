import { CATALOG_ROLES } from "./cat-roles.js";
import { CATS } from "./content-model.js";
import { CAT_COLORS_CATALOG, CAT_ICONS, CAT_ICONS_CATALOG, CAT_ICON_HINTS, CAT_ICON_MUSIC,
  CAT_LABELS_PL, E_HUE_CYCLE, catIconInner } from "./icons.js";
import { esc } from "./esc.js";
import { BASE_CATS, pack, savePack } from "./pack.js";
import { applyCatsToGlobal } from "./cat-set.js";

/* A stable pseudorandom number from a string. Stable is the point: an icon or a colour picked
   by Math.random() would be a different one on every load, which is not an identity at all. */
function catHash(s){
  let h=0; s=String(s||"");
  for(let j=0;j<s.length;j++) h=(h*31+s.charCodeAt(j))|0;
  return Math.abs(h);
}
/* Identity slot, in falling order of authority: the user's own pick, then - for a
   catalog category - its position in the CATALOG's order, never catOrder, so colour
   follows the category and reordering pills repaints nothing. A user-made category gets a
   pseudorandom slot, so two added in a row are not palette neighbours. All ("") is
   chrome, not taxonomy, and gets no slot at all. */
/* A slot is legal only if the engine still DEALS it: a stored 5 kept resurrecting retired
   pink while a bare token count stood in for validity. The cycle is the only authority; an
   unrecognised slot falls through exactly as an absent one, giving the category the colour
   it would have had if pink never existed. */
function hueIsOffered(n){
  return n!=null && E_HUE_CYCLE.indexOf(n|0) >= 0;
}
function catSlot(id){
  if(!id) return -1;
  const ov=pack&&pack.catColors?pack.catColors[id]:null;
  if(hueIsOffered(ov)) return ov|0;
  const dec=CAT_COLORS_CATALOG[id];
  if(hueIsOffered(dec)) return dec|0;
  if(pack&&pack.customCats&&pack.customCats[id]!=null) return E_HUE_CYCLE[catHash(id)%E_HUE_CYCLE.length];
  const i=Object.keys(CATS).indexOf(id);
  /* Modulo the CYCLE's length, never the token count: they were the same number until pink
     left, and with a cycle of seven the wider range lands on index 7 and returns undefined. */
  return E_HUE_CYCLE[(i>-1?i:catHash(id))%E_HUE_CYCLE.length];
}
/* Falling order of authority: the user's own pick, then what the CATALOG declares,
   then a guess from the name, then the musical pool by hash - a maintained catalog
   arrives as its author intended, an unknown category still means something, and every
   category has a mark from the moment it exists. */
/* A category is OVERRIDDEN when any of the four things its editor writes differs from what
   the catalog declares. Presence is not enough: the icon and the colour are written on every
   save whether or not they changed, so a category saved once but never altered would
   otherwise offer to reset itself to what it already is. */
function categoryIsOverridden(k){
  if(!k || !pack) return false;
  const lab=(pack.catLabels||{})[k];
  if(lab && lab!==BASE_CATS[k]) return true;
  const labPl=(pack.catLabelsPl||{})[k];
  if(labPl && labPl!==CAT_LABELS_PL[k]) return true;
  const ic=(pack.catIcons||{})[k];
  if(ic!=null && ic!==CAT_ICONS_CATALOG[k]) return true;
  const col=(pack.catColors||{})[k];
  if(col!=null && col!==CAT_COLORS_CATALOG[k]) return true;
  /* The role is layer 3 like the four above, so Reset has to see it - see the note at
     refreshCatRoles(). Held as a boolean, and only a boolean overrides. */
  const role=(pack.catRoles||{})[k];
  if(role && typeof role.always==="boolean"
     && role.always!==(CATALOG_ROLES.always.indexOf(k)>-1)) return true;
  return false;
}
/* Drops all five, so the category answers to the catalog again. A custom category has no
   catalog version to fall back to, which is why its editor is never offered this. */
function resetCategory(k){
  if(!k || !pack) return;
  [ "catLabels","catLabelsPl","catIcons","catColors","catRoles" ].forEach(bag=>{
    if(pack[bag]) delete pack[bag][k];
  });
  savePack(); applyCatsToGlobal();
}
function catIconKey(id){
  if(!id) return null;
  const ov=pack&&pack.catIcons?pack.catIcons[id]:null;
  if(ov && CAT_ICONS[ov]) return ov;
  const dec=CAT_ICONS_CATALOG[id];
  if(dec && CAT_ICONS[dec]) return dec;
  /* The CANONICAL name, never CATS[id]: that one is localised, and hints written in English
     stop matching the moment the UI turns Polish - every guessed icon would fall through to
     the hash pool and the categories would change their marks on a language switch. */
  const label=String((pack&&pack.catLabels&&pack.catLabels[id]) || BASE_CATS[id]
                     || (pack&&pack.customCats&&pack.customCats[id]) || id);
  for(let i=0;i<CAT_ICON_HINTS.length;i++){
    if(CAT_ICON_HINTS[i][0].test(label)) return CAT_ICON_HINTS[i][1];
  }
  return CAT_ICON_MUSIC[catHash(id)%CAT_ICON_MUSIC.length];
}
function catIconSvg(id,cls){
  const k=catIconKey(id);
  if(!k||!CAT_ICONS[k]) return "";
  return '<svg class="'+(cls||"cat-ic")+'" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+catIconInner(k)+'</svg>';
}
/* THE CATEGORY AS A MARK IN A SLOT OF ONE WIDTH - the intent panel's rows and the card caption
   both take it from here, so a row's name starts at the same x on either. The slot is written
   even where there is no category to put in it, which is what holds that alignment. The name the
   mark stands for is on the slot's title, and data-i18n-skip keeps the sweep off a catalog word. */
function catMarkHtml(id){
  const k=id||"", lab=k?(CATS[k]||k):"";
  return '<span class="cat-slot" data-i18n-skip'+(lab?' title="'+esc(lab)+'"':"")+'>'
    +(k?catIconSvg(k,"cat-ic"):"")+'</span>';
}

export {
  hueIsOffered,
  catSlot,
  categoryIsOverridden,
  resetCategory,
  catIconKey,
  catIconSvg,
  catMarkHtml
};
