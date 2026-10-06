import { closeModal, modalOpen } from "./dialog.js";
import { closeFactsPanel, factsPanelOpen } from "./facts.js";
import { fillProseIcons } from "./icons.js";
import { focusFirstEntryOnOpen } from "./on-open.js";
import { drawIntentRail } from "./rail-list.js";
import { chordChips } from "./shortcuts.js";
import { lsGet, lsSet, lsDel, ssGet, ssSet, ssDel } from "./storage.js";
import { drawPills } from "./tabs.js";
import { t, toast } from "./ui-lang.js";
import { railActive, railWanted, scheduleRailGeometry, syncRailLayout } from "./rail-panel.js";
import { scrollPageTop } from "./page-scroll.js";
import { list, $ } from "./dom.js";
import { whenMarkFormed } from "./empty-mark.js";
import { setEntrySel } from "./mark.js";
import { syncLayoutPrefs, pillsWanted, schedulePillsCollapse } from "./pills-box.js";
import { closeSettingsMenu, openSettingsMenu } from "./header-menus.js";
import { wholeThingEmpty } from "./app-state.js";
import { placeBubble } from "./bubble.js";
import { eHost, eCatalogFolderShort } from "./host.js";
import { agentName, setAgentName, keepAgentName, keepTypedName, nameAnswered, nameFieldHtml, wireNameField } from "./agent.js";
import { esc } from "./esc.js";
import { cutLeaves, dismissCopy, mgReduceMotion } from "./motion.js";

/* ---------- Guided tour ----------------------------------------------------
   Bubbles over the live page, which stays usable under them: nothing is darkened, and a click
   anywhere never takes a step down. It starts by itself on a first run and from Menu, Show tour.
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
function tourScrollListTop(){ scrollPageTop(true); }
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
/* The caption hides its controls until the card is hovered and a tour never hovers, so the step
   about them would ring buttons at opacity 0. Borrowed on the same loan-and-return contract as the
   rail and the pills above, and put on the BODY: a class on the card itself lasted about a second,
   because patchCard() rewrites a card's className whole and erases anything the render did not put
   there. */
function tourRevealCardActions(){
  tourScrollListTop();
  tourPickFirstCard();
  document.body.classList.add("tour-cacts");
  tourStepUndo=()=>{ document.body.classList.remove("tour-cacts"); };
}

/* The desk's own words for the folder a Load opens, or none in a browser, which has no folder. */
function loadStepBody(){
  const dir=eCatalogFolderShort();
  if(!dir) return t("Replies come in a catalog. Click <b>Load a catalog</b> under the logo and choose the catalog file. The tour carries on as soon as it is in place, and the catalog stays in this browser, ready whenever you come back.");
  return t("Replies come in a catalog. Click <b>Load a catalog</b> under the logo and choose the team's catalog in {FOLDER}. The tour carries on as soon as it is in place.")
    .split("{FOLDER}").join(esc(dir));
}
/* THE MENU AS IT STANDS: the button while it is shut, and once the person opens it, the row a step
   is about (or the whole menu), with the bubble beside it rather than over the rows below. */
function menuOpen(){ const m=$("#settingsMenu"); return !!m && !m.hidden; }
function menuTarget(act){
  const m=$("#settingsMenu");
  if(!menuOpen()) return $("#settingsBtn");
  return (act && m.querySelector('[data-act="'+act+'"]')) || m;
}
const menuSide=()=>menuOpen() ? "left" : null;
// The window each inside step stands in.
const cardEditorOpen=()=>modalOpen() && !!document.getElementById("meCancel");
const libraryOpen=()=>modalOpen() && !!document.querySelector("#modalCard details.manage-sec");
const settingsOpen=()=>modalOpen() && !!document.getElementById("setBody");
/* NEXT PRESSES THE STEP'S OWN CONTROL for the person, and only where it stands on screen: never the
   card or the list a step falls back to ringing. */
