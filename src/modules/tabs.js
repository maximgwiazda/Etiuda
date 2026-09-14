import { CATS, SW_EN } from "./content-model.js";
import { applyCut, cutSides } from "./dialog.js";
import { ICON_TAB_X, ICON_TAB_ADD } from "./icons.js";
import { mgReduceMotion } from "./motion.js";
import { drawIntentRail } from "./rail-list.js";
import { formatActionChord, tabAddTitle } from "./shortcuts.js";
import { lsGet, ssGet, ssSet } from "./storage.js";
import { t } from "./ui-lang.js";
import { shedSnap, shedStage, shedAnimate, shedHeld, shedHold, eShedNat } from "./shed.js";
import { scheduleRailGeometry } from "./rail-panel.js";
import { catSlot } from "./cat-identity.js";
import { pageScrollY, pageScroller } from "./page-scroll.js";
import { cssEsc } from "./css-esc.js";
import { syncIntentClearBtns } from "./intent-clear.js";
import { intentEscapeStep } from "./escape-ladder.js";

// ---- booking tabs (shared settings; per-tab language / PAX / intent / ROLE / cats / search) --
const TAB_KEY="pbSessionTabs";
let tabs=[], activeTabId=null;
let tabSaveTimer=null;

function blankTab(){
  return {
    id:"t"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    title:"",
    /* Seeded from the language on screen, which at boot is the one restored from storage and
       thereafter is the active tab's. So a new tab opens in the language you are already working
       in, and a fresh launch resumes where you left off - neither snaps back to English. */
    lang:lang,
    pax:"",
    intentIdxs:[],
    intentText:"",
    intentBox:"",
    who:"",
    cats:[],
    entrySel:null,
    scrollY:0
  };
}
function tabLabel(tb, i){
  // tb.title is IGNORED on purpose - renaming is retired, but sessions saved before that
  // may still carry titles (inert, not poisonous); a tab is named by the person in it, or
  // by its number.
  if(tb&&tb.pax&&String(tb.pax).trim()){
    return String(tb.pax).trim().split(/\s+/)[0];
  }
  /* The default name is the one thing on a tab the engine wrote, so it translates - and the
     translation is why it does not always fit. TAB_FLOOR_W is the width at which "Tab 99"
     stands whole, with a tenth of a pixel over; "Rozmowa 99" wants 38px more than the floor
     leaves, so a full Polish strip fades its numbered tabs like any other name. */
  return t("Tab")+" "+((i!=null?i:tabs.indexOf(tb))+1);
}
function snapshotActiveTab(){
  if(!activeTabId) return;
  const t=tabs.find(x=>x.id===activeTabId);
  if(!t) return;
  t.lang=lang;
  t.pax=pax?pax.value:"";
  t.intentIdxs=intentIdxs.slice();
  t.intentText=intentText;
  t.intentBox=intentEl?intentEl.value:"";
  t.who=roleSel?roleSel.value:"";
  t.cats=cats.slice();
  t.entrySel=entrySel?{id:entrySel.id, vi:entrySel.vi}:null;
  t.scrollY=pageScrollY();
}
function saveTabSession(){
  snapshotActiveTab();
  try{
    ssSet(TAB_KEY, JSON.stringify({v:1, tabs:tabs, activeTabId:activeTabId}));
  }catch(e){}
}
function scheduleTabSave(){
  snapshotActiveTab();
  drawTabs();
  clearTimeout(tabSaveTimer);
  tabSaveTimer=setTimeout(saveTabSession, 250);
}
function loadTabSession(){
  try{
    const data=JSON.parse(ssGet(TAB_KEY)||"null");
    if(!data||!Array.isArray(data.tabs)||!data.tabs.length) return false;
    /* Restored state is validated against the catalog that is loaded NOW - sessionStorage
       is per origin, and on file:// that means per folder, so a standalone build picks up
       whatever a previous Etiuda left in that tab.
       An unknown category filter is the dangerous one: cardInActiveCats() matches nothing,
       drawPills() draws no pill to un-click, and the empty screen survives reloads.
       Out-of-range intent indices go the same way: they point into a shorter SW_* array. */
    /* A tab saved against the retired Favourites pill fails this and drops its filter, so the
       tab opens on All - where its favourites now lead the list anyway. */
    const catOk=k=>!!CATS[k];
    const intentOk=i=>Number.isInteger(i)&&i>=0&&i<SW_EN.length;
    tabs=data.tabs.map(t=>Object.assign(blankTab(), t, {
      // Honour a stored value; a record from before tabs carried a language falls back to the
      // restored last-used one rather than being forced to English.
      lang:(t.lang==="pl"||t.lang==="en")?t.lang:lang,
      intentIdxs:Array.isArray(t.intentIdxs)?t.intentIdxs.filter(intentOk):[],
      cats:Array.isArray(t.cats)?t.cats.filter(catOk):[]
    }));
    activeTabId=data.activeTabId;
    if(!tabs.some(t=>t.id===activeTabId)) activeTabId=tabs[0].id;
    return true;
  }catch(e){ return false; }
}
function applyTab(tb){
  if(!tb) return;
  activeTabId=tb.id;
  if(pax) pax.value=tb.pax||"";
  if(roleSel) roleSel.value=tb.who||"";
  intentIdxs=Array.isArray(tb.intentIdxs)?tb.intentIdxs.slice().filter(i=>Number.isInteger(i)&&i>=0&&i<SW_EN.length):[];
  intentText=tb.intentText||"";
  cats=Array.isArray(tb.cats)?tb.cats.slice():[];
  if(tb.entrySel&&tb.entrySel.id!=null){
    entrySel={id:String(tb.entrySel.id), vi:+tb.entrySel.vi||0};
  } else {
    entrySel=null;
  }
  pickRun=false;   // a run does not span tabs

  // Before the intent sync below: the placeholder, the dropdown and {INTENT} are all per-language.
  applyLangUI(tb.lang);
  updateIntentPlaceholder();
  if(intentEl){
    intentEl.value=tb.intentBox||"";
    intentEl.classList.toggle("set", !!(tb.intentBox&&String(tb.intentBox).trim())||intentIdxs.length>0);
  }
  syncIntentClearBtns();
  syncRoleDrum();   // the drum shows the tab's own role

  // Refresh clear-button disabled states without firing oninput (avoids re-entrant tab save)
  const paxClear=$("#paxClear"); if(paxClear) paxClear.disabled=!String(pax&&pax.value||"").length;

  drawPills();
  drawIntentRail();
  render();
  drawTabs();
  requestAnimationFrame(()=>{
    try{ pageScroller().scrollTop=tb.scrollY||0; }catch(_){}
    scheduleRailGeometry();
    /* After drawTabs, so the element measured is the one now on screen. A tab you switch to
       must be visible even when it sits off the end of a scrolled strip - otherwise the
       selection moves somewhere you cannot see, which is the one thing a scrolling strip can
       get badly wrong. */
    scrollTabIntoView(tb.id);
  });
}
function switchTab(id){
  if(!id||id===activeTabId) return;
  snapshotActiveTab();
  const t=tabs.find(x=>x.id===id);
  if(!t) return;
  applyTab(t);
  saveTabSession();
}
/* Wraps, and a lone tab is a handled no-op rather than a fall-through: the key must never
   walk focus on one tab and switch on two. */
