/* ---------------- app ---------------- */
// ---- at load: every handle on the document, before a line of this file reads one ----
grabDom();
// Kill browser/OS form-history & word-suggestion popups (not our intent/ROLE dropdowns).
// autocomplete="off" is often ignored by Chrome/Edge; non-standard tokens + spellcheck off work better.
function suppressBrowserSuggest(){
  function harden(el, token){
    if(!el) return;
    el.setAttribute("autocomplete", token||("rc-"+(el.id||"field")));
    el.setAttribute("autocorrect","off");
    el.setAttribute("autocapitalize","off");
    el.setAttribute("spellcheck","false");
    el.setAttribute("data-lpignore","true");
    el.setAttribute("data-1p-ignore","true");
    el.setAttribute("data-form-type","other");
  }
  harden(agentEl,"rc-agent");
  harden(pax,"rc-pax");
  harden(intentEl,"rc-intent");
  harden($("#factsEdit"),"rc-facts");
  // Stamp the same on any later-created text inputs (modals, manage dialogs)
  document.addEventListener("focusin",e=>{
    const el=e.target;
    if(!el||(el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA")) return;
    if(el.tagName==="INPUT"){
      const t=(el.type||"text").toLowerCase();
      if(t&&t!=="text"&&t!=="search"&&t!=="") return;
    }
    // Card EN/PL editors keep spellcheck on; only nudge autocomplete
    const ac=el.getAttribute("autocomplete");
    if(!ac||ac==="off"||ac==="on") el.setAttribute("autocomplete","rc-"+(el.id||el.name||"x"));
    if(el.tagName==="INPUT"||el.getAttribute("spellcheck")==="false"){
      el.setAttribute("autocorrect","off");
      el.setAttribute("autocapitalize","off");
      el.setAttribute("spellcheck","false");
      el.setAttribute("data-lpignore","true");
      el.setAttribute("data-1p-ignore","true");
      el.setAttribute("data-form-type","other");
    }
  },true);
}
suppressBrowserSuggest();
// INTENT box dual mode: normal intent pick/free-text, or macro search after pressing /
/* One search over two surfaces. railOrder is what the panel SHOWS top to bottom and what
   the arrows walk (matches only - grey rows are inactive); railMarkIdx is the intent Enter
   takes when the cursor is automatic. railMarkUsed: the offer was consumed by a pick or a
   copy, and only typing or the arrows open it again. */
let railSel=-1, railOrder=[], railMarkIdx=-1, railMatch=null;
let railSortT=0, railSettled=true, railMarkUsed=false;
/* See the beforeinput above: the category filter is armed to drop and lands at railSettle. */
let catsDropArmed=false;
// A live Ctrl+Enter run. While set, a plain Enter ADDS its pick and closes the run -
// replacing would throw away everything picked so far. Survives typing (the run's
// promise is "the box stays for the next name"); dies with the set it was building.
let pickRun=false;
/* Which surface holds THE mark - "intent" or "card", never both. Hover claims it for its
   surface, arrows move it within one, a pick or a copy consumes it. */
let semiKind=null;

// Several categories can be active at once (ctrl+click a pill). Empty = All.
let cats=[], shown=[];
// Focused copyable block: { id: cardId, vi: partIndex } or null (↑↓ / Enter target)
let entrySel=null;
// After picking an intent (or opening its category), scroll the list to the first
// card that is explicitly linked to that intent.
let pendingScrollHit=false;
// {INTENT} is either a chip index (so it re-maps when you flip EN<->PL) or free text.
// Several intents can be active at once (ctrl+click). Stored as indexes so each one
// re-maps when the language flips; free text is a separate, single value.
let intentIdxs=[], intentText="";
/* Language is PER-TAB: two chats side by side are routinely in different languages.
   blankTab() carries it, applyTab() installs it, setLang() writes it back; "pbLang"
   records the language last on screen and seeds new tabs - defaulting them to English
   would fight a Polish shift on every chat. */
let lang = (lsGet("pbLang")==="pl") ? "pl" : "en";

// ---- repainting after a language change: it reaches the whole app, so it stays here ----
/* Every localised string is re-read here rather than at construction, so switching language
   repaints the app instead of asking for a reload. Anything built later reads t() itself. */
function applyUiLang(){
  document.documentElement.lang = uiLang();
  /* Re-render what the app builds from strings, then sweep the markup it does not. The order
     matters: syncSettingsMenu writes labels through t(), and the sweep translates whatever was
     authored in HTML. */
  syncSettingsMenu();
  syncMoreBtn();
  syncShortcutTitles();
  /* Surfaces translated at their CALL SITE (cards, panel, pills, tabs, legend) only
     change when drawn again, and changing language draws nothing by itself. The sweep
     handles what is already in the document; this rebuilds what must say something new. */
  /* applyCatsToGlobal leads: category labels can differ by language now, and every surface
     below reads the resolved CATS rather than the catalog. */
  /* References, never names looked up on window: a top-level function is a property of window
     in a classic script and is not one in a module, so a lookup by string turns quietly false
     and these six surfaces stop repainting with nothing thrown and nothing logged. */
  [applyCatsToGlobal,drawIntentRail,drawPills,drawTabs,syncRoleDrum,render].forEach(f=>{
    try{ f(); }catch(e){}
  });
  translateChrome();
  /* The name beside a dialog's title is CONTENT, so the sweep above rightly leaves it alone -
     and nothing else re-derived it, so an open editor kept naming its card in the language
     you had just left while the title itself changed. Re-read, not translated. */
  try{ refreshDialogName(); }catch(e){}
}
// ---- at load: the pointer dismisses a keyboard mark ----
wireKbdNav();
// ---- at load: the stored chrome language, the theme, and the watch on the system's own ----
try{ if(lsGet("pbUiLang")==="pl") document.documentElement.lang="pl"; }catch(e){}
applyTheme();
watchSystemTheme();

// ---- at load: the footer's version, and the icons the prose slots hold ---------
try{ const _v=document.getElementById("eVer"); if(_v) _v.textContent=E_VERSION; }catch(e){}
/* Fills the footer's icon slots and, more importantly, #aboutInfo's - About is built by reading
   that element's innerHTML, so the icons have to be in it before anyone opens the dialog. */
try{ fillProseIcons(document); }catch(e){}

applyBootCatalog();
// The SW_* arrays hold the catalog's intents only from here; intent-id.js says why
// the snapshot cannot sit at a module's top level.
snapshotBaseIntents();
/* NAMING. A macro is one copyable segment - what a click sends; a card is the titled
   container holding one or more. All user-facing wording and the catalog format use those
   meanings. INTERNAL IDENTIFIERS STILL SAY THE OLD THING (cards[], cardOrder, findCard,
   rebuildCards) - numerous, invisible, and pack.cardOrder is a stored key. Reading
   `macro` in an identifier, think card; prefer the new words in anything a user reads. */
let cards=[];
function uid(prefix){
  return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
function slugCat(name){
  const s=String(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,28);
  return "uc_"+(s||"custom");
}


loadPack();

// ---- agent identity ------------------------------------------------------------
// One field feeding two tokens: {AGENT} is the text verbatim, /{INIT} the lowercase initials.
// "John Smith" gives display "John Smith" and init "js"; "John S." gives "John S." and "js".
/* {AGENT} reproduces exactly what was typed: abbreviating the surname is one employer's
   policy, not a fact about support work, and a licensed engine must not bake it in.
   Whitespace still collapses - a double space is a typo, not a style. {INIT} is a
   different token doing a different job. */
function agentParts(raw){
  const s=String(raw||"").trim().replace(/\s+/g," ");
  if(!s) return {display:"",init:""};
  const w=s.split(" ").filter(Boolean);
  const first=w[0];
  const last=(w.length>1 ? w[w.length-1] : "").replace(/\.+$/,"");  // "G." -> "G" for the initial
  return {
    display: s,
    init: (first.charAt(0)+(last.charAt(0)||"")).toLowerCase()
  };
}
/* A FILL IS A BURST, NOT AN EVENT. {AGENT}, {PAX} and {ROLE} are substituted while the cards
   are built, so a keystroke in one of those boxes used to rebuild all of them - 40ms of
   Firefox per letter, and a pasted name arrived visibly behind the hand. The value is stored
   on the keystroke; only the card text waits for the pause. Nothing racy hides in the wait:
   a copy re-runs fill() from the source, so the clipboard never reads the screen. */
let eFillT=0;
function renderFillsSoon(){
  if(eFillT) clearTimeout(eFillT);
  eFillT=setTimeout(()=>{ eFillT=0; render(); },110);
}
// Starts empty, not with a name. A de-branded engine must not ship pre-filled with its
// author's identity, and the placeholder already says what the field is for.
agentEl.value = lsGet("pbAgent")!=null ? lsGet("pbAgent") : "";
function syncAgent(){
  lsSet("pbAgent",agentEl.value);
  const a=agentParts(agentEl.value);
  agentEl.title = a.display
    ? t("Customers see \"{NAME}\", and comments sign /{INIT}")
        .replace("{NAME}",a.display).replace("{INIT}",a.init)
    : t("The name customers see, exactly as you type it; comments sign with its initials");
  renderFillsSoon();
}
agentEl.oninput=syncAgent;

// ---- Comment actor ------------------------------------------------------------
// One list covering both booking comments and gift card comments.
roleSel.value = "";
// ---- at load: the theme button, which pins the choice the system was making ----
wireThemeBtn();
function pillsWanted(){ return lsGet("pbPills")!=="0"; }
function pillsLocked(){ return lsGet("pbPillsLock")==="1"; }
function syncLayoutPrefs(){
  document.documentElement.classList.remove("e-pills-off");   // the head script's early call
  document.body.classList.toggle("pills-off", !pillsWanted());
  /* NO WARNING RING for a hidden panel or bar: --warn flags something WRONG, and a chosen
     preference is not. --warn/--warn-bg are read by nothing - kept, like the retired --e-c5:
     a warning colour will be wanted again, and it must mean a real fault (a catalog that
     failed to parse), never a preference set on purpose. */
  syncSettingsMenu();
}
let pillsBoxTimer=null;
/* THE SLOT'S HEIGHT IS THE ANIMATION - it sits in the sticky header, so gliding it
   carries the whole page. Measured, not declared: the ends are display:none and auto,
   which CSS cannot interpolate. Same FLIP discipline as flipPills, forced reflow included.
   `mutate` must land FINAL geometry synchronously - an intermediate layout glides to the
   wrong height. The transition is NOT in the sheet: a standing one would animate every
   step of a resize drag. */
function animatePillsBox(mutate,ms){
  ms=ms||180;
  const slot=pillsSlot();
  if(!slot || mgReduceMotion()){
    // No ride, but the header still changed height and the fixed panel is pinned to it.
    mutate();
    syncRailGeometry();
    return;
  }
  const box=()=>{
    const cs=getComputedStyle(slot);
    // A hidden slot is not a short slot: it reserves nothing, margin included.
    return cs.display==="none" ? {h:0,m:0}
      : {h:slot.getBoundingClientRect().height, m:parseFloat(cs.marginTop)||0};
  };
  const from=box();
  mutate();
  // Any override from a toggle still in flight has to go before the natural height can be read.
  slot.style.transition="none"; slot.style.height=""; slot.style.marginTop="";
  const to=box();
  const done=()=>{
    slot.classList.remove("pills-anim");
    slot.style.transition=""; slot.style.height=""; slot.style.marginTop="";
    syncRailGeometry();
  };
  clearTimeout(pillsBoxTimer);
  if(Math.abs(to.h-from.h)<1 && Math.abs(to.m-from.m)<1){ done(); return; }
  slot.classList.add("pills-anim");
  slot.style.height=from.h+"px"; slot.style.marginTop=from.m+"px";
  void slot.offsetHeight;                    // commit the start - see the note in flipPills
  slot.style.transition="height "+ms+"ms "+E_EASE+",margin-top "+ms+"ms "+E_EASE;
  slot.style.height=to.h+"px"; slot.style.marginTop=to.m+"px";
  /* The panel is fixed and positioned from the header's bottom edge - precisely the thing
     that is moving - so it is told every frame of the ride, not once. rAF stalls in a
     background tab, which is why the timer below has the last word either way. */
  const until=performance.now()+ms+20;
  const follow=()=>{
    syncRailGeometry();
    if(performance.now()<until) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  pillsBoxTimer=setTimeout(done,ms+20);
}
function togglePills(){
  animatePillsBox(()=>{
    lsSet("pbPills", pillsWanted() ? "0" : "1");
    syncLayoutPrefs();
    if(pillsWanted()) document.body.classList.remove("pills-peek");
    // Both ways: showing derives the clip, hiding clears it - see syncPillsCollapse().
    syncPillsCollapse();
  });
  toast(pillsWanted()?"Categories shown":"Categories hidden");
}
function togglePillsLock(){
  animatePillsBox(()=>{
    lsSet("pbPillsLock", pillsLocked() ? "0" : "1");
    // Locking implies the category bar should be preferred on.
    if(pillsLocked() && !pillsWanted()) lsSet("pbPills","1");
    syncLayoutPrefs();
    syncPillsCollapse();
  });
  toast(pillsLocked() ? "Categories stay fully expanded" : "Categories may auto-collapse");
}
// Ctrl/Cmd: pills peek/expand + intent rail overlay when not docked.
function pillsSlot(){ return $("#pillsSlot"); }
let railEdgeHover=false, modifierHeld=false;
/* See applyRailPeek: the window a pointer has to cross the cards and land on the panel. */
const RAIL_REACH_MS=620;
let railSearchPeek=false, railReachT=0;
/* Touch's own door to the overlay: sticky, tap-to-open, tap-outside-to-close. Hover
   cannot be the model on a touch screen - see bindRailHit. */
let railTouchOpen=false;
function applyRailPeek(){
  if(railDocked()){
    document.body.classList.remove("rail-peek");
    return;
  }
  /* Suppressed refuses HOVER and nothing else: hover is ambient and fires when the cursor
     drifts - exactly what hiding is meant to stop; Ctrl is the panel's own multi-select
     gesture, the user reaching for it, and a modifier cannot be held by accident. */
  const suppressed = railSuppressed();
  /* Typing is a reach for the panel as much as the edge is, and just as deliberate as Ctrl,
     so it ignores suppression too. Derived from the mark rather than latched: the peek lasts
     exactly as long as the mark sits on an intent, which is also why it arrives with the
     resort - markSurface withholds that mark until the query has settled. */
  const searching = !!railQuery()
    && markSurface()==="intent";
  const show=!!(modifierHeld || railTouchOpen || searching || (railEdgeHover && !suppressed));
  /* THE REACH. A search peek ends when the mark leaves the intents, and hovering a macro moves
     the mark - so crossing the cards towards the panel would shut it before the pointer could
     arrive. It therefore stands RAIL_REACH_MS after the mark leaves: land on it and hover holds
     it, stay among the cards and it goes. The grace is the search peek's alone - a released
     Ctrl is a decision, and a decision is not a journey. */
  if(show){ clearTimeout(railReachT); railReachT=0; railSearchPeek=searching; }
  else if(railSearchPeek && document.body.classList.contains("rail-peek")){
    if(!railReachT) railReachT=setTimeout(()=>{
      railReachT=0; railSearchPeek=false; applyRailPeek();
    },RAIL_REACH_MS);
    return;
  }else{ clearTimeout(railReachT); railReachT=0; }
  document.body.classList.toggle("rail-peek", show);
  // Re-measure under the (possibly multi-row) header before painting the overlay
  if(show) scheduleRailGeometry();
  else if(show) syncRailGeometry();
}
function updateModifierPeek(e){
  const held=!!(e&&(e.ctrlKey||e.metaKey));
  modifierHeld=held;
  /* Shift rides along on the same event. It reveals the hide button on a hovered star and
     nothing else - it does NOT expand the category bar, which is Ctrl's other job here. */
  document.body.classList.toggle("shift-held", !!(e&&e.shiftKey));
  /* A body class rather than a redraw: the panel rows swap their star for a hide button while
     Ctrl is down, and doing that in CSS keeps it instant and keeps drawIntentRail out of the
     keyboard path entirely. */
  document.body.classList.toggle("ctrl-held", held);
  /* Ctrl expands the bar with no pointer movement at all, so nothing would re-evaluate the order:
     a cursor resting on the panel would sit there while the bar opened over it. Re-ask with the
     last known position. */
  requestAnimationFrame(applyOverlapOrder);
  const slot=pillsSlot();
  // --- category pills ---
  if(!pillsWanted()){
    document.body.classList.remove("pills-lines-expand");
    if(slot) slot.classList.remove("pills-expand");
    /* Only when it actually flips: this runs on EVERY keydown and keyup, and re-asserting
       the class would restart the glide on each keystroke of a held chord. .12s, the
       dropdown tier - a peek answers a held key; .18s is for deliberate toggles. */
    if(held!==document.body.classList.contains("pills-peek")){
      animatePillsBox(()=>document.body.classList.toggle("pills-peek", held),120);
    }
  } else {
    document.body.classList.remove("pills-peek");
    document.body.classList.toggle("pills-lines-expand", held);
    if(slot) slot.classList.toggle("pills-expand", held);
  }
  // --- intent rail overlay (not when docked in the grid) ---
  applyRailPeek();
  // Ctrl also expands pills: re-pin the rail under the full expanded block
  scheduleRailGeometry();
}
function clearModifierPeek(){
  railEdgeHover=false;
  railTouchOpen=false;
  modifierHeld=false;
  document.body.classList.remove("pills-peek","pills-lines-expand","rail-peek","ctrl-held");
  const slot=pillsSlot();
  if(slot) slot.classList.remove("pills-expand");
  scheduleRailGeometry();
}
addEventListener("keydown",updateModifierPeek);
addEventListener("keyup",updateModifierPeek);
addEventListener("blur",clearModifierPeek);
window.addEventListener("blur",clearModifierPeek);
// Cap the category bar at two lines of layout space; extra rows overlay when expanded.
// Skipped when locked (⚙ → Lock categories).
function syncPillsCollapse(){
  const el=pills;
  const slot=pillsSlot();
  if(!el||!slot) return;
  document.documentElement.style.removeProperty("--e-pills-h");   // the bar is drawn: the head script's reservation is done
  const keepExpand=slot.classList.contains("pills-expand")||document.body.classList.contains("pills-lines-expand");
  /* CLEARED BEFORE ANY EARLY RETURN: pills-overflow left on a switched-off bar let Ctrl
     peek a bar wearing clipped-bar geometry - the slot reserved two lines, the pills
     flowed three. A bar that is not on screen clips nothing; say so, and the peek needs
     no overrides at all. */
  slot.classList.remove("pills-overflow","pills-expand");
  slot.style.removeProperty("--pills-2line");
  if(!pillsWanted()||document.body.classList.contains("pills-off")) return;
  // Locked: always full height in flow (no 2-line clip / overlay expand).
  if(pillsLocked()) return;
  const first=el.querySelector(".pill");
  if(!first) return;
  // Measure unconstrained height (overflow class removed → pills are in normal flow).
  void el.offsetHeight;
  const lineH=first.getBoundingClientRect().height;
  const styles=getComputedStyle(el);
  const gap=parseFloat(styles.rowGap||styles.gap)||6;
  const two=lineH*2+gap;
  const full=el.scrollHeight;
  /* The open bar is a popover; nothing here needs to know where it sits inside the
     header any more. */
  slot.style.removeProperty("--pills-full");
  if(full>two+1){
    slot.classList.add("pills-overflow");
    slot.style.setProperty("--pills-2line",two+"px");
    /* The open height must be a real length for the transition to run, and it can only be
       read with the open styles applied - padding and border are part of it. Measure with
       the transition suppressed, then hand the number to CSS. One forced layout, in a
       function already forcing one. */
    slot.classList.add("pills-measuring","pills-expand");
    const openH=el.getBoundingClientRect().height;
    slot.classList.remove("pills-expand");
    void el.offsetHeight;                    // land back on the closed height before animating
    slot.classList.remove("pills-measuring");
    slot.style.setProperty("--pills-full",openH+"px");
  }
  if(keepExpand) slot.classList.add("pills-expand");
}
function schedulePillsCollapse(){
  // Wait for rail-on / max-width layout to settle before measuring wrap height.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    syncPillsCollapse();
    rememberPillsShape();
    scheduleRailGeometry();
  }));
}
// What the head script reserves on the next load: the slot's height at rest, per window width.
function rememberPillsShape(){
  const slot=pillsSlot();
  if(!slot||!pillsWanted()||document.body.classList.contains("pills-off")){ lsDel("pbHdrPills"); return; }
  lsSet("pbHdrPills", window.innerWidth+"x"+(Math.round(slot.getBoundingClientRect().height*10)/10));
}
/* No choreography - every way the panel comes or goes takes the same plain path: the
   layout lands frame-zero (cards move at once) and the panel fades in place. A departing
   panel keeps its last geometry (syncRailGeometry); an arriving one is held by rail-ready
   until its geometry is real (syncRailLayout). */
function toggleRail(){
  lsSet("pbRail", railWanted() ? "0" : "1");
  // Hiding the panel does not clear the pin preference (restored when shown again).
  syncRailLayout();
  drawIntentRail();
  render();
  syncLayoutPrefs();
  schedulePillsCollapse();
  toast(railWanted() ? "Intent panel shown" : "Intent panel hidden");
}
function toggleRailLock(){
  lsSet("pbRailLock", railLocked() ? "0" : "1");
  // Pinning implies the panel should be preferred on.
  if(railLocked() && !railWanted()) lsSet("pbRail","1");
  syncRailLayout();
  drawIntentRail();
  render();
  syncLayoutPrefs();
  schedulePillsCollapse();
  /* The hidden case needs the way back in the message itself: the control that undoes it lives in
     the panel, and the panel is what just went away. */
  toast(railLocked()
    ? (railWanted() ? "Intent panel locked - open, and fixed width"
                    : "Intent panel locked off - hold Ctrl to show it")
    : (railWanted() ? "Intent panel unlocked - may auto-hide, width draggable"
                    : "Intent panel unlocked - hover the left edge to peek"));
}
function syncRailPinBtn(){
  const btn=$("#railPinBtn");
  if(!btn) return;
  const on=railLocked();
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  /* THE PANEL STAYS AS IT IS - shown stays shown, hidden stays hidden, the width stays
     put. The title names whichever half is about to matter: locking a visible panel pins
     it open, locking a peeked one puts it away for good - and that case says where the
     way back is, since the button lives in the panel that just went. */
  const hidden = !railWanted();
  btn.title = t(on
    ? (hidden ? "Unlock - let the panel appear again when you hover the left edge"
              : "Unlock - allow auto-hide on narrow windows, and allow the width to be dragged")
    : (hidden ? "Lock - stop the panel appearing on hover (Ctrl still shows it)"
              : "Lock - keep the panel docked on narrow windows, and fix its width"));
  btn.setAttribute("aria-label", t(on ? "Unlock the intent panel" : "Lock the intent panel open and fix its width"));
  /* Redrawn rather than restyled: the icon IS the state. The markup ships the open cut so
     the first paint is right before this runs. */
  btn.innerHTML = on ? ICON_LOCK : ICON_LOCK_OPEN;
  syncRailResizeUI();
}
function syncSettingsMenu(){
  const pillsBtn=$("#menuPills");
  const railBtn=$("#menuRail");
  if(pillsBtn){
    pillsBtn.textContent = pillsWanted() ? t("Hide categories") : t("Show categories");
    // Avoid formatActionChord here during early boot (scReady may still be false).
    const hold=scReady?formatActionChord("expandPills"):"Hold Ctrl";
    pillsBtn.title = pillsWanted()
      ? (pillsLocked()
        ? t("Hide the category bar, which is locked fully expanded when shown")
        : t("Hide the category bar; {KEY} peeks while it is hidden").replace("{KEY}",hold))
      : t("Show the category bar under the header.");
  }
  if(railBtn){
    railBtn.textContent = railWanted() ? t("Hide intent panel") : t("Show intent panel");
    railBtn.title = t(railWanted()
      ? (railLocked()
        ? "Panel is locked open (always docked). Hide turns it off entirely."
        : "Prefer showing the intent panel when the window is wide. On narrow windows it auto-hides; hover the left edge or hold Ctrl to peek. Use the lock at the top of the panel, or Settings, to keep it open.")
      : "Intent panel off. Hold Ctrl to peek the intent list as an overlay.");
  }
  syncRailPinBtn();
}
function closeSettingsMenu(){
  const menu=$("#settingsMenu"), btn=$("#settingsBtn");
  if(menu) menu.hidden=true;
  if(btn){ btn.classList.remove("on"); btn.setAttribute("aria-expanded","false"); }
}
function openSettingsMenu(){
  const menu=$("#settingsMenu"), btn=$("#settingsBtn");
  if(!menu||!btn) return;
  closeFactsPanel();
  closeMoreMenu();
  syncSettingsMenu();
  menu.hidden=false;
  btn.classList.add("on");
  btn.setAttribute("aria-expanded","true");
}
// ---- at load: the facts panel's size watch, and the header's own menus ----
wireFactsPanel();
wireHeaderMenus();
/* Re-measure on the signals that change the inputs: window size (zoom fires resize
   too), the body class (the rail docking or leaving; the algorithm's own class writes are
   kept from ringing by the guard), and tab count via scheduleHeaderSync from drawTabs. Order
   is fixed here: the algorithm decides WHAT hides, then the chevron reads what hid.
   rAF-coalesced, so a drag costs one pass per frame at most. */
function wireHeaderShedSync(){
  let raf=0, belt=0;
  const run=()=>{
    if(raf){ cancelAnimationFrame(raf); raf=0; }
    if(belt){ clearTimeout(belt); belt=0; }
    /* Not mid-grow: a shed class toggling while the tabs transition re-lays the row under
       them - the first tab visibly jumped. The grow's completion re-asks against still
       boxes; dropping this pass loses nothing because that one always follows. */
    if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
    /* Choreography brackets BOTH syncs: the door's visibility is syncMoreBtn's to flip, so a
       diff closed before it would miss the door opening. Probes inside stay invisible. */
    const shedBefore=shedSnap();
    shedHold(()=>{ syncHeaderShed(); syncMoreBtn(); });
    if(shedBefore) shedAnimate(shedBefore);
  };
  /* rAF plus a TIMEOUT BELT: rAF is fully suspended in a hidden document, so a page
     booted in a background tab parks its boot-time ask forever and the header never syncs
     until the first resize after focus. The belt fires even hidden (timers throttle but
     run); whichever of the two lands first cancels the other. */
  const ask=()=>{
    if(!raf) raf=requestAnimationFrame(run);
    if(!belt) belt=setTimeout(run, 200);
  };
  window.scheduleHeaderSync=ask;
  addEventListener("resize", ()=>{ syncHeaderShed._refreshNat=true; syncHeaderShed._lastResize=performance.now(); ask(); });
  document.addEventListener("visibilitychange", ask);   // surface from a background boot synced
  if(typeof MutationObserver==="function"){
    /* The algorithm writes body classes, which fires this observer once more; the second pass
       computes the same k from the same inputs, toggles nothing, and the observer goes quiet.
       Purity is the loop guard - the same property that makes the boundary flicker-free. */
    new MutationObserver(ask).observe(document.body,{attributes:true,attributeFilter:["class"]});
  }
  ask();   // boot state - the page can load already narrow, or already rail-hidden
}
wireHeaderShedSync();
syncLayoutPrefs();
// re-render so the filled value appears in every card as you type, not just on copy
pax.oninput=()=>{
  renderFillsSoon();
  scheduleTabSave();
};
function updateIntentPlaceholder(){
  if(!intentEl) return;
  intentEl.placeholder=t("search intents and cards");
  const ph=$("#intentPh");
  if(ph) ph.innerHTML=t("search intents and cards · <kbd>Enter</kbd> selects the marked intent · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> for several");
}
wireSearchBox();
updateIntentPlaceholder();
bindFieldClear(agentEl, $("#agentClear"), ()=>{ syncAgent(); });
bindFieldClear(pax, $("#paxClear"), ()=>{
  render();
  scheduleTabSave();
});
/* Split in two because applyTab() needs the first half only: it draws the pills and re-renders
   the list itself, once, after installing the whole tab. Calling setLang() from there would
   render twice and write the tab back while it is still being applied. */
/* The state and the thumb: everything a click must do in its own frame, and nothing that
   costs more than a class toggle. */
function applyLangState(l){
  lang = (l==="pl") ? "pl" : "en";
  /* Records the language ON SCREEN, not the last one deliberately chosen - written on a
     tab switch as well as a click: pick PL in tab 1, switch to an English tab, close the
     browser - reopening should resume in EN, the language actually being worked in. */
  lsSet("pbLang",lang);
  seg.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.l===lang));
}
function applyLangHeavy(){
  syncShortcutTitles();
  drawIntentRail();    // the rail lists clauses in the language on screen
  recountMacros();   // segment counts are per-language
}
function applyLangUI(l){ cancelLangTail(); applyLangState(l); applyLangHeavy(); }
/* THE THUMB FIRST, THE LANGUAGE UNDER IT. The .on toggle is the whole receipt and the CSS
   slides the thumb for .18s; the rest of a switch is ~200ms of synchronous work in Firefox,
   which ate the slide whole and left it snapping (Chrome is fast enough that it never
   showed). Fired two thirds of the way in, where the easing has already spent 93% of its
   travel, so the rebuild lands after the eye has stopped following the thumb. Reduced motion
   has no slide to protect and runs it straight. Cancelled by a second click and by a tab
   switch, so an EN/PL/EN run rebuilds once. */
