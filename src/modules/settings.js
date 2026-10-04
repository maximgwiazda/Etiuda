import { colMode, colFloor, remPx, COL_FLOOR_MIN, COL_FLOOR_MAX, COL_FLOOR_STEP } from "./columns.js";
import { accHtml, accOpen, dismissModal, modalResize, openDialog, wireAcc } from "./dialog.js";
import { loadShortcuts } from "./shortcuts.js";
import { scStopCapture, wireShortcutsList } from "./shortcuts-list.js";
import { lsGet, lsSet, lsDel, nsGet, nsSet, nsDel, nsKey } from "./storage.js";
import { drawPills } from "./tabs.js";
import { UI_LANGS, uiLang, offerUndo, t, toast, fileStamp } from "./ui-lang.js";
import { setUiLang } from "./repaint.js";
import { applyDefaultRailWidth, applyStoredRailWidth, railLocked, rebuildRailMQ, syncRailLayout, toggleRailLock } from "./rail-panel.js";
import { esc } from "./esc.js";
import { modalCard, $ } from "./dom.js";
import { themeChoice, applyTheme } from "./theme.js";
import { syncStill } from "./motion.js";
import { render } from "./render.js";
import { closeNotePane } from "./note-pane.js";
import { applyUiLang } from "./repaint.js";
import { pillsLocked, togglePillsLock, syncLayoutPrefs } from "./pills-box.js";
import { rereadCollapsed } from "./collapse.js";
import { applyStoredFactsSize } from "./facts.js";
import { agentName, setAgentName } from "./agent.js";
import { eHost } from "./host.js";
import { teamLeads, leadKeyText, forgetTeamLead } from "./team-join.js";

/* THE SETTINGS SCREEN. One test decides what belongs: would you set it once and
   forget it? Anything touched weekly is a Menu item or a header control; Data stays in
   the LIBRARY, About in About, diagnostics behind F2 - a second door repeats Clear local
   memory's old mistake. BUILT FROM THE SHARED VOCABULARY: accHtml/wireAcc for sections,
   .seg for switches, modalResize, wireShortcutsList - the next screen takes these rather
   than growing a fourth pair. THE LOCKS LIVE HERE, hide/show does not: a lock is a
   standing preference; "hide it now" is situational and stays in the Menu. Same split
   for the category bar. */
function curLangLabel(){ return (UI_LANGS.filter(l=>l.code===uiLang())[0]||UI_LANGS[0]).label; }
/* Both values in the summary, so a shut section still says what it holds. A desk where nobody
   has given a name yet leaves the language standing alone rather than behind a stray comma. */