function stepTab(dir){
  if(tabs.length<2) return;
  const i=tabs.findIndex(x=>x.id===activeTabId);
  switchTab(tabs[(i+dir+tabs.length)%tabs.length].id);
}
/* A new tab GROWS into place - WIDTH, not transform. The tabs do not merely move, they
   RESIZE: applyTabWidths divides the strip evenly, and scaling a tab horizontally would
   squash its label. Animating a layout property is normally forbidden - it is why the card
   list uses transforms - but the exception is bounded: only tabs ABOVE the width floor
   resize, roughly available width over TAB_FLOOR_W of them, and once the strip is at the
   floor and scrolling, opening a tab resizes nothing and only the newcomer animates. If
   the insert ever reads heavy on a wide window with many tabs, this is the line to
   revisit.
   The strip's own width is animated too: applyTabWidths sets it explicitly, and left to
   jump it would put the + button in its final place a fifth of a second before the tab
   that pushed it there had arrived.
   Targets are READ OFF the elements rather than recomputed: applyTabWidths has already
   written the finished geometry inline by the time mutate() returns, so there is one
   formula for a tab's width and not two that can drift apart. */
// Set while the strip is mid-animation, so fitTabLabels leaves the labels alone - see there.
let tabInsertAnimating=false;
/* Built when a tab is inserted rather than once at the top: E_EASE is the whole app's
   easing and a module evaluates before the app body that declares it. */
function tabGrow(){
  return ["width","max-width","min-width","flex-basis"].map(k=>k+" .19s "+E_EASE).join(",")
    +",opacity .16s ease";
}
function animateTabInsert(mutate){
  const bar=$("#tabsBar");
  if(!bar || mgReduceMotion()){ mutate(); return; }
  const was={}, barWas=bar.getBoundingClientRect().width;
  bar.querySelectorAll(".tab[data-tid]").forEach(el=>{
    was[el.dataset.tid]=el.getBoundingClientRect().width;
  });
  /* THE HEADER MOVES WITH THE STRIP, NOT BESIDE IT. A tab that takes the wordmark rebuilds
     the row inside mutate(), and the strip's left edge jumped 58px in a single frame while
     the grow began 20ms later - two events where the eye wants one. Staged at the mutation
     rather than in the grow's rAF, because by then the jump has already been painted; a
     glide is a transform and needs none of the wait a width animation does. Same curve. */
  const shedBefore=shedSnap();
  shedHold(mutate);
  const shedGo=shedBefore?shedStage(shedBefore):null;
  const els=[].slice.call(bar.querySelectorAll(".tab[data-tid]"));
  if(!els.length) return;
  const to=els.map(el=>({fl:el.style.flex, w:el.style.width,
                         mx:el.style.maxWidth, mn:el.style.minWidth}));
  const barTo={fl:bar.style.flex, w:bar.style.width,
               mx:bar.style.maxWidth, mn:bar.style.minWidth};
  /* Read on the settled FINAL geometry mutate() just wrote, before the from-state rewinds
     it: will the finished strip overflow? If so, the new tab's home is past the aperture's
     right edge, and without help the whole grow plays off-screen - the strip snaps to it
     at completion and the tab simply appears. So PIN the right edge for the duration: the
     newcomer unfurls out of the right wall while the older tabs slide left to make room,
     which is also how Firefox's own strip stages an insert. Pinning is per-frame because
     scrollWidth grows every frame of the transition, and the assignment clamps itself. */
  const pinEnd=bar.scrollWidth-bar.clientWidth>TAB_SCROLL_EPS;
  const set=(el,fl,w)=>{ el.style.flex="0 0 "+fl; el.style.width=w;
                         el.style.maxWidth=w; el.style.minWidth=w; };
  tabInsertAnimating=true;
  els.forEach(el=>{
    const w0=was[el.dataset.tid];
    el.style.transition="none";
    if(w0==null){
      /* The new one. min-width goes to 0 as well or the tab's own floor holds it open, and
         overflow is clipped so the label does not spill out of a box that is not there yet. */
      set(el,"0px","0px");
      el.style.opacity="0";
      el.style.overflow="hidden";
    } else {
      set(el,w0+"px",w0+"px");
    }
  });
  bar.style.transition="none";
  set(bar, barWas+"px", barWas+"px");
  // Commit the start before attaching the transition - see the note in flipPills().
  void bar.offsetHeight;
  if(pinEnd){ cancelTabScroll(); bar.scrollLeft=bar.scrollWidth; }   // staged before first paint
  /* ATTACHED AFTER THE REBUILT FRAME HAS PAINTED, two frames on. Width is a main-thread
     animation: attached in this task it starts at the style flush, and the first paint of the
     new tab's list, a full render, eats its opening third - Firefox drew seven widths of a
     .19s grow. Transform glides ride the compositor and need no such wait. */
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
  els.forEach((el,i)=>{
    el.style.transition=tabGrow();
    el.style.flex=to[i].fl; el.style.width=to[i].w;
    el.style.maxWidth=to[i].mx; el.style.minWidth=to[i].mn;
    el.style.opacity="";
  });
  bar.style.transition=tabGrow();
  bar.style.flex=barTo.fl; bar.style.width=barTo.w;
  bar.style.maxWidth=barTo.mx; bar.style.minWidth=barTo.mn;
  if(shedGo) shedGo();          // the header lets go in this frame, not the one it was staged in
  if(pinEnd){
    (function pin(){                   // an in-flight arrow press would fight the pin frame by frame
      if(!tabInsertAnimating) return;
      bar.scrollLeft=bar.scrollWidth;
      requestAnimationFrame(pin);
    })();
  }
  // Hand the inline styles back afterwards, then fit the labels once, to boxes that have stopped.
  setTimeout(()=>{
    els.forEach(el=>{ el.style.transition=""; el.style.opacity=""; el.style.overflow=""; });
    bar.style.transition="";
    tabInsertAnimating=false;
    fitTabLabels();
    /* Everything that declined to run mid-animation settles here, against boxes that have
       stopped moving: the overflow measurement (arrows, class, disabled states) and the reveal
       of the tab that was just opened - which, on a strip already scrolled elsewhere, is the
       one moment the reveal genuinely matters. */
    updateTabOverflow();
    if(activeTabId) scrollTabIntoView(activeTabId);
    /* The header shed sync deferred itself while the grow ran - adding a tab can change the
       shed step, and a class toggle mid-animation re-lays the row under the moving tabs.
       Nothing that moves the row runs until the boxes stop. */
    if(typeof scheduleHeaderSync==="function") scheduleHeaderSync();
  },230);
  }));
}
function addTab(){
  snapshotActiveTab();
  const t=blankTab();
  // applyTab() redraws the strip, so the whole insert happens inside the one capture
  animateTabInsert(()=>{ tabs.push(t); applyTab(t); });
  saveTabSession();
  try{ intentEl&&intentEl.focus({preventScroll:true}); }catch(_){}
  toast("The new tab starts with cleared fields and your settings kept.");
}
function closeTab(id, ev){
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  const idx=tabs.findIndex(x=>x.id===id);
  if(idx<0) return;
  if(tabs.length===1){
    const keepId=tabs[0].id;
    tabs[0]=Object.assign(blankTab(),{id:keepId});
    applyTab(tabs[0]);
    saveTabSession();
    toast("Tab cleared");
    return;
  }
  const wasActive=id===activeTabId;
  tabs.splice(idx,1);
  if(wasActive){
    applyTab(tabs[Math.max(0, idx-1)]);
  } else {
    drawTabs();
  }
  saveTabSession();
}
/* THE LAST THING ESCAPE CAN SHED IS THE DESK, AND IT ASKS FIRST. Every rung above this one
   gives back something a keystroke rebuilds - a panel, a mode, a selection. This one drops
   every open conversation's PAX, ROLE, filter and box at once and nothing brings them back,
   so a stray press must not reach it. The second press has to land while the toast that
   asked for it is still up, so the window is the toast's own life. */