let eLangTailT=0;
function cancelLangTail(){ if(eLangTailT){ clearTimeout(eLangTailT); eLangTailT=0; } }
function setLang(l){
  applyLangState(l);
  const tail=()=>{
    applyLangHeavy();
    syncIntentInput();   // a listed intent re-maps to the other language
    if(typeof catOrder!=="undefined") drawPills();
    /* The fast path never calls render(): the list's structure is language-blind, so a
       full paint would spend a 40-60ms style pass re-inserting 6.7k unchanged nodes. The
       screenful rebuilds in place, the rest follows in chunks. Search stays a full render -
       relevance order is per-language. The viewport scan exits early because a rect read
       under content-visibility resolves the card it touches: measuring everything IS the
       burst being avoided. */
    if(cardSearchTerms().length || typeof list==="undefined" || !list
       || !list.querySelector(".card[data-id]") || (typeof cardDrag!=="undefined"&&cardDrag)){
      render();
    } else {
      cancelLangChunks();
      list.querySelectorAll(".list-sep.e-catsep span[data-k]").forEach(sp=>{
        const k=sp.getAttribute("data-k");
        sp.innerHTML=catIconSvg(k)+esc(CATS[k]||k||"");
      });
      const vh=(window.innerHeight||900)+240;
      const els=list.querySelectorAll(".card[data-id]");
      const nowIds=[], laterIds=[];
      let past=false;
      for(let k=0;k<els.length;k++){
        const id=els[k].getAttribute("data-id");
        if(past){ laterIds.push(id); continue; }
        const r=els[k].getBoundingClientRect();
        if(r.top>vh){ past=true; laterIds.push(id); }
        else if(r.bottom<-240) laterIds.push(id);
        else nowIds.push(id);
      }
      nowIds.forEach(rebuildCardInPlace);
      runLangChunks(laterIds);
    }
    // Language belongs to the active tab, so a switch is a tab edit like PAX or ROLE.
    scheduleTabSave();
  };
  cancelLangTail();
  let still=false;
  try{ still=matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  if(still){ tail(); return; }
  /* After the seg glide (180ms), plus the pick-tail's own +20 - the tail is quick now,
     but even a quick tail landing mid-glide costs the one animation this delay buys. */
  eLangTailT=setTimeout(()=>{ eLangTailT=0; tail(); },200);
}
/* Folded, only the active button is on screen, so a click there has to TOGGLE -
   clicking the language you are already in would read as broken. The fold is read back
   from the DOM, not the media query: the stylesheet owns the breakpoint, and asking the
   element whether its sibling is displayed cannot drift from it. */
function segFolded(){
  return [...seg.querySelectorAll("button")].some(b=>b.offsetParent===null);
}
seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{
  const other=[...seg.querySelectorAll("button")].find(x=>x!==b);
  setLang(segFolded()&&other?other.dataset.l:b.dataset.l);
});
/* Retitle on resize: the tooltip has to describe what a click will DO, and that differs between
   the two layouts. Only the wording depends on the media query - the behaviour above does not. */
