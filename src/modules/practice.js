/* The practice customer, and the desk's first afternoon around her: a customer of the sample shop
   writes into a chat panel at the desk's lower right, and the person answers her the way the work
   is done, a word, a click, a paste. The same panel is the whole of the practice page a website
   frames (ePractice), which starts her at once and tells its parent what happened. */
import { t, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { lang, intentIdxs } from "./app-state.js";
import { findCard } from "./card-model.js";
import { intentIdAt } from "./intent-id.js";
import { lastCopy } from "./mark.js";
import { pax, intentEl } from "./dom.js";
import { lsGet, lsSet, nsGet } from "./storage.js";
import { ePractice } from "./env.js";
import { eHost } from "./host.js";
import { hooks } from "./hooks.js";
import { greeting } from "./greeting.js";
import { addTab } from "./tabs.js";
import { foldDiacritics } from "./words.js";
import { ICON_X } from "./icons.js";
import { applyTheme } from "./theme.js";
import { storedCatalog } from "./catalog.js";
import { OWN_ID } from "./card-carry.js";

/* THE SCRIPT, written against the shipped sample's own ids, in the languages it speaks. A reply
   fits when the card it was copied from stands on the step's shelf or answers its request. Each
   word was driven on the sample: typed, Enter, and the first reply is one the step accepts. */
const PRACTICE_WHO={ pl:"Agnieszka W.", en:"Hannah R." };
const PRACTICE_STEPS=[
  { says:[{ pl:"Dzień dobry, piszę w sprawie kubka, który przyszedł w piątek.",
            en:"Hello, I'm writing about a mug that arrived on Friday." }],
    word:{ pl:"powitanie", en:"hello" }, shelf:"t-opening",
    coach:"She has said hello. Type {WORD} at the top, press Enter, click the first reply and paste it into the message box." },
  { says:[{ pl:"Miło mi.", en:"Nice to meet you." },
          { pl:"Jest śliczny, w kolorze mirabelki, ale przy moich talerzach wygląda jak z innej bajki. Mogę go jeszcze oddać?",
            en:"It's lovely, that mirabelle yellow, but next to my plates it looks as if it wandered in from another kitchen. Can I still send it back?" }],
    word:{ pl:"zwrot", en:"return" }, request:"t-return-an-item",
    coach:"Now a return. This time the word is {WORD}, and the rest as before." },
  { says:[{ pl:"Dziękuję, to bardzo miłe. W takim razie czekam na etykietę i to już wszystko.",
            en:"Thank you, that's kind. I'll look out for the label, and that's everything." }],
    word:{ pl:"pożegnanie", en:"thanks" }, shelf:"t-closing",
    coach:"And to close, a thank-you. The word is {WORD}." }
];
const PRACTICE_LAST={ pl:"Wzajemnie, do usłyszenia.", en:"And to you. Goodbye." };
const TYPING_MS=900, IDLE_MS=25000;

let P=null;          // the running practice: {step, lang, busy, idle, nudged}
const say=o=>o[P&&P.lang]||o.en;
function scriptLang(){ return PRACTICE_WHO[lang] ? lang : "en"; }
function tell(event,extra){
  if(!ePractice()) return;
  try{ if(window.parent && window.parent!==window)
    window.parent.postMessage(Object.assign({ source:"etiuda-practice", event:event }, extra||{}), "*"); }catch(e){}
}
const norm=s=>String(s||"").replace(/\s+/g," ").trim();
const panel=()=>document.getElementById("eCustomer");

function practiceRunning(){ return !!P; }
/* THE CONVERSATION GETS A TAB OF ITS OWN unless the one in front is empty, as a new chat does. */
function startPractice(){
  if(P) endPracticePanel();
  if((pax && pax.value.trim()) || (intentEl && intentEl.value.trim()) || intentIdxs.length) addTab();
  P={ step:0, lang:scriptLang(), busy:false, idle:0, nudged:false, typed:0 };
  buildPanel();
  tell("ready");
  nextStep(0,true);
}
function buildPanel(){
  const el=document.createElement("div");
  el.id="eCustomer";
  el.setAttribute("role","complementary");
  el.setAttribute("aria-label",PRACTICE_WHO[P.lang]);
  el.innerHTML='<div class="e-cust-head"><b class="e-cust-who" data-i18n-skip>'+esc(PRACTICE_WHO[P.lang])+'</b>'
    +'<button type="button" class="modal-x" id="eCustX" title="'+esc(t("End the practice"))+'">'+ICON_X+'</button></div>'
    +'<div class="e-cust-log" id="eCustLog" aria-live="polite" data-i18n-skip></div>'
    +'<p class="e-cust-coach" id="eCustCoach" role="status"></p>'
    +'<div class="e-cust-box" id="eCustBox"><textarea id="eCustInp" rows="3" spellcheck="false"'
    +' aria-label="'+esc(t("Message"))+'"></textarea>'
    +'<button type="button" class="btn" id="eCustSend">'+esc(t("Send"))+'</button></div>';
  document.body.appendChild(el);
  el.querySelector("#eCustX").onclick=()=>closePractice();
  el.querySelector("#eCustSend").onclick=send;
  const inp=el.querySelector("#eCustInp");
  inp.addEventListener("keydown",e=>{
    if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); e.stopPropagation(); send(); }
  });
  /* The desk's own keys stop at the chat box: a letter typed here is a message, not a search. */
  inp.addEventListener("keydown",e=>e.stopPropagation());
  /* A PASTE SENDS: the first minute is a word, a click and a paste, and a Send after it would be a
     fourth move nobody was told about. Words typed by hand still wait for Enter or Send. */
  inp.addEventListener("paste",()=>setTimeout(send,0));
}
function logLine(text,mine){
  const log=document.getElementById("eCustLog");
  if(!log) return null;
  const m=document.createElement("div");
  m.className="e-msg"+(mine?" mine":"");
  m.textContent=text;
  log.appendChild(m);
  log.scrollTop=log.scrollHeight;
  return m;
}
/* SHE TYPES BEFORE SHE SPEAKS, each line of the step after a moment's dots, and only then does
   the coach say what to do: a hint beside a message nobody has read yet is a hint too early. */
