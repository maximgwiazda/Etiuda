import { lsSet, lsGet, nsGet } from "./storage.js";
import { pax } from "./dom.js";
import { t, translateTree, toast, TOAST_HAND_MS } from "./ui-lang.js";
import { esc } from "./esc.js";
import { greetLine } from "./greeting.js";
import { lang } from "./app-state.js";
import { scheduleTabSave } from "./tabs.js";
import { hooks } from "./hooks.js";
// The agent's own name: one stored value feeding two tokens, the burst that fills the cards
// with them, and the question asked once at the first run.

// ---- agent identity ------------------------------------------------------------
// One value feeding two tokens: {AGENT} is the text verbatim, /{INIT} the lowercase initials.
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
/* THE NAME IS A STORED VALUE, NOT A FIELD. The box it lived in left the header with the rest of
   the tools, so it is read at the call rather than off an element: the two screens that write
   it, the first-run question and Settings, then have nothing to tell each other. Starts empty
   and is never seeded - a de-branded engine must not ship carrying its author's identity. */
const E_AGENT_KEY="eAgent";
function agentName(){ const v=lsGet(E_AGENT_KEY); return v!=null?String(v):""; }
function setAgentName(v){ lsSet(E_AGENT_KEY,String(v||"")); renderFillsSoon(); }
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
// The other field that fills the cards: re-rendered on the same pause, so the value
// appears in every card as it is typed rather than only when one is copied.
function wirePaxFill(){
  pax.oninput=()=>{
    renderFillsSoon();
    scheduleTabSave();
  };
}

// ---- asked for when the first signed reply is copied ------------------------------
const E_NAME_ASKED="eNameAsked";
const E_SIGN_RE=/\x7b(?:AGENT|INIT)\x7d/;
/* ASKED AT THE MOMENT IT IS NEEDED: the first copy of a reply that signs with the name, never at
   boot, when nothing on screen has shown what a name is for. Once for good: Later is an answer and
   the reply then copies with the gap a missing token always leaves. */
function wantsAgentName(raw){
  return E_SIGN_RE.test(String(raw||"")) && !agentName() && lsGet(E_NAME_ASKED)!=="1";
}
/** Runs `go` now, or once the question is answered. Escape answers nothing and copies nothing,
 *  so the click can simply be made again. */
function withAgentName(raw,go){
  if(/\x7bROLE\x7d/.test(String(raw||"")) && document.body.classList.contains("role-waits")){
    document.body.classList.remove("role-waits");
    lsSet("eRoleSeen","1");
    toast(t("Beside the customer's name there is now a wheel: it chooses who in the team this reply names."),TOAST_HAND_MS);
  }
  if(!wantsAgentName(raw) || document.getElementById("eAgentModal")){ go(); return; }
  askAgentName(raw,go);
}
/* THE ROLE WHEEL WAITS FOR ITS FIRST REPLY on the sample: beside the name it is a control nobody has
   been told about, so it is out of sight until a reply naming somebody of the team is copied, and
   withAgentName brings it out then with one line. A team's desk has it from the start. */
function syncRoleWheel(){
  document.body.classList.toggle("role-waits", nsGet("Sample")==="1" && lsGet("eRoleSeen")!=="1");
}
/* THE PREVIEW IS THE REPLY'S OWN SIGNING LINE, filled as the name is typed: the sentence holding
   the token, or, where the token stands alone on its line, the line above it as well. */
function signLines(raw){
  const lines=String(raw||"").split("\n");
  const i=lines.findIndex(l=>E_SIGN_RE.test(l));
  if(i<0) return [];
  const line=lines[i].trim();
  if(line.replace(/\/?\x7b(?:AGENT|INIT)\x7d/g,"").trim().length<3)
    return (i>0 && lines[i-1].trim()) ? [lines[i-1].trim(),line] : [line];
  return [line.split(/(?<=[.?!])\s+/).find(x=>E_SIGN_RE.test(x))||line];
}
/** Small modal of its own rather than the shared one, the same trick the catalog offer uses,
 *  so it can stand over whatever is already on screen without destroying it. */
function askAgentName(raw,then){
  if(document.getElementById("eAgentModal")) return;
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id="eAgentModal";
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'
    +'<h2>How should your replies be signed?</h2>'
    +'<p class="modal-sub">Customers see it at the foot of every reply. It can be changed at any time in Settings.</p>'
    +'<div class="mf"><input id="eAgentInp" autocomplete="off" spellcheck="false" placeholder="for instance, Kate"></div>'
    +'<p class="e-greet" id="eAgentPrev" data-i18n-skip></p>'
    +'<div class="modal-actions">'
    +'<button type="button" class="btn" id="eAgentNo">Later</button>'
    +'<button type="button" class="btn primary" id="eAgentYes">Sign with this</button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  /* Appended straight to <body>, so the chrome roots never see it - swept here instead, at the
     one moment it exists, and before the preview is drawn: the preview is a card's words and
     follows the CARD language, not the interface's. */
  translateTree(wrap);
  const inp=wrap.querySelector("#eAgentInp");
  const prev=wrap.querySelector("#eAgentPrev");
  const shown=signLines(raw);
  const sync=()=>{
    const typed=inp.value.trim();
    const who=typed ? esc(typed) : '<span class="e-name-ph">'+esc(t("Kate"))+'</span>';
    const init=esc(agentParts(typed||t("Kate")).init);
    if(!shown.length){
      const parts=greetLine("{NAME}",lang).split("{NAME}");
      prev.innerHTML=esc(parts[0])+who+esc(parts[1]||"");
      return;
    }
    prev.innerHTML=shown.map(l=>esc(l).split("{AGENT}").join(who).split("{INIT}").join(init)).join("<br>");
  };
  const close=()=>{ document.removeEventListener("keydown", onKey, true); wrap.remove(); };
  const save=()=>{ setAgentName(inp.value.trim()); lsSet(E_NAME_ASKED,"1"); close(); if(then) then(); };
  const later=()=>{ lsSet(E_NAME_ASKED,"1"); close(); if(then) then(); };
  /* A DIALOG OPENED OVER THIS ONE OWNS THE KEYBOARD. This handler captures, so without the
     guard an Escape aimed at the Library above would close this instead and leave the Library
     standing - which is what a stacked modal's Escape always costs if it does not stand down. */
  function onKey(e){
    const shared=document.getElementById("modal");
    if(document.getElementById("eCatalogModal") || (shared && !shared.hidden)) return;
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); if(inp.value.trim()) save(); else later(); }
  }
  document.addEventListener("keydown", onKey, true);
  inp.oninput=sync;
  sync();
  wrap.querySelector("#eAgentYes").onclick=save;
  wrap.querySelector("#eAgentNo").onclick=later;
  try{ inp.focus(); }catch(e){}
}

export {
  wirePaxFill,
  agentParts,
  agentName,
  setAgentName,
  renderFillsSoon,
  askAgentName,
  wantsAgentName,
  withAgentName,
  syncRoleWheel,
};
