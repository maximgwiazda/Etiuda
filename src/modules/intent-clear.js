/* The three clear buttons and the box's own "set" state, which are one statement about the
   query and the selection and have to be redrawn together. */
import { t } from "./ui-lang.js";
import { $, intentEl } from "./dom.js";
import { ICON_CLEAR_TEXT } from "./icons.js";
import { intentIdxs } from "./app-state.js";
import { hooks } from "./hooks.js";

function syncIntentClearBtns(){
  // The rail's arrow never disables - killing it the frame a clear lands kills the spin.
  const railBtn=$("#intentRailClear");
  if(railBtn){ railBtn.hidden=false; railBtn.disabled=false; }
  const fab=$("#clearIntentsFab");
  if(fab){
    const n=intentIdxs.length;
    fab.classList.toggle("on",n>0);
    fab.classList.toggle("many",n>1);
    fab.setAttribute("aria-hidden",n?"false":"true");
    fab.tabIndex=n?0:-1;
    fab.querySelector(".fab-n").textContent=n>1?String(n):"";
    fab.title=n>1 ? t("Clear the chosen intents ({N})").replace("{N}",n) : t("Clear the intent");
    fab.setAttribute("aria-label",fab.title);
    fab.onclick=()=>hooks.clearIntents();
  }
  const boxBtn=$("#intentClear");
  if(boxBtn){
    boxBtn.hidden=false;
    // Greys on exactly one question: is there text to rub out?
    boxBtn.disabled=!String(intentEl.value||"").length;
    boxBtn.title=t("Clear search text");
    boxBtn.innerHTML=ICON_CLEAR_TEXT;
  }
}
function syncIntentInput(){
  // The box holds the query; the selection lives in the rail, never written over the text.
  intentEl.classList.toggle("set", intentIdxs.length>0 || !!String(intentEl.value||"").trim());
  syncIntentClearBtns();
}

export {
  syncIntentClearBtns,
  syncIntentInput
};
