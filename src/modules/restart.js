/* THE DESK STARTED AGAIN IN PLACE, for a catalog loaded or put down and for local memory cleared or
   given back: every step of boot() that reads the catalog, the personal layer or a preference, in
   boot's order, over module state put back to what a fresh page holds. The listeners boot laid
   stay. Reached through hooks; tests/swap.mjs holds the result to a fresh start from the same
   storage, so a step added to boot() that reads any of the three belongs here too. */
import { closeNotePane } from "./note-pane.js";
import { resetPack, loadPack, takePack } from "./pack.js";
import { resetAppState, putLang, lang } from "./app-state.js";
import { resetIntentIds, snapshotBaseIntents, setIntentOrderLoaded } from "./intent-id.js";
import { dropCardPool } from "./card-pool.js";
import { forgetRowNaturals } from "./shed.js";
import { eForgetRecency } from "./recency.js";
import { forgetLookEdits } from "./desk-look.js";
import { rearmTrustRecheck } from "./catalog-trust.js";
import { lsGet, eLayer, LAYER_KEYS } from "./storage.js";
import { uiLang, translateChrome } from "./ui-lang.js";
import { applyBootCatalog } from "./catalog-boot.js";
import { syncLangSeg, applyLangUI } from "./lang-seg.js";
import { carryAtBoot } from "./card-carry.js";
import { roleSel } from "./dom.js";
import { loadCatOrder } from "./cat-set.js";
import { renderFacts } from "./facts.js";
import { updateIntentPlaceholder } from "./search-box.js";
import { rebuildCards } from "./rebuild.js";
import { rebuildRailMQ, syncRailLayout, placeRailNow } from "./rail-panel.js";
import { syncPillsCollapse } from "./pills-box.js";
import { drawIntentRail } from "./rail-list.js";
import { initTabs, drawPills } from "./tabs.js";
import { syncSampleMark } from "./catalog-file.js";
import { paintCatNow, paintCatWaiting } from "./catalog-offer.js";
import { forgetEditionMarks } from "./edition-marks.js";
import { forgetFlagOffered } from "./card-flag-desk.js";
import { syncRoleWheel } from "./agent.js";
import { applyPrefs, repaintScreen } from "./settings.js";
import { focusFirstEntryOnOpen } from "./on-open.js";
import { screenOn, screens, frontScreenTab } from "./screen-tabs.js";
import { mtRefreshLive } from "./maintenance.js";
import { tourAfterRestart, maybeStartTour } from "./tour.js";
import { paintJoin, teamJoinShown } from "./team-join.js";
import { render } from "./render.js";
import { E_CATALOG_STORE } from "./catalog.js";
import { mgRefreshAround } from "./manage.js";

function restartDesk(){
  const wasScreen=screenOn;
  // The Undo of an act before this one has nothing left to undo.
  const u=document.getElementById("eUndo");
  if(u) u.remove();
  closeNotePane();
  resetPack();
  resetAppState();
  resetIntentIds();
  dropCardPool();
  forgetRowNaturals();
  eForgetRecency();
  forgetEditionMarks();
  forgetFlagOffered();
  forgetLookEdits();
  rearmTrustRecheck();
  putLang(lsGet("eLang") || uiLang());
  applyBootCatalog();
  syncLangSeg();
  snapshotBaseIntents();
  loadPack();
  carryAtBoot();
  roleSel.value="";
  loadCatOrder();
  renderFacts();
  updateIntentPlaceholder();
  rebuildCards();
  applyLangUI(lang);
  rebuildRailMQ();
  syncRailLayout();
  syncPillsCollapse();
  drawIntentRail();
  initTabs();
  syncSampleMark();
  paintCatNow();
  paintCatWaiting();
  syncRoleWheel();
  applyPrefs();
  translateChrome();
  placeRailNow();
  focusFirstEntryOnOpen();
  // The screen tab that was in front comes back in front over the new catalog: initTabs fronted a conversation.
  if(wasScreen && screens.includes(wasScreen)) frontScreenTab(wasScreen); /* plant:restart-keeps-screen */
  mtRefreshLive();
  tourAfterRestart();
  maybeStartTour();
  // The catalog a team let this desk in to has just landed: its lead's key, not yet shown, hangs from its name now.
  if(teamJoinShown()) paintJoin();
}

/* WHAT ANOTHER COMPUTER PUT ON THIS DESK, through the store's sync, shown where the person is with nothing started again: the layer
   in view read again and drawn, the preferences applied, the screen in front drawn again unless a field on it holds the keyboard,
   then once it lets go. An editor open over an entry that changed keeps its typing and says so (dialog.js edSubjectCheck). */
function takeSyncedDesk(keys){
  /* The catalog itself taken away behind the page (Start from my account): the desk starts again in place, without it. */
  if(keys.indexOf(E_CATALOG_STORE)>-1){ restartDesk(); return; } /* plant:synced-catalog-restart */
  const layer=eLayer(), mine=n=>keys.indexOf(layer+n)>-1;
  const packed=mine("Pack"), ordered=mine("CatOrder"), intents=mine("IntentOrder");
  if(packed) takePack();
  if(intents) setIntentOrderLoaded(false);
  if(packed || ordered) loadCatOrder();
  if(packed || ordered || intents){ rebuildCards(); drawPills(); drawIntentRail(); }
  if(keys.some(k=>!LAYER_KEYS.some(n=>k===layer+n))) applyPrefs(); else render();
  drawScreenSynced();
}
let screenSyncedOwed=false;
function drawScreenSynced(){
  const sh=document.getElementById("screenHost"), a=document.activeElement;
  if(!screenOn || !sh) return;
  const tag=a ? String(a.tagName||"").toLowerCase() : "";
  const typing=!!a && sh.contains(a) && (a.isContentEditable || tag==="textarea" || tag==="select"
    || (tag==="input" && !/^(checkbox|radio|range|button|submit|reset|color)$/i.test(a.type||"")));
  if(typing){
    if(!screenSyncedOwed){
      screenSyncedOwed=true;
      sh.addEventListener("focusout",()=>{ screenSyncedOwed=false; setTimeout(drawScreenSynced,0); },{once:true});
    }
    return;
  }
  if(screenOn==="settings") repaintScreen(); /* plant:synced-screen */
  else if(screenOn==="library") mgRefreshAround(()=>{});
}

export {
  restartDesk,
  takeSyncedDesk
};
