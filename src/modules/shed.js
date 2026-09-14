import { closeFactsPanel } from "./facts.js";
import { mgReduceMotion, E_EASE } from "./motion.js";
import { applyTabWidths, TAB_FLOOR_W } from "./tabs.js";
import { t } from "./ui-lang.js";
import { $ } from "./dom.js";
import { closeSettingsMenu } from "./header-menus.js";

// The header row's own negotiation: what leaves when the row will not hold it, and the >>
// chevron that keeps a door on what left. The strip it negotiates with is tabs.js.
/* ---- the >> chevron. Design note at #moreWrap in the markup. The one rule that
   matters: everything reads the LIVE computed state of the buttons themselves - no width
   appears in this code, so the ladder's rungs cannot drift from the chevron's idea of
   them; there is no second copy of the policy to go stale. */
function syncMoreBtn(){
  const wrapEl=$("#moreWrap"); if(!wrapEl) return;
  const facts=$("#factsBtn"), theme=$("#theme"), seg=$("#seg");
  const factsGone=!!facts && getComputedStyle(facts).display==="none";
  const themeGone=!!theme && getComputedStyle(theme).display==="none";
  const segGone=!!seg && getComputedStyle(seg).display==="none";
  const fRow=$("#moreFacts"), tRow=$("#moreTheme"), lRow=$("#moreLang");
  if(fRow) fRow.hidden=!factsGone;
  if(tRow) tRow.hidden=!themeGone;
  if(lRow){
    lRow.hidden=!segGone;
    /* The badge names the language you are IN - the folded seg shows the current language
       and switches on click, and one control must read the same behind whichever door it
       stands in. The TARGET goes in the title, where "what happens if I press" belongs. */
    const pl=(typeof lang!=="undefined" && lang==="pl");
    const badge=$("#moreLangBadge");
    if(badge) badge.textContent=pl?"PL":"EN";
    lRow.title=t(pl?"Polish cards - switch to English":"English cards - switch to Polish");
  }
  const any=factsGone||themeGone||segGone;
  /* Widening the window while the dropdown is open takes the reason for it away mid-look;
     the menu closes with the button rather than orphaning an open panel over nothing. */
  if(!any) closeMoreMenu();
  wrapEl.hidden=!any;
}
/* ---- the shed algorithm: the first row hides by MEASURING, not by width table. THE
   DECISION IS A PURE FUNCTION of row width, frozen naturals, tab count and the rail
   signal - it never reads its own output, so nothing oscillates. THE COVENANT: room for
   TABS_MIN_VISIBLE floor-width tabs before any chrome is asked to leave, cheapest first.
   Design note at the body.shed-* rules in the sheet. */
const TABS_MIN_VISIBLE=3;
/* Theme, then FACTS - the two chevron dwellers lead, because the chevron must never
   open on a single row: freed pixels with one lonely row behind the door is the same
   pointlessness wearing a different width. The fold follows; the whole seg is last. */
/* The wordmark is a rung priced by NEED on every device - not a media query, and NOT
   coupled to the digit fallback, which fires from tab count. Second-to-last: identity
   outlives function, yielding only to the seg's final retreat. It alone has a SECOND reason
   to go, deliberately not a rung and deliberately tab-count driven: the strip's own claim,
   which lives in applyTabWidths() because it must land in the same frame as the arrows. */
