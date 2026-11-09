import { colMode, colFloor, remPx, COL_FLOOR_MIN, COL_FLOOR_MAX, COL_FLOOR_STEP } from "./columns.js";
import { loadShortcuts, formatActionChord } from "./shortcuts.js";
import { scStopCapture, wireShortcutsList, shortcutsShown, scFold } from "./shortcuts-list.js";
import { lsGet, lsSet, lsDel, nsGet, nsSet, nsDel, nsKey } from "./storage.js";
import { drawPills, drawTabs } from "./tabs.js";
import { UI_LANGS, uiLang, offerUndo, t, toast, fileStamp, counted, translateTree } from "./ui-lang.js";
import { setUiLang } from "./repaint.js";
import { applyDefaultRailWidth, applyStoredRailWidth, railLocked, rebuildRailMQ, syncRailLayout, toggleRailLock } from "./rail-panel.js";
import { esc } from "./esc.js";
import { themeChoice, applyTheme } from "./theme.js";
import { syncStill } from "./motion.js";
import { render } from "./render.js";
import { closeNotePane } from "./note-pane.js";
import { deckOn, syncDeck } from "./deck.js";
import { applyUiLang } from "./repaint.js";
import { pillsLocked, togglePillsLock, syncLayoutPrefs } from "./pills-box.js";
import { rereadCollapsed } from "./collapse.js";
import { applyStoredFactsSize } from "./facts.js";
import { agentName, setAgentName } from "./agent.js";
import { eHost, eHasShared, E_AI_OFF_KEY, eAiOn, eAiModel, eTellAi } from "./host.js";
import { hooks } from "./hooks.js";
import { lapseNote, teamLeads, keySignHtml, forgetTeamLead, pickMovedFolder, joinDoorButton, openJoinPaste } from "./team-join.js";
import { pack } from "./pack.js";
import { openScreenTab, registerScreen, screenOn, clearScreenOn } from "./screen-tabs.js";
import { clearLocalMemory } from "./local-memory.js";
import { openAbout } from "./about.js";
import { openMaintenance } from "./maintenance.js";
import { E_VERSION } from "./env.js";

/* THE SETTINGS SCREEN, a screen tab: the section list beside one section's page. One test decides what
   belongs: would you set it once and forget it? Anything touched weekly is a Menu item or a header control.
   THE LOCKS LIVE HERE, hide/show does not: a lock is a standing preference, "hide it now" stays in the Menu.
   A section is listed only while it holds a row, so no page is ever empty. */
/* THE HOTKEY THAT BRINGS THE REPLIES OVER ANY WINDOW, where the host has one. The shell holds it,
   so the row asks the shell what is held, and a new combination is tried there before the desk
   stores it: absent is the shell's default, empty is off. */
const E_HOTKEY_KEY="eHotkey";
let hkListening=false;
function hotkeyHost(){
  const h=eHost();
  return (h && typeof h.hotkeyState==="function" && typeof h.setHotkey==="function") ? h : null;
}
function hotkeyState(){
  const h=hotkeyHost();
  let st=null;
  try{ st=h && h.hotkeyState(); }catch(e){ st=null; }
  return {accel:String(st&&st.accel||""), taken:!!(st&&st.taken), def:String(st&&st.def||"")};
}
function hotkeyLabel(accel){ return accel ? String(accel).split("+").map(k=>k==="Control"?"Ctrl":k).join("+") : t("none"); }
/* The combination a keydown names, in the host's own spelling, or null for a modifier alone or a key
   the host does not take. The Windows key is named so that the host can refuse it by name. */
