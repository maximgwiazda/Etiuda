/* THE DESK STARTED AGAIN IN PLACE, for a catalog loaded or put down and for local memory cleared or
   given back: every step of boot() that reads the catalog, the personal layer or a preference, in
   boot's order, over module state put back to what a fresh page holds. The listeners boot laid
   stay. Reached through hooks; tests/swap.mjs holds the result to a fresh start from the same
   storage, so a step added to boot() that reads any of the three belongs here too. */
import { closeNotePane } from "./note-pane.js";
import { resetPack, loadPack } from "./pack.js";
import { resetAppState, putLang, lang } from "./app-state.js";
import { resetIntentIds, snapshotBaseIntents } from "./intent-id.js";
import { dropCardPool } from "./card-pool.js";
import { forgetRowNaturals } from "./shed.js";
import { eForgetRecency } from "./recency.js";
import { forgetLookEdits } from "./desk-look.js";
import { rearmTrustRecheck } from "./catalog-trust.js";
import { lsGet } from "./storage.js";
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
import { initTabs } from "./tabs.js";
import { syncSampleMark } from "./catalog-file.js";
import { paintCatNow } from "./catalog-offer.js";
import { syncRoleWheel } from "./agent.js";
import { applyPrefs } from "./settings.js";
import { focusIntentOnOpen } from "./on-open.js";
import { openManage } from "./manage.js";
import { mtRefreshLive } from "./maintenance.js";
import { tourAfterRestart, maybeStartTour } from "./tour.js";
import { paintJoin, teamJoinShown } from "./team-join.js";

function restartDesk(){
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
  syncRoleWheel();
  applyPrefs();
  translateChrome();
  placeRailNow();
  focusIntentOnOpen();
  // A dialog standing over the desk shows the new one.
  if(document.getElementById("mgCatList")) openManage();
  mtRefreshLive();
  tourAfterRestart();
  maybeStartTour();
  // The catalog a team let this desk in to has just landed: its lead's key, not yet shown, hangs from its name now.
  if(teamJoinShown()) paintJoin();
}

export {
  restartDesk
};
