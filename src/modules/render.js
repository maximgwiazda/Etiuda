import { cancelLangChunks, paintList, settleFreshCards } from "./card-pool.js";
import { cardSearchTerms, eSpellFix } from "./spell.js";
import { syncPillCounts } from "./pill-state.js";
import { ensureCardOrder, cmpCardDisplay, displayBandKey, favBlockOn, inIntentBand, intentBandOn } from "./card-order.js";
import { cardInActiveCats } from "./card-counts.js";
import { cardMatchesSearch } from "./card-search.js";
import { intentAffinityGroups } from "./affinity.js";
import { cardSearchScore } from "./card-score.js";
import { cardHitsSelectedIntent, cardHitsAlwaysCat } from "./card-intent.js";
import { esc } from "./esc.js";
import { list, $ } from "./dom.js";
import { t, uiLang } from "./ui-lang.js";
import { catIconSvg, catSlot } from "./cat-identity.js";
import { chordChips } from "./shortcuts.js";
import { applyCardColumns } from "./columns.js";
import { groupKeyOf, COLLAPSE_BAND, COLLAPSE_FAV, isCollapsed, collapseCtrlHtml } from "./collapse.js";
import { isFavourite, ePackEpoch } from "./pack.js";
import { ICON_INTENT_LINK, _STAR } from "./icons.js";
import { CATS } from "./content-model.js";
import { cardBodyHtml } from "./card-body.js";
import { cardFillKey } from "./rail-list.js";
import { cardDrag } from "./list-pointer.js";
import { eApplyRecency } from "./recency.js";
import { cssEsc } from "./css-esc.js";
import { markEntrySel } from "./entry-walk.js";
import { scrollPageTop } from "./page-scroll.js";
import { scheduleCutScan } from "./cut-text.js";
import { closeNotePane } from "./note-pane.js";
import { E_CATALOG_SCRIPT, eCatalogFolder, eCatalogFolderShort, eOpenCatalogFolder } from "./host.js";
import { cards, intentIdxs, setShown, shown, cats, setPendingScrollHit, putEntrySel, lang, entrySel, pendingScrollHit, semiKind, cardCounts, wholeThingEmpty } from "./app-state.js";
import { hooks } from "./hooks.js";
// The render pass: filter, order, group, and hand the list the items it should hold. Every
// surface that changes what is shown ends here, and this is the only writer of `shown`.

