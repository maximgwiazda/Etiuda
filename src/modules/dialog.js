/* The window every dialog is drawn inside: the fold families, the opener and its chrome, the
   pass that fades a cut line, and the navigation an editor carries. */
import { markCutText } from "./cut-text.js";
import { ICON_CHEVRON_R, ICON_X } from "./icons.js";
import { mgOpen } from "./app-state.js";
import { animateModalHeightFrom, animatePinnedHeight, cutLeaves, dismissNode, mgAccordion, mgPinCard, mgReduceMotion, E_EASE, M_MS } from "./motion.js";
import { lsGet, lsSet, lsDel } from "./storage.js";
import { formatActionChord } from "./shortcuts.js";
import { scStopCapture } from "./shortcuts-list.js";
import { offerUndo, t, tc, translateTree } from "./ui-lang.js";
import { esc } from "./esc.js";
import { modalEl, modalCard, $, focusKey, sameControl } from "./dom.js";

function modalOpen(){ return !modalEl.hidden; }
/* ---- SHARED MODAL BEHAVIOUR ---------------------------------------------------------------
   One implementation per behaviour, reused by every dialog. The height animator is the case
   in point: it operates on modalCard and nothing else, so it lives here rather than among
   any one dialog's code wearing its prefix. */
/* Which sections are open, by id. A Set like the Library's mgOpen, for the same reason: the
   state belongs to the user's session, not to the markup that gets rebuilt under it.
   Settings holds at most one - mgAccordion shuts the rest. */
/* Personal leads: it carries the interface language, which is the reason most people open
   Settings the first time and the only setting whose effect is visible as it changes. */
const accOpen=new Set(["personal"]);
/* Native disclosure, like Manage's sections and the editors' folds: the keyboard handling and
   the expanded state come from the element. `bodyHtml` is TRUSTED markup, the rest escaped. */
function accHtml(id,title,bodyHtml,note,tip){
  return '<details class="acc" data-acc="'+esc(id)+'"'+(accOpen.has(id)?" open":"")+'>'+
    '<summary'+(tip?' title="'+esc(tip)+'"':'')+'>'+
      '<span class="acc-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span>'+
      '<span class="acc-title">'+esc(title)+'</span>'+
      (note?'<span class="acc-note">'+esc(note)+'</span>':'')+
    '</summary>'+
    '<div class="acc-body">'+bodyHtml+'</div>'+
  '</details>';
}
/* ---- ONE COLLAPSIBLE SECTION FOR FORM DIALOGS ----------------------------------------------
   Anything that opens a form dialog calls this rather than writing the markup again: the
   marker, the summary and the aria wiring arrive together or not at all.
   `body` and `sum` are TRUSTED markup - callers esc() what they put in a summary. `label`
   is plain ENGLISH and must stay that way: translateTree remembers each node's English
   source and t() has no reverse lookup, so a label baked through t() at build time is
   stuck in whatever language the dialog was opened in. (Said WITHOUT the literal call:
   i18n-scan reads translator calls straight out of the file and cannot tell a comment from
   code, so a quoted example in prose becomes a phantom missing translation.) */
function mfSec(o){
  return '<details class="mf mf-fold'+(o.cls?" "+o.cls:"")+'" data-fold="'+esc(o.key)+'"'+
      (o.open?" open":"")+'><summary>'+
      '<span class="acc-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span>'+
      '<span class="mf-lab">'+esc(o.label)+'</span>'+
      (o.sum==null ? "" :
        '<span class="mf-sum"'+(o.sumId?' id="'+esc(o.sumId)+'"':"")+
        (o.sumSkip?' data-i18n-skip':"")+'>'+o.sum+'</span>')+
    '</summary>'+o.body+'</details>';
}
/* ---- A CATEGORY IN THE LIBRARY'S TREE OPENS. Plain rows rather than a disclosure - see the
   note by .mg-cat - and no accordion either: a tree is reorganised rather than read, so
   several categories standing open at once is the point. */
function catToggle(el, key){
  if(!el) return;
  const open=!mgOpen.has(key);
  if(open) mgOpen.add(key); else mgOpen.delete(key);
  modalResize(()=>{
    el.classList.toggle("is-open", open);
    const body=el.querySelector(".mg-cat-body");
    if(body) body.hidden=!open;
    const btn=el.querySelector("[aria-expanded]");
    if(btn){
      btn.setAttribute("aria-expanded", open?"true":"false");
      btn.title=t(open?"Collapse":"Expand");
    }
  });
}
/** ONE PASS, as Manage does it. A two-phase version - the outgoing section folding away
 *  before the incoming one opened - was tried and judged more tiring to watch than the single
 *  movement; the twisty rotating on both rows carries the change instead. Do not re-propose
 *  the bounce. */
/* ONE WIRING FOR EVERY FOLD FAMILY - Settings' .acc, the editors' .mf-fold, Manage's sections.
   The summary records the height on the way in, because `toggle` fires after the flip: pointerdown,
   and keydown because Enter and Space on a summary never fire pointerdown. Observing, not
   intercepting - the disclosure, its keys and its aria stay native. `before` runs on every toggle,
   sibling-shut included, so an open-set stays true; `after` only for the fold the user turned. A
   programmatic open, with no press before it, animates nothing, which is right. */
function wireFolds(scope, sel, accSel, before, after){
  scope.querySelectorAll(sel).forEach(d=>{
    const sum=d.querySelector("summary");
    if(sum){
      sum.addEventListener("pointerdown",mgPinCard);
      sum.addEventListener("keydown",e=>{
        if(e.key==="Enter"||e.key===" "||e.key==="Spacebar") mgPinCard();
      });
    }
    d.addEventListener("toggle",()=>{
      if(before) before(d);
      if(d._accordion) return;                 // shut by its sibling opening; that one animates
      mgAccordion(d,accSel,scope);
      animatePinnedHeight();
      if(after) after(d);
    });
  });
}
function wireAcc(root, onToggle){
  wireFolds(root,"details.acc","details.acc",
    d=>{ const k=d.getAttribute("data-acc"); if(d.open) accOpen.add(k); else accOpen.delete(k); },
    onToggle ? d=>onToggle(d.getAttribute("data-acc"), d.open) : null);
}
/* ---- ONE OPENER FOR EVERY DIALOG. The WINDOW was always shared; what each dialog
   repeated was the four lines that OPEN it, and anything added to the opening sequence
   had to be added four times - the fourth gets forgotten. Focus handling, a modifier
   class, an aria hook all land in one place. Not a base class, deliberately: dialogs
   differ in exactly what they contain and wire, and a class would grow to fit Manage,
   leaving the others carrying hooks they never use. Behaviour is shared by calling one
   function; structure by passing arguments. */
