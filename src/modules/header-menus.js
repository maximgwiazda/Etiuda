/* The header's two menus, and every way out of them: a click elsewhere, Escape, and the
   ladder Escape climbs when a tour is running. */
import { closeFactsPanel, factsPanelOpen } from "./facts.js";
import { openManage } from "./manage.js";
import { openSettings } from "./settings.js";
import { closeMoreMenu, openMoreMenu } from "./shed.js";
import { endTour, startTour, tourActive } from "./tour.js";

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
    if(act==="settings"){ closeSettingsMenu(); openSettings(); }
    else if(act==="manage"){ closeSettingsMenu(); openManage(); }
    else if(act==="tour"){ closeSettingsMenu(); startTour(); }
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
    if(tourActive()){
      endTour(false);
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

export {
  wireHeaderMenus
};