let tabWipeArmedAt=0, tabWipeToast=-1;
function tabHasWork(tb){
  if(!tb) return false;
  return !!(String(tb.pax||"").trim() || String(tb.intentBox||"").trim()
    || String(tb.who||"").trim() || String(tb.intentText||"").trim()
    || (tb.cats&&tb.cats.length) || (tb.intentIdxs&&tb.intentIdxs.length));
}
/* One blank tab is what "all closed" means - the same end state closing the last tab
   already produces, and it keeps that tab's id so the strip does not blink. */
function closeAllTabs(){
  const keepId=tabs[0]?tabs[0].id:null;
  tabs=[keepId?Object.assign(blankTab(),{id:keepId}):blankTab()];
  applyTab(tabs[0]);
  saveTabSession();
  toast("All tabs closed");
}
function escCloseAllTabsStep(){
  snapshotActiveTab();
  if(tabs.length<=1 && !tabHasWork(tabs[0])){ tabWipeArmedAt=0; return false; }
  const now=Date.now();
  /* THE ASKING TOAST IS THE WINDOW. Time alone let a second Escape land on a message that
     had already been replaced by another, wiping every tab with nothing on screen asking. */
  if(now-tabWipeArmedAt>TOAST_MS || toastSerial!==tabWipeToast){
    toast("Press Esc again to close all tabs");
    tabWipeArmedAt=now; tabWipeToast=toastSerial;
    return true;
  }
  tabWipeArmedAt=0;
  closeAllTabs();
  return true;
}
/* THE LADDER ITSELF. Two doors reach it - the shortcut and the intent box's own key
   handler - and they must climb the same rungs or a press means different things
   depending on where the caret happens to be. */
function escapeLadderStep(){
  if(intentEscapeStep()) return true;
  return escCloseAllTabsStep();
}
let tabDrag=null, tabSwapLock=0, tabSuppressClick=false;
function animateTabReorder(mutate){
  const bar=$("#tabsBar");
  if(!bar || mgReduceMotion()){ mutate(); drawTabs(); return; }
  const before={};
  bar.querySelectorAll(".tab[data-tid]").forEach(el=>{
    before[el.dataset.tid]=el.getBoundingClientRect();
  });
  mutate();
  drawTabs();
  const moved=[];
  bar.querySelectorAll(".tab[data-tid]").forEach(el=>{
    const id=el.dataset.tid, b=id&&before[id];
    if(!b) return;
    const a=el.getBoundingClientRect();
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    el.style.transition="none";
    el.style.willChange="transform";    // see the note in flipPills
    el.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(el);
  });
  if(!moved.length) return;
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void bar.offsetHeight;
  moved.forEach(el=>{
    el.style.transition="transform .18s "+E_EASE;
    el.style.transform="";
    setTimeout(()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; }),200);
  });
}
function moveTab(from,to){
  if(from===to||from<0||to<0) return;
  animateTabReorder(()=>{ tabs.splice(to,0,tabs.splice(from,1)[0]); });
}
function endTabDrag(){
  if(!tabDrag) return;
  const didMove=!!tabDrag.moved;
  tabDrag=null;
  document.documentElement.classList.remove("tabdrag");
  const bar=$("#tabsBar");
  if(bar) bar.querySelectorAll(".tab").forEach(el=>el.classList.remove("dragging"));
  if(didMove){
    tabSuppressClick=true;
    saveTabSession();
  }
}
/** Equal tab widths (clamped 52-210). Bar width tracks the tab strip so + (sibling) never
 *  slides left over tab outlines when the window keeps shrinking past min tab width.
 *  Wordmark collapse: below 560px only the Etiuda tile remains, so reserve the wordmark's whole
 *  width plus its flex gap - tab widths stay stable while the strip moves toward the tile. */
/* THE FLOOR - how narrow a tab may get before the strip scrolls instead. Above it, tabs
   shrink with the window - the behaviour worth keeping; below it the row scrolls and tabs
   hold their size. 100 is where "Tab 99" fits whole beside its close chip and the
   category dot's 12px inset: a default title is always said in full. Keep .tab's
   min-width in step. */
let TAB_FLOOR_W=100;
/* Scroll state is a MEASUREMENT, never a tab count: four tabs overflow in a narrow window and
   not in a wide one, so asking the pixels is the only version of this that is right at every
   size. EPS absorbs sub-pixel layout, which otherwise leaves an arrow enabled at a hard edge
   that cannot move - Firefox's own widget carries the same guard for the same reason. */