/* WHAT THIS DIALOG IS EDITING, as a function rather than a string: Save keeps the screen
   open, so the heading has to be able to re-read a name the user has just changed. */
let modalNameFn=null;
function setDialogName(name){
  const h=modalCard&&modalCard.querySelector("h2");
  if(!h) return;
  const old=h.querySelector(".modal-name");
  if(old) old.remove();
  if(!name) return;
  const sp=document.createElement("span");
  sp.className="modal-name"; sp.textContent=name;
  h.insertBefore(sp, h.querySelector(".modal-nav")||h.querySelector("#modalX")||null);
}
function refreshDialogName(){ if(modalNameFn) setDialogName(modalNameFn()||""); }
/* RESET IS ALWAYS ON THE ROW, and answers a question that changes while the dialog is open:
   Save can give it something to discard. Rendering it only when there was something meant it
   appeared out of nowhere, and not until the next open, since Save does not rebuild the
   actions. The tooltip changes with the state, because "why is this off" has two answers. */
let modalResetFn=null, modalResetOn="", modalResetOff="";
function refreshDialogReset(){
  const b=modalCard&&modalCard.querySelector(".mf-reset");
  if(!b||!modalResetFn) return;
  const live=!!modalResetFn();
  b.disabled=!live || edGone;
  b.title=t(live?modalResetOn:modalResetOff);
}
/** Both halves of a heading that has to keep up with its own screen. */
/* After the editor's own Save the entry is what it wrote, so a line about a change underneath has said its piece. */
function refreshDialogChrome(){
  refreshDialogName(); refreshDialogReset();
  if(edSubject && !edGone){
    edSubjectSig=edSubjectNow();
    const n=modalCard.querySelector(":scope > .modal-note");
    if(n) n.remove();
  }
}
function openDialog(cfg){
  if(!modalEl||!modalCard) return;
  const leaving=edBeforeOpen(cfg);
  /* Null outside an editor. Written in place: this function is sliced out and run on its own. */
  edBaseline=null; edReturn=null;
  cutLeaves();
  /* WHERE THE KEYBOARD CAME FROM. Closing wipes the card, so whatever had focus goes with it
     and the next Tab starts from the top of the document. A dialog opened over another keeps
     the first opener: the screen underneath is about to be rebuilt. */
  if(modalEl.hidden){
    let from=document.activeElement;
    /* A ROW IN A MENU IS NOT SOMEWHERE TO GO BACK TO: the menu shuts as the dialog opens, and
       focus on a hidden control is focus on nothing. The door it stood behind is still there. */
    const wrap=(from && from.closest) ? from.closest(".menu-wrap") : null;
    if(wrap) from=wrap.querySelector(":scope > button")||from;
    modalOpener=(from && from!==document.body && from!==document.documentElement) ? from : null;
    modalOpenerKey=modalOpener ? focusKey(modalOpener,document.body) : null;
    modalOpenerKbd=lastInputWasKey;
  }
  setModalBack(cfg.back||null);
  modalNameFn=(typeof cfg.name==="function")?cfg.name:(cfg.name?()=>cfg.name:null);
  modalResetFn=(typeof cfg.resettable==="function")?cfg.resettable:null;
  modalResetOn=cfg.resetOn||"";
  modalResetOff=cfg.resetOff||"";
  /* THE CARD IS RESET, not added to. Modifier classes used to be removed by closeModal() - but
     a dialog opened OVER another never passes through it, so About's type scale could follow
     you into Maintenance. Rebuilding the class list from the base makes that impossible. */
  modalCard.className="modal-card"+(cfg.cls?" "+cfg.cls:"");
  modalCard.innerHTML=
    modalHead(t(cfg.title), cfg.lead, cfg.nav, modalNameFn?(modalNameFn()||""):"")+
    (cfg.sub?'<p class="modal-sub">'+cfg.sub+'</p>':"")+
    (cfg.body||"")+
    (cfg.actions?'<div class="modal-actions">'+cfg.actions+'</div>':"");
  modalEl.hidden=false;
  if(typeof cfg.wire==="function") cfg.wire();
  refreshDialogReset();     // the button is rendered enabled; this decides what it really is
  /* The dialog is swept AFTER its wiring, so anything the wire step injected is translated too.
     Every dialog goes through this function, which is what makes one line enough. */
  translateTree(modalCard);
  dressDialogInputs(modalCard);
  markCutText(modalCard);
  edAfterOpen(cfg, leaving);
  /* THE SCREEN TAKES THE KEYBOARD: where its wiring focused nothing inside it, the card itself
     holds it, so a key reaches the dialog rather than the page it covers. A cover over it and a
     tour bubble keep theirs. */
  const at=document.activeElement;
  if(!modalCard.contains(at) && !openCover() && !(at && at.closest && at.closest("#tourCard")))
    try{ modalCard.focus({preventScroll:true}); }catch(e){}
}
/* Wraps each of a dialog's text inputs once - see .mf .field-wrap. Before anything focuses a
   field: moving a focused element drops its focus. */