function tourPress(el, sel){ if(el && el.matches && el.matches(sel) && el.getClientRects().length) el.click(); }
// A Menu row, with the Menu opened first where it is shut.
function tourPressRow(act){ if(!menuOpen()) openSettingsMenu(); tourPress(menuTarget(act), '[data-act="'+act+'"]'); }
// The window an inside step stands in, closed as the person would close it.
function shutTourWindow(){ if(modalOpen()) closeModal(); if(factsPanelOpen()) closeFactsPanel(); }
// The wheel waits on the sample until a reply names somebody (agent.js), and the step says so.
function wheelShown(){ return !document.body.classList.contains("role-waits"); }
const TOUR_STEPS=[
  /* THE NAME FIRST, in the bubble itself: it is the one thing on the desk with no control of its
     own to point at, and every signed reply needs it. */
  {
    id:"name",
    sel:".brand",
    title:"Welcome to Etiuda",
    body:"To begin, the name your replies are signed with. Customers see it at the foot of each one, and it can be changed at any time in Settings.",
    name:true,
    pad:10
  },
  /* ONLY WHILE THE DESK IS EMPTY: the step is done by loading, and the tour carries on from the
     step after it (tourAfterRestart). A card made by hand ends it too. */
  {
    id:"load",
    sel:"#emptyLoad",
    title:"A catalog of replies",
    body:loadStepBody,
    when:()=>wholeThingEmpty(),
    waits:true,
    pad:6
  },
  {
    id:"pax",
    sel:".field-wrap.paxrole",
    title:()=>wheelShown() ? "Customer name and role" : "The customer's name",
    body:()=>wheelShown()
      ? "The customer's name goes here as the chat gives it, surname and capitals included, and every reply greets them by first name, in Polish in the vocative (ANNA KOWALSKA becomes <b>Anno</b>). The wheel beside it says who is on the chat, for internal comments."
      : "The customer's name goes here as the chat gives it, surname and capitals included, and every reply greets them by first name, in Polish in the vocative (ANNA KOWALSKA becomes <b>Anno</b>).",
    pad:6
  },
  {
    id:"search",
    sel:"#intentComboWrap",
    title:"Search",
    body:"A word near what the customer means, such as 'refund', is enough: the intents on the left rank themselves and the cards narrow to match, in both languages. <kbd>Enter</kbd> picks the marked intent, and <kbd>Esc</kbd> clears the box.",
    pad:6
  },
  {
    id:"rail",
    sel:"#intentRail",
    title:"Intent panel",
    body:"An intent names what the customer has come about. A click on one brings its replies forward, ringed <b class=\"t-go\">green</b>, with its phrase filling <span class=\"fillmiss\">INTENT</span> wherever a reply uses it. <kbd>Ctrl</kbd>+click picks several, and the star keeps the ones used most at the top.",
    pad:8,
    prep:tourEnsureRail
  },
  {
    id:"cards",
    sel:()=>tourPickFirstCard()||$("#list"),
    title:"Cards",
    body:"A click on a reply copies the whole of it, greeting, name and signature filled in, ready to paste into the chat. A card marked <b>1/2</b> or <b>STEP 1/3</b> holds several, each copied on its own. <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> do the same from the keyboard.",
    pad:6,
    prep:()=>{ tourScrollListTop(); tourPickFirstCard(); }
  },
  {
    id:"pills",
    sel:"#pills",
    title:"Category pills",
    body:"A click on a category shows only its cards, and <kbd>Ctrl</kbd>+click keeps several. A <b class=\"t-go\">green</b> ring marks one holding a card for the chosen intent, and a <b class=\"t-acc\">blue</b> one a supporting category, useful for any question.",
    pad:8,
    prep:tourEnsurePills
  },
  {
    id:"tabs",
    sel:"#tabsWrap",
    title:"Conversations",
    body:()=>t("Each customer on the chat gets a tab of their own here, with their name, intent and language, so a reply never carries the wrong name. <b>+</b> or {NEW} opens another conversation, and {KEY} moves between them.")
            .replace("{KEY}",chordChips("tabNext")).replace("{NEW}",chordChips("tabNew")),
    pad:6
  },
  {
    id:"seg",
    sel:"#seg",
    title:"English / Polish",
    // A function, not a string: the key it names is rebindable, so it is read at show time
    body:()=>t("Replies in this conversation follow the language chosen here, so each customer is answered in their own. {KEY} switches it from anywhere.")
            .replace("{KEY}",chordChips("langToggle")),
    pad:6
  },
  /* A STEP THAT OPENS A WINDOW (`opens`) moves on when the person opens it or when Next opens it for
     them (`open`); the step inside (`inside`) stands while its window does, and its Next or Back
     closes the window before moving. */
  {
    id:"buttons",
    sel:()=>cardBtn(".cacts"),
    prep:tourRevealCardActions,
    title:"A card's buttons",
    body:"The star lifts a card to the top of its category, and under <span class=\"t-pill\"><span data-icon=\"all\"></span>All</span> into <b class=\"t-fav\"><span data-icon=\"star\"></span>Favourites</b>.<br>The eye puts it away, greyed at the foot of its category, and brings it back from there.<br>The pencil opens it for editing, and <b>Reset</b> in the editor brings back the catalog's own words.<br>Click the pencil on this card.",
    opens:"editor",
    open:()=>tourPress(cardBtn('[data-act="edit"]'), '[data-act="edit"]'),
    pad:8
  },
  {
    id:"editor",
    sel:"#modalCard",
    modal:true,
    inside:true,
    when:cardEditorOpen,
    pad:4,
    title:"The card editor",
    body:()=>t("<span class=\"t-sec\">Content</span> holds the text in both languages and the internal note; the folds below hold the keywords, the category, the linked intents and the finer settings. <b>Cancel</b> leaves everything as it was.")
      +" "+t("The tour carries on once this window is closed.")
  },
  /* AFTER the editor, not before it: the step above acts on a card that already exists, and this
     is the one that makes the one that does not - into the screen just shown. */
  {
    id:"add",
    sel:"#addCardFab",
    title:"A card of your own",
    body:()=>t("Click <b>+</b> to write a card of your own, in the category open now or in any other chosen in the editor.")
      +" "+t("Once the window is open, the tour goes inside with it."),
    opens:"addIn",
    open:()=>tourPress($("#addCardFab"), "#addCardFab"),
    pad:10
  },
  {
    id:"addIn",
    sel:"#modalCard",
    modal:true,
    inside:true,
    when:cardEditorOpen,
    pad:4,
    title:"A new card",
    body:()=>t("A blank card: the reply in both languages, a title and a category. <b>Save</b> keeps it, and <b>Cancel</b> leaves nothing behind.")
      +" "+t("The tour carries on once this window is closed.")
  },
  {
    id:"facts",
    sel:"#factsBtn",
    title:"Quick facts",
    body:"Click <b>Quick facts</b> to open the links and figures worth having to hand.",
    opens:"factsIn",
    open:()=>tourPress($("#factsBtn"), "#factsBtn"),
    pad:8
  },
  {
    id:"factsIn",
    sel:"#factsPanel",
    inside:true,
    when:factsPanelOpen,
    pad:4,
    title:"Quick facts",
    body:()=>(eHost()
      ? t("A click on a link copies it whole, and the text is yours to edit; it stays on this computer.")
      : t("A click on a link copies it whole, and the text is yours to edit; it stays in this browser."))
      +" "+t("Close them when ready, with the same button or a click outside, and the tour carries on.")
  },
  {
    id:"theme",
    sel:"#theme",
    title:"Light and dark",
    body:"This switches between light and dark. Etiuda follows the system until the first click, and keeps the choice from then on.",
    pad:8
  },
  {
    /* Done once the Menu is open (`done`), by the person or by Next; the steps after this one
       (`menu`, kept open) ring the row they are about. */
    id:"menu",
    sel:()=>menuTarget(""),
    side:menuSide,
    title:"Menu",
    body:"Click <b>Menu</b>: the rest of Etiuda opens from there.",
    done:()=>menuOpen(),
    open:()=>openSettingsMenu(),
    pad:8
  },
  {
    id:"library",
    sel:()=>menuTarget("manage"),
    side:menuSide,
    title:"Library",
    body:()=>t("Everything that is not a card: the Library, Settings, the panels' switches, and this tour again under <b>Show tour…</b>.")
      +" "+t("Click <b>Library</b> in the Menu: the whole catalog is there.")
      +" "+t("Once the window is open, the tour goes inside with it."),
    opens:"libraryIn",
    open:()=>tourPressRow("manage"),
    menu:true,
    pad:8
  },
  {
    id:"libraryIn",
    sel:"#modalCard",
    modal:true,
    inside:true,
    when:libraryOpen,
    pad:4,
    title:"Library",
    body:()=>t("<b><span data-icon=\"settings\"></span> → Library</b> holds every card, intent and category, to add, edit, hide or move. Catalogs are loaded here too, and your own improvements go out from here as a file for whoever keeps the wording.")
      +" "+t("The tour carries on once this window is closed.")
  },
  {
    id:"settings",
    sel:()=>menuTarget("settings"),
    side:menuSide,
    title:"Settings",
    body:()=>t("One more window: open the <span data-icon=\"settings\"></span> Menu again and click <b>Settings</b>.")
      +" "+t("Once the window is open, the tour goes inside with it."),
    opens:"settingsIn",
    open:()=>tourPressRow("settings"),
    menu:true,
    pad:8
  },
  {
    id:"settingsIn",
    sel:"#modalCard",
    modal:true,
    inside:true,
    when:settingsOpen,
    pad:4,
    title:"Settings",
    body:()=>t("<b><span data-icon=\"settings\"></span> → Settings</b>: your name, the language of the buttons, the look and the shortcuts. Nothing here touches a card.")
      +" "+t("The tour carries on once this window is closed.")
  },
  {
    id:"done",
    sel:".brand",
    title:"Ready for the first customer",
    body:"That is the whole tour. <b>Show tour…</b> in the <span data-icon=\"settings\"></span> Menu brings it back, and <b>Settings</b> lists every shortcut.",
    pad:10
  }
];
// A step is on when it has no condition or its condition holds now.
function stepOn(i){ const s=TOUR_STEPS[i]; return !!s && (!s.when || s.when()); }
function onFrom(i,dir){ for(let j=i; j>=0 && j<TOUR_STEPS.length; j+=dir) if(stepOn(j)) return j; return -1; }
/* NEXT ON EVERY STEP, held back only where the steps after need the person's own act (`waits`) and
   its control is on screen. */
