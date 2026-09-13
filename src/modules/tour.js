import { openCardEditor } from "./card-editor.js";
import { closeFactsPanel } from "./facts.js";
import { fillProseIcons } from "./icons.js";
import { openManage } from "./manage.js";
import { drawIntentRail } from "./rail-list.js";
import { chordChips } from "./shortcuts.js";
import { openSettings } from "./settings.js";
import { lsGet, lsSet, lsDel } from "./storage.js";
import { drawPills } from "./tabs.js";
import { t } from "./ui-lang.js";

/* ---------- Guided tour ----------------------------------------------------
   Coach marks over live UI. No deps. Settings → Show tour… and first-run invite.
   Bump TOUR_VER to re-offer after a major layout change. */
const TOUR_VER=3;
let tourIdx=-1, tourRunning=false, tourRaf=0, tourArrowNeedsDraw=false;
function tourActive(){ return !!tourRunning; }
function tourStorageKey(){ return "pbTourDone_v"+TOUR_VER; }
function tourInviteKey(){ return "pbTourInvite_v"+TOUR_VER; }
function markTourDone(){
  lsSet(tourStorageKey(),"1"); lsSet(tourInviteKey(),"1");
}
function markTourInviteDismissed(){
  lsSet(tourInviteKey(),"1");
}
function tourSeen(){
  return lsGet(tourStorageKey())==="1";
}
function tourInviteDismissed(){
  return lsGet(tourInviteKey())==="1";
}

/* Armed by a prep that borrows app state for its showcase; drained by showTourStep before
   the next prep, and by endTour. One slot, not a stack - a step borrows at most once. */
let tourStepUndo=null;
function runTourStepUndo(){
  const u=tourStepUndo; tourStepUndo=null;
  if(typeof u==="function"){ try{ u(); }catch(_){} }
}
function tourEnsureRail(){
  /* Both branches below WRITE PREFERENCES to make the panel visible for one step. That is a
     loan, not a gift: the previous values are recorded here and handed to tourStepUndo, or
     an auto-hidden panel comes out of the tour locked open for good. */
  const prev={rail:lsGet("pbRail"), lock:lsGet("pbRailLock")};
  let borrowed=false;
  if(!railWanted()){
    lsSet("pbRail","1"); borrowed=true;
    syncRailLayout();
    drawIntentRail();
    syncLayoutPrefs();
  }
  if(!railActive()){
    // Narrow window may auto-hide; pin lock so the step can highlight the panel
    lsSet("pbRailLock","1"); lsSet("pbRail","1"); borrowed=true;
    syncRailLayout();
    drawIntentRail();
    syncLayoutPrefs();
  }
  if(borrowed) tourStepUndo=()=>{
    if(prev.rail==null) lsDel("pbRail"); else lsSet("pbRail",prev.rail);
    if(prev.lock==null) lsDel("pbRailLock"); else lsSet("pbRailLock",prev.lock);
    syncRailLayout();
    syncLayoutPrefs();
  };
}
function tourEnsurePills(){
  // Same loan-and-return contract as tourEnsureRail above.
  if(!pillsWanted()){
    const prev=lsGet("pbPills");
    lsSet("pbPills","1");
    syncLayoutPrefs();
    drawPills();
    schedulePillsCollapse();
    scheduleRailGeometry();
    tourStepUndo=()=>{
      if(prev==null) lsDel("pbPills"); else lsSet("pbPills",prev);
      syncLayoutPrefs();
      drawPills();
      schedulePillsCollapse();
    };
  }
}

/* Steps that point at the first card must start from the top of the list. Without
   this, opening the tour while scrolled down leaves the first card above the viewport;
   scrollIntoView({block:"nearest"}) then parks it under the sticky header and the
   spotlight lands on the header instead of the card. Instant, not smooth, so the tour has
   settled geometry to measure. */
function tourScrollListTop(){
  const el=pageScroller();
  try{ el.scrollTo({top:0, left:0, behavior:"auto"}); }
  catch(_){ try{ el.scrollTop=0; }catch(__){} }
}
function tourPickFirstCard(){
  const txt=list&&list.querySelector(".card[data-id] .txt[data-v]");
  if(txt){
    const card=txt.closest(".card[data-id]");
    if(card) setEntrySel(card.dataset.id, +txt.dataset.v);
    return card||txt;
  }
  return list&&list.querySelector(".card[data-id]");
}

/* Points at one control on the first card. Falls back to the card, then to the list, so a step
   still has something to spotlight on an empty Etiuda. */
function cardBtn(sel){
  const c=tourPickFirstCard();
  return (c&&c.querySelector&&c.querySelector(sel))||c||$("#list");
}