/* No labels: the placeholders name their fields outright (customer's name, agent's name,
   the drum's class), constant at every width, translated by the sweep. */

// category pills - order is user-arrangeable by dragging, and persists
let catOrder=[];
try{ catOrder=JSON.parse(nsGet("CatOrder")||"null")||[]; }catch(e){ catOrder=[]; }
// Legacy: Boarding pass (bp) → Check-in (cin)
catOrder=catOrder.map(k=>k==="bp"?"cin":k).filter((k,i,a)=>a.indexOf(k)===i);
let dragState=null, suppressClick=false, swapLock=0;
applyCatsToGlobal();
// counts + cards filled after rebuildCards(); seed order from base cats first
catOrder=catOrder.filter(k=>CATS[k]);

/* drawPills() wraps this to repaint the tab accents; the wrapper sits beside syncTabAccent. */
function drawPillsCore(){
  /* The + button is the bar's one focusable control, and a redraw replaces its node
     UNDER a keyboard user's focus when the language key or the tab key redraws the bar's
     labels. Text fields keep focus through such a switch by not being redrawn; the +
     earns the same by hand. */
  const addHadFocus=document.activeElement&&document.activeElement.classList
    &&document.activeElement.classList.contains("pill-add");
  pills.innerHTML="";
  const hc=intentCats();
  const mk=(id,label,n,drag)=>{
    const b=document.createElement("div");
    let extra="";
    const on = id ? cats.indexOf(id)>-1 : cats.length===0;   // "All" is on when nothing is
    // Keep intent/always hints even when the pill is selected (combined with .on in CSS).
    if(id){
      if(hc.specific.indexOf(id)>-1) extra=" hint2";        // issue-relevant - green ring
      else if(hc.always.indexOf(id)>-1) extra=" hint";      // always needed - blue ring
    }
    b.className="pill"+(on?" on":"")+extra
      +((searchCounts() && id && !n) ? " pill-nohit" : "");
    // Count including 0 - an empty category gets a 0 badge rather than no badge.
    // esc(label): names come from catalogs and renames - Import promises the file is
    // "read as data, never executed", and an unescaped label here broke that promise.
    b.innerHTML=(id
        ?catIconSvg(id)
        :'<svg class="e-pillall" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+ICON_ALL+'</svg>')
      /* data-i18n-skip: a category name belongs to whoever wrote the catalog. #pills lives
         inside <header>, which translateChrome sweeps - without the marker, a label that
         collided with an engine string was silently rewritten the moment the interface
         went Polish. All is unaffected: its label goes through t() at the call site. */
      +'<span class="pill-lab" data-i18n-skip>'+esc(label)+'</span>'
      /* ONE SLOT, TWO STATES: the card count, and a pencil while Ctrl is held. The pencil
         replaces the COUNT, which every category pill has - so every category is editable,
         which earlier shapes could not manage. Deleting lives in the editor the pencil
         opens, greyed with a reason instead of simply not existing. Same mechanic as the
         panel's star-to-hide swap, same body class, same instant-CSS reason. */
      +(id
        ? '<span class="pill-r">'
          +((n||n===0)?'<b>'+n+'</b>':"")
          +'<span class="pill-e" data-editcat="'+esc(id)+'" title="'+esc(t("Edit this category's names, icon and colour"))+'" aria-label="'+esc(t("Edit this category"))+'">'+ICON_EDIT+'</span>'
          +'</span>'
        : ((n||n===0)?" <b>"+n+"</b>":""));
    b.dataset.k=id;
    const _cs=catSlot(id);
    if(_cs>=0) b.dataset.ec=_cs;
    if(id){
      let tip=t("Click to filter · Ctrl+click to add/remove · drag to reorder");
      /* Green describes what the category HOLDS - a card linked to the chosen intent. Blue
         describes the category itself. */
      tip+=" · "+t("hold Ctrl to edit it");
      if(extra.indexOf("hint2")>-1) tip+=" · "+t("Green ring: holds a card linked to the chosen intent");
      else if(extra.indexOf("hint")>-1) tip+=" · "+t("Blue ring: a supporting category");
      b.title=tip;
    }
    if(drag && dragState && dragState.moved && dragState.key===id) b.classList.add("dragging");
    b.onclick=ev=>{
      if(suppressClick){ suppressClick=false; return; }   // finished a drag, not a click
      catsDropArmed=false;                                 // chosen by hand outranks the arming
      /* Before the pill's own handler, and stopping the event dead: a Ctrl+click on a pill means
         "add this category to the selection", and the pencil sits inside the pill. */
      const ed=ev&&ev.target&&ev.target.closest?ev.target.closest("[data-editcat]"):null;
      if(ed){ ev.preventDefault(); ev.stopPropagation(); openCategoryEditor(ed.getAttribute("data-editcat"),true); return; }
      // Captured before cats changes, so the rail's echo animates from where it really was
      const railBefore=captureRail(), relBefore=railRelKeys();
      if(!id){ cats=[]; }                                  // "All" clears the filter
      else if(ev && (ev.ctrlKey||ev.metaKey)){             // ctrl+click adds/removes
        const at=cats.indexOf(id);
        if(at>-1) cats.splice(at,1); else cats.push(id);
      }
      else cats = (cats.length===1 && cats[0]===id) ? [] : [id];
      // Opening a category while an intent is selected → jump to its linked entries
      pendingScrollHit=!!intentIdxs.length;
      drawPills(); render();
      railEchoRedraw(railBefore, relBefore);
      scrollRailTop();
      scheduleTabSave();
    };
    // Pointer-based dragging. HTML5 drag-and-drop gave a no-drop cursor and never
    // fired drop; pointer events also let the list reorder live, under the cursor.
    if(drag) b.onpointerdown=e=>{
      if(e.pointerType==="touch") return;   // taps are taps - see the rail rows for the story
      if(e.button!==0) return;
      if(e.target.closest&&e.target.closest("[data-editcat]")) return;   // the pencil is not a drag handle
      // clear any stale suppression: a drag that ended over a different pill fires its
      // click on the container, so the flag would otherwise swallow the NEXT real click
      suppressClick=false;
      dragState={key:id,x:e.clientX,y:e.clientY,moved:false};
    };
    pills.appendChild(b);
  };
  const _sc=searchCounts();
  const PN=k=>_sc ? (k==="" ? (_sc.__all||0) : (_sc[k]||0))
                  : (k==="" ? totalMacroCount() : (counts[k]||0));
  mk("",t("All"),PN(""),false);   // cards, like every other pill - not cards
  // double-click "All" restores the original order
  pills.firstChild.title=t("Show all categories; double-click to reset their order");
  pills.firstChild.ondblclick=()=>animateReorder(()=>{
    catOrder=Object.keys(CATS);
    nsDel("CatOrder");
  });
  displayCatOrder(hc).forEach(k=>{
    if(!CATS[k]) return;
    mk(k,CATS[k],PN(k),true);          // empty categories included, with a 0 badge
  });
  /* "+" sits after the last category, mirroring Manage's. Appended outside catOrder and
     not draggable - a control, not a category. A real <button>, the bar's only focus
     stop: pills are drag-and-toggle surfaces, this one ACTS, and a button is what a click,
     a screen reader and Enter expect of it. Focus is not walked on this screen - Tab and
     Shift+Tab are bound, the owner's call - so a click is its way in. The drag logic keys
     off dataset.k, which this never carries. */
  const add=document.createElement("button");
  add.type="button";
  add.className="pill pill-add";
  add.innerHTML=ICON_PLUS;         // drawn, not typed - see .pill-add for why
  add.title=t("Add a category");
  add.setAttribute("aria-label",t("Add a category"));
  add.onclick=()=>startPillCatAdd(add);
  pills.appendChild(add);
  if(addHadFocus) add.focus();
  // Two rAFs: wait for layout after DOM rebuild, then measure overflow.
  schedulePillsCollapse();
}
/** Inline category creation from the pill strip. Same contract as the Manage chip: type,
 *  Enter to accept, Esc or an empty blur to cancel. */
function startPillCatAdd(addEl){
  if(!pills || pills.querySelector(".pill-new")) return;
  const wrap=document.createElement("div");
  wrap.className="pill pill-new";
  wrap.innerHTML='<input type="text" placeholder="'+esc(t("New category"))+'" spellcheck="false" autocomplete="off">';
  pills.insertBefore(wrap, addEl);
  addEl.hidden=true;
  const inp=wrap.querySelector("input");
  const finish=ok=>{
    const name=inp&&inp.value?inp.value.trim():"";
    wrap.remove();
    addEl.hidden=false;
    if(!ok||!name) return;
    ensureCustomCat(name);
    rebuildCards();
    toast("Category added");
  };
  inp.focus();
  /* Keyboard exits hand focus back to the +; a mouse-blur leaves it where the user
     clicked. Queried, not the captured addEl: accepting rebuilds the bar and the
     closure's node is detached - the query finds the fresh one (and IS the captured one
     on the cancel path, where nothing redraws). */
  const refocus=()=>{ const a=pills.querySelector(".pill-add")||addEl; a.focus(); };
  // stopPropagation, or Enter and Esc also reach the app's global shortcut handling
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); finish(true); refocus(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(false); refocus(); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(!!(inp.value&&inp.value.trim())); },0); };
}