const TAB_SCROLL_EPS=1;
function updateTabOverflow(){
  const bar=$("#tabsBar"), wrap=$("#tabsWrap");
  if(!bar||!wrap) return;
  /* NOTHING here runs while the insert grow is in flight - not the reflow, not the class
     toggle, not the disabled states. The new tab's inter-tab margin lands instantly while
     the widths animate, so for the first frames the strip measures overflowing by a
     transient sliver; the ResizeObserver sees every animated frame, and flipping
     .tabs-over mid-grow pops the arrows in and shoves the whole row sideways, then undoes
     it as the animation catches up. The settle this skips runs when the animation hands
     its inline styles back, against boxes that have stopped moving. */
  if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
  const over=bar.scrollWidth-bar.clientWidth>TAB_SCROLL_EPS;
  const changed=wrap.classList.contains("tabs-over")!==over;
  wrap.classList.toggle("tabs-over", over);
  /* Crossing the threshold changes how much room the row has, because the arrows appear or go.
     One more pass settles it - the guard stops at one, because a layout that does not converge
     in a single step is a bug to see rather than to mask, which is the rule applyTabWidths'
     own fixpoint already follows. */
  if(changed && !updateTabOverflow._reflow){
    updateTabOverflow._reflow=true;
    try{ applyTabWidths(); } finally { updateTabOverflow._reflow=false; }
  }
  const prev=$("#tabsPrev"), next=$("#tabsNext");
  if(prev) prev.disabled=!over || bar.scrollLeft<=TAB_SCROLL_EPS;
  if(next) next.disabled=!over || bar.scrollLeft>=bar.scrollWidth-bar.clientWidth-TAB_SCROLL_EPS;
}
/* Bring a tab fully into view. `nearest` on both axes deliberately: it scrolls the minimum
   needed and does nothing when the tab is already visible, so switching between two tabs that
   both fit never slides the strip - the same restraint the card list's auto-scroll learned. */
function scrollTabIntoView(id){
  const bar=$("#tabsBar"); if(!bar) return;
  /* Not mid-grow. Fired from applyTab's rAF, the reveal measures the strip in its FROM
     state, scrolls by the transient overhang, and unwinds frame by frame as the bar
     outgrows the content. The grow's completion re-runs this against settled boxes. */
  if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
  // data-tid, not data-id - drawTabs names it that, and the card list's data-id is a different thing
  const el=bar.querySelector('.tab[data-tid="'+cssEsc(id)+'"]');
  if(!el) return;
  /* Arithmetic on the container rather than scrollIntoView(). drawTabs writes the tab
     widths in a rAF of its own, so the DOM call resolved against unsettled geometry and
     landed one switch LATE - and its behaviour across engines is one more thing to be sure
     of. Two rect reads and a delta are deterministic, force the layout they depend on, and
     do nothing when the tab is already fully visible - the property that keeps switching
     between two visible tabs from sliding the strip. */
  cancelTabScroll();   // a reveal outranks an in-flight arrow press; letting both run tears the strip
  const er=el.getBoundingClientRect(), br=bar.getBoundingClientRect();
  if(er.left<br.left)        bar.scrollLeft-=(br.left-er.left);
  else if(er.right>br.right) bar.scrollLeft+=(er.right-br.right);
  updateTabOverflow();
}
/* ONE rAF ANIMATOR drives every deliberate strip scroll, instead of scrollBy({behavior:
   "smooth"}). Three reasons, each carrying its own scar:
     - the platform smooth scroll is a black box that some Firefox profiles never paint - the
       paint-pump problem, and a scroll animation fires neither transitionrun nor animationstart,
       so the engine's pump never engages for it. An rAF loop IS its own pump.
     - consecutive presses must accumulate from the PENDING target: restarting from the current
       position makes the second press spend itself re-covering the first one's remaining
       distance, which reads as the button going soft.
     - it is cancellable at a defined point, so the reveal-on-switch and the trackpad can take
       over without fighting an in-flight animation - the exact class of race that made
       scrollIntoView land one switch late.
   Ease-out cubic, the app easing's family: all of the speed at the start, so the press
   answers the finger, and the landing is what gets the time. */
let eTabScrollAnim=null;
function cancelTabScroll(){
  if(eTabScrollAnim){ cancelAnimationFrame(eTabScrollAnim.raf); eTabScrollAnim=null; }
}
function animateTabScroll(target){
  const bar=$("#tabsBar"); if(!bar) return;
  target=Math.max(0, Math.min(bar.scrollWidth-bar.clientWidth, target));
  cancelTabScroll();
  const from=bar.scrollLeft, dist=target-from;
  if(Math.abs(dist)<1 || mgReduceMotion()){ bar.scrollLeft=target; return; }
  const DUR=220, ease=x=>1-Math.pow(1-x,3);
  const anim={target, raf:0};
  let t0=null;
  function step(now){
    if(t0===null) t0=now;
    const p=Math.min(1,(now-t0)/DUR);
    bar.scrollLeft=from+dist*ease(p);
    if(p<1 && eTabScrollAnim===anim) anim.raf=requestAnimationFrame(step);
    else if(eTabScrollAnim===anim) eTabScrollAnim=null;
  }
  anim.raf=requestAnimationFrame(step);
  eTabScrollAnim=anim;
}
/* One button press moves by most of a strip, not by a fixed pixel step: the strip is the unit
   the eye reads, and a 20px nudge on a 400px row needs twenty presses. The overlap keeps one
   tab of context across the jump so nothing is skipped unseen. */