const TOUR_STEPS=[
  /* Ordered as one chat unfolds: the two names, the box, the panel it drives, the cards it
     narrows, the bar, then the tabs that keep all of it - only then the buttons and the corner. */
  {
    sel:".brand",
    title:"Welcome to Etiuda",
    body:"A live-chat macro bank for support agents. This short tour points at the main controls; you can skip it at any time with <kbd>Esc</kbd>.",
    pad:10
  },
  {
    sel:"#agent",
    title:"Your agent name",
    body:"Type the name customers should see, exactly as you want it to appear; <span class=\"fillmiss\">AGENT</span> reproduces it verbatim. Internal comments sign with your initials as /<span class=\"fillmiss\">INIT</span>.",
    pad:6
  },
  {
    sel:".field-wrap.paxrole",
    title:"Customer name and role",
    body:"Paste the name exactly as the chat gives it - full name, surname, ALL CAPS, all fine. Etiuda tidies it, and wherever a card addresses the customer it uses only the first name, declined in Polish automatically (ANNA KOWALSKA → <b>Anno</b>). Fills <span class=\"fillmiss\">PAX</span>. The wheel beside it sets who you are speaking to, relative to whoever the chat is about, and fills <span class=\"fillmiss\">ROLE</span> in internal comments. Click or scroll it to change; the empty notch clears it.",
    pad:6
  },
  {
    sel:"#intentComboWrap",
    title:"Search",
    body:"One box for everything: typing ranks the intents in the panel and filters the cards below it, in both languages. <kbd>↓</kbd> <kbd>↑</kbd> walk the intents that match, skipping the ones already picked; <kbd>Shift</kbd>+<kbd>↑</kbd> jumps to the top of the list, and a second one crosses to the first card (<kbd>Shift</kbd>+<kbd>↓</kbd> works the same way down). <kbd>Enter</kbd> picks the marked intent: it fills <span class=\"fillmiss\">INTENT</span> and rings the linked cards <b class=\"t-go\">green</b>; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> picks and keeps the box for the next one. <kbd>←</kbd> <kbd>→</kbd> step through the categories even from inside the box, and <kbd>Esc</kbd> clears.",
    pad:6
  },
  {
    sel:"#intentRail",
    title:"Intent panel",
    body:"Click to pick an intent, or <kbd>Ctrl</kbd>+click to pick several; picks stack at the top of the panel and the rest of the list scrolls beneath them, so a pick never leaves the screen. The pointer and the arrow keys share one mark. Drag to reorder, star to pin favourites to the top. Hold <kbd>Ctrl</kbd> over a star and it becomes an edit button; hold <kbd>Shift</kbd> and it becomes a hide button; hidden intents grey out and sink to the bottom, and the closed eye brings them back. The <span data-icon=\"pin\"></span> lock at the top keeps the panel open on narrow windows.",
    pad:8,
    prep:tourEnsureRail
  },
  {
    sel:()=>tourPickFirstCard()||$("#list"),
    title:"Cards",
    body:"Click a macro to copy it, or use <kbd>↑</kbd> <kbd>↓</kbd> between macros and <kbd>Enter</kbd> to copy (<kbd>Shift</kbd>+<kbd>Enter</kbd> other language). A card holding several shows <b>1/2</b> or <b>STEP 1/3</b>; each macro copies on its own. The small tags say why a card is where it is: <span class=\"cbadge hit\">int</span> linked to your intent, <span class=\"cbadge cat\">sup</span> a supporting category, <span class=\"cbadge fav\">fav</span> a favourite, <span class=\"cbadge ed\">mod</span> changed or added on this computer. Hover one for the full wording. Drag the card header to reorder within the same highlight group.",
    pad:6,
    prep:()=>{ tourScrollListTop(); tourPickFirstCard(); }
  },
  {
    sel:"#pills",
    title:"Category pills",
    body:"Filter cards by category; <kbd>Ctrl</kbd>+click keeps several. The rings say why a pill stands out: <b class=\"t-go\">green</b> - it holds a card linked to your intent; <b class=\"t-acc\">blue</b> - a supporting category, useful whatever the customer asked. <kbd>←</kbd> <kbd>→</kbd> step through them, from the search box too. Drag pills to reorder; double-click <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> to reset the order.",
    pad:8,
    prep:tourEnsurePills
  },
  {
    sel:"#tabsWrap",
    title:"Chat tabs",
    body:()=>t("One tab per chat: {KEY} steps to the next one from anywhere, {NEW} opens one. Each tab keeps its own language, <span class=\"fillmiss\">PAX</span>, <span class=\"fillmiss\">INTENT</span>, <span class=\"fillmiss\">ROLE</span> and categories, and its dot takes the colour of its category filter; settings like the theme and your agent name are shared. Drag a tab to reorder.")
            .replace("{KEY}",chordChips("tabNext")).replace("{NEW}",chordChips("tabNew")),
    pad:6
  },
  {
    sel:"#seg",
    title:"English / Polish",
    // A function, not a string: the key it names is rebindable, so it is read at show time
    body:()=>t("Switch the language of macro text on screen; {KEY} flips it from anywhere. Intent clauses that come from the list follow <b class=\"t-acc\">EN</b>/<b class=\"t-pl\">PL</b>; free-typed intent text does not. A card with no Polish shows its English rather than a gap, so only the first language is ever required.")
            .replace("{KEY}",chordChips("langToggle")),
    pad:6
  },
  /* One step per control on a card header, ordered by how far each one goes rather than by
     where it sits on the row: the star only SORTS a card, the eye puts it away, the pencil
     rewrites it - and the editor opens straight after the pencil that opens it, rather than
     several steps later where the connection has to be carried. `cardBtn` is the same
     resolve/prep pair three times over: pick the first card, then point at one of its buttons. */
  {
    sel:()=>cardBtn(".star-btn"),
    prep:()=>{ tourScrollListTop(); tourPickFirstCard(); },
    title:"Favourites",
    body:"The star lifts a card to the top of wherever it already is: to the head of its category, to the head of its highlight group when an intent is selected, and on <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> to a <b class=\"t-fav\"><span data-icon=\"star\"></span>Favourites</b> block at the top of the list. The gold star and the <span class=\"cbadge fav\">fav</span> tag mark it - separate from the <b class=\"t-go\">green</b> of an intent link and the <b class=\"t-acc\">blue</b> of a supporting category.",
    pad:8
  },
  {
    sel:()=>cardBtn('[data-act="hide"]'),
    prep:()=>{ tourScrollListTop(); tourPickFirstCard(); },
    title:"Put a card away",
    body:"The eye puts a card away: it greys out and sinks to the foot of its own category, and it shows nowhere else - not in All, and not in a search. Open that category with the box empty and the same button brings it back. Putting a starred card away also unstars it. Nothing is deleted; <b class=\"t-bad\">Delete</b> lives only in the editor and in Library.",
    pad:8
  },
  {
    sel:()=>cardBtn('[data-act="edit"]'),
    prep:()=>{ tourScrollListTop(); tourPickFirstCard(); },
    title:"Edit a card",
    body:"The pencil opens the card for editing - both languages, the internal note, the search keywords, and everything about how it behaves. Editing a built-in card writes a personal override <b>on this computer</b>; the catalog itself is untouched, and the editor's <b>Reset</b> brings the original wording back whenever you want it.",
    pad:8
  },
  {
    /* Opened for real rather than described. The editor is four folds and a row of buttons, and
       no amount of prose about it lands the way seeing it does. First card if there is one; a
       New card on an empty Etiuda, which is the state a first-run tour is usually in. */
    sel:"#modalCard",
    modal:true,
    pad:4,
    title:"The card editor",
    body:"<span class=\"t-sec\">Content</span> holds the text in both languages, with the internal note. Folded below: <span class=\"t-sec\">Keywords</span>, <span class=\"t-sec\">Category</span>, <span class=\"t-sec\">Linked intents</span> - which makes a card ring green under an intent, and marks its category relevant to those intents - and <span class=\"t-sec\">Advanced</span>, holding alternatives, ordered steps and the ring flags. <b>Cancel</b> leaves everything as it was. A row in <b>Library</b> opens the same screen.",
    prep:()=>{
      openCardEditor((typeof cards!=="undefined" && cards && cards.length) ? cards[0].id : null);
    }
  },
  /* AFTER the editor, not before it: the four steps above act on a card that already exists,
     and this is the one that makes the one that does not - into the screen just shown. Between
     the pencil and the editor it would have cut the pencil from what it opens. */
  {
    sel:"#addCardFab",
    title:"A card of your own",
    body:"The <b>+</b> in the corner starts a new card from wherever you are - the same screen the pencil opens, empty. Inside a category it files into that one; under <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> the editor asks which, in its <span class=\"t-sec\">Category</span> section.",
    pad:10
  },
  {
    sel:"#factsBtn",
    title:"Quick facts",
    body:"Fees, deadlines, and useful links - click a link-like token to copy the full URL. You can edit this text for yourself; it stays in this browser.",
    pad:8
  },
  {
    sel:"#theme",
    title:"Light and dark",
    body:"Etiuda follows your system's setting, and keeps following it. Clicking here is what turns that into a choice, and it is remembered from then on.",
    pad:8
  },
  {
    /* The button, with the menu SHUT. The menu hangs below and to the left of a corner
       button, so a spotlight covering both encloses a wedge of empty header and reads as
       two things being pointed at. A menu is also the one thing a tour need not
       demonstrate - it opens on a click and closes on the next. */
    sel:"#settingsBtn",
    title:"Menu",
    body:"Everything that is not a card. <b>Library</b> is where the content lives, <b>Settings</b> holds the interface language, the appearance and the keyboard shortcuts, and the entries in the middle hide or lock the intent panel and the category bar. Hold <kbd>Ctrl</kbd> to peek at either while it is hidden. This tour is here too, under <b>Show tour…</b>.",
    pad:8
  },
  {
    /* Opens exactly as the user's own Manage opens - on Catalog & data. Forcing a section
       open would silently change mgOpen - session state - for the rest of the session: a
       step showing the real thing must not adjust the real thing to suit itself. The body
       names all four sections anyway, which is what the step is for. */
    sel:"#modalCard",
    modal:true,
    pad:4,
    title:"Library",
    body:"<b><span data-icon=\"settings\"></span> → Library</b> opens this, and it is where the content lives. <span class=\"t-sec\">Categories &amp; cards</span> lists everything you have, grouped - add, edit, hide, delete, or drag a card into another category. <span class=\"t-sec\">Intents</span> does the same for the intent list. <span class=\"t-sec\">ROLE suggestions</span> fills the ROLE box. <span class=\"t-sec\">Catalog &amp; data</span> saves what you have to a file, brings someone else's in, or bakes the lot into a single copy to hand on.",
    prep:()=>{ openManage(); }
  },
  {
    // Same rule as Library above: opened as the menu opens it, no section forced.
    sel:"#modalCard",
    modal:true,
    pad:4,
    title:"Settings",
    body:"<b><span data-icon=\"settings\"></span> → Settings</b> is the interface itself. <span class=\"t-sec\">Localisation</span> picks the language of the buttons and menus; the macros have their own switch in the header. <span class=\"t-sec\">Appearance</span> holds the theme, the columns, the blur and the animations; <span class=\"t-sec\">Layout</span> says what stays docked and what may hide itself when space is short; <span class=\"t-sec\">Keyboard shortcuts</span> rebinds any chord when you click it. <b>Reset defaults</b> puts this screen back to what it ships with and touches no card.",
    prep:()=>{ openSettings(); }
  },
  {
    sel:".brand",
    title:"You are set",
    body:"Shortcuts live under <span data-icon=\"settings\"></span> <b>→ About Etiuda</b>, and <b>Show tour…</b> in the same menu brings this back. When in doubt, your team lead is the one to ask.",
    pad:10
  }
];


