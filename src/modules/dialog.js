/* The window every dialog is drawn inside: the fold families, the opener and its chrome, the
   pass that fades a cut line, and the navigation an editor carries. */
import { markCutText } from "./cut-text.js";
import { ICON_CHEVRON_R, ICON_MIN, ICON_X } from "./icons.js";
import { mgOpen } from "./app-state.js";
import { animateModalHeightFrom, animatePinnedHeight, cutLeaves, dismissNode, mgAccordion, mgPinCard, mgReduceMotion, M_MS, E_EASE, E_FLY } from "./motion.js";
import { formatActionChord } from "./shortcuts.js";
import { scStopCapture } from "./shortcuts-list.js";
import { offerUndo, t, tc, translateTree } from "./ui-lang.js";
import { hooks } from "./hooks.js";
import { esc } from "./esc.js";
import { modalEl, modalCard, $, focusKey, sameControl, originOf, wireFocusRing } from "./dom.js";

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
  const live=!!modalResetFn() || edEditionReset;
  b.disabled=!live || edGone;
  b.title=t(live?modalResetOn:modalResetOff);
}
/** Both halves of a heading that has to keep up with its own screen. */
/* After the editor's own Save the entry is what it wrote, so a line about a change underneath has said its piece. */
function refreshDialogChrome(){
  refreshDialogName(); refreshDialogReset();
  if(edSubject && !edGone){
    edEditionReset=false;
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
    modalHead(t(cfg.title), cfg.lead, cfg.nav, modalNameFn?(modalNameFn()||""):"", cfg.place)+
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
  if(!modalCard.contains(at) && !openCover() && !edResting() && !(at && at.closest && at.closest("#tourCard")))
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
let edBaseline=null, edBaseTyped=null;
/* The editor's own way back, the go edWireNav already undoes through. */
let edReturn=null;
function edFormState(root){
  root=root||modalCard;
  if(!root) return "";
  const out=[];
  root.querySelectorAll("input,textarea,select").forEach(el=>{
    out.push((el.type==="checkbox"||el.type==="radio")?(el.checked?"1":"0"):String(el.value||""));
  });
  // segmented controls are buttons, not fields - the chosen one carries .on and its value
  root.querySelectorAll(".on[data-v]").forEach(el=>out.push(String(el.dataset.v||"")));
  return out.join("\u0001");
}
function edMarkClean(){ edBaseline=edFormState(); edBaseTyped=edTyped(); }
/* The typing itself, to be put back: every field's value in document order, its key, and which of the segmented
   buttons carried .on. A field is put back by its key, so a row that appears or goes between two arrivals moves no
   typing into another box: its id, else for a box or a radio its name and value, since a group shares one name.
   A field with no key is matched by place, only while the shape holds; a key the form holds twice, by nothing. */
function edKeyOf(el){
  if(el.id) return String(el.id);
  return (el.type==="checkbox"||el.type==="radio") ? String(el.name||"")+"="+String(el.value) : String(el.name||"");
}
function edTyped(root){
  root=root||modalCard;
  if(!root) return null;
  const els=Array.from(root.querySelectorAll("input,textarea,select"));
  return { fields:els.map(el=>(el.type==="checkbox"||el.type==="radio")?el.checked:String(el.value||"")),
           keys:els.map(edKeyOf),
           segs:Array.from(root.querySelectorAll("[data-v]")).map(el=>el.classList.contains("on")) };
}
/* `keep`, where given, names the places in `was` to put back, {f(i), s(i)}; the rest stay as drawn. */
function edRetype(was, keep){
  if(!was || !modalCard) return;
  const segs=Array.from(modalCard.querySelectorAll("[data-v]"));
  if(segs.length===was.segs.length) segs.forEach((el,i)=>{ if(was.segs[i] && (!keep || keep.s(i)) && !el.classList.contains("on")) el.click(); });
  const els=Array.from(modalCard.querySelectorAll("input,textarea,select"));
  const once=new Map(), twice=new Set();
  (was.keys||[]).forEach((k,j)=>{ if(!k) return; if(once.has(k)) twice.add(k); else once.set(k,j); });
  const same=els.length===was.fields.length;
  els.forEach((el,i)=>{
    const k=edKeyOf(el);
    const j=was.keys && k ? (once.has(k) && !twice.has(k) ? once.get(k) : -1) : (same ? i : -1);
    if(j<0 || (keep && !keep.f(j))) return;
    const v=was.fields[j];
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
    const from=originOf($(d<0 ? "#edPrev" : "#edNext"));
    edGo(()=>go(list[j]));
    if(was) offerUndo("Moved on without saving the changes", ()=>edGo(()=>{ go(cur); edRetype(was); }), null, from);
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
function modalHead(title, lead, nav, name, place){
  /* `lead` goes INSIDE the h2, before the title, so the heading's own flex row places it - the
     row is already display:flex with gap:10px and the close button on margin-left:auto, so a mark
     dropped in front needs no layout of its own. */
  /* The title is WRAPPED, not bare: loose text in a flex row is an anonymous item that
     shrinks like any other, and text-wrap:balance then splits it into two tidy halves the
     moment it does. A span can be told to refuse. */
  return '<h2 id="modalTitle">'+(lead||"")+'<span class="modal-t">'+esc(title)+'</span>'+
    (name?'<span class="modal-name">'+esc(name)+'</span>':'')+(nav||"")+
    (ED_PLACE_KINDS.indexOf(place)>=0 ? '<button type="button" class="modal-x modal-min" id="modalMin" title="Minimise this editor" '+
      'aria-label="Minimise this editor">'+ICON_MIN+'</button>' : '')+
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
  wireFocusRing();
}
/* Delegated once, so it survives every innerHTML rebuild without being rewired. */
function wireModalX(){
  modalCard.addEventListener("click",e=>{
    if(e.target.closest && e.target.closest("#modalX")) dismissModal();
    else if(e.target.closest && e.target.closest("#modalMin")) edMinimise();
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
  /* Its Undo hangs from the control that opened the editor, the catalog's name in the bar where none stands. */
  const from=was ? originOf(modalOpener, ()=>document.getElementById("catNow")) : null;
  edBaseline=null; edReturn=null;
  const back=modalBack;
  modalBack=null;
  if(back) back(); else closeModal();
  if(was && ret) offerUndo("Moved on without saving the changes", ()=>edNavTo(()=>{ ret.go(ret.cur); edRetype(was); }), null, from);
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
  if(edActiveWin && edWins.length>1){
    const gone=edActiveWin;
    edWins=edWins.filter(r=>r!==gone);
    edHist=edHist.filter(r=>r!==gone);
    leaveModal();
    edActiveWin=null;
    edWinClear();
    edUnstand();
    /* The most recent still showing comes forward; where every other is minimised, the desk does. */
    const next=edHist.filter(r=>!r.min).pop()||edHist[edHist.length-1]||edWins[edWins.length-1];
    edUnshelve(next);
    edFrontHist(next);
    edMulti();
    if(next.min && !edRest) edRestStart();
    else if(!edRest) edFocusOn((edEdFocus && modalCard.contains(edEdFocus)) ? edEdFocus : modalCard);
    return;
  }
  edWins=[]; edHist=[]; edActiveWin=null; edEntry=null; edRefresh=null;
  edShow=false;
  modalEl.classList.remove("ed-multi","ed-show");
  const wasRest=edRest;
  leaveModal();
  modalEl.hidden=true;
  edPlaceKind=null; edAgain=null; edRestEnd(); edUnstand();
  edMarks();
  modalEl.classList.remove("ed-win");
  modalCard.classList.remove("about-modal","about-page");
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
/* ---- THE EDITORS PLACE THEMSELVES, and nobody drags them (board 1018). The card, intent and category editors showing stand
   side by side, tops level, ED_GAP apart and centred as a group, while the window holds them all; else in a stack, the one in
   hand in front and the others' heads ED_HEAD apart above it, the most recent nearest. One alone stands centred, as every other
   dialog does. */
const ED_PLACE_KINDS=["card","intent","category"], ED_EDGE=8, ED_GAP=24, ED_HEAD=34, ED_SHOW_S=0.5, ED_SHOW_GAP=28;
let edPlaceKind=null;
/* The band's drag region swallows every click over it (the band's rule in the sheet), so nothing stands higher than ED_EDGE under it. */
function edBand(){
  const row=document.querySelector("header > .row");
  const r=row && row.getBoundingClientRect ? row.getBoundingClientRect() : null;
  return r && r.bottom>0 ? r.bottom : 0;
}
/* The card in hand stays a flex item, top-aligned and shifted by its relative top and left, so its width is the centred card's own. */
function edPutCard(left, top, room){
  const st=modalCard.style;
  modalEl.classList.add("ed-placed");
  st.setProperty("--ed-room", Math.max(0, Math.round(room))+"px");
  const relT=parseFloat(st.top)||0, relL=parseFloat(st.left)||0;
  const t0=modalCard.offsetTop-relT, l0=modalCard.offsetLeft-relL;
  st.top=Math.round(top-t0)+"px";
  st.left=Math.round(left-l0)+"px";
}
function edUnstand(){
  if(!modalEl || !modalEl.classList.contains("ed-placed")) return;
  modalEl.classList.remove("ed-placed","ed-stack");
  ["top","left","--ed-room","transform-origin"].forEach(k=>modalCard.style.removeProperty(k));
}
/* `back` stands a shell behind the one in front: its depth and its step smaller. */
function edPutShell(sh, left, top, w, room, back){
  sh.style.left=Math.round(left)+"px"; sh.style.top=Math.round(top)+"px"; sh.style.width=Math.round(w)+"px";
  sh.style.maxHeight=Math.max(0, Math.round(room))+"px";
  sh.classList.toggle("ed-back", !!back);
  if(back){ sh.style.setProperty("--ed-z", String(back.z)); sh.style.setProperty("scale", String(back.s)); }
  else { sh.style.removeProperty("--ed-z"); sh.style.removeProperty("scale"); }
}
function edElOf(r){ return r===edActiveWin ? (edHeld ? null : modalCard) : r.shell; }
/* Every render asks again, and so do a resize, the card's own change of size and every change of what is showing. */
function placeDialog(kind){
  edPlaceKind=ED_PLACE_KINDS.indexOf(kind)>=0 ? kind : null;
  edPlaceSync();
}
function edPlaceSync(){
  modalEl.classList.toggle("ed-win", !!(edPlaceKind && !modalEl.hidden));
  edMarks();
  if(!edPlaceKind || modalEl.hidden){ edUnstand(); return; }
  if(edShow){ edShowLay(); return; }
  const up=edWins.filter(r=>!r.min).sort((a,b)=>a.seq-b.seq);
  if(edRest || up.length<2){ edUnstand(); return; }
  const W=modalEl.clientWidth, H=modalEl.clientHeight, w=modalCard.offsetWidth, floor=edBand()+ED_EDGE, foot=H-ED_EDGE;
  const row=up.length*w+(up.length-1)*ED_GAP;
  if(row<=W-2*ED_EDGE){
    modalEl.classList.remove("ed-stack");
    /* Measured uncapped: a stack's cap would otherwise set the row's top. */
    up.forEach(r=>{ if(r.shell) r.shell.style.maxHeight=Math.max(0, foot-floor)+"px"; });
    const tall=Math.max.apply(null, up.map(r=>edElOf(r).offsetHeight));
    const top=Math.max(floor, Math.round((H-tall)/2)), x0=Math.round((W-row)/2);
    up.forEach((r,i)=>{
      const x=x0+i*(w+ED_GAP);
      if(r===edActiveWin) edPutCard(x, top, foot-top); else edPutShell(r.shell, x, top, w, foot-top, null);
    });
    return;
  }
  const behind=edHist.filter(r=>!r.min && r!==edActiveWin).reverse();
  const top=floor+behind.length*ED_HEAD, left=Math.round((W-w)/2);
  modalEl.classList.add("ed-stack");
  edPutCard(left, top, foot-top);
  const h=modalCard.offsetHeight;
  behind.forEach((r,i)=>edPutShell(r.shell, left, top-(i+1)*ED_HEAD, w, h+(i+1)*ED_HEAD,
    {z:behind.length-i, s:Math.round((1-0.03*(i+1))*100)/100}));
}
function wireEditorPlace(){
  addEventListener("resize", edPlaceSync);
  if(typeof ResizeObserver==="function") new ResizeObserver(edPlaceSync).observe(modalCard);
  /* Typing shows at once as the head's dot. */
  if(modalEl.addEventListener){ modalEl.addEventListener("input", edMarks); modalEl.addEventListener("change", edMarks); }
}
/* ---- MINIMISED, AND THE DESK IN FRONT. An editor's minimise button sends it to the one action button in the floating stack; a
   click on the dimmed desk, or F6 past the last editor, sends every one there, and the desk is in front (edRest). A minimised
   editor keeps its nodes whole, typing and all. The button's digit is how many wait, amber while one of them holds unsaved work:
   one comes straight back, two or more are shown side by side at ED_SHOW_S to pick from (the showcase). */
let edRest=false, edEdFocus=null, edDeskFocus=null, edHeld=null, edAgain=null, edStepping=false, edShow=false, edShowAt=0;
function edResting(){ return edRest; }
/* A dialog the keyboard belongs to: any dialog, an editor only while one is showing. */
function modalFront(){ return !!modalEl && !modalEl.hidden && !edRest; }
function edFocusOn(el){
  if(!el || typeof el.focus!=="function") return;
  const how=lastInputWasKey?{preventScroll:true}:{preventScroll:true,focusVisible:false};
  try{ el.focus(how); }catch(e){ try{ el.focus(); }catch(e2){} }
}
function edRestEnd(){
  if(!edRest) return;
  edRest=false;
  if(edActiveWin && !edHeld) edActiveWin.min=false;
  modalEl.classList.remove("ed-rest");
  modalCard.setAttribute("aria-modal","true");
  edPlaceSync();
}
/* Into the desk's keeping: the keyboard goes back where it was on the desk. */
function edRestStart(){
  edRest=true;
  modalEl.classList.add("ed-rest");
  modalCard.removeAttribute("aria-modal");
  edPlaceSync();
  const back=(edDeskFocus && document.contains(edDeskFocus) && edDeskFocus.getClientRects && edDeskFocus.getClientRects().length) ? edDeskFocus : null;
  const at=document.activeElement;
  if(back) edFocusOn(back);
  else if(at && modalEl.contains && modalEl.contains(at) && typeof at.blur==="function") at.blur();
}
function edToDesk(){
  if(edRest || edShow || !edPlaceKind || modalEl.hidden || openCover()) return false;
  const at=document.activeElement;
  edEdFocus=(at && modalCard.contains(at) && at!==modalCard) ? at : null;
  const flying=edGhosts(edWins.filter(r=>!r.min));
  edWins.forEach(r=>{ r.min=true; });
  edRestStart();
  edFlyOut(flying); /* plant:fly-out */
  return true;
}
/* THE FLIGHT. A minimising editor shrinks to its button's size and travels to its place on M_MS.fly, accelerating (E_FLY), its corners
   rounding and its body fading over the last 45% of the way; the button rings once on arrival. Bringing it back is the same path
   reversed on E_EASE. What flies is a copy standing where the editor stood, since the editor itself is out of sight the moment it is
   minimised. Under quiet motion there is no flight: the copy fades on the reveal tier and the button rings. */
const ED_RING_PX=6;
function edFabRect(){
  const fab=document.getElementById("edFab");
  const b=fab && !fab.hidden && typeof fab.getBoundingClientRect==="function" ? fab.getBoundingClientRect() : null;
  return b && b.width>0 ? b : null;
}
function edGhosts(recs){
  if(typeof Element==="undefined" || !Element.prototype.animate) return [];
  const out=[];
  recs.forEach(r=>{
    const el=edElOf(r);
    const b=el && !el.hidden && el.getClientRects().length ? el.getBoundingClientRect() : null;
    if(!b || !(b.width>0)) return;
    const g=el.cloneNode(true);
    g.removeAttribute("id");
    Array.prototype.forEach.call(g.querySelectorAll("[id]"), n=>n.removeAttribute("id"));
    g.classList.remove("ed-min","ed-shell","ed-back","ed-off","ed-pick");
    g.classList.add("ed-ghost");
    g.setAttribute("aria-hidden","true");
    g.inert=true;
    const st=g.style;
    st.position="fixed"; st.margin="0"; st.left=b.left+"px"; st.top=b.top+"px"; st.width=b.width+"px"; st.height=b.height+"px";
    st.maxHeight="none"; st.animation="none"; st.transformOrigin="0 0"; st.pointerEvents="none"; st.zIndex="210";
    out.push({g, b});
  });
  return out;
}
function edRing(){
  const fab=document.getElementById("edFab");
  if(!fab || !fab.animate) return;
  fab.animate([{boxShadow:"0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent)"},
    {boxShadow:"0 0 0 "+ED_RING_PX+"px color-mix(in srgb,var(--accent) 0%,transparent)"}],{duration:M_MS.celebrate, easing:E_EASE});
}
function edFlyOut(ghosts){
  if(!ghosts.length) return;
  const to=edFabRect(), still=mgReduceMotion();
  ghosts.forEach(({g, b})=>{
    if(!to){ return; }
    modalEl.appendChild(g);
    const done=()=>{ g.remove(); };
    let run;
    if(still) run=g.animate([{opacity:1},{opacity:0}],{duration:M_MS.reveal, easing:E_EASE, fill:"forwards"});
    else{
      const sx=to.width/b.width, sy=to.height/b.height;
      const pose="translate("+(to.left-b.left)+"px,"+(to.top-b.top)+"px) scale("+sx+","+sy+")";
      const was=getComputedStyle(g).borderRadius;
      const round=(to.width/2/sx)+"px / "+(to.height/2/sy)+"px";
      run=g.animate([{transform:"none", opacity:1, borderRadius:was},{opacity:1, offset:.55},{transform:pose, opacity:0, borderRadius:round}],
        {duration:M_MS.fly, easing:E_FLY, fill:"forwards"});
    }
    run.onfinish=done; run.oncancel=done;
    setTimeout(done, M_MS.fly+M_MS.reveal+200);
  });
  const arrive=still ? M_MS.reveal : M_MS.fly;
  if(to) setTimeout(edRing, arrive); /* plant:fly-ring */
}
function edFlyIn(el, from){
  if(!el || !from || !el.animate) return;
  const b=el.getBoundingClientRect();
  if(!(b.width>0)) return;
  if(mgReduceMotion()){ el.animate([{opacity:0},{opacity:1}],{duration:M_MS.reveal, easing:E_EASE, fill:"backwards"}); return; }
  const sx=from.width/b.width, sy=from.height/b.height;
  const pose="translate("+(from.left-b.left)+"px,"+(from.top-b.top)+"px) scale("+sx+","+sy+")";
  const was=getComputedStyle(el).borderRadius;
  const round=(from.width/2/sx)+"px / "+(from.height/2/sy)+"px";
  el.animate([{transform:pose, opacity:0, borderRadius:round, transformOrigin:"0 0"},{opacity:1, offset:.45},{transform:"none", opacity:1, borderRadius:was, transformOrigin:"0 0"}],
    {duration:M_MS.fly, easing:E_EASE, fill:"backwards"});
}
/* The editor in hand to the button; the most recent still showing comes forward, else the desk does. */
function edMinimise(){
  if(!edActiveWin || !edPlaceKind || modalEl.hidden || edRest || edShow || edHeld) return false;
  const next=edHist.filter(r=>r!==edActiveWin && !r.min).pop();
  if(!next) return edToDesk();
  const flying=edGhosts([edActiveWin]);
  edActiveWin.min=true;
  edActivate(next, true);
  edFlyOut(flying);
  return true;
}
/* Back from the desk, the caret where it was. */
function edToFront(){
  if(!edRest) return false;
  const from=edFabRect();
  const at=document.activeElement;
  if(at && at!==document.body && !modalCard.contains(at)) edDeskFocus=at;
  edRestEnd();
  edRefreshNow();
  edPlaceSync();
  edFocusOn((edEdFocus && modalCard.contains(edEdFocus)) ? edEdFocus : modalCard);
  edFlyIn(modalCard, from); /* plant:fly-in */
  return true;
}
/* One minimised editor shown again, the others left where they are. */
function edBringUp(rec){
  if(!rec || edWins.indexOf(rec)<0) return false;
  const from=edFabRect();
  rec.min=false;
  if(rec!==edActiveWin){ edActivate(rec, true); edFlyIn(modalCard, from); return true; }
  if(edRest) return edToFront();
  edPlaceSync();
  return true;
}
function edMinList(){ return edWins.filter(r=>r.min).sort((a,b)=>a.seq-b.seq); }
function edFabPress(){
  if(modalEl.hidden || edHeld || edShow) return false;
  const list=edMinList();
  if(!list.length) return false;
  if(list.length===1) return edBringUp(list[0]);
  return edShowOpen();
}
function edWinDirty(r){
  if(r===edActiveWin) return edHeld ? !!edHeld.dirty : edDirty();
  const st=r.state;
  return !!(r.shell && st && st.baseline!==null && edFormState(r.shell)!==st.baseline);
}
/* The classes that say minimised and unsaved, and the button that counts them. The button stands above the dim while editors show. */
function edMarks(){
  let n=0, unsaved=false;
  edWins.forEach(r=>{
    const el=edElOf(r), d=edWinDirty(r);
    if(el){ el.classList.toggle("ed-min", !!r.min); el.classList.toggle("ed-unsaved", d); }
    if(r.min){ n++; if(d) unsaved=true; }
  });
  if(!edPlaceKind && modalCard) modalCard.classList.remove("ed-min","ed-unsaved");
  const up=n>0 && !modalEl.hidden;
  const showing=!!edPlaceKind && !modalEl.hidden && !edRest && !edHeld && !edShow;
  const fab=document.getElementById("edFab");
  if(fab){
    fab.hidden=!up;
    fab.classList.toggle("unsaved", up && unsaved);
    const b=fab.querySelector(".fab-badge");
    if(b) b.textContent=up ? String(n) : "";
    const say=t(n===1 ? "Bring back the minimised editor" : "Choose a minimised editor")
      +(unsaved ? ". "+t(n===1 ? "Its unsaved changes are kept" : "Unsaved changes in them are kept") : "");
    fab.title=say;
    fab.setAttribute("aria-label", say);
  }
  if(document.body) document.body.classList.toggle("ed-up", showing); /* plant:ed-up-class */
}
/* ---- THE SHOWCASE: every minimised editor at ED_SHOW_S, side by side over the dim, the last used ringed, the ones showing hidden
   meanwhile. A press on one, its digit, or Enter on the ringed one brings that one back; a short Esc or a press on the dim leaves. */
function edShowOpen(){
  const list=edMinList();
  if(list.length<2 || modalEl.hidden || edHeld) return false;
  const last=edHist.filter(r=>r.min).pop();
  edShowAt=Math.max(0, list.indexOf(last));
  const at=document.activeElement;
  if(at && at!==document.body && !(modalEl.contains && modalEl.contains(at))) edDeskFocus=at;
  edShow=true;
  modalEl.classList.add("ed-show");
  if(at && at!==document.body && typeof at.blur==="function") at.blur();
  edPlaceSync();
  return true;
}
function edShowLay(){
  const list=edMinList(), n=list.length;
  const W=modalEl.clientWidth, H=modalEl.clientHeight, w=modalCard.offsetWidth;
  const s=Math.min(ED_SHOW_S, (W-2*ED_EDGE-(n-1)*ED_SHOW_GAP)/Math.max(1, n*w));
  const row=n*w*s+(n-1)*ED_SHOW_GAP, x0=Math.round((W-row)/2);
  const tall=Math.max.apply(null, list.map(r=>edElOf(r).offsetHeight));
  const floor=edBand()+ED_EDGE, top=Math.max(floor, Math.round((H-tall*s)/2)), room=(H-ED_EDGE-top)/s;
  edWins.forEach(r=>{ const el=edElOf(r); if(el) el.classList.toggle("ed-off", !r.min); });
  list.forEach((r,i)=>{
    const el=edElOf(r), x=Math.round(x0+i*(w*s+ED_SHOW_GAP));
    if(r===edActiveWin) edPutCard(x, top, room); else edPutShell(r.shell, x, top, w, room, null);
    el.style.setProperty("scale", String(s));
    el.classList.toggle("ed-pick", i===edShowAt);
    Array.prototype.forEach.call(el.children||[], c=>{ c.inert=true; });
  });
}
function edShowEnd(){
  if(!edShow) return false;
  edShow=false;
  modalEl.classList.remove("ed-show");
  edWins.forEach(r=>{
    const el=edElOf(r);
    if(!el) return;
    el.classList.remove("ed-off","ed-pick");
    el.style.removeProperty("scale");
    Array.prototype.forEach.call(el.children||[], c=>{ c.inert=false; });
  });
  edPlaceSync();
  return true;
}
function edShowPick(rec){
  edShowEnd();
  edBringUp(rec);
}
function edShowing(){ return edShow; }
/* Esc held closes every editor, the minimised among them; the showcase holds the keyboard while it is up. A short Esc anywhere
   else is the keyboard's X, which closes the editor in hand (keydown.js). True where the key was taken. */
function edKeys(e){
  if(!e || !modalEl || modalEl.hidden || !edWins.length) return false;
  if(e.key==="Escape" && e.repeat){ e.preventDefault(); closeAllDialogs(); return true; }
  if(!edShow) return false;
  const list=edMinList();
  if(e.key==="Escape"){
    e.preventDefault();
    edShowEnd();
    if(edRest && edDeskFocus && document.contains(edDeskFocus)) edFocusOn(edDeskFocus);
    return true;
  }
  const d=/^[1-9]$/.test(e.key||"") ? Number(e.key) : 0;
  if(d && d<=list.length){ e.preventDefault(); edShowPick(list[d-1]); return true; }
  if(e.key==="ArrowRight" || e.key==="ArrowLeft"){
    e.preventDefault();
    edShowAt=(edShowAt+(e.key==="ArrowRight" ? 1 : list.length-1))%list.length;
    edPlaceSync();
    return true;
  }
  if(e.key==="Enter" || e.key===" "){ e.preventDefault(); if(list[edShowAt]) edShowPick(list[edShowAt]); return true; }
  if(e.key==="Tab") e.preventDefault();
  return true;
}
/* Another entry takes the window, and unsaved typing in the one it replaces gets the Undo Prev and
   Next give; a dialog of another kind is opened over the editor, which is held whole until it closes. */
function edBeforeOpen(cfg){
  const place=ED_PLACE_KINDS.indexOf(cfg.place)>=0;
  const edition=edEditionReset;
  edEditionReset=false;   // a new render asks Reset afresh
  if(place && edHeld){
    const h=edHeld; edHeld=null;
    modalEl.classList.remove("ed-held");
    return (h.dirty && h.again) ? {was:h.typed, again:h.again} : null;
  }
  if(place && !modalEl.hidden && edPlaceKind){
    const w=edWinOf(cfg.place);
    if(w && w!==edActiveWin) edActivate(w,true);
    else if(!w){
      edShelve();
      return null;
    }
  }
  if(modalEl.hidden || !edPlaceKind) return null;
  if(!place){ if(!edHeld){ edHold(); edHeld.editionReset=edition; modalEl.classList.add("ed-held"); } return null; }
  return (!edStepping && edAgain && edDirty()) ? {was:edTyped(), again:edAgain} : null;
}
function edAfterOpen(cfg, leaving){
  const place=ED_PLACE_KINDS.indexOf(cfg.place)>=0;
  if(place && modalEl.hidden===false && !edPlaceKind) edDeskFocus=modalOpener;
  edAgain=(place && typeof cfg.again==="function") ? cfg.again : null;
  if(place){
    if(!edActiveWin){
      edActiveWin={kind:cfg.place, seq:++edSeq, shell:null, state:null, cause:"", min:false};
      edWins.push(edActiveWin);
    }
    edActiveWin.kind=cfg.place;
    edFrontHist(edActiveWin);
    edEntry=cfg.entry==null ? null : cfg.entry;
    edRefresh=typeof cfg.refresh==="function" ? cfg.refresh : null;
    edMulti();
  }
  if(!edStepping) edRestEnd();   // the editor redrawing itself keeps the desk in front
  placeDialog(cfg.place);
  if(edPlaceKind && edBaseline===null) edMarkClean();
  edSubjectOpen(cfg);
  if(leaving) offerUndo("Moved on without saving the changes", ()=>edGo(()=>{ leaving.again(); edRetype(leaving.was); }), null,
    ()=>document.querySelector("#modalTitle .modal-t")||document.getElementById("modalTitle"));
}
function edGo(run){
  edStepping=true;
  try{ edNavTo(run); }finally{ edStepping=false; }
}
function edHold(){
  let at=document.activeElement;
  const wrap=(at && at.closest) ? at.closest(".menu-wrap") : null;
  if(wrap) at=wrap.querySelector(":scope > button")||at;
  edHeld=Object.assign(edWinState(), {kids:Array.prototype.slice.call(modalCard.childNodes), css:modalCard.style.cssText,
    rest:edRest, dirty:edDirty(), typed:edTyped(), desk:edRest ? at : edDeskFocus});
  edHeld.kids.forEach(k=>modalCard.removeChild(k));
  edPlaceKind=null;
  modalEl.classList.remove("ed-win");
  edRestEnd();
  edUnstand();
  edMarks();
}
function edRestore(){
  const h=edHeld;
  edHeld=null;
  modalCard.innerHTML="";
  modalCard.className=h.cls;
  modalCard.style.cssText=h.css;
  ["top","left","--ed-room","transform-origin"].forEach(k=>modalCard.style.removeProperty(k));
  h.kids.forEach(k=>modalCard.appendChild(k));
  edWinApply(h);
  edDeskFocus=h.desk;
  modalEl.classList.remove("ed-held");
  refreshDialogReset();
  if(h.rest){
    edRest=true;
    if(edActiveWin) edActiveWin.min=true;
    modalEl.classList.add("ed-rest");
    modalCard.removeAttribute("aria-modal");
  }
  edPlaceSync();
  if(edRest) edFocusOn((h.desk && document.contains(h.desk)) ? h.desk : null);
  else edFocusOn((h.focus && modalCard.contains(h.focus)) ? h.focus : modalCard);
}
/* THE ACTION BUTTONS JOIN FROM THE LEFT: the stack packs from its right edge, and a button that appears takes the place left of every
   one standing, so none that stood moves. Each arrival takes the next order. */
function wireFabArrival(){
  const stack=document.getElementById("fabStack");
  if(!stack || typeof MutationObserver!=="function") return;
  const fabs=()=>Array.prototype.slice.call(stack.querySelectorAll(".fab"));
  const shown=el=>!el.hidden && (!el.classList.contains("fab-clear") || el.classList.contains("on"));
  const was=new Map();
  let n=0;
  fabs().forEach(el=>{ el.style.order=String(++n); was.set(el, shown(el)); });
  new MutationObserver(()=>fabs().forEach(el=>{
    const now=shown(el);
    if(now && !was.get(el)) el.style.order=String(++n); /* plant:fab-arrival-order */
    was.set(el, now);
  })).observe(stack,{attributes:true, subtree:true, attributeFilter:["hidden","class"]});
}
function wireEditorRest(){
  wireFabArrival();
  const bg=modalEl.querySelector(".modal-bg");
  /* The desk was dimmed when it was clicked, so the click was not aimed: it minimises every editor and does nothing else; over
     the showcase it only leaves the showcase. */
  if(bg) bg.addEventListener("pointerdown",e=>{
    if(e.button!==0) return;
    if(edShow){ e.preventDefault(); edShowEnd(); return; }
    if(!edToDesk()) return;
    e.preventDefault();
  });
  modalCard.addEventListener("pointerdown",e=>{
    if(!edShow || !edActiveWin) return;
    e.preventDefault(); e.stopPropagation();
    edShowPick(edActiveWin);
  },true);
  const fab=document.getElementById("edFab");
  if(fab) fab.addEventListener("click",()=>edFabPress());
  /* The stack stands over the editors' dim. An action of its own that is not the editors' (their button, and Add, which opens one) sends
     them to their button first, then goes on: the capture phase runs before the button's own press. */
  const stack=document.getElementById("fabStack");
  if(stack) stack.addEventListener("click",e=>{
    const b=e.target.closest ? e.target.closest(".fab") : null;
    if(b && b.id!=="edFab" && b.id!=="addCardFab") edToDesk(); /* plant:fab-unrelated-rests */
  },true);
  /* Gone, the entry has no Save, Reset or Delete, whatever an editor does to its buttons later. */
  modalCard.addEventListener("click",e=>{
    if(edGone && e.target.closest && e.target.closest(ED_LOCKS)){ e.preventDefault(); e.stopPropagation(); return; }
    /* Only typing to drop: Reset shows the entry as the edition has it, the editor open. A saved change's Reset is the editor's own. */
    if(edEditionReset && edAgain && !(modalResetFn && modalResetFn()) && e.target.closest && e.target.closest(".mf-reset")){
      e.preventDefault(); e.stopPropagation();
      edStepping=true;
      try{ edAgain(); }finally{ edStepping=false; }
    }
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
/* Under the newer-edition line Reset is on even where only typing differs, as the line promises. */
let edSubject=null, edSubjectSig=null, edGone=false, edGoneLayer=false, edCause="", edSubjectTimer=null, edEditionReset=false;
function edSubjectNow(){
  try{ return edSubject ? edSubject() : undefined; }catch(e){ return undefined; }
}
function edSubjectOpen(cfg){
  edSubject=(edPlaceKind && typeof cfg.subject==="function") ? cfg.subject : null;
  edSubjectSig=edSubjectNow();
  edGone=false; edGoneLayer=false; edEditionReset=false;
}
/* A catalog taken: in the same layer the next difference is the edition's. Another layer, or local memory
   cleared or put back, leaves the editor with nothing it may write to: its entry is taken as gone. */
function edCatalogTaken(sameLayer){
  edCause=sameLayer ? "edition" : "layer";
  edWins.forEach(r=>{ if(r!==edActiveWin) r.cause=sameLayer ? (r.cause||"edition") : "layer"; });
}
function edCanSave(){ return !edGone && edCause!=="layer"; }   // the check runs a task after the desk draws
/* After the task that drew: an editor's own Save finishes, acknowledging its write, before the check asks. */
function edSubjectSoon(){
  Promise.resolve().then(()=>{
    clearTimeout(edSubjectTimer);
    edSubjectTimer=setTimeout(edSubjectCheck,0);
  });
}
function edSubjectCheck(){
  edRefreshShells();
  const cause=edCause;
  edCause="";
  if(!edPlaceKind || modalEl.hidden || !edSubject || edStepping || edGoneLayer) return;
  if(cause==="layer"){ edGoneLayer=true; edMarkGone(); return; }
  edRefreshNow(); /* plant:ed-refresh-in-hand */
  const now=edSubjectNow();
  if(now===undefined || now===edSubjectSig) return;
  if(now===null){ edMarkGone(); return; }
  if(!edDirty() && edAgain){
    edStepping=true;
    try{ edAgain(); }finally{ edStepping=false; }
    return;
  }
  edUnGone();
  const under=edAgain ? edMergeUnder() : null;
  edSubjectSig=edSubjectNow();
  if(cause!=="edition" && under===false) return;
  edEditionReset=cause==="edition";
  edSayLine(ED_LINES[edPlaceKind][cause==="edition" ? "edition" : "elsewhere"]);
  refreshDialogReset();
}
/* A field the person has not typed in takes the entry's new value, one they typed in keeps their typing: the editor is
   redrawn from the entry and the typed fields put back. Whether a typed field changed underneath, or null where the
   form's shape is not the same before and after, each typed field then put back into its own box. */
function edMergeUnder(){
  const base=edBaseTyped, was=edTyped();
  const same=(a,b)=>!!(a && b && a.fields.length===b.fields.length && a.segs.length===b.segs.length && String(a.keys)===String(b.keys));
  if(!same(base,was)) return null;
  const tf=was.fields.map((v,i)=>v!==base.fields[i]), ts=was.segs.map((v,i)=>v!==base.segs[i]);
  edStepping=true;
  try{ edAgain(); }finally{ edStepping=false; }
  const now=edTyped();
  if(!same(now,was)){ edRetype(was, {f:i=>tf[i], s:i=>ts[i]}); return null; }
  const under=now.fields.some((v,i)=>tf[i] && v!==base.fields[i] && v!==was.fields[i]) || now.segs.some((v,i)=>ts[i] && v!==base.segs[i] && v!==was.segs[i]);
  edRetype({fields:now.fields.map((v,i)=>tf[i] ? was.fields[i] : v), segs:now.segs.map((v,i)=>ts[i] ? was.segs[i] : v)});
  return under;
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
/* ---- SEVERAL EDITORS: one window for each kind, so up to three. The one in hand is #modalCard; the others stand as
   shells inside #modal above the scrim, each holding its editor's nodes and state, and the one brought forward is swapped
   back into #modalCard. Only the desk dims. Where each stands is edPlaceSync's. */
const ED_CHROME_IDS=["modalTitle","modalMin","modalX","edPrev","edNext"];
let edWins=[], edHist=[], edActiveWin=null, edSeq=0, edEntry=null, edRefresh=null;
function edWinOf(kind){ return edWins.filter(r=>r.kind===kind)[0]||null; }
function edFrontHist(rec){ edHist=edHist.filter(r=>r!==rec); edHist.push(rec); }
function edMulti(){ modalEl.classList.toggle("ed-multi", edWins.length>1); edMarks(); }
function edScrolls(root){
  return Array.prototype.filter.call(root.querySelectorAll("*"),x=>x.scrollTop>0).map(x=>[x,x.scrollTop]);
}
/* Everything dialog.js holds for the editor in hand, so a shell can carry it and give it back. */
function edWinState(){
  const at=document.activeElement;
  return {kind:edPlaceKind, again:edAgain, nameFn:modalNameFn, resetFn:modalResetFn, resetOn:modalResetOn, resetOff:modalResetOff,
    baseline:edBaseline, baseTyped:edBaseTyped, ret:edReturn, back:modalBack, editionReset:edEditionReset,
    subject:edSubject, sig:edSubjectSig, gone:edGone, goneLayer:edGoneLayer, entry:edEntry, refresh:edRefresh,
    focus:(at && modalCard.contains(at) && at!==modalCard) ? at : edEdFocus, cls:modalCard.className};
}
function edWinApply(h){
  modalNameFn=h.nameFn; modalResetFn=h.resetFn; modalResetOn=h.resetOn; modalResetOff=h.resetOff;
  edBaseline=h.baseline; edBaseTyped=h.baseTyped||null; edReturn=h.ret; modalBack=h.back; edAgain=h.again;
  edEditionReset=!!h.editionReset; edSubject=h.subject||null; edSubjectSig=h.sig; edGone=!!h.gone; edGoneLayer=!!h.goneLayer;
  edEntry=h.entry==null ? null : h.entry; edRefresh=h.refresh||null; edEdFocus=h.focus; edPlaceKind=h.kind;
}
function edWinClear(){
  edPlaceKind=null; edAgain=null; edBaseline=null; edBaseTyped=null; edReturn=null; modalBack=null; edEditionReset=false;
  edSubject=null; edSubjectSig=null; edGone=false; edGoneLayer=false; edEntry=null; edRefresh=null; edEdFocus=null;
  modalNameFn=null; modalResetFn=null;
}
function edShelve(){
  const rec=edActiveWin;
  if(!rec || !edPlaceKind) return null;
  const st=edWinState();
  const box={left:modalCard.offsetLeft, top:modalCard.offsetTop, width:modalCard.offsetWidth, height:modalCard.offsetHeight};
  const kept=edScrolls(modalCard);
  const sh=document.createElement("div");
  sh.className=modalCard.className+" ed-shell";
  sh.setAttribute("role","dialog");
  sh.tabIndex=-1;
  sh.style.left=box.left+"px"; sh.style.top=box.top+"px"; sh.style.width=box.width+"px"; sh.style.maxHeight=box.height+"px";
  Array.from(modalCard.childNodes||[]).forEach(k=>sh.appendChild(k));
  sh.querySelectorAll("[id]").forEach(el=>{
    if(ED_CHROME_IDS.indexOf(el.id)<0) return;
    el.setAttribute("data-ed-id",el.id);
    el.removeAttribute("id");
  });
  modalEl.insertBefore(sh, modalCard);
  kept.forEach(k=>{ k[0].scrollTop=k[1]; });
  /* A press or the keyboard reaching a shell brings its editor forward, and the press is then acted on there; in the showcase
     the press picks it. */
  sh.addEventListener("pointerdown",e=>{
    if(rec.shell!==sh) return;
    if(edShow){
      if(!rec.min) return;
      if(e.preventDefault) e.preventDefault();
      if(e.stopPropagation) e.stopPropagation();
      edShowPick(rec);
      return;
    }
    edActivate(rec,false);
  },true);
  sh.addEventListener("focusin",()=>{ if(rec.shell===sh && !edShow && !rec.min) edActivate(rec,false); });
  rec.shell=sh; rec.state=st;
  edActiveWin=null;
  edWinClear();
  modalCard.className="modal-card";
  edUnstand();
  return rec;
}
function edUnshelve(rec){
  const sh=rec.shell, st=rec.state;
  const kept=edScrolls(sh);
  modalCard.innerHTML="";
  modalCard.className=st.cls;
  sh.querySelectorAll("[data-ed-id]").forEach(el=>{ el.id=el.getAttribute("data-ed-id"); el.removeAttribute("data-ed-id"); });
  Array.from(sh.childNodes||[]).forEach(k=>modalCard.appendChild(k));
  sh.remove();
  rec.shell=null; rec.state=null;
  edWinApply(st);
  edActiveWin=rec;
  edPlaceSync();
  kept.forEach(k=>{ k[0].scrollTop=k[1]; });
  refreshDialogReset();
  /* What changed while it stood aside: what it shows of other entries, then its own entry. */
  edRefreshNow();
  edCause=rec.cause||"";
  rec.cause="";
  edSubjectCheck();
}
/* `keys` says the keyboard brought it, which puts the caret back where it was. */
function edActivate(rec, keys){
  if(!rec || rec===edActiveWin || !rec.shell) return;
  const at=document.activeElement;
  if(edRest && at && at!==document.body && !modalEl.contains(at)) edDeskFocus=at;
  rec.min=false;
  edShelve();
  edUnshelve(rec);
  edFrontHist(rec);
  edMulti();
  edRestEnd();
  edPlaceSync();
  if(keys) edFocusOn((edEdFocus && modalCard.contains(edEdFocus)) ? edEdFocus : modalCard);
}
/* F6: each editor showing in the order it was opened, then the desk with every editor minimised; from the desk, what the
   action button does. */
function edF6(){
  if(modalEl.hidden || !edActiveWin || edHeld || edShow) return false;
  if(edRest) return edFabPress();
  const list=edWins.filter(r=>!r.min).sort((a,b)=>a.seq-b.seq);
  const i=list.indexOf(edActiveWin);
  if(i>=0 && i<list.length-1){ edActivate(list[i+1],true); return true; }
  return edToDesk();
}
/* What another editor saved shows here too; typed fields are not touched, and a clean editor stays clean. */
function edRefreshNow(){
  if(!edRefresh) return;
  const clean=!edDirty();
  try{ edRefresh(); }catch(e){}
  if(clean) edMarkClean();
}
/* The editors standing aside show what was just saved, as the one in hand does on coming forward; a clean one stays clean. */
function edRefreshShells(){
  edWins.forEach(r=>{
    if(!r.shell || !r.state || !r.state.refresh) return;
    const clean=r.state.baseline===null || edFormState(r.shell)===r.state.baseline;
    try{ r.state.refresh(); }catch(e){}
    if(clean && r.state.baseline!==null){ r.state.baseline=edFormState(r.shell); r.state.baseTyped=edTyped(r.shell); }
  });
}
/* Asked from outside for the entry an editor already shows: that window comes forward, minimised or not, untouched, and the
   editor is not built again. An editor redrawing itself (Save, Reset, Prev and Next) is the one in front and passes. */
function edAlreadyOpen(kind, entry){
  if(entry==null || edStepping || modalEl.hidden) return false;
  const w=edWinOf(kind);
  if(!w) return false;
  if(w===edActiveWin){
    if(edEntry!==entry || !edRest) return false;
    edShowEnd();
    edToFront();
    return true;
  }
  if(w.state.entry!==entry) return false;
  edShowEnd();
  edActivate(w,true);
  return true;
}
/* The tour and a catalog taken whole close every editor, not only the one in hand, and so does Esc held. */
/* No close the person did not press loses typing silently: one Undo, the one a closed editor leaves, brings back every editor
   that held typing, each with it, the one in hand in front again. It stands above the tour, whose start is one
   of the acts that close them all, and pressing it ends the tour. */
function closeAllDialogs(){
  const kept=edDirtyWins();
  if(edShow){ edShow=false; modalEl.classList.remove("ed-show"); }
  edWins.forEach(r=>{ if(r.shell) r.shell.remove(); r.shell=null; });
  edWins=edActiveWin ? [edActiveWin] : [];
  edHist=edWins.slice();
  edMulti();
  if(!modalEl.hidden) closeModal();
  if(!kept.length) return;
  offerUndo("Moved on without saving the changes", ()=>edBringBack(kept), null, ()=>document.getElementById("catNow"));
  const u=document.getElementById("eUndo");
  if(u) u.classList.add("e-undo-top");
}
function edDirtyWins(){
  const out=[];
  edWins.forEach(r=>{
    if(r===edActiveWin){
      if(edAgain && edDirty()) out.push({seq:r.seq, again:edAgain, typed:edTyped(), front:1});
      return;
    }
    const sh=r.shell, st=r.state;
    if(!sh || !st || !st.again || st.baseline===null || edFormState(sh)===st.baseline) return;
    out.push({seq:r.seq, again:st.again, typed:edTyped(sh), front:0});
  });
  return out.sort((a,b)=>(a.front-b.front) || (a.seq-b.seq));
}
function edBringBack(kept){
  if(hooks.tourActive && hooks.tourActive() && hooks.endTour) hooks.endTour(false);
  kept.forEach(k=>{
    edStepping=true;
    try{ k.again(); }finally{ edStepping=false; }
    edRetype(k.typed);
  });
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
  wireModalX, wireModalBody, wireFocusModality, wireEditorPlace, wireEditorRest, modalFront, edResting, edToDesk, edToFront, edF6, edAlreadyOpen, closeAllDialogs, edSubjectSoon, edSubjectCheck, edCatalogTaken, edCanSave,
  edMinimise, edFabPress, edShowing, edKeys,
  accOpen, accHtml, mfSec, catToggle, wireFolds, wireAcc,
  openDialog, refreshDialogName, refreshDialogChrome,
  dressDialogInputs,
  edNavHtml, edWireNav, edMarkClean, edDirty, edStepLang,
};