function scrollTabsBy(dir){
  const bar=$("#tabsBar"); if(!bar) return;
  const base=eTabScrollAnim ? eTabScrollAnim.target : bar.scrollLeft;
  animateTabScroll(base + dir*Math.max(80, bar.clientWidth-60));
}
function bindTabScroll(){
  const bar=$("#tabsBar"), prev=$("#tabsPrev"), next=$("#tabsNext");
  if(!bar||bindTabScroll._done) return;
  bindTabScroll._done=true;
  if(prev) prev.onclick=()=>scrollTabsBy(-1);
  if(next) next.onclick=()=>scrollTabsBy(1);
  bar.addEventListener("scroll", updateTabOverflow, {passive:true});
  /* A vertical wheel over a horizontal strip scrolls it sideways - the gesture people already
     have for this, and what every browser's own tab bar does. Only when the strip actually
     overflows, so a wheel over a short row still scrolls the page underneath. */
  bar.addEventListener("wheel", e=>{
    if(bar.scrollWidth-bar.clientWidth<=TAB_SCROLL_EPS) return;
    if(Math.abs(e.deltaY)<=Math.abs(e.deltaX)) return;
    e.preventDefault();
    /* deltaMode is not decoration. Firefox notched wheels report LINES (deltaY = ±3,
       mode 1), so the raw value that scrolls a whole notch's worth in Chrome moves this
       strip three pixels there. Pages (mode 2) get the visible strip. */
    let d=e.deltaY;
    if(e.deltaMode===1) d*=24; else if(e.deltaMode===2) d*=bar.clientWidth;
    /* Notch-sized packets ride the animator, and accumulate exactly as the arrows do - three
       quick clicks of a wheel are three steps of one journey, not three restarts. Continuous
       pixel-mode packets (trackpads) write directly: the gesture is already an animation, and
       easing every 2px parcel would put lag between finger and strip. */
    if(Math.abs(d)>=50){
      const base=eTabScrollAnim ? eTabScrollAnim.target : bar.scrollLeft;
      animateTabScroll(base+d);
    } else {
      cancelTabScroll();
      bar.scrollLeft+=d;
    }
  }, {passive:false});
  if(typeof ResizeObserver==="function"){
    const ro=new ResizeObserver(()=>{
      if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
      /* The wrap's width changes UNDER the strip with no window resize - the rail docking,
         the wordmark leaving, the Ctrl overlap rung - and a bar holding the width
         computed for the OLD room pushes the + into the row's tools. Re-fit whenever the
         wrap is not the width the last pass produced; the ringing guard is exact:
         applyTabWidths records the wrap width it made, an unchanged re-fit records the
         same number, and the observer goes quiet. */
      const w=$("#tabsWrap");
      if(w && Math.abs(w.clientWidth-(applyTabWidths._wrapW||0))>1) applyTabWidths();
      else updateTabOverflow();
    });
    ro.observe(bar);
    const wrap=$("#tabsWrap"); if(wrap) ro.observe(wrap);
  }
}
function applyTabWidths(){
  const bar=$("#tabsBar");
  const wrap=$("#tabsWrap")||(bar&&bar.parentElement);
  if(!bar||!wrap) return;
  const tabEls=[].slice.call(bar.querySelectorAll(".tab"));
  const n=tabEls.length;
  if(!n) return;
  const tabMargin=3;   // .tab margin-right (last tab 0 - see CSS)
  const barPadX=0;     // .tabs-bar has no padding (folder look)
  const add=wrap.querySelector(".tab-add");
  const addW=add?(add.getBoundingClientRect().width+(parseFloat(getComputedStyle(add).marginLeft)||0)):24;   // the rect stops at the border; the margin is the strip's too
  // Space for tabs = wrap minus + (bar no longer flex-shrinks under the +).
  /* The inter-tab margins are NOT subtracted here: every comparison below puts them on
     the other side of the inequality (n*w+margins vs hardAvail), and subtracting them up
     front as "chrome" counts them twice. */
  const margins=(n>0? (n-1)*tabMargin : 0); // last tab margin-right is 0
  /* The ARROWS are chrome too, and cost the row their width exactly as the + does. The
     + must never leave, so its space is reserved always; the arrows' whenever they show.
     Reading the class rather than predicting it keeps this one-directional:
     updateTabOverflow sets it from a measurement at the END of this function, and a
     change there asks for one more pass, which settles - the space is already there. */
  const NAV_W=40;   // 2 x .tabs-nav width - keep in step with the stylesheet
  /* MEASURE UNDER ZERO PRESSURE. The wrap is flex-basis:auto - content-sized - so reading
     it cold returns an ECHO of whatever bar this function wrote last time; and probing
     with a GIANT bar squeezes every sibling in proportion to what it currently holds, so
     the grant depends on the layout the pass STARTED from - two fixed points per shed
     state, and every decision rule reading the strip flipped between them at rAF speed.
     So ask with NOTHING instead: bar at zero width. No sibling is squeezed - everyone sits
     at natural size - and the zero-pressure layout is UNIQUE, so the measurement cannot
     depend on history. The ceiling is then simply the wrap plus the row's leftover free
     space, both read directly; gaps and paddings are implicit in the geometry rather than
     hand-modelled. Floored, so sub-pixel noise cannot flip a knife edge. One extra reflow
     inside one synchronous pass; nothing paints. */
  /* The CAP breathes with the window: 15% is 210 exactly at the app's own 1400px ceiling,
     so wide screens see no change and narrowing ones watch the tabs ease down in step
     rather than resist and snap. */
  const wCap=Math.min(210, Math.floor(innerWidth*0.15));
  /* THE CAP MAY NEVER UNDERCUT THE FLOOR. Below ~667px the 15% cap falls under TAB_FLOOR_W,
     and a min() applied last let it win: tabs sank beneath the floor and labels truncated
     where the floor promises they never do. Cap first, floor last, and only here - the three
     shares below all pass through this. */
  const boundW=share=>Math.max(TAB_FLOOR_W, Math.min(wCap, share));
  bar.style.transition="";
  /* The probe has a side effect the layout alone does not show: while the bar is momentarily
     at zero width its scroll range is zero, and the browser CLAMPS scrollLeft to 0 -
     permanently, because a later legal range does not restore a clamped position. Every
     drawTabs was therefore silently resetting a scrolled strip (found when drag auto-scroll
     could not hold a position: each swap redrew, each redraw zeroed). The position is STATE,
     not layout; save it across the probe and put it back once the real width is in place. */
  const stash=(typeof drawTabs!=="undefined" && drawTabs._keepScroll!=null)?drawTabs._keepScroll:null;
  const stashEnd=(typeof drawTabs!=="undefined" && drawTabs._keepAtEnd===true);
  if(typeof drawTabs!=="undefined"){ drawTabs._keepScroll=null; drawTabs._keepAtEnd=null; }
  const sl0=(stash!=null)?stash:bar.scrollLeft;   // the pre-wipe reading outranks a possibly-clamped live one
  /* End-anchoring: computed from the stash when there is one, else from the live geometry
     BEFORE the probe distorts it. Not-overflowing counts as NOT at the end - otherwise a
     fitting strip that grows into overflow would leap to the far side instead of letting the
     insert pin stage the reveal. */
  const wasAtEnd=(stash!=null)?stashEnd
    :((bar.scrollWidth-bar.clientWidth>1)&&(sl0>=bar.scrollWidth-bar.clientWidth-1));
  bar.style.flex="0 0 0px"; bar.style.width="0px";
  bar.style.minWidth="0px"; bar.style.maxWidth="0px";
  /* Asked twice when the wordmark moves, so the second answer is the settled one. Valid to
     repeat only because the bar is still at zero: the zero-pressure layout is unique. */
  const askGrant=()=>{
    const rowEl=$(".row")||wrap.parentElement;
    const rowRect=rowEl.getBoundingClientRect();
    const rowPadR=parseFloat(getComputedStyle(rowEl).paddingRight)||0;
    let lastRight=0;
    for(const c of rowEl.children){ const r=c.getBoundingClientRect(); if(r.right>lastRight) lastRight=r.right; }
    return Math.floor(wrap.clientWidth+Math.max(0,(rowRect.right-rowPadR)-lastRight));
  };
  let grantW=askGrant();
  /* THE WORDMARK GOES WHEN THE STRIP RUNS OUT OF ROOM, AND IT IS DECIDED HERE, beside the
     arrows rather than in the shed a second later. Deciding the arrows first published a
     scrolling strip on a grant about to grow by the wordmark: the arrows appeared, the shed
     took the name when the insert animation ended, and the arrows left again - 56 frames of
     it. ASKED WITH THE WORDMARK SHOWN whatever is on screen, since its own width is what the
     strip would gain; a live reading fits, hands it back, stops fitting, and rings. */
  const wmW=(typeof eShedNat!=="undefined" && eShedNat && eShedNat.wordmark>0) ? eShedNat.wordmark : 0;
  const wasTight=document.body.classList.contains("strip-tight");
  let shedOwn=null;
  if(wmW>0){
    const floorNeed=n*TAB_FLOOR_W+(n>0?(n-1)*tabMargin:0)+barPadX;
    const shown=(grantW-(wasTight?wmW:0))-addW;
    const tight=wasTight ? shown<floorNeed+8 : shown<floorNeed;   // 8px back, as the rungs use
    if(tight!==wasTight){
      /* Taken BEFORE the toggle and played at the foot, once the arrows have been decided too:
         the two are one movement or they are two events. */
      if(!shedHeld) shedOwn=shedSnap();
      document.body.classList.toggle("strip-tight",tight);
      grantW=askGrant();
    }
  }
  /* Published for the shed algorithm: the GRANT is the strip's potential room, and it is
     the only honest thing to hold against the covenant. The wrap's clientWidth is merely
     current CONTENT - two capped tabs in a maximized window measure ~294px while the row
     would grant 500+ - and holding content against the covenant vetoes legitimate returns
     whenever few tabs keep the content small. Room available, not room used. */
  applyTabWidths._grantW=grantW;
  /* TWO-PHASE, ARROWS DECIDED BY ARITHMETIC ALONE. Phase one assumes no arrows and asks
     whether the content fits the room; only if it cannot is the room recomputed with the
     arrow slots reserved. The decision consults content versus grant - both pure functions
     of (viewport, shed state, tab count) - and never the arrows' current visibility, which
     is a RESULT of this computation and must not be an input to it. */
  const availNoNav=Math.max(0, grantW-addW);
  const wNoNav=boundW(Math.floor((availNoNav-margins)/n));
  const fitsNoNav=(n*wNoNav+margins+barPadX)<=availNoNav;
  const hardAvail=fitsNoNav ? availNoNav : Math.max(0, availNoNav-NAV_W);
  const preferAvail=hardAvail;
  /* THE FLOOR IS WHERE SHRINKING STOPS AND SCROLLING STARTS. Tabs still narrow as the
     window narrows - that part stays. At the floor, everything that does not fit is
     reached by scrolling, instead of being squeezed unreadable or clipped off the end. */
  /* The margins come out of the share, not off the total: nothing squeezes any more, so a
     share computed from the raw width overflows by exactly the margin total and the
     arrows appear a whole tab before they are needed. */
  const w=boundW(Math.floor((preferAvail-margins)/n));
  /* Content first, then the row's own limit. When the content is wider than the row the bar
     takes the full available width and scrolls inside it; when it is narrower the bar shrinks
     to the content so the + button still sits immediately after the last tab rather than
     floating at the end of an empty strip. */
  const contentW=n*w+margins+barPadX;
  const barW=Math.min(contentW, hardAvail);
  bar.style.flex="0 0 "+barW+"px";
  bar.style.width=barW+"px";
  bar.style.minWidth=barW+"px";
  bar.style.maxWidth=barW+"px";
  tabEls.forEach(el=>{
    el.style.flex="0 0 "+w+"px";
    el.style.width=w+"px";
    el.style.maxWidth=w+"px";
    el.style.minWidth=w+"px";   // w, not a literal - boundW above already applied the floor
  });
  bar.scrollLeft=sl0;   /* first restore - the staircase below reads geometry and must not read
                           it at the probe's clamped zero; the FINAL restore comes after
                           the staircase, because shrinking the bar grows the scroll range
                           and a position restored before that lands short of the end by
                           exactly the correction. */
  updateTabOverflow();
  /* THE PROBE'S GRANT IS OPTIMISTIC BY A HAIR; the settled geometry gets the last word.
     Flex distributes shortage in proportion to basis, so the ceiling ask pulls slightly
     more out of the siblings than the real, smaller request will hold - the + ends a few
     px outside the wrap. After the real write, read where the LAST piece of chrome
     landed and take any overhang straight off the bar. Tabs keep their widths (a
     narrower bar is simply more scrolling); _wrapW records the corrected state, which
     keeps the ResizeObserver quiet. */
  if(add){
    /* A STAIRCASE, NOT A STEP. Shrinking the bar by the overhang does not remove the
       overhang: the smaller request lets every sibling reclaim a share of what was
       released, and ~0.7 of it survives each exact step - the row's geometry, not a bug.
       Eight steps bound the remainder below sub-pixel for anything a header can produce;
       the loop also stops the moment the overhang is under half a pixel, and in the wide
       case the first measurement is already there. */
    let bw=barW;
    for(let i=0;i<10;i++){
      const overhang=add.getBoundingClientRect().right-wrap.getBoundingClientRect().right;
      if(overhang<=0.5) break;
      /* 1.5x, not 1x: an exact step leaves ~0.7 of the overhang behind, so eight exact steps
         still carried pixels across a large resize. Overshooting by half kills the tail in
         two or three steps; the worst case is a bar a couple of pixels narrower than
         optimum - a sliver more scrolling inside the strip, invisible - where the
         undershoot's failure was chrome outside the wrap. Err toward the failure that
         cannot be seen. */
      bw=Math.max(40, bw-Math.ceil(overhang*1.5));
      bar.style.flex="0 0 "+bw+"px"; bar.style.width=bw+"px";
      bar.style.minWidth=bw+"px";    bar.style.maxWidth=bw+"px";
    }
    if(bw!==barW) updateTabOverflow();
    /* THE SHARE ANSWERS TO THE SETTLED BAR. The tab widths above were computed against the
       probe's optimistic grant; when the staircase takes the bar down to the room the row
       actually kept, tabs sized for the bigger room leave the strip scrolling a handful of
       oversized tabs. One corrective re-share against the final bar: floor-bounded, so it
       either fits outright or sits honestly at the floor and scrolls only the floor's own
       overflow. */
    if(bw<contentW-1){
      const w2=boundW(Math.floor((bw-margins-barPadX)/n));
      if(w2<w){
        tabEls.forEach(el=>{
          el.style.flex="0 0 "+w2+"px"; el.style.width=w2+"px";
          el.style.maxWidth=w2+"px";    el.style.minWidth=w2+"px";
        });
        updateTabOverflow();
      }
    }
  }
  /* The last word on the scroll position, against the FINAL geometry. A strip that was at its
     end goes to the NEW end - scrollWidth self-clamps to the maximum, wherever the redraw and
     the staircase moved it. Anything else restores the number, clamped by the browser. */
  bar.scrollLeft=wasAtEnd ? bar.scrollWidth : sl0;
  updateTabOverflow();
  // What this pass made of the wrap - the ResizeObserver in bindTabScroll compares against it.
  applyTabWidths._wrapW=wrap.clientWidth;
  if(shedOwn) shedAnimate(shedOwn);
}

