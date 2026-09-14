import { CATS } from "./content-model.js";
import { ICON_EDIT, ICON_EYE_OPEN, ICON_EYE_SHUT, ICON_STAR_OFF, ICON_STAR_ON, _NOTE, _svg } from "./icons.js";
import { cardDrag } from "./list-pointer.js";
import { cardLang, cardTitle, noteFor, parts } from "./card-model.js";
import { catIconSvg, catSlot } from "./cat-identity.js";
import { esc } from "./esc.js";
import { fill } from "./intent-text.js";
import { intentOrder, isIntentHiddenIdx } from "./intent-id.js";
import { movedCardIds } from "./card-order.js";
import { railActive } from "./rail-panel.js";
import { t } from "./ui-lang.js";

/* The card body, extracted so a language flip can rebuild one card at a time - the
   render map and the flip's idle chunks must write the same bytes (verifyPool checks).
   ctx carries the map's per-card locals; everything else the body reads is global. */
function cardBodyHtml(m,i,ctx){
  const hit=ctx.hit, catHit=ctx.catHit, fav=ctx.fav, band=ctx.band,
        other=ctx.other, dragTip=ctx.dragTip;
  let cardH="";
    cardH+='<div class="card'+(m._hidden?" is-hidden":"")+(hit?" intent-hit":"")+(catHit?" cat-hit":"")
      +(cardDrag&&cardDrag.moved&&cardDrag.key===m.id?" dragging":"")
      +'" data-i="'+i+'" data-id="'+esc(m.id||'')+'" data-rank="'+esc(band)+'"'
      +(catSlot(m.c)>=0?' data-ec="'+catSlot(m.c)+'"':'')
      +' title="'+esc(dragTip)+'">';
    cardH+='<div class="chead">';
    /* data-i18n-skip: a card title and a category name are the employer's content. Nothing
       sweeps the card list today, but the marker travels with the markup if anything ever does. */
    cardH+='<span class="ctitle" data-i18n-skip>'+esc(cardTitle(m))+'</span><span class="ccat" data-i18n-skip>'+catIconSvg(m.c)+esc(CATS[m.c]||m.c||"")+'</span>';
    /* Captured rather than appended inline: a kept card has its badges added and removed by
       patchCard(), and they must be the same bytes a rebuild would have written. */
    const hitBadge='<span class="cbadge hit" title="'+esc(t("Linked to the selected intent"))+'">'+esc(t("int"))+'</span>';
    const catBadge='<span class="cbadge cat" title="'+esc(t("In a supporting category, relevant regardless of the intent"))+'">'+esc(t("sup"))+'</span>';
    if(hit) cardH+=hitBadge;
    if(catHit) cardH+=catBadge;
    if(fav) cardH+='<span class="cbadge fav" title="'+esc(t("In Favourites"))+'">'+esc(t("fav"))+'</span>';
    /* Moved counts as edited now that order is content: the card differs from the one
       the catalog shipped, even though its words do not. So does a card of your own. */
    if(m._custom || m._overridden || movedCardIds().has(m.id))
      cardH+='<span class="cbadge ed" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>';
    const favTip=t(fav?"Remove from Favourites":"Add to Favourites");
    /* Hide is a toggle now that hidden entries stay on the list - the card itself is where you
       undo it. Delete lives only in Manage, so an irreversible action is never one stray click
       away while you are working a chat. */
    const hideTip=t(m._hidden
      ? "Show this card again"
      : (fav ? "Put this card away: it greys out at the foot of this category and loses its star"
             : "Put this card away: it greys out at the foot of this category"));
    const _note=noteFor(m);
    cardH+='<span class="cacts">'
      +(_note ? '<button type="button" data-act="note" title="'+esc(t("Internal note"))+'" aria-label="'+esc(t("Internal note"))+'" aria-expanded="false">'+_svg("ic",_NOTE)+'</button>' : '')
      +'<button type="button" data-act="edit" title="'+esc(t("Edit this card"))+'" aria-label="'+esc(t("Edit this card"))+'">'+ICON_EDIT+'</button>'
      +'<button type="button" class="'+(m._hidden?"":"danger")+'" data-act="hide" title="'+esc(hideTip)+'" aria-label="'+esc(hideTip)+'">'+(m._hidden?ICON_EYE_SHUT:ICON_EYE_OPEN)+'</button>'
      +'<button type="button" class="star-btn'+(fav?" on":"")+'" data-act="fav" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'
      +'</span></div>';
    /* A pinned card shows the version it speaks, not the one the toggle names. */
    const _L=cardLang(m);
    const ps=parts(m,_L), cls=_L==="pl"?" plx":"";
    if(ps.length){
      // _L, never lang: on a pinned card the badge must name the language actually shown.
      const many=ps.length>1, word=m.seq?t("STEP"):_L.toUpperCase();
      cardH+=ps.map((p,vi)=>{
        const on=entrySel&&entrySel.id===m.id&&entrySel.vi===vi?" sel":"";
        // role=button tells assistive tech these blocks act, not just read. No tabindex on
        // purpose: 200+ stops would swamp the tab order, and ↑↓/Enter already drive them.
        return '<div class="txt'+cls+on+'" role="button" data-v="'+vi+'"'+(many?' title="'+esc(t("Click to copy, or drag to reorder these"))+'"':' title="'+esc(t("Click to copy"))+'"')+'>'+
        '<span class="tag">'+word+(many?" "+(vi+1)+"/"+ps.length:"")+'</span>'+
        escFilled(fill(p,m,true))+'</div>';
      }).join("");
    } else {
      // a one-language card, which the maintenance panel counts: the other language's text is all it has
      cardH+='<div class="miss">'+esc(t("No {LANG} version for this card").replace("{LANG}",_L.toUpperCase()))
         +' - '+esc(t("switch to {LANG} to use it").replace("{LANG}",other.toUpperCase()))+'.</div>';
    }
    // In-card chips only when the side rail is off - otherwise the left panel is the list.
    const sws=(lang==="pl"?(m.swpl||m.sw):(m.sw||m.swpl));
    if(sws && !railActive()){
      // How-to on the tooltip: this strip sits inside a card the agent is reading at speed
      cardH+='<div class="swap" title="Click to pick, again to clear, and hold Ctrl for several"><b>Set {INTENT}</b> '+
        intentOrder.filter(si=>!isIntentHiddenIdx(si)).map(si=>{
          const s=sws[si]; if(s==null) return "";
          return '<code'+(intentIdxs.indexOf(si)>-1?' class="on"':'')+' data-si="'+si+'">'+
            esc(s)+'</code>';
        }).join("")+'</div>';
    }
    cardH+='</div>';
  return {cardH:cardH, hitBadge:hitBadge, catBadge:catBadge};
}

export {
  cardBodyHtml
};