// FLIP: measure where every pill is, apply the change, then animate each one from
// its old box to its new one. Cheap, and it survives pills wrapping to a new line.
/* FLIP split in two halves so the capture can precede a state change that is not a
   simple mutate() callback - intent selection regroups the pills from several call
   sites, and those sites capture, change, redraw, then flip. Opt-in per call site rather
   than folded into drawPills(): most callers (tab restore, rename, wipe) should redraw
   instantly with no motion. */
/** Rects of every pill, keyed by category key. The "first" half of a FLIP. */
/* THE FLIPS ANSWER THE SWITCH AT THEIR CAPTURE: one handed nothing plays nothing, and every
   caller already treats an empty capture as "redraw, do not animate". Same in the two below. */
function capturePills(){
  if(mgReduceMotion()) return null;
  const before={};
  pills.querySelectorAll(".pill").forEach(p=>{ if(p.dataset.k) before[p.dataset.k]=p.getBoundingClientRect(); });
  return before;
}
// ---- at load: the frame pump's own kick, and the pill drag's document listeners ----
wirePumpKick();
wirePillDrag();

// ---- at load: the panel's stored width, its watches, its resizer and its two doors ----
applyStoredRailWidth();
wireOverlapPointer();
watchPillBarHeight();
buildRailResizer();
wirePageScroll();
wireRailObservers();
wireRailWheel();
bindRailHit();

