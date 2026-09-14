/* The header's two menus, and every way out of them: a click elsewhere, Escape, and the
   ladder Escape climbs when a tour is running. */
import { openAbout } from "./about.js";
import { closeFactsPanel, factsPanelOpen } from "./facts.js";
import { endPillNavPeek } from "./pill-nav-peek.js";
import { closeMoreMenu, openMoreMenu, shedSnap, shedHold, syncHeaderShed, syncMoreBtn, shedAnimate } from "./shed.js";
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
  $("#moreBtn").onclick=e=>{
    e.stopPropagation();
    const m=$("#moreMenu");
    if(!m) return;
    if(m.hidden) openMoreMenu(); else closeMoreMenu();
  };
  $("#moreMenu").onclick=e=>{
    const b=e.target.closest("button[data-act]");
    if(!b) return;
    const act=b.dataset.act;
    // Delegation, exactly as the Menu stand-ins did it: the hidden button still works by
    // .click() while display:none, so there is ONE behaviour behind however many doors.
    if(act==="facts"){ closeMoreMenu(); const t=$("#factsBtn"); if(t) t.click(); }
    else if(act==="theme"){ closeMoreMenu(); const t=$("#theme"); if(t) t.click(); }
    /* The ACTIVE button, not the inactive one: the seg's own handler carries a fold-toggle
       - when a button is not rendered, any click means "switch to the other" - and a fully
       hidden seg reads as folded, so clicking the inactive one inverted the request into a
       perfect no-op. Clicking the active one lets the toggle do exactly its job. */
    else if(act==="lang"){ closeMoreMenu(); const t=$("#seg button.on")||$("#seg button"); if(t) t.click(); }
  };
  addEventListener("pointerdown",e=>{
    // Touching anything ends the keyboard peek - hover takes over from here.
    endPillNavPeek();
    const sw=$("#settingsWrap"), fw=$("#factsWrap"), mw=$("#moreWrap");
    if(sw && !sw.contains(e.target)) closeSettingsMenu();
    if(fw && !fw.contains(e.target)) closeFactsPanel();
    if(mw && !mw.contains(e.target)) closeMoreMenu();
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
    if($("#moreMenu") && !$("#moreMenu").hidden){
      closeMoreMenu(); e.stopPropagation(); return;
    }
    if(factsPanelOpen()){
      closeFactsPanel(); e.stopPropagation();
    }
  }, true);
}

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
export {
  syncSettingsMenu,
  closeSettingsMenu,
  openSettingsMenu,
  wireHeaderShedSync,
  wireHeaderMenus
};