const SHED_ORDER=["shed-theme","shed-facts","shed-segfold","shed-wordmark","shed-seg"];
let eShedNat=null;   // natural widths - boot seeds them all; later passes refresh what is visible
function measureShedNaturals(){
  const w=el=>el?el.getBoundingClientRect().width:0;
  const seg=$("#seg"), segOn=$("#seg button.on")||$("#seg button");
  /* A reading is trusted only in the STATE the entry names - a folded seg measuring 43px
     "visible" once overwrote segFull's honest 86, each pass corrupting the next, and the
     header stripped itself bare. Validity, per entry, is the state check. */
  const segBoth=!!seg && w(seg)>0 && !!$("#seg button:not(.on)") &&
                getComputedStyle($("#seg button:not(.on)")).display!=="none";
  const m={
    theme:   w($("#theme")),
    segFull: segBoth ? w(seg) : 0,
    /* Gated like segFull above, and for the same reason: at the last rung the whole seg is
       display:none, so this measured 0 and the +2 smuggled a "valid" 2px past the merge,
       pricing the fold's return at 2 instead of ~40. */
    segFold: w(segOn)>0 ? w(segOn)+2 : 0,   // the fold keeps one button (+ borders)
    facts:   w($("#factsBtn")),
    chevron: w($("#settingsBtn")),       // same .btn.icbtn box; the chevron itself may be hidden
    wordmark: w($(".brand-long"))
  };
  /* Merge, never replace: 0 means "no valid reading this pass", not "zero pixels wide".
     Boot seeds every entry while everything is visible and unfolded; later passes refresh
     what is measurable in the right state (zoom resizes glyphs mid-session) and keep the
     last honest reading for the rest. */
  /* Whole pixels only - fractional naturals are the fuel of cross-engine flapping: two
     layouts can disagree by half a pixel, and a knife-edge fits() amplifies that into a
     per-frame decision flip. Ceiling is the conservative direction: overstating chrome
     sheds a hair early, and early is the invisible failure. */
  Object.keys(m).forEach(k=>{ m[k]=Math.ceil(m[k]); });
  if(!eShedNat){ eShedNat=m; return; }
  Object.keys(m).forEach(k=>{ if(m[k]>0) eShedNat[k]=m[k]; });
}

/* ---- shed choreography, the restrained layer. SURVIVORS GLIDE (FLIP; the strip rides
   as one box), LEAVERS FADE where they stand as position:fixed ghosts (the element is
   already display:none), ARRIVERS fade in, THE DOOR scales in. Two structural rules: the
   diff is scheduler ENTRY versus EXIT, never per-apply() - the algorithm probes candidate
   states inside one synchronous pass, so probes stay invisible and only the settled truth
   animates; and ghosts are fixed clones on <body>, transform/opacity only - they cannot
   resize anything the algorithm measures, and the ResizeObserver cannot hear them. */
/* The wordmark is MEASURED, so it may not transition for real - a width read mid-fade
   is input corruption; the cast animates a CLONE while the element goes display:none at
   frame one. The arrows are cast members for the same reason they share the wordmark's
   moment: a pop landing beside a fade is read as a second event. */
const SHED_CAST=["#theme","#factsBtn","#seg","#moreBtn",".brand-long","#tabsPrev","#tabsNext"];
function shedSnap(){
  const m={};
  SHED_CAST.concat(["#tabsWrap","#settingsWrap"]).forEach(sel=>{
    const el=$(sel); if(!el) return;
    const cs=getComputedStyle(el);
    m[sel]={ r:el.getBoundingClientRect(), vis:cs.display!=="none" && el.getBoundingClientRect().width>0 };
  });
  return m;
}
/* A CALLER HOLDING A SNAPSHOT SAYS SO, and applyTabWidths leaves the movement to it. Without
   this the wordmark moved twice on the paths that already choreograph (the header sync probes
   candidate states; the tab insert releases with its grow), and not at all on the paths that
   do not - the ResizeObserver re-fits the strip before the header sync has taken its before
   picture, so a window crossing the threshold snapped 58px in one frame. */
let shedHeld=0;
/* The one way to raise it, so that a writer outside this module does not have to reach a
   binding a module namespace hands over read-only. Both brackets were already identical. */
function shedHold(fn){ shedHeld++; try{ fn(); } finally { shedHeld--; } }
function shedAnimate(before){
  const go=shedStage(before);
  if(!go) return;
  void document.body.offsetWidth;   // the from-state is committed before any transition attaches
  go();
}
/* STAGED AND RELEASED APART, so a caller with an animation of its own can start the header in
   the SAME frame as it. The tab insert attaches its widths two frames late on purpose - a
   main-thread width animation loses its opening third otherwise - and a glide let go at the
   mutation ran 46ms ahead of the grow, which is long enough to read as the header moving
   first and the strip following. Staging still happens at the mutation: the from-state must
   be on screen before the row has been seen in its new shape. */