function dressDialogInputs(root){
  (root||document).querySelectorAll(".mf input:not([type]),.mf input[type=text]").forEach(i=>{
    if(i.parentElement && i.parentElement.classList.contains("field-wrap")) return;
    const w=document.createElement("span"); w.className="field-wrap";
    i.parentNode.insertBefore(w,i); w.appendChild(i);
  });
}
function modalResize(mutate){
  const card=modalCard;
  if(!card){ mutate(); return; }
  const before=card.getBoundingClientRect().height;
  mutate();
  animateModalHeightFrom(before);
}
/* PREV / NEXT IN AN EDITOR. One reviewer walking a catalog should not have to close and
   reopen for every entry. The list walked is the one ON SCREEN, so a filtered or searched
   view steps through what it shows rather than through the whole catalog. */
function edNavHtml(){
  /* The shortcut is named in the tooltip: the arrows are how it is found, and an icon
     cannot say Alt. */
  const lp=t("Previous")+" \u00b7 "+formatActionChord("edPrevEntry"),
        ln=tc("editor","Next")+" \u00b7 "+formatActionChord("edNextEntry");
  return '<span class="modal-nav">'
    +'<button type="button" class="modal-x nav-up" id="edPrev" title="'+esc(lp)
    +'" aria-label="'+esc(t("Previous"))+'">'+ICON_CHEVRON_R+'</button>'
    +'<button type="button" class="modal-x nav-dn" id="edNext" title="'+esc(ln)
    +'" aria-label="'+esc(tc("editor","Next"))+'">'+ICON_CHEVRON_R+'</button></span>';
}
/* Read off the CONTROLS rather than from each editor's own fields: three editors with
   different shapes all answer "has anything been typed" the same way, and a field added
   later is covered without being registered anywhere. */
/* Null outside an editor. An editor sets it when it wires; any other dialog is not an
   edit, and must not be compared with the editor that stood here before. */
let edBaseline=null;
/* The editor's own way back, the go edWireNav already undoes through. */
let edReturn=null;
function edFormState(){
  if(!modalCard) return "";
  const out=[];
  modalCard.querySelectorAll("input,textarea,select").forEach(el=>{
    out.push((el.type==="checkbox"||el.type==="radio")?(el.checked?"1":"0"):String(el.value||""));
  });
  // segmented controls are buttons, not fields - the chosen one carries .on and its value
  modalCard.querySelectorAll(".on[data-v]").forEach(el=>out.push(String(el.dataset.v||"")));
  return out.join("\u0001");
}
function edMarkClean(){ edBaseline=edFormState(); }
/* The typing itself, to be put back: every field's value in document order, and which of the
   segmented buttons carried .on. The same entry reopens in the same shape, so order is identity. */
function edTyped(){
  if(!modalCard) return null;
  return { fields:Array.from(modalCard.querySelectorAll("input,textarea,select"))
             .map(el=>(el.type==="checkbox"||el.type==="radio")?el.checked:String(el.value||"")),
           segs:Array.from(modalCard.querySelectorAll("[data-v]")).map(el=>el.classList.contains("on")) };
}
function edRetype(was){
  if(!was || !modalCard) return;
  const segs=Array.from(modalCard.querySelectorAll("[data-v]"));
  segs.forEach((el,i)=>{ if(was.segs[i] && !el.classList.contains("on")) el.click(); });
  Array.from(modalCard.querySelectorAll("input,textarea,select")).forEach((el,i)=>{
    if(i>=was.fields.length) return;
    const v=was.fields[i];
    if(el.type==="checkbox"||el.type==="radio"){ if(el.checked!==v){ el.checked=v; el.dispatchEvent(new Event("change",{bubbles:true})); } }
    else if(String(el.value||"")!==v){ el.value=v; el.dispatchEvent(new Event("input",{bubbles:true})); }
  });
}
function edDirty(){ return edBaseline!==null && edFormState()!==edBaseline; }
/* `list` is what is on screen, `cur` the entry being edited, `go` opens a neighbour. The
   ends disable rather than wrap, so a dead arrow is how you know you are at one. */
/* NAVIGATION SAYS THE SUBJECT CHANGED, and the subject is the name. Only the name moves: the
   dialog is identical between entries, so moving the body would claim everything changed.
   .modal-body is mounted by an observer and is absent in this tick - measuring the height
   synchronously travels towards a card whose body has not arrived and is yanked back when it
   does. A microtask lands after the observer, still before paint. */
function edNavTo(run){
  const card=modalCard;
  const before=card?card.getBoundingClientRect().height:null;
  run();
  Promise.resolve().then(()=>{
    if(!mgReduceMotion()){
      const n=modalCard&&modalCard.querySelector("h2 .modal-name");
      if(n){ n.removeAttribute("data-ed"); void n.offsetWidth; n.setAttribute("data-ed","flip"); }
    }
    if(before!=null) animateModalHeightFrom(before);
  });
}
function edWireNav(list,cur,go){
  edMarkClean();
  edReturn={go:go, cur:cur};
  const i=list.indexOf(cur);
  const step=d=>{
    const j=i+d;
    if(i<0||j<0||j>=list.length) return;
    /* Leaving with changes unsaved leaves at once, and Undo goes back to them. */
    const was=edDirty() ? edTyped() : null;
    edGo(()=>go(list[j]));
    if(was) offerUndo("Moved on without saving the changes", ()=>edGo(()=>{ go(cur); edRetype(was); }));
  };
  const p=$("#edPrev"), n=$("#edNext");
  if(p){ p.disabled=(i<=0); p.onclick=()=>step(-1); }
  if(n){ n.disabled=(i<0||i>=list.length-1); n.onclick=()=>step(1); }
}
/* A LINE WITH ENDS, exactly as the entry arrows above: a dead key is how you know you are at
   one, and one axis wrapping while the other stopped would make the pair mean two things.
   Clicks the tab rather than moving the class itself, so the sweep and its direction come
   from the one handler that owns them. */