function hotkeyFromEvent(e){
  const c=String(e.code||"");
  const key=/^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit[0-9]$/.test(c) ? c.slice(5)
    : /^F([1-9]|1[0-9]|2[0-4])$/.test(c) ? c : c==="Space" ? "Space" : "";
  if(!key) return null;
  return [e.metaKey&&"Super", e.ctrlKey&&"Control", e.altKey&&"Alt", e.shiftKey&&"Shift", key].filter(Boolean).join("+");
}
function hotkeyWhy(why,accel){
  const k=hotkeyLabel(accel);
  const says=why==="taken" ? t("{KEYS} already belongs to another program; a different combination will do.")
    : why==="used" ? t("Browsers and chat tools already answer most combinations like {KEYS}; Ctrl+Shift with Space or a function key stays free.")
    : why==="altgr" ? t("{KEYS} types accented letters on many keyboards; Ctrl+Shift with Space or a function key stays free.")
    : why==="bare" ? t("{KEYS} alone would stop that key typing; with Ctrl or Alt it will do.")
    : why==="system" ? t("Windows keeps {KEYS} for itself; Ctrl+Shift with Space or a function key stays free.")
    : t("Etiuda takes a letter, a digit, Space or a function key, with Ctrl, Alt or Shift.");
  return says.split("{KEYS}").join(k);
}
function suggestCountLine(){
  return t("Suggestions taken: {N}").split("{N}").join(String(pack.suggestTaken|0))
    +"  "+t("Openings with suggestions: {N}").split("{N}").join(String(pack.suggestOpen|0));
}
function hotkeyRowHtml(){
  if(!hotkeyHost()) return "";
  const st=hotkeyState();
  return '<div class="sc-list"><div class="sc-row" id="setHotkeyRow"><div class="sc-label">'
    +esc(t("Bring the replies over any window"))
    +'<small id="setHotkeyNote">'+esc(st.taken
      ? t("Another program uses this combination just now; a different one will do.")
      : t("Works from any program; Enter copies a reply and goes back to the window you were in."))+'</small>'
    +'<small id="setSuggestNote">'+esc(t("When the picker opens with a customer's message copied, and the message points clearly enough at some intents, up to five of them are suggested above the list. None is chosen until one is clicked. The message is read only as the picker opens, and never kept or sent; the statistics count only how often suggestions appeared and how many were taken."))+'</small>'
    +'<small id="setSuggestCounts">'+esc(suggestCountLine())+'</small>'
    +'</div><div class="sc-binds"><button type="button" class="sc-bind sc-long'+(st.accel?"":" sc-empty")+'" id="setHotkey"'
    +' style="flex-basis:100%" title="'+esc(t("Click, then press the new key combo"))+'">'
    +esc(hotkeyLabel(st.accel))+'</button></div></div></div>';
}
/* `now` is a combination just held, which the desk may not have finished storing yet. */
function syncHotkeyRow(box,now){
  if(!box) return;
  const b=box.querySelector("#setHotkey"), note=box.querySelector("#setHotkeyNote");
  if(!b) return;
  const st=typeof now==="string" ? {accel:now, taken:false} : hotkeyState();
  b.classList.toggle("listening",hkListening);
  b.classList.toggle("sc-empty",!hkListening && !st.accel);
  b.textContent=hkListening ? t("Press keys…") : hotkeyLabel(st.accel);
  if(note) note.textContent=st.taken
    ? t("Another program uses this combination just now; a different one will do.")
    : t("Works from any program; Enter copies a reply and goes back to the window you were in.");
  const help=box.querySelector("#setSuggestNote"), counts=box.querySelector("#setSuggestCounts");
  if(help) help.textContent=t("When the picker opens with a customer's message copied, and the message points clearly enough at some intents, up to five of them are suggested above the list. None is chosen until one is clicked. The message is read only as the picker opens, and never kept or sent; the statistics count only how often suggestions appeared and how many were taken.");
  if(counts) counts.textContent=suggestCountLine();
}
function hotkeyListen(box,on,now){
  hkListening=!!on;
  const h=hotkeyHost();
  try{ if(h && typeof h.pauseHotkey==="function") h.pauseHotkey(hkListening); }catch(e){}
  syncHotkeyRow(box,now);
}
/* Tried in the host first, stored only once it is held: `accel` absent is the default, "" is off. */
function hotkeyTry(box,accel,said){
  const h=hotkeyHost();
  const want=accel==null ? hotkeyState().def : accel;
  if(want==="Control+Shift+M" || accel==="Control+Shift+M"){
    toast(hotkeyWhy("used",want));
    hotkeyListen(box,false);
    return;
  }
  Promise.resolve(h.setHotkey(want)).then(r=>{
    if(!(r && r.ok)){ toast(hotkeyWhy(r&&r.why,want)); return undefined; }
    if(accel==null) lsDel(E_HOTKEY_KEY); else lsSet(E_HOTKEY_KEY,accel,true);
    toast(said);
    return want;
  }).catch(()=>undefined).then(now=>hotkeyListen(box,false,now));
}
function wireHotkeyRow(box){
  const b=box.querySelector("#setHotkey");
  if(!b || !hotkeyHost()) return;
  b.onclick=()=>{
    hotkeyListen(box,true);
    toast(t("Press the new combination (Esc to cancel, Backspace for the default, Delete for none)"));
  };
  b.onblur=()=>{ if(hkListening) hotkeyListen(box,false); };
  /* The row's own keys, stopped here so the dialog's Escape and every shortcut stay out of it. */
  b.addEventListener("keydown",e=>{
    if(!hkListening) return;
    e.preventDefault(); e.stopPropagation();
    if(e.key==="Escape"){ hotkeyListen(box,false); return; }
    if(e.key==="Backspace"){ hotkeyTry(box,null,t("Back to the default")); return; }
    if(e.key==="Delete"){ hotkeyTry(box,"",t("The hotkey is off")); return; }
    const accel=hotkeyFromEvent(e);
    if(!accel) return;
    hotkeyTry(box,accel,t("Saved {KEY}").replace("{KEY}",hotkeyLabel(accel)));
  });
}
/* How old the team's news is, in the words the rest of the page already uses for a short age, and as a date once it is
   old enough that a stopped relay should be visible. */
function headAgeWords(at){
  const min=Math.floor(Math.max(0, Date.now()-at)/60000);
  if(min<1) return t("just now");
  if(min<60) return t("{N} min ago").split("{N}").join(String(min));
  return fileStamp(at);
}
function teamHeadNote(h){
  const said=t("Newest edition {E}, published {WHEN}. The team's news: {AGE}.")
    .split("{E}").join(h.edition).split("{WHEN}").join(h.published).split("{AGE}").join(headAgeWords(h.t));
  let others=(h.editions||[]).filter(e=>e.catalog!==h.catalog);
  others=others.filter(e=>e.newer); /* plant:head-newer */
  if(!others.length) return said;
  /* The copywriter's words: one other in a sentence of its own, more after a colon, so Polish needs no plural forms. */
  return said+" "+(others.length===1?t("Another catalog of the team has a newer edition."):t("Other catalogs of the team with a newer edition: {N}.").split("{N}").join(String(others.length)));
}
/* A team as Settings shows it: the lead's name and the folder, the key the agent compared, and Leave this team.
   Machine policy would undo a leave, so the button is not offered where it names the lead. `bar` says the way
   back, before the press. The button wears danger, the same class as Delete: the leave destroys the pin, the
   sealed keys and bars the team once its Undo has lapsed. The head, where the shell has one, is a note under the
   name: the newest edition, when it was published, how old the news is, and how many of the team's other catalogs
   have an edition newer than this desk has loaded. It never disables a control. */
function teamRowHtml(l,status,bar){
  const notes=[l.relay?t("Relay: {HOST}").split("{HOST}").join(l.relay):l.folder?t("Folder: {FOLDER}").split("{FOLDER}").join(l.folder):"",
    l.removed?t("This team no longer includes this desk."):status,
    l.policy?t("The organisation's IT sets this desk's team."):bar?t("After leaving a team, this desk can join it again with a new invitation from its lead."):""];
  if(l.head) notes.push(teamHeadNote(l.head)); /* plant:head-show */
  if(l.lapse) notes.push(lapseNote(l.lapse)); /* plant:lapse-row */
  if(l.needsFolder) notes.push(t("This team now works from a shared folder. The team's lead can say which one; once it is open here with Open a folder, everything carries on as before."));
  if(l.reading) notes.push(l.reading);
  return '<div class="set-row"><div class="set-label">'+esc(l.lead?t("{LEAD}'s team").split("{LEAD}").join(l.lead):t("Team"))
    +notes.filter(Boolean).map(n=>'<small>'+esc(n)+'</small>').join("")+'</div><div class="set-ctl">'
    +'<span class="e-lead-key">'+keySignHtml("studio",l.print)+'</span>'
    +(l.needsFolder?'<button type="button" class="btn" data-team-pick-folder="'+esc(l.team)+'">'+esc(t("Open a folder"))+'</button>':'') /* plant:needs-folder-button */
    +(l.policy?'':'<button type="button" class="btn danger" data-leave-team="'+esc(l.team)+'">'+esc(t("Leave this team"))+'</button>')
    +'</div></div>';
}
/* Leave this team is one click, the person's own. The pin, the sealed keys and the bar stay until the
   offer lapses; Undo leaves the desk as it still is. The shell's leave, the one it is today, runs when
   the offer ends without Undo, and the screen is drawn again where it is open. A second click while the
   offer stands does not start another: the offer already on screen is the way back. */
