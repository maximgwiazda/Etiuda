/* The module tree's entry, and the app's first act.
   Every module's exports are spread onto globalThis because the artifact is one script: the
   smoke suite drives the app through those names, and the page console is the only debugger a
   single file has. A name its own module replaces needs an accessor below; a name mutated in
   place does not. */
import * as icons from "./modules/icons.js";
import * as stock from "./modules/stock.js";
import * as polish from "./modules/polish.js";
import * as contentModel from "./modules/content-model.js";
import * as words from "./modules/words.js";
import * as greeting from "./modules/greeting.js";
import * as cardFields from "./modules/card-fields.js";
import * as catRoles from "./modules/cat-roles.js";
import * as env from "./modules/env.js";
import * as cardModel from "./modules/card-model.js";
import * as cardBlocks from "./modules/card-blocks.js";
import * as storage from "./modules/storage.js";
import * as columns from "./modules/columns.js";
import * as spell from "./modules/spell.js";
import * as scoring from "./modules/scoring.js";
import * as affinity from "./modules/affinity.js";
import * as intentText from "./modules/intent-text.js";
import * as maintenance from "./modules/maintenance.js";
import * as shortcuts from "./modules/shortcuts.js";
import * as cardOrder from "./modules/card-order.js";
import * as catalog from "./modules/catalog.js";
import * as collapse from "./modules/collapse.js";
import * as tour from "./modules/tour.js";
import * as editors from "./modules/editors.js";
import * as catalogFile from "./modules/catalog-file.js";
import * as catalogV2 from "./modules/catalog-v2.js";
import * as langTabs from "./modules/lang-tabs.js";
import * as cardEditor from "./modules/card-editor.js";
import * as macrosJson from "./modules/macros-json.js";
import * as tabs from "./modules/tabs.js";
import * as motion from "./modules/motion.js";
import * as manage from "./modules/manage.js";
import * as settings from "./modules/settings.js";
import * as cardSearch from "./modules/card-search.js";
import * as listPointer from "./modules/list-pointer.js";
import * as facts from "./modules/facts.js";
import * as uiLang from "./modules/ui-lang.js";
import * as railList from "./modules/rail-list.js";
import * as personalPack from "./modules/pack.js";
import * as shed from "./modules/shed.js";
import * as favourites from "./modules/favourites.js";
import * as railPanel from "./modules/rail-panel.js";
import * as paint from "./modules/paint.js";
import * as dialog from "./modules/dialog.js";
import * as headerMenus from "./modules/header-menus.js";
import * as cardScore from "./modules/card-score.js";
import * as searchBox from "./modules/search-box.js";
import * as keydown from "./modules/keydown.js";
import * as catalogOffer from "./modules/catalog-offer.js";
import * as pops from "./modules/pops.js";
import * as recency from "./modules/recency.js";
import * as onOpen from "./modules/on-open.js";
import * as localMemory from "./modules/local-memory.js";
import * as shortcutsList from "./modules/shortcuts-list.js";
import * as pillState from "./modules/pill-state.js";
import * as catIdentity from "./modules/cat-identity.js";
import * as catRelevance from "./modules/cat-relevance.js";
import * as about from "./modules/about.js";
import * as pillNavPeek from "./modules/pill-nav-peek.js";
import * as cardIntent from "./modules/card-intent.js";
import * as pageScroll from "./modules/page-scroll.js";
import * as entryWalk from "./modules/entry-walk.js";
import * as intentId from "./modules/intent-id.js";
import * as cssEsc from "./modules/css-esc.js";
import * as cutText from "./modules/cut-text.js";
import * as pillWalk from "./modules/pill-walk.js";
import * as catalogBoot from "./modules/catalog-boot.js";
import * as catSet from "./modules/cat-set.js";
import * as esc from "./modules/esc.js";
import * as copyEntry from "./modules/copy-entry.js";
import * as cardNode from "./modules/card-node.js";
import * as intentClear from "./modules/intent-clear.js";
import * as escapeLadder from "./modules/escape-ladder.js";
import * as cardBody from "./modules/card-body.js";
import * as pool from "./modules/card-pool.js";
import * as roleDrum from "./modules/role-drum.js";
import * as roleTurn from "./modules/role-turn.js";
import * as fieldClear from "./modules/field-clear.js";
import * as dom from "./modules/dom.js";
import * as theme from "./modules/theme.js";
import * as cardCounts from "./modules/card-counts.js";
import * as rebuild from "./modules/rebuild.js";
import * as render from "./modules/render.js";
import * as mark from "./modules/mark.js";
import * as intentPick from "./modules/intent-pick.js";
import * as notePane from "./modules/note-pane.js";
import * as pillsBar from "./modules/pills-bar.js";
import * as langSeg from "./modules/lang-seg.js";
import * as repaint from "./modules/repaint.js";
import * as pillsBox from "./modules/pills-box.js";
import * as agent from "./modules/agent.js";
import * as ids from "./modules/ids.js";
import * as browserSuggest from "./modules/browser-suggest.js";
import * as runShortcut from "./modules/run-shortcut.js";
import * as appState from "./modules/app-state.js";
import * as host from "./modules/host.js";
import * as hookSlots from "./modules/hooks.js";
Object.assign(globalThis, icons, stock, polish, contentModel, words, greeting, cardFields, catRoles, env, cardModel, cardBlocks, storage, columns, spell, scoring, affinity, intentText, maintenance, shortcuts, cardOrder, catalog, catalogV2, collapse, tour, editors, catalogFile, langTabs, cardEditor, macrosJson, tabs, motion, manage, settings, cardSearch, listPointer, facts, uiLang, railList, personalPack, shed, favourites, railPanel, paint, dialog, headerMenus, cardScore, searchBox, keydown, catalogOffer, pops, recency, onOpen, localMemory, shortcutsList, pillState, catIdentity, catRelevance, about, pillNavPeek, cardIntent, pageScroll, entryWalk, intentId, cssEsc, pillWalk, catalogBoot, catSet, esc, copyEntry, cardNode, intentClear, escapeLadder, cardBody, pool, roleDrum, roleTurn, fieldClear, cutText, dom, theme, cardCounts, rebuild, render, mark, intentPick, notePane, pillsBar, langSeg, repaint, pillsBox, agent, ids, browserSuggest, runShortcut, appState, host, hookSlots);