/** Tab labels: the whole name, always. What will not fit is faded off by the sweep that
 *  cuts every other line in the app, and the tooltip carries what the fade took. */
function fitTabLabels(){
  const bar=$("#tabsBar");
  if(!bar) return;
  /* Not while a tab is growing in. drawTabs() schedules one of these on the next frame, which
     lands mid-animation and measures boxes still moving, fitting every label to a half-width
     tab. The fit is already done for the FINISHED widths by the synchronous call inside
     drawTabs; nothing changes until the boxes stop. animateTabInsert() clears the flag and
     calls this once at the end. */
  if(tabInsertAnimating) return;
  const tabEls=[].slice.call(bar.querySelectorAll(".tab"));
  if(!tabEls.length) return;

  applyTabWidths();

  const rows=[];
  tabEls.forEach((el,i)=>{
    const idx=tabs.findIndex(x=>x.id===el.dataset.tid);
    const ti=idx>=0?idx:i;
    /* `tb`, not `t`: t() is the translation function, and a local of that name breaks
       every translated string in the same scope rather than the line that declares it. */
    const tb=idx>=0?tabs[idx]:null;
    const name=tabLabel(tb, ti);
    const span=el.querySelector(".tab-label>span");
    if(!span) return;
    if(span.textContent!==name) span.textContent=name;
    rows.push({el:el,span:span,name:name});
  });
  /* Every name written before any is measured: a read between two writes lays the strip out
     again for each tab, which is the rule writePillCounts follows for the same reason. */
  for(let i=0;i<rows.length;i++){
    const r=rows[i], c=cutSides(r.span), cut=c.l||c.r;
    applyCut(r.span,c);
    /* A name the strip has faded has nowhere else to be read, so the tooltip carries it. */
    r.el.title=(cut ? r.name+" · " : "")+t("Click to switch, or drag to reorder");
  }
}
/* One swatch per filtered category, in the order they were picked: one paints the dot its
   own hue flat, several blend across it. No filter at all returns nothing - the dot falls
   back to white, because the tab is showing everything and no hue is truer than any other. */
