import { isAlwaysCat } from "./cat-roles.js";
import { SW_EN } from "./content-model.js";
import { scheduleCutScan } from "./dialog.js";
import { openIntentEditor } from "./editors.js";
import { ICON_EYE_OPEN, ICON_EYE_SHUT, ICON_EDIT, ICON_STAR_ON, ICON_STAR_OFF } from "./icons.js";
import { intentFor, intentRows, fill } from "./intent-text.js";
import { mgReduceMotion } from "./motion.js";
import { flushPillState } from "./pill-state.js";
import { nsSet } from "./storage.js";
import { scheduleTabSave } from "./tabs.js";
import { t } from "./ui-lang.js";
import { foldDiacritics, splitWords, wordMatchesTerm } from "./words.js";
import { isIntentFavourite } from "./pack.js";
import { setIntentHidden, syncIntentOrder, toggleIntentFavourite } from "./favourites.js";
import { railLocked } from "./rail-panel.js";
import { catSlot } from "./cat-identity.js";
import { categoriesForIntent } from "./cat-relevance.js";
import { markEntrySel } from "./entry-walk.js";
import { intentIdAt, intentIdxFromId, intentOrder, isIntentHiddenIdx, setIntentOrder, setIntentOrderLoaded } from "./intent-id.js";

// The rail's rows: the order they sit in, what each one says, how the list is painted and
// every gesture on them. How wide the rail is and when it docks is the app's, and stays there.
let railDrag=null, railSwapLock=0, railSuppressClick=false;
function animateRailReorder(mutate){
  const box=$("#intentRailList");
  if(!box || mgReduceMotion()){ mutate(); drawIntentRail(); return; }
  const before={};
  box.querySelectorAll(".rail-item").forEach(p=>{ before[p.dataset.si]=p.getBoundingClientRect(); });
  mutate();
  drawIntentRail();
  const moved=[];
  box.querySelectorAll(".rail-item").forEach(p=>{
    const k=p.dataset.si, b=k!=null&&before[k];
    if(!b) return;
    const a=p.getBoundingClientRect();
    const dx=Math.round(b.left-a.left), dy=Math.round(b.top-a.top);
    if(!dx && !dy) return;
    p.style.transition="none";
    p.style.willChange="transform";     // see the note in flipPills
    p.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(p);
  });
  if(!moved.length) return;
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void box.offsetHeight;
  moved.forEach(p=>{ p.style.transition="transform .18s "+E_EASE; p.style.transform=""; });
  setTimeout(()=>moved.forEach(p=>{ p.style.transition=""; p.style.transform=""; p.style.willChange=""; }),200);
}
function moveIntent(from,to){
  // from/to are positions in intentOrder; only allow within same fav/regular band
  const a=intentOrder[from], b=intentOrder[to];
  if(a==null||b==null) return;
  if(!!isIntentFavourite(intentIdAt(a))!==!!isIntentFavourite(intentIdAt(b))) return;
  animateRailReorder(()=>{ intentOrder.splice(to,0,intentOrder.splice(from,1)[0]); });
}
/* Rail display order only - NEVER mutates intentOrder. SELECTION OUTRANKS FAVOURITE -
   the opposite of the pills, and deliberate: a selection answers "what is this chat
   about", the sharper signal; green here means IS the selection. Within every band a
   favourite still leads; within the relevance bands rows group by claiming category in
   selection order, then exact colour signature (railRelGroup). Stable throughout, so the
   dragged order survives. */
/* Every row currently wearing the echo, read BEFORE a category change - the flip's
   keep set must cover the rows about to LOSE the mark as well as those about to gain it:
   both movements explain the click, so both are exempt from the travel cap. */
function railRelKeys(){
  const out=[];
  document.querySelectorAll("#intentRailList .rail-item.rail-rel").forEach(el=>out.push(el.dataset.si));
  return out;
}
/* Category clicks animate the rail the way intent picks do: capture, change, redraw, flip.
   One helper so the three ways of changing the filter (pill click, ←/→, All) cannot drift. */
function railEchoRedraw(railBefore, relBefore){
  drawIntentRail();
  const keep=new Set(relBefore||[]);
  railRelKeys().forEach(k=>keep.add(k));
  flipRail(railBefore, keep);
}
/* Which SELECTED categories hold a card linked to this intent - the exact inverse of
   categoriesForIntent(), so the rail's echo and the pills' rings can never disagree.
   Recomputed once per draw into railRelNow: the banding and the row loop both need it,
   and categoriesForIntent walks every card. */