/* These are replaced wholesale rather than filled in place, so the monolith has to read the
   binding rather than the copy taken above, before any catalog existed. A name mutated in place
   needs no line here; a name its own module assigns to does. */
// The handles grabDom() fills at boot: the copy spread above is taken while every one is null.
Object.defineProperty(globalThis, "list", { get: () => dom.list });
Object.defineProperty(globalThis, "pax", { get: () => dom.pax });
Object.defineProperty(globalThis, "intentEl", { get: () => dom.intentEl });
Object.defineProperty(globalThis, "agentEl", { get: () => dom.agentEl });
Object.defineProperty(globalThis, "roleSel", { get: () => dom.roleSel });
Object.defineProperty(globalThis, "seg", { get: () => dom.seg });
Object.defineProperty(globalThis, "pills", { get: () => dom.pills });
Object.defineProperty(globalThis, "cardTpl", { get: () => dom.cardTpl });
Object.defineProperty(globalThis, "modalEl", { get: () => dom.modalEl });
Object.defineProperty(globalThis, "modalCard", { get: () => dom.modalCard });
Object.defineProperty(globalThis, "cutRange", { get: () => dom.cutRange });
Object.defineProperty(globalThis, "cutInk", { get: () => dom.cutInk });
Object.defineProperty(globalThis, "CAT_ICONS_CATALOG", { get: () => icons.CAT_ICONS_CATALOG });
Object.defineProperty(globalThis, "CAT_COLORS_CATALOG", { get: () => icons.CAT_COLORS_CATALOG });
Object.defineProperty(globalThis, "CAT_LABELS_PL", { get: () => icons.CAT_LABELS_PL });
Object.defineProperty(globalThis, "GREET_WORDS", { get: () => greeting.GREET_WORDS });
Object.defineProperty(globalThis, "FACTS", { get: () => stock.FACTS });
Object.defineProperty(globalThis, "WHO_BASE", { get: () => stock.WHO_BASE });
Object.defineProperty(globalThis, "CATALOG_ROLES", { get: () => catRoles.CATALOG_ROLES });
Object.defineProperty(globalThis, "ALWAYS_CATS", { get: () => catRoles.ALWAYS_CATS });
Object.defineProperty(globalThis, "colLastN", { get: () => columns.colLastN });
Object.defineProperty(globalThis, "colAvailW", { get: () => columns.colAvailW });
Object.defineProperty(globalThis, "eSpellFix", { get: () => spell.eSpellFix });
Object.defineProperty(globalThis, "toastSerial", { get: () => uiLang.toastSerial });
Object.defineProperty(globalThis, "scReady", { get: () => shortcuts.scReady });
Object.defineProperty(globalThis, "scMap", { get: () => shortcuts.scMap });
Object.defineProperty(globalThis, "scMap2", { get: () => shortcuts.scMap2 });
Object.defineProperty(globalThis, "scCaptureId", { get: () => shortcutsList.scCaptureId });
Object.defineProperty(globalThis, "scCaptureSlot", { get: () => shortcutsList.scCaptureSlot });
Object.defineProperty(globalThis, "scRepaint", { get: () => shortcutsList.scRepaint });
Object.defineProperty(globalThis, "E_CATALOG_NAME", { get: () => catalog.E_CATALOG_NAME });
Object.defineProperty(globalThis, "E_CATALOG_VERSION", { get: () => catalog.E_CATALOG_VERSION });
Object.defineProperty(globalThis, "tabs", { get: () => tabs.tabs });
Object.defineProperty(globalThis, "tabSaveTimer", { get: () => tabs.tabSaveTimer });
Object.defineProperty(globalThis, "tabInsertAnimating", { get: () => tabs.tabInsertAnimating });
Object.defineProperty(globalThis, "cardDrag", { get: () => listPointer.cardDrag });
Object.defineProperty(globalThis, "pack", { get: () => personalPack.pack });
Object.defineProperty(globalThis, "BASE_M", { get: () => personalPack.BASE_M });
Object.defineProperty(globalThis, "shedHeld", { get: () => shed.shedHeld });
Object.defineProperty(globalThis, "eShedNat", { get: () => shed.eShedNat });
Object.defineProperty(globalThis, "RAIL_DOCK_MIN", { get: () => railPanel.RAIL_DOCK_MIN });
// Filled in place and never replaced. The line reads as redundant and is not: the bridge
// gate counts the write inside snapshotBaseIntents and requires it.
Object.defineProperty(globalThis, "counts", { get: () => cardCounts.counts });
Object.defineProperty(globalThis, "ePackEpoch", { get: () => personalPack.ePackEpoch });
/* The tab's own state and the mark. These take a SETTER as well, which the others do not:
   each was a script-level binding the page itself could assign to, and the smoke suite does,
   so a getter alone would turn such a write into a silent no-op. */