// ---- at load: the pointer's own motion claims a row, and every gesture on the rail ----
wireRailHover();
wireRailPointer();

// ---- at load: the role drum's wheel, its click and its arrow keys ----
wireRoleDrum();


wireColResize();
wireColWidthWatch();

// ---- at load: the note pane, which closes on anything that moves the ground under it ----
wireNotePane();

// ---- at load: every pointer gesture the card list answers ----
wireListPointer();


// ---- at load: the quick facts text, its copy targets and its editor ----
renderFacts();
wireFactsCopy();
wireFactsEditor();

// ---- running a shortcut: the dispatcher reaches the whole app, so it stays here -------
function runShortcut(id){
  if(id==="langToggle"){ setLang(lang==="en"?"pl":"en"); return true; }
  if(id==="tabNext"){ stepTab(1); return true; }
  if(id==="tabNew"){ addTab(); return true; }
  if(id==="maintenance"){ closeLooseOverlays(); openMaintenance(); return true; }
  if(id==="quickFacts"){ toggleFactsPanel(); return true; }
  if(id==="newCard"){ const b=$("#addCardFab"); if(!b||b.hidden) return false; closeLooseOverlays(); b.click(); return true; }
  if(id==="selectSearch"){
    if(!intentEl) return false;
    closeLooseOverlays();
    try{ intentEl.focus({preventScroll:true}); }catch(_){ try{ intentEl.focus(); }catch(__){} }
    try{ intentEl.select(); }catch(_){}
    return true;
  }
  if(id==="focusPax"){ pax.focus(); pax.select(); return true; }
  if(id==="focusRole"){ const d=$("#roleDrum"); if(d) d.focus(); return true; }
  if(id==="toggleRail"){ toggleRail(); return true; }
  if(id==="togglePills"){ togglePills(); return true; }
  /* Unhandled when no editor is open, or when the arrow is at its end, so the key falls
     through instead of being silently swallowed. */
  if(id==="edPrevEntry"||id==="edNextEntry"){
    const b=$(id==="edPrevEntry"?"#edPrev":"#edNext");
    if(!b||b.disabled) return false;
    b.click();
    return true;
  }
  if(id==="edPrevLang") return edStepLang(-1);
  if(id==="edNextLang") return edStepLang(1);
  if(id==="clearIntent"){
    clearIntents();
    return true;
  }
  if(id==="allCats"){
    const railBefore=captureRail(), relBefore=railRelKeys();
    cats=[]; drawPills(); render();
    railEchoRedraw(railBefore, relBefore);
    toast("All categories");
    return true;
  }
  if(id==="navUp"||id==="navDown"){
    kbdNav(true);
    if(semiKind==="intent" && !railMarkUsed && (railSel>=0 || railMarkIdx>=0)){
      const n=railOrder.length;
      if(n){
        const step=id==="navDown"?1:-1;
        const from=railSel>=0?railSel:railOrder.indexOf(railMarkIdx);
        const to=railStep(from<0 ? (step>0?-1:n) : from, step);
        if(to>=0){
          railSel=to;
          railMarkIdx=railOrder[railSel];
          railDecorate(true);
          return true;
        }
      }
    }
    semiKind="card";
    navEntry(id==="navDown"?1:-1);
    return true;
  }
  if(id==="navPillLeft"||id==="navPillRight"){
    navPill(id==="navPillRight"?1:-1);
    return true;
  }
  if(id==="markTop"||id==="markBottom"){
    kbdNav(true);
    return markEnd(id==="markBottom"?1:-1);
  }
  if(id==="navPillFirst"||id==="navPillLast"){
    return navPillEnd(id==="navPillLast"?1:-1);
  }
  if(id==="copy"||id==="copyOther"){
    kbdNav(true);
    // The mark's surface decides what Enter means: an intent mark is picked, a card copied.
    if(id==="copy" && semiKind==="intent" && railMarkIdx>=0 && !railMarkUsed){
      const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
      // Enter's alter ego: inside a run it ADDS and closes, exactly as the key does.
      const run = pickRun && intentIdxs.length>0;
      pickIntent(idx, run);
      if(run){ railMarkUsed=true; semiKind=null; pickRun=false; }
      return true;
    }
    if(!entrySel){
      // Nothing focused yet - focus first block then copy (Enter after open)
      if(!navEntry(1)) return false;
    }
    return copyEntrySel(id==="copyOther");
  }
  if(id==="escape"){
    if(notePaneOpen()){ closeNotePane(); return true; }
    if(factsPanelOpen()){ closeFactsPanel(); return true; }
    if($("#settingsMenu")&&!$("#settingsMenu").hidden){ closeSettingsMenu(); return true; }
    escapeLadderStep();
    return true;
  }
  return false;
}