function tourEls(){
  return {
    root:$("#tourRoot"),
    shade:$("#tourShade"),
    hole:$("#tourHole"),
    arrow:$("#tourArrow"),
    card:$("#tourCard"),
    title:$("#tourTitle"),
    body:$("#tourBody"),
    step:$("#tourStepLabel"),
    next:$("#tourNext"),
    prev:$("#tourPrev"),
    skip:$("#tourSkip")
  };
}
function resolveTourTarget(step){
  if(!step) return null;
  let el=null;
  if(typeof step.sel==="function"){
    try{ el=step.sel(); }catch(_){ el=null; }
  } else if(step.sel){
    el=document.querySelector(step.sel);
  }
  if(el && el.getClientRects && el.getClientRects().length===0) return null;
  return el||null;
}
/** The box a step's spotlight has to cover - where the target will SETTLE, not where it is now.
 *
 *  A dialog arrives with a 180ms translate-and-scale, and getBoundingClientRect() reports the
 *  painted box, so a step that opens one framed the animation's first frame and then slid to the
 *  real geometry a third of a second later, dragging the arrow with it. That was the stutter.
 *  The transform is undone rather than waited out: the layout size is offsetWidth/Height, which
 *  no transform touches, and with the default centre origin a scale leaves the centre alone while
 *  a translate moves it by exactly the matrix's (e,f). So the settled box is available from the
 *  frame the element appears, and the later re-place finds nothing to move.
 *  Identity - every other step - returns the rect untouched. */