function herLines(lines,done){
  P.busy=true;
  const log=document.getElementById("eCustLog");
  let i=0;
  const next=()=>{
    if(!P) return;
    if(i>=lines.length){ P.busy=false; done(); return; }
    const dots=document.createElement("div");
    dots.className="e-msg e-typing"; dots.setAttribute("aria-hidden","true");
    dots.innerHTML="<i></i><i></i><i></i>";
    if(log){ log.appendChild(dots); log.scrollTop=log.scrollHeight; }
    setTimeout(()=>{ dots.remove(); if(!P) return; logLine(say(lines[i++]),false); next(); },TYPING_MS);
  };
  next();
}
function coach(key){
  const el=document.getElementById("eCustCoach");
  if(!el||!P) return;
  const w=say(PRACTICE_STEPS[Math.min(P.step,PRACTICE_STEPS.length-1)].word);
  /* THE WORD IS DRAWN AS A KEY, the way the site shows it, so neither language needs a quotation
     mark round it and none a keyboard cannot type is ever wanted. */
  el.innerHTML=t(key).split("{WORD}").map(esc).join('<kbd class="e-word">'+esc(w)+'</kbd>');
}
function wantsName(){
  const first=foldDiacritics(PRACTICE_WHO[P.lang].split(" ")[0]).toLowerCase();
  return P.step===0 && !(pax && foldDiacritics(pax.value).toLowerCase().indexOf(first)>-1);
}
function stepCoach(){
  if(!P) return;
  coach(wantsName() ? "First, her name. Copy it from the chat into the customer's name box." : PRACTICE_STEPS[P.step].coach);
}
function armIdle(){
  clearTimeout(P.idle);
  P.idle=setTimeout(()=>{ if(P && !P.nudged && !P.busy){ P.nudged=true; coach("The word {WORD} at the top is all it takes."); } },IDLE_MS);
}
function nextStep(i,first){
  P.step=i; P.nudged=false;
  const st=PRACTICE_STEPS[i];
  herLines(st.says,()=>{
    tell("step",{ step:i+1, of:PRACTICE_STEPS.length });
    stepCoach();
    armIdle();
    if(first){ const b=document.getElementById("eCustInp"); if(b) b.value=""; }
  });
}
/* WHAT WAS PASTED, JUDGED BY WHERE IT CAME FROM: the last copy is asked whether it is this text,
   and its card whether it answers the step. Typed words are not judged, only answered. */
