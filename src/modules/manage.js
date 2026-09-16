import { ensureCustomCat, openCardEditor, hideCard } from "./card-editor.js";
import { baseCard, cardTitle, findCard } from "./card-model.js";
import { movedCardIds, cardOrderIdx, catSortIdx, ensureCardOrder, cardOrderTouched } from "./card-order.js";
import { isAlwaysCat, setCatAlways } from "./cat-roles.js";
import { exportCatalog, importCatalogHere } from "./catalog-file.js";
import { E_CATALOG_NAME, eWatchSupported, eWatchName, eWatchClear } from "./catalog.js";
import { CATS } from "./content-model.js";
import { catToggle, closeModal, dressDialogInputs, modalOpen, mountModalBody, openDialog, wireFolds } from "./dialog.js";
import { markCutText } from "./cut-text.js";
import { openIntentEditor, openCategoryEditor } from "./editors.js";
import { ICON_CHEVRON_R, ICON_EYE_SHUT, ICON_EYE_OPEN, ICON_EDIT, ICON_TRASH, ICON_STAR_ON, ICON_STAR_OFF, ICON_PLUS, ICON_ROLE_ALWAYS } from "./icons.js";
import { intentNavName } from "./intent-text.js";
import { clearLocalMemory } from "./local-memory.js";
import { mgReduceMotion, mgPinCard, E_EASE } from "./motion.js";
import { drawIntentRail } from "./rail-list.js";
import { normWhoList, WHO_BASE } from "./stock.js";
import { nsSet } from "./storage.js";
import { drawPills } from "./tabs.js";
import { ask, t, catalogCountsLine, toast } from "./ui-lang.js";
import { isFavourite, isIntentFavourite, pack, whoOptions, savePack } from "./pack.js";
import { removeCard, removeIntent, setIntentHidden, syncIntentOrder, toggleFavourite, toggleIntentFavourite } from "./favourites.js";
import { primaryCatLabel } from "./card-intent.js";
import { intentIdAt, intentIdxFromId, intentIsCustom, intentIsOverridden, intentOrder, isIntentHiddenIdx } from "./intent-id.js";
import { applyCatsToGlobal, removeCategory } from "./cat-set.js";
import { esc } from "./esc.js";
import { syncRoleDrum } from "./role-drum.js";
import { modalCard, $ } from "./dom.js";
import { macroBlockCount, recountMacros, totalMacroCount } from "./card-counts.js";
import { rebuildCards } from "./rebuild.js";
import { render } from "./render.js";
import { eCheckWatchedFile, paintCatalogList } from "./catalog-offer.js";
import { eCatalogFolder, eChooseCatalogFolder, eOpenCatalogFolder } from "./host.js";
import { cards, catOrder, mgOpen, cardCounts } from "./app-state.js";


/** One collapsible Manage section. `body` is trusted markup; `title` is not. */
function mgSec(key,title,body,count){
  return '<details class="manage-sec" data-mg="'+esc(key)+'"'+(mgOpen.has(key)?" open":"")+'>'+
    '<summary><span class="acc-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span><h3>'+esc(title)+'</h3>'+
      (count!=null?'<span class="mg-count">'+esc(String(count))+'</span>':'')+
    '</summary>'+
    '<div class="manage-secbody">'+body+'</div></details>';
}

/* What a row can be dragged past. Manage always groups by category, so its band is
   category + favourite + hidden regardless of whether an intent happens to be selected -
   unlike the card list, whose band collapses to relevance rank while an intent is on. */
function mgCardBand(m){
  return String(m&&m.c||"")+"|"+(isFavourite(m&&m.id)?"1":"0")+"|"+((m&&m._hidden)?"1":"0");
}

/** A card inside the category tree. Hidden rows are greyed; the star is inert on them, so
 *  the only way back is the closed eye - the rule the intent rows already follow. */
function mgCardRow(m){
  const hid=!!m._hidden, fav=isFavourite(m.id);
  const badge=(m._custom || m._overridden || movedCardIds().has(m.id))
    ?'<span class="cbadge ed mg-badge" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>':"";
  // Local copy count - absent until the first copy, so unused rows stay quiet rather than
  // wearing a "0" that reads as an accusation before anyone has worked a shift with it.
  const uses=(pack.useCounts&&pack.useCounts[m.id])|0;
  const useBadge=uses?'<span class="mg-uses" title="Copied '+uses+' time'+(uses===1?'':'s')
    +' in this browser">'+uses+'×</span>':"";
  const favTip=fav?"Remove from Favourites":"Add to Favourites";
  const hideShow=hid
    ?'<button type="button" data-show-card="'+esc(m.id)+'" title="Show this card again" aria-label="Show this card again">'+ICON_EYE_SHUT+'</button>'
    :'<button type="button" data-hide-card="'+esc(m.id)+'" title="Put this card away: it greys out at the foot of this category" aria-label="Put this card away">'+ICON_EYE_OPEN+'</button>';
  /* The title is plain text, not a field. Renaming lives behind ✎ and nowhere else: a card
     already has a full editor, so a second path to the same value was two ways to do one thing,
     and the row is cleaner as drag surface end to end. Categories keep their inline rename
     because they have no editor to send you to. */
  return '<div class="manage-row mg-card'+(hid?" is-hidden":"")+'" data-cardrow="'+esc(m.id)+'"'+
      ' data-band="'+esc(mgCardBand(m))+'" title="Drag to reorder, or onto a category to move it there">'+
    '<span class="mg-card-lab">'+esc(cardTitle(m)||"")+'</span>'+badge+useBadge+
    '<span class="cacts">'+
      '<button type="button" data-edit-card="'+esc(m.id)+'" title="Open the full editor" aria-label="Edit card">'+ICON_EDIT+'</button>'+
      hideShow+
      '<button type="button" class="danger mg-trash" data-remove-card="'+esc(m.id)+'" title="Delete this card" aria-label="Delete card">'+ICON_TRASH+'</button>'+
      '<button type="button" class="star-btn'+(fav?" on":"")+'" data-fav-card="'+esc(m.id)+'" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'+
    '</span></div>';
}