function edStepLang(dir){
  if(edRest) return false;
  const strip=modalCard&&modalCard.querySelector(".lang-tabs");
  if(!strip) return false;
  const tabs=Array.prototype.slice.call(strip.querySelectorAll("button[data-l]"));
  let i=tabs.findIndex(x=>x.classList.contains("on"));
  if(i<0) i=0;
  const j=i+dir;
  if(j<0||j>=tabs.length) return false;
  const was=document.activeElement, from=tabs[i].getAttribute("data-l"), to=tabs[j].getAttribute("data-l");
  tabs[j].click();
  edLangCaret(strip.parentNode, was, from, to);
  return true;
}
/* THE CARET CROSSES WITH THE TAB: a field in the pane just hidden cannot take a keystroke, so
   the next ones were lost. It lands in the same field of the other language (ids differ only in
   the language suffix, see langFieldId), else the pane's first field; a caret outside the panes
   stays where it is. */
function edLangCaret(scope, was, from, to){
  if(!scope) return;
  const inPane=was && was.closest && was.closest(".lang-pane");
  if(was && was!==document.body && was!==modalCard && !(inPane && inPane.parentNode===scope)) return;
  const pane=Array.prototype.slice.call(scope.querySelectorAll(".lang-pane[data-l]"))
    .filter(p=>p.parentNode===scope && p.dataset.l===to)[0];
  if(!pane) return;
  const suffix="_"+from, id=inPane && was.id && was.id.slice(-suffix.length)===suffix
    ? was.id.slice(0,-suffix.length)+"_"+to : "";
  const same=id ? document.getElementById(id) : null;
  const el=(same && pane.contains(same)) ? same : pane.querySelector("input,textarea,select,[contenteditable]");
  if(el) el.focus();
}
/** Every dialog's heading with the close control built in - one helper, so the bar
 *  cannot drift between four dialogs and a fifth gets it for nothing. The X LEAVES THIS
 *  SCREEN - for a dialog opened from another, that means back to it (see dismissModal):
 *  "close the stack" put the card editor's X on the main screen while Cancel went back
 *  to Manage - two controls meaning "never mind" landing in two different places. */
function modalHead(title, lead, nav, name){
  /* `lead` goes INSIDE the h2, before the title, so the heading's own flex row places it - the
     row is already display:flex with gap:10px and the close button on margin-left:auto, so a mark
     dropped in front needs no layout of its own. */
  /* The title is WRAPPED, not bare: loose text in a flex row is an anonymous item that
     shrinks like any other, and text-wrap:balance then splits it into two tidy halves the
     moment it does. A span can be told to refuse. */
  return '<h2 id="modalTitle">'+(lead||"")+'<span class="modal-t">'+esc(title)+'</span>'+
    (name?'<span class="modal-name">'+esc(name)+'</span>':'')+(nav||"")+
    '<button type="button" class="modal-x" id="modalX" title="Close this screen" '+
    'aria-label="Close this screen">'+ICON_X+'</button></h2>';
}
/* WHICH HAND OPENED THE DIALOG, which is what decides whether the ring comes back with the
   focus when it closes. Chromium paints a script focus() as keyboard focus whenever the last
   thing the user did was press a key, and Escape - the usual way out of a dialog - is a key. So
   a dialog opened with the mouse and dismissed with Escape left a white ring on the Menu button
   that nothing but another click would clear. Measured in Chrome 152 before the cure: the X left
   no ring, Escape left one, on both the Library and Settings. */
let lastInputWasKey=false;
function wireFocusModality(){
  addEventListener("keydown",()=>{ lastInputWasKey=true; },true);
  addEventListener("pointerdown",()=>{ lastInputWasKey=false; },true);
}
/* Delegated once, so it survives every innerHTML rebuild without being rewired. */
function wireModalX(){
  modalCard.addEventListener("click",e=>{
    if(e.target.closest && e.target.closest("#modalX")) dismissModal();
  });
}
/* Where "leave this screen" goes for the dialog on screen NOW; null means nothing
   behind it, so leaving closes the modal. Set by whichever dialog knows it was opened
   from another; cleared by every dialog as it writes itself into the card, so it cannot
   outlive its screen. Kept here rather than in each opener's closure because three
   controls consume it - the X, Escape and the backdrop - and delegated handlers cannot
   see a closure. */
let modalBack=null;
function setModalBack(fn){ modalBack=(typeof fn==="function")?fn:null; }
/** X, Escape and the backdrop all mean "never mind", so all three land where Cancel lands.
 *  Consumed on use: the parent redraws and sets its own, and a hook that survived its screen
 *  would be worse than none. */
function dismissModal(){
  /* plant:maintenance-unsaved-edit-guard */
  /* Leaving keeps the edit the way the next entry does: go back, and retype. */
  const was=edDirty()?edTyped():null;
  const ret=was?edReturn:null;
  edBaseline=null; edReturn=null;
  const back=modalBack;
  modalBack=null;
  if(back) back(); else closeModal();
  if(was && ret) offerUndo("Moved on without saving the changes", ()=>edNavTo(()=>{ ret.go(ret.cur); edRetype(was); }));
  return true;
}
/* A flex column with a scrolling middle, so the scrollbar sits beside the content it
   moves - not running past the pinned heading and actions where nothing scrolls. Wrapped
   by an observer rather than in each dialog's markup: four dialogs build their own HTML
   and Manage rebuilds on every action; the observer catches all of them, and any fifth. */
function mountModalBody(){
  if(!modalCard.firstElementChild) return;
  if(modalCard.querySelector(":scope > .modal-body")) return;
  const kids=Array.prototype.slice.call(modalCard.children);
  const head=kids.filter(k=>k.tagName==="H2")[0];
  const acts=kids.filter(k=>k.classList.contains("modal-actions"))[0];
  const middle=kids.filter(k=>k!==head && k!==acts);
  if(!middle.length) return;
  const body=document.createElement("div");
  body.className="modal-body";
  modalCard.insertBefore(body, acts||null);
  middle.forEach(k=>body.appendChild(k));
}
function wireModalBody(){
  new MutationObserver(mountModalBody).observe(modalCard,{childList:true});
}
var modalOpener=null, modalOpenerKbd=false, modalOpenerKey=null;
/* THE DIALOG'S LEAVE: what it holds moves into a copy of its frame, which fades on the dismiss tier,
   and the dialog itself closes at once as it always has. Moved rather than cloned, so what was
   typed, drawn and scrolled leaves as it stood. */