function tourTargetRect(el){
  if(!el||!el.getBoundingClientRect) return null;
  const r=el.getBoundingClientRect();
  let m=null;
  try{
    const t=getComputedStyle(el).transform;
    if(t && t!=="none" && typeof DOMMatrixReadOnly==="function") m=new DOMMatrixReadOnly(t);
  }catch(_){ m=null; }
  if(!m || m.isIdentity) return {top:r.top, left:r.left, width:r.width, height:r.height};
  const w=el.offsetWidth||r.width, h=el.offsetHeight||r.height;
  const cx=r.left+r.width/2-m.e, cy=r.top+r.height/2-m.f;
  return {top:cy-h/2, left:cx-w/2, width:w, height:h};
}
function placeTourUI(){
  if(!tourRunning) return;
  const step=TOUR_STEPS[tourIdx];
  if(!step) return;
  const els=tourEls();
  if(!els.root||!els.card) return;
  const pad=step.pad!=null?step.pad:8;
  const target=resolveTourTarget(step);
  const vw=window.innerWidth, vh=window.innerHeight;
  /* A step showing a whole dialog gets a narrower card and a tighter gap. The dialog is
     560px and CENTRED - it must be, the step shows the real thing - leaving ~350px per
     side: 360+34 does not fit, 320+14 does. Under ~1240px nothing fits either side and
     the card lands over the dialog - legible, above it, the honest fallback. Width is
     written before the height is read: a narrower card is a taller one. */
  const modalStep=!!step.modal;
  const cardW=Math.min(modalStep?320:360, vw-28);
  els.card.style.width=cardW+"px";
  const cardH=Math.min(els.card.offsetHeight||220, Math.min(vh*0.7, 480));

  let holeRect=null;
  const targetRect=tourTargetRect(target);
  if(targetRect){
    const r=targetRect;
    holeRect={
      top:Math.max(6, r.top-pad),
      left:Math.max(6, r.left-pad),
      width:Math.min(vw-12, r.width+pad*2),
      height:Math.min(vh-12, r.height+pad*2)
    };
    // Clamp into viewport
    if(holeRect.left+holeRect.width>vw-6) holeRect.width=Math.max(40, vw-6-holeRect.left);
    if(holeRect.top+holeRect.height>vh-6) holeRect.height=Math.max(32, vh-6-holeRect.top);
  }

  if(holeRect && els.hole){
    els.hole.style.display="block";
    els.hole.style.top=holeRect.top+"px";
    els.hole.style.left=holeRect.left+"px";
    els.hole.style.width=holeRect.width+"px";
    els.hole.style.height=holeRect.height+"px";
    els.hole.classList.add("pulse");
  } else if(els.hole){
    els.hole.style.display="none";
    els.hole.classList.remove("pulse");
  }

  // Prefer card below target, else above, else side.
  // Leave a bit more gap so the hand-drawn arrow has room to read as a longer stroke.
  /* Room between the callout and the spotlight. Wider than it needs to be for separation: it is
     also the arrow's runway, and 34px produced a stroke barely longer than its own arrowhead.
     A dialog step keeps the tight gap - there the arrow goes around rather than across, so it
     makes its own length. */
  const gap=modalStep?14:44;
  let cardTop, cardLeft, place="below";
  if(holeRect){
    const below=holeRect.top+holeRect.height+gap;
    const above=holeRect.top-cardH-gap;
    if(below+cardH<vh-10){ cardTop=below; place="below"; }
    else if(above>10){ cardTop=above; place="above"; }
    else {
      cardTop=Math.max(12, Math.min(vh-cardH-12, holeRect.top));
      place="side";
    }
    cardLeft=Math.max(14, Math.min(vw-cardW-14, holeRect.left+holeRect.width/2-cardW/2));
    if(place==="side"){
      /* ADJACENT DIALOG STEPS ALTERNATE, AND ONLY THEY DO. A dialog's spotlight is centred, so
         two in a row are one picture with different words and the callout moving is what says a
         step happened. One with no dialog before it stays on the default side, where the eye
         already is after a step that followed its own target. Hence the RUN ending here rather
         than the index's parity: an odd one in takes the far side. Room still decides - this
         picks which side to ask for, and too narrow a side hands over to the other. */
      let mrun=0;
      for(let j=tourIdx-1; j>=0 && TOUR_STEPS[j] && TOUR_STEPS[j].modal; j--) mrun++;
      const rightX=holeRect.left+holeRect.width+gap, leftX=holeRect.left-cardW-gap;
      const fitsR=rightX+cardW<vw-10, fitsL=leftX>=14;
      cardLeft = (modalStep && (mrun%2)===1)
        ? (fitsL ? leftX : (fitsR ? rightX : Math.max(14,leftX)))
        : (fitsR ? rightX : (fitsL ? leftX : Math.max(14,leftX)));
    }
  } else {
    cardTop=Math.max(24, (vh-cardH)/2);
    cardLeft=Math.max(14, (vw-cardW)/2);
    place="center";
  }
  els.card.style.top=cardTop+"px";
  els.card.style.left=cardLeft+"px";
  els.card.style.width=cardW+"px";

  /* Hand-drawn arrow, callout → spotlight. The route decides whether there is one at all: it
     returns null when the callout has been clamped on top of the spotlight, which is the only
     arrangement with nothing to point out. */
  const route=(els.arrow && holeRect && place!=="center")
    ? tourArrowRoute({top:cardTop,left:cardLeft,width:cardW,height:cardH}, holeRect, place, tourIdx)
    : null;
  if(els.arrow && route){
    const doDraw=tourArrowNeedsDraw;
    tourArrowNeedsDraw=false;
    drawTourArrow(els.arrow, route, doDraw);
    els.arrow.style.display="block";
    els.arrow.classList.add("show");
  } else if(els.arrow){
    els.arrow.classList.remove("show","draw");
    els.arrow.style.display="none";
  }
}
/** Nearest points on callout and hole facing each other. */
/* ---- the tour's arrow ------------------------------------------------------------------------
   Two halves, deliberately apart. tourArrowRoute() decides the SHAPE - always one cubic
   bezier, from the callout to the spotlight - and drawTourArrow() renders whatever cubic
   it is handed. Fused, the renderer could only bow the straight line between two endpoints
   and sized its viewBox on that assumption - and under about forty pixels such an arrow is
   mostly arrowhead, a rendering fault rather than a pointer. Apart, a route that goes
   AROUND is a few lines of arithmetic, the renderer never changes, and the box is measured
   from the curve's own control points, so any route fits inside it. */