var railRelNow={}, railRelGroup={};
function railRelRefresh(){
  railRelNow={};
  railRelGroup={};
  const sel=(cats||[]).filter(Boolean);
  if(!sel.length) return;
  intentOrder.forEach(i=>{
    const ks=categoriesForIntent(i);
    /* A SUPPORTING category is useful whatever the intent - its definition - so the echo
       lets it claim every intent, exactly as a blanket-linked category already does
       through its cards. Without this, Security lit only its card-linked slice while
       Openers lit the whole rail, and those two are the same kind of thing. */
    const hit=sel.filter(k=>isAlwaysCat(k)||ks.indexOf(k)>-1);
    if(hit.length){
      railRelNow[i]=hit;
      /* Sort key: DEPTH FIRST - the more selected categories claim an intent, the higher
         (A+B+C · A+B · A · B, every intent beside its siblings); within a depth, colour
         blocks in selection order, then the exact signature. 99-minus-count so deeper
         sorts lexicographically earlier. */
      railRelGroup[i]=String(99-hit.length).padStart(2,"0")
        +String(sel.indexOf(hit[0])).padStart(2,"0")+"|"+hit.join(",");
    }
  });
}
/* Bands, in order: selected favourite · selected · FAVOURITES · colour groups · the
   rest. Favourites are a privileged bracket group: one gold bracket, present regardless
   of selection, above every colour group - a favourite never appears inside a colour
   group; the gold outranks the hue. A selected INTENT still outranks everything: it
   names what the chat is about. */
function railBand(r){
  if(r.hidden) return 9;                       // hidden sits below every other band
  if(r.picked) return r.fav?0:1;
  if(r.fav) return 2;
  if(railRelNow[r.idx]) return 3;
  return 4;
}
/* Graded, not boolean, because a sort needs an ordering where a filter needs a yes. Same
   vocabulary: the four display fields plus the rare-keyword lane. Every term must land
   somewhere or the row scores 0. */
function railScore(r, terms){
  const hay=foldDiacritics((String(r.t||"")+" "+String(r.clause||"")+" "
    +String(r.alt||"")+" "+String(r.also||"")).toLowerCase());
  const words=splitWords(hay);
  let s=0;
  for(const t of terms){
    let q=0;
    if(words.indexOf(t)>-1) q=3;
    else if(hay.indexOf(t)!==-1) q=2;
    else if(words.some(w=>wordMatchesTerm(w,t))) q=2;
    else if(r.kw && r.kw.has(t)) q=1;
    if(!q) return 0;
    s+=q;
  }
  return s;
}
function displayIntentRows(){
  railRelRefresh();
  const rows=intentRows(true);                 // the panel shows hidden intents, greyed
  /* Match tier BEFORE band: a selected category must not push matches under its bracketed
     rows. Bands still pin picked and sink hidden, brackets still group - inside a tier.
     With no query the tier collapses and this is exactly the old order. */
  const terms=railQuery()?splitWords(railQuery()):[];
  const scored=rows
    // picked and favourite rows take no colour-group key: their bands are their whole story
    .map((r,i)=>({r, i, b:railBand(r), g:(r.picked||r.fav)?"":(railRelGroup[r.idx]||""),
                  s:terms.length?railScore(r,terms):0}))
    .map(o=>({...o, mt: !terms.length?0 : o.r.picked?0 : o.r.hidden?2 : (o.s>0?0:1)}))
    .sort((a,b)=>(a.mt-b.mt) || (a.b-b.b) || (b.s-a.s) || (a.g<b.g?-1:a.g>b.g?1:0) || (a.i-b.i));
  /* One pass owns all the derived state: who matched (grey the rest), what the arrows walk
     (matches only), and the row Enter takes - the first unpicked match in sorted order. */
  /* Without a query the mark is not this pass's to give or take - a hover claim must
     survive redraws it did not cause, or a category walk wipes the mark mid-walk. */
  railOrder=[]; railMatch=terms.length?new Set():null;
  if(terms.length) railMarkIdx=-1;
  scored.forEach(o=>{
    if(o.r.hidden) return;
    if(o.s>0){
      railMatch.add(o.r.idx);
      if(railMarkIdx<0 && !o.r.picked) railMarkIdx=o.r.idx;
      railOrder.push(o.r.idx);
    } else if(!terms.length) railOrder.push(o.r.idx);
  });
  return scored.map(o=>o.r);
}
/* The pills' rule with the pills' number: counts land per keystroke, ORDER settles 400ms
   after the last one, so a resort never runs under the typing hand. The move rides
   flipRail - the pick path's Firefox-proofed pass - with matches exempt from the travel
   cap, since rising to the top is the story. */
const RAIL_SORT_MS=400;
function railScheduleSort(){
  clearTimeout(railSortT);
  railSortT=setTimeout(railSettle, RAIL_SORT_MS);
}
function railSettle(){
  clearTimeout(railSortT); railSortT=0;
  if(typeof dragState!=="undefined" && dragState) return;   // never mid-drag, as with pills
  /* The armed filter drops here, so the bar, the numbers and the cards state one thing at one
     moment. Nothing to drop if the box ended up empty again: a letter typed and erased is not
     a query, and the category it was armed against never asked to go. */
  if(catsDropArmed){
    catsDropArmed=false;
    if(String(intentEl.value||"").trim()){
      cats=[];
      if(pills) pills.querySelectorAll(".pill").forEach(b=>b.classList.toggle("on", !b.dataset.k));
      scheduleTabSave();
    }
  }
  /* The heavy card render first, the glides after it - a transition started before a long
     rebuild spends its middle on a blocked thread. flushPillState AFTER render: render's
     own count sync would otherwise re-arm the pill timer 400ms past this settle. */
  render();
  flushPillState();
  const markedIdx=(railSel>=0 && railSel<railOrder.length)?railOrder[railSel]:-1;
  /* A query's answer starts at the top - the matches rise there - so the list goes there before
     the capture, and the glide is judged against the window the user will actually see. Only a
     query: a letter typed and erased puts nothing at the top that was not there. */
  const box=$("#intentRailList");
  if(box && String(intentEl.value||"").trim()) box.scrollTop=0;
  const before=captureRail();
  drawIntentRail();
  flipRail(before, railMatch?new Set([...railMatch].map(String)):null);
  railSel = markedIdx>=0 ? railOrder.indexOf(markedIdx) : -1;
  railSettled=true;                 // mark and movement land as one statement
  railDecorate(false);
}
/* Classes only - the 2ms kind of work. The mark PERSISTS through focus loss (EN/PL, theme,
   background clicks); it hides while a resort is pending, and once consumed it waits for
   typing or an arrow. Grey rows are inactive: skipped by railOrder, not by the mouse. */