/* The order cards take inside a category here. Named because the editor's arrows must
   agree with the tree they were opened from - two views disagreeing about what "next"
   means is the same fault the tiebreak comment below already describes. */
function mgCardCmp(a,b){
  return ((a.m._hidden?1:0)-(b.m._hidden?1:0)) ||
         ((isFavourite(a.m.id)?0:1)-(isFavourite(b.m.id)?0:1)) ||
         (cardOrderIdx(a.m.id)-cardOrderIdx(b.m.id)) ||
         (a.i-b.i);
}
function mgCardsIn(k){
  return (cards||[]).map((m,i)=>({m,i})).filter(o=>o.m&&o.m.c===k)
    .sort(mgCardCmp).map(o=>o.m);
}
/** The category -> card tree. Categories run in catOrder - dragging here and dragging
 *  a pill mean the same thing; inside a category, hidden sinks and favourites rise,
 *  matching the card list. Plain rows and an explicit toggle button, not <details>/
 *  <summary>: a summary hijacks every click inside it (an inline rename field could not
 *  take a caret) and is not a sane thing to drag. Disclosure lives in mgOpen either way. */
function mgCatTree(){
  const known=Object.keys(CATS);
  known.sort((a,b)=>catSortIdx(a)-catSortIdx(b));
  const byCat={};
  known.forEach(k=>{ byCat[k]=[]; });
  const orphans=[];
  (cards||[]).forEach((m,i)=>{
    const row={m,i};
    if(byCat[m.c]) byCat[m.c].push(row); else orphans.push(row);
  });
  /* The tiebreak is pack.cardOrder, NOT the position in `cards`: `cards` is filled in
     catalog order then customs and nothing re-sorts it by the user's arrangement, while
     cardOrder is the record the card list itself sorts by (cmpCardDisplay's final
     tiebreak). Reading `a.i-b.i` here made a drag persist for the list and snap back in
     Manage - two views disagreeing about what "order" means. One record, both views. */
  const order=list=>list.sort(mgCardCmp).map(o=>mgCardRow(o.m)).join("");

  const group=(k,rows,fixed,label)=>{
    const n=rows.length;                      // CARDS - guards the delete x below
    const nMac=rows.reduce((sum,o)=>sum+macroBlockCount(o.m),0);   // cards - what the badge shows
    const key="cat:"+k;
    const op=mgOpen.has(key);
    /* Text, not a rename field - the pencil's editor owns name, icon and colour together. */
    const name='<span class="mg-cat-fixed">'+esc(label)+'</span>';
    /* × only on an empty category - the same rule the header pill uses, so no route anywhere
       in the UI deletes a category with cards still in it. */
    const x=(!n && k!=="__orphan")
      ?'<button type="button" class="mg-cat-x2 icbtn" data-delcat="'+esc(k)+'" title="Delete this empty category" aria-label="Delete category">'+ICON_TRASH+'</button>':"";
    const add=k==="__orphan" ? ""
      :(function(){ const tip=esc(t("Add a card to {CAT}").replace("{CAT}",label));
         return '<button type="button" class="mg-cat-add2 icbtn" data-add-card="'+esc(k)+'" title="'+tip+'" aria-label="'+tip+'">'+ICON_PLUS+'</button>'; })();
    /* The pencil opens the whole category - name, icon, colour - the way the card rows do.
       The inline name field beside it stays: a rename is one keystroke away and a dialog for
       one word would be a step backwards. */
    const editc=k==="__orphan" ? ""
      :'<button type="button" class="mg-cat-edit2 icbtn" data-editcat="'+esc(k)+'" title="'+esc(t("Edit this category's names, icon and colour"))+'" aria-label="Edit category">'+ICON_EDIT+'</button>';
    /* Role toggles. The rings they control are the two things about Etiuda that are least
       guessable, so the tooltips say what each does rather than naming the role. Both report
       state through .on, like the star and the eye. */

    const alwaysOn=isAlwaysCat(k);
    const roles=k==="__orphan" ? "" :
      '<button type="button" class="mg-role'+(alwaysOn?" on":"")+'" data-role-always="'+esc(k)+'" aria-pressed="'+(alwaysOn?"true":"false")+'" '+
        'title="'+(alwaysOn
          ? t("Supporting category, relevant regardless of the intent")
          : t("Make this a supporting category, relevant regardless of the intent"))+'" aria-label="'+esc(t("Supporting category"))+'">'+ICON_ROLE_ALWAYS+'</button>';
    return '<div class="mg-cat'+(op?" is-open":"")+'" data-cat="'+esc(k)+'">'+
      '<div class="mg-cat-row"'+(k==="__orphan"?"":' data-crow="'+esc(k)+'" title="Drag to reorder"')+'>'+
        '<button type="button" class="mg-tw" data-toggle="'+esc(key)+'" aria-expanded="'+(op?"true":"false")+'" '+
          'title="'+esc(t(op?"Collapse":"Expand"))+'" aria-label="'+esc(t(op?"Collapse":"Expand"))+' '+esc(label)+'">'+ICON_CHEVRON_R+'</button>'+
        name+'<span class="mg-cat-n">'+nMac+'</span>'+
        /* Edit first, matching the card row (edit, hide, delete, star) - the primary action on
           the thing this row names should sit in the same place in both. The role toggle follows
           it rather than leading. */
        '<span class="mg-cat-acts">'+editc+roles+add+x+'</span>'+
      '</div>'+
      '<div class="mg-cat-body"'+(op?"":" hidden")+'>'+
        (n?order(rows):'<div class="manage-empty">'+esc(t("Empty."))+'</div>')+
      '</div></div>';
  };

  const groups=known.map(k=>group(k,byCat[k],false,CATS[k])).join("");
  const stray=orphans.length ? group("__orphan",orphans,true,t("Uncategorised")) : "";
  return '<div class="mg-tree">'+(groups+stray||'<div class="manage-empty">'+esc(t("No categories."))+'</div>')+'</div>';
}

/* ---- Reordering inside Manage: pointer-based and bound to the document - the swap
   rewrites the row order, and anything bound to a row dies the moment it moves. Two
   lists, both shared with the app: categories write catOrder (the pills' own list),
   cards write pack.cardOrder (the card list's) - a drag here changes the order
   everywhere, the whole point of doing it from Manage. Only the grip starts a drag: the
   rest of a row is a rename field, a toggle or an action. */