function shedStage(before){
  if(mgReduceMotion()) return null;
  const after=shedSnap();
  const EASE=E_EASE;
  const go=[];
  SHED_CAST.forEach(sel=>{
    const b=before[sel], a=after[sel], el=$(sel);
    if(!b||!a||!el) return;
    if(b.vis && !a.vis){
      const g=el.cloneNode(true);
      g.style.cssText="position:fixed;left:"+b.r.left+"px;top:"+b.r.top+"px;width:"+b.r.width
        +"px;height:"+b.r.height+"px;margin:0;z-index:200;pointer-events:none;opacity:1;"
        +"transition:opacity .16s ease";
      document.body.appendChild(g);
      go.push(()=>{ g.style.opacity="0"; setTimeout(()=>g.remove(), 200); });
    } else if(!b.vis && a.vis){
      el.style.transition="none";
      el.style.opacity="0";
      go.push(()=>{ el.style.transition="opacity .18s ease"; el.style.opacity="";
                    setTimeout(()=>{ el.style.transition=""; }, 220); });
    }
  });
  /* Survivors glide. */
  ["#tabsWrap","#seg","#settingsWrap","#moreBtn"].forEach(sel=>{
    const b=before[sel], a=after[sel], el=$(sel);
    if(!b||!a||!el||!b.vis||!a.vis) return;
    const dx=b.r.left-a.r.left;
    if(Math.abs(dx)<1) return;
    el.style.transition="none";
    el.style.transform="translateX("+dx+"px)";
    go.push(()=>{ el.style.transition="transform .2s "+EASE; el.style.transform="";
                  setTimeout(()=>{ el.style.transition=""; }, 240); });
  });
  /* The door opens with a small scale, layered over its arriver fade. */
  const bM=before["#moreBtn"], aM=after["#moreBtn"], elM=$("#moreBtn");
  if(bM&&aM&&elM&&!bM.vis&&aM.vis){
    elM.style.transition="none"; elM.style.transform="scale(.6)"; elM.style.opacity="0";
    go.push(()=>{ elM.style.transition="transform .18s "+EASE+",opacity .16s ease";
                  elM.style.transform=""; elM.style.opacity="";
                  setTimeout(()=>{ elM.style.transition=""; }, 220); });
  }
  return go.length ? (()=>{ for(let i=0;i<go.length;i++) go[i](); }) : null;
}
function syncHeaderShed(){
  const row=$(".row"), wrap=$("#tabsWrap"), bar=$("#tabsBar");
  if(!row||!wrap||!bar) return;
  /* THE ROW IS ASKED, NOT MODELLED: a summed chrome model ran 46px short of the real row
     and promised a covenant the layout could not honour. SHED while genuinely short
     (overflowing AND wrap below covenant); RETURN while the strip's measured room above
     the destination's covenant covers the control's frozen width plus 14px headroom.
     The strip is the row's one reservoir - the flexible AGENT field left for the second
     row, and took the second reservoir with it. */

  /* Each step applies its class and re-fits synchronously; the next iteration reads the
     settled result - monotone within a pass, bounded by the ladder, the two directions
     separated by the 14px band, so no width can satisfy both and oscillate. Frozen ceiled
     naturals price only the control that would RETURN - not on screen to measure - and
     ceiling errs toward staying in the chevron, the invisible failure. */
  if(!eShedNat || syncHeaderShed._refreshNat){ syncHeaderShed._refreshNat=false; measureShedNaturals(); }
  const N=eShedNat;
  /* The rail enters through row.clientWidth alone - no rail class is consulted: a second
     authority over the same buttons is what produced the divided-authority bugs. */
  /* THE COVENANT IS A LADDER, constants, blind to tab count (a second tab must not evict
     the theme button). Each sacrifice BUYS TOLERANCE - one covenant for every rung spaced
     the rungs only by the scraps each sacrifice freed. NEED in floor-tab units per k:
     3, 3, 2.75, 2, 2, 2 (5 equals 4: nothing left to shed, it only prices returns).
     Monotone non-increasing is the coherence requirement: a return lands 8px above its
     destination's OWN rung, so no state reached by a return can immediately re-shed. */
  /* The wordmark's rung is 2.0: it must leave clearly AFTER the rail undocks (~670px),
     not within eight pixels, or the two read as one event. Equal prices on adjacent rungs
     are safe - shedding one returns its width to the grant, so rungs may share a price but
     cannot fire together. NOT wired to the rail's own threshold: that moves with a
     draggable width, and coupling would hand the header a second authority. */
  const NEED=[TABS_MIN_VISIBLE,TABS_MIN_VISIBLE,2.75,2,2,2]
    .map(t=>Math.round(t*(TAB_FLOOR_W+3))+40+21);
  /* What returning one step would put back, by the step being LEFT (k -> k-1):
     1->0 theme; 2->1 facts; 3->2 the seg unfolds; 4->3 the wordmark; 5->4 the folded seg. */
  const returnCost=[N.theme, N.facts, N.segFull-N.segFold, N.wordmark, N.segFold];
  /* Overflow is the arrows' concern (updateTabOverflow) and no rung reads it. The one
     decision that does is the wordmark's, and it is taken there, not here. */
  /* The GRANT, not the wrap: the wrap is content-sized and lies in the roomy direction
     with few tabs - a 294px wrap "breached" a covenant the 500px grant met three times
     over. apply() re-fits before every read, so the grant is this candidate state's own. */
  const grant=()=>(typeof applyTabWidths!=="undefined" && applyTabWidths._grantW)||wrap.clientWidth;
  /* No decision before applyTabWidths publishes its first grant: the fallback wrap reads
     "desperately short" at any width, and the first pass would shed ALL chrome and burn
     the return epoch on garbage. drawTabs runs applyTabWidths then scheduleHeaderSync, so
     a deciding pass always follows with a real number. */
  if(typeof applyTabWidths==="undefined" || !applyTabWidths._grantW) return;
  /* Priced against the DESTINATION's rung: the strip's reservoir is whatever it holds above
     what the state being returned TO would insist on - a return from k=5 to k=4 only has to
     fund the folded seg against the two-tab rung, not the three-tab one. */
  const reclaimable=(target)=>Math.max(0, grant()-NEED[target]);
  let k=syncHeaderShed._k!=null?syncHeaderShed._k:0;
  const apply=()=>{
    SHED_ORDER.forEach((c,i)=>document.body.classList.toggle(c, i<k));
    applyTabWidths();   // settle the strip before re-reading
  };
  apply();   // make the DOM agree with _k before reading it (boot, or a stale class from elsewhere)
  /* THE CHEVRON NEVER OPENS ON A SINGLE ROW - a door is only worth a doorway when at
     least two things live behind it. The two dwellers hide as a PAIR (net ~+40px after the
     door's own cost) and k=1 is not a resting state, UNCONDITIONALLY: every exception
     tried meant two authorities hiding one button. The bump is upward - a step shed early
     is the invisible failure, a one-row chevron the visible one. */
  if(k===1){ k=2; apply(); }
  /* WIDTH ONLY - no over() term: the ladder is blind to tab count, so a new tab cannot
     evict a rung at an unchanged width. Short = grant below NEED[k]; return-eligible = above
     NEED[k]+8. One axis, one deadband per rung; a rung hides at the same width whether the
     strip holds one tab or twelve. Both closures read k live. The wordmark is the exception
     and pays for it in applyTabWidths, beside the arrows. */
  const shortNow=()=>grant()<NEED[k];
  if(shortNow()){
    while(k<SHED_ORDER.length && shortNow()){ k++; apply(); }
    if(k===1){ k=2; apply(); }   // a shed resting on the one-row rung completes the pair
  } else {
    /* RETURNS HAPPEN AT MOST ONCE PER INPUT EPOCH - the whole oscillation proof: any
       disagreement between two controllers cycles if the loser may retry, so the RETRY is
       what dies. An attempt runs only when the coin (quantized innerWidth, rail signal,
       storm/settled flag) differs from the last attempt's, and the coin is consumed by
       the ATTEMPT, not the outcome. Shedding stays immediate and un-gated - the covenant
       must never wait - and a shed state cannot ring alone: only a return hands back the
       width shedding would take again. innerWidth, not row.clientWidth: a vetoed state
       that summons a scrollbar would narrow the row, mint a fresh epoch and license its
       own retry. Quantized to 4px so zoom noise cannot mint epochs. The veto stays last:
       a return that leaves ANY overflow or dips within 8px of the covenant reverts on the
       spot. */
    /* The rail bit is the DOCKED state: a docked panel narrows the row, so docking changing is
       a genuine input change that re-licenses a return attempt. The old bit was the width
       signal, which no longer feeds any control decision. */
    /* Width and rail docking only - the tab count left the algorithm with the covenant's
       scaling, so it has no business minting return attempts either. */
    const epoch=Math.round(innerWidth/4)+"/"+(document.body.classList.contains("rail-on")?1:0);
    /* THE COVENANT IS THE ONLY CURRENCY - overflow is not consulted: a scrolling strip is
       the NORMAL resting state with many tabs, and gating on !over() kept six tabs' chrome
       shed at enormous widths. The epoch is consumed only when an attempt can start. */
    const roomy=()=>grant()>=NEED[k]+8;
    /* STORM AND SETTLED ARE SEPARATE COINS: returns must fire DURING the widening as sheds
       do during narrowing, but a mid-storm attempt against transient geometry must not
       spend the width's only try. A veto mid-drag costs nothing durable; the final width
       still gets one clean attempt on settled geometry. */
    const settled=!syncHeaderShed._lastResize || performance.now()-syncHeaderShed._lastResize>=250;
    if(!settled && !syncHeaderShed._settleTimer && typeof scheduleHeaderSync==="function"){
      syncHeaderShed._settleTimer=setTimeout(()=>{ syncHeaderShed._settleTimer=0; scheduleHeaderSync(); }, 280);
    }
    const coin=(settled?"s":"m")+epoch;
    if(syncHeaderShed._returnEpoch!==coin && roomy()){
      syncHeaderShed._returnEpoch=coin;   // consumed by the attempt, whatever happens next
      while(k>0 && roomy()){
        /* From k=2 the return is the PAIR - theme and Quick facts come back together, priced
           together - because stepping to k=1 would leave the chevron holding one row, the
           state the pair law exists to forbid. Above 2, single steps. */
        /* The pair's price is NET of the chevron: returning theme and facts also dismisses
           the door, so the row recovers its 40px - the gross sum overpriced the step and
           held the pair in the chevron ~50px of width longer than the veto would have. The
           veto still measures truth either way. */
        const step=(k===2)?2:1;
        const cost=(k===2)?(returnCost[0]+returnCost[1]-N.chevron):returnCost[k-1];
        if(reclaimable(k-step)<cost+14) break;
        k-=step; apply();
        if(!roomy()){ k+=step; apply(); break; }
      }
    }
  }
  syncHeaderShed._k=k;
}
function closeMoreMenu(){
  const m=$("#moreMenu"), b=$("#moreBtn");
  if(m) m.hidden=true;
  if(b){ b.classList.remove("on"); b.setAttribute("aria-expanded","false"); }
}
function openMoreMenu(){
  const m=$("#moreMenu"), b=$("#moreBtn");
  if(!m||!b) return;
  closeSettingsMenu(); closeFactsPanel();
  syncMoreBtn();   // rows reflect this instant's measurement, not the last resize's
  m.hidden=false;
  b.classList.add("on");
  b.setAttribute("aria-expanded","true");
}

export {
  syncMoreBtn, openMoreMenu, closeMoreMenu,
  eShedNat, shedSnap, shedStage, shedAnimate, shedHeld, shedHold, syncHeaderShed,
};