const ARROW={
  tuck:6,        // start the stroke a few px UNDER the callout, which is painted above it, so
                 // the line emerges from beneath the panel instead of butting onto its edge
  reach:2,       // and finish just outside the spotlight's near edge
  minRun:56,     // a sideways run shorter than this goes around instead - see elbow()
  drop:56,       // how far an elbow travels clear of the callout before it turns
  minDrop:26,    // and the least that still reads as a hook rather than a nub, where the room
                 // is tight on both sides and the clamp below decides the rest
  sweep:.55,     // and how far it comes back in along the spotlight's side, as a fraction of
                 // the ground it has to cover. This is what puts the head on the horizontal, so
                 // it points squarely rather than grazing past. A FRACTION and not a constant:
                 // 78px of it reached back further than the foot when the two were close, which
                 // put a small counter-turn at the top of the stroke - the same S, in miniature
  inset:52,      // where along the callout's bottom edge an elbow starts
  edge:28,       // keeps a straight arrow's foot off the callout's corners
  lip:12,        // and its tip off the spotlight's
  tip:2.5,       // how far short of the apex the shaft stops. Only enough to keep a 2.35px round
                 // cap from poking through the point - it used to scale with the arrow's LENGTH
                 // and reach 9px, which on a head with 13px arms left a plainly visible gap
                 // between line and point on exactly the long arrows where it showed most
  lean:.18,      // how far the FOOT sits to one side of the tip, as a fraction of the run, and
  leanMin:6,     // the bounds on it. This is the whole source of the curve: a line that leaves
  leanMax:12,    // the callout at a slight angle and straightens as it lands turns one way only
  pad:32         // slack around the curve's box, for the stroke width and the head
};
/** The arrow's geometry for one step, or null when there is nothing sensible to draw.
 *
 *  Four rules, in order. Every arrow in the tour is one of these, and which one it is follows
 *  from the geometry alone - there is no per-step tuning anywhere.
 *
 *   1. NOTHING TO POINT AT -> no arrow. The callout has been clamped on top of the spotlight
 *      because the window is too narrow for them to sit apart. An arrow from inside a thing to
 *      that thing's own edge marks nothing.
 *   2. NO ROOM TO CROSS -> go around (elbow). Under `minRun` of clear space, a straight arrow is
 *      shorter than its own head. Leave under the callout, travel clear, turn in along the
 *      spotlight's side.
 *   3. OTHERWISE -> cross it. The foot sits a little to one side of the tip (see slide()), so
 *      the line leaves the callout at a slight angle and straightens as it lands.
 *
 *  And one rule over all three: THE ARROW LANDS SQUARE on the spotlight's near edge. Its arrival
 *  direction is stated - the (ax,ay) passed to curve() - never left to fall out of the shape.
 *  Which is also why the curve comes from the foot rather than from a bow through the middle: a
 *  line that bulges and still lands square has to turn one way and then back, and an S across
 *  forty pixels reads as a wobble rather than as a hand.
 *
 *  @returns {{x1,y1,c1x,c1y,c2x,c2y,x2,y2}|null} a single cubic, in page coordinates. */
