import { pills } from "./dom.js";
import { intentCats, scrollRailTop, displayCatOrder } from "./cat-relevance.js";
import { searchCounts, totalMacroCount, counts } from "./card-counts.js";
import { catIconSvg, catSlot } from "./cat-identity.js";
import { ICON_ALL, ICON_EDIT, ICON_PLUS } from "./icons.js";
import { esc } from "./esc.js";
import { t, toast } from "./ui-lang.js";
import { captureRail, railRelKeys, railEchoRedraw } from "./rail-list.js";
import { drawPills, scheduleTabSave } from "./tabs.js";
import { animateReorder } from "./paint.js";
import { CATS } from "./content-model.js";
import { nsDel } from "./storage.js";
import { rebuildCards } from "./rebuild.js";
import { mgReduceMotion } from "./motion.js";
import { schedulePillsCollapse } from "./pills-box.js";
import { cats, setCatsDropArmed, setCats, setPendingScrollHit, intentIdxs, setCatOrder } from "./app-state.js";
import { hooks } from "./hooks.js";

/* The pill drag's own state, started here in the pointerdown this file writes and finished in
   paint.js, which moves the pills: each is replaced wholesale, so each takes a setter. */
let dragState=null, suppressClick=false, swapLock=0;
function setDragState(v){ dragState=v; }
function setSuppressClick(v){ suppressClick=v; }
function setSwapLock(v){ swapLock=v; }
// The category bar itself: the row of pills, the inline add, and the capture half of its FLIP.