/* A rescue that must also survive the NEXT boot: applied here, before anything glass is
   drawn, and readable in the maintenance panel. */
try{ if(lsGet("pbGlassOff")==="1") document.body.classList.add("glass-off"); }catch(e){}
try{ if(lsGet("pbNoteHover")!=="0") document.body.classList.add("note-hover"); }catch(e){}

// ---- at load: the fields that watch their own cut, the X, and the body wrapper ----
wireCutFields();
wireModalX();
wireModalBody();
/* THE SCRIM DOES NOT CLOSE. Every dialog here carries an X, and the editors carry Cancel and
   Save: a click that lands beside the card is a miss, not an instruction, and answering it by
   throwing away an edit costs more than the one it saves. Escape still closes - that is the
   keyboard's X, not a stray. */

// ---- at load: the document's two keydown listeners, and the bindings read between them ----
wireCaptureKeydown();
loadShortcuts();
wireGlobalKeydown();

// ---- at load: the one listener behind every editor's language strip ----
wireLangTabs();

// ---- at load: the pointer listeners a Library drag runs on ----
wireManageDrag();

// ---- at load: the pointer listeners a tab drag runs on ----
wireTabDrag();

rebuildCards();
syncAgent();
applyLangUI(lang);   // initTabs() -> applyTab() installs the tab's own language and renders
rebuildRailMQ();     // the dock threshold, now that the column geometry it reads is declared
syncRailLayout();
/* Collapse the category bar NOW, in the same task as the first render. drawPills()
   ends in schedulePillsCollapse(), which waits two rAFs to measure a settled layout -
   right for a resize, wrong for boot, where syncRailLayout() settled it synchronously a
   line above: the wait painted two frames of a full-height bar, and everything below
   jumped when the clip arrived. The scheduled pass still runs and corrects anything that
   settles late; this one only makes sure the first frame is not wrong. */
