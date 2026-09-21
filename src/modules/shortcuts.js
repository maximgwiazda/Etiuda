import { lsGet, lsSet, lsDel } from "./storage.js";
import { t, toast } from "./ui-lang.js";
import { esc } from "./esc.js";
import { $, intentEl } from "./dom.js";
import { hooks } from "./hooks.js";
import { CONTENT_LANGS } from "./content-model.js";

// ---- keyboard shortcuts (defaults + user overrides via the Menu) -------------
const SC_DEFS=[
  /* One toggle, not an Alt+1/Alt+2 pair. inField:1 is the point - language switches
     mid-sentence - so no header field can take a slash; the facts editor keeps its own (see
     wireFactsEditor). Stored overrides for the retired pair drop via loadShortcuts' unknown-id
     check. */
  {id:"langToggle",label:"Toggle language",hint:"Switch the cards between English and Polish",
    def:{code:"Slash",key:"/",ctrl:0,alt:0,shift:0,meta:0},
    def2:{code:"Backquote",key:"`",ctrl:0,alt:0,shift:0,meta:0},inField:1},
  /* Tab and Shift+Tab are the owner's standing rule: this screen does not walk focus, and the
     pair sits where the left hand rests while the right holds the mouse. Dialogs and the tour
     return before the dispatch loop and keep an ordinary Tab; Ctrl+Tab and Alt+Tab never reach
     a page. */
  {id:"tabNext",label:"Next tab",hint:"Switch to the next chat tab, round to the first after the last",
    def:{code:"Tab",key:"Tab",ctrl:0,alt:0,shift:0,meta:0},inField:1},
  {id:"tabNew",label:"New tab",hint:"Open a fresh chat tab",
    def:{code:"Tab",key:"Tab",ctrl:0,alt:0,shift:1,meta:0},inField:1},
  {id:"quickFacts",label:"Quick facts",hint:"Open or close the fees panel",
    def:{code:"KeyQ",key:"q",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  /* F10 is the desktop's own key for a window's menu, and the band's Menu is this window's.
     inField because the caret is in the search box most of the time, and a menu key that stood
     down there would never fire where it is reached for. */
  {id:"openMenu",label:"Open the Menu",hint:"Open or close the Menu, from anywhere on the screen",
    def:{code:"F10",key:"F10",ctrl:0,alt:0,shift:0,meta:0},inField:1},
  {id:"focusPax",label:"Focus {PAX}",hint:"Edit the customer first name",
    def:{code:"KeyP",key:"p",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"focusRole",label:"Focus ROLE",hint:"Edit the comment actor",
    def:{code:"KeyR",key:"r",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"toggleRail",label:"Toggle intent panel",hint:"Show or hide the left intent list",
    def:{code:"KeyI",key:"i",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"togglePills",label:"Toggle category pills",hint:"Show or hide the category bar",
    def:{code:"KeyC",key:"c",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  /* inField, because an editor puts the caret in a text box the moment it opens - a binding
     that stands down inside a field would never fire where these are used. Alt keeps them
     clear of the caret; plain arrows would fight it in every box. */
  {id:"edPrevEntry",label:"Editor: previous",hint:"In an editor: open the one before it",
    def:{code:"ArrowUp",key:"ArrowUp",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"edNextEntry",label:"Editor: next",hint:"In an editor: open the one after it",
    def:{code:"ArrowDown",key:"ArrowDown",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  /* The other axis of the same pair: up and down walk the entries, left and right the
     languages inside one. Alt again, for the reason above, and it is also what frees these
     two from the browser's own Back and Forward. */
  {id:"edPrevLang",label:"Editor: previous language",hint:"In an editor: the language tab before this one",
    def:{code:"ArrowLeft",key:"ArrowLeft",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"edNextLang",label:"Editor: next language",hint:"In an editor: the language tab after this one",
    def:{code:"ArrowRight",key:"ArrowRight",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"newCard",label:"New card",hint:"Open the editor for a new card, in the chosen category",
    def:{code:"KeyN",key:"n",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"clearIntent",label:"Clear intent",hint:"Deselect every chosen intent",
    def:{code:"KeyX",key:"x",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"allCats",label:"All categories",hint:"Clear the category filter",
    def:{code:"KeyA",key:"a",ctrl:0,alt:1,shift:0,meta:0},inField:1},
  {id:"expandPills",label:"Reveal / expand categories",
    hint:"Hold Ctrl (Cmd on Mac): show the pills when hidden, or expand them past two rows",
    def:{code:"ControlLeft",key:"Control",ctrl:1,alt:0,shift:0,meta:0},inField:1,fixed:1,hold:1,
    display:"Hold Ctrl"},
  /* F2: the cleanest unclaimed key at the time the panel was designed. inField on
     purpose - a rescue has to fire from wherever the trouble found you. */
  {id:"maintenance",label:"Maintenance panel",hint:"Readings about this machine, and rescue switches",
    def:{code:"F2",key:"F2",ctrl:0,alt:0,shift:0,meta:0},inField:1},
  /* Ctrl+A reaches the search box without the caret being in it - after a pick the box
     is deliberately blurred, and the natural way to replace a query is Ctrl+A and type.
     inField:0 keeps the ordinary Ctrl+A in dialog fields, the facts editor, and the box. */
  {id:"selectSearch",label:"Select search text",
    hint:"Select everything in the INTENT / MACRO box, without clicking into it first",
    def:{code:"KeyA",key:"a",ctrl:1,alt:0,shift:0,meta:0},inField:0},
  {id:"navUp",label:"Previous card",hint:"Move focus to the previous copyable macro (alt / step / single)",
    def:{code:"ArrowUp",key:"ArrowUp",ctrl:0,alt:0,shift:0,meta:0},inField:0,fixed:1},
  {id:"navDown",label:"Next card",hint:"Move focus to the next copyable macro (alt / step / single)",
    def:{code:"ArrowDown",key:"ArrowDown",ctrl:0,alt:0,shift:0,meta:0},inField:0,fixed:1},
  {id:"markTop",label:"Top of the list",
    hint:"Move the mark to the top of its list, then across to the other one",
    def:{code:"ArrowUp",key:"ArrowUp",ctrl:0,alt:0,shift:1,meta:0},inField:0,fixed:1},
  {id:"markBottom",label:"Bottom of the list",
    hint:"Move the mark to the bottom of its list, then across to the other one",
    def:{code:"ArrowDown",key:"ArrowDown",ctrl:0,alt:0,shift:1,meta:0},inField:0,fixed:1},
  {id:"navPillLeft",label:"Previous category",hint:"Select the previous category pill (All, then the categories)",
    def:{code:"ArrowLeft",key:"ArrowLeft",ctrl:0,alt:0,shift:0,meta:0},inField:0,fixed:1},
  {id:"navPillRight",label:"Next category",hint:"Select the next category pill (All, then the categories)",
    def:{code:"ArrowRight",key:"ArrowRight",ctrl:0,alt:0,shift:0,meta:0},inField:0,fixed:1},
  {id:"navPillFirst",label:"First category",
    hint:"Select the first category, skipping All and any the search has emptied",
    def:{code:"ArrowLeft",key:"ArrowLeft",ctrl:0,alt:0,shift:1,meta:0},inField:0,fixed:1},
  {id:"navPillLast",label:"Last category",
    hint:"Select the last category, skipping any the search has emptied",
    def:{code:"ArrowRight",key:"ArrowRight",ctrl:0,alt:0,shift:1,meta:0},inField:0,fixed:1},
  {id:"copy",label:"Copy focused card",hint:"Copy the focused macro in the active language",
    def:{code:"Enter",key:"Enter",ctrl:0,alt:0,shift:0,meta:0},inField:0,fixed:1},
  {id:"copyOther",label:"Copy other language",hint:"Copy the focused macro in the other language",
    def:{code:"Enter",key:"Enter",ctrl:0,alt:0,shift:1,meta:0},inField:0,fixed:1},
  {id:"escape",label:"Escape / clear",
    hint:"Sheds one thing per press: panels, then search, then intents, then all tabs",
    def:{code:"Escape",key:"Escape",ctrl:0,alt:0,shift:0,meta:0},inField:1,fixed:1}
];
function emptyChord(){ return {code:"",key:"",ctrl:0,alt:0,shift:0,meta:0}; }
function cloneChord(c){ return Object.assign(emptyChord(), c||{}); }
function chordFromEvent(e){
  let key=e.key, code=e.code||"";
  if(key.length===1) key=key.toLowerCase();
  if(key==="Control"||key==="Alt"||key==="Shift"||key==="Meta") return null;
  return {code:code,key:key,ctrl:e.ctrlKey?1:0,alt:e.altKey?1:0,shift:e.shiftKey?1:0,meta:e.metaKey?1:0};
}
function chordsEqual(a,b){
  if(!a||!b) return false;
  if((a.ctrl?1:0)!==(b.ctrl?1:0)) return false;
  if((a.alt?1:0)!==(b.alt?1:0)) return false;
  if((a.shift?1:0)!==(b.shift?1:0)) return false;
  if((a.meta?1:0)!==(b.meta?1:0)) return false;
  if(a.code&&b.code) return a.code===b.code;
  return String(a.key||"").toLowerCase()===String(b.key||"").toLowerCase();
}
function formatChord(c, def){
  if(def&&def.display) return def.display;
  if(!c||(!c.code&&!c.key)) return "-";
  const parts=[];
  if(c.ctrl) parts.push("Ctrl");
  if(c.alt) parts.push("Alt");
  if(c.shift) parts.push("Shift");
  if(c.meta) parts.push("Meta");
  let lab=c.code||c.key||"";
  // Pure modifier holds (Ctrl reveal) - don't append "Control" again
  if(lab==="Control"||lab==="ControlLeft"||lab==="ControlRight"||
     lab==="Meta"||lab==="MetaLeft"||lab==="MetaRight"||
     lab==="Alt"||lab==="AltLeft"||lab==="AltRight"||
     lab==="Shift"||lab==="ShiftLeft"||lab==="ShiftRight"){
    return parts.length?parts.join("+"):lab;
  }
  if(lab.indexOf("Key")===0) lab=lab.slice(3);
  else if(lab.indexOf("Digit")===0) lab=lab.slice(5);
  else if(lab==="Slash") lab="/";
  else if(lab==="Backquote") lab="~";
  else if(lab==="Escape") lab="Esc";
  else if(lab==="ArrowUp") lab="↑";
  else if(lab==="ArrowDown") lab="↓";
  else if(lab==="ArrowLeft") lab="←";
  else if(lab==="ArrowRight") lab="→";
  else if(lab==="Enter") lab="Enter";
  else if(lab===" ") lab="Space";
  else if(lab.length===1) lab=lab.toUpperCase();
  parts.push(lab);
  return parts.join("+");
}
// scReady flips true only after SC_DEFS + loadShortcuts. Do not touch SC_DEFS before that
// (const is in TDZ - even typeof SC_DEFS throws and kills the whole page).
var scReady=false;
/* A CHORD IS ONE CHIP PER KEY, joined by a plus: a cap reading "Alt+N" draws a key no board
   has. The plus is also a key, so an empty part between separators is that key, not a gap. */
function chordChips(id){
  const parts=String(formatActionChord(id)).split("+"), keys=[];
  for(let i=0;i<parts.length;i++){
    if(parts[i]==="" && i+1<parts.length){ keys.push("+"); i++; }
    else keys.push(parts[i]);
  }
  return keys.map(k=>'<kbd>'+esc(k)+'</kbd>').join("+");
}
function formatActionChord(id){
  if(!scReady){
    if(id==="expandPills") return "Hold Ctrl";
    return "-";
  }
  const d=SC_DEFS.find(x=>x.id===id);
  return formatChord(scChord(id), d);
}
var scMap={}; // var: safe if formatActionChord/scChord run before this block finishes loading
/* EVERY REBINDABLE ACTION HAS TWO SLOTS: the binding and an alternative, empty unless a def2
   says otherwise. Stored under the id and the id with "~2", each only when it differs from its
   default, so an alternative the user removed is stored as an empty chord and stays removed. */
var scMap2={};
function loadShortcuts(){
  scMap={}; scMap2={};
  SC_DEFS.forEach(d=>{ scMap[d.id]=cloneChord(d.def); scMap2[d.id]=cloneChord(d.def2||emptyChord()); });
  try{
    const raw=JSON.parse(lsGet("eShortcuts")||"null");
    if(raw&&typeof raw==="object"){
      Object.keys(raw).forEach(k=>{
        const alt=/~2$/.test(k), id=alt?k.slice(0,-2):k;
        if(!scMap[id]) return;
        const def=SC_DEFS.find(d=>d.id===id);
        if(def&&def.fixed) return;
        const c=raw[k];
        if(alt) scMap2[id]=(c&&(c.code||c.key))?cloneChord(c):emptyChord();
        else if(c&&(c.code||c.key)) scMap[id]=cloneChord(c);
      });
    }
  }catch(err){}
  scReady=true;
  syncShortcutTitles();
}
function saveShortcuts(){
  const out={};
  SC_DEFS.forEach(d=>{
    if(d.fixed) return;
    const c=scMap[d.id];
    if(!chordsEqual(c,d.def)) out[d.id]=cloneChord(c);
    const a=scMap2[d.id]||emptyChord();
    if(!chordsEqual(a,d.def2||emptyChord())) out[d.id+"~2"]=cloneChord(a);
  });
  try{
    if(Object.keys(out).length) lsSet("eShortcuts",JSON.stringify(out));
    else lsDel("eShortcuts");
  }catch(err){ toast("Could not save shortcuts"); }
  syncShortcutTitles();
}
function scChord(id){
  if(scMap&&scMap[id]) return scMap[id];
  if(!scReady) return {code:"",key:"",ctrl:0,alt:0,shift:0,meta:0};
  return cloneChord((SC_DEFS.find(d=>d.id===id)||{}).def);
}
function scChord2(id){
  if(scMap2&&scMap2[id]) return scMap2[id];
  if(!scReady) return emptyChord();
  return cloneChord((SC_DEFS.find(d=>d.id===id)||{}).def2||emptyChord());
}
function eventMatchesChord(e,c){
  if(!c||(!c.code&&!c.key)) return false;
  if(!!e.ctrlKey!==!!c.ctrl) return false;
  if(!!e.altKey!==!!c.alt) return false;
  if(!!e.shiftKey!==!!c.shift) return false;
  if(!!e.metaKey!==!!c.meta) return false;
  if(c.code&&e.code) return e.code===c.code;
  const ek=e.key.length===1?e.key.toLowerCase():e.key;
  return ek===c.key||e.key===c.key;
}
function eventMatchesAction(e,id){
  return eventMatchesChord(e,scChord(id)) || eventMatchesChord(e,scChord2(id));
}
/** The key legend About renders - one function, so a rebind reaches every key it names. */
function keysLegendHtml(){
  const f=formatActionChord;
  /* One key per word, not one per line: the chords are data and the words are the sentence.
     A translator sees "toggle search", not "<kbd>/</kbd> toggle search · ".
     data-i18n-skip on every cap: a key NAME is not a word. The chrome sweep found the Tab cap
     and handed back the table's "Tab", which is the word for a chat tab, so the legend told a
     Polish reader to press a bookmark. Names of keys are the same in every language. */
  const w=k=>esc(t(k));
  const K=c=>'<kbd data-i18n-skip>'+c+'</kbd>';
  return K("↑↓")+" "+w("cards")+" · "+
    K("←→")+" "+w("categories")+" · "+
    K("Enter")+" "+w("copy")+" · "+
    K("Shift+Enter")+" "+w("other language")+" · "+
    K(esc(f("langToggle")))+" EN ↔ PL · "+
    K(esc(f("tabNext")))+" "+w("tabs")+" · "+
    K(esc(f("quickFacts")))+" "+w("facts")+" · "+
    K(esc(f("toggleRail")))+" "+w("rail")+" · "+
    K(esc(f("expandPills")))+" "+w("categories")+" · "+
    K("Esc")+" "+w("clear");
}
function tabAddTitle(){
  return t("New tab (same shared settings; cleared PAX, intent, ROLE, categories)")+" ("+formatActionChord("tabNew")+")";
}
function syncShortcutTitles(){
  const enB=$("#seg")&&$("#seg").querySelector('[data-l="en"]');
  const plB=$("#seg")&&$("#seg").querySelector('[data-l="pl"]');
  /* Folded, the visible button is the language you are IN and pressing it leaves for the other
     one, so it must not keep advertising "Show English cards" while showing English. */
  const folded=hooks.segFolded();
  const langKey=formatActionChord("langToggle");
  /* At one declared language the control does not act, so it must not go on advertising a
     toggle: the button is left untitled and the hover finds the box's own title (649). */
  const acts=CONTENT_LANGS.length>1;
  if(enB){
    if(!acts) enB.removeAttribute("title");
    else enB.title=folded
      ? t("Showing English cards; click or press {KEY} for Polish").replace("{KEY}",langKey)
      : t("Show English cards")+" ("+langKey+" "+t("toggles")+")";
  }
  if(plB){
    if(!acts) plB.removeAttribute("title");
    else plB.title=folded
      ? t("Showing Polish cards; click or press {KEY} for English").replace("{KEY}",langKey)
      : t("Show Polish cards")+" ("+langKey+" "+t("toggles")+")";
  }
  const fb=$("#factsBtn");
  if(fb) fb.title=t("Fees, deadlines and limits")+" ("+formatActionChord("quickFacts")+")";
  const ta=$(".tab-add");
  if(ta) ta.title=tabAddTitle();
  if(intentEl) intentEl.title=t("One search: intents rank in the panel, cards filter below");
  const pillsEl=$("#pills");
  /* The live one, so a rebind reaches it; the bar's own behaviour past two rows is the tour's
     to teach. */
  if(pillsEl) pillsEl.title=t("Filter by category; a green ring marks one that relates to the chosen intent, and {KEY} shows every row")
    .replace("{KEY}",formatActionChord("expandPills"));
  /* The placeholder and the label title name the key too, and so does the About reference -
     every <kbd data-sc> in static markup takes the live binding here, so a rebind reaches
     prose that was authored as HTML. */
  hooks.updateIntentPlaceholder();
  document.querySelectorAll("kbd[data-sc]").forEach(k=>{
    k.textContent=formatActionChord(k.getAttribute("data-sc"));
  });
}

export {
  emptyChord,
  cloneChord,
  chordFromEvent,
  chordsEqual,
  formatChord,
  chordChips,
  formatActionChord,
  tabAddTitle,
  loadShortcuts,
  saveShortcuts,
  scChord,
  scChord2,
  eventMatchesAction,
  keysLegendHtml,
  syncShortcutTitles,
  SC_DEFS,
  scReady,
  scMap,
  scMap2
};