function tourArrowRoute(card, hole, place, seed){
  const c={x1:card.left, y1:card.top, x2:card.left+card.width, y2:card.top+card.height};
  const h={x1:hole.left, y1:hole.top, x2:hole.left+hole.width, y2:hole.top+hole.height};
  const hcx=(h.x1+h.x2)/2, hcy=(h.y1+h.y2)/2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  // Which side a slid foot goes. Fixed per step, so a resize never redraws the arrow
  // differently, and alternating, so two steps in a row do not lean the same way.
  const lean=((seed|0)%2===0)?1:-1;

  /* How far the foot sits to one side of the tip - the whole source of the curve. Zero
     gives a ruled line: correct, and lifeless. A bulge in the middle has to turn back to
     land square - an S, which across forty pixels reads as a wobble. Offsetting the FOOT
     makes the tangent rotate one way from start to tip: one bend, always the same
     direction, and the head still lands square. A fraction of the run, bounded at both
     ends, so a long arrow curves as gently as a short one. */
  function slide(run){
    return Math.max(ARROW.leanMin, Math.min(ARROW.leanMax, run*ARROW.lean))*lean;
  }

  /* Curvature is INVERSE to length: a short arrow needs a real arc or it reads as a
     tick, a long one needs barely a hint or it reads as cartoonish - a flat fraction had
     it exactly backwards. And the arrow ARRIVES ALONG A STATED AXIS - the last control
     point is placed on (ax,ay) rather than falling out of the bow, which brought short
     runs in ~30° off the horizontal, the head sliding along the edge it should point
     into. The hand-drawn sweep lives entirely in the FIRST control point. */
  /* One cubic, and the departure direction is DERIVED rather than chosen - which is the whole
     difference between an arc and an S.

     Leaving along the chord seems like the natural thing and is not: with the foot offset to one
     side and the tip locked square, a line that starts along the chord has to swing off it and
     then swing back to land, and that second correction is the S. What a single arc needs is for
     the two tangents to make EQUAL AND OPPOSITE angles with the chord - the defining property of
     a circular arc through two points. So the departure is the arrival axis reflected about the
     chord: same angle, other side. The curve then turns one way from foot to tip and never back,
     whatever the offset happens to be, with no constant to tune and nothing to get wrong at an
     unusual size.

     When foot and tip are already in line the reflection returns the axis itself and the two
     control points fall on the chord, drawing a straight line - which is what the elbow's
     straight leg relies on. */
  function curve(x1,y1,x2,y2,ax,ay){
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len, nx=-uy, ny=ux;        // chord frame: along, and perpendicular
    const along=ax*ux+ay*uy, across=ax*nx+ay*ny;      // the arrival axis, in that frame
    const ex=along*ux-across*nx, ey=along*uy-across*ny;   // reflected: the across part negated
    const k=len*0.4;
    return {x1:x1, y1:y1, x2:x2, y2:y2,
      c1x:x1+ex*k,     c1y:y1+ey*k,
      c2x:x2-ax*len*0.4, c2y:y2-ay*len*0.4};
  }

  /* No room beside the callout - the case a dialog step is always in, since the dialog is
     centred and the callout is pressed against it. Leave through the callout's BOTTOM edge,
     travel clear of it, then turn in along the spotlight's side. Downwards unless the callout
     is near the foot of the window, in which case the same shape goes up.
     `dir` is which way the spotlight lies: -1 to the left, +1 to the right. */
  function elbow(dir){
    const vh=window.innerHeight;
    /* ROOM, NOT A THRESHOLD. Asking whether a FULL drop fits below, and turning up when it does
       not, never asks whether up has any room at all: on a short dialog whose callout starts
       level with it, below can be two pixels short of the constant and above empty, and the
       hook becomes a six-pixel stub. Take the side with more room and travel what it gives, up
       to the drop, which leaves every case that has room where a threshold put it. */
    const below=Math.min(vh-16, h.y2-ARROW.lip)-c.y2;
    const above=c.y1-(h.y1+ARROW.lip);
    const down=below>=above;
    const run=Math.min(ARROW.drop, Math.max(ARROW.minDrop, down?below:above));
    void lean;                                    // an elbow's shape is fixed by the geometry
    const x1=dir<0 ? c.x1+ARROW.inset : c.x2-ARROW.inset;
    const y1=down ? c.y2-ARROW.tuck : c.y1+ARROW.tuck;
    const x2=dir<0 ? h.x2+ARROW.reach : h.x1-ARROW.reach;
    const y2=clamp(down ? c.y2+run : c.y1-run, h.y1+ARROW.lip, h.y2-ARROW.lip);
    /* Both control points stay between the foot and the tip, so the turn runs one way: down out
       of the callout, then round into the spotlight's side. */
    const reach=Math.abs(x1-x2)*ARROW.sweep;
    return {x1:x1, y1:y1, x2:x2, y2:y2,
      c1x:x1,             c1y:y1+(y2-y1)*0.78,        // straight out from under the callout
      c2x:x2-dir*reach,   c2y:y2};                    // and in along the spotlight's side
  }

  if(place==="side"){
    const onRight=c.x1>hcx, dir=onRight?-1:1;
    const gap=onRight ? c.x1-h.x2 : h.x1-c.x2;
    /* Overlapping means the window was too narrow for the two to sit side by side and the
       callout has been clamped on top of the spotlight. An arrow from inside a thing to that
       thing's own edge points out nothing at all. */
    if(gap<0) return null;
    if(gap<ARROW.minRun) return elbow(dir);
    const y1=clamp(hcy+slide(gap), c.y1+36, c.y2-24);
    return curve(onRight ? c.x1+ARROW.tuck : c.x2-ARROW.tuck, y1,
                 onRight ? h.x2+ARROW.reach : h.x1-ARROW.reach,
                 clamp(hcy, h.y1+ARROW.lip, h.y2-ARROW.lip),
                 dir, 0);                       // lands horizontally on the spotlight's side
  }
  /* Above or below, the run is vertical and cannot be short: the placement that chose it only
     chose it because a whole callout plus the gap fitted there. */
  const goesUp=place==="below";                 // callout below the spotlight, so the arrow goes up
  const y1=goesUp ? c.y1+ARROW.tuck : c.y2-ARROW.tuck;
  const y2=goesUp ? h.y2+ARROW.reach : h.y1-ARROW.reach;
  const x1=clamp(hcx+slide(Math.abs(y2-y1)), c.x1+ARROW.edge, c.x2-ARROW.edge);
  return curve(x1, y1, clamp(hcx, h.x1+ARROW.lip, h.x2-ARROW.lip), y2,
               0, goesUp?-1:1);                 // lands square on the spotlight's near edge
}
/**
 * Renders one cubic as a hand-drawn arrow. Knows nothing about callouts or spotlights.
 */
