import { setLang } from "./lang-seg.js";
import { stepTab, addTab, drawPills, escapeLadderStep } from "./tabs.js";
import { closeLooseOverlays } from "./keydown.js";
import { openMaintenance } from "./maintenance.js";
import { toggleFactsPanel, factsPanelOpen, closeFactsPanel } from "./facts.js";
import { $, intentEl, pax } from "./dom.js";
import { toggleRail } from "./rail-panel.js";
import { togglePills } from "./pills-box.js";
import { edStepLang } from "./dialog.js";
import { clearIntents, pickIntent } from "./intent-pick.js";
import { captureRail, railRelKeys, railEchoRedraw, railDecorate } from "./rail-list.js";
import { render } from "./render.js";
import { toast } from "./ui-lang.js";
import { kbdNav, railStep, markEnd } from "./mark.js";
import { navEntry } from "./entry-walk.js";
import { navPill, navPillEnd } from "./pill-walk.js";
import { copyEntrySel } from "./copy-entry.js";
import { notePaneOpen, closeNotePane } from "./note-pane.js";
import { closeSettingsMenu } from "./header-menus.js";
import { lang, setCats, semiKind, railMarkUsed, railSel, railMarkIdx, railOrder, setRailSel, setRailMarkIdx, setSemiKind, pickRun, intentIdxs, setRailMarkUsed, setPickRun, entrySel } from "./app-state.js";
// One dispatcher for every bound key: it reaches the whole app, so every surface it touches
// imports into this file rather than the other way about.

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
    setCats([]); drawPills(); render();
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
          setRailSel(to);
          setRailMarkIdx(railOrder[railSel]);
          railDecorate(true);
          return true;
        }
      }
    }
    setSemiKind("card");
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
      if(run){ setRailMarkUsed(true); setSemiKind(null); setPickRun(false); }
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
export {
  runShortcut,
};
