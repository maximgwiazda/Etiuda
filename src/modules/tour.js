import { closeModal, modalOpen } from "./dialog.js";
import { closeFactsPanel } from "./facts.js";
import { fillProseIcons } from "./icons.js";
import { focusIntentOnOpen } from "./on-open.js";
import { drawIntentRail } from "./rail-list.js";
import { chordChips } from "./shortcuts.js";
import { openSettings } from "./settings.js";
import { lsGet, lsSet, lsDel } from "./storage.js";
import { drawPills } from "./tabs.js";
import { t, toast } from "./ui-lang.js";
import { railActive, railWanted, scheduleRailGeometry, syncRailLayout } from "./rail-panel.js";
import { pageScroller } from "./page-scroll.js";
import { list, $ } from "./dom.js";
import { setEntrySel } from "./mark.js";
import { syncLayoutPrefs, pillsWanted, schedulePillsCollapse } from "./pills-box.js";
import { closeSettingsMenu } from "./header-menus.js";
import { cards } from "./app-state.js";
import { hooks } from "./hooks.js";
import { placeBubble } from "./bubble.js";
import { eHost } from "./host.js";
import { mgReduceMotion } from "./motion.js";

/* ---------- Guided tour ----------------------------------------------------
   Coach marks over live UI. No deps. Settings → Show tour… and first-run invite.
   Bump TOUR_VER to re-offer after a major layout change. */
