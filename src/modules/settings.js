import { colMode, colFloor, colCount, remPx, COL_FLOOR_MIN, COL_FLOOR_MAX, COL_FLOOR_STEP } from "./columns.js";
import { loadShortcuts, formatActionChord } from "./shortcuts.js";
import { scStopCapture, wireShortcutsList, shortcutsShown, scFold, scCaptureId } from "./shortcuts-list.js";
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
import { eHost, eHasShared, E_AI_OFF_KEY, eAiOn, eAiModel, eTellAi, E_SEARCH_AI_OFF_KEY, eSearchOn, eTellSearch } from "./host.js";
import { armSearch, clearSearchMeaning } from "./search-meaning.js";
import { hooks } from "./hooks.js";
import { lapseNote, teamLeads, relayDesk, keySignHtml, forgetTeamLead, pickMovedFolder, joinDoorButton, openJoinPaste, onJoinPainted } from "./team-join.js";
import { pack } from "./pack.js";
import { openScreenTab, registerScreen, screenOn, clearScreenOn } from "./screen-tabs.js";
import { openAbout } from "./about.js";
import { openMaintenance } from "./maintenance.js";
import { E_VERSION } from "./env.js";
import { sxIcon } from "./sx-icons.js";

/* THE SETTINGS SCREEN, a screen tab. Opening it shows every section on one page, under its name,
   in columns that fill the width. Choosing a section shows that section alone: Appearance and Layout
   keep their rows beside a small desk drawn from this page's own tokens, and every other section lays
   its rows out side by side. One test decides what belongs: would you set it once and forget it?
   Anything touched weekly is a Menu item or a header control. The locks live here, hide/show does not.
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
   have an edition newer than this desk has loaded. It never disables a control. A listed catalog with no edition yet says that this desk waits for the lead's first edition. */