function leaveModal(){
  if(modalEl.hidden || !modalCard.firstChild || mgReduceMotion()) return;
  const g=document.createElement("div"), bg=document.createElement("div"), c=document.createElement("div");
  g.className=modalEl.classList.contains("ed-placed") ? "modal ed-placed" : "modal"; bg.className="modal-bg";
  c.className=modalCard.className; c.style.cssText=modalCard.style.cssText;
  const kept=Array.prototype.filter.call(modalCard.querySelectorAll("*"),x=>x.scrollTop>0).map(x=>[x,x.scrollTop]);
  while(modalCard.firstChild) c.appendChild(modalCard.firstChild);
  g.appendChild(bg); g.appendChild(c);
  document.body.appendChild(g);
  kept.forEach(k=>{ k[0].scrollTop=k[1]; });
  dismissNode(g);
}
function closeModal(){
  edBaseline=null; edReturn=null;
  scStopCapture();
  modalBack=null;
  if(edHeld){ leaveModal(); edRestore(); return; }
  const wasRest=edRest;
  leaveModal();
  modalEl.hidden=true;
  edPlaceKind=null; edDrag=null; edAgain=null; edRestEnd(); edUnstand();
  modalEl.classList.remove("ed-win");
  modalCard.classList.remove("about-modal","about-page","mt-modal");
  modalCard.innerHTML="";
  let back=modalOpener;
  const kbd=modalOpenerKbd, key=modalOpenerKey;
  modalOpener=null; modalOpenerKbd=false; modalOpenerKey=null;
  /* Its own screen rebuilt while the dialog stood over it: the control with the same identity stands in its place. */
  if(back && !document.contains(back) && key) back=sameControl(document.body,key);
  if(back && !wasRest && document.contains(back) && typeof back.focus==="function"){
    /* The ring belongs to the hand that would use it: kept where the dialog was opened from the
       keyboard, suppressed where it was opened by pointer. focusVisible is honoured here and
       ignored harmlessly where it is not - see wireFocusModality for what it is answering. */
    const how=kbd?{preventScroll:true}:{preventScroll:true,focusVisible:false};
    try{ back.focus(how); }catch(e){ try{ back.focus(); }catch(e2){} }
  }
}
/* ---- AN EDITOR STANDS WHERE IT WAS PUT. The card, intent and category editors drag by the whole
   title bar but its buttons. Each kind keeps its place in eEdPlace as {x,y}, the middle of its top
   edge from the window's centre, so the place still means something in a window of another size.
   Every other dialog stays centred: openDialog clears a place its config does not name. */
const ED_PLACE_KINDS=["card","intent","category"], ED_EDGE=8;
let edPlaceKind=null, edDrag=null, edDragEnd=0, edPlaced=null, edHeadDown=false;
function edPlaceNum(v){ return typeof v==="number" && isFinite(v) && Math.abs(v)<=20000; }
/* Each kind is refused on its own when malformed, and what is refused leaves the store. */
function edPlaces(){
  const raw=lsGet("eEdPlace");
  if(raw==null) return {};
  let o=null;
  try{ o=JSON.parse(raw); }catch(e){}
  const out={};
  if(o && typeof o==="object" && !Array.isArray(o)) ED_PLACE_KINDS.forEach(k=>{
    const p=o[k];
    if(p && typeof p==="object" && edPlaceNum(p.x) && edPlaceNum(p.y)) out[k]={x:Math.round(p.x), y:Math.round(p.y)};
  });
  if(JSON.stringify(out)!==raw) edPlacesWrite(out);
  return out;
}
function edPlacesWrite(all){
  const out={};
  ED_PLACE_KINDS.forEach(k=>{ if(all[k]) out[k]=all[k]; });
  if(Object.keys(out).length) lsSet("eEdPlace", JSON.stringify(out)); else lsDel("eEdPlace");
}
/* Wholly inside the window: ED_EDGE from its sides and foot, and its top ED_EDGE under the band,
   whose drag region swallows every click over it (the band's rule in the sheet). Where it fills the
   window's width it is kept centred sideways; too short, the top wins and --ed-room keeps the foot in. */
function edPlaceRect(g, x, y){
  const maxL=g.W-ED_EDGE-g.w;
  const left=(g.fill || maxL<ED_EDGE) ? (g.W-g.w)/2 : Math.min(maxL, Math.max(ED_EDGE, g.W/2+x-g.w/2));
  const top=Math.max(g.floor, Math.min(g.H-ED_EDGE-g.h, g.H/2+y));
  return {left:Math.round(left), top:Math.round(top)};
}
function edBand(){
  const row=document.querySelector("header > .row");
  const r=row && row.getBoundingClientRect ? row.getBoundingClientRect() : null;
  return r && r.bottom>0 ? r.bottom : 0;
}
/* Stands the card at (x,y), clamped, and returns the offset it took. It stays a flex item,
   top-aligned and shifted by its relative top and left, so its width is the centred card's own. */