let mgDrag=null, mgSwapLock=0;
function mgSiblingIdx(el){
  return el&&el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : -1;
}
/* No midpoint test: a row swaps as soon as the pointer is over it, as in the intent
   panel. The midpoint rule exists for the CARD list, where ~274px entries trade places
   under a stationary cursor; Manage rows are ~30px, rail scale, so the swap lock alone
   is enough and waiting for the centre just makes the drag feel sticky. */
/** FLIP, scoped to one container - the same capture / invert / play the pills and the card list
 *  use. None of the card-list guards apply here: Manage moves the row itself instead of
 *  re-rendering, so membership is identical by construction and nothing can travel further than
 *  the list is tall. */
/* Any tree-changing action re-runs openManage(), which rebuilds the dialog from
   innerHTML - throwing away the scroll position (hiding the fortieth card snapped the
   list to the top) and any chance of animating. This keeps both: scroll restored on the
   two boxes that actually scroll, rows re-found by card id across the rebuild. mgFlip()
   cannot serve here - it holds element references, fine within one render, useless
   across one. */
/* Manage rebuilds its rows on every action, and a rebuilt row measures fresh. */
function mgRefreshAround(mutate){
  const treeBefore=modalCard.querySelector(".mg-tree");
  const keepTree=treeBefore?treeBefore.scrollTop:0;
  const bodyBefore=modalCard.querySelector(".modal-body");
  const keepCard=bodyBefore?bodyBefore.scrollTop:0;
  /* Rows in BOTH lists: cards live in a scrolling .mg-tree, intents in a plain list that scrolls
     with the dialog. Keyed by id, since openManage replaces every element. */
  const ROWS="[data-cardrow],[data-introw]";
  const rowKey=el=>el.getAttribute("data-cardrow")||el.getAttribute("data-introw");
  const before={};
  if(!mgReduceMotion()){
    modalCard.querySelectorAll(ROWS).forEach(el=>{
      if(!el.offsetParent) return;                  // inside a collapsed section
      before[rowKey(el)]=el.getBoundingClientRect().top;
    });
  }
  mutate();
  dressDialogInputs(modalCard);
  markCutText(modalCard);        // rebuilt rows measure fresh - see markCutText()
  openManage();
  /* Settle the DOM before measuring a pixel: the wrapper that moves the middle into
     .modal-body runs from a MutationObserver - a microtask AFTER this function - so
     measuring first read an unwrapped dialog (13px out) and then had every row
     RE-PARENTED underneath the animation, cancelling it outright. Idempotent, so the
     observer then finds nothing to do. */
  mountModalBody();
  const tree=modalCard.querySelector(".mg-tree");
  if(tree) tree.scrollTop=keepTree;
  const bodyAfter=modalCard.querySelector(".modal-body");
  if(bodyAfter) bodyAfter.scrollTop=keepCard;
  if(mgReduceMotion()) return;
  /* Clip each row against whatever actually scrolls around it - the tree for a card, the dialog
     body for an intent - so a row animating in one list is never measured against the other. */
  const bodyBox=(modalCard.querySelector(".modal-body")||modalCard).getBoundingClientRect();
  const moved=[], dys=[];
  modalCard.querySelectorAll(ROWS).forEach(el=>{
    const b=before[rowKey(el)];
    if(b==null || !el.offsetParent) return;
    const holder=el.closest(".mg-tree");
    const box=holder?holder.getBoundingClientRect():bodyBox;
    const r=el.getBoundingClientRect();
    if(r.bottom<box.top-40 || r.top>box.bottom+40) return;
    const dy=Math.round(b-r.top);
    if(!dy || Math.abs(dy)>box.height) return;
    moved.push(el); dys.push(dy);
  });
  if(!moved.length || moved.length>60) return;
  moved.forEach((el,i)=>{ el.style.transition="none"; el.style.willChange="transform";
                          el.style.transform="translateY("+dys[i]+"px)"; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void modalCard.offsetHeight;
  const clear=()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
  moved.forEach(el=>{ el.style.transition="transform .18s "+E_EASE; el.style.transform=""; });
  setTimeout(clear,240);
}
function mgFlip(container,mutate){
  const rows=Array.prototype.slice.call(container.children);
  const before=rows.map(el=>el.getBoundingClientRect());
  mutate();
  const moved=[];
  rows.forEach((el,i)=>{
    const a=el.getBoundingClientRect();
    const dx=Math.round(before[i].left-a.left), dy=Math.round(before[i].top-a.top);
    if(!dx && !dy) return;
    el.style.transition="none";
    el.style.willChange="transform";    // see the note in flipPills
    el.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(el);
  });
  if(!moved.length) return;
  const clear=()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void container.offsetHeight;
  moved.forEach(el=>{ el.style.transition="transform .18s "+E_EASE; el.style.transform=""; });
  setTimeout(clear,200);
}
function mgDomMove(fromEl,toEl){
  const fi=mgSiblingIdx(fromEl), ti=mgSiblingIdx(toEl);
  if(fi<0||ti<0) return;
  mgFlip(fromEl.parentNode,()=>{
    if(fi<ti) toEl.parentNode.insertBefore(fromEl, toEl.nextSibling);
    else toEl.parentNode.insertBefore(fromEl, toEl);
  });
}
function mgMoveCatOrder(fromKey,toKey){
  const from=catOrder.indexOf(fromKey), to=catOrder.indexOf(toKey);
  if(from<0||to<0||from===to) return false;
  catOrder.splice(to,0,catOrder.splice(from,1)[0]);
  return true;
}
/** Move a card into another category by dropping it there. A category is ordinary card
 *  data, written like every single-field edit: a PARTIAL override for a built-in - and
 *  dragging a card back to where the catalog put it removes the override, clearing the
 *  "edited" badge; customs own their `c` directly. Placed at the END of the target in
 *  pack.cardOrder: dropping into a container appends - the one rule that reads the same
 *  collapsed, empty or open; favourites still rise within the category by themselves.
 *  `findCard` still reports the OLD category until rebuildCards() runs - exactly what
 *  the position scan wants: every other card's `c` is untouched. */
function mgMoveCardToCategory(id, catKey){
  if(!id || !catKey || catKey==="__orphan" || !CATS[catKey]) return false;
  const m=findCard(id);
  if(!m || m.c===catKey) return false;
  if(m._custom){
    const ix=(pack.custom||[]).findIndex(x=>x&&x.id===id);
    if(ix<0) return false;
    pack.custom[ix].c=catKey;
  } else {
    const base=baseCard(id);
    if(!pack.overrides) pack.overrides={};
    const o=Object.assign({},pack.overrides[id]||{});
    if(base && base.c===catKey) delete o.c; else o.c=catKey;
    if(Object.keys(o).length) pack.overrides[id]=o; else delete pack.overrides[id];
  }
  ensureCardOrder();
  const from=pack.cardOrder.indexOf(id);
  if(from>=0){
    pack.cardOrder.splice(from,1);
    let at=-1;
    pack.cardOrder.forEach((oid,i)=>{
      const om=findCard(oid);
      if(om && om.id!==id && om.c===catKey) at=i;
    });
    pack.cardOrder.splice(at+1,0,id);
    cardOrderTouched();
  }
  return true;
}
function mgClearDropTarget(){
  document.querySelectorAll(".mg-cat.mg-drop").forEach(el=>el.classList.remove("mg-drop"));
}
/** Band for an intent row: hidden sinks, favourites lead, the rest follow - the order the
 *  Library already renders and the panel already sorts. Read live, never from the attribute. */
function mgIntentBand(iid){
  const i=intentIdxFromId(iid);
  if(i<0) return "x";
  if(isIntentHiddenIdx(i)) return "h";
  return isIntentFavourite(iid)?"f":"r";
}
/** Same-band only, like mgMoveCardOrder. intentOrder holds INDICES, so the ids coming off the
 *  rows are resolved to indices first and their positions in the order array are what move. */
function mgMoveIntentOrder(fromId,toId){
  if(mgIntentBand(fromId)!==mgIntentBand(toId)) return false;
  const fi=intentIdxFromId(fromId), ti=intentIdxFromId(toId);
  if(fi<0||ti<0) return false;
  const from=intentOrder.indexOf(fi), to=intentOrder.indexOf(ti);
  if(from<0||to<0||from===to) return false;
  intentOrder.splice(to,0,intentOrder.splice(from,1)[0]);
  return true;
}
/** Same-band only, and the band is checked against live state rather than the rendered
 *  attribute, so a stale row cannot smuggle a favourite past a plain entry. */
function mgMoveCardOrder(fromId,toId){
  ensureCardOrder();
  const a=findCard(fromId), b=findCard(toId);
  if(!a||!b||mgCardBand(a)!==mgCardBand(b)) return false;
  const from=pack.cardOrder.indexOf(fromId), to=pack.cardOrder.indexOf(toId);
  if(from<0||to<0||from===to) return false;
  pack.cardOrder.splice(to,0,pack.cardOrder.splice(from,1)[0]);
  cardOrderTouched();   // a reorder keeps the length - see cardOrderPos
  return true;
}
function wireManageDrag(){
  addEventListener("pointerdown",e=>{
    if(e.button!==0 || !modalOpen() || !e.target.closest) return;
    /* The row is the handle, minus everything that has its own job - the same rule the card list
       uses for its header. A card row is grabbable across its whole width including the title,
       which is plain text; a category row still excludes its rename field through the selector
       below. preventDefault() at the end is what stops a drag from starting a text selection. */
    if(e.target.closest("input,button,select,textarea,a")) return;
    const crow=e.target.closest(".mg-cat-row[data-crow]");
    const mrow=e.target.closest(".manage-row.mg-card[data-cardrow]");
    const irow=e.target.closest(".manage-row[data-introw]");
    if(crow) mgDrag={kind:"cat", key:crow.getAttribute("data-crow"), el:crow.closest(".mg-cat")};
    else if(mrow) mgDrag={kind:"card", key:mrow.getAttribute("data-cardrow"), el:mrow};
    else if(irow) mgDrag={kind:"intent", key:irow.getAttribute("data-introw"), el:irow};
    else return;
    mgClearDropTarget();   // a drag cancelled by the system never reaches pointerup; start clean
    mgDrag.x=e.clientX; mgDrag.y=e.clientY; mgDrag.moved=false; mgDrag.dropCat=null;
    try{ e.preventDefault(); }catch(_){}
  });
  addEventListener("pointermove",e=>{
    if(!mgDrag) return;
    if(!mgDrag.moved){
      if(Math.abs(e.clientX-mgDrag.x)+Math.abs(e.clientY-mgDrag.y)<5) return;
      mgDrag.moved=true;
      document.documentElement.classList.add("mgdrag");
      if(mgDrag.el) mgDrag.el.classList.add("dragging");
      try{ const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
    }
    // One swap at a time, and long enough to cover the 180ms FLIP - otherwise the next
    // elementFromPoint reads a row mid-transform and the pair trade places repeatedly.
    if(Date.now()-mgSwapLock<190) return;
    const under=document.elementFromPoint(e.clientX,e.clientY);
    if(!under||!under.closest) return;
    if(mgDrag.kind==="intent"){
      /* The simplest of the three: one flat list, no groups to cross and nothing to re-parent, so
         a reorder is the only gesture and it is live all the way. */
      const row=under.closest(".manage-row[data-introw]");
      if(!row||row===mgDrag.el) return;
      if(row.parentNode!==mgDrag.el.parentNode) return;
      if(row.getAttribute("data-band")!==mgDrag.el.getAttribute("data-band")) return;
      if(!mgMoveIntentOrder(mgDrag.key,row.getAttribute("data-introw"))) return;
      mgSwapLock=Date.now();
      mgDomMove(mgDrag.el,row);
      return;
    }
    if(mgDrag.kind==="cat"){
      const row=under.closest(".mg-cat-row[data-crow]");
      if(!row) return;
      const key=row.getAttribute("data-crow");
      if(key===mgDrag.key) return;
      /* Point at the header row but move the whole group, so an expanded category carries its
         cards with it - and so an open category's tall body is not itself a drop target. */
      const toEl=row.closest(".mg-cat");
      if(!toEl||toEl.parentNode!==mgDrag.el.parentNode) return;
      if(!mgMoveCatOrder(mgDrag.key,key)) return;
      mgSwapLock=Date.now();
      mgDomMove(mgDrag.el,toEl);
    } else {
      /* Crossing INTO another category is decided here and applied on RELEASE, unlike a
         reorder, which is live. Three reasons: the target is often collapsed (no row to
         slot into, nothing worth animating); re-parenting mid-gesture is how a drag loses
         its element; and the FLIP measures one container, not two. Highlight and commit
         once - you are dropping into a thing, not swapping with a neighbour. */
      const grp=under.closest(".mg-cat[data-cat]");
      const home=mgDrag.el.closest(".mg-cat[data-cat]");
      const gk=grp?grp.getAttribute("data-cat"):null;
      // "Uncategorised" is a rendering of cards whose category is gone, not a category - you can
      // drag OUT of it, never into it.
      if(grp && home && grp!==home && gk && gk!=="__orphan"){
        if(mgDrag.dropCat!==gk){
          mgClearDropTarget();
          grp.classList.add("mg-drop");
          mgDrag.dropCat=gk;
        }
        return;
      }
      if(mgDrag.dropCat){ mgClearDropTarget(); mgDrag.dropCat=null; }

      const row=under.closest(".manage-row.mg-card[data-cardrow]");
      if(!row||row===mgDrag.el) return;
      if(row.parentNode!==mgDrag.el.parentNode) return;          // reorder never leaves its category
      if(row.getAttribute("data-band")!==mgDrag.el.getAttribute("data-band")) return;
      if(!mgMoveCardOrder(mgDrag.key,row.getAttribute("data-cardrow"))) return;
      mgSwapLock=Date.now();
      mgDomMove(mgDrag.el,row);
    }
  },{passive:true});
  addEventListener("pointerup",endMgDrag);
  addEventListener("pointercancel",endMgDrag);
}
/* Named and bound to BOTH pointerup and pointercancel - every drag in the file carries
   the cancel half. A cancelled pointer (a touch taken by a browser gesture, a pointer lost
   to another window) otherwise strands three things: `html.mgdrag`, which puts
   user-select:none on the whole document; the row's `dragging` class; and a live mgDrag,
   so the global pointermove keeps reordering rows under a button nobody is holding. */
function endMgDrag(){
  if(!mgDrag) return;
  const {kind,moved,key,dropCat}=mgDrag;
  document.documentElement.classList.remove("mgdrag");
  if(mgDrag.el) mgDrag.el.classList.remove("dragging");
  mgClearDropTarget();
  mgDrag=null;
  if(!moved) return;
  /* A category change rewrites the card's data, not just an order array, so it needs the full
     round: rebuild, repaint the list and the pills (the counts moved), and re-render the tree
     because the row now belongs under a different parent. The target is opened first, so the
     card is visible where it landed rather than swallowed by a collapsed group. */
  if(kind==="card" && dropCat){
    if(mgMoveCardToCategory(key,dropCat)){
      savePack(); rebuildCards();
      recountMacros();
      mgOpen.add("cat:"+dropCat);
      render(); drawPills(); openManage();
      toast(t("Moved to")+" "+(CATS[dropCat]||dropCat));
    }
    return;
  }
  /* Persist once, at the end - the order arrays are mutated live so the rows follow the
     cursor, but a write per swap would be a write per 170ms of dragging. */
  if(kind==="cat"){ nsSet("CatOrder",JSON.stringify(catOrder)); drawPills(); }
  /* intentOrder is its own stored key, not part of the pack, and the PANEL has to be redrawn -
     it renders from the same array, so leaving it alone would show two different orders for the
     same list depending on which one you happened to be looking at. */
  else if(kind==="intent"){
    syncIntentOrder();
    drawIntentRail();
  }
  else savePack();
  render();
}

/** Inline category creation at the foot of the tree. Same contract as the "+" pill in the
 *  header - type, Enter to accept, Esc or an empty blur to cancel - rather than a dialog for
 *  one text field. The row is appended to the tree itself so the new category appears where it
 *  will actually live, and the tree scrolls to it. */
function startMgCatAdd(){
  const tree=modalCard&&modalCard.querySelector(".mg-tree");
  if(!tree || tree.querySelector(".mg-cat-new")) return;
  const wrap=document.createElement("div");
  wrap.className="mg-cat mg-cat-new";
  wrap.innerHTML='<div class="mg-cat-row"><span class="mg-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span>'+
    '<input type="text" class="mg-cat-lab2" id="mgNewCat" placeholder="New category" '+
    'spellcheck="false" autocomplete="off" aria-label="New category name"></div>';
  tree.appendChild(wrap);
  tree.scrollTop=tree.scrollHeight;
  const inp=wrap.querySelector("#mgNewCat");
  if(!inp) return;
  let done=false;
  const finish=ok=>{
    if(done) return;
    done=true;
    const name=inp.value.trim();
    wrap.remove();
    if(!ok||!name) return;
    const key=ensureCustomCat(name);
    rebuildCards(); drawPills();
    mgOpen.add("cat:"+key);        // open it, so the "+" that adds its first card is right there
    openManage();
    toast("Category added");
  };
  inp.focus();
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); finish(true); }
    else if(e.key==="Escape"){ e.preventDefault(); finish(false); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(true); }, 0); };
}