let leaveHold="";
function leaveThisTeam(team){
  team=String(team||"");
  if(!team || leaveHold) return;
  leaveHold=team;
  const drop=()=>{ if(leaveHold===team) leaveHold=""; };
  const repaint=()=>{ if(document.getElementById("setBody")) paintSettings(); };
  offerUndo("This desk will leave this team.", ()=>{ drop(); repaint(); }, ()=>{
    if(leaveHold!==team) return;
    leaveHold="";
    forgetTeamLead(team, repaint);
  });
}
function wireTeamRows(box){
  box.querySelectorAll("[data-leave-team]").forEach(b=>{
    b.onclick=()=>leaveThisTeam(b.getAttribute("data-leave-team"));
  });
  box.querySelectorAll("[data-team-pick-folder]").forEach(b=>{
    b.onclick=()=>pickMovedFolder(b.getAttribute("data-team-pick-folder"),()=>{ if(document.getElementById("setBody")) paintSettings(); }); /* plant:needs-folder-press */
  });
}
/* The section list's and the rows' glyphs, drawn in currentColor on a 24 grid with a 1.75 stroke. */
const SX_ICONS={
  "general":'<path d="M11.16 6.4L11.37 4.08L13.63 4.08L13.84 6.4L15.87 7.24L17.65 5.74L19.26 7.35L17.76 9.13L18.6 11.16L20.92 11.37L20.92 13.63L18.6 13.84L17.76 15.87L19.26 17.65L17.65 19.26L15.87 17.76L13.84 18.6L13.63 20.92L11.37 20.92L11.16 18.6L9.13 17.76L7.35 19.26L5.74 17.65L7.24 15.87L6.4 13.84L4.08 13.63L4.08 11.37L6.4 11.16L7.24 9.13L5.74 7.35L7.35 5.74L9.13 7.24z"/><circle cx="12.5" cy="12.5" r="2.75"/>',
  "appearance":'<path d="M12.5 4.5a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/><circle cx="12.5" cy="12.5" r="8"/>',
  "layout":'<rect x="3.5" y="4.5" width="7.5" height="6.5" rx="1.6" fill="currentColor" fill-opacity=".35"/><rect x="13" y="4.5" width="7.5" height="6.5" rx="1.6"/><rect x="3.5" y="13" width="7.5" height="6.5" rx="1.6"/><rect x="13" y="13" width="7.5" height="6.5" rx="1.6"/>',
  "keys":'<rect x="4.5" y="6.5" width="16" height="12" rx="2"/><path d="M8.5 10.5h.01M12.5 10.5h.01M16.5 10.5h.01M8.5 14.5h8"/>',
  "notifications":'<rect x="4.5" y="6.5" width="16" height="12" rx="2"/><path d="M4.5 8.5l8 5.5 8-5.5"/>',
  "teams":'<path d="M4.5 12.5a8 8 0 0 1 8-8c2.6 0 5 1 6.8 2.8L20.5 9M20.5 4.5v4.5h-4.5M20.5 12.5a8 8 0 0 1-8 8c-2.6 0-5-1-6.8-2.8L4.5 16M4.5 20.5v-4.5h4.5"/>',
  "data":'<path d="M4.5 12.5a8 8 0 1 0 8-8c-2.4 0-4.6 1-6.2 2.7L4.5 9M4.5 4.5v4.5h4.5"/><circle cx="10.34" cy="14.66" r="2.6"/><path d="M12.18 12.82L16.5 8.5M15.43 9.57l1.84 1.84M14.09 10.91l1.84 1.84"/>',
  "about":'<circle cx="12.5" cy="12.5" r="8"/><path d="M12.5 11.5v5M12.5 8.5h.01"/>',
  "search":'<circle cx="11" cy="11" r="6.5"/><path d="M15.6 15.6L20.5 20.5"/>',
  "user":'<circle cx="12.5" cy="8.5" r="3.5"/><path d="M5.5 20.5v-1.5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1.5"/>',
  "translate":'<path d="M4.5 19.5l4-10 4 10M6 15.5h5M14.5 8.5h6M18.5 6.5l2 2-2 2M20.5 15.5h-6M16.5 13.5l-2 2 2 2"/>',
  "expand":'<path d="M14.5 4.5h6v6M20.5 4.5l-6 6M10.5 20.5h-6v-6M4.5 20.5l6-6"/>',
  "refresh":'<path d="M20.5 12.5a8 8 0 1 1-2.3-5.7L20.5 9M20.5 4.5v4.5h-4.5"/>',
  "intents":'<path d="M4.5 10.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-5l-3 3v-3a2 2 0 0 1-2-2zM9.5 8.5v-2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  "categories":'<path d="M4.5 18.5h16M6.5 18.5v-7a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v7M13.5 18.5v-11a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v11"/>',
  "note":'<path d="M4.5 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8l-6 6h-8a2 2 0 0 1-2-2zM20.5 14.5h-4a2 2 0 0 0-2 2v4"/>',
  "cards":'<rect x="4.5" y="9.5" width="14" height="11" rx="2"/><path d="M7.5 6.5h11a2 2 0 0 1 2 2v9"/>',
  "desks":'<rect x="4.5" y="8.5" width="12" height="8" rx="2"/><path d="M10.5 16.5v4M7.5 20.5h6M8.5 8.5v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/>',
  "delete":'<path d="M4.5 7.5h16M9.5 7.5v-1.5a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v1.5M6.5 7.5l.8 11.3a2 2 0 0 0 2 1.7h6.4a2 2 0 0 0 2-1.7l.8-11.3M10.5 11.5v5M14.5 11.5v5"/>',
  "forward":'<path d="M4.5 12.5h16M14.5 6.5l6 6-6 6"/>',
  "statistics":'<path d="M4.5 4.5v16h16M9.5 16.5v-4M13.5 16.5v-8M17.5 16.5v-6"/>',
  "ai":'<path d="M11.5 4.5l1.6 4.9 4.9 1.6-4.9 1.6-1.6 4.9-1.6-4.9-4.9-1.6 4.9-1.6zM17.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>'
};
function sxIcon(name){
  const body=SX_ICONS[name];
  return body ? '<svg class="sx-ic" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    +' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>' : '<span class="sx-ic"></span>';
}
/* The row hint says what the setting IS; the option tip says what THIS choice DOES, which is the half a
   two-word button cannot carry. */