Object.defineProperty(globalThis, "railSel", { get: () => appState.railSel, set: v => appState.setRailSel(v) });
Object.defineProperty(globalThis, "railOrder", { get: () => appState.railOrder, set: v => appState.setRailOrder(v) });
Object.defineProperty(globalThis, "railMarkIdx", { get: () => appState.railMarkIdx, set: v => appState.setRailMarkIdx(v) });
Object.defineProperty(globalThis, "railMatch", { get: () => appState.railMatch, set: v => appState.setRailMatch(v) });
Object.defineProperty(globalThis, "railSortT", { get: () => appState.railSortT, set: v => appState.setRailSortT(v) });
Object.defineProperty(globalThis, "railSettled", { get: () => appState.railSettled, set: v => appState.setRailSettled(v) });
Object.defineProperty(globalThis, "railMarkUsed", { get: () => appState.railMarkUsed, set: v => appState.setRailMarkUsed(v) });
Object.defineProperty(globalThis, "catsDropArmed", { get: () => appState.catsDropArmed, set: v => appState.setCatsDropArmed(v) });
Object.defineProperty(globalThis, "pickRun", { get: () => appState.pickRun, set: v => appState.setPickRun(v) });
Object.defineProperty(globalThis, "semiKind", { get: () => appState.semiKind, set: v => appState.setSemiKind(v) });
Object.defineProperty(globalThis, "catOrder", { get: () => appState.catOrder, set: v => appState.setCatOrder(v) });
Object.defineProperty(globalThis, "cats", { get: () => appState.cats, set: v => appState.setCats(v) });
Object.defineProperty(globalThis, "shown", { get: () => appState.shown, set: v => appState.setShown(v) });
Object.defineProperty(globalThis, "entrySel", { get: () => appState.entrySel, set: v => appState.putEntrySel(v) });
Object.defineProperty(globalThis, "pendingScrollHit", { get: () => appState.pendingScrollHit, set: v => appState.setPendingScrollHit(v) });
Object.defineProperty(globalThis, "intentIdxs", { get: () => appState.intentIdxs, set: v => appState.setIntentIdxs(v) });
Object.defineProperty(globalThis, "intentText", { get: () => appState.intentText, set: v => appState.setIntentText(v) });
Object.defineProperty(globalThis, "lang", { get: () => appState.lang, set: v => appState.putLang(v) });
Object.defineProperty(globalThis, "cards", { get: () => appState.cards, set: v => appState.setCards(v) });
Object.defineProperty(globalThis, "cardCounts", { get: () => appState.cardCounts, set: v => appState.setCardCounts(v) });
Object.defineProperty(globalThis, "dragState", { get: () => appState.dragState, set: v => appState.setDragState(v) });
Object.defineProperty(globalThis, "suppressClick", { get: () => appState.suppressClick, set: v => appState.setSuppressClick(v) });
Object.defineProperty(globalThis, "swapLock", { get: () => appState.swapLock, set: v => appState.setSwapLock(v) });
Object.defineProperty(globalThis, "BASE_STORE", { get: () => intentId.BASE_STORE });
Object.defineProperty(globalThis, "BASE_N", { get: () => intentId.BASE_N });
Object.defineProperty(globalThis, "intentOrder", { get: () => intentId.intentOrder });
Object.defineProperty(globalThis, "intentOrderLoaded", { get: () => intentId.intentOrderLoaded });