function tabAccentSlots(list){
  const c=(list||[]).filter(Boolean);
  return c.map(id=>catSlot(id)).filter(n=>n>=0);
}
/* The first category travels as data-ec, through the same [data-ec] -> --ecat plumbing
   the pills and cards already use, so nothing here knows what colour it is. The rest can't:
   a gradient is one value built from many, so it is composed here - still out of the same
   --e-c* tokens, so the themes keep control of the actual colours. */
function syncTabAccent(){
  document.querySelectorAll(".tab").forEach(el=>{
    /* The SELECTED tab's filter lives in `cats`, not in its stored object: that copy is only
       written back when the tab is saved, so reading it here would show the previous state
       until something else triggered a save. Every other tab has nothing live to read and
       its stored cats are exactly right. */
    let list;
    if(el.classList.contains("on")){
      list=(typeof cats!=="undefined"&&cats)?cats:[];
    }else{
      const tb=(typeof tabs!=="undefined"&&tabs)?tabs.find(x=>x.id===el.dataset.tid):null;
      list=(tb&&Array.isArray(tb.cats))?tb.cats:[];
    }
    const n=tabAccentSlots(list);
    delete el.dataset.ec;
    el.style.removeProperty("--tab-accent-img");
    if(n.length>=1) el.dataset.ec=String(n[0]);
    if(n.length>1){
      el.style.setProperty("--tab-accent-img",
        "linear-gradient(90deg,"+n.map(i=>"var(--e-c"+i+")").join(",")+")");
    }
  });
}
/* drawPills and drawTabs are wrappers and the Core functions do the drawing, which is
   drawIntentRail's shape: an accent follows every redraw of either bar, and an early return
   inside a Core must not skip it. The wrapping is a declaration rather than an assignment to
   the name, because an imported binding cannot be assigned. */