function seg(name,opts,cur){
  return '<div class="seg set-seg" data-seg="'+name+'" data-n="'+opts.length+'">'+
    opts.map(o=>'<button type="button" data-val="'+esc(o.v)+'"'+
      (o.tip?' title="'+esc(o.tip)+'"':'')+(o.v===cur?' class="on"':'')+'>'+esc(o.t)+'</button>').join("")+
    '</div>';
}
function onoff(name,on,tipOn,tipOff){
  return seg(name,[{v:"off",t:t("Off"),tip:tipOff},{v:"on",t:t("On"),tip:tipOn}],on?"on":"off");
}
/* A row is {key, icon, title, hint, ctl}, or {key, html} where its markup is drawn elsewhere; the search
   reads a row's title and hint, or the words of its markup. */
function row(key,icon,title,hint,ctl){ return {key, icon, title, hint:hint||"", ctl}; }
function rowHtml(r){
  if(r.html!=null) return r.html;
  return '<div class="set-row" data-row="'+esc(r.key)+'">'+sxIcon(r.icon)+'<div class="set-label">'+esc(r.title)
    +(r.hint?'<small>'+esc(r.hint)+'</small>':'')+'</div><div class="set-ctl">'+r.ctl+'</div></div>';
}
function rowWords(r){
  if(r.html!=null) return String(r.html).replace(/<[^>]*>/g," ").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,"&");
  return r.title+" "+r.hint;
}
function keysHtml(chord){
  return '<span class="sx-keys">'+String(chord||"").split("+").filter(Boolean).map(k=>'<kbd>'+esc(k)+'</kbd>').join("")+'</span>';
}

/* The starting and closing rows exist only where the shell can apply them. A browser, and a host
   stub that only knows the hotkey, keeps General as the name and the language. */
