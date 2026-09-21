import { lsSet } from "./storage.js";
import { seg, list } from "./dom.js";
import { syncShortcutTitles } from "./shortcuts.js";
import { drawIntentRail } from "./rail-list.js";
import { recountMacros } from "./card-counts.js";
import { syncIntentInput } from "./intent-clear.js";
import { drawPills, scheduleTabSave } from "./tabs.js";
import { cardSearchTerms } from "./spell.js";
import { cardDrag } from "./list-pointer.js";
import { render } from "./render.js";
import { cancelLangChunks, rebuildCardInPlace, runLangChunks } from "./card-pool.js";
import { catIconSvg } from "./cat-identity.js";
import { esc } from "./esc.js";
import { CATS, CONTENT_LANGS } from "./content-model.js";
import { putLang, lang, catOrder } from "./app-state.js";
// The language on screen: the segmented control, the state it writes, and the heavy half of a
// switch, which is deferred so the thumb's glide is not eaten by the rebuild under it.

/* Split in two because applyTab() needs the first half only: it draws the pills and re-renders
   the list itself, once, after installing the whole tab. Calling setLang() from there would
   render twice and write the tab back while it is still being applied. */
/* The state and the thumb: everything a click must do in its own frame, and nothing that
   costs more than a class toggle. */
function applyLangState(l){
  /* CLAMPED TO WHAT THE CATALOG DECLARES, not to the two this build happens to have columns for.
     The pair was written here as a literal, and boot seeds the language from "eLang" BEFORE the
     catalog is applied, so a desk that had a bilingual catalog and opened a one-language one
     arrived with the language it does not speak already selected and written straight back to
     storage (board 649, measured in a window: an en-only catalog booted with PL lit). The
     fallback is the primary, which is the answer cardLang already gives every other reader. */
  putLang((CONTENT_LANGS.indexOf(l)>-1) ? l : CONTENT_LANGS[0]);
  /* Records the language ON SCREEN, not the last one deliberately chosen - written on a
     tab switch as well as a click: pick PL in tab 1, switch to an English tab, close the
     browser - reopening should resume in EN, the language actually being worked in. */
  lsSet("eLang",lang);
  seg.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.l===lang));
}
function applyLangHeavy(){
  syncShortcutTitles();
  drawIntentRail();    // the rail lists clauses in the language on screen
  recountMacros();   // segment counts are per-language
}
function applyLangUI(l){ cancelLangTail(); applyLangState(l); applyLangHeavy(); }
/* THE THUMB FIRST, THE LANGUAGE UNDER IT. The .on toggle is the whole receipt and the CSS
   slides the thumb for .18s; the rest of a switch is ~200ms of synchronous work in Firefox,
   which ate the slide whole and left it snapping (Chrome is fast enough that it never
   showed). Fired two thirds of the way in, where the easing has already spent 93% of its
   travel, so the rebuild lands after the eye has stopped following the thumb. Reduced motion
   has no slide to protect and runs it straight. Cancelled by a second click and by a tab
   switch, so an EN/PL/EN run rebuilds once. */
