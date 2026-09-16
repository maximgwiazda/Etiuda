/* The header's menu, and every way out of it: a click elsewhere, Escape, and the ladder
   Escape climbs when a tour is running. */
import { openAbout } from "./about.js";
import { closeFactsPanel, factsPanelOpen } from "./facts.js";
import { endPillNavPeek } from "./pill-nav-peek.js";
import { measureShedNaturals } from "./shed.js";
import { $ } from "./dom.js";
import { togglePills, pillsWanted, pillsLocked } from "./pills-box.js";
import { toggleRail, railWanted, railLocked, syncRailPinBtn } from "./rail-panel.js";
import { tabInsertAnimating } from "./tabs.js";
import { t } from "./ui-lang.js";
import { scReady, formatActionChord } from "./shortcuts.js";
import { hooks } from "./hooks.js";

function wireHeaderMenus(){
  $("#settingsBtn").onclick=e=>{
    e.stopPropagation();
    const menu=$("#settingsMenu");
    if(!menu) return;
    if(menu.hidden) openSettingsMenu(); else closeSettingsMenu();
  };
  $("#settingsMenu").onclick=e=>{
    const b=e.target.closest("button[data-act]");
    if(!b) return;
    const act=b.dataset.act;
    // Add actions sit with the things they create, so this menu carries none of them.
    if(act==="settings"){ closeSettingsMenu(); hooks.openSettings(); }
    else if(act==="manage"){ closeSettingsMenu(); hooks.openManage(); }
    else if(act==="tour"){ closeSettingsMenu(); hooks.startTour(); }
    else if(act==="about"){ closeSettingsMenu(); openAbout(); }
    else if(act==="rail"){ toggleRail(); }
    else if(act==="pills"){ togglePills(); }
  };
  addEventListener("pointerdown",e=>{
    // Touching anything ends the keyboard peek - hover takes over from here.
    endPillNavPeek();
    const sw=$("#settingsWrap"), fw=$("#factsWrap");
    if(sw && !sw.contains(e.target)) closeSettingsMenu();
    if(fw && !fw.contains(e.target)) closeFactsPanel();
  });
  addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    if(hooks.tourActive()){
      hooks.endTour(false);
      e.stopPropagation(); e.preventDefault();
      return;
    }
    if($("#settingsMenu") && !$("#settingsMenu").hidden){
      closeSettingsMenu(); e.stopPropagation(); return;
    }
    if(factsPanelOpen()){
      closeFactsPanel(); e.stopPropagation();
    }
  }, true);
}

/* Re-price the wordmark on the signals that change its own width: window size, which zoom
   fires too, and a body class that could show or hide it. What to DO with the number is the
   strip's, in applyTabWidths, where the decision lands in the same frame as the arrows.
   rAF-coalesced, so a drag costs one pass per frame at most. Re-measuring while the wordmark
   is hidden reads 0 and keeps the last honest figure, so the observer cannot ring: the pass
   the strip's own class write triggers changes nothing and goes quiet. */
function wireHeaderShedSync(){
  let raf=0, belt=0;
  const run=()=>{
    if(raf){ cancelAnimationFrame(raf); raf=0; }
    if(belt){ clearTimeout(belt); belt=0; }
    /* Not mid-grow: the boxes are still moving, and a width read mid-animation is a number
       about nothing. The grow's completion re-asks against still boxes. */
    if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
    measureShedNaturals();
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
  addEventListener("resize", ask);
  document.addEventListener("visibilitychange", ask);   // surface from a background boot synced
  if(typeof MutationObserver==="function"){
    new MutationObserver(ask).observe(document.body,{attributes:true,attributeFilter:["class"]});
  }
  /* SYNCHRONOUSLY at boot, not through the valve: the first applyTabWidths runs inside
     initTabs, before any frame, and a wordmark priced at 0 there is a rung the strip cannot
     use on its opening pass. */
  run();
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
  syncSettingsMenu();
  menu.hidden=false;
  btn.classList.add("on");
  btn.setAttribute("aria-expanded","true");
}
export {
  syncSettingsMenu,
  closeSettingsMenu,
  openSettingsMenu,
  wireHeaderShedSync,
  wireHeaderMenus
};