function closeHost(){
  const h=eHost();
  return (h && typeof h.setClosePolicy==="function" && typeof h.setLoginItem==="function" && typeof h.loginItemState==="function") ? h : null;
}
function generalGroups(){
  const langSel='<select id="setUiLang" aria-label="'+esc(t("Interface language"))+'"'+
    ' title="'+esc(t("Changes every label in Etiuda, never the cards themselves"))+'">'+
    UI_LANGS.map(l=>'<option value="'+esc(l.code)+'"'+(l.code===uiLang()?" selected":"")+'>'+esc(l.label)+'</option>').join("")+
    '</select>';
  /* NO LINE UNDER THE NAME: the placeholder names the field and the cards show what the name does. */
  const groups=[{rows:[
    row("name","user",t("Your name"),"",'<input type="text" id="setAgentName" autocomplete="off" spellcheck="false"'
      +' placeholder="'+esc(t("first name"))+'" value="'+esc(agentName())+'">'),
    row("uilang","translate",t("Interface language"),
      t("The language of the buttons and menus, not of the replies: those follow EN|PL in the header"),langSel)
  ]}];
  const host=closeHost();
  if(host){
    let startOn=false;
    try{ const s=host.loginItemState(); startOn=!!(s && s.openAtLogin); }catch(e){ startOn=false; }
    const quit=lsGet("eQuitOnClose")==="1";
    groups.push({head:t("Starting and closing"), rows:[
      row("startwin","forward",t("Start with Windows"),
        t("Etiuda starts in the tray when this Windows account signs in."),
        onoff("startwin", startOn, "", "")),
      row("closehow","desks",t("When the window closes"),
        t("In the tray, Etiuda still answers its shortcut and shows notifications."),
        seg("closehow",[{v:"stay",t:t("Stay in the tray")},{v:"quit",t:t("Quit")}], quit?"quit":"stay"))
    ]});
  }
  return groups;
}
function appearanceGroups(){
  return [{rows:[
    row("theme","appearance",t("Theme"),t("System follows your computer's own setting."),
      seg("theme",[{v:"light",t:t("Light"),tip:t("Always the light palette, whatever the computer asks for")},
                   {v:"dark",t:t("Dark"),tip:t("Always the dark palette, whatever the computer asks for")},
                   {v:"system",t:t("System"),tip:t("Follows your computer's light or dark setting, and changes with it")}],
        themeChoice() || "system")),
    row("glass","expand",t("Blur effects"),
      t("Blurred panel backgrounds and the blur behind dialogs. Turn off if text reads less clearly, or the machine struggles."),
      onoff("glass", !document.body.classList.contains("glass-off"),
        t("Panels and the dialog backdrop stay blurred"),
        t("Panels go flat and opaque, and a dialog only darkens what is behind it"))),
    /* Reads as what it GIVES; the stored key still reads as what it takes away, so an existing choice survives. */
    row("motion","refresh",t("Animations"),
      t("Transitions, slides, and the cards re-sorting themselves. Switches itself off when your system asks for reduced motion."),
      onoff("motion", lsGet("eMotionOff")!=="1",
        t("Everything moves as it was drawn to"),
        t("Nothing moves; every change lands at once")))
  ]}];
}
function layoutGroups(){
  return [
    {head:t("Columns"), rows:[
      row("cols","layout",t("Columns"),t("How many columns of cards to show. Auto fits as many as the window has room for."),
        seg("cols",[{v:"1",t:t("1"),tip:t("Always a single column")},
                    {v:"2",t:t("2"),tip:t("Always two columns, however wide the window is")},
                    {v:"auto",t:t("Auto"),tip:t("As many as fit without making a column too narrow to read")}], colMode())),
      row("colfloor","expand",t("Narrowest column"),
        t("How narrow a column may get before Auto drops one. Wider means fewer, roomier columns."),
        '<div class="set-slider"><input type="range" id="setColFloor" min="'+COL_FLOOR_MIN+
          '" max="'+COL_FLOOR_MAX+'" step="'+COL_FLOOR_STEP+'" value="'+colFloor()+
          '" aria-label="'+esc(t("Narrowest column"))+'">'+
          '<output id="setColFloorOut">'+Math.round(colFloor()*remPx())+'px</output></div>')
    ]},
    {head:t("What stays docked"), rows:[
      row("raillock","intents",t("Lock the intent panel"),
        t("Keep it docked even when the window is narrow, instead of letting it hide itself."),
        onoff("raillock", railLocked(),
          t("The panel stays docked at any window width"),
          t("The panel hides itself when the window gets narrow"))),
      row("pillslock","categories",t("Lock the category bar"),
        t("Keep every category row visible, instead of collapsing to two lines."),
        onoff("pillslock", pillsLocked(),
          t("Every category row stays visible"),
          t("The bar keeps two rows, and Ctrl peeks at the others")))
    ]},
    {head:t("Cards"), rows:[
      row("notehover","note",t("Notes on hover"),
        t("Open a card's internal note when the pointer rests on the card."),
        onoff("notehover", document.body.classList.contains("note-hover"),
          t("The note opens by itself, and the card shows no i"),
          t("The i on the card opens the note"))),
      row("deck","cards",t("Stack a card's replies"),
        t("A card holding several replies shows the first, with the others behind it until the pointer rests on the card or the arrow keys reach it."),
        onoff("deck", deckOn(),
          t("The first reply in front, the others laid out under the pointer"),
          t("Every reply laid out on the card, one below the other")))
    ]}
  ];
}
function keysGroups(){
  const hk=hotkeyRowHtml();
  return [
    hk ? {rows:[{key:"hotkey", html:hk}]} : null,
    {rows:[{key:"shortcuts", html:'<div class="sc-list" id="scListInline"></div>'}]},
    {after:'<div class="sx-note"><span>'+esc(t("A shortcut can be changed to an F key or a combination with Ctrl or Alt, since keys needed for typing stay with typing; the keys Etiuda itself needs are shown as fixed."))+'</span>'
      +'<button type="button" class="btn" id="setResetKeys">'+esc(t("Reset shortcuts"))+'</button></div>', rows:[]}
  ].filter(Boolean);
}
function teamsGroups(){
  const joinDoor=joinDoorButton("setJoinTeam");
  /* One row per team this desk trusts a lead for; what the lead sees is said once, on the first team that still lists it,
     and the way back after leaving once, on the first row that offers Leave. */
  const rows=teamLeads().map((l,i,all)=>({key:"team", html:teamRowHtml(l, i===all.findIndex(x=>!x.removed)?t("The team's lead can see which catalog this desk uses, by name and edition. The lead's Studio can take a copy of a catalog the team lists at any time, without asking here, sealed for the team. Any other catalog stays on this desk, since copies of unlisted catalogs are off. A catalog the team does not list can be marked private here, and is then never sent. The desk's use counts only in the team's totals, never on its own."):"", i===all.findIndex(x=>!x.policy))}));
  if(joinDoor) rows.push({key:"join", html:'<div class="set-row" data-row="join">'+sxIcon("desks")+'<div class="set-label">'+esc(t("Team"))+'</div><div class="set-ctl">'+joinDoor+'</div></div>'});
  /* Under a host only: a browser has no catalog folder to share. */
  if(eHasShared()) rows.push(row("sharededit","teams",t("Edit the shared catalog directly"),
    t("For a team that keeps its catalog without Studio: each change is written into the catalog in the shared folder. A catalog the team's lead signed is never touched."),
    onoff("sharededit", lsGet("eSharedEdit")==="1",
      t("Each change goes into the shared catalog; where a teammate changed the same text first, theirs stays and yours waits in this desk's own file"),
      t("Each change stays in this desk's own file"))));
  return rows.length ? [{rows}] : [];
}
/* Drawn only where the desk carries the model: off, the picker suggests by words alone and the model is never loaded. */
function aiGroups(){
  if(!eAiModel()) return [];
  return [{rows:[
    // placeholder: Claudette
    row("aisuggest","ai",t("Suggest intents with the built-in model"),
      // placeholder: Claudette
      t("Reads a copied message on this computer and suggests the intents it is closest to. Off, suggestions come from matching words."),
      onoff("aisuggest", eAiOn(),
        // placeholder: Claudette
        t("The model ranks the suggestions; nothing leaves this computer"),
        // placeholder: Claudette
        t("Suggestions come from matching words, and the model stays unloaded")))
  ]}];
}
function dataGroups(){
  return [{rows:[
    row("reset","refresh",t("Reset defaults"),t("Puts every setting back as it ships. Cards and your edits are not touched."),
      '<button type="button" class="btn" id="setReset">'+esc(t("Reset defaults"))+'</button>'),
    row("clear","delete",t("Clear local memory"),
      t("Forgets the settings and open conversations kept on this computer. The catalog, your name and your own changes to cards stay, and Undo brings the rest back."),
      '<button type="button" class="btn danger" id="setClear">'+esc(t("Clear local memory"))+'</button>')
  ]}];
}
function aboutGroups(){
  return [{rows:[
    row("about","about","Etiuda",E_VERSION,
      '<button type="button" class="btn" id="setAbout" title="'+esc(t("This version of Etiuda, what is new in it, and its licence"))+'">'+esc(t("About Etiuda"))+'</button>'),
    row("tour","forward",t("Show tour…"),t("The tour of Etiuda's controls, one at a time"),
      '<button type="button" class="btn" id="setTour">'+esc(t("Show tour…"))+'</button>'),
    row("maintenance","statistics",t("Maintenance"),t("What this computer reports, and ways to set things right."),
      '<button type="button" class="btn" id="setMaint">'+esc(t("Open"))+'</button>'+keysHtml(formatActionChord("maintenance")))
  ]}];
}
function notificationsGroups(){
  const h=eHost();
  let masterOn=true;
  if(h && typeof h.trayNotesState==="function"){
    try{ const s=h.trayNotesState(); masterOn=!(s && s.on===false); }catch(e){}
  }
  return [
    {rows:[
      row("notesmaster","notifications",t("Notifications"),
        t("Notifications from Etiuda, also while its window is closed."),
        onoff("notesmaster", masterOn, "", ""))
    ]},
    {head:t("Tell me when"), rows:[
      row("noteedition","cards",t("The team's lead publishes a new edition"),"",
        onoff("noteedition", lsGet("eNotifyEditionOff")!=="1", "", "")),
      row("notecatalog","desks",t("A new catalog arrives from the team"),"",
        onoff("notecatalog", lsGet("eNotifyCatalogOff")!=="1", "", ""))
    ]}
  ];
}
/* Every section in its order, each with the groups it holds now; a section without a row is left out. */
function settingsSections(){
  return [
    {id:"general", icon:"general", name:t("General"), lede:t("Your name, the language, and how Etiuda starts and closes."), groups:generalGroups()},
    {id:"appearance", icon:"appearance", name:t("Appearance"), lede:t("How the app looks and moves."), groups:appearanceGroups()},
    {id:"layout", icon:"layout", name:t("Layout"), lede:t("How the screen is laid out."), groups:layoutGroups()},
    {id:"keys", icon:"keys", name:t("Keyboard shortcuts"), lede:t("Every shortcut, and how to change it."), groups:keysGroups()},
    {id:"notifications", icon:"notifications", name:t("Notifications"), lede:t("What the app tells you, also while its window is closed."), groups:notificationsGroups()},
    {id:"teams", icon:"teams", name:t("Teams and keys"), lede:t("The team this desk is on, and how its changes reach the team."), groups:teamsGroups()},
    {id:"data", icon:"data", name:t("Data and defaults"), lede:t("Putting settings back, and what the app keeps on this computer."), groups:dataGroups()},
    {id:"about", icon:"about", name:t("About"), lede:t("The version, the licence and the tour."), groups:aboutGroups()},
    // placeholder: Claudette (the lede; "AI" is hers)
    {id:"ai", icon:"ai", name:t("AI"), lede:t("The model built into Etiuda, which works on this computer alone."), groups:aiGroups()}
  ].filter(s=>s.groups.some(g=>g.rows.length));
}
function groupHtml(g){
  return '<div class="sx-group">'+(g.head?'<h3>'+esc(g.head)+'</h3>':'')
    +(g.rows.length?'<div class="sx-card">'+g.rows.map(rowHtml).join("")+'</div>':'')+(g.after||"")+'</div>';
}
/* Every row of every section, the whole screen's controls in one reading. */
function settingsBodyHtml(){
  return settingsSections().map(s=>s.groups.map(groupHtml).join("")).join("");
}