function personalNote(){
  const n=agentName().trim();
  return n ? n+", "+curLangLabel() : curLangLabel();
}
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
function hotkeyRowHtml(){
  if(!hotkeyHost()) return "";
  const st=hotkeyState();
  return '<div class="sc-list"><div class="sc-row" id="setHotkeyRow"><div class="sc-label">'
    +esc(t("Bring the replies over any window"))
    +'<small id="setHotkeyNote">'+esc(st.taken
      ? t("Another program uses this combination just now; a different one will do.")
      : t("Works from any program; Enter copies a reply and goes back to the window you were in."))+'</small>'
    +'</div><div class="sc-binds"><button type="button" class="sc-bind sc-long'+(st.accel?"":" sc-empty")+'" id="setHotkey"'
    +' style="flex-basis:100%" title="'+esc(t("Click, then press the new key combo"))+'">'
    +esc(hotkeyLabel(st.accel))+'</button></div></div></div>';
}
/* `now` is a combination just held, which the desk may not have finished storing yet. */
function syncHotkeyRow(box,now){
  const b=box.querySelector("#setHotkey"), note=box.querySelector("#setHotkeyNote");
  if(!b) return;
  const st=typeof now==="string" ? {accel:now, taken:false} : hotkeyState();
  b.classList.toggle("listening",hkListening);
  b.classList.toggle("sc-empty",!hkListening && !st.accel);
  b.textContent=hkListening ? t("Press keys…") : hotkeyLabel(st.accel);
  if(note) note.textContent=st.taken
    ? t("Another program uses this combination just now; a different one will do.")
    : t("Works from any program; Enter copies a reply and goes back to the window you were in.");
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
function settingsBodyHtml(){
  /* The row hint says what the setting IS; the option tip says what THIS choice DOES, which
     is the half a two-word button cannot carry. Optional - a seg without tips renders as before. */
  const seg=(name,opts,cur)=>'<div class="seg set-seg" data-seg="'+name+'" data-n="'+opts.length+'">'+
    opts.map(o=>'<button type="button" data-val="'+esc(o.v)+'"'+
      (o.tip?' title="'+esc(o.tip)+'"':'')+(o.v===cur?' class="on"':'')+'>'+esc(o.t)+'</button>').join("")+
    '</div>';
  const row=(label,hint,control)=>'<div class="set-row"><div class="set-label">'+esc(label)+
    (hint?'<small>'+esc(hint)+'</small>':'')+'</div><div class="set-ctl">'+control+'</div></div>';
  const onoff=(name,on,tipOn,tipOff)=>seg(name,[{v:"off",t:t("Off"),tip:tipOff},
                                              {v:"on",t:t("On"),tip:tipOn}],on?"on":"off");
  const themeCur=themeChoice() || "system";
  const langSel='<select id="setUiLang" aria-label="'+esc(t("Interface language"))+'"'+
    ' title="'+esc(t("Changes every label in Etiuda, never the cards themselves"))+'">'+
    UI_LANGS.map(l=>'<option value="'+esc(l.code)+'"'+(l.code===uiLang()?" selected":"")+'>'+esc(l.label)+'</option>').join("")+
    '</select>';
  const lastSyncStamp=fileStamp(+lsGet("eLastSync"));
  /* WHO IS AT THE DESK, AND IN WHICH LANGUAGE: two rows of the same kind, the name first
     because it is the one that leaves the machine. NO LINE UNDER THE NAME - the placeholder
     names the field and the cards show what the name does, and a sentence here would be the
     third telling. */
  const personalSection=accHtml("personal", t("Personal"),
      row(t("Your name"), "",
        '<input type="text" id="setAgentName" autocomplete="off" spellcheck="false"'
        +' placeholder="first name" value="'+esc(agentName())+'">')+
      row(t("Interface language"),
          t("The language of the buttons and menus, not of the macros: those follow EN|PL in the header"),
          langSel)+
      (lastSyncStamp
        ? row(t("Last sync"), "", '<span>'+esc(lastSyncStamp)+'</span>')
        : "")+
      /* One row per team lead this desk trusts: the key the agent compared, and the way out where it was wrong. */
      teamLeads().map(l=>row(t("Team lead's key"), "",
        '<span class="e-lead-key">'+esc(leadKeyText(l.print))+'</span>'
        +'<button type="button" class="btn" data-forget-lead="'+esc(l.team)+'">'+esc(t("Forget this lead"))+'</button>')).join(""),
      personalNote(),
      t("The name customers see, and the language Etiuda's own buttons and menus are written in"));
  return personalSection+
    accHtml("appearance", t("Appearance"),
      row(t("Theme"), t("System follows your computer's own setting."),
          seg("theme",[{v:"light",t:t("Light"),
                        tip:t("Always the light palette, whatever the computer asks for")},
                       {v:"dark",t:t("Dark"),
                        tip:t("Always the dark palette, whatever the computer asks for")},
                       {v:"system",t:t("System"),
                        tip:t("Follows your computer's light or dark setting, and changes with it")}], themeCur))+
      row(t("Blur effects"),
          t("Blurred panel backgrounds and the blur behind dialogs. Turn off if text reads less clearly, or the machine struggles."),
          onoff("glass", !document.body.classList.contains("glass-off"),
                t("Panels and the dialog backdrop stay blurred"),
                t("Panels go flat and opaque, and a dialog only darkens what is behind it")))+
      /* Reads as what it GIVES, and the stored key still reads as what it takes away - it is
         inverted here alone, so an existing choice survives the rename. */
      row(t("Animations"),
          t("Transitions, slides, and the cards re-sorting themselves. Switches itself off when your system asks for reduced motion."),
          onoff("motion", lsGet("eMotionOff")!=="1",
                t("Everything moves as it was drawn to"),
                t("Nothing moves; every change lands at once"))),
      null,
      t("Theme, blur effects and animations"))+
    accHtml("layout", t("Layout"),
      row(t("Columns"),
          t("How many columns of cards to show. Auto fits as many as the window has room for."),
          seg("cols",[{v:"1",t:t("1"),tip:t("Always a single column")},
                      {v:"2",t:t("2"),tip:t("Always two columns, however wide the window is")},
                      {v:"auto",t:t("Auto"),tip:t("As many as fit without making a column too narrow to read")}],
              colMode()))+
      row(t("Narrowest column"),
          t("How narrow a column may get before Auto drops one. Wider means fewer, roomier columns."),
          '<div class="set-slider"><input type="range" id="setColFloor" min="'+COL_FLOOR_MIN+
            '" max="'+COL_FLOOR_MAX+'" step="'+COL_FLOOR_STEP+'" value="'+colFloor()+
            '" aria-label="'+esc(t("Narrowest column"))+'">'+
            '<output id="setColFloorOut">'+Math.round(colFloor()*remPx())+'px</output></div>')+
      row(t("Lock the intent panel"),
          t("Keep it docked even when the window is narrow, instead of letting it hide itself."),
          onoff("raillock", railLocked(),
                t("The panel stays docked at any window width"),
                t("The panel hides itself when the window gets narrow")))+
      row(t("Lock the category bar"),
          t("Keep every category row visible, instead of collapsing to two lines."),
          onoff("pillslock", pillsLocked(),
                t("Every category row stays visible"),
                t("The bar keeps two rows, and Ctrl peeks at the others")))+
      row(t("Notes on hover"),
          t("Open a card's internal note when the pointer rests on the card."),
          onoff("notehover", document.body.classList.contains("note-hover"),
                t("The note opens by itself, and the card shows no i"),
                t("The i on the card opens the note"))),
      null,
      t("What stays docked, and what may hide itself when space is short"))+
    accHtml("keys", t("Keyboard shortcuts"),
      hotkeyRowHtml()+'<div class="sc-list" id="scListInline"></div>',
      /* ",null" is the next ARGUMENT - "+null" concatenates and prints the characters "null"
         on the page. The neighbouring call has the same null in the same position. */
      null,
      t("Rebind any key combo. The keys the app itself needs are listed as fixed."));
}
function paintSettings(){
  const box=modalCard.querySelector("#setBody");
  if(!box) return;
  box.innerHTML=settingsBodyHtml();
  wireAcc(box, id=>{ if(id==="keys") paintKeysInline(); });
  paintKeysInline();
  wireHotkeyRow(box);
  /* Live while dragging: the whole point is watching the columns re-form, and a value that
     only lands on release makes the slider feel like a form field rather than a control. */
  syncColFloorRow();
  const cf=box.querySelector("#setColFloor"), cfo=box.querySelector("#setColFloorOut");
  if(cf){
    cf.oninput=()=>{
      const v=+cf.value;
      if(cfo) cfo.textContent=Math.round(v*remPx())+"px";
      nsSet("Floor",String(v));
      /* The floor is a term of the dock threshold: a wider column means the panel has to give
         way sooner. Rebuilt here so the panel answers the new setting without a reload. */
      rebuildRailMQ(); syncRailLayout();
      render();
    };
  }
  /* Stored on the keystroke, like every other row here: there is no Save on this screen. The
     summary beside the section title is the same value, so it follows the box rather than
     waiting for the next repaint to agree with it. */
  box.querySelectorAll("[data-forget-lead]").forEach(b=>{
    b.onclick=()=>forgetTeamLead(b.getAttribute("data-forget-lead"),()=>paintSettings());
  });
  const nameBox=box.querySelector("#setAgentName");
  if(nameBox) nameBox.oninput=()=>{
    setAgentName(nameBox.value);
    const note=box.querySelector('details[data-acc="personal"] .acc-note');
    if(note) note.textContent=personalNote();
  };
  box.querySelectorAll(".set-seg").forEach(sbox=>{
    sbox.querySelectorAll("button").forEach(b=>{
      b.onclick=()=>{
        const seg=sbox.getAttribute("data-seg"), v=b.getAttribute("data-val"), on=(v==="on");
        /* THE CLASS MOVES, THE ELEMENT STAYS: a rebuilt seg arrives with .on already on the
           right button - the thumb is born at its destination with nothing to travel
           from. The header's switch animates for exactly the opposite reason - one
           element, only the class moves. Do that here, and the effect follows. */
        if(b.classList.contains("on")) return;
        sbox.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
        b.classList.add("on");
        if(seg==="theme"){
          /* "System" is not a new mode - it is the state eTheme is in before anyone touches
             the header toggle, which until now could never be returned to without wiping
             storage. Deleting the key restores it. */
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
        /* The locks call the app's own togglers rather than writing their keys, so the Menu
           label, the panel and the pin button all follow exactly as they do from the Menu -
           one act, one code path, two doors that cannot drift. */
        else if(seg==="notehover"){
          document.body.classList.toggle("note-hover",on);
          if(on) lsDel("eNoteHover"); else lsSet("eNoteHover","0");
          closeNotePane();
          toast(on?t("Notes open on hover"):t("Notes open from the i"));
        }
        else if(seg==="raillock"){ if(railLocked()!==on) toggleRailLock(); }
        else if(seg==="pillslock"){ if(pillsLocked()!==on) togglePillsLock(); }
        /* No repaint: the class above is the whole visual change, and rebuilding would undo
           the slide it just started. Nothing else in the dialog depends on these values. */
      };
    });
  });
  /* The language list is a select, not a switch: it holds two entries today and is meant to
     hold seven, and a sliding thumb stops being a control the moment it cannot show its
     options at once. Repaints in place - every label in the dialog changes. */
  const ls=$("#setUiLang");
  if(ls) ls.onchange=()=>{
    setUiLang(ls.value);
    const name=(UI_LANGS.filter(l=>l.code===uiLang())[0]||{}).label||ls.value;
    /* The WHOLE card, not just the body: the heading, the sub-line and the Close button are
       outside #setBody, so repainting the body alone left an English "Settings" over Polish
       sections. openSettings() with no argument keeps whichever section is open. */
    modalResize(()=>openSettings());
    toast(t("Interface language")+": "+name);
  };
}
function paintKeysInline(){
  const box=modalCard.querySelector("#scListInline");
  if(box) wireShortcutsList(box, paintKeysInline);
}

/* The floor decides how many columns AUTO fits, and nothing at all when the count is fixed.
   Greyed and disabled rather than hidden: a control that vanishes makes the screen jump and
   leaves no clue the setting exists, while a dimmed one says "this belongs to Auto". */
function syncColFloorRow(){
  const sl=document.querySelector("#setColFloor");
  if(!sl) return;
  const auto=colMode()==="auto";
  sl.disabled=!auto;
  const row=sl.closest(".set-row");
  if(row) row.classList.toggle("set-row-off",!auto);
}

/* EVERY SETTING, and nothing that is not one: a card edit, a favourite, a hidden entry or a
   hand-sorted order is WORK and none of it is touched here, which is what lets this be one button
   that acts at once with an Undo. A panel's size and a folded group are settings; a name typed into
   a field and the language a tab is worked in are not. Every key this clears is named HERE, where
   both a reader and tests/storage-keys.js look for the list. */
function resetAllSettings(){
  const was={};
  ["eTheme","eGlassOff","eMotionOff","eUiLang","ePillsLock","eRailLock","ePills","eRail",
   "eShortcuts","eHdrPills","eNoteHover","eRailW","eFactsW","eFactsH","eCollapsed",E_HOTKEY_KEY]
    .forEach(k=>{ was[k]=lsGet(k); try{ lsDel(k); }catch(e){} });
  was[nsKey("Cols")]=nsGet("Cols"); was[nsKey("Floor")]=nsGet("Floor");
  nsDel("Cols"); nsDel("Floor");
  applyPrefs();
  paintSettings();
  offerUndo("Settings reset", ()=>{
    Object.keys(was).forEach(k=>{ const v=was[k]; if(v==null) lsDel(k); else lsSet(k,v); });
    applyPrefs();
    if(document.getElementById("setBody")) paintSettings();
  });
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
  try{ loadShortcuts(); }catch(e){}
  try{ applyTheme(); }catch(e){}
  try{ applyUiLang(); }catch(e){}
  try{ syncLayoutPrefs(); }catch(e){}
  try{ syncRailLayout(); }catch(e){}
  try{ drawPills(); }catch(e){}
  try{ render(); }catch(e){}
}
function openSettings(section){
  scStopCapture();
  /* Opened AT a section when something else sends you here - the maintenance panel's way back,
     for instance. Exclusive, so naming one closes whatever stood open. */
  if(section){ accOpen.clear(); accOpen.add(section); }
  openDialog({
    title: t("Settings"),
    body: '<div id="setBody"></div>',
    /* Reset sits at the bar's LEFT EDGE and stays secondary, with Close primary at the far
       right: the destructive action should never be the one the eye lands on, nor the one a
       reflex click finds when the intent was to dismiss. .mf-left is the group that takes the
       auto margin, the way the editors and Maintenance place their own destructive controls. */
    actions: '<div class="mf-left"><button type="button" class="btn" id="setReset" title="'+
      esc(t("Put every setting on this screen back to what it ships with. Cards and edits are not affected."))+
      '">'+esc(t("Reset defaults"))+'</button></div>'+
      '<button type="button" class="btn primary" id="setClose">'+esc(t("Close"))+'</button>',
    wire: ()=>{
      paintSettings();
      const c=$("#setClose");
      if(c) c.onclick=()=>dismissModal();
      const rs=$("#setReset");
      if(rs) rs.onclick=resetAllSettings;
    }
  });
}

export {
  openSettings,
  applyPrefs,
  hotkeyFromEvent
};