syncPillsCollapse();
drawIntentRail();
initTabs();

// ---- at load: the chrome's saved language, the first entry's focus, and the greeting watch ----
wireOnOpen();

// ---- at load: the tour wiring and its first-run invite, and the sample mark --------
wireTourUi();
syncSampleMark();
maybeShowTourInvite();
/* The watched file. Silent at boot and only while the browser still holds permission:
   re-granting needs a user gesture, which is what `interactive` supplies. The stored edit
   time is a skip, not the answer - the signature decides whether anything really changed. */
function eCheckWatchedFile(interactive){
  if(!eWatchSupported()) return;
  if(document.getElementById("eCatalogModal")) return;
  eWatchGet().then(h=>{
    if(!h){ if(interactive) toast(t("No catalog file is being watched.")); return null; }
    const q=h.queryPermission?h.queryPermission({mode:"read"}):"granted";
    return Promise.resolve(q).then(state=>{
      if(state==="granted") return h;
      if(!interactive) return null;
      return h.requestPermission({mode:"read"}).then(v=>v==="granted"?h:null);
    }).then(ok=>{
      if(!ok){ if(interactive) toast(t("Etiuda needs permission to read that file again.")); return null; }
      return ok.getFile().then(f=>{
        const seen=nsGet("WatchSeen");
        if(!interactive && seen && String(f.lastModified||0)===seen) return null;
        nsSet("WatchSeen",String(f.lastModified||0));
        return f.text().then(text=>{
          let c=null;
          try{ c=parseCatalogFile(text); }
          catch(e){ if(interactive) toast(t("That file is not a catalog Etiuda can read.")); return null; }
          const shown=eOfferCatalogDialog(c,{
            foundHtml:esc(t("Located as"))+' <code>'+esc(eWatchName()||f.name)+'</code>.',
            refusedKey:"WatchNo", force:!!interactive,
            accept:(sig,updating)=>activateCatalog(c,{keepPersonal:updating})
          });
          if(!shown && interactive) toast(t("That file matches the catalog you already have."));
          return null;
        });
      });
    });
  }).catch(()=>{ if(interactive) toast(t("Could not read the watched file.")); });
}
eOfferCatalog();
/* The sibling channel is synchronous and free, so it goes first and this only speaks if it
   left the screen clear. */