let eLangTailT=0;
function cancelLangTail(){ if(eLangTailT){ clearTimeout(eLangTailT); eLangTailT=0; } }
function setLang(l){
  applyLangState(l);
  const tail=()=>{
    applyLangHeavy();
    syncIntentInput();   // a listed intent re-maps to the other language
    if(typeof catOrder!=="undefined") drawPills();
    /* The fast path never calls render(): the list's structure is language-blind, so a
       full paint would spend a 40-60ms style pass re-inserting 6.7k unchanged nodes. The
       screenful rebuilds in place, the rest follows in chunks. Search stays a full render -
       relevance order is per-language. The viewport scan exits early because a rect read
       under content-visibility resolves the card it touches: measuring everything IS the
       burst being avoided. */
    if(cardSearchTerms().length || typeof list==="undefined" || !list
       || !list.querySelector(".card[data-id]") || (typeof cardDrag!=="undefined"&&cardDrag)){
      render();
    } else {
      cancelLangChunks();
      list.querySelectorAll(".list-sep.e-catsep span[data-k]").forEach(sp=>{
        const k=sp.getAttribute("data-k");
        sp.innerHTML=catIconSvg(k)+esc(CATS[k]||k||"");
      });
      const vh=(window.innerHeight||900)+240;
      const els=list.querySelectorAll(".card[data-id]");
      const nowIds=[], laterIds=[];
      let past=false;
      for(let k=0;k<els.length;k++){
        const id=els[k].getAttribute("data-id");
        if(past){ laterIds.push(id); continue; }
        const r=els[k].getBoundingClientRect();
        if(r.top>vh){ past=true; laterIds.push(id); }
        else if(r.bottom<-240) laterIds.push(id);
        else nowIds.push(id);
      }
      nowIds.forEach(rebuildCardInPlace);
      runLangChunks(laterIds);
    }
    // Language belongs to the active tab, so a switch is a tab edit like PAX or ROLE.
    scheduleTabSave();
  };
  cancelLangTail();
  let still=false;
  try{ still=matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  if(still){ tail(); return; }
  /* After the seg glide (180ms), plus the pick-tail's own +20 - the tail is quick now,
     but even a quick tail landing mid-glide costs the one animation this delay buys. */
  eLangTailT=setTimeout(()=>{ eLangTailT=0; tail(); },200);
}
/* Folded, only the active button is on screen, so a click there has to TOGGLE -
   clicking the language you are already in would read as broken. The fold is read back
   from the DOM, not the media query: the stylesheet owns the breakpoint, and asking the
   element whether its sibling is displayed cannot drift from it. */
function segFolded(){
  return [...seg.querySelectorAll("button")].some(b=>b.offsetParent===null);
}
/* THE CONTROL IS THE CATALOG'S, AND IT IS BUILT RATHER THAN PRUNED. Two buttons stood in the
   markup and nothing rebuilt them, so one declared language got a button selecting a language
   with no text in it (649) and a catalog naming neither of the two got an empty box (646). One
   button per declared code, in order, keeping the markup's own where there is one so the pair's
   wording does not move. At one the control does not act, the code inert in the same box. Called
   once from boot: every route that redeclares the languages reloads. */
function syncLangSeg(){
  if(!seg) return;
  const declared=CONTENT_LANGS.length;
  seg.setAttribute("data-n",String(declared));
  const had={};
  seg.querySelectorAll("button").forEach(b=>{ had[b.dataset.l]=b; });
  seg.replaceChildren(...CONTENT_LANGS.map((l,i)=>{
    const b=had[l]||document.createElement("button");
    if(!had[l]){
      b.type="button";
      b.dataset.l=l;
      b.textContent=l.toUpperCase();
      /* UNTITLED, the 649 rule: a hover then finds the box's own title rather than a promise
         written for a language this build has no words for. syncShortcutTitles words the pair. */
    }
    /* The primary wears the accent and every language past it shares the secondary tint, which
       is the card body's rule (spec 2.6) written where the stylesheet can read it: keying the
       blush on the code meant a Polish-primary desk lit its primary in the other language's
       colour. */
    if(i) b.dataset.alt="1"; else delete b.dataset.alt;
    /* Inert rather than unwired at one: disabled keeps the keyboard out and drops the hover
       colour, and the title goes so a hover finds the box's own. */
    b.disabled=declared<2;
    if(declared<2) b.removeAttribute("title");
    return b;
  }));
  applyLangState(lang);
}
function wireLangSeg(){
  if(CONTENT_LANGS.length<2) return;
  seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const other=[...seg.querySelectorAll("button")].find(x=>x!==b);
    setLang(segFolded()&&other?other.dataset.l:b.dataset.l);
  });
}
/* Retitle on resize: the tooltip has to describe what a click will DO, and that differs between
   the two layouts. Only the wording depends on the media query - the behaviour above does not. */

export {
  applyLangState,
  applyLangHeavy,
  applyLangUI,
  cancelLangTail,
  setLang,
  segFolded,
  syncLangSeg,
  wireLangSeg,
};