/* What the screen shows: a section, or what a search found. Kept while the tab is closed, so opening it again
   with no section named comes back where it was. */
let sxOn="general", sxQuery="";
const SX_ALIAS={personal:"general"};
/* The rows whose title or hint holds the search, section by section, and the shortcuts whose name or hint does. */
function settingsFound(query){
  const q=scFold(query).trim();
  if(!q) return [];
  return settingsSections().map(s=>({sec:s, rows:[].concat(...s.groups.map(g=>g.rows))
    .filter(r=>r.key==="shortcuts" ? shortcutsShown(q)>0 : scFold(rowWords(r)).indexOf(q)>=0)}))
    .filter(x=>x.rows.length);
}
function settingsNavHtml(on){
  return settingsSections().map(s=>'<button type="button" class="sx-sec'+(s.id===on?" on":"")+'" data-sx="'+esc(s.id)+'"'
    +(s.id===on?' aria-current="page"':'')+'>'+sxIcon(s.icon)+'<span>'+esc(s.name)+'</span></button>').join("");
}
function settingsPageHtml(on,query){
  const q=String(query||"").trim();
  if(q){
    const found=settingsFound(q);
    return '<div class="sx-crumb">'+esc(t("Settings"))+'</div>'
      +(found.length ? found.map(f=>'<div class="sx-group"><h3>'+esc(f.sec.name)+'</h3><div class="sx-card">'
          +f.rows.map(rowHtml).join("")+'</div></div>').join("")
        : '<p class="sx-none">'+esc(t("No setting matches this search."))+'</p>');
  }
  const secs=settingsSections(), s=secs.find(x=>x.id===on)||secs[0];
  return '<div class="sx-crumb">'+esc(t("Settings"))+'</div><h2>'+esc(s.name)+'</h2><p class="lede">'+esc(s.lede)+'</p>'
    +s.groups.map(groupHtml).join("");
}
function settingsHost(){
  if(screenOn!=="settings" || typeof document==="undefined") return null;
  return document.getElementById("screenHost");
}
function settingsScreenHtml(){
  return '<div class="sx"><nav class="sx-nav" aria-label="'+esc(t("Settings"))+'">'
    +'<h1>'+esc(t("Settings"))+'</h1>'
    +'<label class="sx-search">'+sxIcon("search")+'<input type="search" id="sxSearch" autocomplete="off" spellcheck="false"'
    +' placeholder="'+esc(t("Search settings"))+'" aria-label="'+esc(t("Search settings"))+'" value="'+esc(sxQuery)+'"></label>'
    +'<div class="sx-secs" id="sxSecs">'+settingsNavHtml(sxQuery.trim()?"":sxOn)+'</div>'
    +'<div class="sx-foot"><button type="button" class="sx-maint" id="sxMaint">'+esc(t("Maintenance"))+' <kbd>'
    +esc(formatActionChord("maintenance"))+'</kbd></button></div></nav>'
    +'<div class="sx-page" id="setBody"></div></div>';
}
function renderSettings(host){
  scStopCapture();
  if(hkListening) hotkeyListen(null,false);
  host.innerHTML=settingsScreenHtml();
  const secs=host.querySelector("#sxSecs");
  if(secs) secs.onclick=e=>{
    const b=e.target && e.target.closest && e.target.closest("[data-sx]");
    if(!b) return;
    showSection(b.getAttribute("data-sx"));
  };
  const find=host.querySelector("#sxSearch");
  if(find){
    find.oninput=()=>{ sxQuery=find.value; paintNav(); paintSettings(); };
    /* Escape empties the search and stays on the screen; the tab's cross and Ctrl+W are what close it. */
    find.addEventListener("keydown",e=>{
      if(e.key!=="Escape" || !find.value) return;
      e.preventDefault(); e.stopPropagation();
      find.value=""; sxQuery=""; paintNav(); paintSettings();
    });
  }
  const mt=host.querySelector("#sxMaint");
  if(mt) mt.onclick=()=>openMaintenance();
  paintSettings();
}
function paintNav(){
  const host=settingsHost(), secs=host && host.querySelector("#sxSecs");
  if(secs) secs.innerHTML=settingsNavHtml(sxQuery.trim()?"":sxOn);
}
function showSection(id){
  sxOn=id; sxQuery="";
  const host=settingsHost(), find=host && host.querySelector("#sxSearch");
  if(find) find.value="";
  paintNav(); paintSettings();
  const page=host && host.querySelector("#setBody");
  if(page) page.scrollTop=0;
}
function paintSettings(){
  const host=settingsHost(), box=host && host.querySelector("#setBody");
  if(!box) return;
  box.innerHTML=settingsPageHtml(sxOn,sxQuery);
  paintKeysInline();
  wireHotkeyRow(box);
  wirePage(box);
  translateTree(box);
}
function wirePage(box){
  /* Live while dragging: the whole point is watching the columns re-form. */
  syncColFloorRow();
  const cf=box.querySelector("#setColFloor"), cfo=box.querySelector("#setColFloorOut");
  if(cf){
    cf.oninput=()=>{
      const v=+cf.value;
      if(cfo) cfo.textContent=Math.round(v*remPx())+"px";
      nsSet("Floor",String(v));
      /* The floor is a term of the dock threshold, so the panel answers the new setting without a reload. */
      rebuildRailMQ(); syncRailLayout();
      render();
    };
  }
  wireTeamRows(box);
  const joinBtn=box.querySelector("#setJoinTeam");
  if(joinBtn) joinBtn.onclick=()=>openJoinPaste();
  /* Stored on the keystroke, like every other row here: there is no Save on this screen. */
  const nameBox=box.querySelector("#setAgentName");
  if(nameBox) nameBox.oninput=()=>setAgentName(nameBox.value);
  const act=(id,fn)=>{ const b=box.querySelector(id); if(b) b.onclick=fn; };
  act("#setReset",resetAllSettings);
  act("#setClear",clearLocalMemory);
  act("#setResetKeys",resetShortcuts);
  act("#setAbout",()=>openAbout());
  /* The tour runs on the conversation, so the conversation comes forward and the tab stays for coming back. */
  act("#setTour",()=>{ clearScreenOn(); hooks.startTour(); });
  act("#setMaint",()=>openMaintenance());
  box.querySelectorAll(".set-seg").forEach(sbox=>{
    sbox.querySelectorAll("button").forEach(b=>{
      b.onclick=()=>{
        const seg=sbox.getAttribute("data-seg"), v=b.getAttribute("data-val"), on=(v==="on");
        /* THE CLASS MOVES, THE ELEMENT STAYS: a rebuilt seg arrives with .on already on the right button, so
           the thumb would be born at its destination with nothing to travel from. */
        if(b.classList.contains("on")) return;
        sbox.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
        b.classList.add("on");
        if(seg==="theme"){
          /* "System" is the state eTheme is in before anyone touches the header toggle; deleting the key restores it. */
          if(v==="system") lsDel("eTheme"); else lsSet("eTheme",v);
          applyTheme();
          if(v==="system") toast(t("Theme follows the system"));
        }
        else if(seg==="cols"){
          nsSet("Cols",v);
          rebuildRailMQ(); syncRailLayout();   // single column asks the panel for less room
          render();
          syncColFloorRow();
          toast(v==="auto"?t("Columns fit the window"):(v==="1"?t("Single column"):t("Two columns")));
        }
        else if(seg==="glass"){
          document.body.classList.toggle("glass-off",!on);
          if(!on) lsSet("eGlassOff","1"); else lsDel("eGlassOff");
          toast(on?t("Blur effects on"):t("Blur effects off"));
        }
        else if(seg==="motion"){
          if(on) lsDel("eMotionOff"); else lsSet("eMotionOff","1");
          syncStill();
          toast(on?t("Animations on"):t("Animations reduced"));
        }
        /* The locks call the app's own togglers rather than writing their keys, so the Menu label, the panel and
           the pin button follow exactly as they do from the Menu. */
        else if(seg==="notehover"){
          document.body.classList.toggle("note-hover",on);
          if(on) lsDel("eNoteHover"); else lsSet("eNoteHover","0");
          closeNotePane();
          toast(on?t("Notes open on hover"):t("Notes open from the i"));
        }
        else if(seg==="deck"){
          if(on) lsDel("eDeckOff"); else lsSet("eDeckOff","1");
          syncDeck();
          toast(on?t("Replies stack behind the first"):t("Replies laid out one below the other"));
        }
        else if(seg==="sharededit"){
          if(on) lsSet("eSharedEdit","1"); else lsDel("eSharedEdit");
          // The desk writes at once, as after an edit, so what it holds already goes where the setting now says.
          hooks.syncSampleMark();
          toast(on?t("From now on, changes go into the shared catalog"):t("From now on, changes stay in this desk's own file"));
        }
        else if(seg==="aisuggest"){
          if(on) lsDel(E_AI_OFF_KEY); else lsSet(E_AI_OFF_KEY,"1");
          eTellAi();
          // placeholder: Claudette
          toast(on?t("Suggestions from the built-in model"):t("Suggestions from matching words"));
        }
        else if(seg==="raillock"){ if(railLocked()!==on) toggleRailLock(); }
        else if(seg==="pillslock"){ if(pillsLocked()!==on) togglePillsLock(); }
        else if(seg==="startwin"){
          const host=closeHost();
          if(host){ try{ host.setLoginItem(on); }catch(e){} }
          toast(on?t("On"):t("Off"));
        }
        else if(seg==="closehow"){
          const quit=v==="quit";
          if(quit) lsSet("eQuitOnClose","1"); else lsDel("eQuitOnClose");
          const host=closeHost();
          if(host){ try{ host.setClosePolicy(quit); }catch(e){} }
          toast(quit?t("Quit"):t("Stay in the tray"));
        }
        else if(seg==="notesmaster"){
          const host=eHost();
          if(host && typeof host.setTrayNotes==="function"){ try{ host.setTrayNotes(on); }catch(e){} }
          toast(on?t("On"):t("Off"));
        }
        else if(seg==="noteedition"){
          if(on) lsDel("eNotifyEditionOff"); else lsSet("eNotifyEditionOff","1");
          toast(on?t("On"):t("Off"));
        }
        else if(seg==="notecatalog"){
          if(on) lsDel("eNotifyCatalogOff"); else lsSet("eNotifyCatalogOff","1");
          toast(on?t("On"):t("Off"));
        }
        /* No repaint: the class above is the whole visual change, and rebuilding would undo the slide it started. */
      };
    });
  });
  /* The language list is a select, not a switch: it is meant to hold more than two. Every label on the screen
     changes, the tab's name with them, so the whole screen is drawn again. */
  const ls=box.querySelector("#setUiLang");
  if(ls) ls.onchange=()=>{
    setUiLang(ls.value);
    const name=(UI_LANGS.filter(l=>l.code===uiLang())[0]||{}).label||ls.value;
    const host=settingsHost();
    if(host){ renderSettings(host); const again=host.querySelector("#setUiLang"); if(again) again.focus(); }
    drawTabs();
    toast(t("Interface language")+": "+name);
  };
}
function paintKeysInline(){
  const host=settingsHost(), box=host && host.querySelector("#scListInline");
  if(box) wireShortcutsList(box, paintKeysInline, scFold(sxQuery).trim());
}