const TOUR_VER=3;
let tourIdx=-1, tourRunning=false, tourRaf=0;
function tourActive(){ return !!tourRunning; }
function tourStorageKey(){ return "eTourDone_v"+TOUR_VER; }
function tourInviteKey(){ return "eTourInvite_v"+TOUR_VER; }
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
  const prev={rail:lsGet("eRail"), lock:lsGet("eRailLock")};
  let borrowed=false;
  if(!railWanted()){
    lsSet("eRail","1"); borrowed=true;
    syncRailLayout();
    drawIntentRail();
    syncLayoutPrefs();
  }
  if(!railActive()){
    // Narrow window may auto-hide; pin lock so the step can highlight the panel
    lsSet("eRailLock","1"); lsSet("eRail","1"); borrowed=true;
    syncRailLayout();
    drawIntentRail();
    syncLayoutPrefs();
  }
  if(borrowed) tourStepUndo=()=>{
    if(prev.rail==null) lsDel("eRail"); else lsSet("eRail",prev.rail);
    if(prev.lock==null) lsDel("eRailLock"); else lsSet("eRailLock",prev.lock);
    syncRailLayout();
    syncLayoutPrefs();
  };
}
function tourEnsurePills(){
  // Same loan-and-return contract as tourEnsureRail above.
  if(!pillsWanted()){
    const prev=lsGet("ePills");
    lsSet("ePills","1");
    syncLayoutPrefs();
    drawPills();
    schedulePillsCollapse();
    scheduleRailGeometry();
    tourStepUndo=()=>{
      if(prev==null) lsDel("ePills"); else lsSet("ePills",prev);
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
/* The prep the star, the eye and the pencil share. The caption hides its controls until the card
   is hovered and a tour never hovers, so the three steps were spotlighting a button at opacity 0.
   Borrowed on the same loan-and-return contract as the rail and the pills above, and put on the
   BODY: a class on the card itself lasted about a second, because patchCard() rewrites a card's
   className whole and erases anything the render did not put there. */
function tourRevealCardActions(){
  tourScrollListTop();
  tourPickFirstCard();
  document.body.classList.add("tour-cacts");
  tourStepUndo=()=>{ document.body.classList.remove("tour-cacts"); };
}

const TOUR_STEPS=[
  /* Ordered as one chat unfolds: the customer, the box, the panel it drives, the cards it
     narrows, the bar, then the tabs that keep all of it - only then the buttons and the corner.
     The agent's own name is asked for at the first run and lives in Settings, so it has no
     control on the screen for a step to point at. */
  {
    sel:".brand",
    title:"Welcome to Etiuda",
    body:"Etiuda keeps your replies in a window of its own, beside the chat. Type the word nearest what the customer means, click a reply, and paste it into the conversation. It works with every chat tool, because it needs none of them. The tour takes about a minute, and <kbd>Esc</kbd> leaves it at any time.",
    pad:10
  },
  {
    sel:".field-wrap.paxrole",
    title:"Customer name and role",
    body:"Copy the customer's name from the chat and paste it here as it comes, surname, capitals and all. Etiuda tidies it, and every reply addresses the customer by first name, in Polish in the vocative (ANNA KOWALSKA → <b>Anno</b>); this fills <span class=\"fillmiss\">PAX</span>. The wheel beside it says who you are speaking to, relative to whoever the case is about, and fills <span class=\"fillmiss\">ROLE</span> in internal comments; the empty notch clears it.",
    pad:6
  },
  {
    sel:"#intentComboWrap",
    title:"Search",
    body:"Type the word nearest what the customer means, 'refund' or 'address', and the intents in the panel rank themselves while the cards below narrow to match, in both languages. <kbd>Enter</kbd> picks the marked intent: it fills <span class=\"fillmiss\">INTENT</span> and rings its cards <b class=\"t-go\">green</b>, and <kbd>Ctrl</kbd>+<kbd>Enter</kbd> picks one and keeps the box for the next. <kbd>Esc</kbd> clears it.",
    pad:6
  },
  {
    sel:"#intentRail",
    title:"Intent panel",
    body:"An intent names what the customer has come about. Picking one brings its replies forward, ringed <b class=\"t-go\">green</b>, and its phrase fills <span class=\"fillmiss\">INTENT</span> wherever a reply uses it. <kbd>Ctrl</kbd>+click picks several. The star keeps the intents you use most at the top; hold <kbd>Ctrl</kbd> over a star to edit that intent, or <kbd>Shift</kbd> to hide it. The <span data-icon=\"pin\"></span> lock keeps the panel open on a narrow window.",
    pad:8,
    prep:tourEnsureRail
  },
  {
    sel:()=>tourPickFirstCard()||$("#list"),
    title:"Cards",
    body:"Click a reply and the whole of it is on the clipboard, with the greeting, the name and the signature filled in, ready to paste into the chat. <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> do the same from the keyboard, and <kbd>Shift</kbd>+<kbd>Enter</kbd> copies the other language. A card showing <b>1/2</b> or <b>STEP 1/3</b> holds several replies, each copied on its own. The small tags say why a card stands where it does; resting the pointer on one names the reason.",
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
    title:"Conversations",
    body:()=>t("When several customers are open in your chat at once, give each one a tab here. Every tab keeps its own customer name, intent, language and categories, so a reply never carries the wrong name. {KEY} moves to the next tab from anywhere and {NEW} opens one; your own name and the theme are shared by all of them.")
            .replace("{KEY}",chordChips("tabNext")).replace("{NEW}",chordChips("tabNew")),
    pad:6
  },
  {
    sel:"#seg",
    title:"English / Polish",
    // A function, not a string: the key it names is rebindable, so it is read at show time
    body:()=>t("Switches the replies between English and Polish for this conversation, so each customer is answered in their own language; {KEY} flips it from anywhere. An intent picked from the list follows the switch and typed text does not, and a card with no Polish shows its English rather than a gap.")
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
    prep:tourRevealCardActions,
    title:"Favourites",
    body:"The star lifts a card to the top of wherever it already is: to the head of its category, to the head of its highlight group when an intent is selected, and on <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> to a <b class=\"t-fav\"><span data-icon=\"star\"></span>Favourites</b> block at the top of the list. The gold star and the <span class=\"cbadge fav\">fav</span> tag mark it - separate from the <b class=\"t-go\">green</b> of an intent link and the <b class=\"t-acc\">blue</b> of a supporting category.",
    pad:8
  },
  {
    sel:()=>cardBtn('[data-act="hide"]'),
    prep:tourRevealCardActions,
    title:"Put a card away",
    body:"The eye puts a card away: it greys out and sinks to the foot of its own category, and it shows nowhere else - not in All, and not in a search. Open that category with the box empty and the same button brings it back. Putting a starred card away also unstars it. Nothing is deleted; <b class=\"t-bad\">Delete</b> lives only in the editor and in Library.",
    pad:8
  },
  {
    sel:()=>cardBtn('[data-act="edit"]'),
    prep:tourRevealCardActions,
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
      hooks.openCardEditor((typeof cards!=="undefined" && cards && cards.length) ? cards[0].id : null);
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
    body:()=>eHost()
      ? t("Fees, deadlines and links you quote to customers. Clicking a link copies the whole address, ready to paste into the chat. The text is yours to edit, and it stays on this computer.")
      : t("Fees, deadlines and links you quote to customers. Clicking a link copies the whole address, ready to paste into the chat. The text is yours to edit, and it stays in this browser."),
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
    body:"<b><span data-icon=\"settings\"></span> → Library</b> holds everything Etiuda knows: every card, intent and category, to add, edit, hide or move. <span class=\"t-sec\">Catalog &amp; data</span> is where the team's catalog comes in, and where your own improvements go out as a file for whoever keeps the wording.",
    prep:()=>{ hooks.openManage(); }
  },
  {
    // Same rule as Library above: opened as the menu opens it, no section forced.
    sel:"#modalCard",
    modal:true,
    pad:4,
    title:"Settings",
    body:"<b><span data-icon=\"settings\"></span> → Settings</b> is the program itself: your name, the language of its buttons, its look and its shortcuts. Nothing here touches a card.",
    prep:()=>{ openSettings(); }
  },
  {
    sel:".brand",
    title:"You are set",
    body:"That is the whole of it: the customer's name, the word for what they want, a click, and a paste into the chat. Every shortcut is listed under <span data-icon=\"settings\"></span> <b>→ About Etiuda</b>, and <b>Show tour…</b> in the same menu brings this back.",
    pad:10
  }
];


function tourEls(){
  return {
    root:$("#tourRoot"),
    shade:$("#tourShade"),
    hole:$("#tourHole"),
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

  let holeRect=null;
  const targetRect=tourTargetRect(target);
  if(targetRect){
    const r=targetRect;
    /* Flush to the viewport, not inset 6px from it. The inset kept the ring on screen, and it
       cost the tabs row - 4px from the top of the window - two of its 32 rows outside its own
       spotlight and under the scrim. A target that close to an edge has no room for a ring
       anyway, and the element being shown matters more than the ring drawn round it. */
    holeRect={
      top:Math.max(0, r.top-pad),
      left:Math.max(0, r.left-pad),
      width:Math.min(vw, r.width+pad*2),
      height:Math.min(vh, r.height+pad*2)
    };
    // Clamp into viewport
    if(holeRect.left+holeRect.width>vw) holeRect.width=Math.max(40, vw-holeRect.left);
    if(holeRect.top+holeRect.height>vh) holeRect.height=Math.max(32, vh-holeRect.top);
  }

  if(holeRect && els.hole){
    els.hole.style.display="block";
    els.hole.style.top=holeRect.top+"px";
    els.hole.style.left=holeRect.left+"px";
    els.hole.style.width=holeRect.width+"px";
    els.hole.style.height=holeRect.height+"px";
  } else if(els.hole){
    els.hole.style.display="none";
  }
  // No hole to cut: the shade takes the scrim over the whole window, at the same darkness.
  els.root.classList.toggle("no-hole", !holeRect);

  /* THE BUBBLE GOES BELOW ITS TARGET WHERE IT CAN, and the routine decides the rest. A notice
     under a control leaves the control readable, which is the point of pointing at it; a dialog
     step's spotlight fills the middle of the screen, so that one lands beside; and a window too
     narrow for either gets the bubble over the dialog with no pointer, which is what the
     family's last fallback is for. The alternating sides the old callout used are gone with the
     arrow: two dialog steps in a row now differ by their words, as every other pair does. */
  if(holeRect){
    placeBubble(els.card, holeRect, {width:cardW, gap:12});
  } else {
    els.card.style.width=cardW+"px";
    els.card.style.top=Math.max(24, (vh-(els.card.offsetHeight||220))/2)+"px";
    els.card.style.left=Math.max(14, (vw-cardW)/2)+"px";
    els.card.setAttribute("data-side","none");
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
  /* Twice: once now, and once after the step's own showcase has settled - a dialog opening or
     a panel unfolding changes the target's box, and the bubble is placed against the box. */
  scheduleTourPlace();
  setTimeout(scheduleTourPlace, 300);
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
  els.root.classList.toggle("still", mgReduceMotion());
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
  addEventListener("resize",placeTourInvite);
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
    if(document.getElementById("eAgentModal")) return;     // and so is the name, which closes into this
    const body=$("#tourInviteBody"), start=$("#tourInviteStart");
    if(body) body.textContent=t("How a reply gets from here to your customer, in about a minute.");
    if(start) start.textContent=t("Show tour");
    inv.hidden=false;
    placeTourInvite();
  }, 900);
}
/* THE INVITE HANGS FROM THE BUTTON IT IS ABOUT. Floating in the corner it was attached to
   nothing and sat over the last card and the add disc; Show tour lives in the menu, so the
   menu's button is what it points at. Placed again on a resize, since it may outlive one. */
function placeTourInvite(){
  const inv=$("#tourInvite"), btn=$("#settingsBtn");
  if(!inv||inv.hidden||!btn) return;
  const r=btn.getBoundingClientRect();
  placeBubble(inv, {top:r.top, left:r.left, width:r.width, height:r.height}, {width:300});
}

export {
  tourActive,
  scheduleTourPlace,
  startTour,
  endTour,
  moveTourFocus,
  activateTourFocus,
  wireTourUi,
  maybeShowTourInvite
};
