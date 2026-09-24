/* The header's menu, and every way out of it: a click elsewhere, Escape, and the ladder
   Escape climbs when a tour is running. */
import { openAbout } from "./about.js";
import { cancelFactsEdit, closeFactsPanel, factsPanelOpen } from "./facts.js";
import { endPillNavPeek } from "./pill-nav-peek.js";
import { measureShedNaturals, syncRowShed } from "./shed.js";
import { $ } from "./dom.js";
import { togglePills, pillsWanted, pillsLocked } from "./pills-box.js";
import { toggleRail, railWanted, railLocked, syncRailPinBtn } from "./rail-panel.js";
import { tabInsertAnimating } from "./tabs.js";
import { t } from "./ui-lang.js";
import { CONTENT_LANGS, nextContentLang } from "./content-model.js";
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
    /* Delegation: the hidden button still works by .click() while display:none, so there is ONE
       behaviour behind however many doors. */
    if(act==="facts"){ closeMoreMenu(); const el=$("#factsBtn"); if(el) el.click(); }
    else if(act==="theme"){ closeMoreMenu(); const el=$("#theme"); if(el) el.click(); }
    /* The ACTIVE button, not the inactive one: the seg's own handler carries a fold-toggle -
       when a button is not rendered, a click means "switch to the other" - and a fully hidden
       seg reads as folded, so clicking the inactive one inverted the request into a no-op. */
    else if(act==="lang"){ closeMoreMenu(); const el=$("#seg button.on")||$("#seg button"); if(el) el.click(); }
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
      // Ahead of the editor's own Esc, so it keeps that Esc's meaning: see cancelFactsEdit.
      if(!cancelFactsEdit()) closeFactsPanel();
      e.stopPropagation();
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
    /* ORDER IS FIXED: the ladder decides what hides, then the chevron reads what hid. The chevron
       holds no list of its own for exactly this reason. */
    syncRowShed();
    syncMoreBtn();
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
/* ---- THE CHEVRON. Design note at #moreWrap in the markup. The one rule that matters:
   everything here reads the LIVE computed state of the buttons themselves, so the ladder's rungs
   cannot drift from the chevron's idea of them - there is no second copy of the policy. */
function syncMoreBtn(){
  const wrap=$("#moreWrap"); if(!wrap) return;
  const gone=sel=>{ const el=$(sel); return !!el && getComputedStyle(el).display==="none"; };
  const factsGone=gone("#factsBtn"), themeGone=gone("#theme"), segGone=gone("#seg");
  const fRow=$("#moreFacts"), tRow=$("#moreTheme"), lRow=$("#moreLang");
  if(fRow) fRow.hidden=!factsGone;
  if(tRow) tRow.hidden=!themeGone;
  /* A door is worth a doorway only where something stands behind it: at one declared language
     the control does not act, so neither does the row that stands in for it, and it cannot be
     one of the reasons the chevron opens either. */
  const langGone=segGone && CONTENT_LANGS.length>1;
  if(lRow){
    lRow.hidden=!langGone;
    /* The badge names the language you are IN - the folded seg shows the current language and
       switches on click, and one control must read the same behind whichever door it stands in.
       The TARGET goes in the title, where "what happens if I press" belongs. Read off the seg
       rather than from a binding, so the door and the control cannot disagree. */
    const on=$("#seg button.on");
    const cur=on ? String(on.dataset.l||"") : CONTENT_LANGS[0], next=nextContentLang(cur);
    const badge=$("#moreLangBadge");
    if(badge) badge.textContent=cur.toUpperCase();
    lRow.title=cur==="pl" && next==="en" ? t("Polish cards - switch to English")
      : cur==="en" && next==="pl" ? t("English cards - switch to Polish")
      : t("{LANG} cards - switch to {NEXT}").replace("{LANG}",cur.toUpperCase())
          .replace("{NEXT}",String(next).toUpperCase());
  }
  const any=factsGone||themeGone||langGone;
  /* Widening the window while the menu is open takes the reason for it away mid-look; the menu
     closes with the button rather than being orphaned over nothing. */
  if(!any) closeMoreMenu();
  wrap.hidden=!any;
}
function closeMoreMenu(){
  const m=$("#moreMenu"), b=$("#moreBtn");
  if(m) m.hidden=true;
  if(b){ b.classList.remove("on"); b.setAttribute("aria-expanded","false"); }
}
function openMoreMenu(){
  const m=$("#moreMenu"), b=$("#moreBtn");
  if(!m||!b) return;
  closeSettingsMenu(); closeFactsPanel();
  syncMoreBtn();   // the rows reflect this instant's measurement, not the last resize's
  m.hidden=false;
  b.classList.add("on");
  b.setAttribute("aria-expanded","true");
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
  syncMoreBtn,
  openMoreMenu,
  closeMoreMenu,
  syncSettingsMenu,
  closeSettingsMenu,
  openSettingsMenu,
  wireHeaderShedSync,
  wireHeaderMenus
};