function nextHeld(s){ return !!(s && s.waits) && !!resolveTourTarget(s); }
function syncTourNext(){
  const els=tourEls(), step=TOUR_STEPS[tourIdx];
  if(!els.next || !step) return;
  els.next.disabled=nextHeld(step);
  els.next.textContent=t(onFrom(tourIdx+1,1)<0 ? "Finish" : "Next");
}
/* THE PERSON'S ACT MOVES A STEP ON, read once it has settled: a step whose window or condition has
   gone is done, one that `opens` a window follows the person into it, and one with `done` asks it. */
const TOUR_ACT_MS=350;
let tourActT=0;
function tourActSoon(){
  if(!tourRunning) return;
  clearTimeout(tourActT);
  const at=tourIdx;
  tourActT=setTimeout(()=>{ tourActT=0; if(tourRunning && tourIdx===at) tourActCheck(); }, TOUR_ACT_MS);
}
function tourActCheck(){
  const step=TOUR_STEPS[tourIdx];
  if(!step) return;
  if(!stepOn(tourIdx)){ showTourStep(onFrom(tourIdx+1,1)); return; }
  if(step.opens){ tourFollowWindow(); return; }
  if(step.done && step.done()) tourOn();
}


function tourEls(){
  return {
    root:$("#tourRoot"),
    hole:$("#tourHole"),
    field:$("#tourField"),
    card:$("#tourCard"),
    title:$("#tourTitle"),
    body:$("#tourBody"),
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
  // A step whose condition has lapsed while it stood (the desk is no longer empty) is done.
  if(!stepOn(tourIdx)){ showTourStep(onFrom(tourIdx+1,1)); return; }
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

  /* THE BUBBLE GOES BELOW ITS TARGET WHERE IT CAN, and the routine decides the rest. A notice
     under a control leaves the control readable, which is the point of pointing at it; a dialog
     step's spotlight fills the middle of the screen, so that one lands beside; and a window too
     narrow for either gets the bubble over the dialog with no pointer, which is what the
     family's last fallback is for. The alternating sides the old callout used are gone with the
     arrow: two dialog steps in a row now differ by their words, as every other pair does. */
  if(holeRect){
    const side=typeof step.side==="function" ? step.side() : step.side;
    placeBubble(els.card, holeRect, {width:cardW, gap:12, prefer:side||undefined});
  } else {
    els.card.style.width=cardW+"px";
    els.card.style.top=Math.max(24, (vh-(els.card.offsetHeight||220))/2)+"px";
    els.card.style.left=Math.max(14, (vw-cardW)/2)+"px";
    els.card.setAttribute("data-side","none");
  }
  syncTourNext();
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
  // Whether the keyboard is driving the tour: only then does a new step take the focus.
  const keyed=tourHasFocus();
  tourIdx=i;
  const step=TOUR_STEPS[i];
  const els=tourEls();
  // Where the tour stands survives a reload, the shell's recovery of a stopped page included.
  ssSet(TOUR_AT,step.id);
  // Only a step about the Menu's rows (`menu`) leaves it open.
  if(!step.menu) closeSettingsMenu();
  /* A showcase must not outlive its step: whatever the PREVIOUS step's prep borrowed is given
     back before this step's prep takes anything - in either direction, and endTour gives it
     back too. The rail step taught the lesson: it locked the auto-hidden panel open to be
     pointed at, and without this the lock persisted past the step, past the tour, and past
     the session - the panel sat over the cards of every later step and stayed. */
  runTourStepUndo();
  if(step.prep){
    try{ step.prep(); }catch(_){}
  }
  if(els.title) els.title.textContent=t((typeof step.title==="function"?step.title():step.title)||"");
  // A step body may be a function (copy naming a rebindable key is read at show time)
  /* A step body is authored markup, so it is translated whole and injected raw - the same
     rule the shortcut hints follow. A function body has already composed its key. */
  if(els.body){ els.body.innerHTML=t((typeof step.body==="function"?step.body():step.body)||""); fillProseIcons(els.body); }
  if(els.prev) els.prev.hidden=onFrom(i-1,-1)<0;
  syncTourNext();
  let nameInp=null;
  if(els.field){
    els.field.hidden=!step.name;
    els.field.innerHTML=step.name ? nameFieldHtml("tourName","tourNamePrev") : "";
    if(step.name){
      nameInp=wireNameField(els.field,"");
      if(nameInp){
        nameInp.onkeydown=e=>{
          if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); tourNext(); }
        };
        nameInp.addEventListener("input",()=>keepTypedName(nameInp.value,tourNameWas));
      }
    }
  }
  // Scroll target into view before measuring
  /* Not `t`: that name belongs to the translation function, and a const of the same name
     shadows it across this entire scope - the copy above would throw before it ran. */
  const tgt=resolveTourTarget(step);
  observeTourTarget(tgt);
  if(tgt && tgt.scrollIntoView){
    try{ tgt.scrollIntoView({block:"nearest", inline:"nearest", behavior:mgReduceMotion()?"auto":"smooth"}); }catch(_){
      try{ tgt.scrollIntoView(true); }catch(__){}
    }
  }
  /* Twice: once now, and once after the step's own showcase has settled - a dialog opening or
     a panel unfolding changes the target's box, and the bubble is placed against the box. */
  scheduleTourPlace();
  setTimeout(scheduleTourPlace, 300);
  syncTourBehind();
  /* THE PAGE KEEPS ITS KEYBOARD: a step takes the focus only where it asks for typing, or where
     the keyboard was already walking the tour's own buttons and there is a Next to land on. */
  if(nameInp){ try{ nameInp.focus({preventScroll:true}); }catch(_){} }
  else if(keyed && els.next && !els.next.disabled) selectTourNext();
  else clearTourFocus();
}
// Whether the name had an answer when this tour began, which emptying the first step's field keeps.
let tourNameWas=false;
/** From the Menu, or by itself (`auto`): a first run, or a reload in the middle of one, which
 *  finds whatever the person had open still open, and leaves it so. */