function railDecorate(scrollTo){
  const box=$("#intentRailList"); if(!box) return;
  const q=railQuery();
  const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
  const selIdx=(markSurface()==="intent")?String(idx):null;
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    el.classList.toggle("rail-nohit",
      !!q && railMatch && !railMatch.has(+el.dataset.si) && !el.classList.contains("on"));
    const k=el.dataset.si===selIdx;
    el.classList.toggle("rail-kbd", k);
    // not a pinned row: it sits above the scroller, and revealing it would scroll the list to the top
    if(k && scrollTo && !el.classList.contains("on")){ try{ el.scrollIntoView({block:"nearest"}); }catch(_){}
    }
  });
  applyRailPeek();   // the mark moved; the peek follows
}
/* What a row's MARKUP depends on. Not `picked`: which row wears .on is exactly what a pick
   changes, and keeping it out of the signature is what lets a pick reuse every row. */
function railRowSig(r){
  return (r.hidden?"h":"")+(r.fav?"f":"")+(r.custom?"c":"")+"|"+r.t+"|"+(r.tag||"");
}
/* Rows keyed by intent index, or null when anything about the SET changed - a rename, a
   hide, an intent added or removed. Null means build from scratch. */
function railReuseMap(box,rows){
  const have=box.querySelectorAll(".rail-item");
  if(have.length!==rows.length) return null;
  const map=new Map();
  for(let i=0;i<have.length;i++) map.set(have[i].dataset.si,have[i]);
  for(let i=0;i<rows.length;i++){
    const el=map.get(String(rows[i].idx));
    if(!el || el.dataset.sig!==railRowSig(rows[i])) return null;
  }
  return map;
}
/* Everything about a row that a pick DOES change, in one place because both the build and
   the reuse call it. Clears first: a reused row may be dropping an accent, not gaining one,
   and the bracket classes are only ever added by the pass below. */
function railPaintRow(b,r,relRows){
  b.classList.toggle("on",!!r.picked);
  b.classList.toggle("dragging",!!(railDrag&&railDrag.moved&&railDrag.key===String(r.idx)));
  b.classList.remove("rail-rel","rr-open","rr-cont");
  b.style.removeProperty("--rail-rel-img");
  b.style.removeProperty("--rr-h");
  b.style.removeProperty("--rr-y");
  b.removeAttribute("data-ec");
  /* Echo hue: one matching selected category -> its solid hue via data-ec; several ->
     the tabs' blend in selection order. The class arrives only WITH a resolved hue - a
     slotless category must not inherit a stray --ecat. A PICKED row wears NO accent
     (selection already speaks); a FAVOURITE row wears the GOLD bracket through the same
     crescent machinery, sig FAV, so favourites fuse with each other, never with colour. */
  if(r.fav && !r.picked){
    b.classList.add("rail-rel");
    b.style.setProperty("--rail-rel-img","linear-gradient(var(--fav),var(--fav))");
    relRows.push({el:b, sig:"FAV"});
  }else if(railRelNow[r.idx] && !r.picked){
    const slots=railRelNow[r.idx].map(k=>catSlot(k)).filter(s=>s>=0);
    if(slots.length){
      b.classList.add("rail-rel");
      if(slots.length>1){
        b.style.setProperty("--rail-rel-img",
          "linear-gradient(180deg,"+slots.map(s=>"var(--e-c"+s+")").join(",")+")");
      }else{
        b.dataset.ec=String(slots[0]);
      }
      relRows.push({el:b, sig:slots.join(",")});
    }else relRows.push(null);
  }else{
    relRows.push(null);
  }
  // Drag band is the DISPLAY band, not just the favourite class: the panel re-derives
  // chosen-first, echoed-above-unechoed, grouped by colour signature - a drag across any
  // of those boundaries would snap back on the next draw, so the key carries the full
  // group. Hidden is part of the band (a hidden row cannot rise above a visible one).
  // Picked rows and favourites carry no group: picked-ness and the gold band ARE theirs.
  b.dataset.band=(r.hidden?"h":(r.fav?"1":"0"))+"-"+(r.picked?"1":"0")
    +((railRelGroup[r.idx]&&!r.picked&&!r.fav)?("r"+railRelGroup[r.idx]):"");
}
/* Bracket pass: consecutive rows sharing an accent signature become one mark -
   rr-open on a row continued below, rr-cont on a row continuing the one above; the CSS
   turns the pair into straight joints, capsule ends only at the run's edges. Adjacency
   in relRows IS DOM adjacency, and a null (unechoed row) breaks the run. */