setTimeout(()=>{ try{ eCheckWatchedFile(false); }catch(e){} }, 900);

/* ---- Macro search is a drill-down, not a resting state: entered for one lookup, it
   stays until something leaves it - and the first act after stepping away is almost
   always a NEW chat, which begins with an intent. So: return to the window with the
   query box untouched, and the box goes back to intents on its own. Three guards, each
   the difference between helpful and infuriating: only when the query is EMPTY (nothing
   typed is ever discarded); only after a real absence (30s - alt-tabbing to read a
   booking leaves the mode alone); only from macro mode. blur/focus, not
   visibilitychange: switching to the chat window does not always hide the tab. */



// ---- at load: the star pop, the eye pop and the copy wash ----
wirePops();

/* ---- ONE RESIZE LISTENER ------------------------------------------------------------------
   One listener, one place, a stated order: cheap flags first, text swaps, then the
   rAF-debounced geometry, then things that read finished layout. Every member is
   idempotent or self-debouncing, so the cost per event is what it always was. The old
   matchMedia(max-width:720px) change listener is folded in too: resize fires on every
   threshold crossing, and unlike matchMedia it also fires in emulated viewports. */
addEventListener("resize",()=>{
  syncHeaderElevation();                                // cheap flag, no layout read
  syncShortcutTitles();   // seg fold retitles EN/PL
  schedulePillsCollapse();                              // rAF: pill bar two-line measure
  scheduleRailGeometry();                               // rAF: rail top + dock threshold
  syncFactsGeometry();                                  // facts panel max size
  fitTabLabels();  // tabs: names re-fit, cap breathes
  if(tourActive()) scheduleTourPlace();                 // spotlight follows its target
  mtRefreshLive();                                      // maintenance readings, while open
  scheduleCutScan();                                    // what fits changed, so what is cut did
},{passive:true});

/* Last line of the app, on purpose: reaching it is the definition of a successful boot.
   The guard at the top of the file waits for this and offers a way out if it never comes. */
try{ if(typeof E_BOOT_OK==="function") E_BOOT_OK(); }catch(e){}
// After boot, so the warning sits over a working Etiuda rather than an empty frame.
try{ showPackMigrationWarning(); }catch(e){}
/* Back where you were. Consumed on read so a later refresh does not keep reopening it, and
   never over the catalog offer: being asked whether to load a file is the more urgent
   question, and it is the one that appears after an eject. */
try{
  if(ssGet(MG_REOPEN)){
    ssDel(MG_REOPEN);
    if(!document.getElementById("eCatalogModal")) openManage();
  }
}catch(e){}
