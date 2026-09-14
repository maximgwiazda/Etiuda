/* ---------------- app ---------------- */
// ---- at load: every handle on the document, before a line of this file reads one ----
grabDom();
// ---- at load: the browser's own suggestion popups, off before a field can be focused ----
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


loadPack();


// ---- at load: the agent field, its stored value and the fill it asks for ----
wireAgent();
// ---- Comment actor ------------------------------------------------------------
// One list covering both booking comments and gift card comments.
roleSel.value = "";
// ---- at load: the theme button, which pins the choice the system was making ----
wireThemeBtn();
// ---- at load: the modifier that peeks the bar and the panel ----
wireModifierPeek();
// ---- at load: the facts panel's size watch, and the header's own menus ----
wireFactsPanel();
wireHeaderMenus();
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
// ---- at load: the language control, whose two buttons toggle when the fold hides one ----
wireLangSeg();
/* No labels: the placeholders name their fields outright (customer's name, agent's name,
   the drum's class), constant at every width, translated by the sweep. */

// category pills - order is user-arrangeable by dragging, and persists
let catOrder=[];
try{ catOrder=JSON.parse(nsGet("CatOrder")||"null")||[]; }catch(e){ catOrder=[]; }
// Legacy: Boarding pass (bp) → Check-in (cin)
catOrder=catOrder.map(k=>k==="bp"?"cin":k).filter((k,i,a)=>a.indexOf(k)===i);
applyCatsToGlobal();
// counts + cards filled after rebuildCards(); seed order from base cats first
catOrder=catOrder.filter(k=>CATS[k]);

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