function railBracketPass(relRows){
  for(let i=0;i<relRows.length;i++){
    const cur=relRows[i], next=relRows[i+1];
    if(!cur) continue;
    if(next && next.sig===cur.sig){
      cur.el.classList.add("rr-open");
      next.el.classList.add("rr-cont");
    }
  }
  /* One gradient per RUN: per-row pseudos restarted the blend and the arm striped.
     Measured after layout, handed down as --rr-h/--rr-y; a continuation's pseudo starts
     2px above its row (the gap bridge). One forced layout for the pass, then style-only
     writes. */
  for(let s=0;s<relRows.length;s++){
    if(!relRows[s]) continue;
    let e=s;
    while(relRows[e+1] && relRows[e+1].sig===relRows[s].sig) e++;
    if(e>s){
      const top0=relRows[s].el.offsetTop;
      const lastEl=relRows[e].el;
      const runH=lastEl.offsetTop+lastEl.offsetHeight-top0;
      for(let j=s;j<=e;j++){
        const el=relRows[j].el, bridge=(j>s)?2:0;
        el.style.setProperty("--rr-h",runH+"px");
        el.style.setProperty("--rr-y",(-(el.offsetTop-bridge-top0))+"px");
      }
    }
    s=e;
  }
}
/* THE SIGNATURE PROBLEM: to know whether a card's markup changed we must not build it, since
   building it is the cost being avoided. So every input is read instead - and the awkward one
   is the filled text, which depends on the agent's name, the clock and the SELECTED INTENT.
   A canary carrying every token is filled per card; cards whose text holds no token (250 of
   257 in the working catalog) short-circuit to a constant and survive every pick. */
