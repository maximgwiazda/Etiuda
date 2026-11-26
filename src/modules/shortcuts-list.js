import { SC_DEFS, formatActionChord, formatChord, scChord, scChord2 } from "./shortcuts.js";
import { t, toast } from "./ui-lang.js";
import { esc } from "./esc.js";
import { foldAccents } from "./words.js";

/* The list, its capture handling and its reset are ONE component, rendered into whatever
   container asks, so a rebinding made anywhere behaves identically. A search narrows it to
   the actions whose name or hint holds the words, already folded to lower case without accents. */
function scFold(s){ return foldAccents(s); }
function scMatch(d,q){ return !q || scFold(t(d.label)+" "+(d.hint?t(d.hint):"")).indexOf(q)>=0; }
function shortcutsShown(q){ return SC_DEFS.filter(d=>scMatch(d,q)).length; }
/* The task groups the list stands in, each shortcut once and the fixed ones in their task; tests/settings-grouped.mjs holds it. */
const SC_GROUPS=[
  {head:"Every day", ids:["copy","copyOther","navUp","navDown","nextCopy1","nextCopy2","nextCopy3","nextCopy4","langToggle","selectSearch","escape","undo"]},
  {head:"Tabs and the customer", ids:["tabNext","tabPrev","tabNew","focusPax","focusRole"]},
  {head:"Finding a card", ids:["navPillLeft","navPillRight","navPillFirst","navPillLast","allCats","clearIntent","markTop","markBottom","lanes","expandPills","toggleRail","togglePills"]},
  {head:"Editing the catalog", ids:["newCard","rename","edPrevEntry","edNextEntry","edPrevLang","edNextLang","edSwitch"]},
  {head:"Panels", ids:["quickFacts","openMenu","maintenance"]}
];
function shortcutsListHtml(q){
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
    const chg=d.newKey ? '<span class="chg">'+esc(t("new key"))+'</span>' : '';
    return '<div class="sc-row" data-sc="'+esc(d.id)+'">'+
      '<div class="sc-label">'+esc(t(d.label))+
        (d.hint?'<small>'+esc(t(d.hint))+'</small>':'')+
      '</div>'+chg+'<div class="sc-binds">'+bind(d,1)+(d.fixed?"":bind(d,2))+'</div></div>';
  };
  /* Each task group is one card of ruled rows; a fixed key stands in its task with its one greyed key, and what they have in
     common is said once, visibly, after the last group: tooltips on disabled buttons never reach keyboard or touch users.
     A shortcut no group names joins the last, so one added without a group is still on the list. Render-level only. */
  const groups=SC_GROUPS; /* plant:keys-groups */
  const named=new Set([].concat(...groups.map(g=>g.ids)));
  const rest=SC_DEFS.filter(d=>!named.has(d.id)).map(d=>d.id);
  const body=groups.map((g,i)=>{
    const rows=(i===groups.length-1 ? g.ids.concat(rest) : g.ids).map(id=>SC_DEFS.find(d=>d.id===id)).filter(d=>d && scMatch(d,q));
    return rows.length ? '<div class="sc-group"><h3>'+esc(t(g.head))+'</h3><div class="sx-card sc-card"><div class="sc-list sc-two">'+rows.map(row).join("")+'</div></div></div>' : "";
  }).join("");
  return body+(SC_DEFS.some(d=>d.fixed && scMatch(d,q)) ? '<div class="sc-sep">'+esc(t("Fixed keys"))+
    '<small>'+esc(t("The grammar the rest stands on: Esc is how key capture itself cancels, arrows and Enter keep their native meanings, and a held Ctrl is a hold, not a chord."))+'</small></div>' : "");
}
/* The capture state is the list's rather than the chord model's: what it is listening
   for, and for which of the two slots. */
var scCaptureId=null, scCaptureSlot=1;
/* One write of which row is listening, so every start of a capture does it the same way. */
function scBeginCapture(id, slot){
  scCaptureId=id;
  scCaptureSlot=+slot||1;
}
/** Paints the list into `box` and wires capture. `repaint` is how the component asks its host
 *  to draw again - the host owns the surrounding markup, so it decides what redrawing means. */
/* Whichever surface last painted the list owns the repaint - a rebinding must repaint in
   place, never throw the user into a different screen on a keystroke. */
let scRepaint=null;
function wireShortcutsList(box, repaint, q){
  if(!box) return;
  scRepaint=repaint;
  box.innerHTML=shortcutsListHtml(q||"");
  box.querySelectorAll("[data-bind]").forEach(btn=>{
    if(btn.disabled) return;
    btn.onclick=()=>{
      scBeginCapture(btn.getAttribute("data-bind"), +btn.getAttribute("data-slot")||1);
      repaint();
      toast(scCaptureSlot===2?"Press the alternative (Esc to cancel, Ctrl+Backspace to clear)":"Press the new shortcut (Esc to cancel, Ctrl+Backspace for the default)");
    };
  });
}

/* The one write from outside: a module cannot assign to an imported binding, so every host
   that ends a capture asks for it here. It stops the listening and nothing else - the repaint
   belongs to whoever is painting, and two of the five callers do not repaint. */
function scStopCapture(){ scCaptureId=null; }
/* Whether a list is on screen to capture into: the Settings tab draws it, and leaving the tab removes it. */
function scListShown(){ return typeof document!=="undefined" && !!document.getElementById("scListInline"); }

export {
  SC_GROUPS,
  scCaptureId,
  scCaptureSlot,
  scBeginCapture,
  scRepaint,
  scStopCapture,
  scFold,
  scListShown,
  shortcutsShown,
  shortcutsListHtml,
  wireShortcutsList
};