function edStandAt(x, y, floor){
  const st=modalCard.style, band=edBand(), W=modalEl.clientWidth, H=modalEl.clientHeight;
  modalEl.classList.add("ed-placed");
  const top0=Math.max(band+ED_EDGE, floor||0);
  st.setProperty("--ed-room", Math.max(0, H-ED_EDGE-top0)+"px");
  const relT=parseFloat(st.top)||0, relL=parseFloat(st.left)||0;
  const w=modalCard.offsetWidth, cap=parseFloat(getComputedStyle(modalCard).maxWidth);
  const g={W:W, H:H, floor:top0, w:w, h:modalCard.offsetHeight, fill:cap>0 && w<cap-0.5};
  const at=edPlaceRect(g, x, y), t0=modalCard.offsetTop-relT, l0=modalCard.offsetLeft-relL;
  st.top=(at.top-t0)+"px";
  st.left=(at.left-l0)+"px";
  /* A height glide scales the card about its origin, so the origin is the point that holds still
     while the top goes to its nudged place and the foot to its new one; unnudged, the top (the sheet). */
  const was=edPlaced;
  if(was && was.h!==g.h && was.top!==at.top) st.transformOrigin="50% "+((was.top-at.top)*g.h/(g.h-was.h))+"px";
  else st.removeProperty("transform-origin");
  edPlaced={top:at.top, h:g.h};
  return {x:Math.round(at.left+g.w/2-W/2), y:Math.round(at.top-H/2)};
}
function edUnstand(){
  if(!modalEl || !modalEl.classList.contains("ed-placed")) return;
  modalEl.classList.remove("ed-placed");
  ["top","left","--ed-room","transform-origin"].forEach(k=>modalCard.style.removeProperty(k));
  edPlaced=null;
}
/* Every render asks again, so Prev, Next and the reopening after a first Save stand where the
   editor stood; so do a resize and the card's own change of size. */
function placeDialog(kind){
  const was=edPlaced;
  edPlaceKind=ED_PLACE_KINDS.indexOf(kind)>=0 ? kind : null;
  edPlaceSync();
  if(was && edPlaced) edPlaced=was;   // the glide after a re-render starts from what was painted
}
function edPlaceSync(){
  modalEl.classList.toggle("ed-win", !!(edPlaceKind && !modalEl.hidden));
  if(edDrag && edDrag.moved) return;
  if(edRest && modalEl.clientWidth<ED_REST_MIN){ edToFront(true); return; }
  const open=edPlaceKind && !modalEl.hidden, p=open ? edPlaces()[edPlaceKind] : null;
  /* Resting, it stands clear of the header: the band and the tools' row under it. */
  const floor=(open && edRest) ? edHeaderFloor() : 0;
  if(p) edStandAt(p.x, p.y, floor);
  else if(floor && modalEl.clientHeight/2-modalCard.offsetHeight/2<floor) edStandAt(0, -modalCard.offsetHeight/2, floor);
  else edUnstand();
}
function wireDialogDrag(){
  const head=e=>{
    const h=e.target && e.target.closest ? e.target.closest("h2") : null;
    return h && h.parentNode===modalCard && !e.target.closest("button,a,input,select,textarea") ? h : null;
  };
  /* The press is captured, so the double click it ends in is the card's: where it began is read here. */
  modalCard.addEventListener("pointerdown",e=>{
    edHeadDown=!!head(e);
    if(!edPlaceKind || e.button!==0 || e.pointerType==="touch" || !head(e)) return;
    edDrag={x:e.clientX, y:e.clientY, top:modalCard.offsetTop, left:modalCard.offsetLeft, moved:false, at:null};
    try{ modalCard.setPointerCapture(e.pointerId); }catch(_){}
  });
  modalCard.addEventListener("pointermove",e=>{
    const d=edDrag;
    if(!d) return;
    const dx=e.clientX-d.x, dy=e.clientY-d.y;
    if(!d.moved){ if(Math.abs(dx)+Math.abs(dy)<4) return; d.moved=true; document.documentElement.classList.add("eddrag"); }
    d.at=edStandAt(d.left+dx+modalCard.offsetWidth/2-modalEl.clientWidth/2, d.top+dy-modalEl.clientHeight/2);
  });
  const end=()=>{
    const d=edDrag;
    edDrag=null;
    if(d && d.moved) document.documentElement.classList.remove("eddrag");
    if(!d || !d.at || !edPlaceKind) return;
    edDragEnd=Date.now();
    const all=edPlaces();
    all[edPlaceKind]=d.at;
    edPlacesWrite(all);
  };
  ["pointerup","pointercancel","lostpointercapture"].forEach(k=>modalCard.addEventListener(k,end));
  /* Back to the centre, the desk's double click for how it came (All, the rail's title). A drag
     just ended is not the first half of one. */
  modalCard.addEventListener("dblclick",e=>{
    if(!edPlaceKind || !edHeadDown || Date.now()-edDragEnd<500) return;
    const all=edPlaces();
    if(!all[edPlaceKind]) return;
    delete all[edPlaceKind];
    edPlacesWrite(all);
    const t0=modalCard.offsetTop, l0=modalCard.offsetLeft;
    edUnstand();
    const dx=l0-modalCard.offsetLeft, dy=t0-modalCard.offsetTop;
    if((dx||dy) && !mgReduceMotion() && typeof modalCard.animate==="function")
      modalCard.animate([{translate:dx+"px "+dy+"px"},{translate:"0 0"}],{duration:M_MS.move, easing:E_EASE});
  });
  addEventListener("resize", edPlaceSync);
  if(typeof ResizeObserver==="function") new ResizeObserver(edPlaceSync).observe(modalCard);
}
/* ---- THE DESK IN FRONT WHILE AN EDITOR WAITS. A click on the dimmed desk, or F6, puts the desk in
   front: the scrim lifts, the editor rests where it stands, inert to the keys and live to the
   pointer, and a click on it or F6 brings it back. Below ED_REST_MIN wide the editors stay modal. */
