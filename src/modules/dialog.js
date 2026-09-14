/* The window every dialog is drawn inside: the fold families, the opener and its chrome, the
   pass that fades a cut line, and the navigation an editor carries. */
import { markCutText } from "./cut-text.js";
import { ICON_CHEVRON_R, ICON_X } from "./icons.js";
import { mgOpen } from "./manage.js";
import { animateModalHeightFrom, animatePinnedHeight, mgAccordion, mgPinCard, mgReduceMotion } from "./motion.js";
import { formatActionChord } from "./shortcuts.js";
import { scStopCapture } from "./shortcuts-list.js";
import { ask, t, tc, translateTree } from "./ui-lang.js";
import { esc } from "./esc.js";

function modalOpen(){ return !modalEl.hidden; }
/* ---- SHARED MODAL BEHAVIOUR ---------------------------------------------------------------
   One implementation per behaviour, reused by every dialog. The height animator is the case
   in point: it operates on modalCard and nothing else, so it lives here rather than among
   any one dialog's code wearing its prefix. */
/* Which sections are open, by id. A Set like the Library's mgOpen, for the same reason: the
   state belongs to the user's session, not to the markup that gets rebuilt under it.
   Settings holds at most one - mgAccordion shuts the rest. */
/* Interface language leads: it is the reason most people open Settings the first time,
   and the only section whose effect is visible the moment it changes. */
const accOpen=new Set(["language"]);
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
  b.disabled=!live;
  b.title=t(live?modalResetOn:modalResetOff);
}
/** Both halves of a heading that has to keep up with its own screen. */
function refreshDialogChrome(){ refreshDialogName(); refreshDialogReset(); }
function openDialog(cfg){
  if(!modalEl||!modalCard) return;
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
let edBaseline="";
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
function edDirty(){ return edFormState()!==edBaseline; }
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
  const i=list.indexOf(cur);
  const step=d=>{
    const j=i+d;
    if(i<0||j<0||j>=list.length) return;
    if(edDirty() && !ask(t("This card has unsaved changes. Leave it without saving?"))) return;
    edNavTo(()=>go(list[j]));
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
  const strip=modalCard&&modalCard.querySelector(".lang-tabs");
  if(!strip) return false;
  const tabs=Array.prototype.slice.call(strip.querySelectorAll("button[data-l]"));
  let i=tabs.findIndex(x=>x.classList.contains("on"));
  if(i<0) i=0;
  const j=i+dir;
  if(j<0||j>=tabs.length) return false;
  tabs[j].click();
  return true;
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
  const back=modalBack;
  modalBack=null;
  if(back) back(); else closeModal();
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
var modalOpener=null;
function closeModal(){
  scStopCapture();
  modalBack=null;
  modalEl.hidden=true;
  modalCard.classList.remove("about-modal","mt-modal");
  modalCard.innerHTML="";
  const back=modalOpener;
  modalOpener=null;
  // Gone if its own screen was rebuilt while the dialog stood over it.
  if(back && document.contains(back) && typeof back.focus==="function"){
    try{ back.focus({preventScroll:true}); }catch(e){ try{ back.focus(); }catch(e2){} }
  }
}
/* THE CARD IS THE WHOLE KEYBOARD while it is up: the markup says aria-modal, and the scrim
   takes the mouse, but Tab walked off the card and into the header behind it - reachable and
   pressable, with nothing on screen to say where the caret had gone. Returns the far end when
   focus is leaving, and null when it is not, so an ordinary Tab inside the card is untouched. */
const MODAL_TABBABLE="a[href],button:not([disabled]),input:not([disabled]),"
  +"select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
function modalTabTarget(back){
  if(!modalCard) return null;
  const els=Array.prototype.filter.call(modalCard.querySelectorAll(MODAL_TABBABLE),
    el=>el.offsetWidth>0 || el.offsetHeight>0 || el===document.activeElement);
  if(!els.length) return null;
  const at=document.activeElement;
  if(!modalCard.contains(at)) return back?els[els.length-1]:els[0];
  if(back && at===els[0]) return els[els.length-1];
  if(!back && at===els[els.length-1]) return els[0];
  return null;
}

export {
  modalOpen, modalTabTarget, mountModalBody, modalResize, dismissModal, closeModal,
  wireModalX, wireModalBody,
  accOpen, accHtml, mfSec, catToggle, wireFolds, wireAcc,
  openDialog, refreshDialogName, refreshDialogChrome,
  dressDialogInputs,
  edNavHtml, edWireNav, edMarkClean, edStepLang,
};