/* The floor decides how many columns AUTO fits, and nothing at all when the count is fixed. Greyed and
   disabled rather than hidden: a dimmed control says "this belongs to Auto". */
function syncColFloorRow(){
  const sl=document.querySelector("#setColFloor");
  if(!sl) return;
  const auto=colMode()==="auto";
  sl.disabled=!auto;
  const r=sl.closest(".set-row");
  if(r) r.classList.toggle("set-row-off",!auto);
}

function resetShortcuts(){
  const was=lsGet("eShortcuts");
  scStopCapture();
  lsDel("eShortcuts"); loadShortcuts(); paintKeysInline();
  offerUndo("Shortcuts reset", ()=>{ if(was!=null){ lsSet("eShortcuts",was); loadShortcuts(); paintKeysInline(); } });
}
/* EVERY SETTING, and nothing that is not one: a card edit, a favourite, a hidden entry or a hand-sorted order is
   WORK and none of it is touched here, which is what lets this be one button that acts at once with an Undo. A
   name typed into a field and the language a tab is worked in are not settings. Every key this clears is named
   HERE, where both a reader and tests/storage-keys.js look for the list. */
function resetAllSettings(){
  const was={};
  ["eTheme","eGlassOff","eMotionOff","eUiLang","ePillsLock","eRailLock","ePills","eRail",
   "eShortcuts","eHdrPills","eNoteHover","eDeckOff","eRailW","eFactsW","eFactsH","eCollapsed","eSharedEdit",E_HOTKEY_KEY,"eQuitOnClose",
   "eNotifyEditionOff","eNotifyCatalogOff",E_AI_OFF_KEY]
    .forEach(k=>{ was[k]=lsGet(k); try{ lsDel(k); }catch(e){} });
  was[nsKey("Cols")]=nsGet("Cols"); was[nsKey("Floor")]=nsGet("Floor");
  nsDel("Cols"); nsDel("Floor");
  /* Start with Windows is not a desk key. Reset turns the login item off, and tray notices back on. */
  const host=eHost();
  let loginWas=false, notesWere=true;
  if(host && typeof host.loginItemState==="function"){
    try{ const s=host.loginItemState(); loginWas=!!(s && s.openAtLogin); }catch(e){}
  }
  if(host && typeof host.trayNotesState==="function"){
    try{ const s=host.trayNotesState(); notesWere=!(s && s.on===false); }catch(e){}
  }
  if(host && typeof host.setLoginItem==="function"){ try{ host.setLoginItem(false); }catch(e){} }
  if(host && typeof host.setTrayNotes==="function"){ try{ host.setTrayNotes(true); }catch(e){} }
  applyPrefs();
  repaintScreen();
  offerUndo("Settings reset", ()=>{
    Object.keys(was).forEach(k=>{ const v=was[k]; if(v==null) lsDel(k); else lsSet(k,v); });
    if(host && typeof host.setLoginItem==="function"){ try{ host.setLoginItem(loginWas); }catch(e){} }
    if(host && typeof host.setTrayNotes==="function"){ try{ host.setTrayNotes(notesWere); }catch(e){} }
    applyPrefs();
    repaintScreen();
  });
}
// The language may have changed with the keys, so the whole screen and the tab's name are drawn again.
function repaintScreen(){
  const host=settingsHost();
  if(host) renderSettings(host);
  try{ drawTabs(); }catch(e){}
}
/* EVERY PREFERENCE PUT ON SCREEN FROM WHAT IS STORED, whatever changed the keys: Reset, its Undo,
   and a desk started again in place. */