const ED_REST_MIN=800;
let edRest=false, edEdFocus=null, edDeskFocus=null, edHeld=null, edAgain=null, edStepping=false;
function edResting(){ return edRest; }
/* A dialog the keyboard belongs to: any dialog, an editor only while it is in front. */
function modalFront(){ return !!modalEl && !modalEl.hidden && !edRest; }
function edHeaderFloor(){
  const r=document.querySelector("header > .fills"), b=r && r.getBoundingClientRect ? r.getBoundingClientRect() : null;
  return b && b.bottom>0 ? b.bottom+ED_EDGE : 0;
}
function edFocusOn(el){
  if(!el || typeof el.focus!=="function") return;
  const how=lastInputWasKey?{preventScroll:true}:{preventScroll:true,focusVisible:false};
  try{ el.focus(how); }catch(e){ try{ el.focus(); }catch(e2){} }
}
function edRestEnd(){
  if(!edRest) return;
  edRest=false;
  modalEl.classList.remove("ed-rest");
  modalCard.setAttribute("aria-modal","true");
}
function edToDesk(){
  if(edRest || !edPlaceKind || modalEl.hidden || modalEl.clientWidth<ED_REST_MIN || openCover()) return false;
  const at=document.activeElement;
  edEdFocus=(at && modalCard.contains(at) && at!==modalCard) ? at : null;
  edRest=true;
  modalEl.classList.add("ed-rest");
  modalCard.removeAttribute("aria-modal");
  edPlaceSync();
  const back=(edDeskFocus && document.contains(edDeskFocus) && edDeskFocus.getClientRects && edDeskFocus.getClientRects().length) ? edDeskFocus : null;
  if(back) edFocusOn(back);
  else if(at && modalCard.contains(at) && typeof at.blur==="function") at.blur();
  return true;
}
/* `keys` says the keyboard brought it: the caret goes back to the field it had. A press is acted
   on where it landed, so the editor goes back to its place only once the press is over. */
function edToFront(keys){
  if(!edRest) return false;
  const at=document.activeElement;
  if(at && at!==document.body && !modalCard.contains(at)) edDeskFocus=at;
  edRestEnd();
  if(keys){
    edPlaceSync();
    edFocusOn((edEdFocus && modalCard.contains(edEdFocus)) ? edEdFocus : modalCard);
  } else addEventListener("pointerup",()=>setTimeout(edPlaceSync,0),{once:true});
  return true;
}
/* Another entry takes the window, and unsaved typing in the one it replaces gets the Undo Prev and
   Next give; a dialog of another kind is opened over the editor, which is held whole until it closes. */
function edBeforeOpen(cfg){
  const place=ED_PLACE_KINDS.indexOf(cfg.place)>=0;
  if(place && edHeld){
    const h=edHeld; edHeld=null;
    return (h.dirty && h.again) ? {was:h.typed, again:h.again} : null;
  }
  if(modalEl.hidden || !edPlaceKind) return null;
  if(!place){ if(!edHeld) edHold(); return null; }
  return (!edStepping && edAgain && edDirty()) ? {was:edTyped(), again:edAgain} : null;
}
function edAfterOpen(cfg, leaving){
  const place=ED_PLACE_KINDS.indexOf(cfg.place)>=0;
  if(place && modalEl.hidden===false && !edPlaceKind) edDeskFocus=modalOpener;
  edAgain=(place && typeof cfg.again==="function") ? cfg.again : null;
  edRestEnd();
  placeDialog(cfg.place);
  if(edPlaceKind && edBaseline===null) edMarkClean();
  edSubjectOpen(cfg);
  if(leaving) offerUndo("Moved on without saving the changes", ()=>edGo(()=>{ leaving.again(); edRetype(leaving.was); }));
}
function edGo(run){
  edStepping=true;
  try{ edNavTo(run); }finally{ edStepping=false; }
}
function edHold(){
  let at=document.activeElement;
  const wrap=(at && at.closest) ? at.closest(".menu-wrap") : null;
  if(wrap) at=wrap.querySelector(":scope > button")||at;
  edHeld={kids:Array.prototype.slice.call(modalCard.childNodes), cls:modalCard.className, css:modalCard.style.cssText,
    kind:edPlaceKind, rest:edRest, again:edAgain, dirty:edDirty(), typed:edTyped(),
    nameFn:modalNameFn, resetFn:modalResetFn, resetOn:modalResetOn, resetOff:modalResetOff,
    baseline:edBaseline, ret:edReturn, back:modalBack,
    focus:(at && modalCard.contains(at) && at!==modalCard) ? at : edEdFocus, desk:edRest ? at : edDeskFocus};
  edHeld.kids.forEach(k=>modalCard.removeChild(k));
  edPlaceKind=null;
  modalEl.classList.remove("ed-win");
  edRestEnd();
  edUnstand();
}
function edRestore(){
  const h=edHeld;
  edHeld=null;
  modalCard.innerHTML="";
  modalCard.className=h.cls;
  modalCard.style.cssText=h.css;
  ["top","left","--ed-room","transform-origin"].forEach(k=>modalCard.style.removeProperty(k));
  h.kids.forEach(k=>modalCard.appendChild(k));
  modalNameFn=h.nameFn; modalResetFn=h.resetFn; modalResetOn=h.resetOn; modalResetOff=h.resetOff;
  edBaseline=h.baseline; edReturn=h.ret; modalBack=h.back; edAgain=h.again;
  edEdFocus=h.focus; edDeskFocus=h.desk; edPlaceKind=h.kind; edPlaced=null;
  if(h.rest && modalEl.clientWidth>=ED_REST_MIN){
    edRest=true;
    modalEl.classList.add("ed-rest");
    modalCard.removeAttribute("aria-modal");
  }
  edPlaceSync();
  if(edRest) edFocusOn((h.desk && document.contains(h.desk)) ? h.desk : null);
  else edFocusOn((h.focus && modalCard.contains(h.focus)) ? h.focus : modalCard);
}
function wireEditorRest(){
  const bg=modalEl.querySelector(".modal-bg");
  /* The desk was dimmed when it was clicked, so the click was not aimed: it brings the desk in
     front and does nothing else. */
  if(bg) bg.addEventListener("pointerdown",e=>{
    if(e.button!==0 || !edToDesk()) return;
    e.preventDefault();
  });
  modalCard.addEventListener("pointerdown",()=>{ if(edRest) edToFront(false); },true);
  modalCard.addEventListener("focusin",()=>{ if(edRest) edToFront(false); });
  /* Gone, the entry has no Save, Reset or Delete, whatever an editor does to its buttons later. */
  modalCard.addEventListener("click",e=>{
    if(edGone && e.target.closest && e.target.closest(ED_LOCKS)){ e.preventDefault(); e.stopPropagation(); }
  },true);
}
/* ---- WHAT AN EDITOR EDITS, CHANGED UNDERNEATH IT. Typed fields are never changed for the person:
   a clean editor shows the entry as it now is, one holding typing keeps it and says so in one line
   under the title, and one whose entry is gone stays readable with Save, Reset and Delete off.
   Asked after the desk draws; Save's own write is the editor's (refreshDialogChrome). */