function drawTourArrow(svg, r, animate){
  if(!svg||!r) return;
  const shaft=svg.querySelector(".tour-shaft"), head=svg.querySelector(".tour-head");
  /* Box measured from the CURVE, control points included. A bezier never leaves the hull of its
     four points, so this cannot clip whatever route it is handed - which is what makes adding a
     route a routing-only change. The old box was derived from the two endpoints, which was only
     ever right because the only shape was a nearly straight line between them. */
  const xs=[r.x1,r.c1x,r.c2x,r.x2], ys=[r.y1,r.c1y,r.c2y,r.y2];
  const minX=Math.min.apply(null,xs)-ARROW.pad, minY=Math.min.apply(null,ys)-ARROW.pad;
  const w=Math.max(48, Math.max.apply(null,xs)+ARROW.pad-minX);
  const h=Math.max(48, Math.max.apply(null,ys)+ARROW.pad-minY);
  svg.setAttribute("viewBox","0 0 "+w+" "+h);
  svg.style.left=minX+"px";
  svg.style.top=minY+"px";
  svg.style.width=w+"px";
  svg.style.height=h+"px";

  const x1=r.x1-minX, y1=r.y1-minY, x2=r.x2-minX, y2=r.y2-minY;
  const c1x=r.c1x-minX, c1y=r.c1y-minY, c2x=r.c2x-minX, c2y=r.c2y-minY;

  /* The direction the stroke ARRIVES from: a cubic's tangent at its end is (end - c2). Falls
     back to the chord when those two coincide - a degenerate control point would otherwise
     leave the head pointing in whatever direction a division by almost-zero produced. */
  let hx=x2-c2x, hy=y2-c2y, hlen=Math.hypot(hx,hy);
  if(hlen<0.5){ hx=x2-x1; hy=y2-y1; hlen=Math.hypot(hx,hy)||1; }
  const hu=hx/hlen, hv=hy/hlen;
  const span=Math.hypot(x2-x1,y2-y1)||1;

  /* The shaft is SPLIT a few pixels short of the tip, not merely ended there: pulling the
     end point back while the control points stay put re-bends the whole last third, and
     the shaft finishes beside the head rather than behind it - worst exactly where the
     curve is longest. De Casteljau at t gives the identical curve, just shorter, so the
     trimmed end sits on the path with the path's own tangent and runs straight into the
     head. t comes from the real length, measured off the full path, because the parameter
     is not arc length. */
  if(shaft){
    const P=(x,y)=>x.toFixed(1)+" "+y.toFixed(1);
    shaft.setAttribute("d","M "+P(x1,y1)+" C "+P(c1x,c1y)+", "+P(c2x,c2y)+", "+P(x2,y2));
    const L=shaft.getTotalLength()||span;
    const t=Math.max(0.5, 1-Math.min(ARROW.tip, L*0.12)/L);
    const mid=(a,b)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
    const A=mid([x1,y1],[c1x,c1y]), B=mid([c1x,c1y],[c2x,c2y]), C=mid([c2x,c2y],[x2,y2]);
    const D=mid(A,B), E=mid(B,C), F=mid(D,E);
    shaft.setAttribute("d","M "+P(x1,y1)+" C "+P(A[0],A[1])+", "+P(D[0],D[1])+", "+P(F[0],F[1]));
  }
  // Nearly symmetric barbs on the arrival tangent, with a tiny soft corner for the hand feel
  const pn=-hv, pm=hu;
  const arm=Math.max(10, Math.min(14, span*0.11));
  const spread=0.42;
  const b1x=x2-hu*arm+pn*arm*spread, b1y=y2-hv*arm+pm*arm*spread;
  const b2x=x2-hu*arm-pn*arm*spread, b2y=y2-hv*arm-pm*arm*spread;
  const w1x=(x2+b1x)/2+pn*0.4, w1y=(y2+b1y)/2+pm*0.4;
  const w2x=(x2+b2x)/2-pn*0.4, w2y=(y2+b2y)/2-pm*0.4;
  if(head){
    head.setAttribute("d",
      "M "+b1x.toFixed(1)+" "+b1y.toFixed(1)+
      " Q "+w1x.toFixed(1)+" "+w1y.toFixed(1)+
      " "+x2.toFixed(1)+" "+y2.toFixed(1)+
      " Q "+w2x.toFixed(1)+" "+w2y.toFixed(1)+
      " "+b2x.toFixed(1)+" "+b2y.toFixed(1));
  }
  // Draw-on animation only when the step changes (not on every resize)
  if(animate){
    svg.classList.remove("draw");
    void svg.offsetWidth;
    svg.classList.add("draw");
  }
}
function scheduleTourPlace(){
  if(tourRaf) cancelAnimationFrame(tourRaf);
  tourRaf=requestAnimationFrame(()=>{
    tourRaf=0;
    placeTourUI();
    // Second frame after fonts/layout
    requestAnimationFrame(placeTourUI);
  });
}
function showTourStep(i){
  if(i<0||i>=TOUR_STEPS.length){ endTour(true); return; }
  tourIdx=i;
  tourArrowNeedsDraw=false;
  const step=TOUR_STEPS[i];
  const els=tourEls();
  /* A step that shows a dialog opens it in its own prep and declares `modal`. Every other step
     shuts whatever is open, so stepping backwards out of one does not leave a dialog standing
     over the rest of the tour - and the class goes on BEFORE prep runs, so the dialog is laid
     out in its shifted position before anything measures it. */
  if(!step.modal && modalOpen()){
    closeModal();
  }
  // No step opens the menu, and one left open from before the tour would sit over the spotlight.
  closeSettingsMenu();
  /* A showcase must not outlive its step: whatever the PREVIOUS step's prep borrowed is given
     back before this step's prep takes anything - in either direction, and endTour gives it
     back too. The rail step taught the lesson: it locked the auto-hidden panel open to be
     pointed at, and without this the lock persisted past the step, past the tour, and past
     the session - the panel sat over the cards of every later step and stayed. */
  runTourStepUndo();
  if(step.prep){
    try{ step.prep(); }catch(_){}
  }
  if(els.title) els.title.textContent=t(step.title||"");
  // A step body may be a function (copy naming a rebindable key is read at show time)
  /* A step body is authored markup, so it is translated whole and injected raw - the same
     rule the shortcut hints follow. A function body has already composed its key. */
  if(els.body){ els.body.innerHTML=t((typeof step.body==="function"?step.body():step.body)||""); fillProseIcons(els.body); }
  if(els.step) els.step.textContent=t("Tour {N} / {TOTAL}")
    .replace("{N}",i+1).replace("{TOTAL}",TOUR_STEPS.length);
  if(els.prev) els.prev.hidden=i===0;
  if(els.next) els.next.textContent=t(i===TOUR_STEPS.length-1 ? "Finish" : "Next");
  // Scroll target into view before measuring
  /* Not `t`: that name belongs to the translation function, and a const of the same name
     shadows it across this entire scope - the copy above would throw before it ran. */
  const tgt=resolveTourTarget(step);
  observeTourTarget(tgt);
  if(tgt && tgt.scrollIntoView){
    try{ tgt.scrollIntoView({block:"nearest", inline:"nearest", behavior:"smooth"}); }catch(_){
      try{ tgt.scrollIntoView(true); }catch(__){}
    }
  }
  // Layout first; draw-on animation once geometry has settled
  scheduleTourPlace();
  setTimeout(()=>{
    tourArrowNeedsDraw=true;
    scheduleTourPlace();
  }, 300);
  selectTourNext();
}
function startTour(){
  const invite=$("#tourInvite");
  if(invite) invite.hidden=true;
  closeSettingsMenu();
  closeFactsPanel();
  if(modalOpen()) closeModal();
  const els=tourEls();
  if(!els.root) return;
  tourRunning=true;
  tourIdx=0;
  els.root.hidden=false;
  els.root.setAttribute("aria-hidden","false");
  // Force reflow then animate in
  void els.root.offsetWidth;
  els.root.classList.add("on");
  showTourStep(0);
  toast("Press Esc to leave the tour.");
}
function endTour(completed){
  if(!tourRunning && tourIdx<0) return;
  tourRunning=false;
  tourIdx=-1;
  const els=tourEls();
  if(els.root){
    els.root.classList.remove("on");
    els.root.hidden=true;
    els.root.setAttribute("aria-hidden","true");
  }
  if(els.hole){ els.hole.classList.remove("pulse"); els.hole.style.display="none"; }
  if(els.arrow){ els.arrow.classList.remove("show"); els.arrow.style.display="none"; }
  // Leaving mid-tour must not strand a dialog or a menu the tour opened.
  if(modalOpen()) closeModal();
  // Nor keep anything a step's prep borrowed - the rail lock, the pill bar.
  runTourStepUndo();
  closeSettingsMenu();
  clearTourFocus();
  if(tourTargetRO){ try{ tourTargetRO.disconnect(); }catch(_){} }
  if(completed) markTourDone();
  else markTourInviteDismissed();
  focusIntentOnOpen();
}
/* Arrow keys move a selection ring across the tour's own buttons instead of changing step
   (stepping is Enter, or clicking). Order follows the DOM - Skip, Back, Next - and wraps,
   so → from Next lands back on Skip. Back is skipped on step 1 where it is hidden. */