function teamRowHtml(l,status,bar){
  const notes=[l.relay?t("Relay: {HOST}").split("{HOST}").join(l.relay):l.folder?t("Folder: {FOLDER}").split("{FOLDER}").join(l.folder):"",
    l.removed?t("This team no longer includes this desk."):status,
    l.policy?t("The organisation's IT sets this desk's team."):bar?t("After leaving a team, this desk can join it again with a new invitation from its lead."):""];
  if(l.head) notes.push(teamHeadNote(l.head)); /* plant:head-show */
  if(l.awaitsEdition) notes.push(t("This desk waits for the team's lead to publish a first edition."));
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
    const plat=(host && host.platform) || (typeof process!=="undefined" && process.platform) || "";
    const quit=lsGet("eQuitOnClose")==="1";
    const rows=[];
    if(plat==="win32"){
      let startOn=false;
      try{ const s=host.loginItemState(); startOn=!!(s && s.openAtLogin); }catch(e){ startOn=false; }
      rows.push(row("startwin","forward",t("Start with Windows"),
        t("Etiuda starts in the tray when this Windows account signs in."),
        onoff("startwin", startOn, "", "")));
    }
    rows.push(row("closehow","desks",t("When the window closes"),
      t("In the tray, Etiuda still answers its shortcut and shows notifications."),
      seg("closehow",[{v:"stay",t:t("Stay in the tray")},{v:"quit",t:t("Quit")}], quit?"quit":"stay")));
    groups.push({head:t("Starting and closing"), rows:rows});
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
  if(eHasShared() && !relayDesk()) rows.push(row("sharededit","teams",t("Edit the shared catalog directly"),
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
    row("aisuggest","ai",t("Suggest intents with the built-in model"),
      t("Reads a copied message on this computer and suggests the intents it is closest to. Off, suggestions come from matching words."),
      onoff("aisuggest", eAiOn(),
        t("The model ranks the suggestions; nothing leaves this computer"),
        t("Suggestions come from matching words, and the model stays unloaded"))),
    row("aisearch","ai",t("Search by meaning with the built-in model"),
      t("From the third letter typed, the main search adds the cards and intents closest in meaning after those that match the words, ranked by the model on this computer. Off, it matches words only."),
      onoff("aisearch", eSearchOn(),
        t("The model ranks the search beside word matches; nothing leaves this computer"),
        t("Off, it matches words only.")))
  ]}];
}
function dataGroups(){
  return [{rows:[
    row("reset","refresh",t("Reset defaults"),t("Puts every setting back as it ships. Cards and your edits are not touched."),
      '<button type="button" class="btn" id="setReset">'+esc(t("Reset defaults"))+'</button>')
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

/* Empty is the one page. A section id is that section alone. A search narrows the rows and keeps the headings. */
let sxOn="", sxQuery="";
const SX_ALIAS={personal:"general"};
/* The rows whose title or hint holds the search, section by section, and the shortcuts whose name or hint does. */
function settingsFound(query){
  const q=scFold(query).trim();
  if(!q) return [];
  return settingsSections().map(s=>({sec:s, rows:[].concat(...s.groups.map(g=>g.rows))
    .filter(r=>r.key==="shortcuts" ? shortcutsShown(q)>0 : scFold(rowWords(r)).indexOf(q)>=0)}))
    .filter(x=>x.rows.length);
}
function navOn(){
  if(sxQuery.trim()) return "";
  return (!sxOn || sxOn==="all") ? "all" : sxOn;
}
function settingsNavHtml(on){
  const btn=(id,icon,name)=>{
    const onThis=id===on;
    return '<button type="button" class="sx-sec'+(onThis?" on":"")+'" data-sx="'+esc(id)+'"'
      +(onThis?' aria-current="page"':'')+'>'+sxIcon(icon)+'<span>'+esc(name)+'</span></button>';
  };
  return btn("all","all",t("All settings"))+settingsSections().map(s=>btn(s.id, s.icon, s.name)).join("");
}
function sectionBlockHtml(s, link){
  const h=link
    ? '<h3><button type="button" data-open="'+esc(s.id)+'" title="'+esc(t("Opens this section alone"))+'">'+esc(s.name)+'</button></h3>'
    : '<h3>'+esc(s.name)+'</h3>';
  return '<section class="sx-block" data-sec="'+esc(s.id)+'">'+h+s.groups.map(groupHtml).join("")+'</section>';
}
function allColumnsHtml(secs, link){
  return '<div class="sx-all">'+secs.map(s=>sectionBlockHtml(s, link)).join("")+'</div>';
}
function onePageHtml(){
  return '<h2>'+esc(t("Settings"))+'</h2>'
    +'<p class="lede">'+esc(t("Every setting Etiuda has, on one page."))+'</p>'
    +allColumnsHtml(settingsSections(), true);
}
/* How many columns the desk itself is showing, so the picture can follow. A fixed 1 or 2 is that
   number; Auto asks the same count the cards use. Anything the harness cannot measure stays at 3. */
function lookCols(){
  try{
    const m=colMode();
    if(m==="1" || m==="2") return +m;
    const n=colCount();
    if(n>=1 && n<=4) return n;
  }catch(e){}
  return 3;
}
function miniCard(){ return '<b><u></u><s></s><s></s><s style="width:60%"></s></b>'; }
function miniCols(n){
  const one='<span>'+miniCard()+miniCard()+miniCard()+'</span>';
  let html="", i;
  for(i=0;i<n;i++) html+=one;
  return html;
}
function deskLookHtml(){
  const n=lookCols();
  return '<div class="sx-lookside"><h3>'+esc(t("As the desk will look"))+'</h3>'
    +'<div class="sx-mini" aria-hidden="true" inert>'
    +'<div class="bar"><i></i><i></i></div>'
    +'<div class="hdr"><i></i><i class="w"></i><i></i></div>'
    +'<div class="pills">'+'<i></i>'.repeat(11)+'</div>'
    +'<div class="body"><div class="rail">'+'<s></s>'.repeat(9)+'</div>'
    +'<div class="cols" data-n="'+n+'">'+miniCols(n)+'</div></div></div>'
    +'<p>'+esc(t("A drawing that follows these settings as they change. It is only for looking at."))+'</p></div>';
}
function settingsPageHtml(on,query){
  const q=String(query||"").trim();
  if(q){
    const found=settingsFound(q);
    if(!found.length) return '<div class="sx-crumb">'+esc(t("Settings"))+'</div>'
      +'<p class="sx-none">'+esc(t("No setting matches this search."))+'</p>';
    const secs=found.map(f=>({id:f.sec.id, name:f.sec.name, groups:[{rows:f.rows}]}));
    return '<div class="sx-crumb">'+esc(t("Settings"))+'</div>'+allColumnsHtml(secs, false);
  }
  if(!on || on==="all") return onePageHtml();
  const secs=settingsSections(), s=secs.find(x=>x.id===on)||secs[0];
  const rows=s.groups.map(groupHtml).join("");
  const body=(s.id==="appearance" || s.id==="layout")
    ? '<div class="sx-look"><div class="sx-lookrows">'+rows+'</div>'+deskLookHtml()+'</div>'
    : '<div class="sx-tiles">'+rows+'</div>';
  return '<a class="sx-crumb sx-back" href="#settings">'+esc(t("All settings"))+'</a><h2>'+esc(s.name)+'</h2>'
    +'<p class="lede">'+esc(s.lede)+'</p>'+body;
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
    +'<div class="sx-secs" id="sxSecs">'+settingsNavHtml(navOn())+'</div>'
    +'<div class="sx-foot"><button type="button" class="sx-maint" id="sxMaint">'+esc(t("Maintenance"))+' <kbd>'
    +esc(formatActionChord("maintenance"))+'</kbd></button></div></nav>'
    +'<div class="sx-page" id="setBody"></div></div>';
}
let sxEscWired=false;
function onSectionEscape(e){
  if(e.key!=="Escape" || e.defaultPrevented) return;
  if(screenOn!=="settings" || !sxOn || sxOn==="all" || String(sxQuery||"").trim()) return;
  if(scCaptureId || hkListening) return;
  const target=e.target, tag=target && target.tagName;
  if(tag==="INPUT" || tag==="TEXTAREA" || tag==="SELECT" || (target && target.isContentEditable)) return;
  e.preventDefault();
  e.stopPropagation();
  showAll();
}
function wireSectionEscape(){
  if(sxEscWired || typeof document==="undefined" || typeof document.addEventListener!=="function") return;
  sxEscWired=true;
  try{ document.addEventListener("keydown", onSectionEscape, true); }
  catch(err){ sxEscWired=false; }
}
function renderSettings(host){
  wireSectionEscape();
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
  if(secs) secs.innerHTML=settingsNavHtml(navOn());
}
function showAll(){
  sxOn=""; sxQuery="";
  const host=settingsHost(), find=host && host.querySelector("#sxSearch");
  if(find) find.value="";
  paintNav(); paintSettings();
  const page=host && host.querySelector("#setBody");
  if(page) page.scrollTop=0;
}
function showSection(id){
  if(!id || id==="all"){ showAll(); return; }
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
function syncDeskLook(){
  const host=settingsHost(), cols=host && host.querySelector(".sx-mini .cols");
  if(!cols) return;
  let n=3;
  try{ n=lookCols(); }catch(e){ n=3; }
  if(String(cols.getAttribute("data-n"))!==String(n)){
    cols.innerHTML=miniCols(n);
    cols.setAttribute("data-n", String(n));
  }
  let floor=22.5;
  try{ floor=colFloor(); }catch(e){}
  cols.style.setProperty("--sx-floor", Math.round(28+((floor-12.5)/37.5)*36)+"px");
}
function wirePage(box){
  box.querySelectorAll("a.sx-back").forEach(a=>{
    a.onclick=e=>{ e.preventDefault(); showAll(); };
  });
  box.querySelectorAll("[data-open]").forEach(b=>{
    b.onclick=()=>showSection(b.getAttribute("data-open"));
  });
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
      syncDeskLook();
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
          syncDeskLook();
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
          toast(on?t("Suggestions from the built-in model"):t("Suggestions from matching words"));
        }
        else if(seg==="aisearch"){
          if(on) lsDel(E_SEARCH_AI_OFF_KEY); else lsSet(E_SEARCH_AI_OFF_KEY,"1");
          eTellSearch();
          if(on) armSearch(); else clearSearchMeaning();
          try{ render(); }catch(e){}
          try{ hooks.drawIntentRail(); }catch(e){}
          toast(on?t("The model ranks the search beside word matches; nothing leaves this computer"):t("Off, it matches words only."));
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
          toast(quit?t("Closing the window will quit Etiuda."):t("Stay in the tray"));
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
  syncDeskLook();
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
   "eNotifyEditionOff","eNotifyCatalogOff",E_AI_OFF_KEY,E_SEARCH_AI_OFF_KEY]
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
  eTellSearch();
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
/* Opened at a section when something sends you there, and on the one page when nothing is named.
   A second open fronts the one tab there is. */
function openSettings(section){
  const id=SX_ALIAS[section]||section;
  if(id && id!=="all"){ sxOn=id; sxQuery=""; }
  else { sxOn=""; sxQuery=""; }
  openScreenTab("settings");
  const host=settingsHost(), on=host && host.querySelector(".sx-sec.on");
  if(on) try{ on.focus({preventScroll:true}); }catch(e){}
}
/* The head last drawn on Teams. A later join paint draws the page again only when that head changed, and only while Teams is the open section. */
let headDrawn="";
function headDrawSig(){
  return (relayDesk()?"1":"0")+"\n"+teamLeads().map(l=>l.team+"\t"+(l.head?l.head.edition+"\t"+l.head.published+"\t"+String(l.head.t)+(l.head.catalog?"\t"+l.head.catalog:""):"")).join("\n");
}
onJoinPainted(()=>{
  const next=headDrawSig();
  if(next===headDrawn) return;
  headDrawn=next;
  if(sxOn!=="teams" || sxQuery) return;
  try{ if(typeof document==="undefined" || !document.getElementById("setBody")) return; }catch(e){ return; }
  paintSettings();
});

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
