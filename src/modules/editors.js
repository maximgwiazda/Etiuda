import { isAlwaysCat, setCatAlways } from "./cat-roles.js";
import { intentStoreKeys, CATS, SW_EN, CONTENT_LANGS, INTENT_TEXT_FIELDS, INTENT_FIELD_KEY, SW_STORE } from "./content-model.js";
import { closeModal, edMarkClean, edNavHtml, edWireNav, openDialog, refreshDialogChrome } from "./dialog.js";
import { ICON_ROLE_ALWAYS, catIconInner, CAT_LABELS_PL, E_HUE_CYCLE, E_HUE_NAMES, CAT_ICON_KEYS } from "./icons.js";
import { intentNavName, commentTokensInUse } from "./intent-text.js";
import { langTabs, langPane, langFieldId, langEndonym, markMissing, edReportMissing, langFocus } from "./lang-tabs.js";
import { openManage } from "./manage.js";
import { displayIntentRows, drawIntentRail } from "./rail-list.js";
import { drawPills } from "./tabs.js";
import { tourActive } from "./tour.js";
import { ask, t, toast } from "./ui-lang.js";
import { BASE_CATS, pack, savePack } from "./pack.js";
import { removeIntent } from "./favourites.js";
import { catIconKey, catSlot, categoryIsOverridden, resetCategory } from "./cat-identity.js";
import { intentIdAt, intentIdxOfId, intentIsCustom, intentIsOverridden } from "./intent-id.js";
import { applyCatsToGlobal, removeCategory } from "./cat-set.js";
import { esc } from "./esc.js";
import { $, modalCard } from "./dom.js";
import { cardCounts } from "./card-counts.js";

/* ---- Category editor: name, icon and colour on one screen, via the pencil on a
   category row. Everything it writes lives in `pack` - so a catalog update can never
   overwrite a choice made here, and "Reset look" deletes the overrides to hand the
   category back to the automatic guess rather than pinning a copy. The live pill at the
   top is the point: icon and colour are judged together or not at all. */