const CARD_TOKEN_RE=/\{(GREET|AGENT|PAX|ROLE|INIT|INTENT|ACTION|TOPIC|Z|DAYPART)/;
const TOKEN_CANARY="{GREET}{AGENT}{PAX}{ROLE}{INIT}{INTENT}{ACTION}{TOPIC}{Z}x{DAYPART:a|b|c}";
function cardFillKey(m){
  const raw=String(m&&m.en||"")+String(m&&m.pl||"");
  if(!CARD_TOKEN_RE.test(raw)) return "";
  try{ return fill(TOKEN_CANARY,m); }catch(e){ return "?"+ePackEpoch; }
}
function drawIntentRail(){ drawIntentRailCore(); syncRailCount(); railDecorate(false); scheduleCutScan(); }
/* HOW MANY, AND HOW MANY PUT AWAY - the two questions a list of intents is asked. Counted over
   live intents rather than off pack.intentHidden, which keeps ids of intents that are gone.
   Composed through t() and skipped by the sweep, which cannot rebuild half a string. */
function syncRailCount(){
  const el=document.getElementById("railCount");
  if(!el) return;
  const n=SW_EN.length;
  let hid=0;
  for(let i=0;i<n;i++) if(isIntentHiddenIdx(i)) hid++;
  const txt=String(n);
  if(el.textContent!==txt) el.textContent=txt;
  const hidEl=document.getElementById("railHidden");
  if(hidEl){
    const ht=hid ? t("{N} hidden").replace("{N}",hid) : "";
    if(hidEl.textContent!==ht) hidEl.textContent=ht;
    hidEl.hidden=!hid;
  }
}
/* Hover IS the mark. Entering a row claims the one mark for the intents - by idx, not
   position, so grey rows a mouse may still choose mark too; entering a card block claims
   it for the cards. Each claim clears the other surface, which is the whole point. */
function railHoverClaim(e){
  kbdNav(false);            // riding mousemove, this IS real pointer motion
  const el=e.target.closest(".rail-item[data-si]");
  if(!el || el.classList.contains("on")) return;
  if(typeof dragState!=="undefined" && dragState) return;
  semiKind="intent";
  railMarkIdx=+el.dataset.si;
  railSel=railOrder.indexOf(railMarkIdx);
  railMarkUsed=false;
  if(entrySel){ entrySel=null; markEntrySel(); }
  railDecorate(false);
}
function cardHoverClaim(e){
  kbdNav(false);
  const el=e.target.closest(".txt[data-v]");
  if(!el) return;
  if(typeof dragState!=="undefined" && dragState) return;
  const card=el.closest(".card[data-id]");
  if(!card) return;
  if(entrySel && entrySel.id===card.dataset.id && entrySel.vi===+el.dataset.v){
    if(semiKind!=="card"){ semiKind="card"; railDecorate(false); }
    return;
  }
  semiKind="card";
  entrySel={id:card.dataset.id, vi:+el.dataset.v};
  markEntrySel();
  railDecorate(false);
}
/* mousemove, not mouseover: a row sliding under a RESTING pointer fires mouseover but
   never mousemove, so the pointer's own motion is the only thing that can claim - and the
   global mousemove the app registers first has already lowered e-kbdnav by the time these
   run. */
function wireRailHover(){
  addEventListener("load",()=>{ setTimeout(()=>{
    const l=$("#list"), r=$("#intentRailList");
    if(l) l.addEventListener("mousemove",cardHoverClaim,{passive:true});
    if(r) r.addEventListener("mousemove",railHoverClaim,{passive:true});
  },0); });
}
function drawIntentRailCore(){
  const box=$("#intentRailList");
  if(!box) return;
  syncIntentOrder();
  // Clearing innerHTML collapses the scroller and drops scrollTop to 0, which both loses the
  // user's place and makes the reorder animation measure against the wrong geometry.
  const keepScroll=box.scrollTop;
  const rows=displayIntentRows();
  const relRows=[];   // one entry per row, {el,sig} for echoed rows, null gaps - bracket pass below
  /* THE PICK PATH. Rebuilding all 72 rows made Firefox repaint every masked bracket, which
     is the stutter the eye catches on a pick. Same rows, moved and repainted instead. */
  const reuse=railReuseMap(box,rows);
  if(reuse){
    let cursor=box.firstChild;
    rows.forEach(r=>{
      const b=reuse.get(String(r.idx));
      if(b===cursor) cursor=cursor.nextSibling;
      else box.insertBefore(b,cursor);
      railPaintRow(b,r,relRows);
    });
    railBracketPass(relRows);
    box.scrollTop=keepScroll;
    stackPinnedIntents(box);
    syncIntentClearBtns();
    return;
  }
  box.innerHTML="";
  rows.forEach(r=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="rail-item"+(r.fav?" is-fav":"")+(r.hidden?" is-hidden":"");
    b.dataset.si=String(r.idx);
    b.dataset.sig=railRowSig(r);
    railPaintRow(b,r,relRows);
    const badge=r.custom?'<span class="rail-badge" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>':"";
    const favTip=t(r.fav?"Remove from Favourites":"Add to Favourites");
    /* One button slot, three jobs: hidden rows offer only "show again" (a hidden intent
       cannot be a favourite), visible rows show the star and swap it for hide while Ctrl
       is held (CSS, .ctrl-held) - how you hide an intent without opening Manage. */
    const btn = r.hidden
      ? '<span class="rail-fav rail-unhide" data-show-intent="'+esc(r.id)+'" title="'+esc(t("Show this intent again"))+'" aria-label="'+esc(t("Show this intent again"))+'">'+ICON_EYE_SHUT+'</span>'
      : '<span class="rail-fav'+(r.fav?" on":"")+'" data-fav-intent="'+esc(r.id)+'" title="'+esc(favTip)+' · '+esc(t("hold Ctrl to edit, Shift to hide"))+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(r.fav?"true":"false")+'">'+(r.fav?ICON_STAR_ON:ICON_STAR_OFF)+'</span>'
        +'<span class="rail-fav rail-edit" data-edit-intent="'+esc(r.id)+'" title="'+esc(t("Edit this intent"))+'" aria-label="'+esc(t("Edit this intent"))+'">'+ICON_EDIT+'</span>'
        +'<span class="rail-fav rail-hide" data-hide-intent="'+esc(r.id)+'" title="'+esc(t("Hide this intent: it greys out and drops to the bottom"))+'" aria-label="'+esc(t("Hide this intent"))+'">'+ICON_EYE_OPEN+'</span>';
    /* data-i18n-skip: the clause and its tag are the catalog's words. The badge inside is the
       engine's, so it is translated here rather than left for a sweep that will not enter. */
    b.innerHTML='<span class="rail-t cut-peek" data-i18n-skip>'+esc(r.t)+badge+'</span>'
      +(r.tag?'<span class="rail-tag cut-peek" data-i18n-skip>'+esc(r.tag)+'</span>':"")
      +btn;
    b.onpointerdown=e=>{
      /* Touch never starts a drag: a fingertip jitters past the 5px threshold on an
         ordinary tap, so every tap became a micro-drag, armed the click suppression, and
         the suppression ate the NEXT tap too - the whole panel read as dead on a touch
         screen. Reordering stays a fine-pointer affair; taps must always be taps. */
      if(e.pointerType==="touch") return;
      if(e.target.closest&&e.target.closest("[data-fav-intent],[data-hide-intent],[data-show-intent],[data-edit-intent]")) return;
      if(e.button!==0) return;
      railSuppressClick=false;
      railDrag={key:String(r.idx),band:b.dataset.band,x:e.clientX,y:e.clientY,moved:false};
    };
    /* Tracks whether the cursor is on the button slot, so Ctrl only swaps star-for-hide
       when actually pointing at it. Driven from the row's pointermove, not the button's
       enter/leave: hiding the star under the cursor would fire pointerleave and flicker.
       .rail-hide also carries .rail-fav, so the match survives the swap. */
    b.onpointermove=e=>{
      /* Self-heal the modifier classes: pointer events carry the real modifier state, so a
         ctrl-held left behind by a lost keyup is corrected the moment the cursor moves -
         before it can reach the slot. Guarded on a genuine mismatch: one classList read
         per move. */
      if(!!(e.ctrlKey||e.metaKey)!==document.body.classList.contains("ctrl-held")
         || !!e.shiftKey!==document.body.classList.contains("shift-held")){
        updateModifierPeek(e);
      }
      const on=!!(e.target.closest && e.target.closest(".rail-fav"));
      b.classList.toggle("slot-hot", on);
    };
    b.onpointerleave=()=>b.classList.remove("slot-hot");
    box.appendChild(b);
  });
  railBracketPass(relRows);
  /* "+ Intent" as a dashed row at the end of the list rather than a header button, matching
     the add-card at the end of the card list. Not a .rail-item, so it stays out of drag,
     selection and the band logic. */
  const add=document.createElement("button");
  add.type="button";
  add.className="rail-add";
  add.id="railAddIntent";
  add.innerHTML='<span class="ra-plus">+</span><span>'+esc(t("Add an intent"))+'</span>';
  add.title=t("Create a custom intent");
  add.onclick=()=>openIntentEditor(null);
  box.appendChild(add);
  box.scrollTop=keepScroll;
  stackPinnedIntents(box);
  syncIntentClearBtns();
}
/* Selected intents PIN to the scroller's top rather than merely sorting there -
   sorting alone made the row you just chose the one that vanished (it jumped to the top,
   off screen). The offsets are computed, not declared: a row is one line or two depending
   on its category tag, so a constant top would stack them on each other; each pinned row
   is offset by the real heights of those above it, plus the flex gap. */