function applyPrefs(){
  try{ applyDefaultRailWidth(); applyStoredRailWidth(); }catch(e){}
  try{ applyStoredFactsSize(); }catch(e){}
  try{ rereadCollapsed(); }catch(e){}
  document.body.classList.toggle("note-hover", lsGet("eNoteHover")!=="0");
  document.body.classList.toggle("glass-off", lsGet("eGlassOff")==="1");
  syncStill();
  try{ syncDeck(); }catch(e){}
  try{ loadShortcuts(); }catch(e){}
  try{ applyTheme(); }catch(e){}
  try{ applyUiLang(); }catch(e){}
  try{ syncLayoutPrefs(); }catch(e){}
  try{ syncRailLayout(); }catch(e){}
  try{ drawPills(); }catch(e){}
  try{ render(); }catch(e){}
  try{
    const host=eHost();
    if(host && typeof host.setClosePolicy==="function") host.setClosePolicy(lsGet("eQuitOnClose")==="1");
  }catch(e){}
  eTellAi();
}
registerScreen("settings", {
  title: () => t("Settings"),
  render: host => renderSettings(host)
});
/* Opened AT a section when something sends you there, the picker's notice for one, and where it was otherwise.
   A second open fronts the one tab there is. */
function openSettings(section){
  const id=SX_ALIAS[section]||section;
  if(id){ sxOn=id; sxQuery=""; }
  openScreenTab("settings");
  const host=settingsHost(), on=host && host.querySelector(".sx-sec.on");
  if(on) try{ on.focus({preventScroll:true}); }catch(e){}
}

export {
  openSettings,
  applyPrefs,
  hotkeyFromEvent,
  wireHotkeyRow,
  settingsBodyHtml,
  settingsSections,
  settingsNavHtml,
  settingsPageHtml,
  settingsFound,
  resetAllSettings,
  wireTeamRows
};