/* THE BOOT LIST, in the order the app has always run it: the handles, then the wiring each
   surface needs, then the first render, then what may speak after it. The order is the
   contract - a listener registered earlier runs earlier, and more than one line here reads
   what an earlier one wrote - so a line moves only for a stated reason. */
function boot(){
  // Every app-level action the lower layer calls upwards, before a line of boot can call one
  hookSlots.wireHooks({
    shedSnap: shed.shedSnap,
    shedStage: shed.shedStage,
    shedAnimate: shed.shedAnimate,
    shedHold: shed.shedHold,
    shedHolding: shed.shedHolding,
    shedWordmarkW: shed.shedWordmarkW,
    capturePills: pillsBar.capturePills,
    drawPillsCore: pillsBar.drawPillsCore,
    captureRail: railList.captureRail,
    railRelKeys: railList.railRelKeys,
    railEchoRedraw: railList.railEchoRedraw,
    hideCard: cardEditor.hideCard,
    markEntrySel: entryWalk.markEntrySel,
    listEntryEls: entryWalk.listEntryEls,
    flushPillState: pillState.flushPillState,
    ensureCustomCat: cardEditor.ensureCustomCat,
    syncAddFab: cardEditor.syncAddFab,
    openCardEditor: cardEditor.openCardEditor,
    setIntentHidden: favourites.setIntentHidden,
    syncIntentOrder: favourites.syncIntentOrder,
    toggleIntentFavourite: favourites.toggleIntentFavourite,
    syncFavouritesMeta: favourites.syncFavouritesMeta,
    syncRailGeometry: railPanel.syncRailGeometry,
    scheduleRailGeometry: railPanel.scheduleRailGeometry,
    railDecorate: railList.railDecorate,
    drawIntentRail: railList.drawIntentRail,
    cardOrderTouched: cardOrder.cardOrderTouched,
    openSettings: settings.openSettings,
    endTour: tour.endTour,
    startTour: tour.startTour,
    tourActive: tour.tourActive,
    tourArrowRoute: tour.tourArrowRoute,
    drawTourArrow: tour.drawTourArrow,
    closeSettingsMenu: headerMenus.closeSettingsMenu,
    syncSettingsMenu: headerMenus.syncSettingsMenu,
    render: render.render,
    rebuildCards: rebuild.rebuildCards,
    clearIntents: intentPick.clearIntents,
    pickIntent: intentPick.pickIntent,
    onRailMQChange: intentPick.onRailMQChange,
    clearSearchQuery: searchBox.clearSearchQuery,
    updateIntentPlaceholder: searchBox.updateIntentPlaceholder,
    segFolded: langSeg.segFolded,
    applyLangUI: langSeg.applyLangUI,
    openCategoryEditor: editors.openCategoryEditor,
    openIntentEditor: editors.openIntentEditor,
    openManage: manage.openManage,
    mgCardsIn: manage.mgCardsIn,
    syncSampleMark: catalogFile.syncSampleMark,
    sampleReady: catalogFile.sampleReady,
    loadSampleCatalog: catalogFile.loadSampleCatalog,
    importCatalogHere: catalogFile.importCatalogHere,
    runShortcut: runShortcut.runShortcut,
  });
  // A 1.16.7 desk's keys, copied under this version's names before the first line reads one
  storage.eCarryOldKeys();
  // The language this window last showed, which seeds the first tab
  appState.putLang(storage.lsGet("eLang")==="pl" ? "pl" : "en");
  // Every handle on the document, before a line of this file reads one
  dom.grabDom();
  /* The desktop host, if there is one, before anything reads a body class it sets. */
  host.wireHost();
  // The browser's own suggestion popups, off before a field can be focused
  browserSuggest.suppressBrowserSuggest();
  // The maintenance panel's watch on the states no resize reports
  maintenance.wireMaintenanceWatch();

  // The pointer dismisses a keyboard mark
  mark.wireKbdNav();
  // The stored chrome language, the theme, and the watch on the system's own
  try{ if(storage.lsGet("eUiLang")==="pl") document.documentElement.lang="pl"; }catch(e){}
  theme.applyTheme();
  theme.watchSystemTheme();

  // The footer's version, and the icons the prose slots hold
  try{ const _v=document.getElementById("eVer"); if(_v) _v.textContent=env.E_VERSION; }catch(e){}
  /* Fills the footer's icon slots and, more importantly, #aboutInfo's - About is built by reading
     that element's innerHTML, so the icons have to be in it before anyone opens the dialog. */
  try{ icons.fillProseIcons(document); }catch(e){}

  catalogBoot.applyBootCatalog();
  // The SW_* arrays hold the catalog's intents only from here; intent-id.js says why
  // the snapshot cannot sit at a module's top level.
  intentId.snapshotBaseIntents();


  personalPack.loadPack();


  // The agent field, its stored value and the fill it asks for
  agent.wireAgent();
  // Comment actor
  // One list covering both booking comments and gift card comments.
  dom.roleSel.value = "";
  // The theme button, which pins the choice the system was making
  theme.wireThemeBtn();
  // The modifier that peeks the bar and the panel
  railPanel.wireModifierPeek();
  // The facts panel's size watch, and the header's own menus
  facts.wireFactsPanel();
  headerMenus.wireHeaderMenus();
  headerMenus.wireHeaderShedSync();
  pillsBox.syncLayoutPrefs();
  agent.wirePaxFill();
  searchBox.wireSearchBox();
  searchBox.updateIntentPlaceholder();
  fieldClear.bindFieldClear(dom.agentEl, dom.$("#agentClear"), ()=>{ agent.syncAgent(); });
  fieldClear.bindFieldClear(dom.pax, dom.$("#paxClear"), ()=>{
    render.render();
    tabs.scheduleTabSave();
  });
  // The language control, whose two buttons toggle when the fold hides one
  langSeg.wireLangSeg();
  /* No labels: the placeholders name their fields outright (customer's name, agent's name,
     the drum's class), constant at every width, translated by the sweep. */

  // category pills - order is user-arrangeable by dragging, and persists
  try{ appState.setCatOrder(JSON.parse(storage.nsGet("CatOrder")||"null")||[]); }catch(e){ appState.setCatOrder([]); }
  // Legacy: Boarding pass (bp) → Check-in (cin)
  appState.setCatOrder(appState.catOrder.map(k=>k==="bp"?"cin":k).filter((k,i,a)=>a.indexOf(k)===i));
  catSet.applyCatsToGlobal();
  // counts + cards filled after rebuildCards(); seed order from base cats first
  appState.setCatOrder(appState.catOrder.filter(k=>contentModel.CATS[k]));

  // The frame pump's own kick, and the pill drag's document listeners
  paint.wirePumpKick();
  paint.wirePillDrag();

  // The panel's stored width, its watches, its resizer and its two doors
  railPanel.applyStoredRailWidth();
  railPanel.wireOverlapPointer();
  railPanel.watchPillBarHeight();
  railPanel.buildRailResizer();
  railPanel.wirePageScroll();
  railPanel.wireRailObservers();
  railPanel.wireRailWheel();
  railPanel.bindRailHit();

  // The pointer's own motion claims a row, and every gesture on the rail
  railList.wireRailHover();
  railList.wireRailPointer();

  // The role drum's wheel, its click and its arrow keys
  roleTurn.wireRoleDrum();


  columns.wireColResize();
  columns.wireColWidthWatch();

  // The note pane, which closes on anything that moves the ground under it
  notePane.wireNotePane();

  // Every pointer gesture the card list answers
  listPointer.wireListPointer();


  // The quick facts text, its copy targets and its editor
  facts.renderFacts();
  facts.wireFactsCopy();
  facts.wireFactsEditor();


  /* A rescue that must also survive the NEXT boot: applied here, before anything glass is
     drawn, and readable in the maintenance panel. */
  try{ if(storage.lsGet("eGlassOff")==="1") document.body.classList.add("glass-off"); }catch(e){}
  try{ if(storage.lsGet("eNoteHover")!=="0") document.body.classList.add("note-hover"); }catch(e){}

  // The fields that watch their own cut, the X, and the body wrapper
  cutText.wireCutFields();
  dialog.wireModalX();
  dialog.wireModalBody();
  /* THE SCRIM DOES NOT CLOSE. Every dialog here carries an X, and the editors carry Cancel and
     Save: a click that lands beside the card is a miss, not an instruction, and answering it by
     throwing away an edit costs more than the one it saves. Escape still closes - that is the
     keyboard's X, not a stray. */

  // The document's two keydown listeners, and the bindings read between them
  keydown.wireCaptureKeydown();
  shortcuts.loadShortcuts();
  keydown.wireGlobalKeydown();

  // The one listener behind every editor's language strip
  langTabs.wireLangTabs();

  // The pointer listeners a Library drag runs on
  manage.wireManageDrag();

  // The pointer listeners a tab drag runs on
  tabs.wireTabDrag();

  rebuild.rebuildCards();
  agent.syncAgent();
  langSeg.applyLangUI(appState.lang);   // initTabs() -> applyTab() installs the tab's own language and renders
  railPanel.rebuildRailMQ();     // the dock threshold, now that the column geometry it reads is declared
  railPanel.syncRailLayout();
  /* Collapse the category bar NOW, in the same task as the first render. drawPills()
     ends in schedulePillsCollapse(), which waits two rAFs to measure a settled layout -
     right for a resize, wrong for boot, where syncRailLayout() settled it synchronously a
     line above: the wait painted two frames of a full-height bar, and everything below
     jumped when the clip arrived. The scheduled pass still runs and corrects anything that
     settles late; this one only makes sure the first frame is not wrong. */
  pillsBox.syncPillsCollapse();
  railList.drawIntentRail();
  tabs.initTabs();

  // The chrome's saved language, the first entry's focus, and the greeting watch
  onOpen.wireOnOpen();

  // The tour wiring and its first-run invite, and the sample mark
  tour.wireTourUi();
  catalogFile.syncSampleMark();
  tour.maybeShowTourInvite();
  catalogOffer.eOfferCatalog();
  /* The sibling channel is synchronous and free, so it goes first and this only speaks if it
     left the screen clear. */
  setTimeout(()=>{ try{ catalogOffer.eCheckWatchedFile(false); }catch(e){} }, 900);

  /* ---- Macro search is a drill-down, not a resting state: entered for one lookup, it
     stays until something leaves it - and the first act after stepping away is almost
     always a NEW chat, which begins with an intent. So: return to the window with the
     query box untouched, and the box goes back to intents on its own. Three guards, each
     the difference between helpful and infuriating: only when the query is EMPTY (nothing
     typed is ever discarded); only after a real absence (30s - alt-tabbing to read a
     booking leaves the mode alone); only from macro mode. blur/focus, not
     visibilitychange: switching to the chat window does not always hide the tab. */



  // The star pop, the eye pop and the copy wash
  pops.wirePops();

  /* ---- ONE RESIZE LISTENER ------------------------------------------------------------------
     One listener, one place, a stated order: cheap flags first, text swaps, then the
     rAF-debounced geometry, then things that read finished layout. Every member is
     idempotent or self-debouncing, so the cost per event is what it always was. The old
     matchMedia(max-width:720px) change listener is folded in too: resize fires on every
     threshold crossing, and unlike matchMedia it also fires in emulated viewports. */
  addEventListener("resize",()=>{
    railPanel.syncHeaderElevation();                                // cheap flag, no layout read
    shortcuts.syncShortcutTitles();   // seg fold retitles EN/PL
    pillsBox.schedulePillsCollapse();                              // rAF: pill bar two-line measure
    railPanel.scheduleRailGeometry();                               // rAF: rail top + dock threshold
    facts.syncFactsGeometry();                                  // facts panel max size
    tabs.fitTabLabels();  // tabs: names re-fit, cap breathes
    if(tour.tourActive()) tour.scheduleTourPlace();                 // spotlight follows its target
    maintenance.mtRefreshLive();                                      // maintenance readings, while open
    cutText.scheduleCutScan();                                    // what fits changed, so what is cut did
  },{passive:true});

  /* Last line of the app, on purpose: reaching it is the definition of a successful boot.
     The guard at the top of the file waits for this and offers a way out if it never comes. */
  try{ if(typeof E_BOOT_OK==="function") E_BOOT_OK(); }catch(e){}
  // After boot, so the warning sits over a working Etiuda rather than an empty frame.
  try{ personalPack.showPackMigrationWarning(); }catch(e){}
  /* Back where you were. Consumed on read so a later refresh does not keep reopening it, and
     never over the catalog offer: being asked whether to load a file is the more urgent
     question, and it is the one that appears after an eject. */
  try{
    if(storage.ssGet(storage.MG_REOPEN)){
      storage.ssDel(storage.MG_REOPEN);
      if(!document.getElementById("eCatalogModal")) manage.openManage();
    }
  }catch(e){}
}
/* The cycle gate loads this file in bare node to see whether anything reads across an import
   cycle while it loads, and there is no document there. In a browser this is the last line of
   the app's one script, and the app starts here. */
if(typeof document!=="undefined") boot();
