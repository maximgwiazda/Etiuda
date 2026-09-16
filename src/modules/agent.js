import { lsSet, lsGet, ssSet, ssGet } from "./storage.js";
import { pax } from "./dom.js";
import { t, translateTree } from "./ui-lang.js";
import { esc } from "./esc.js";
import { greetLine } from "./greeting.js";
import { lang, wholeThingEmpty } from "./app-state.js";
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

// ---- the first run asks for it ---------------------------------------------------
/* The sample in the preview before a letter is typed, greyed, so the line never sits empty.
   One name for both languages: it stands for a shape, not for a person. */
const E_NAME_SAMPLE="Anna";
const E_NAME_ASKED="eNameAsked";
/* ONCE PER SITTING as well as once for good, and the session key is written when the question
   goes UP rather than when it is answered: accepting a catalog, ejecting one and clearing local
   memory all end in a reload, and a question re-asked three times in five minutes is a nag
   whatever its words are. Escape still leaves the permanent key alone, so a stray press only
   postpones it to the next launch. */
const E_NAME_SEEN="eNameSeen";
/* ASKED ONCE, AND ONLY WHERE IT MEANS ANYTHING. NOT OVER AN EMPTY DESK: the name is what a card
   greets somebody with, so with no cards there is nothing for it to do and the screen's own
   question - which catalog - is the one worth answering first. Nor over another dialog: leaving
   the key unwritten is what makes the next launch ask rather than dropping the question. */
function maybeAskAgentName(){
  if(lsGet(E_NAME_ASKED)==="1") return false;
  if(ssGet(E_NAME_SEEN)) return false;
  if(agentName()){ lsSet(E_NAME_ASKED,"1"); return false; }
  if(wholeThingEmpty()) return false;
  if(document.getElementById("eCatalogModal")) return false;
  const invite=document.getElementById("tourInvite");
  if(invite && !invite.hidden) return false;
  const modal=document.getElementById("modal");
  if(modal && !modal.hidden) return false;
  askAgentName();
  return true;
}
/** Small modal of its own rather than the shared one, the same trick the catalog offer uses,
 *  so it can stand over whatever is already on screen without destroying it. */
function askAgentName(){
  if(document.getElementById("eAgentModal")) return;
  ssSet(E_NAME_SEEN,"1");
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id="eAgentModal";
  /* NO LINE UNDER THE TITLE. The preview below the field IS what the name does, so a sentence
     saying it would describe what the screen is already showing. */
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'
    +'<h2>'+esc(t("Your name"))+'</h2>'
    +'<div class="mf"><input id="eAgentInp" autocomplete="off" spellcheck="false" placeholder="first name"></div>'
    +'<p class="e-greet" id="eAgentPrev" data-i18n-skip></p>'
    +'<div class="modal-actions">'
    +'<button type="button" class="btn" id="eAgentNo">Later</button>'
    +'<button type="button" class="btn primary" id="eAgentYes">Save</button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  /* Appended straight to <body>, so the chrome roots never see it - swept here instead, at the
     one moment it exists, and before the preview is drawn: the preview is a card's words and
     follows the CARD language, not the interface's. */
  translateTree(wrap);
  const inp=wrap.querySelector("#eAgentInp");
  const prev=wrap.querySelector("#eAgentPrev");
  const sync=()=>{
    const typed=inp.value.trim();
    const parts=greetLine("{NAME}",lang).split("{NAME}");
    prev.innerHTML=esc(parts[0])
      +(typed ? esc(typed) : '<span class="e-name-ph">'+esc(E_NAME_SAMPLE)+'</span>')
      +esc(parts[1]||"");
  };
  /* Escape closes WITHOUT recording the ask, so a stray keypress cannot permanently retire the
     question; Later records it, because that is somebody answering. The same split the catalog
     offer makes between its Escape and its Start empty. */
  /* Whichever way this closes, the tour's invite takes its turn - it was held back while this
     was open, and it is the last of the three first-run questions. */
  const close=()=>{ document.removeEventListener("keydown", onKey, true); wrap.remove();
                    hooks.maybeShowTourInvite(); };
  const save=()=>{ setAgentName(inp.value.trim()); lsSet(E_NAME_ASKED,"1"); close(); };
  /* A DIALOG OPENED OVER THIS ONE OWNS THE KEYBOARD. This handler captures, so without the
     guard an Escape aimed at the Library above would close this instead and leave the Library
     standing - which is what a stacked modal's Escape always costs if it does not stand down. */
  function onKey(e){
    const shared=document.getElementById("modal");
    if(document.getElementById("eCatalogModal") || (shared && !shared.hidden)) return;
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); save(); }
  }
  document.addEventListener("keydown", onKey, true);
  inp.oninput=sync;
  sync();
  wrap.querySelector("#eAgentYes").onclick=save;
  wrap.querySelector("#eAgentNo").onclick=()=>{ lsSet(E_NAME_ASKED,"1"); close(); };
  try{ inp.focus(); }catch(e){}
}

export {
  wirePaxFill,
  agentParts,
  agentName,
  setAgentName,
  renderFillsSoon,
  askAgentName,
  maybeAskAgentName,
};