/* The screen's user-facing name is "LIBRARY". The identifiers - openManage, mg*,
   fromManage - keep their stem on purpose: code names track the code they touch, and
   "Manage" in the comments below is this function's own shorthand, not the label on the
   door. */
/** "Show all hidden (n)" for one of the two lists. Disabled at zero rather than absent: a
 *  control that vanishes teaches nothing, and its greyed "(0)" is the answer to the question
 *  that would otherwise send you hunting through the list for something that is not there. */
function tipShowHidden(kind,n){
  if(!n) return t("Nothing is hidden");
  return kind==="cards" ? t("Un-hide every hidden card") : t("Un-hide every hidden intent");
}
function mgShowHiddenBtn(kind,n){
  return '<button type="button" class="btn" data-show-hidden="'+esc(kind)+'"'+(n?"":" disabled")+
    ' title="'+esc(tipShowHidden(kind,n))+'">'+
    esc(t('Show all hidden'))+' ('+n+')</button>';
}
function openManage(){
  applyCatsToGlobal();

  /* Full intentOrder, minus deleted ones - hidden stay in place, greyed, with a closed eye.
     The removed filter matters here: Manage is the one surface that shows hidden rows, and
     without it a deleted intent would still be listed and re-editable from this dialog. */
  const mgGoneIntents=new Set(pack.intentRemoved||[]);
  /* Same banding every other surface uses - favourites lifted, hidden sunk, dragged
     order kept within bands. Manage read the raw intentOrder instead, so starring here
     moved nothing while the panel moved it to the top. Built here rather than from
     intentRows() on purpose: that helper drops rows with no label in the current
     language - right for a search surface, wrong for the screen where you would FIX one. */
  const mgIntentIdxs=intentOrder
    .filter(i=>!mgGoneIntents.has(intentIdAt(i)))
    .map((i,n)=>({i,n}))
    .sort((a,b)=>{
      const ha=isIntentHiddenIdx(a.i)?1:0, hb=isIntentHiddenIdx(b.i)?1:0;
      if(ha!==hb) return ha-hb;
      const fa=isIntentFavourite(intentIdAt(a.i))?0:1, fb=isIntentFavourite(intentIdAt(b.i))?0:1;
      if(fa!==fb) return fa-fb;
      return a.n-b.n;
    })
    .map(x=>x.i);
  const intentListRows=mgIntentIdxs.map(i=>{
    const iid=intentIdAt(i);
    const hid=isIntentHiddenIdx(i);
    const fav=isIntentFavourite(iid);
    const badge=(intentIsCustom(i)||intentIsOverridden(i))?' <span class="cbadge ed" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>':"";
    const catLab=primaryCatLabel(i)||"";
    const favTip=fav?"Remove from Favourites":"Add to Favourites";
    /* Hide toggles; delete is separate and lives only here. Both built-in and custom intents
       can be deleted now - a built-in goes to pack.intentRemoved and comes back on Reset. */
    const hideShow=hid
      ?'<button type="button" data-show-intent="'+esc(iid)+'" title="Show this intent again" aria-label="Show this intent again">'+ICON_EYE_SHUT+'</button>'
      :'<button type="button" data-hide-intent="'+esc(iid)+'" title="Hide this intent: it greys out and drops to the bottom" aria-label="Hide this intent">'+ICON_EYE_OPEN+'</button>';
    const trash='<button type="button" class="danger mg-trash" data-remove-intent="'+esc(iid)+'" title="Delete this intent" aria-label="Delete this intent">'+ICON_TRASH+'</button>';
    /* data-introw so mgRefreshAround() can find this row again after openManage() has replaced
       every element - the same job data-cardrow does in the tree. */
    /* data-band mirrors the card rows: a drag may only swap inside its own band, so hidden
       entries cannot be dragged up among the live ones and a favourite cannot be dragged out of
       the favourites - the same rule moveIntent() enforces for the panel, so the two surfaces
       cannot disagree about what order means. Checked again against live state in
       mgMoveIntentOrder, so a stale attribute cannot smuggle a row past its band. */
    return '<div class="manage-row'+(hid?" is-hidden":"")+'" data-introw="'+esc(iid)+'"'+
      ' data-band="'+(hid?"h":(fav?"f":"r"))+'"><span>'+esc(intentNavName(i)||"")+badge+
      (catLab?' <span style="color:var(--dim);font:11px var(--mono)">'+esc(catLab)+'</span>':'')+'</span>'+
      '<span class="cacts">'+
        '<button type="button" data-edit-intent-mg="'+i+'" title="Edit intent" aria-label="Edit intent">'+ICON_EDIT+'</button>'+
        hideShow+
        trash+
        '<button type="button" class="star-btn'+(fav?" on":"")+'" data-fav-intent-mg="'+esc(iid)+'" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'+
      '</span></div>';
  }).join("")||'<div class="manage-empty">'+esc(t("No intents."))+'</div>';

  const catCount=Object.keys(CATS).length;
  /* Hiding is the one personal act with no way back at scale: hidden things are
     invisible BY DESIGN, accumulate quietly, and cannot be undone by finding them -
     finding them is the problem; the only other cure, Clear local memory, is a cliff
     where a step was wanted. The count is IN the label, so a greyed "(0)" answers "did I
     hide anything?" by itself. Not danger-red: showing again destroys nothing.
     NO equivalent for favourites, weighed and declined: a star is visible, leads every
     list, and is curated over months - bulk-erasing it is a real loss with no undo,
     against a need that almost never arises. */
  const hiddenCardCount=(cards||[]).filter(m=>m&&m._hidden).length;
  const hiddenIntentCount=mgIntentIdxs.filter(i=>isIntentHiddenIdx(i)).length;

  const mgBody=''+
    mgSec("catmac","Categories & cards",
      mgCatTree()+
      '<div class="cat-new" style="margin-top:8px">'+
        '<button type="button" class="btn primary" id="mgAddCat" title="Create a new category">New category</button>'+
        mgShowHiddenBtn("cards",hiddenCardCount)+'</div>',
      catalogCountsLine("{MACROS} in {CARDS}, {CATEGORIES}",
        (cards||[]).length, totalMacroCount(), 0, catCount))+
    mgSec("intents","Intents",
      '<div class="mg-intents">'+intentListRows+'</div>'+
      '<div class="cat-new" style="margin-top:8px">'+
        '<button type="button" class="btn primary" id="mgAddIntent" title="Write a new clause for {INTENT}">New intent</button>'+
        mgShowHiddenBtn("intents",hiddenIntentCount)+'</div>',
      mgIntentIdxs.length)+
    /* Its own section, between the two lists it belongs with and the library-wide operations
       below. It is content in exactly the way categories, cards and intents are - the words a
       desk uses for who it is talking to - not a setting about the catalog file. */
    mgSec("who","ROLE suggestions",
      '<div class="mf" style="margin-bottom:0">'+
        '<input type="text" id="mgWho" spellcheck="false" autocomplete="off" '+
          'placeholder="booker, customer, account holder" '+
          'title="Notches for the ROLE wheel, comma-separated; blanks and repeats are dropped" '+
          'value="'+esc(whoOptions().join(", "))+'">'+
      '</div>',
      whoOptions().length)+
    /* Everything here acts on the whole library rather than on one entry - what is loaded,
       taking a copy out, bringing one in - which is exactly the line that separates it from
       the two sections above. Not called "administrative" or "compliance": nothing is gated
       and nobody is being administered. */
    mgSec("data","Catalog & data",
      /* THE EMPTY STATE ALONE. What is loaded is the marked row of the list below, counts and
         all: a summary line here said the same thing in the catalog's own edition while that
         row said the file's date on disk, and two dates for one catalog is item 406. */
      (((typeof E_CATALOG_NAME!=="undefined" && E_CATALOG_NAME) || (cards||[]).length)
        ? ''
        : '<p class="manage-empty" style="margin-top:0;color:var(--dim)">No catalog loaded - Etiuda is empty.</p>')+
      /* EVERY CATALOG THIS DESK CAN REACH, one row each, filled after the paint because only
         the host can read the folder and it answers asynchronously. The two buttons below the
         list are the folder itself: where it is, and where it should be. */
      '<div class="ec-list" id="mgCatList"></div>'+
      (eCatalogFolder()
        ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'
          +'<button type="button" class="btn" id="mgCatOpen" title="'+esc(eCatalogFolder())+'">'
            +esc(t("Open folder"))+'</button>'
          +'<button type="button" class="btn" id="mgCatFolder">'+esc(t("Change folder"))+'</button>'
          +'</div>'
        : '')+
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'+
        '<button type="button" class="btn primary" id="mgImportCatalog" title="Load a catalog file from disk: it is read as data, never executed. It replaces what is loaded now, and nothing on disk changes.">Import catalog…</button>'+
        '<button type="button" class="btn" id="mgExportCatalog" title="Save everything loaded now as a catalog file, your edits merged in">Export catalog…</button>'+
        /* No "Load sample" here. The demo belongs where somebody has nothing yet - the empty
           card list and the first-run invite, which appear only when there is nothing to
           lose. In this row it sat among Export, Import and Build, all things you do WITH
           your catalog, and read as a fourth - while actually replacing the catalog. */
      '</div>'+
      /* Only where a handle can exist, and only once one does: an empty promise to watch
         something is worse than no row at all. */
      ((eWatchSupported()&&eWatchName())
        ? '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px">'
          +'<span style="color:var(--dim)">'+esc(t("Watching"))+' <code>'+esc(eWatchName())+'</code></span>'
          +'<button type="button" class="btn" id="mgWatchCheck" title="Read that file again and offer it if it has changed">'+esc(t("Check for updates"))+'</button>'
          +'<button type="button" class="btn" id="mgWatchStop">'+esc(t("Stop watching"))+'</button>'
          +'</div>'
        : '')
      )+
    '';
  openDialog({
    title: "Library",
    /* Every section here is about one catalog, and the only place that says WHICH is inside
       "Catalog & data" - the last fold, shut unless you opened it. So the heading carries the
       name for the same reason the editors carry theirs: it scopes the screen you are on.
       Nothing when there is no catalog; the empty state inside says that better. */
    name: ()=>(typeof E_CATALOG_NAME!=="undefined" && E_CATALOG_NAME) ? E_CATALOG_NAME : "",
    body: mgBody,
    /* Wipe sits at the bar's LEFT EDGE, with Close at the far right: same as Settings' Reset,
       and .mf-left is the group that carries it there. Danger kept, because this one forgets
       personal state. */
    actions: '<div class="mf-left"><button type="button" class="btn danger" id="mgWipe" title="'+
      esc(t("Forget every personal card, edit, hide, rename and layout choice in this browser; the loaded catalog stays. It is also how you bring back anything you deleted."))+
      '">'+esc(t("Clear local memory…"))+'</button></div>'+
      '<button type="button" class="btn" id="mgClose">'+esc(t("Close"))+'</button>',
    wire: wireManage
  });
  function wireManage(){
  $("#mgClose").onclick=closeModal;
  $("#mgAddIntent").onclick=()=>openIntentEditor(null, true);
  $("#mgAddCat").onclick=()=>startMgCatAdd();
  $("#mgExportCatalog").onclick=()=>exportCatalog();
  /* Commit on change (blur or Enter), not per keystroke - a half-typed word is not a list.
     Matching the catalog's own list stores null rather than a copy, so the entry keeps
     following the catalog and a later import is not shadowed by a stale duplicate. */
  if($("#mgWho")) $("#mgWho").onchange=function(){
    const next=normWhoList(this.value);
    pack.who = (next.join("\u0000")===WHO_BASE.join("\u0000")) ? null : next;
    savePack();
    this.value=whoOptions().join(", ");     // show what was actually kept
    syncRoleDrum();   // the drum turns over the new list
  };
  $("#mgImportCatalog").onclick=importCatalogHere;
  paintCatalogList();
  if($("#mgCatOpen")) $("#mgCatOpen").onclick=()=>eOpenCatalogFolder();
  /* The picker is the host's and its caption goes out already translated, the shell having no
     t(). Writing the key is the whole act: the shell watches the desk, re-aims its own watch and
     offers whatever the new folder holds, so the list is repainted from the answer rather than
     from a guess about when that has happened. */
  if($("#mgCatFolder")) $("#mgCatFolder").onclick=()=>{
    eChooseCatalogFolder(t("Choose the folder Etiuda reads catalogs from")).then(dir=>{
      if(dir) openManage();
    });
  };
  if($("#mgWatchCheck")) $("#mgWatchCheck").onclick=()=>eCheckWatchedFile(true);
  if($("#mgWatchStop")) $("#mgWatchStop").onclick=()=>{
    eWatchClear().then(()=>toast(t("No longer watching that file.")));
  };
  // The wipe itself lives in clearLocalMemory() - one code path shared with Maintenance.
  $("#mgWipe").onclick=clearLocalMemory;
  /* Remember which groups are open, so the re-render after every edit does not shut them.
     Written on toggle rather than read back later because openManage() replaces the nodes. */
  wireFolds(modalCard,"details[data-mg]","details.manage-sec",
    d=>{ const k=d.getAttribute("data-mg"); if(d.open) mgOpen.add(k); else mgOpen.delete(k); });
  /* Expand / collapse a category. Only this button toggles - clicking the name edits it, and
     the row itself is a drag handle, so there is no ambiguous "click anywhere" target. */
  modalCard.querySelectorAll("[data-toggle]").forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      // pinned like the sections; catToggle does its own measuring inside modalResize
      mgPinCard();
      catToggle(btn.closest(".mg-cat"), btn.getAttribute("data-toggle"));
    };
  });

  // ---- card rows in the category tree
  /* Role toggles. Both repaint the pills and the cards, because the rings they control are on
     screen behind the dialog - the point of the toggle is watching that change. */
  modalCard.querySelectorAll("[data-role-always]").forEach(btn=>{
    btn.onclick=()=>{
      const k=btn.getAttribute("data-role-always");
      mgRefreshAround(()=>{
        setCatAlways(k,!isAlwaysCat(k));
        rebuildCards(); drawPills(); render();
        toast((CATS[k]||k)+" "+t(isAlwaysCat(k)?"is now a supporting category"
                                       :"is an ordinary category"));
      });
    };
  });
  modalCard.querySelectorAll("[data-add-card]").forEach(btn=>{
    // New cards are created inside a category, so the editor needs no category picker
    btn.onclick=()=>openCardEditor(null, btn.getAttribute("data-add-card"), true);
  });
  modalCard.querySelectorAll("[data-edit-card]").forEach(btn=>{
    btn.onclick=()=>openCardEditor(btn.getAttribute("data-edit-card"), null, true);
  });
  modalCard.querySelectorAll("[data-editcat]").forEach(btn=>{
    btn.onclick=()=>openCategoryEditor(btn.getAttribute("data-editcat"));
  });
  // hideCard is the same toggle the card uses, so the un-favourite rule cannot drift apart
  modalCard.querySelectorAll("[data-hide-card],[data-show-card]").forEach(btn=>{
    btn.onclick=()=>{
      /* No render()/openManage() after this: mgRefreshAround() rebuilds the dialog itself,
         and a SECOND rebuild replaced every row the animation had just set up -
         cancelling it and losing the scroll. The bare render() that sat here was the
         same mistake one level down: hideCard() already ends in render(). Every mutator
         called from Manage repaints what it changed - do not add a repaint after one. */
      mgRefreshAround(()=>hideCard(btn.getAttribute("data-hide-card")||btn.getAttribute("data-show-card")));
    };
  });
  modalCard.querySelectorAll("[data-remove-card]").forEach(btn=>{
    btn.onclick=()=>{ const id=btn.getAttribute("data-remove-card");
      // Confirm FIRST, outside the animation: a cancelled delete must not re-render anything.
      if(!findCard(id)) return;
      mgRefreshAround(()=>{ removeCard(id); }); };   // removeCard ends in rebuildCards()
  });
  modalCard.querySelectorAll("[data-fav-card]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>toggleFavourite(btn.getAttribute("data-fav-card")));
  });
  modalCard.querySelectorAll("[data-edit-intent-mg]").forEach(btn=>{
    btn.onclick=()=>openIntentEditor(+btn.getAttribute("data-edit-intent-mg"), true);
  });
  modalCard.querySelectorAll("[data-fav-intent-mg]").forEach(btn=>{
    // Starring lifts an intent to the top of the list, so it animates like every other move.
    btn.onclick=()=>mgRefreshAround(()=>toggleIntentFavourite(btn.getAttribute("data-fav-intent-mg")));
  });
  /* Both use setIntentHidden, so Manage and the panel cannot drift apart on the rule, and both
     go through mgRefreshAround for the same reason the star does: hiding sends a row to the
     bottom of the list, which is the longest move Manage makes and was the one that jumped. */
  /* Un-hide every hidden card, or every hidden intent. No confirm: it destroys nothing,
     and each one can be hidden again with the eye it came from. Routed through the SAME
     per-item functions the eye buttons call - hideCard also clears the runtime flag,
     setIntentHidden also touches the order - reproducing either here is how paths drift. */
  modalCard.querySelectorAll("[data-show-hidden]").forEach(btn=>{
    btn.onclick=()=>{
      const kind=btn.getAttribute("data-show-hidden");
      if(kind==="cards"){
        const ids=(cards||[]).filter(m=>m&&m._hidden).map(m=>m.id);
        if(!ids.length) return;
        ids.forEach(id=>hideCard(id));            // a toggle, and every one of these IS hidden
        toast(ids.length===1?t("1 card shown again")
                    :t("{N} cards shown again").replace("{N}",ids.length));
      }else{
        const ids=(pack.intentHidden||[]).slice();
        if(!ids.length) return;
        ids.forEach(id=>setIntentHidden(id,false));
        toast(ids.length===1?t("1 intent shown again")
                    :t("{N} intents shown again").replace("{N}",ids.length));
      }
      openManage();
    };
  });
  modalCard.querySelectorAll("[data-hide-intent]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>setIntentHidden(btn.getAttribute("data-hide-intent"), true));
  });
  modalCard.querySelectorAll("[data-show-intent]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>setIntentHidden(btn.getAttribute("data-show-intent"), false));
  });
  modalCard.querySelectorAll("[data-remove-intent]").forEach(btn=>{
    btn.onclick=()=>{ if(removeIntent(btn.getAttribute("data-remove-intent"))) openManage(); };
  });
  /* One deletion path for categories everywhere: removeCategory() owns the empty-only rule,
     the built-in / custom split, so the pill and this button cannot
     disagree about what is deletable. */
  modalCard.querySelectorAll("[data-delcat]").forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      const k=btn.getAttribute("data-delcat");
      if(cardCounts[k]){ toast("Move or delete cards in this category first"); return; }
      if(!ask("Delete this empty category?\n\nA Reset restores it from the catalog.")) return;
      if(removeCategory(k)){ mgOpen.delete("cat:"+k); drawPills(); render(); openManage(); }
    };
  });
  }
}

export {
  mgCardsIn,
  openManage,
  wireManageDrag
};
