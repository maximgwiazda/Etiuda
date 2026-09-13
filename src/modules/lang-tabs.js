import { CONTENT_LANGS } from "./content-model.js";
import { mgReduceMotion } from "./motion.js";
import { formatActionChord } from "./shortcuts.js";
import { t } from "./ui-lang.js";

/* A LABEL AND AN UNDERLINE, never the segmented control. .seg is what the header uses to SET
   the working language, and the Advanced fold has a pin that sets a card language for good, so
   a filled pill here reads as a third setting. An underline is the one idiom that means "same
   thing, other view". Endonyms, deliberately: a language names itself in every interface.
   SHARED BY EVERY EDITOR that holds more than one language - cards, intents, categories - so a
   new language reaches all three at once and none of them drifts into its own idiom. */
function langTabs(){
  return '<div class="lang-tabs" role="tablist" title="'
    +esc(t("Switch the language being edited")+" · "+formatActionChord("edPrevLang")
         +" / "+formatActionChord("edNextLang"))+'">'
    +'<span class="lang-tabs-lab">'+esc(t("Editing"))+'</span>'
    +CONTENT_LANGS.map((l,i)=>'<button type="button" role="tab" data-i18n-skip data-l="'+esc(l)+'"'
      +(i?"":' class="on"')+'>'+esc(langEndonym(l))+'</button>').join("")
    +'</div>';
}
/* Panes are SIBLINGS of their strip. That is what lets one listener serve every dialog without
   knowing which is open. */
function langPane(l,i,body){
  return '<div class="lang-pane'+(i?"":" on")+'" data-l="'+esc(l)+'">'+body+'</div>';
}
function langFieldId(prefix,field,l){ return prefix+"_"+field+"_"+l; }
/* MARKED UNTIL TOUCHED, and the fold above it marked too - a mark inside a closed fold cannot
   be seen. Idempotent, because the field Save lands on is also one of the fields Save marks,
   and two clear-listeners on one box would leave the class behind. `ev` is what counts as
   touching it: a keystroke for a field, a click for a picker. */
function markMissing(el, ev){
  if(!el || el.classList.contains("is-missing")) return;
  const kind=ev||"input";
  el.classList.add("is-missing");
  const fold=el.closest?el.closest("details.mf-fold"):null;
  if(fold) fold.classList.add("mf-missing");
  const clear=()=>{
    el.classList.remove("is-missing");
    el.removeEventListener(kind,clear);
    if(fold && !fold.querySelector(".is-missing")) fold.classList.remove("mf-missing");
  };
  el.addEventListener(kind,clear);
}
/* ALL OF THEM, NOT THE FIRST: a form with two gaps was two rejected Saves, each teaching one.
   Everything empty is marked; the dialog LANDS on the first, which is the one whose tab or
   fold opens. With one gap the toast still names it - with several, only the marks can. */
function edReportMissing(items){
  if(!items.length) return false;
  items.forEach(it=>it.mark());
  items[0].land();
  toast(items.length===1 ? items[0].msg : "Some required fields are empty");
  return true;
}
/* Naming the tab as well as the box: a validation message about a field nobody can see is a
   dead end. Every caller is a failed Save, which is why it marks as well as lands. */
function langFocus(id,l){
  const el=document.getElementById(id);
  const pane=el&&el.closest?el.closest(".lang-pane"):null;
  const strip=pane&&pane.parentNode?pane.parentNode.querySelector(".lang-tabs"):null;
  const b=strip?strip.querySelector('button[data-l="'+cssEsc(l)+'"]'):null;
  if(b) b.click();
  if(!el) return;
  el.focus();
  markMissing(el);
}
function wireLangTabs(){
  document.addEventListener("click",e=>{
    const b=e.target&&e.target.closest&&e.target.closest(".lang-tabs button[data-l]");
    if(!b) return;
    const strip=b.closest(".lang-tabs"), l=b.getAttribute("data-l");
    const tabs=Array.prototype.slice.call(strip.querySelectorAll("button[data-l]"));
    /* Which way the sweep travels, read BEFORE the class moves. The setting is asked here rather
       than in CSS because mgReduceMotion() covers the Settings switch as well as the system one. */
    const was=tabs.findIndex(x=>x.classList.contains("on")), now=tabs.indexOf(b);
    const still=mgReduceMotion();
    const dir=(still||was<0||now===was) ? "" : (now>was ? "lang-in-next" : "lang-in-prev");
    tabs.forEach(x=>x.classList.toggle("on",x===b));
    const scope=strip.parentNode;
    if(scope) scope.querySelectorAll(".lang-pane[data-l]").forEach(p=>{
      if(p.parentNode!==scope) return;
      const on=p.dataset.l===l;
      /* Cleared before the display change, so the next swap in the same direction restarts the
         animation rather than finding the class already there and doing nothing. */
      p.classList.remove("lang-in-next","lang-in-prev");
      p.classList.toggle("on",on);
      if(on && dir) p.classList.add(dir);
    });
  },true);
}
const LANG_ENDONYM={en:"English",pl:"Polski",uk:"\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430"};
function langEndonym(l){ return LANG_ENDONYM[l]||String(l||"").toUpperCase(); }

export {
  langTabs,
  langPane,
  langFieldId,
  markMissing,
  edReportMissing,
  langFocus,
  wireLangTabs,
  langEndonym
};
