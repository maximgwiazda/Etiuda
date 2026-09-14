import { agentEl, pax, intentEl, $ } from "./dom.js";

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
export {
  suppressBrowserSuggest,
};