function openCategoryEditor(k,fromPill){
  if(!k || k==="__orphan") return;
  applyCatsToGlobal();
  /* Opened from the category bar rather than from the Library, the way back is OUT, not into a
     screen the user never asked for. Cancel, Save and Delete all use it. */
  const leave=()=>{ if(fromPill) closeModal(); else openManage(); };
  const canDelete=!(cardCounts[k]||0);
  /* A category the user made has no catalog version behind it, so there is nothing to reset TO. */
  const isCustomCat=!!(pack.customCats && pack.customCats[k]) && !BASE_CATS[k];
  /* The two names as WRITTEN, never CATS[k] - that is whichever one the current interface
     language resolved to, and filling an editor from it is how a rename eats the other name. */
  const origEn=pack.catLabels[k] || BASE_CATS[k] || (pack.customCats&&pack.customCats[k]) || k;
  const origPl=pack.catLabelsPl[k] || CAT_LABELS_PL[k] || "";
  const orig=origEn;
  let iconKey=catIconKey(k), slot=catSlot(k), always=isAlwaysCat(k);
  /* A key retired from the roster (pencil today) still shows HERE while this category wears
     it - the grid must reflect the state on screen, or the current icon would be invisibly
     stuck with no way to see what is selected. Choosing anything else retires it for real. */
  const iconGridKeys=()=>(iconKey && CAT_ICON_KEYS.indexOf(iconKey)<0)
    ? CAT_ICON_KEYS.concat(iconKey) : CAT_ICON_KEYS;
  const iconGrid=()=>iconGridKeys().map(key=>
    '<button type="button" class="ic-opt'+(key===iconKey?" on":"")+'" data-ic="'+esc(key)+'" '+
    'title="'+esc(key)+'" aria-label="'+esc(key)+'" aria-pressed="'+(key===iconKey?"true":"false")+'">'+
    '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+catIconInner(key)+'</svg></button>').join("");
  /* Offered in CYCLE order, not 0..7: the swatches then read as the sequence the app itself
     deals from, and the two newcomers sit where they belong rather than tacked on the end. */
  const colGrid=()=>E_HUE_CYCLE.map(i=>
    '<button type="button" class="col-opt'+(i===slot?" on":"")+'" data-col="'+i+'" '+
    'style="--sw:var(--e-c'+i+')" title="'+esc(E_HUE_NAMES[i]||("Colour "+(i+1)))+'" '+
    'aria-label="'+esc(E_HUE_NAMES[i]||("Colour "+(i+1)))+'" '+
    'aria-pressed="'+(i===slot?"true":"false")+'"><i></i></button>').join("");
  openDialog({
    back: fromPill?null:()=>openManage(),
    title: "Edit category",
    name: ()=>CATS[k]||"",
    resettable: ()=>!isCustomCat && categoryIsOverridden(k),
    resetOn: "Discard your changes and restore the catalog's category.",
    resetOff: isCustomCat ? "This is yours, so the catalog has no version to restore." : "Nothing to discard - this matches the catalog.",
    nav: edNavHtml(),
    body:
      /* Under the head's rule, the same distance below it as the window controls sit above, on
         the body's own right edge: the flag belongs to the category, not to one of its
         languages. Zero-height anchor, so nothing below it moves. */
      '<div class="ce-topright"><button type="button" class="mg-role'+(always?" on":"")+'" id="ceAlways" aria-pressed="'+(always?"true":"false")+'"'+
        ' title="'+esc(t(always
          ? "Supporting category, relevant regardless of the intent"
          : "Make this a supporting category, relevant regardless of the intent"))+'"'+
        ' aria-label="'+esc(t("Supporting category"))+'">'+ICON_ROLE_ALWAYS+'</button></div>'+
      '<div class="ce-preview" id="cePrev"></div>'+
      /* TWO BOXES: a category can be named differently per interface language and the
         format carries both. One box filled from the RESOLVED label meant editing under a
         Polish interface wrote the Polish name into the English slot and lost the English
         one. The Polish box is optional - empty means "no Polish name", falling back to
         the English one: the engine does not translate category names. */
      langTabs()+CONTENT_LANGS.map((l,i)=>langPane(l,i,
        '<div class="mf"><label>Name</label>'
          +'<input id="'+langFieldId("ce","name",l)+'" value="'+esc(l==="pl"?origPl:origEn)+'"'
          +' autocomplete="off" spellcheck="false" placeholder="'+esc(l==="pl"?origEn:"")+'"'
          +' aria-label="'+esc(t("Category name"))+' ('+esc(langEndonym(l))+')"></div>'
      )).join("")+
      '<div class="mf"><label>Icon</label><div class="ic-pick" id="ceIcons">'+iconGrid()+'</div></div>'+
      '<div class="mf"><label>Colour</label><div class="col-pick" id="ceCols">'+colGrid()+'</div></div>',
    /* DELETE LIVES HERE, not on the pill - there it could only appear on an empty
       category, so an undeletable category simply had no control and nothing said why.
       Always present, greyed with the reason in its tooltip - teaching the rule instead
       of hiding it. Far left, away from Save, as the card editor places its own. */
    actions: (()=>{
        /* The reason sits on the WRAPPER as well as the button. A disabled control does not
           receive mouse events in every browser, and the tooltip is the only thing that says
           why this one is off - so the span behind it carries the same words and is never
           disabled. */
        const why=t(canDelete ? "Delete this category. It is empty, so nothing is lost."
                              : "Move or delete the cards in this category first");
        /* Delete, not "Delete category": the heading already names what is being edited, and
           the other two editors say the bare verb. */
        return '<div class="mf-left">'+
          '<span title="'+esc(why)+'">'+
          '<button type="button" class="btn danger mf-del" id="ceDelete"'+
          (canDelete ? '' : ' disabled aria-disabled="true"')+
          ' title="'+esc(why)+'">Delete</button></span>'+
          /* Only when there is something to give back - the same rule the card and intent
             editors follow, and never for a custom category, which has no catalog version. */
          '<button type="button" class="btn mf-reset" id="ceReset">Reset</button>'+
          '</div>';
      })()+
      '<button type="button" class="btn" id="ceCancel">Cancel</button>'+
      '<button type="button" class="btn primary" id="ceSave">Save</button>'
  });
  const nameEl=$("#"+langFieldId("ce","name","en")), namePlEl=$("#"+langFieldId("ce","name","pl"));
  const ceStrip=$(".lang-tabs"); if(ceStrip) ceStrip.addEventListener("click",()=>setTimeout(drawPrev,0));
  function drawPrev(){
    /* Previews the language of the OPEN TAB, not the interface. With a strip on screen the tab
       is the clearer statement of which name is being written, and an empty box falls back to
       the English name exactly as the runtime does. */
    const onTab=$(".lang-tabs button.on");
    const cur=onTab?onTab.getAttribute("data-l"):CONTENT_LANGS[0];
    const nm=(cur==="pl" && namePlEl.value.trim()) || nameEl.value.trim() || orig;
    const ic='<svg class="cat-ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+catIconInner(iconKey)+'</svg>';
    $("#cePrev").innerHTML=
      '<span class="pill" data-ec="'+slot+'">'+ic+'<span class="pill-lab">'+esc(nm)+'</span></span>'+
      '<span class="ccat" data-ec="'+slot+'">'+ic+esc(nm)+'</span>';
  }
  function markOn(sel,attr,val){
    modalCard.querySelectorAll(sel).forEach(b=>{
      const on=b.getAttribute(attr)===String(val);
      b.classList.toggle("on",on);
      b.setAttribute("aria-pressed",on?"true":"false");
    });
  }
  nameEl.oninput=drawPrev;
  namePlEl.oninput=drawPrev;
  $("#ceIcons").onclick=e=>{
    const b=e.target.closest("[data-ic]"); if(!b) return;
    iconKey=b.getAttribute("data-ic"); markOn("[data-ic]","data-ic",iconKey); drawPrev();
  };
  $("#ceCols").onclick=e=>{
    const b=e.target.closest("[data-col]"); if(!b) return;
    slot=+b.getAttribute("data-col"); markOn("[data-col]","data-col",slot); drawPrev();
  };
  /* Staged like the icon and the colour and written by Save; the Library's asterisk applies on
     the spot because it has no Save. */
  /* TWO LINES DECIDE WHERE THE FLAG SITS: the window controls' above it, and the preview pill's
     across. The body reserves a lane for its scrollbar, so its content edge stops short of the
     head's - the anchor is pulled across that lane, measured, since its width is the browser's.
     A frame late: the body wrapper is built by the observer at mountModalBody, after this runs. */
  requestAnimationFrame(()=>{
    const tr=$(".ce-topright"), bd=modalCard.querySelector(".modal-body"), btn=$("#ceAlways");
    if(!tr||!bd||!btn) return;
    tr.style.marginRight=(bd.clientWidth-bd.offsetWidth)+"px";
    const pill=modalCard.querySelector("#cePrev .pill")||$("#cePrev");
    if(pill){
      const pr=pill.getBoundingClientRect(), ar=tr.getBoundingClientRect();
      btn.style.top=(pr.top+pr.height/2-ar.top-btn.offsetHeight/2).toFixed(1)+"px";
    }
  });
  $("#ceAlways").onclick=()=>{
    always=!always;
    const b=$("#ceAlways");
    b.classList.toggle("on",always);
    b.setAttribute("aria-pressed",always?"true":"false");
    b.title=t(always
      ? "Supporting category, relevant regardless of the intent"
      : "Make this a supporting category, relevant regardless of the intent");
  };
  $("#ceCancel").onclick=leave;
  const del=$("#ceDelete");
  if(del && canDelete) del.onclick=()=>{
    /* The same question the Library asks for the same act, word for word, so the two delete paths
       cannot drift into behaving differently. removeCategory keeps its own guard and its own
       toast - this button is the affordance, not the safety. Leaving rather than reopening
       afterwards: the screen you were editing no longer exists. */
    if(!ask(t("Delete this empty category?\n\nA Reset restores it from the catalog."))) return;
    if(removeCategory(k)) leave();
  };
  if($("#ceReset")) $("#ceReset").onclick=()=>{
    if(!ask(t("Discard your changes to this category?"))) return;
    resetCategory(k);
    drawPills(); render();
    drawIntentRail();
    toast("Category reset");
    openCategoryEditor(k, fromPill);   // redraws the fields, and the button goes with them
  };
  $("#ceSave").onclick=()=>{
    const nm=nameEl.value.trim();
    if(nm && nm!==origEn){
      pack.catLabels[k]=nm;
      if(pack.customCats && pack.customCats[k]) pack.customCats[k]=nm;
    }
    /* Emptying the box REMOVES the Polish name rather than storing "", which is what makes the
       field reversible: there is no other control for "actually, no Polish name". Stored only
       when it differs from what the catalog already says, so a pack does not accumulate copies
       of the catalog's own words. */
    const nmPl=namePlEl.value.trim();
    if(!nmPl || nmPl===CAT_LABELS_PL[k]) delete pack.catLabelsPl[k];
    else pack.catLabelsPl[k]=nmPl;
    pack.catIcons[k]=iconKey;
    pack.catColors[k]=slot;
    const roleMoved=always!==isAlwaysCat(k);
    if(roleMoved) setCatAlways(k,always);
    savePack(); applyCatsToGlobal();
    if(roleMoved) rebuildCards();          // the flag decides a card's band - see the Library's toggle
    drawPills(); render();
    refreshDialogChrome();            // the name may have changed, and Reset may have woken
    drawIntentRail();
    toast("Category updated");
    // Save keeps the screen; leave() belongs to the X.
    edMarkClean();
  };
  edWireNav((typeof catOrder!=="undefined"?catOrder:[]).filter(x=>CATS[x]), k,
            kk=>openCategoryEditor(kk,fromPill));
  drawPrev();
  if(nameEl.focus) nameEl.focus();
}
/* The example belongs in the PLACEHOLDER, not the label: it differs per language, and a shared
   label cannot say two things. The Polish pair names its CASE beside the example - the clause
   is substituted after z/ze and has to be written in the instrumental, which is the one
   mistake this tab invites. English has no case to name. */
const IE_HINT={
  clause:{en:"e.g. changing your flight", pl:"np. zmianą lotu (narzędnik po z/ze)"},
  topic: {en:"e.g. flight change",        pl:"np. zmiana lotu (mianownik)"},
  cmt:   {en:"e.g. flight changed",       pl:"np. zmieniono lot"}
};
function iePane(l,i,v,showComments){
  const id=f=>langFieldId("ie",f,l);
  const ph=f=>esc((IE_HINT[f]||{})[l]||"");
  const val=f=>esc(v[INTENT_FIELD_KEY[f][l]]||"");
  /* NAME FIRST. It is what every surface calls the intent - the panel, the dropdown and this
     dialog's own heading - so it is what you came to write. The clause is the sentence a card
     substitutes, which is a second thing about an intent rather than the first. */
  return langPane(l,i,
    '<div class="mf"><label>'+esc(t("Name"))+'</label>'
      +'<input id="'+id("topic")+'" value="'+val("topic")+'" autocomplete="off" placeholder="'+ph("topic")+'"></div>'
    +'<div class="mf"><label>'+esc(t("Clause"))+'</label>'
      +'<input id="'+id("clause")+'" value="'+val("clause")+'" autocomplete="off" placeholder="'+ph("clause")+'"></div>'
    +(showComments
      ? '<div class="mf"><label>Comment action</label>'
        +'<input id="'+id("cmt")+'" value="'+val("cmt")+'" autocomplete="off" placeholder="'+ph("cmt")+'"></div>'
      : ""));
}
/** @param fromManage when true, cancel/save/reset/delete returns to Library */
function openIntentEditor(idx, fromManage){
  const isNew=idx==null||idx===undefined||idx==="";
  let newId=null;
  const i=isNew?-1:+idx;
  const isCustom=!isNew&&intentIsCustom(i);
  const id=isNew?null:intentIdAt(i);
  const backToManage=!!fromManage;
  function doneIntentEditor(){
    if(backToManage) openManage();
    else closeModal();
  }
  /* `cat` is still read and written so a catalog round-trips unchanged, but nothing in the
     interface sets it any more and nothing reads it to decide a colour. */
  const val={};
  intentStoreKeys().forEach(k=>{ val[k]=""; });
  if(!isNew){
    /* Number.isInteger first: every comparison against NaN is false, so a non-numeric
       argument walked through a bare range check and opened an editor full of undefined. */
    if(!Number.isInteger(i)||i<0||i>=SW_EN.length){ toast("Intent not found"); return; }
    intentStoreKeys().forEach(k=>{ val[k]=SW_STORE[k][i]||""; });
  }
  /* Show the comment fields only when something can consume them - or when this intent already
     carries a value, so nobody's data is ever hidden from them. */
  /* Only ACTION is gated now. TOPIC is no longer a comment field - it is the subject of the
     chat as a noun phrase, useful anywhere {INTENT} is - so it shows unconditionally. */
  /* An EMPTY catalog demonstrates nothing, so it cannot be read as evidence that comments are
     unused - offer the field. Hiding it there made the feature unreachable: a comment action
     needs a card that uses the token, and the token is what the field is for. */
  const showComments=commentTokensInUse()||!!val.cmt||!(cards||[]).length;
  openDialog({
    back: fromManage?()=>doneIntentEditor():null,
    title: isNew?"New intent":"Edit intent",
    name: ()=>(!isNew&&i>-1)?intentNavName(i):"",
    resettable: ()=>!isNew && !isCustom && i>-1 && intentIsOverridden(i),
    resetOn: "Discard your edits and restore the catalog wording.",
    resetOff: isCustom||isNew ? "This is yours, so the catalog has no version to restore." : "Nothing to discard - this matches the catalog.",
    nav: isNew?"":edNavHtml(),
    body:
    langTabs()+CONTENT_LANGS.map((l,i)=>iePane(l,i,val,showComments)).join("")+
    /* No category picker. An intent's categories are not something to choose - they are what
       the cards linked to this intent happen to be filed under, computed wherever they are
       needed. The picker set a second, parallel value that could disagree with the cards, and
       the disagreement was invisible until a pill rang green over a column of grey cards. */
    /* TOPIC is the SUBJECT of the chat as a noun phrase. {INTENT} names an ACT and this
       names a THING, so any sentence that wants a thing reads better with it; comments are
       one use of it, not its definition. The examples below are invented, never lifted from
       a loaded catalog - engine text describes, it does not quote. */
    ""
    ,actions:
      /* Same shape as the card editor: the two "undo my work" buttons together at the left, away
         from Save. Delete is offered for BUILT-IN intents as well, which it was not - Manage
         could already delete one, so the editor refusing was the surface disagreeing with
         itself rather than a rule being enforced. */
      '<span class="mf-left">'+
        (isNew ? "" : '<button type="button" class="btn danger mf-del" id="ieDelete" '+
          'title="Delete this intent: a built-in one returns on Reset, one you made does not">Delete</button>')+
        '<button type="button" class="btn mf-reset" id="ieReset">Reset</button>'+
      '</span>'+
      '<button type="button" class="btn" id="ieCancel" title="Close without saving any change">Cancel</button>'+
      '<button type="button" class="btn primary" id="ieSave" title="Save this intent on this computer">Save</button>'
  });
  $("#ieCancel").onclick=doneIntentEditor;
  if($("#ieReset")) $("#ieReset").onclick=()=>{
    delete pack.intentOverrides[id];
    savePack(); refreshAfterIntents(); doneIntentEditor();
    toast("Intent restored to original");
  };
  if($("#ieDelete")) $("#ieDelete").onclick=()=>{
    /* removeIntent() owns the confirm, the built-in / custom split and the clean-up of every
       list an id can appear in; do not reimplement any of that here - a second copy has
       drifted before. */
    if(removeIntent(id)) doneIntentEditor();
  };
  $("#ieSave").onclick=()=>{
    const ieVal=(f,l)=>{ const el=$("#"+langFieldId("ie",f,l)); return el?el.value.trim():null; };
    /* A FIELD THE DIALOG DID NOT RENDER KEEPS WHAT WAS LOADED rather than being read as
       empty: the comment inputs are conditional, and reading a missing one as "" would quietly
       erase an intent's comment data the first time it was edited on a catalog whose cards
       happen not to use the tokens. The clause pair is always rendered, so it has nothing to
       fall back to. Field then language, which is the order the stored object has always had. */
    const next={};
    INTENT_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
      const k=INTENT_FIELD_KEY[f][l], typed=ieVal(f,l);
      next[k] = (typed!=null) ? typed : (f==="clause" ? "" : val[k]);
    }));
    const primary=CONTENT_LANGS[0], clauseKey=INTENT_FIELD_KEY.clause[primary];
    const nen=next[clauseKey];
    /* The tab that is missing its clause opens itself, which says which language is wanted
       better than a message naming it. */
    /* Only the PRIMARY clause is asked for. A language left empty falls back to it when the
       intent is read (see intentClause), which is what makes a second language additive. */
    if(edReportMissing(!nen ? [{msg:"Clause is required",
      mark:()=>markMissing($("#"+langFieldId("ie","clause",primary))),
      land:()=>langFocus(langFieldId("ie","clause",primary),primary)}] : [])) return;
    if(isNew){
      newId=uid("ui:");
      pack.intentCustom.push(Object.assign({id:newId},next));
    } else if(isCustom){
      const ix=(pack.intentCustom||[]).findIndex(x=>x.id===id);
      if(ix<0){ toast("Intent not found"); return; }
      pack.intentCustom[ix]=Object.assign({id:id},next);
    } else {
      pack.intentOverrides[id]=Object.assign({},next);
    }
    savePack(); refreshAfterIntents();
    toast(isNew?"Intent added":"Intent saved");
    /* As in the card editor: Save keeps the screen, and a new intent is re-opened on the
       index it landed at so a second Save edits it rather than adding another. */
    if(isNew){
      const at=intentIdxOfId(newId);
      if(at>-1) openIntentEditor(at);
      else doneIntentEditor();
    } else { edMarkClean(); refreshDialogChrome(); }   // renamed, and now resettable
  };
  edWireNav(displayIntentRows().map(r=>r.idx), idx, i=>openIntentEditor(i));
  // Same as the card editor: the tour owns the keyboard while it is running.
  setTimeout(()=>{
    if(tourActive()) return;
    const el=$("#"+langFieldId("ie","clause","en")); if(el) el.focus();
  },30);
}

export {
  openCategoryEditor,
  openIntentEditor
};