let tourFocusIdx=0;
function tourButtons(){
  const els=tourEls();
  return [els.skip, els.prev, els.next].filter(b=>b && !b.hidden);
}
function markTourFocus(){
  const btns=tourButtons();
  if(!btns.length) return;
  if(tourFocusIdx<0 || tourFocusIdx>=btns.length) tourFocusIdx=btns.length-1;
  btns.forEach((b,i)=>b.classList.toggle("tour-sel", i===tourFocusIdx));
  try{ btns[tourFocusIdx].focus({preventScroll:true}); }catch(_){}
}
/** Each step starts with Next selected. */
function selectTourNext(){
  const btns=tourButtons(), els=tourEls();
  const i=btns.indexOf(els.next);
  tourFocusIdx = i<0 ? Math.max(0, btns.length-1) : i;
  markTourFocus();
}
function moveTourFocus(dir){
  const btns=tourButtons();
  if(!btns.length) return;
  tourFocusIdx = ((tourFocusIdx+dir) % btns.length + btns.length) % btns.length;
  markTourFocus();
}
function activateTourFocus(){
  const b=tourButtons()[tourFocusIdx];
  if(b) b.click();
  else tourNext();
}
function clearTourFocus(){
  tourButtons().forEach(b=>b.classList.remove("tour-sel"));
}
/* Watch the current target so the spotlight follows it when it resizes in place. */
let tourTargetRO=null;
function observeTourTarget(tb){
  if(typeof ResizeObserver!=="function") return;
  try{
    if(!tourTargetRO) tourTargetRO=new ResizeObserver(()=>{ if(tourRunning) scheduleTourPlace(); });
    tourTargetRO.disconnect();
    if(tb && tb.nodeType===1) tourTargetRO.observe(tb);
  }catch(_){}
}
function tourNext(){
  if(!tourRunning) return;
  if(tourIdx>=TOUR_STEPS.length-1) endTour(true);
  else showTourStep(tourIdx+1);
}
function tourPrev(){
  if(!tourRunning) return;
  if(tourIdx>0) showTourStep(tourIdx-1);
}
function wireTourUi(){
  const els=tourEls();
  if(els.next) els.next.onclick=()=>tourNext();
  if(els.prev) els.prev.onclick=()=>tourPrev();
  if(els.skip) els.skip.onclick=()=>endTour(false);
  if(els.shade) els.shade.onclick=()=>{}; // absorb clicks; do not dismiss accidentally
  const inv=$("#tourInvite"), startB=$("#tourInviteStart"), disB=$("#tourInviteDismiss");
  if(startB) startB.onclick=()=>{
    if(inv) inv.hidden=true;
    startTour();
  };
  if(disB) disB.onclick=()=>{ if(inv) inv.hidden=true; markTourInviteDismissed(); };
  // Reposition if sticky header / rail geometry changes
  if(typeof ResizeObserver==="function"){
    try{
      const ro=new ResizeObserver(()=>{ if(tourRunning) scheduleTourPlace(); });
      const header=document.querySelector("header");
      if(header) ro.observe(header);
      if(list) ro.observe(list);
    }catch(_){}
  }
}
/* First run asks at most one question at a time, in order of consequence: 1. the
     sibling-catalog offer (the bigger decision, and it reloads); 2. the "New here?"
     invite. Declining the offer calls straight back into here, so nothing is lost by
     going second. */
function maybeShowTourInvite(){
  if(tourSeen()||tourInviteDismissed()) return;
  const inv=$("#tourInvite");
  if(!inv) return;
  // Delay so first paint and intent focus settle
  setTimeout(()=>{
    if(tourRunning||tourSeen()||tourInviteDismissed()) return;
    if(document.getElementById("eCatalogModal")) return;   // catalog question is still open
    const body=$("#tourInviteBody"), start=$("#tourInviteStart");
    if(body) body.textContent=t("An interactive tour of the main controls, about a minute.");
    if(start) start.textContent=t("Show tour");
    inv.hidden=false;
  }, 900);
}

export {
  tourActive,
  tourArrowRoute,
  drawTourArrow,
  scheduleTourPlace,
  startTour,
  endTour,
  moveTourFocus,
  activateTourFocus,
  wireTourUi,
  maybeShowTourInvite
};
