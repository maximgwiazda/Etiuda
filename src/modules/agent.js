import { lsSet, lsGet } from "./storage.js";
import { agentEl, pax } from "./dom.js";
import { t } from "./ui-lang.js";
import { scheduleTabSave } from "./tabs.js";
import { hooks } from "./hooks.js";
// The agent's own name: one field feeding two tokens, and the burst that fills the cards with
// them. The fill waits for a pause in the typing; the value does not.

// ---- agent identity ------------------------------------------------------------
// One field feeding two tokens: {AGENT} is the text verbatim, /{INIT} the lowercase initials.
// "John Smith" gives display "John Smith" and init "js"; "John S." gives "John S." and "js".
/* {AGENT} reproduces exactly what was typed: abbreviating the surname is one employer's
   policy, not a fact about support work, and a licensed engine must not bake it in.
   Whitespace still collapses - a double space is a typo, not a style. {INIT} is a
   different token doing a different job. */
function agentParts(raw){
  const s=String(raw||"").trim().replace(/\s+/g," ");
  if(!s) return {display:"",init:""};
  const w=s.split(" ").filter(Boolean);
  const first=w[0];
  const last=(w.length>1 ? w[w.length-1] : "").replace(/\.+$/,"");  // "G." -> "G" for the initial
  return {
    display: s,
    init: (first.charAt(0)+(last.charAt(0)||"")).toLowerCase()
  };
}
/* A FILL IS A BURST, NOT AN EVENT. {AGENT}, {PAX} and {ROLE} are substituted while the cards
   are built, so a keystroke in one of those boxes used to rebuild all of them - 40ms of
   Firefox per letter, and a pasted name arrived visibly behind the hand. The value is stored
   on the keystroke; only the card text waits for the pause. Nothing racy hides in the wait:
   a copy re-runs fill() from the source, so the clipboard never reads the screen. */
let eFillT=0;
function renderFillsSoon(){
  if(eFillT) clearTimeout(eFillT);
  eFillT=setTimeout(()=>{ eFillT=0; hooks.render(); },110);
}
function syncAgent(){
  lsSet("pbAgent",agentEl.value);
  const a=agentParts(agentEl.value);
  agentEl.title = a.display
    ? t("Customers see \"{NAME}\", and comments sign /{INIT}")
        .replace("{NAME}",a.display).replace("{INIT}",a.init)
    : t("The name customers see, exactly as you type it; comments sign with its initials");
  renderFillsSoon();
}
/* Starts empty, not with a name. A de-branded engine must not ship pre-filled with its
   author's identity, and the placeholder already says what the field is for. */
function wireAgent(){
  agentEl.value = lsGet("pbAgent")!=null ? lsGet("pbAgent") : "";
  agentEl.oninput=syncAgent;
}
// The other field that fills the cards: re-rendered on the same pause, so the value
// appears in every card as it is typed rather than only when one is copied.
function wirePaxFill(){
  pax.oninput=()=>{
    renderFillsSoon();
    scheduleTabSave();
  };
}
export {
  wirePaxFill,
  agentParts,
  renderFillsSoon,
  syncAgent,
  wireAgent,
};