function render(){
  closeNotePane();
  cancelLangChunks();
  const terms=cardSearchTerms();
  syncPillCounts();
  ensureCardOrder();
  // Filter first, order second, so scoring only ever touches entries that already matched.
  const hits=cards.filter(m=>{
    if(!cardInActiveCats(m,terms)) return false;
    // Macro search: title + keywords + notes + full EN/PL text (not titles only)
    return cardMatchesSearch(m, terms);
  });
  // Also read below, to place the tier separator between the two groups.
  const sc=new Map();
  if(terms.length){
    /* Sort key: intent band -> tier -> score -> cmpCardDisplay.
       BAND: linkage is a band, not a tiebreaker - as a tiebreaker the linked entries
       interleaved with textually higher-scoring cards and the green rings scattered, so
       the sort and the colours disagreed. An intent states what the customer wants; the
       query narrows within it. Same predicate as the green ring, so customs are covered
       by construction; with no intent every card lands in band 1 and this is inert.
       TIER/SCORE: category order cannot be the outer key - it is what buried the real
       answers. cmpCardDisplay breaks the last tie; catOrder/cardOrder are read, never
       mutated - the pill regroup's own contract. */
    const aterms=intentAffinityGroups();  // once per render, not once per card
    hits.forEach(m=>{
      const s=cardSearchScore(m, terms, aterms);
      s.band=(intentIdxs.length && cardHitsSelectedIntent(m)) ? 0 : 1;
      sc.set(m, s);
    });
    setShown(hits.sort((a,b)=>{
      const A=sc.get(a), B=sc.get(b);
      if(A.band!==B.band) return A.band-B.band;
      if(A.tier!==B.tier) return A.tier-B.tier;
      if(A.score!==B.score) return B.score-A.score;
      return cmpCardDisplay(a,b);
    }));
  }else{
    // Intent bands / category+fav groups, then manual order within each band.
    setShown(hits.sort(cmpCardDisplay));
  }

  if(!shown.length){
    /* An empty category needs no prose: the add-card is the whole answer and already
       names the category, so it becomes the first (only) card. The message stays where no
       add-card can stand in - a search with no hits, or All on an empty Etiuda. */
    const oneCat=(cats.length===1) ? cats[0] : null;
    /* A clause following a button brings its own leading space unless it opens with punctuation:
       Polish closes these with a comma, and a space written into the markup floats it off the chip. */
    const afterBtn=c=>(/^[,.;:!?]/.test(c)?"":" ")+esc(c);
    list.innerHTML=terms.length
      ? '<div class="empty">'+esc(t("No cards match."))+'<br><br>'
        +esc(t("Press"))+' <kbd>Esc</kbd> '+esc(t("to clear macro search and intents."))+'</div>'
      : (wholeThingEmpty()
        ? '<div class="empty">'+esc(t("Etiuda is empty."))+'<br><br>'
          /* A first run has no menu habits yet, and Import is the route someone who downloaded
             the file is looking for - so it is a button here, not the name of one elsewhere. */
          +esc(t(hooks.sampleReady() ? "Add a card to a category," : "Add a card to a category, or"))
          +' <button type="button" class="btn" id="emptyImport">'+esc(t("import a catalog"))+'</button>'
          /* Both branches close on words: a sentence ending on a button chip reads as unfinished,
             and a bare full stop after one reads as a stray mark. */
          +(hooks.sampleReady()
            ? ' '+esc(t("or"))
              +' <button type="button" class="btn" id="emptySample">'+esc(t("load a sample catalog"))+'</button>'
              +afterBtn(t("to see how it works."))
            : afterBtn(t("you already have.")))
          /* Said here because here is where it goes wrong - and WHICH answer is right depends on
             where the copy runs. An installed desk has a catalog folder of its own, so the answer
             is its path; on a disk the usual fault is a catalog beside Etiuda under the wrong
             name, and an unexplained empty screen reads as broken software; opened from a link
             there is no file beside it, so either rule is about a machine the reader is not on. */
          +'<br><br><span style="font-size:12.5px;opacity:.75">'
          /* ONE LINE, AND THE PATH IS THE LINK. The full path is what a person needs once, on
             hover or in the folder itself; the short name is what the sentence can carry at the
             narrowest width the band allows. */
          +(eCatalogFolder()
            ? t("Etiuda loads the newest catalog from {FOLDER} on its own; a catalog kept anywhere else comes in through Import above.")
                .split("{FOLDER}").join('<code class="open-folder" id="emptyCatFolder" role="button"'
                  +' tabindex="0" title="'+esc(eCatalogFolder())+'">'
                  +esc(eCatalogFolderShort())+'</code>')
            : location.protocol==="file:"
            ? esc(t("A catalog file next to Etiuda loads by itself when it is called"))+' '
              +'<code>'+esc(E_CATALOG_SCRIPT)+'</code>. '
              +esc(t("Under any other name, bring it in with the button above."))
            : esc(t("The catalog you import stays in this browser, ready whenever you come back.")))
          +'</span></div>'
        /* A chosen category with nothing in it: the same quiet drawing as the other empty
           states, but the category's own icon, so it says WHICH shelf is bare. Only when the
           category really holds no cards; filtered to nothing is a different sentence, and
           there is none to write for it. */
        : (oneCat
          ? (cardCounts[oneCat] ? "" : '<div class="empty empty-cat">'+catIconSvg(oneCat,"cat-ic empty-ic")
              +esc(t("This category is empty."))+'<br><br>'
              +esc(t("Press"))+' '+chordChips("newCard")+' '
              +esc(t("to create a card here."))+'</div>')
          : '<div class="empty">'+esc(t("Nothing here yet."))+'</div>'));
    const es=$("#emptySample");
    if(es) es.onclick=()=>hooks.loadSampleCatalog();
    const ei=$("#emptyImport");
    if(ei) ei.onclick=hooks.importCatalogHere;
    const ef=$("#emptyCatFolder");
    if(ef){
      ef.onclick=()=>eOpenCatalogFolder();
      ef.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); eOpenCatalogFolder(); } };
    }
    hooks.syncAddFab();
    applyCardColumns();
    setPendingScrollHit(false);
    putEntrySel(null);
    return;
  }
  const other = lang==="en" ? "pl" : "en";
  /* One separator, marking whichever boundary is the meaningful one: with an intent the
     linked / not-linked edge (the band); without one the "about it" / "merely mentions
     it" edge (the tier). Never both - two lines in a result list reads as structure the
     user has to decode. */
  const sepByBand = terms.length && intentIdxs.length;
  const sepGroup = m => { const s=sc.get(m)||{}; return sepByBand ? s.band : s.tier; };
  const sepLabel = t(sepByBand ? "not linked to your intent" : "also mentions your search");
  const dragTip = terms.length
    ? t("A search ranks the cards by relevance; clear it to order them yourself")
    : t(intentIdxs.length
        ? "Drag header to reorder within the same highlight group"
        : "Drag header to reorder within the same highlight group; same category only");
  /* Landmarks show whenever the list is RESTING: macro search is relevance-ordered and
     carries its own tier separator above, so a query hides them; an intent only changes what
     the first landmark is, it does not remove them all. The hidden tail is one "put away"
     zone and gets no labels. */
  const groupList = !terms.length;
  /* Owning up to a spelling fix, ahead of everything the list holds. Prepending it costs the
     first landmark its `:first-child` zero top margin, which is right: there is content above
     it now, so the gap it was suppressing is the gap it should have. */
  const spellNote=(eSpellFix&&eSpellFix.length)
    ? '<div class="e-spellfix">'+esc(t("Searched for"))+' '+eSpellFix.map(f=>'<b>'+esc(f.to)+'</b>').join(" "+esc(t("and"))+" ")
      +' · '+esc(t("you typed"))+' '+eSpellFix.map(f=>esc(f.from)).join(" "+esc(t("and"))+" ")+'</div>'
    : "";
  /* One pass for the counts the separators show. Done here rather than inside the map
     because a separator is emitted before its cards, so the number has to exist first. */
  const groupN={};
  if(groupList) shown.forEach(m=>{
    const k=groupKeyOf(m); groupN[k]=(groupN[k]||0)+1; });
  /* A lone category is no landmark: its heading only repeats the pill, and a fold on the one
     group on screen would blank it. The band and favourites headings stay: they say why. */
  const gk=Object.keys(groupN);
  const soloCat=gk.length===1 && gk[0]!==COLLAPSE_BAND && gk[0]!==COLLAPSE_FAV;
  /* ITEMS, not one string: a separator is rebuilt every render and a card may be KEPT,
     so the two are carried apart even though they are joined again right below. */
  /* Shared by every card this render: the two languages, the search terms and the drag tip.
     Per-card inputs ride on cardFillKey(). */
  /* dragTip is deliberately ABSENT: it names the current selection, so signing it would
     rebuild all 257 cards on the very action this exists to make cheap. patchCard sets it. */
  const renderKey=String(uiLang())+"|"+String(typeof lang!=="undefined"?lang:"")
    +"|"+terms.join(" ");
  const items=shown.map((m,i)=>{
    const hit=cardHitsSelectedIntent(m);
    const catHit=cardHitsAlwaysCat(m);
    const fav=isFavourite(m.id);
    const band=displayBandKey(m);
    let sepH="";
    /* The list is sorted 0 then 1 on whichever key sepGroup picks, so there is exactly
       one transition. Sits between cards and takes no part in drag or focus logic - card
       drag resolves through .closest(".card"), block focus walks .txt; this is neither. */
    if(terms.length && i>0 && sepGroup(shown[i-1])===0 && sepGroup(m)===1){
      sepH+='<div class="list-sep"><i></i><span>'+esc(sepLabel)+'</span><i></i></div>';
    }
    /* Resting landmarks: the favourites header, the INTENT band header, then a category
       separator at every change below - all between cards, no part in drag or focus.
       Category changes INSIDE a band are deliberately silent: everything under that
       heading is there for the same reason, and the categories resume when it ends. */
    if(groupList && !soloCat){
      const prevM=i>0?shown[i-1]:null;
      /* Gated on the BLOCK, not on the star. Without favBlockOn() here, a starred card in a
         filtered view still counted as ending a favourites block that was never drawn, and
         the category separator fired a second time under it. */
      const prevFav=!!(favBlockOn() && prevM && isFavourite(prevM.id));
      const band=inIntentBand(m), prevBand=prevM?inIntentBand(prevM):false;
      const fav=favBlockOn() && isFavourite(m.id);
      if(band && i===0){
        /* The band spans every column rather than being dealt into one - it is a result set,
           not a shelf, and burying the most relevant cards in column one would be the whole
           point of the exercise undone. FOLDED there is no set to bury: the heading takes a
           column like any other and the categories come up beside it, which is what folding
           was asked for. `e-bandsep` is what the column layout keys on. */
        sepH+='<div class="list-sep e-catsep e-bandsep'+(isCollapsed(COLLAPSE_BAND)?'':' e-span')
          +'"><span>'+ICON_INTENT_LINK
          +esc(t("Matching your intent"))+'</span>'
          +collapseCtrlHtml(COLLAPSE_BAND,groupN[COLLAPSE_BAND]||0)+'</div>';
      }else if(fav && i===0){
        sepH+='<div class="list-sep e-favsep"><span><svg class="e-favstar" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+_STAR+'</svg>'+esc(t("Favourites"))+'</span>'
          +collapseCtrlHtml(COLLAPSE_FAV,groupN[COLLAPSE_FAV]||0)+'</div>';
      }else if(!band && !fav && (!prevM || prevBand || prevFav || prevM.c!==m.c)){
        const _sl=catSlot(m.c);
        sepH+='<div class="list-sep e-catsep"><span data-k="'+esc(m.c||"")+'"'+(_sl>=0?' data-ec="'+_sl+'"':'')+'>'
          +catIconSvg(m.c)+esc(CATS[m.c]||m.c||"")+'</span>'
          +collapseCtrlHtml(String(m.c||""),groupN[String(m.c||"")]||0)+'</div>';
      }
    }
    /* FOLDED: the heading is already in h, so returning here keeps the landmark and
       drops everything under it. Gated on groupList, so a search - which draws no
       groups at all - can never hide a hit behind a fold. */
    /* Folded: the heading is in sepH and there is no card to keep, so the item carries no id. */
    if(groupList && !soloCat && isCollapsed(groupKeyOf(m)))
      return {sepH:sepH, cardH:"", id:null};
    const built=cardBodyHtml(m,i,{hit:hit,catHit:catHit,fav:fav,band:band,other:other,dragTip:dragTip});
    return {sepH:sepH, cardH:built.cardH, id:m.id,
      sig:ePackEpoch+"|"+renderKey+"|"+cardFillKey(m)
        +"|"+(entrySel&&entrySel.id===m.id?entrySel.vi:-1),
      hit:hit, catHit:catHit, hidden:!!m._hidden, i:i, band:band,
      dragging:!!(cardDrag&&cardDrag.moved&&cardDrag.key===m.id),
      hitBadge:built.hitBadge, catBadge:built.catBadge, dragTip:dragTip};
  });
  paintList(spellNote,items);
  hooks.syncAddFab();
  /* Last thing before anything measures the list: everything above builds one flat
     sequence, and this is the only step that knows about columns. */
  applyCardColumns();
  settleFreshCards();
  eApplyRecency();

  // Drop focus if that block disappeared after filter/reorder
  if(entrySel && !list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]')){
    putEntrySel(null);
  }

  if(pendingScrollHit){
    setPendingScrollHit(false);
    // Wait a frame so layout has the new cards, then reveal the first intent-linked entry.
    requestAnimationFrame(()=>{
      /* The FIRST intent-hit, deliberately - with an openers category that is an opener, and
         that is the point: the cold open adapted to this intent is worth seeing first.
         Aiming past the openers at the first intent-specific card was tried and reverted.
         The scroll tolerates a standing category filter: it looks for a linked card and
         does nothing when the filter hides them all. */
      const hit=list.querySelector(".card.intent-hit .txt[data-v]");
      if(!hit) return;
      const card=hit.closest(".card[data-id]");
      /* The reveal is for the eyes; the mark follows only when the cards hold the arrows.
         An armed run keeps them on the rail, and a mark nothing walks must never show. */
      if(card && semiKind!=="intent") putEntrySel({id:card.dataset.id, vi:+hit.dataset.v});
      markEntrySel();
      /* Only scroll if the entry is not already ON SCREEN - centring unconditionally slid
         the list hundreds of px to move a card already readable, which is what read as
         juddering. The header is sticky, so "visible" starts at its underside, not 0. */
      const hdr=document.querySelector("header");
      const top=(hdr?hdr.getBoundingClientRect().bottom:0)+12;
      const r=hit.getBoundingClientRect();
      if(r.top>=top && r.bottom<=window.innerHeight-12) return;
      /* With a band the answer is AT THE TOP by construction - go there, no hunting. */
      const target=intentBandOn() ? (list.querySelector(".e-bandsep") || hit) : hit;
      // The first thing in the list means the top of the page - see scrollPageTop().
      const firstBlock=list.querySelector(".card, .e-bandsep");
      if(firstBlock && (firstBlock===target || firstBlock.contains(target) || target.contains(firstBlock))){
        scrollPageTop(); return;
      }
      target.scrollIntoView({block:intentBandOn()?"start":"center",behavior:"smooth"});
    });
  } else {
    markEntrySel();
  }
  /* Scheduled, not immediate: a title's width is not settled until its column is dealt and
     the card it sits in has been laid out. */
  scheduleCutScan();
}
export {
  render,
};
