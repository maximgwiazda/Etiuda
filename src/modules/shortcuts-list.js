import { SC_DEFS, formatActionChord, formatChord, scChord, scChord2 } from "./shortcuts.js";
import { t } from "./ui-lang.js";
import { esc } from "./esc.js";

/* The list, its capture handling and its reset are ONE component, rendered into whatever
   container asks - the Settings accordion today, any future surface tomorrow - so a
   rebinding made anywhere behaves identically. */
function shortcutsListHtml(){
  const bind=(d,slot)=>{
    const fixed=!!d.fixed, listening=scCaptureId===d.id&&scCaptureSlot===slot;
    const c=slot===2?scChord2(d.id):scChord(d.id), empty=!c||(!c.code&&!c.key);
    const shown=slot===2?formatChord(c):formatActionChord(d.id);
    // a caption longer than the slot shrinks its type rather than the slot growing
    return '<button type="button" class="sc-bind'+(fixed?" fixed":"")+(listening?" listening":"")+(slot===2?" sc-alt":"")+(empty?" sc-empty":"")+(shown.length>7?" sc-long":"")+
      '" data-bind="'+esc(d.id)+'" data-slot="'+slot+'"'+
      (fixed?" disabled":' title="'+esc(t(slot===2?"An alternative: click, then press the key combo":"Click, then press the new key combo"))+'"')+'>'+
      (listening?esc(t("Press keys…")):(empty?esc(t("none")):esc(shown)))+'</button>';
  };
  const row=d=>{
    return '<div class="sc-row" data-sc="'+esc(d.id)+'">'+
      '<div class="sc-label">'+esc(t(d.label))+
        (d.hint?'<small>'+esc(t(d.hint))+'</small>':'')+
      '</div><div class="sc-binds">'+bind(d,1)+(d.fixed?"":bind(d,2))+'</div></div>';
  };
  /* Rebindable rows first, fixed rows grouped under their own separator - the split is the
     explanation a per-row tooltip could not give: tooltips on disabled buttons never reach
     keyboard or touch users, and the WHY is one fact shared by all of these, so it is said
     once, visibly, where the group starts. Render-level split only; SC_DEFS keeps its order. */
  return SC_DEFS.filter(d=>!d.fixed).map(row).join("")+
    '<div class="sc-sep">'+esc(t("Fixed keys"))+
      '<small>'+esc(t("The grammar the rest stands on: Esc is how key capture itself cancels, arrows and Enter keep their native meanings, and a held Ctrl is a hold, not a chord."))+'</small>'+
    '</div>'+
    SC_DEFS.filter(d=>d.fixed).map(row).join("");
}
/* The capture state is the list's rather than the chord model's: what it is listening
   for, and for which of the two slots. */
var scCaptureId=null, scCaptureSlot=1;
/** Paints the list into `box` and wires capture. `repaint` is how the component asks its host
 *  to draw again - the host owns the surrounding markup, so it decides what redrawing means. */
/* Whichever surface last painted the list owns the repaint - a rebinding must repaint in
   place, never throw the user into a different screen on a keystroke. */
let scRepaint=null;
function wireShortcutsList(box, repaint){
  if(!box) return;
  scRepaint=repaint;
  box.innerHTML=shortcutsListHtml();
  box.querySelectorAll("[data-bind]").forEach(btn=>{
    if(btn.disabled) return;
    btn.onclick=()=>{
      scCaptureId=btn.getAttribute("data-bind");
      scCaptureSlot=+btn.getAttribute("data-slot")||1;
      repaint();
      toast(scCaptureSlot===2?"Press the alternative (Esc to cancel, Backspace to clear)":"Press the new shortcut (Esc to cancel, Backspace for the default)");
    };
  });
}

/* The one write from outside: a module cannot assign to an imported binding, so every host
   that ends a capture asks for it here. It stops the listening and nothing else - the repaint
   belongs to whoever is painting, and two of the five callers do not repaint. */
function scStopCapture(){ scCaptureId=null; }

export {
  scCaptureId,
  scCaptureSlot,
  scRepaint,
  scStopCapture,
  wireShortcutsList
};
