import { colMode, colFloor, remPx, COL_FLOOR_MIN, COL_FLOOR_MAX, COL_FLOOR_STEP } from "./columns.js";
import { accHtml, accOpen, dismissModal, modalResize, openDialog, wireAcc } from "./dialog.js";
import { loadShortcuts } from "./shortcuts.js";
import { scStopCapture, wireShortcutsList } from "./shortcuts-list.js";
import { lsGet, lsSet, lsDel, nsSet, nsDel } from "./storage.js";
import { drawPills } from "./tabs.js";
import { UI_LANGS, uiLang, ask, t, toast } from "./ui-lang.js";
import { setUiLang } from "./repaint.js";
import { applyDefaultRailWidth, railLocked, rebuildRailMQ, syncRailLayout, toggleRailLock } from "./rail-panel.js";
import { esc } from "./esc.js";
import { modalCard, $ } from "./dom.js";
import { themeChoice, applyTheme } from "./theme.js";
import { render } from "./render.js";
import { closeNotePane } from "./note-pane.js";
import { applyUiLang } from "./repaint.js";
import { pillsLocked, togglePillsLock } from "./pills-box.js";
import { expandAllGroups } from "./collapse.js";
import { applyDefaultFactsSize } from "./facts.js";
import { eCatalogFolder, eChooseCatalogFolder } from "./host.js";
import { agentName, setAgentName } from "./agent.js";

/* THE SETTINGS SCREEN. One test decides what belongs: would you set it once and
   forget it? Anything touched weekly is a Menu item or a header control; Data stays in
   the LIBRARY, About in About, diagnostics behind F2 - a second door repeats Clear local
   memory's old mistake. BUILT FROM THE SHARED VOCABULARY: accHtml/wireAcc for sections,
   .seg for switches, modalResize, wireShortcutsList - the next screen takes these rather
   than growing a fourth pair. THE LOCKS LIVE HERE, hide/show does not: a lock is a
   standing preference; "hide it now" is situational and stays in the Menu. Same split
   for the category bar. */
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
  const curLang=(UI_LANGS.filter(l=>l.code===uiLang())[0]||UI_LANGS[0]).label;
  /* The PATH IS THE VALUE, so it sits where the hint sits and nothing describes it: a person
     reading a folder under "Catalog folder" needs no sentence saying that is what it is. Its own
     class only so a long path breaks inside the label column instead of pushing the button out. */
  const pathRow=(label,p,control)=>'<div class="set-row"><div class="set-label">'+esc(label)+
    '<small class="set-path">'+esc(p)+'</small></div><div class="set-ctl">'+control+'</div></div>';
  /* Only where a host answers: a browser has no folder to offer, and a row that cannot act is
     worse than an absent one on the screen that is meant to be read once. */
  const folder=eCatalogFolder();
  /* THE FOLDER, AND NOTHING ELSE THAT IS NOT A SETTING. What the folder holds is a list of
     files with an act beside each, which is work rather than a preference, and it lives in the
     Library with the catalog it is about. */
  const catalogSection=folder ? accHtml("catalog", t("Catalogs"),
      pathRow(t("Catalog folder"), folder,
        '<button type="button" class="btn" id="setCatFolder">'+esc(t("Change"))+'</button>'),
      null,
      t("Where Etiuda looks for catalogs: any .ec file there, the most recently changed first"))
    : "";
  /* NO LINE UNDER IT. The placeholder names the field and the cards show what the name does;
     a sentence here would be the third telling. */
  const nameSection=accHtml("you", t("You"),
      row(t("Your name"), "",
        '<input type="text" id="setAgentName" autocomplete="off" spellcheck="false"'
        +' placeholder="first name" value="'+esc(agentName())+'">'),
      agentName(),
      t("The name customers see, exactly as you type it"));
  return nameSection+catalogSection+
    accHtml("language", t("Localisation"),
      row(t("Interface language"),
          t("The language of the buttons and menus, not of the macros: those follow EN|PL in the header"),
          langSel),
      curLang,
      t("What language Etiuda's own buttons, menus and messages are written in"))+
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
      '<div class="sc-list" id="scListInline"></div>',
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
  /* The picker is the host's, and the CAPTION goes out already translated because the shell has
     no t(). Writing the key is the whole act: the shell watches the desk, so it re-aims its own
     watch and offers whatever the new folder holds without a restart. No toast on the way back:
     the row repaints to the folder that was chosen, and a message saying what the screen is
     already showing is the one the voice rules strike. */
  /* Stored on the keystroke, like every other row here: there is no Save on this screen. The
     summary beside the section title is the same value, so it follows the box rather than
     waiting for the next repaint to agree with it. */
  const nameBox=box.querySelector("#setAgentName");
  if(nameBox) nameBox.oninput=()=>{
    setAgentName(nameBox.value);
    const note=box.querySelector('details[data-acc="you"] .acc-note');
    if(note) note.textContent=nameBox.value.trim();
  };
  const pick=box.querySelector("#setCatFolder");
  if(pick) pick.onclick=()=>{
    eChooseCatalogFolder(t("Choose the folder Etiuda reads catalogs from")).then(dir=>{
      if(dir) paintSettings();
    });
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
          toast(on?t("Animations reduced"):t("Animations on"));
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

/* EVERY SETTING, and nothing that is not one: preferences are a handful of cheap
   keys; a card edit, a favourite, a hidden entry or a hand-sorted order is WORK, and
   none of it is touched here - the distinction that lets this be one button. The confirm
   says so out loud, because a reset beside Close is what a person clicks meaning to
   dismiss. Shortcut keys are cleared inline: a reset of its own would ask a second question,
   and two confirms for one decision teaches clicking through both. */
function resetAllSettings(){
  if(!ask("Put every setting back to its default? Your cards, edits, favourites and order are not touched.")) return;
  /* A panel's size and a folded group are settings of the theme's kind. A name typed into a
     field, and the language a tab is being worked in, are not, and stay. Every key this
     clears is named HERE, where both a reader and tests/storage-keys.js look for the list;
     the three calls below only put back the live state each one holds. */
  ["eTheme","eGlassOff","eMotionOff","eUiLang","ePillsLock","eRailLock","ePills","eRail",
   "eShortcuts","eHdrPills","eNoteHover","eRailW","eFactsW","eFactsH","eCollapsed"]
    .forEach(k=>{ try{ lsDel(k); }catch(e){} });
  try{ applyDefaultRailWidth(); }catch(e){}
  try{ applyDefaultFactsSize(); }catch(e){}
  try{ expandAllGroups(); }catch(e){}
  document.body.classList.add("note-hover");
  try{ nsDel("Cols"); nsDel("Floor"); }catch(e){}
  document.body.classList.remove("glass-off");
  try{ loadShortcuts(); }catch(e){}
  try{ applyTheme(); }catch(e){}
  try{ applyUiLang(); }catch(e){}
  try{ syncRailLayout(); }catch(e){}
  try{ drawPills(); }catch(e){}
  try{ render(); }catch(e){}
  paintSettings();
  toast("Settings reset");
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
  openSettings
};