const RAIL_GAP_PX=2;
/* UNPINNING MUST GIVE THE OFFSET BACK. Only .on is position:absolute; every other row is
   position:relative, so an inline top left behind by a previous pin does not sit idle - it
   slides that row down over its neighbour and opens a gap where it belongs. Cleared in its
   own pass, before any measuring, so no write lands between a read and the next row. */
function stackPinnedIntents(box){
  if(!box) return;
  box.querySelectorAll(".rail-item:not(.on)").forEach(el=>{ if(el.style.top) el.style.top=""; });
  // the lane before the heights: a pinned row's width, and so its line count, depends on it
  box.style.setProperty("--rail-sb", (box.offsetWidth-box.clientWidth)+"px");
  let off=0;
  /* Read every height before writing any top: interleaved, each write costs the next read a
     whole layout. Same two-pass rule as flipPills. */
  const stack=Array.from(box.querySelectorAll(".rail-item.on"));
  const tall=stack.map(el=>el.getBoundingClientRect().height);
  stack.forEach((el,i)=>{ el.style.top=off+"px"; off+=tall[i]+RAIL_GAP_PX; });
  box.style.setProperty("--rail-shelf", off+"px");   // the list starts below the stack - see .rail-body
}
/* FLIP for the panel, same two-half shape as the pills. offsetTop, not
   getBoundingClientRect - independent of the panel's own scroll. Travel capped at half
   the visible panel: longer reads as the panel scrolling, not a row moving. */
const RAIL_FLIP_TRAVEL=0.5;
function captureRail(){
  const box=$("#intentRailList");
  if(!box || mgReduceMotion()) return null;
  const before={};
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    before[el.dataset.si]={y:el.offsetTop, on:el.classList.contains("on")};
  });
  return before;
}
/* Same two-pass rule as flipPills, and the same reason: interleaved reads cost one
   full layout per row. `keep` names rows that must animate however far they travel -
   selecting sends a row to the TOP, a journey past the travel cap, and the one movement
   that explains the click was the only row that jumped. The cap still applies to the
   rest, where a long slide reads as the panel scrolling. Long journeys also get a little
   longer to make them, or they read as a flicker rather than travel. */
