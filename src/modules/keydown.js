/* The document's own keydown, in two listeners: the capture pass that belongs to the
   shortcuts screen while a chord is being rebound, and the pass every other key goes
   through. */
import { dismissModal, modalOpen, modalTabTarget } from "./dialog.js";
import { closeFactsPanel, factsPanelOpen } from "./facts.js";
import { openMaintenance } from "./maintenance.js";
import { openManage } from "./manage.js";
import { openSettings } from "./settings.js";
import { SC_DEFS, chordFromEvent, chordsEqual, cloneChord, emptyChord, eventMatchesAction,
  formatChord, saveShortcuts, scMap, scMap2 } from "./shortcuts.js";
import { scCaptureId, scCaptureSlot, scRepaint, scStopCapture } from "./shortcuts-list.js";
import { activateTourFocus, endTour, moveTourFocus, tourActive } from "./tour.js";
import { t, toast } from "./ui-lang.js";
import { pageKeyScroll } from "./page-scroll.js";
import { $, intentEl } from "./dom.js";
import { closeNotePane } from "./note-pane.js";

/* Reaching for the search box dismisses the loose overlays: quick facts and the settings
   menu hang off the header directly over the box and the first cards, and neither is a mode
   you leave deliberately - a keystroke aimed somewhere else says you are done with them.
   DIALOGS ARE NOT INCLUDED, deliberately: they are modal, they hold unsaved work, and the
   global keydown returns before ever reaching here while one is open. */
function closeLooseOverlays(){
  if($("#settingsMenu") && !$("#settingsMenu").hidden){
    closeSettingsMenu();
  }
  if(factsPanelOpen()){
    closeFactsPanel();
  }
  closeNotePane();
}
function typingInField(){
  const a=document.activeElement;
  if(!a) return false;
  if(a.isContentEditable) return true;
  const tag=(a.tagName||"").toLowerCase();
  return tag==="input"||tag==="textarea"||tag==="select";
}

// Capture rebinds while the shortcuts modal is open (capture phase)
function wireCaptureKeydown(){
  addEventListener("keydown",e=>{
    if(!scCaptureId||!modalOpen()) return;
    if(e.key==="Escape"){
      e.preventDefault(); e.stopPropagation();
      scStopCapture();
      if(scRepaint) scRepaint();
      return;
    }
    const id=scCaptureId, slot=scCaptureSlot;
    if(e.key==="Backspace"||e.key==="Delete"){
      e.preventDefault(); e.stopPropagation();
      const d=SC_DEFS.find(x=>x.id===id);
      if(slot===2) scMap2[id]=emptyChord(); else scMap[id]=cloneChord(d.def);
      scStopCapture(); saveShortcuts(); if(scRepaint) scRepaint();
      toast(slot===2?"Alternative cleared":"Back to the default");
      return;
    }
    const chord=chordFromEvent(e);
    if(!chord) return;
    e.preventDefault(); e.stopPropagation();
    /* THE FIXED KEYS ARE NOT ON OFFER: the list says they keep their own meanings, and the sweep
       below cannot take a chord back off one - it skips them. Refusing the capture is what keeps
       that promise; the row stays open for another key. */
    const fixedOwner=SC_DEFS.find(d=>d.fixed && (chordsEqual(d.def,chord)||chordsEqual(d.def2,chord)));
    if(fixedOwner){
      toast(t("{KEY} is fixed and keeps its own meaning").replace("{KEY}",formatChord(chord)));
      return;
    }
    // The chord leaves whichever slot held it, on any action: the taken slot returns to its default.
    SC_DEFS.forEach(d=>{
      if(d.fixed) return;
      if(!(d.id===id&&slot===1) && chordsEqual(scMap[d.id],chord)) scMap[d.id]=cloneChord(d.def);
      if(!(d.id===id&&slot===2) && chordsEqual(scMap2[d.id],chord)) scMap2[d.id]=emptyChord();
    });
    if(slot===2) scMap2[id]=chord; else scMap[id]=chord;
    scStopCapture();
    saveShortcuts();
    if(scRepaint) scRepaint();
    toast(t("Saved {KEY}").replace("{KEY}",formatChord(chord)));
  }, true);
}