const ED_LINES={
  card:{edition:"A newer edition changed this card while it was open. Save keeps what is written here; Reset takes the new edition's.",
    gone:"This card is no longer in the catalog, so nothing here can be saved. The text can still be copied.",
    elsewhere:"This card changed elsewhere while it was open. Save keeps what is written here; Cancel leaves the change made there."},
  intent:{edition:"A newer edition changed this intent while it was open. Save keeps what is written here; Reset takes the new edition's.",
    gone:"This intent is no longer in the catalog, so nothing here can be saved. The text can still be copied.",
    elsewhere:"This intent changed elsewhere while it was open. Save keeps what is written here; Cancel leaves the change made there."},
  category:{edition:"A newer edition changed this category while it was open. Save keeps what is written here; Reset takes the new edition's.",
    gone:"This category is no longer in the catalog, so nothing here can be saved. The text can still be copied.",
    elsewhere:"This category changed elsewhere while it was open. Save keeps what is written here; Cancel leaves the change made there."}
};
const ED_LOCKS=".modal-actions .btn.primary, .modal-actions .mf-reset, .modal-actions .mf-del";
let edSubject=null, edSubjectSig=null, edGone=false, edGoneLayer=false, edCause="", edSubjectTimer=null;
function edSubjectNow(){
  try{ return edSubject ? edSubject() : undefined; }catch(e){ return undefined; }
}
function edSubjectOpen(cfg){
  edSubject=(edPlaceKind && typeof cfg.subject==="function") ? cfg.subject : null;
  edSubjectSig=edSubjectNow();
  edGone=false; edGoneLayer=false;
}
/* A catalog taken: in the same layer the next difference is the edition's. Another layer, or local memory
   cleared or put back, leaves the editor with nothing it may write to: its entry is taken as gone. */
function edCatalogTaken(sameLayer){ edCause=sameLayer ? "edition" : "layer"; }
function edCanSave(){ return !edGone; }
function edSubjectSoon(){
  clearTimeout(edSubjectTimer);
  edSubjectTimer=setTimeout(edSubjectCheck,0);
}
function edSubjectCheck(){
  const cause=edCause;
  edCause="";
  if(!edPlaceKind || modalEl.hidden || !edSubject || edStepping || edGoneLayer) return;
  if(cause==="layer"){ edGoneLayer=true; edMarkGone(); return; }
  const now=edSubjectNow();
  if(now===undefined || now===edSubjectSig) return;
  if(now===null){ edMarkGone(); return; }
  if(!edDirty() && edAgain){
    edStepping=true;
    try{ edAgain(); }finally{ edStepping=false; }
    return;
  }
  edUnGone();
  edSubjectSig=now;
  edSayLine(ED_LINES[edPlaceKind][cause==="edition" ? "edition" : "elsewhere"]);
}
function edMarkGone(){
  edGone=true;
  edSubjectSig=null;
  modalCard.querySelectorAll(ED_LOCKS).forEach(b=>{ b.disabled=true; });
  edSayLine(ED_LINES[edPlaceKind].gone);
}
function edUnGone(){
  if(!edGone) return;
  edGone=false;
  modalCard.querySelectorAll(".modal-actions .btn.primary, .modal-actions .mf-del").forEach(b=>{ b.disabled=false; });
  refreshDialogReset();
}
function edSayLine(text){
  const old=modalCard.querySelector(":scope > .modal-note");
  if(old) old.remove();
  const h=modalCard.querySelector(":scope > h2");
  if(!h) return;
  const p=document.createElement("p");
  p.className="modal-note";
  p.setAttribute("role","status");
  p.innerHTML='<span class="modal-note-dot" aria-hidden="true"></span><span class="modal-note-t"></span>';
  p.querySelector(".modal-note-t").textContent=text;
  h.after(p);
  translateTree(p);
}
/* THE CARD IS THE WHOLE KEYBOARD while it is up: the markup says aria-modal, and the scrim
   takes the mouse, but Tab walked off the card and into the header behind it - reachable and
   pressable, with nothing on screen to say where the caret had gone. Returns the far end when
   focus is leaving, and null when it is not, so an ordinary Tab inside the card is untouched. */
const MODAL_TABBABLE="a[href],button:not([disabled]),input:not([disabled]),"
  +"select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
function modalTabTarget(back){ return tabTargetIn(modalCard, back); }
function tabTargetIn(card, back){
  if(!card) return null;
  const els=Array.prototype.filter.call(card.querySelectorAll(MODAL_TABBABLE),
    el=>el.offsetWidth>0 || el.offsetHeight>0 || el===document.activeElement);
  if(!els.length) return null;
  const at=document.activeElement;
  if(!card.contains(at) || at===card) return back?els[els.length-1]:els[0];
  if(back && at===els[0]) return els[els.length-1];
  if(!back && at===els[els.length-1]) return els[0];
  return null;
}
/* A COVER: a small dialog of its own appended to <body>, the catalog offer, the name question
   and the export's name, which stands over everything, the shared dialog included. The last one
   appended is the one on top. */
function openCover(){
  const all=document.querySelectorAll("body > .modal:not(#modal):not(.e-gone)");
  return all.length ? all[all.length-1] : null;
}

export {
  modalOpen, modalTabTarget, tabTargetIn, openCover, mountModalBody, modalResize, dismissModal, closeModal,
  wireModalX, wireModalBody, wireFocusModality, wireDialogDrag, wireEditorRest, modalFront, edResting, edToDesk, edToFront, edSubjectSoon, edCatalogTaken, edCanSave,
  accOpen, accHtml, mfSec, catToggle, wireFolds, wireAcc,
  openDialog, refreshDialogName, refreshDialogChrome,
  dressDialogInputs,
  edNavHtml, edWireNav, edMarkClean, edDirty, edStepLang,
};