function flipRail(before,keep){
  if(!before) return;
  const box=$("#intentRailList");
  if(!box) return;
  const h=box.clientHeight||0, st=box.scrollTop||0;
  if(!h) return;
  const limit=h*RAIL_FLIP_TRAVEL;
  /* Offsets are in .rail-body, where the pinned rows sit above the list: the scroller's
     window starts at the list's own offset, and a pinned row is on screen by construction. */
  const top=box.offsetTop+st;
  const seen=(y,hgt,pinned)=> pinned || ((y+hgt)>top && y<top+h);
  const moved=[], dys=[], entered=[];
  box.querySelectorAll(".rail-item[data-si]").forEach(el=>{
    const b=before[el.dataset.si];
    if(b==null) return;
    const a=el.offsetTop;
    // whole pixels only - fractional offsets put the text on a half-pixel and it blurs
    const dy=Math.round(b.y-a);
    if(!dy) return;
    const hgt=el.offsetHeight;
    const seenAfter=seen(a,hgt,el.classList.contains("on"));
    const seenBefore=seen(b.y,hgt,b.on);
    if(!seenAfter && !seenBefore) return;
    /* Exempt from the cap only rows ON SCREEN to begin with - a clickable row is a visible
       one, and it bounds the journey to the panel's height; an exempt row sliding in from
       off-screen read as the interface lurching. Off-screen arrivals ENTER instead - a
       short fade at their final position: banning their travel while giving them no entry
       made equal-sized relevance swaps produce NO motion at all, which read as failure. */
    const exempt=seenBefore && keep && keep.has(String(el.dataset.si));
    if(Math.abs(dy)>limit && !exempt){
      if(seenAfter && !seenBefore) entered.push(el);
      return;
    }
    moved.push(el); dys.push(dy);
  });
  moved.forEach((el,i)=>{
    el.style.transition="none";
    el.style.willChange="transform";     // see the note in flipPills
    el.style.transform="translateY("+dys[i]+"px)";
  });
  entered.forEach(el=>{
    el.style.transition="none";
    el.style.opacity="0";
  });
  if(!moved.length && !entered.length) return;
  const far=Math.max.apply(null,dys.map(Math.abs));
  const dur=far>limit ? Math.min(.30, .18+far/6000) : .18;
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void box.offsetHeight;
  moved.forEach(el=>{ el.style.transition="transform "+dur+"s "+E_EASE; el.style.transform=""; });
  entered.forEach(el=>{ el.style.transition="opacity "+dur+"s "+E_EASE; el.style.opacity=""; });
  // clear the inline styles once done so nothing stays on a composited layer
  setTimeout(()=>{
    moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
    entered.forEach(el=>{ el.style.transition=""; el.style.opacity=""; });
  },dur*1000+20);
  return dur*1000;   // the caller waits this out before touching the main thread again
}
function wireRailPointer(){
  const intentRailEl=$("#intentRail");
  if(intentRailEl){
    intentRailEl.addEventListener("click",e=>{
      if(railSuppressClick){ railSuppressClick=false; return; }
      if(e.target.closest("#railPinBtn")){
        e.preventDefault(); e.stopPropagation();
        toggleRailLock();
        // The click that changes the state is the one that plays it - boot's sync stays still.
        const b=e.target.closest("#railPinBtn");
        b.classList.remove("e-lock-shut","e-lock-open");
        void b.offsetWidth;
        b.classList.add(railLocked()?"e-lock-shut":"e-lock-open");
        clearTimeout(b._eLockT);
        b._eLockT=setTimeout(()=>b.classList.remove("e-lock-shut","e-lock-open"),220);
        return;
      }
      // "+ Intent" is now the dashed row at the end of the list (see #railAddIntent), which
      // binds its own onclick - nothing to handle here.
      /* The one button slot, handled in one place. All three actions - star, hide, show
         again - MOVE the row, so all three animate; the two destructive ones used to be the
         only actions in the panel giving no account of themselves.
         Which action a click means is decided by the modifier ON THIS EVENT, never by which
         glyph is painted: body.ctrl-held is set on keydown, cleared on keyup, and a keyup
         does not always arrive (a browser shortcut, focus moving to a dialog) - the class
         then stays on, the star silently becomes hide, and a click meant as a star greys
         the intent: "sometimes hides by itself", caused minutes earlier, unreproducible.
         e.ctrlKey is sampled from the click and cannot go stale; the glyph swap is purely
         cosmetic - a click landing on the "wrong" glyph still does what the modifier says. */
      const slotEl=e.target.closest("[data-fav-intent],[data-hide-intent],[data-show-intent],[data-edit-intent]");
      if(slotEl){
        e.preventDefault(); e.stopPropagation();
        const row=slotEl.closest(".rail-item");
        // A hidden row offers "show again" only - Ctrl has nothing to mean there.
        let act=slotEl;
        if(!slotEl.hasAttribute("data-show-intent")){
          const want=(e.ctrlKey||e.metaKey) ? "[data-edit-intent]"
                   : e.shiftKey             ? "[data-hide-intent]"
                   :                          "[data-fav-intent]";
          act=(row&&row.querySelector(want))||slotEl;
        }
        const aid=act.getAttribute("data-fav-intent")||act.getAttribute("data-hide-intent")
          ||act.getAttribute("data-show-intent")||act.getAttribute("data-edit-intent");
        /* Editing opens a dialog and moves nothing, so it returns before the FLIP bookkeeping
           below - which exists to animate a row travelling to the top or the bottom. */
        if(act.hasAttribute("data-edit-intent")){
          const ei=intentIdxFromId(aid);
          if(ei>=0) openIntentEditor(ei);
          return;
        }
        /* Exempt the acted-on row from the travel cap, exactly as a picked one: it goes to
           the TOP (star) or the BOTTOM (hide), a journey past half the panel, and the cap
           was suppressing the one movement that explains what just happened. flipRail
           honours the exemption only for rows on screen to begin with, so travel stays
           bounded by the panel height. */
        const aIdx=intentIdxFromId(aid);
        const before=captureRail();
        if(act.hasAttribute("data-fav-intent")) toggleIntentFavourite(aid);
        else setIntentHidden(aid, act.hasAttribute("data-hide-intent"));
        flipRail(before, aIdx>=0?new Set([String(aIdx)]):null);
        return;
      }
      if(e.target.closest("#intentRailClear")){
        clearIntents();
        spinPickClear(e.target.closest("#intentRailClear"));
        return;
      }
      const btn=e.target.closest(".rail-item[data-si]");
      if(!btn) return;
      const si=+btn.dataset.si;
      if(e.ctrlKey||e.metaKey || intentIdxs.indexOf(si)>-1) pickIntent(si,true);
      else pickIntent(si,false);
      toast(intentIdxs.length ? t("{INTENT} set -")+" "+intentFor() : t("{INTENT} cleared"));
    });
    // double-click the title to restore original intent order (favs still pin on top)
    const railTitle=intentRailEl.querySelector(".rail-head b");
    if(railTitle) railTitle.ondblclick=()=>{
      animateRailReorder(()=>{
        setIntentOrder([]);
        for(let i=0;i<SW_EN.length;i++) intentOrder.push(i);
        setIntentOrderLoaded(true);
        syncIntentOrder();
      });
      drawIntentRail();
      toast("Intent order reset");
    };
  }
  addEventListener("pointermove",e=>{
    if(!railDrag) return;
    if(!railDrag.moved){
      if(Math.abs(e.clientX-railDrag.x)+Math.abs(e.clientY-railDrag.y)<5) return;
      railDrag.moved=true;
      document.documentElement.classList.add("raildrag");
      const el=$("#intentRailList")&&$("#intentRailList").querySelector('.rail-item[data-si="'+railDrag.key+'"]');
      if(el) el.classList.add("dragging");
    }
    if(Date.now()-railSwapLock < 190) return;
    const under=document.elementFromPoint(e.clientX,e.clientY);
    const t=under && under.closest ? under.closest(".rail-item") : null;
    if(!t || t.dataset.si===railDrag.key) return;
    // Same class only: favourites among favourites, regulars among regulars
    if(railDrag.band!=null && t.dataset.band!=null && railDrag.band!==t.dataset.band) return;
    const from=intentOrder.indexOf(+railDrag.key), to=intentOrder.indexOf(+t.dataset.si);
    if(from<0||to<0) return;
    railSwapLock=Date.now();
    moveIntent(from,to);
  },{passive:true});
  function endRailDrag(){
    if(!railDrag) return;
    const didMove=!!railDrag.moved;
    // Clear drag state BEFORE redraw - drawIntentRail() re-applies .dragging while
    // railDrag.moved is still true, which left items stuck grey after drop.
    railDrag=null;
    document.documentElement.classList.remove("raildrag");
    const box=$("#intentRailList");
    if(box) box.querySelectorAll(".rail-item").forEach(p=>p.classList.remove("dragging"));
    if(didMove){
      nsSet("IntentOrder",JSON.stringify(intentOrder));
      railSuppressClick=true;
      drawIntentRail(); // the rail follows the new order (no ghost drag style)
    }
  }
  addEventListener("pointerup",endRailDrag);
  addEventListener("pointercancel",endRailDrag);
  /* A FINGER ON A PINNED ROW. The row sits above the scroller, so a pan there reaches nothing
     that scrolls and the browser would take the page; touch-action:none on the row stops that,
     and this moves the list by the finger's travel. Past the tap threshold the click is
     suppressed for the length of the gesture, or a scroll would also unpick the row it began on. */
  let railPan=null;
  addEventListener("pointerdown",e=>{
    if(e.pointerType!=="touch") return;
    if(!(e.target&&e.target.closest&&e.target.closest("#intentRailList .rail-item.on"))) return;
    railPan={id:e.pointerId,y:e.clientY,moved:false};
  },{passive:true});
  addEventListener("pointermove",e=>{
    if(!railPan||e.pointerId!==railPan.id) return;
    const box=$("#intentRailList"); if(!box) return;
    const dy=e.clientY-railPan.y;
    if(!railPan.moved && Math.abs(dy)<5) return;
    railPan.moved=true; railSuppressClick=true;
    box.scrollTop-=dy; railPan.y=e.clientY;
  },{passive:true});
  function endRailPan(e){
    if(!railPan||e.pointerId!==railPan.id) return;
    railPan=null;
    // a click, if the browser sends one, arrives before this runs; if none comes, the flag must not wait for the next tap
    setTimeout(()=>{ railSuppressClick=false; },0);
  }
  addEventListener("pointerup",endRailPan);
  addEventListener("pointercancel",endRailPan);
}

/* One full turn of the pick arrow, every click - see the .e-spin-pick note in the
   stylesheet. Restartable: a second click mid-spin rewinds and goes around again. */
function spinPickClear(btn){
  if(!btn) return;
  btn.classList.remove("e-spin-pick");
  void btn.offsetWidth;
  btn.classList.add("e-spin-pick");
  clearTimeout(btn._eSpinT);
  btn._eSpinT=setTimeout(()=>btn.classList.remove("e-spin-pick"),500);
}
export {
  railRelKeys,
  railEchoRedraw,
  displayIntentRows,
  railScheduleSort,
  railSettle,
  railDecorate,
  cardFillKey,
  drawIntentRail,
  captureRail,
  flipRail,
  wireRailHover,
  wireRailPointer
};