function wireGlobalKeydown(){
  addEventListener("keydown",e=>{
    if(scCaptureId) return;

    if(tourActive()){
      if(e.key==="Escape" || eventMatchesAction(e,"escape")){
        e.preventDefault();
        endTour(false);
      }

      // ←/→ move the selection across the tour buttons; Enter presses the selected one.
      if(e.key==="ArrowRight"){
        e.preventDefault();
        moveTourFocus(1);
      } else if(e.key==="ArrowLeft"){
        e.preventDefault();
        moveTourFocus(-1);
      } else if(e.key==="Enter"){
        e.preventDefault();
        activateTourFocus();
      }
      return;
    }

    if(modalOpen()){
      // Escape is the keyboard's X, and goes where the X goes - back one screen, then out.
      if(e.key==="Escape"){ e.preventDefault(); dismissModal(); }
      /* A rescue must be reachable from anywhere - including from inside a dialog, where a
         misbehaving Etiuda is often being poked. It swaps into the modal the way the
         Library's sub-dialogs do, and closing RETURNS to the swapped-out screen: the
         Library and the shortcuts list are recognised by their own furniture and reopened;
         anything else closes outright. */
      else if(eventMatchesAction(e,"maintenance")){
        e.preventDefault();
        const back=$("#mgClose")?(()=>openManage())
          :$("#setBody")?(()=>openSettings("keys"))
          :null;
        openMaintenance(back);
      }
      /* AND THE EDITORS KEEP THEIR OWN ARROWS. Everything else stays suppressed - a dialog
         holds unsaved work and the main screen's keys have no meaning over it - but walking
         to the next card is what these two are FOR, and they exist nowhere else. */
      else if(eventMatchesAction(e,"edPrevEntry")){ e.preventDefault(); runShortcut("edPrevEntry"); }
      else if(eventMatchesAction(e,"edNextEntry")){ e.preventDefault(); runShortcut("edNextEntry"); }
      /* Swallowed whether or not it lands, unlike on the main screen: at the last tab the key
         has nothing to do, and letting it through would be the browser leaving the editor. */
      else if(eventMatchesAction(e,"edPrevLang")){ e.preventDefault(); runShortcut("edPrevLang"); }
      else if(eventMatchesAction(e,"edNextLang")){ e.preventDefault(); runShortcut("edNextLang"); }
      else if(e.key==="Tab"){
        const to=modalTabTarget(e.shiftKey);
        if(to){ e.preventDefault(); try{ to.focus({preventScroll:true}); }catch(x){ to.focus(); } }
      }
      return;
    }


    if(eventMatchesAction(e,"escape")){
      if($("#settingsMenu")&&!$("#settingsMenu").hidden){
        e.preventDefault(); closeSettingsMenu(); return;
      }
      if(factsPanelOpen()){ e.preventDefault(); closeFactsPanel(); return; }
    }

    const inField=typingInField();
    for(let i=0;i<SC_DEFS.length;i++){
      const d=SC_DEFS[i];
      if(d.fixed) continue;
      if(!eventMatchesAction(e,d.id)) continue;
      if(inField&&!d.inField) continue;
      // runShortcut may return false to decline (an editor arrow with no editor open)
      if(runShortcut(d.id)!==false){
        e.preventDefault();
        return;
      }
    }

    /* After the rebindable pass, so a binding placed on one of these still wins. Page up and
       down run from inside the search box too - a caret in a single-line field has no use for
       them - while Home and End keep their meaning there, behind the guard below. */
    const plain=!e.ctrlKey && !e.altKey && !e.metaKey;
    if(plain && (e.key==="PageDown"||e.key==="PageUp") && pageKeyScroll(e.key)){ e.preventDefault(); return; }
    if(inField) return;
    if(plain && (e.key==="Home"||e.key==="End") && pageKeyScroll(e.key)){ e.preventDefault(); return; }
    if(eventMatchesAction(e,"navUp")){ e.preventDefault(); runShortcut("navUp"); return; }
    if(eventMatchesAction(e,"navDown")){ e.preventDefault(); runShortcut("navDown"); return; }
    if(eventMatchesAction(e,"markTop")){ e.preventDefault(); runShortcut("markTop"); return; }
    if(eventMatchesAction(e,"markBottom")){ e.preventDefault(); runShortcut("markBottom"); return; }
    if(eventMatchesAction(e,"navPillFirst")){ e.preventDefault(); runShortcut("navPillFirst"); return; }
    if(eventMatchesAction(e,"navPillLast")){ e.preventDefault(); runShortcut("navPillLast"); return; }
    if(eventMatchesAction(e,"navPillLeft")){ e.preventDefault(); runShortcut("navPillLeft"); return; }
    if(eventMatchesAction(e,"navPillRight")){ e.preventDefault(); runShortcut("navPillRight"); return; }
    if(eventMatchesAction(e,"copyOther")){ e.preventDefault(); runShortcut("copyOther"); return; }
    if(eventMatchesAction(e,"copy")){ e.preventDefault(); runShortcut("copy"); return; }
    if(eventMatchesAction(e,"escape")){ e.preventDefault(); runShortcut("escape"); return; }

    // Nothing focused (e.g. clicked empty space): printable keys go straight into INTENT.
    // First character is inserted manually because focus alone would swallow this keydown.
    if(e.ctrlKey||e.altKey||e.metaKey) return;
    if(e.key.length!==1) return;
    if(!intentEl) return;
    e.preventDefault();
    closeLooseOverlays();
    try{ intentEl.focus({preventScroll:true}); }catch(_){ try{ intentEl.focus(); }catch(__){} }
    /* No special case for any bound printable key here: the dispatch loop above owns every
       binding and returns before this point. A hardcoded key here survives rebinds and makes the
       shortcuts screen a liar - a key that reaches this line is an ordinary character and
       gets typed. */
    const v=String(intentEl.value||"");
    const start=intentEl.selectionStart==null?v.length:intentEl.selectionStart;
    const end=intentEl.selectionEnd==null?v.length:intentEl.selectionEnd;
    intentEl.value=v.slice(0,start)+e.key+v.slice(end);
    const caret=start+e.key.length;
    try{ intentEl.setSelectionRange(caret,caret); }catch(_){}
    intentEl.dispatchEvent(new Event("input",{bubbles:true}));
  });
}

export {
  closeLooseOverlays,
  wireCaptureKeydown,
  wireGlobalKeydown
};