function startTour(from,auto){
  if(!auto){
    closeSettingsMenu();
    closeFactsPanel();
    if(modalOpen()) closeModal();
  }
  const els=tourEls();
  if(!els.root) return;
  let i=onFrom(Math.max(0,from|0),1);
  // Back on an empty desk after the load step, the load step is where the tour stands.
  const L=TOUR_STEPS.findIndex(x=>x.id==="load");
  if(i>L && stepOn(L)) i=L;
  if(i<0){ ssDel(TOUR_AT); return; }
  tourRunning=true;
  tourIdx=i;
  tourNameWas=nameAnswered();
  cutLeaves();
  els.root.hidden=false;
  els.root.setAttribute("aria-hidden","false");
  els.root.classList.toggle("still", mgReduceMotion());
  // Force reflow then animate in
  void els.root.offsetWidth;
  els.root.classList.add("on");
  showTourStep(i);
}
/* THE TOUR starts once the logo has gathered on the empty desk and TOUR_BREATH_MS after it, so
   nothing covers the mark while it forms: a first run never sooner than TOUR_AUTO_MS, a reload in
   the middle of one never sooner than TOUR_RESUME_MS. */
const TOUR_AUTO_MS=1300, TOUR_BREATH_MS=200, TOUR_RESUME_MS=300;
const TOUR_AT="eTourAt";
/** Whether this launch belongs to the tour: a first run, or a reload in the middle of one. */
function tourDueAtBoot(){ return !!ssGet(TOUR_AT) || (!tourSeen() && !tourInviteDismissed()); }
function maybeStartTour(){
  const at=ssGet(TOUR_AT);
  if(!at && (tourSeen()||tourInviteDismissed())) return;
  const i=at ? Math.max(0,TOUR_STEPS.findIndex(x=>x.id===at)) : 0;
  const due=()=>!tourRunning && (!!at || (!tourSeen() && !tourInviteDismissed()));
  let floor=false, formed=false;
  const go=()=>{ if(floor && formed && due()) startTour(i,true); };
  setTimeout(()=>{ floor=true; go(); },at ? TOUR_RESUME_MS : TOUR_AUTO_MS);
  whenMarkFormed(()=>setTimeout(()=>{ formed=true; go(); },TOUR_BREATH_MS));
}
/* THE DESK STARTED AGAIN UNDER A RUNNING TOUR: a step the new desk no longer offers, the load step
   once a catalog is in, gives way to the next one that it does. */