/* drawPills() wraps this to repaint the tab accents; the wrapper sits beside syncTabAccent. */
function drawPillsCore(){
  /* The + button is the bar's one focusable control, and a redraw replaces its node
     UNDER a keyboard user's focus when the language key or the tab key redraws the bar's
     labels. Text fields keep focus through such a switch by not being redrawn; the +
     earns the same by hand. */
  const addHadFocus=document.activeElement&&document.activeElement.classList
    &&document.activeElement.classList.contains("pill-add");
  pills.innerHTML="";
  const hc=intentCats();
  const mk=(id,label,n,drag)=>{
    const b=document.createElement("div");
    let extra="";
    const on = id ? cats.indexOf(id)>-1 : cats.length===0;   // "All" is on when nothing is
    // Keep intent/always hints even when the pill is selected (combined with .on in CSS).
    if(id){
      if(hc.specific.indexOf(id)>-1) extra=" hint2";        // issue-relevant - green ring
      else if(hc.always.indexOf(id)>-1) extra=" hint";      // always needed - blue ring
    }
    b.className="pill"+(on?" on":"")+extra
      +((searchCounts() && id && !n) ? " pill-nohit" : "");
    // Count including 0 - an empty category gets a 0 badge rather than no badge.
    // esc(label): names come from catalogs and renames - Import promises the file is
    // "read as data, never executed", and an unescaped label here broke that promise.
    b.innerHTML=(id
        ?catIconSvg(id)
        :'<svg class="e-pillall" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+ICON_ALL+'</svg>')
      /* data-i18n-skip: a category name belongs to whoever wrote the catalog. #pills lives
         inside <header>, which translateChrome sweeps - without the marker, a label that
         collided with an engine string was silently rewritten the moment the interface
         went Polish. All is unaffected: its label goes through t() at the call site. */
      +'<span class="pill-lab" data-i18n-skip>'+esc(label)+'</span>'
      /* ONE SLOT, TWO STATES: the card count, and a pencil while Ctrl is held. The pencil
         replaces the COUNT, which every category pill has - so every category is editable,
         which earlier shapes could not manage. Deleting lives in the editor the pencil
         opens, greyed with a reason instead of simply not existing. Same mechanic as the
         panel's star-to-hide swap, same body class, same instant-CSS reason. */
      +(id
        ? '<span class="pill-r">'
          +((n||n===0)?'<b>'+n+'</b>':"")
          +'<span class="pill-e" data-editcat="'+esc(id)+'" title="'+esc(t("Edit this category's names, icon and colour"))+'" aria-label="'+esc(t("Edit this category"))+'">'+ICON_EDIT+'</span>'
          +'</span>'
        : ((n||n===0)?" <b>"+n+"</b>":""));
    b.dataset.k=id;
    const _cs=catSlot(id);
    if(_cs>=0) b.dataset.ec=_cs;
    if(id){
      let tip=t("Click to filter · Ctrl+click to add/remove · drag to reorder");
      /* Green describes what the category HOLDS - a card linked to the chosen intent. Blue
         describes the category itself. */
      tip+=" · "+t("hold Ctrl to edit it");
      if(extra.indexOf("hint2")>-1) tip+=" · "+t("Green ring: holds a card linked to the chosen intent");
      else if(extra.indexOf("hint")>-1) tip+=" · "+t("Blue ring: a supporting category");
      b.title=tip;
    }
    if(drag && dragState && dragState.moved && dragState.key===id) b.classList.add("dragging");
    b.onclick=ev=>{
      if(suppressClick){ suppressClick=false; return; }   // finished a drag, not a click
      setCatsDropArmed(false);                                 // chosen by hand outranks the arming
      /* Before the pill's own handler, and stopping the event dead: a Ctrl+click on a pill means
         "add this category to the selection", and the pencil sits inside the pill. */
      const ed=ev&&ev.target&&ev.target.closest?ev.target.closest("[data-editcat]"):null;
      if(ed){ ev.preventDefault(); ev.stopPropagation(); hooks.openCategoryEditor(ed.getAttribute("data-editcat"),true); return; }
      // Captured before cats changes, so the rail's echo animates from where it really was
      const railBefore=captureRail(), relBefore=railRelKeys();
      if(!id){ setCats([]); }                                  // "All" clears the filter
      else if(ev && (ev.ctrlKey||ev.metaKey)){             // ctrl+click adds/removes
        const at=cats.indexOf(id);
        if(at>-1) cats.splice(at,1); else cats.push(id);
      }
      else setCats((cats.length===1 && cats[0]===id) ? [] : [id]);
      // Opening a category while an intent is selected → jump to its linked entries
      setPendingScrollHit(!!intentIdxs.length);
      drawPills(); hooks.render();
      railEchoRedraw(railBefore, relBefore);
      scrollRailTop();
      scheduleTabSave();
    };
    // Pointer-based dragging. HTML5 drag-and-drop gave a no-drop cursor and never
    // fired drop; pointer events also let the list reorder live, under the cursor.
    if(drag) b.onpointerdown=e=>{
      if(e.pointerType==="touch") return;   // taps are taps - see the rail rows for the story
      if(e.button!==0) return;
      if(e.target.closest&&e.target.closest("[data-editcat]")) return;   // the pencil is not a drag handle
      // clear any stale suppression: a drag that ended over a different pill fires its
      // click on the container, so the flag would otherwise swallow the NEXT real click
      suppressClick=false;
      dragState={key:id,x:e.clientX,y:e.clientY,moved:false};
    };
    pills.appendChild(b);
  };
  const _sc=searchCounts();
  const PN=k=>_sc ? (k==="" ? (_sc.__all||0) : (_sc[k]||0))
                  : (k==="" ? totalMacroCount() : (counts[k]||0));
  mk("",t("All"),PN(""),false);   // cards, like every other pill - not cards
  // double-click "All" restores the original order
  pills.firstChild.title=t("Show all categories; double-click to reset their order");
  pills.firstChild.ondblclick=()=>animateReorder(()=>{
    setCatOrder(Object.keys(CATS));
    nsDel("CatOrder");
  });
  displayCatOrder(hc).forEach(k=>{
    if(!CATS[k]) return;
    mk(k,CATS[k],PN(k),true);          // empty categories included, with a 0 badge
  });
  /* "+" sits after the last category, mirroring Manage's. Appended outside catOrder and
     not draggable - a control, not a category. A real <button>, the bar's only focus
     stop: pills are drag-and-toggle surfaces, this one ACTS, and a button is what a click,
     a screen reader and Enter expect of it. Focus is not walked on this screen - Tab and
     Shift+Tab are bound, the owner's call - so a click is its way in. The drag logic keys
     off dataset.k, which this never carries. */
  const add=document.createElement("button");
  add.type="button";
  add.className="pill pill-add";
  add.innerHTML=ICON_PLUS;         // drawn, not typed - see .pill-add for why
  add.title=t("Add a category");
  add.setAttribute("aria-label",t("Add a category"));
  add.onclick=()=>startPillCatAdd(add);
  pills.appendChild(add);
  if(addHadFocus) add.focus();
  // Two rAFs: wait for layout after DOM rebuild, then measure overflow.
  schedulePillsCollapse();
}
/** Inline category creation from the pill strip. Same contract as the Manage chip: type,
 *  Enter to accept, Esc or an empty blur to cancel. */
function startPillCatAdd(addEl){
  if(!pills || pills.querySelector(".pill-new")) return;
  const wrap=document.createElement("div");
  wrap.className="pill pill-new";
  wrap.innerHTML='<input type="text" placeholder="'+esc(t("New category"))+'" spellcheck="false" autocomplete="off">';
  pills.insertBefore(wrap, addEl);
  addEl.hidden=true;
  const inp=wrap.querySelector("input");
  const finish=ok=>{
    const name=inp&&inp.value?inp.value.trim():"";
    wrap.remove();
    addEl.hidden=false;
    if(!ok||!name) return;
    hooks.ensureCustomCat(name);
    rebuildCards();
    toast("Category added");
  };
  inp.focus();
  /* Keyboard exits hand focus back to the +; a mouse-blur leaves it where the user
     clicked. Queried, not the captured addEl: accepting rebuilds the bar and the
     closure's node is detached - the query finds the fresh one (and IS the captured one
     on the cancel path, where nothing redraws). */
  const refocus=()=>{ const a=pills.querySelector(".pill-add")||addEl; a.focus(); };
  // stopPropagation, or Enter and Esc also reach the app's global shortcut handling
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); finish(true); refocus(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(false); refocus(); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(!!(inp.value&&inp.value.trim())); },0); };
}

// FLIP: measure where every pill is, apply the change, then animate each one from
// its old box to its new one. Cheap, and it survives pills wrapping to a new line.
/* FLIP split in two halves so the capture can precede a state change that is not a
   simple mutate() callback - intent selection regroups the pills from several call
   sites, and those sites capture, change, redraw, then flip. Opt-in per call site rather
   than folded into drawPills(): most callers (tab restore, rename, wipe) should redraw
   instantly with no motion. */
/** Rects of every pill, keyed by category key. The "first" half of a FLIP. */
/* THE FLIPS ANSWER THE SWITCH AT THEIR CAPTURE: one handed nothing plays nothing, and every
   caller already treats an empty capture as "redraw, do not animate". Same in the two below. */
function capturePills(){
  if(mgReduceMotion()) return null;
  const before={};
  pills.querySelectorAll(".pill").forEach(p=>{ if(p.dataset.k) before[p.dataset.k]=p.getBoundingClientRect(); });
  return before;
}
export {
  dragState,
  suppressClick,
  swapLock,
  setDragState,
  setSuppressClick,
  setSwapLock,
  drawPillsCore,
  startPillCatAdd,
  capturePills,
};