function fits(card,st){
  if(!card) return false;
  if(st.shelf) return card.c===st.shelf;
  const want="t:"+st.request;
  return (card.intents||[]).some(x=>String(x)===want || (/^[0-9]+$/.test(String(x)) && intentIdAt(+x)===want));
}
function send(){
  if(!P || P.busy) return;
  const inp=document.getElementById("eCustInp");
  const text=inp ? inp.value.trim() : "";
  if(!text) return;
  inp.value="";
  logLine(text,true);
  const st=PRACTICE_STEPS[P.step];
  const got=lastCopy();
  if(!got || norm(got.text)!==norm(text) || !got.id){
    tell("miss",{ step:P.step+1, of:PRACTICE_STEPS.length });
    coach("That works too, but the reply is already written, greeting and signature included: the word {WORD} and a click bring it.");
    return;
  }
  if(!fits(findCard(got.id),st)){
    tell("miss",{ step:P.step+1, of:PRACTICE_STEPS.length });
    coach("That reply answers something else. The word {WORD} finds the right one.");
    return;
  }
  tell("reply",{ step:P.step+1, of:PRACTICE_STEPS.length });
  clearTimeout(P.idle);
  const el=document.getElementById("eCustCoach");
  if(el) el.textContent="";
  /* The chat moves on, so the word typed for this answer goes; a chosen intent stays, because the
     closing reply names the matter through it. */
  try{ hooks.clearSearchQuery(); }catch(e){}
  if(P.step+1<PRACTICE_STEPS.length){ nextStep(P.step+1,false); return; }
  herLines([PRACTICE_LAST],showEnd);
}
function showEnd(){
  const box=document.getElementById("eCustBox"), el=document.getElementById("eCustCoach");
  if(box) box.hidden=true;
  if(el) el.textContent="";
  const p=panel();
  if(!p) return;
  const end=document.createElement("div");
  end.className="e-cust-end";
  end.innerHTML='<h3>'+esc(t("That is all it is."))+'</h3>'
    +'<p>'+esc(t("One word, one click, one paste. The greeting for the hour, her name and your signature were Etiuda's part."))+'</p>'
    +'<div class="modal-actions e-cust-acts"><button type="button" class="btn" id="eCustAgain">'+esc(t("Once more"))+'</button>'
    +(ePractice()?'':'<button type="button" class="btn primary" id="eCustNext">'+esc(t("Next"))+'</button>')+'</div>';
  p.appendChild(end);
  const log=document.getElementById("eCustLog");
  if(log) log.scrollTop=log.scrollHeight;
  end.querySelector("#eCustAgain").onclick=()=>startPractice();
  const nx=end.querySelector("#eCustNext");
  if(nx){ nx.onclick=()=>closePractice(); try{ nx.focus(); }catch(e){} }
  lsSet(E_PRACTICE_DONE,"1");
  tell("done");
}
function endPracticePanel(){
  if(P) clearTimeout(P.idle);
  P=null;
  const p=panel();
  if(p) p.remove();
}
/* Closing it ends the practice wherever it stands, and a desk's first afternoon moves on to the
   question about the person's own replies. */
function closePractice(){
  endPracticePanel();
  if(!ePractice()) askOwnReplies();
}

// ---- the first afternoon on the desk ----------------------------------------------------------
const E_HELLO_DONE="eHelloDone", E_OWN_ASKED="eOwnAsked", E_PRACTICE_DONE="ePracticeDone";
/* ONLY WHERE THE FIRST RUN TOOK THE SAMPLE UP: a desk with a catalog of its own already knows what
   it is for. A host only, since the sample arrives in a folder only there. */