function tourAfterRestart(){
  if(!tourRunning || tourIdx<0) return;
  const i=onFrom(tourIdx,1);
  if(i<0) endTour(true); else showTourStep(i);
}
// What waits for the tour to end: the catalog offer a first run holds back (catalog-offer.js).
let tourAfter=[];
function afterTour(fn){ tourAfter.push(fn); }
function endTour(completed){
  if(!tourRunning && tourIdx<0) return;
  tourRunning=false;
  tourIdx=-1;
  const els=tourEls();
  /* The bubble and its ring leave on the dismiss tier as copies, lifted out of the root that hides
     now, at the root's own height and wearing what its `.on` gave them. */
  if(els.root && !els.root.hidden){
    const z="z-index:"+getComputedStyle(els.root).zIndex;
    dismissCopy(els.card, z+";opacity:1;transform:none;transition:none", document.body);
    if(els.hole && els.hole.style.display!=="none") dismissCopy(els.hole, z+";opacity:1;transition:none", document.body);
  }
  if(els.root){
    els.root.classList.remove("on");
    els.root.hidden=true;
    els.root.setAttribute("aria-hidden","true");
  }
  if(els.hole){ els.hole.classList.remove("pulse"); els.hole.style.display="none"; }
  // The name field goes with the tour, so the question at the first signed copy is not held back.
  if(els.field){ els.field.innerHTML=""; els.field.hidden=true; }
  if(els.arrow){ els.arrow.classList.remove("show"); els.arrow.style.display="none"; }
  // Leaving mid-tour keeps nothing a step's prep borrowed - the rail lock, the pill bar.
  runTourStepUndo();
  closeSettingsMenu();
  clearTourFocus();
  if(tourTargetRO){ try{ tourTargetRO.disconnect(); }catch(_){} }
  if(completed) markTourDone();
  else markTourInviteDismissed();
  ssDel(TOUR_AT);
  if(els.root) els.root.classList.remove("behind");
  if(!completed) toast("The tour waits in the Menu, under Show tour…");
  focusFirstEntryOnOpen();
  const later=tourAfter; tourAfter=[];
  later.forEach(fn=>{ try{ fn(); }catch(_){} });
}
/* The window a step says how to open, once it is open: the tour goes in with it. */
function tourFollowWindow(){
  const step=TOUR_STEPS[tourIdx];
  if(!tourRunning || !step || !step.opens) return false;
  const i=TOUR_STEPS.findIndex(x=>x.id===step.opens);
  if(i<0 || !stepOn(i)) return false;
  showTourStep(i);
  return true;
}
/* WHEN A WINDOW OPENS OVER THE PAGE, the bubble steps back behind it and waits: it comes forward
   again when the window closes. An inside step's window is the one it points at. A question
   bubble (the signing name, a catalog offer) is waited for the same way. */