function drawPills(){ const r=drawPillsCore.apply(this,arguments); syncTabAccent(); return r; }
function drawTabs(){ const r=drawTabsCore.apply(this,arguments); syncTabAccent(); return r; }
function drawTabsCore(){
  const bar=$("#tabsBar");
  if(!bar) return;
  /* Stash the scroll BEFORE the wipe. The innerHTML rebuild leaves the bar briefly holding
     children at their stylesheet widths, and if those happen to fit inside the bar's stale
     inline width, the first layout in that window clamps scrollLeft to 0 - before
     applyTabWidths' own preservation can read it. With the stash, closing the last tab
     from the far end restores the old maximum, the browser clamps it to the NEW maximum,
     and the strip lands scrolled all the way right with the new last tab whole. */
  drawTabs._keepScroll=bar.scrollLeft;
  /* AND whether that position meant "at the end" - because the end is a PLACE, not a
     number. A redraw can legitimately move the maximum (closing a tab shrinks content; a
     shed step returning the wordmark narrows the wrap), and a preserved NUMBER then
     lands short of the moved end by exactly the delta. A strip that was at its end stays
     at its end. */
  drawTabs._keepAtEnd=(bar.scrollWidth-bar.clientWidth>1)&&(bar.scrollLeft>=bar.scrollWidth-bar.clientWidth-1);
  bar.innerHTML="";
  tabs.forEach((tb,i)=>{
    const b=document.createElement("div");
    b.className="tab"
      +(tb.id===activeTabId?" on":"")
      +(tabDrag&&tabDrag.moved&&tabDrag.key===tb.id?" dragging":"");
    b.dataset.tid=tb.id;
    b.title=t("Click to switch, or drag to reorder");
    const lab=document.createElement("span");
    lab.className="tab-label";
    const name=tabLabel(tb,i);
    const labViz=document.createElement("span");
    labViz.textContent=name;
    lab.appendChild(labViz);
    const x=document.createElement("button");
    x.type="button";
    x.className="tab-x";
    x.title=t(tabs.length===1?"Clear tab fields":"Close tab");
    x.setAttribute("aria-label", t(tabs.length===1?"Clear tab":"Close tab"));
    x.innerHTML=ICON_TAB_X;
    x.onclick=e=>closeTab(tb.id,e);
    b.appendChild(lab);
    b.appendChild(x);
    b.onpointerdown=e=>{
      if(e.pointerType==="touch") return;   // taps are taps - see the rail rows for the story
      if(e.button!==0) return;
      if(e.target.closest(".tab-x")) return;
      tabSuppressClick=false;
      tabDrag={key:tb.id,x:e.clientX,y:e.clientY,moved:false};
    };
    b.onclick=e=>{
      if(tabSuppressClick){ tabSuppressClick=false; return; }
      if(e.target.closest(".tab-x")) return;
      switchTab(tb.id);
    };
    bar.appendChild(b);
  });
  const wrap=$("#tabsWrap")||bar.parentElement;
  // Rebuild + outside .tabs-bar so overflow:hidden never clips it when tabs are at min-width
  if(wrap){
    wrap.querySelectorAll(".tab-add").forEach(el=>el.remove());
    const add=document.createElement("button");
    add.type="button";
    add.className="tab-add";
    add.title=tabAddTitle();
    add.setAttribute("aria-label",t("Add tab"));
    add.innerHTML='<span class="tab-add-mark">'+ICON_TAB_ADD+'</span>';
    /* Never disabled: the + is the one control that must always work - see addTab(). */
    add.onclick=()=>addTab();
    wrap.appendChild(add);
  }
  bindTabScroll();
  // Measure after layout; rAF covers first paint / flex settling
  fitTabLabels();
  requestAnimationFrame(fitTabLabels);
  // NOT because tab count decides anything - the covenant is a constant, and opening a tab
  // must never move header furniture. This re-ask exists because a redraw can land after a
  // width change the debounced resize pass has not yet absorbed; on unchanged inputs the
  // sync is a pure no-op. Coalesced, so a burst of redraws costs one pass.
  if(typeof scheduleHeaderSync==="function") scheduleHeaderSync();
}
// Re-fit tab labels when the window (or bar) width changes - names and their stubs
// Document-level listeners: drawTabs rebuilds nodes mid-drag
/* The swap test, shared by the pointermove handler and the edge auto-scroll loop below. Client
   coordinates against live layout throughout, which is what lets it keep working while the
   strip scrolls under the pointer. */
function tabDragCheck(cx,cy){
  if(!tabDrag||!tabDrag.moved) return;
  if(Date.now()-tabSwapLock<120) return;
  const under=document.elementFromPoint(cx,cy);
  const t=under&&under.closest?under.closest(".tab[data-tid]"):null;
  if(!t||t.dataset.tid===tabDrag.key) return;
  const from=tabs.findIndex(x=>x.id===tabDrag.key);
  const to=tabs.findIndex(x=>x.id===t.dataset.tid);
  if(from<0||to<0||from===to) return;
  // Swap once the pointer reaches ~1/4 into the other tab (not the far edge alone).
  const rect=t.getBoundingClientRect();
  const q=rect.width*0.25;
  if(from<to && cx<rect.left+q) return;          // dragging right: past left quarter
  if(from>to && cx>rect.right-q) return;         // dragging left: past right quarter
  tabSwapLock=Date.now();
  moveTab(from,to);
}
/* EDGE AUTO-SCROLL. Once the strip scrolls, a drag target can be BEHIND the aperture -
   elementFromPoint at the edge returns the arrow or the wall, and the drag stalls with no
   way to reach a hidden tab. So a drag held near either edge of the bar scrolls it, faster
   the deeper into the zone, exactly as every browser's own strip does.
   The loop re-runs the swap test with the pointer's LAST position each frame: the strip
   moving under a stationary pointer changes what is under it, and without the re-test
   autoscroll carries the drag past its target until the hand moves again. */
function tabDragAutoScroll(){
  if(!tabDrag||!tabDrag.moved) return;
  const bar=$("#tabsBar");
  if(bar && tabDrag.cx!=null){
    const br=bar.getBoundingClientRect(), ZONE=28;
    let v=0;
    if(tabDrag.cx<br.left+ZONE)       v=-Math.min(12, 3+(br.left+ZONE-tabDrag.cx)/4);
    else if(tabDrag.cx>br.right-ZONE) v= Math.min(12, 3+(tabDrag.cx-(br.right-ZONE))/4);
    if(v){
      cancelTabScroll();               // an arrow press must not fight the drag
      bar.scrollLeft+=v;
      /* Check even when the strip is pinned at its end and the assignment moved nothing: the
         pointer is parked over a real target there, and gating the check on scroll
         movement leaves the drag stalled one tab short of the far edge. The swap lock
         already bounds the rate. */
      tabDragCheck(tabDrag.cx, tabDrag.cy);
    }
  }
  requestAnimationFrame(tabDragAutoScroll);
}
function wireTabDrag(){
  addEventListener("pointermove",e=>{
    if(!tabDrag) return;
    if(!tabDrag.moved){
      if(Math.abs(e.clientX-tabDrag.x)+Math.abs(e.clientY-tabDrag.y)<5) return;
      tabDrag.moved=true;
      document.documentElement.classList.add("tabdrag");
      const el=$("#tabsBar")&&$("#tabsBar").querySelector('.tab[data-tid="'+tabDrag.key+'"]');
      if(el) el.classList.add("dragging");
      requestAnimationFrame(tabDragAutoScroll);
    }
    tabDrag.cx=e.clientX; tabDrag.cy=e.clientY;
    tabDragCheck(e.clientX,e.clientY);
  },{passive:true});
  addEventListener("pointerup",endTabDrag);
  addEventListener("pointercancel",endTabDrag);
}
function initTabs(){
  if(!loadTabSession()){
    const t=blankTab();
    // Seed first tab from legacy single-session storage (one-time migration)
    try{
      if(lsGet("pbPax")) t.pax=lsGet("pbPax");
      if(lsGet("pbWho")) t.who=lsGet("pbWho");
    }catch(_){}
    tabs=[t];
    activeTabId=t.id;
  }
  const cur=tabs.find(x=>x.id===activeTabId)||tabs[0];
  applyTab(cur);
  saveTabSession();
  addEventListener("beforeunload", saveTabSession);
}

export {
  saveTabSession,
  scheduleTabSave,
  stepTab,
  addTab,
  escCloseAllTabsStep,
  escapeLadderStep,
  applyTabWidths,
  fitTabLabels,
  drawPills,
  drawTabs,
  wireTabDrag,
  initTabs,
  TAB_KEY,
  tabs,
  tabSaveTimer,
  tabInsertAnimating,
  TAB_FLOOR_W
};