function firstAfternoonDue(){
  return !!eHost() && !ePractice() && nsGet("Sample")==="1" && lsGet(E_HELLO_DONE)!=="1";
}
function firstAfternoonOpen(){
  return !!(document.getElementById("eHello") || document.getElementById("eOwnAsk") || panel()
    || document.getElementById("eOwnImport") || document.getElementById("eOwnDone"));
}
function smallDialog(id,html,wire){
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id=id;
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'+html+'</div>';
  document.body.appendChild(wrap);
  const close=()=>{ document.removeEventListener("keydown",onKey,true); wrap.remove(); };
  function onKey(e){ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); } }
  document.addEventListener("keydown",onKey,true);
  wire(wrap,close);
  const yes=wrap.querySelector(".btn.primary");
  if(yes) try{ yes.focus(); }catch(e){}
}
function sayHello(){
  if(document.getElementById("eHello")) return;
  const L=uiLang();
  smallDialog("eHello",
    '<h2>'+esc(t("{GREET}. Etiuda is ready.").split("{GREET}").join(greeting(L)))+'</h2>'
    +'<p class="modal-sub">'+esc(t("To begin with, it works for a sample shop, Mirabelka, a pottery studio in Warsaw. A customer is about to write, and answering her takes a few seconds."))+'</p>'
    +'<div class="modal-actions"><button type="button" class="btn" id="eHelloSkip">'+esc(t("Straight to work"))+'</button>'
    +'<button type="button" class="btn primary" id="eHelloGo">'+esc(t("Begin"))+'</button></div>',
    (w,close)=>{
      w.querySelector("#eHelloGo").onclick=()=>{ lsSet(E_HELLO_DONE,"1"); close(); startPractice(); };
      w.querySelector("#eHelloSkip").onclick=()=>{ lsSet(E_HELLO_DONE,"1"); close(); askOwnReplies(); };
    });
}
/* Asked once, after the practice or in its place. Later leaves it in the Menu, which says so. */
function askOwnReplies(){
  if(lsGet(E_OWN_ASKED)==="1" || document.getElementById("eOwnAsk")){ try{ hooks.maybeShowTourInvite(); }catch(e){} return; }
  smallDialog("eOwnAsk",
    '<h2>'+esc(t("Do you already keep your replies somewhere?"))+'</h2>'
    +'<p class="modal-sub">'+esc(t("In Word, a spreadsheet, a notes file: they can come in here in a minute, and be in use straight away."))+'</p>'
    +'<div class="modal-actions"><button type="button" class="btn" id="eOwnLater">'+esc(t("Later"))+'</button>'
    +'<button type="button" class="btn primary" id="eOwnYes">'+esc(t("Yes, I have them"))+'</button></div>'
    +'<p class="modal-sub e-own-where">'+esc(t("It waits in the Menu afterwards: {PLACE}.").split("{PLACE}").join(t("Bring in your replies")))+'</p>',
    (w,close)=>{
      w.querySelector("#eOwnYes").onclick=()=>{ lsSet(E_OWN_ASKED,"1"); close(); hooks.openOwnImport(); };
      w.querySelector("#eOwnLater").onclick=()=>{ lsSet(E_OWN_ASKED,"1"); close(); try{ hooks.maybeShowTourInvite(); }catch(e){} };
    });
}
/* Boot's one call. The practice page starts its customer at once; a desk on its first afternoon
   greets first, after the frame the catalog offer and the save notices take. */
/* THE ROLE WHEEL WAITS FOR ITS FIRST REPLY on the sample and on a person's own replies: beside the
   name it is a word nobody has been told about, so it is out of sight until a reply naming somebody
   of the team is copied, and withAgentName brings it out then with one line. A team's desk has it
   from the start, as it always did. */
function syncRoleWheel(){
  const held=storedCatalog();
  const first=ePractice() || nsGet("Sample")==="1" || !!(held && held.id===OWN_ID);
  document.body.classList.toggle("role-waits", first && lsGet("eRoleSeen")!=="1");
}
function wirePractice(){
  syncRoleWheel();
  /* The coach follows the fields it talks about: a name in the customer's box moves it on, and a
     word typed at the top puts the idle nudge back. */
  addEventListener("input",e=>{
    if(!P) return;
    if(pax && e.target===pax && P.step===0) stepCoach();
    else if(intentEl && e.target===intentEl) armIdle();
  },true);
  if(ePractice()){
    const own=document.getElementById("menuOwn");
    if(own) own.hidden=true;
    window.addEventListener("message",e=>{
      if(e.source!==window.parent || !e.data || e.data.source!=="etiuda-site") return;
      if(e.data.cmd==="restart") startPractice();
      else if(e.data.cmd==="theme" && (e.data.theme==="light"||e.data.theme==="dark")){
        lsSet("eTheme",e.data.theme); applyTheme();
      }
    });
    setTimeout(startPractice,1500);
    return;
  }
  if(firstAfternoonDue() && !document.getElementById("eCatalogModal")) setTimeout(()=>{
    if(!firstAfternoonOpen() && !document.getElementById("eCatalogModal")) sayHello();
  },600);
}

export {
  PRACTICE_STEPS,
  syncRoleWheel,
  practiceRunning,
  startPractice,
  closePractice,
  askOwnReplies,
  firstAfternoonDue,
  firstAfternoonOpen,
  wirePractice
};