function syncTourBehind(){
  const els=tourEls();
  if(!els.root) return;
  const step=TOUR_STEPS[tourIdx];
  const covered=!!document.querySelector("body > .modal:not([hidden]):not(.e-gone)");
  const asked=!!document.querySelector("body > .bub-ask:not(.e-gone)");
  els.root.classList.toggle("behind", tourRunning && (asked || (covered && !(step && step.modal))));
}
function tourHasFocus(){
  const card=$("#tourCard");
  return !!(tourRunning && card && document.activeElement && card.contains(document.activeElement));
}
/* Arrow keys move a selection ring across the tour's own buttons instead of changing step
   (stepping is Enter, or clicking). Order follows the DOM - Skip, Back, Next - and wraps,
   so → from Next lands back on Skip. Back is skipped on step 1 where it is hidden. */
let tourFocusIdx=0;
function tourButtons(){
  const els=tourEls();
  return [els.skip, els.prev, els.next].filter(b=>b && !b.hidden && !b.disabled);
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
/* NEXT DOES FOR THE PERSON WHAT THE STEP ASKS: it closes the window a step stands inside, opens the
   one a step invites them to open and follows it in, and moves on. */
function tourNext(){
  if(!tourRunning) return;
  const step=TOUR_STEPS[tourIdx];
  if(!step || nextHeld(step)) return;
  /* The name step's field is its answer: a name given is kept and the question is not asked again;
     left empty, the first signed copy asks, as it would without the tour. */
  if(step.name){
    const inp=$("#tourName"), v=inp ? inp.value.trim() : "";
    if(v) keepAgentName(v); else if(agentName()) setAgentName("");
  }
  if(step.inside) shutTourWindow();
  if(step.open){
    try{ step.open(); }catch(_){}
    if(tourFollowWindow()) return;
  }
  tourOn();
}
// On to the next step that is on, or the end.
function tourOn(){
  const n=onFrom(tourIdx+1,1);
  if(n<0) endTour(true);
  else showTourStep(n);
}
// Back from inside a window closes it, which lands on the step that opens it.
function tourPrev(){
  if(!tourRunning) return;
  const step=TOUR_STEPS[tourIdx];
  if(step && step.inside) shutTourWindow();
  const n=onFrom(tourIdx-1,-1);
  if(n>=0) showTourStep(n);
}
function wireTourUi(){
  const els=tourEls();
  if(els.next) els.next.onclick=()=>tourNext();
  if(els.prev) els.prev.onclick=()=>tourPrev();
  if(els.skip) els.skip.onclick=()=>endTour(false);
  /* Next and Back close or open a window themselves, so their press is not also a click outside the
     Menu or Quick facts, which would close it and move the tour on before the button lands. */
  [els.next, els.prev].forEach(b=>{ if(b) b.addEventListener("pointerdown",e=>e.stopPropagation()); });
  // What the person does on the page, read for the step's act (tourActSoon).
  ["click","input","change","keyup"].forEach(ev=>document.addEventListener(ev,tourActSoon,true));
  // A window opening or closing over the page moves the bubble behind it or back.
  if(typeof MutationObserver==="function"){
    try{
      const mo=new MutationObserver(()=>{ if(tourRunning){ if(!tourFollowWindow()) syncTourBehind(); scheduleTourPlace(); } });
      mo.observe(document.body,{childList:true});
      const shared=$("#modal");
      if(shared) mo.observe(shared,{attributes:true, attributeFilter:["hidden"]});
      // The menu opening or shutting moves a Menu step's ring between the button and its rows.
      const menu=$("#settingsMenu");
      if(menu) mo.observe(menu,{attributes:true, attributeFilter:["hidden"]});
    }catch(_){}
  }
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
export {
  tourAfterRestart,
  tourActive,
  scheduleTourPlace,
  startTour,
  endTour,
  moveTourFocus,
  activateTourFocus,
  wireTourUi,
  tourHasFocus,
  tourDueAtBoot,
  maybeStartTour,
  afterTour
};
