import { cardFieldKey, cardStorageKeys, cardRequiredKeys, CARD_TEXT_FIELDS, CARD_FLAG_BOX, CARD_FLAGS, CARD_BOOL_FLAGS, paxVocOn, CARD_SHARED_FIELDS } from "./card-fields.js";
import { cardText, cardTitle, overrideAgainstBase } from "./card-model.js";
import { catSortIdx } from "./card-order.js";
import { CATS, CONTENT_LANGS } from "./content-model.js";
import { ICON_PLUS } from "./icons.js";
import { intentNavName } from "./intent-text.js";
import { langTabs, langPane, langFieldId, markMissing, edReportMissing, langFocus } from "./lang-tabs.js";
import { openManage, mgCardsIn } from "./manage.js";
import { nsSet } from "./storage.js";
import { drawPills } from "./tabs.js";
import { tourActive } from "./tour.js";
import { t, counted } from "./ui-lang.js";
import { BASE_CATS, pack } from "./pack.js";

/** The card editor's variant. Two differences from the intent picker, both because a card is
 *  not an intent: it lists EVERY category including supporting ones, since a card genuinely
 *  lives in one of those, and exactly one chip is on at a time. */
function cardCatPickHtml(selected){
  const sel=String(selected||"");
  const chips=Object.keys(CATS)
    .sort((a,b)=>catSortIdx(a)-catSortIdx(b))
    .map(k=>{
      const on=k===sel;
      return '<button type="button" class="cat-chip'+(on?" on":"")+'" data-k="'+esc(k)+'" aria-pressed="'+(on?"true":"false")+'">'+
        catIconSvg(k,"cat-ic")+esc(CATS[k])+'</button>';
    }).join("");
  /* "+" last, after the categories, exactly where the pill strip puts its own. Without it the
     only answer to "this card belongs somewhere that does not exist yet" was to abandon the
     dialog, make the category in the strip, and come back - and the edit in progress was the
     price. No data-k, so the radio logic below skips it; it is a control, not a category. */
  return chips+
    '<button type="button" class="cat-chip cat-chip-add" title="'+esc(t("Add a category"))+
    '" aria-label="'+esc(t("Add a category"))+'">'+ICON_PLUS+'</button>';
}
function readCardCatPick(){
  const on=$("#meCatPick") && $("#meCatPick").querySelector(".cat-chip.on[data-k]");
  return on ? on.getAttribute("data-k") : "";
}
/** `single` makes the picker a radio group: clicking a chip moves the selection instead of
 *  adding to it, and clicking the one already on is a no-op - there is no valid "no category"
 *  state for a card, so nothing may deselect the last chip. `box._onPick` fires only on a
 *  real change. */
function bindCatPick(box,single){
  if(!box||box._catPickBound) return;
  box._catPickBound=1;
  box.addEventListener("click",e=>{
    const addBtn=e.target.closest(".cat-chip-add");
    if(addBtn&&box.contains(addBtn)){ e.preventDefault(); startChipCatAdd(box,addBtn); return; }
    const chip=e.target.closest(".cat-chip[data-k]");
    if(!chip||!box.contains(chip)) return;
    e.preventDefault();
    if(single){
      if(chip.classList.contains("on")) return;
      box.querySelectorAll(".cat-chip.on[data-k]").forEach(c=>{
        c.classList.remove("on"); c.setAttribute("aria-pressed","false");
      });
      chip.classList.add("on"); chip.setAttribute("aria-pressed","true");
      if(typeof box._onPick==="function") box._onPick(chip.getAttribute("data-k"));
      return;
    }
    const on=chip.classList.toggle("on");
    chip.setAttribute("aria-pressed", on?"true":"false");
  });
}

/** Inline category creation - the pill strip's "+" contract: type, Enter accepts, Esc
 *  or an empty blur cancels. ACCEPTING SELECTS the new category - you are filing the
 *  card in front of you: the picker is redrawn from cardCatPickHtml(key), sorted with
 *  the selection moved in one step (safe: the click handler is delegated on the box).
 *  Single-select by construction; a multi-select picker would need its selection
 *  preserved across the redraw. STOPPROPAGATION IS NOT OPTIONAL: this input lives inside
 *  a modal - Escape would close the editor and lose the edit, and Enter can reach the
 *  dialog's default action. Both keys are handled and stopped. */
function startChipCatAdd(box,addEl){
  if(!box||box.querySelector(".cat-chip-new")) return;
  const wrap=document.createElement("span");
  wrap.className="cat-chip cat-chip-new";
  const inp=document.createElement("input");
  inp.type="text";
  inp.spellcheck=false;
  inp.autocomplete="off";
  inp.placeholder=t("New category");
  wrap.appendChild(inp);
  box.insertBefore(wrap,addEl);
  addEl.hidden=true;
  const finish=ok=>{
    const name=inp&&inp.value?inp.value.trim():"";
    wrap.remove();
    addEl.hidden=false;
    if(!ok||!name) return;
    const key=ensureCustomCat(name);
    box.innerHTML=cardCatPickHtml(key);
    if(typeof box._onPick==="function") box._onPick(key);
    rebuildCards();          // the strip behind the dialog has to gain the pill too
    toast("Category added");
  };
  inp.focus();
  /* Re-queried rather than using the captured addEl: accepting redraws the picker, so the node
     the closure holds is detached by then. On the cancel path nothing redraws and the query
     finds the same button back again. */
  const refocus=()=>{ const a=box.querySelector(".cat-chip-add"); if(a) a.focus(); };
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); finish(true); refocus(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(false); refocus(); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(!!(inp.value&&inp.value.trim())); },0); };
}

function intentPickHtml(selectedIds, preferCat){
  const sel=new Set((selectedIds||[]).map(String));
  // Prefer intents whose primary category matches the card category, then the rest.
  const order=intentOrder.filter(i=>!isIntentHiddenIdx(i)).slice().sort((a,b)=>{
    const am=preferCat&&intentHasPrimaryCat(a,preferCat)?0:1;
    const bm=preferCat&&intentHasPrimaryCat(b,preferCat)?0:1;
    if(am!==bm) return am-bm;
    return intentOrder.indexOf(a)-intentOrder.indexOf(b);
  });
  const rows=order.map(i=>{
    const id=intentIdAt(i);
    const on=sel.has(id);
    const label=intentNavName(i)||("(empty)");
    const cats=primaryCatLabel(i);
    return '<label class="'+(on?"on":"")+'">'+
      '<input type="checkbox" value="'+esc(id)+'"'+(on?" checked":"")+'>'+
      '<span class="ip-body"><span class="ip-t">'+esc(label)+'</span>'+
      '<span class="ip-cat">'+esc(cats)+'</span></span></label>';
  }).join("");
  return rows || '<div class="manage-empty">'+esc(t("No intents available."))+'</div>';
}
function readMeIntentIds(){
  return Array.from(document.querySelectorAll("#meIntents input[type=checkbox]:checked"))
    .map(el=>el.value).filter(Boolean);
}
function syncMeIntentPick(){
  const box=$("#meIntents");
  if(!box) return;
  box.querySelectorAll("label").forEach(lab=>{
    const cb=lab.querySelector("input");
    lab.classList.toggle("on", !!(cb&&cb.checked));
  });
  const ids=readMeIntentIds();
  /* The fold is closed by default, so the summary is the only way to see what a card links to
     without opening it - and a NAME says more than a number. One or two fit: the row holds
     about 64 characters against a median topic of 21, so a pair of typical ones sits inside
     it. Three would not, and would not help either: naming two of five arbitrarily tells you
     less than counting all five. Falls back to the count if a link outlives its intent. */
  const sum=$("#meIntentSum");
  if(sum){
    const count=counted(ids.length,"{N} intent","{N} intents");
    let txt=t("none");
    if(ids.length){
      const named=ids.length<=2
        ? ids.map(id=>{ const i=intentIdxOfId(id); return i>-1?intentNavName(i):""; }).filter(Boolean)
        : [];
      txt=named.length===ids.length ? named.join(" · ") : count;
    }
    sum.textContent=txt;
  }
}
function refreshMeIntentList(keepChecked){
  const box=$("#meIntents");
  if(!box) return;
  const selected=keepChecked||readMeIntentIds();
  const c=readCardCatPick();
  box.innerHTML=intentPickHtml(selected, c);
  syncMeIntentPick();
}
function storeIntentIds(ids){
  return (ids||[]).map(id=>{
    if(String(id).indexOf("i:")===0){
      const n=+String(id).slice(2);
      if(Number.isInteger(n)&&n>=0&&n<BASE_N) return n;
    }
    return id;
  });
}

/* ONE PANEL PER CONTENT LANGUAGE, rather than a row of boxes per field. Four fields times three
   languages is twelve boxes on one screen; four fields behind three tabs is four. The strip is
   .seg, so a third language costs a data-n and nothing else. */
function meFieldId(field,l){ return langFieldId("me",field,l); }
function meLangPanel(m,l,i){
  const id=f=>meFieldId(f,l), v=f=>esc(cardText(m,f,l));
  /* Each placeholder says what its LABEL does not: what the box is for, what the text becomes,
     and who reads it. A placeholder that repeats its label is decoration. */
  return langPane(l,i,""
    +'<div class="mf"><label>Title</label><input id="'+id("t")+'" value="'+v("t")+'"'
      +' autocomplete="off" placeholder="'+esc(t("a short name you will recognise"))+'"></div>'
    +'<div class="mf"><label>'+esc(t("Macro"))+'</label>'
    +'<textarea id="'+id("body")+'" spellcheck="true"'
      +' placeholder="'+esc(t("the text the customer receives"))+'">'+v("body")+'</textarea></div>'
    +'<div class="mf"><label>Note</label>'
      +'<input id="'+id("note")+'" value="'+v("note")+'"'
      +' autocomplete="off" placeholder="'+esc(t("guidance for you, never sent"))+'"></div>');
}
/* ITS OWN SECTION, not a fourth field under the tabs: keywords are one bag for the card rather
   than one per language, and they were the only thing in Content that did not answer to the tab
   above them - which the language sweep made plain, everything moving but this. No label and no
   note: the section heading is the only name the box needs. */
function meSharedFields(m){
  return '<div class="mf mf-shared">'
    +'<input id="me_k" value="'+esc(String(m&&m.k||""))+'" autocomplete="off" placeholder="extra words for search"></div>';
}
/* THE SAME RULING AS THE LINKED INTENTS FOLD, and for the same reason: the words themselves say
   more than a count, but an arbitrary few of many say less than counting all of them. The row
   holds about 64 characters, so most bags show whole and only long ones fall back to a tally. */
function meKeysSummary(m){
  const raw=String((m&&m.k)||"").trim().replace(/\s+/g," ");
  if(!raw) return t("none");
  if(raw.length<=64) return raw;
  const n=raw.split(" ").length;
  return n===1 ? t("1 word") : t("{N} words").replace("{N}",n);
}
function meFocusField(field,l){ langFocus(meFieldId(field,l),l); }
/* THE SAME LANDING AS A MISSING FIELD, for the one required thing that is not a field: open
   the fold hiding it, then mark it until a chip is chosen. */
function meFocusCat(){
  const box=$("#meCatPick");
  if(!box) return;
  const fold=box.closest("details.mf-fold");
  if(fold && !fold.open) fold.open=true;      // its own toggle handler shuts the siblings
  markMissing(box,"click");
}
/** What a closed fold says about itself, so shutting one never hides that something is set. */
/* The pin is read in two places that MUST agree. They did not, which is how the summary
   came to be the only part of the dialog that could not see it. */
function readMeLockLang(){
  const box=$("#meLockLang");
  if(!box||!box.checked) return "";
  return ((($("#meLockSeg .on")||{}).dataset||{}).v)||"en";
}
/* The card's NAME is in the heading, so repeating it here said nothing twice. What a shut
   fold genuinely hides is whether a language is missing, which is invisible everywhere else
   and is the one thing worth catching while walking a catalog. */
function meLangSummary(m){
  const have=CONTENT_LANGS.filter(l=>String((m&&m[cardFieldKey("body",l)])||"").trim());
  if(!have.length) return t("no text yet");
  const names=have.map(l=>l.toUpperCase()).join(" + ");
  return have.length===CONTENT_LANGS.length ? names : t("{L} only").replace("{L}",names);
}
function meAdvSummary(m){
  const on=[];
  if(m&&m.alt) on.push(t(m.seq?"steps":"alt"));
  if(m&&m.firstOnly) on.push(t("first name"));
  if(paxVocOn(m)) on.push(t("vocative"));
  if(m&&m.allIntents) on.push(t("every intent"));
  if(m&&m.intentTop) on.push(t("top"));
  /* The pin is a toggle like the rest and was the only one leaving no trace. It carries a
     VALUE, so the summary names the language rather than just reporting that one is set. */
  if(m&&(m.lockLang==="en"||m.lockLang==="pl"))
    on.push(t("{L} only").replace("{L}",m.lockLang.toUpperCase()));
  return on.length?on.join(" \u00b7 "):t("nothing set");
}
/** presetCat is the category a NEW card lands in - from the "+" on a category row in Manage,
 *  or from the add-card at the end of a filtered list. A new card always arrives with a
 *  category, so this editor does not offer a picker for one; an existing card keeps its
 *  select, because that is the only way to move a card between categories.
 *  fromManage returns to Manage when the editor closes, the same contract as the intent editor. */
function openCardEditor(id, presetCat, fromManage){
  const isNew=!id;
  let savedId=id;
  const existing=id?findCard(id):null;
  const base=id?baseCard(id):null;
  // Imported catalog entries may keep old u: ids but live in BASE_M - treat as built-in
  const isCustom=!base && (!!(existing&&existing._custom) || (id&&String(id).indexOf("u:")===0));
  /* EMPTY when nothing sent one, rather than the first category: a card silently filed under
     whatever happens to sort first is worse than a Save that asks. The picker below shows it. */
  const startCat=(presetCat && CATS[presetCat]) ? presetCat : "";
  const m=existing||{t:"",c:startCat,en:"",pl:"",note:"",k:"",alt:0,firstOnly:0,intents:[]};
  const linked=normalizeCardIntents(m);
  const backToManage=!!fromManage;
  function doneCardEditor(){
    if(backToManage) openManage();
    else closeModal();
  }
  openDialog({
    /* IN THE CONFIG, not set before the call: openDialog assigns the back handler as
       its first line, so setting one beforehand is overwritten by the absence of one
       here - which is how Escape came to close outright where Cancel went back. */
    back: backToManage?doneCardEditor:null,
    title: isNew?"New card":"Edit card",
    /* Read through savedId so a card saved for the first time names itself at once. */
    name: ()=>{ const c=savedId?findCard(savedId):null; return c?cardTitle(c):""; },
    resettable: ()=>!!(baseCard(savedId) && pack.overrides[savedId]),
    resetOn: "Discard your edits and restore the catalog wording.",
    resetOff: isCustom||isNew ? "This is yours, so the catalog has no version to restore." : "Nothing to discard - this matches the catalog.",
    // A new card has no neighbours yet.
    nav: isNew?"":edNavHtml(),
    body:
    /* The card itself - title, both languages, note and keywords - in one fold at the top, open
       by default because it is what you came here for. Folding it is what makes the dialog short
       enough to see whole: with it shut, Category, Linked intents and Advanced all fit on screen
       at once. Its summary is the title, so a closed fold still says which card this is. */
    mfSec({key:"text", cls:"mf-main", open:true, label:"Content",
      sum:esc(meLangSummary(m)), sumId:"meTextSum", sumSkip:true,
      body:
      langTabs()+CONTENT_LANGS.map((l,i)=>meLangPanel(m,l,i)).join("")})+
    mfSec({key:"keys", label:"Keywords",
      sum:esc(meKeysSummary(m)), sumId:"meKeysSum", sumSkip:true,
      body:meSharedFields(m)})+
    /* Category and Linked intents open CLOSED. They are the two tallest blocks in the dialog and
       between them they pushed the macro text - the thing you almost always came here to edit -
       below the fold. Each summary carries what is inside it, so collapsed does not mean unknown:
       you can read the category and the number of links without opening anything. They keep their
       position above the text, because that is the reading order of a card. */
    /* A NEW CARD GETS THE PICKER TOO. Every other card treats its category as a field; only
       the one being made had it decided by the door, which stopped being one door. */
    mfSec({key:"cat", label:"Category",
      sum:(m.c&&CATS[m.c]) ? catIconSvg(m.c,"cat-ic")+esc(CATS[m.c]) : esc(t("none")),
      sumId:"meCatSum", sumSkip:true,
      body:
      '<div class="cat-pick" id="meCatPick">'+cardCatPickHtml(m.c)+'</div>'})+
    mfSec({key:"intents", label:"Linked intents",
      sum:"", sumId:"meIntentSum",
      body:'<div class="intent-pick" id="meIntents">'+intentPickHtml(linked, m.c)+'</div>'})+

    /* The flags fold under "Advanced" - the least-touched part by a distance, and open
       they pushed the buttons below the fold. Favourite and Hidden were here briefly and
       removed: they are not edits - one click on the card or in Manage - and a toggle
       behind a Save button is not a toggle. Delete stays: destructive belongs where you
       can see the whole card before doing it. */
    mfSec({key:"adv", label:"Advanced",
      sum:esc(meAdvSummary(m)), sumId:"meAdvSum",
      body:(function(){
        /* `rows`, not `t`: this list is built out of t() calls. */
        const rows=[];
        /* The label names a token, so it draws the token the way a card does rather than
           spelling it in braces. Escape first, substitute after: the tag is markup and the
           label is not, and {PAX} survives escaping unchanged. */
        const paxTag='<span class="fillmiss">PAX</span>';
        /* And the green tag as a card wears it, so a flag about intents names the mark rather
           than a word for it. Its own title glosses the abbreviation. */
        const intTag='<span class="cbadge hit" title="'+esc(t("Intent"))+'">'+esc(t("int"))+'</span>';
        const box=(id,on,dis,tip,label)=>rows.push('<label title="'+esc(t(tip))+'">'
          +'<input type="checkbox" id="'+id+'"'+(on?" checked":"")+(dis?" disabled":"")+'> '
          +esc(t(label)).split("{PAX}").join(paxTag).split("{INT}").join(intTag)+'</label>');
        box("meAlt",m.alt,false,"Blank lines split the text into separately copyable alternatives.",
            "Split by blank lines into alternatives");
        box("meSeq",m.seq,!m.alt,"Numbers the alternatives as ordered steps.",
            "Ordered sequence (STEP badges)");
        box("meFirst",m.firstOnly,false,"{PAX} fills the first name even when the chat gives the full name.",
            "{PAX} as first name only");
        box("meVoc",paxVocOn(m),false,
            "Polish only: declines the name into the vocative, the form Polish uses to address someone. Only the first name declines; a surname is left as written.",
            "{PAX} in the vocative");
        box("meAllIntents",m.allIntents,false,
            "Rings green under every intent - for text that always applies, like an opener.",
            "Linked to every {INT}");
        box("meIntentTop",m.intentTop,false,
            "Sorts above the other linked cards when an intent is picked.",
            "Top of the {INT} group");
        /* THE LANGUAGE PIN. Off by default, and off means "follow the EN/PL toggle", which is
           what every card did before this existed. On, the card shows that version and resolves
           every token in it whatever the toggle says - which is what an internal comment wants,
           since a comment is English on every desk. The switcher greys out while the pin is off
           rather than disappearing: a control that vanishes leaves no clue the setting exists. */
        const pinned=(m.lockLang==="en"||m.lockLang==="pl") ? m.lockLang : "";
        const pin='<div class="mf-pin'+(pinned?"":" off")+'" id="meLockRow">'
          +'<label title="'+esc(t("The card keeps this language whatever the EN|PL toggle says, tokens included"))+'">'
          +'<input type="checkbox" id="meLockLang"'+(pinned?" checked":"")+'> '
          +esc(t("Always one language"))+'</label>'
          +'<div class="seg mf-pin-seg" id="meLockSeg">'
          +'<button type="button" data-v="en"'+((pinned||"en")==="en"?' class="on"':'')+'>EN</button>'
          +'<button type="button" data-v="pl"'+(pinned==="pl"?' class="on"':'')+'>PL</button>'
          +'</div></div>';
        /* The pin is the seventh cell, so four rows put alternatives, steps and the two
           {PAX} boxes down the left, and the two intent boxes and the pin down the right. */
        const cells=rows.concat([pin]);
        return '<div class="mf-cols" style="grid-template-rows:repeat('
          +Math.ceil(cells.length/2)+',auto)">'+cells.join("")+'</div>';
      })()})
    ,actions:
      // Pushed to the far left by .mf-del, away from Save - a destructive action should not sit
      // under the thumb that is heading for the primary button.
      /* Delete and Reset are both "undo my work", so they sit together at the left, away from
         Save. Reset only exists when there is something to reset, which is why it is the one
         button whose absence must not move the others - .mf-left holds the pair. */
      '<span class="mf-left">'+
        (isNew ? "" : '<button type="button" class="btn danger mf-del" id="meDelete" '+
          'title="Delete this card: a built-in one returns on Reset, one you made does not">Delete</button>')+
        '<button type="button" class="btn mf-reset" id="meReset">Reset</button>'+
      '</span>'+
      '<button type="button" class="btn" id="meCancel" title="Close without saving any change">Cancel</button>'+
      '<button type="button" class="btn primary" id="meSave" title="Save this card on this computer">Save</button>'
  });
  $("#meCancel").onclick=doneCardEditor;
  function syncMeSeqEnabled(){
    const altEl=$("#meAlt"), seqEl=$("#meSeq");
    if(!altEl||!seqEl) return;
    if(!altEl.checked){ seqEl.checked=false; seqEl.disabled=true; }
    else seqEl.disabled=false;
  }
  if($("#meAlt")) $("#meAlt").onchange=syncMeSeqEnabled;
  syncMeSeqEnabled();
  /* A summary that goes stale is worse than none: type a note, fold the section, and it would
     still read "none". Recomputed from the live fields on every edit. */
  (function syncMeFoldSummaries(){
    const mePrimary=CONTENT_LANGS[0];
    const read=()=>{
      const cur={note:($("#"+meFieldId("note",mePrimary))||{}).value||"",
        k:($("#me_k")||{}).value||"", lockLang:readMeLockLang()};
      CARD_FLAGS.forEach(f=>{ const el=$("#"+CARD_FLAG_BOX[f]); cur[f]=el&&el.checked?1:0; });
      return cur;
    };
    const upd=()=>{
      const cur=read();
      const d=$("#meTextSum");
      if(d){
        const live={};
        CONTENT_LANGS.forEach(l=>{ const el=$("#"+meFieldId("body",l));
          live[cardFieldKey("body",l)]=el?el.value:""; });
        d.textContent=meLangSummary(live);
      }
      const a=$("#meAdvSum"); if(a) a.textContent=meAdvSummary(cur);
      const k=$("#meKeysSum"); if(k) k.textContent=meKeysSummary(cur);
    };
    // every language's boxes, so the summary follows whichever tab is being typed in
    document.querySelectorAll(".lang-pane input, .lang-pane textarea")
      .forEach(el=>el.addEventListener("input",upd));
    // the keyword box sits outside every pane now, so it needs naming here
    (function(){ const kb=$("#me_k"); if(kb) kb.addEventListener("input",upd); })();
    CARD_FLAGS.forEach(f=>{
      const el=$("#"+CARD_FLAG_BOX[f]); if(el) el.addEventListener("change",upd);
    });
    /* The pin greys its own switcher, and the switcher moves its own class - the same
       "the class moves, the element stays" rule the Settings segs follow. */
    const pinBox=$("#meLockLang"), pinRow=$("#meLockRow"), pinSeg=$("#meLockSeg");
    if(pinBox && pinRow){
      pinBox.addEventListener("change",()=>{ pinRow.classList.toggle("off",!pinBox.checked); upd(); });
    }
    if(pinSeg){
      pinSeg.addEventListener("click",e=>{
        const b=e.target.closest("button[data-v]"); if(!b||b.classList.contains("on")) return;
        e.preventDefault();
        pinSeg.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
        b.classList.add("on"); upd();
      });
    }
    upd();
  })();
  if($("#meDelete")) $("#meDelete").onclick=()=>{
    // removeCard() owns the confirm and the built-in / custom split, so this cannot drift from
    // what the same action does in Manage.
    // doneCardEditor() already returns to Manage when the editor was opened from it.
    if(removeCard(id)){ render(); drawPills(); doneCardEditor(); }
  };
  $("#meIntents").onclick=e=>{
    if(e.target&&e.target.matches&&e.target.matches("input[type=checkbox]")) syncMeIntentPick();
  };
  /* Only present when editing - a new card's category is fixed by where you added it.
     Creating INTENTS from inside this dialog stays out: an intent invented mid-edit is
     vocabulary, reached in a click from the main UI or Manage. A category wanted mid-edit
     is a statement about THIS card, and leaving to make one meant losing the edit - so the
     "+" chip is here, the same control as the strip's, wired to the same ensureCustomCat. */
  const meCatBox=$("#meCatPick");
  if(meCatBox){
    // Moving the card re-scopes the intent list, so rebuild it on a real change only
    meCatBox._onPick=k=>{
      const sum=$("#meCatSum"); if(sum) sum.innerHTML=catIconSvg(k,"cat-ic")+esc(CATS[k]||k||"");
      refreshMeIntentList(readMeIntentIds());
    };
    bindCatPick(meCatBox, true);
  }
  /* Reuses Manage's height animation wholesale - same modal card, same problem. mgPinCard()
     freezes the current height on the way in so the <details> toggle has something to grow from,
     and the toggle handler animates to the new one. */
  wireFolds(modalCard,"details.mf-fold","details.mf-fold");
  syncMeIntentPick();
  if($("#meReset")) $("#meReset").onclick=()=>{
    delete pack.overrides[id];
    savePack(); rebuildCards(); doneCardEditor();
    toast(t("Restored original -")+" "+(base.t||id));
  };
  $("#meSave").onclick=()=>{
    /* Every language's text straight off the table, so a new language adds no line here. */
    const text={};
    CARD_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
      const el=$("#"+meFieldId(f,l)), key=cardFieldKey(f,l);
      if(el&&key) text[key]=String(el.value||"").trim();
    }));
    CARD_SHARED_FIELDS.forEach(f=>{
      const el=$("#me_"+f);
      if(el) text[f]=String(el.value||"").trim();
    });
    const primary=CONTENT_LANGS[0];
    const t=text[cardFieldKey("t",primary)]||"";
    // No picker on a new card - the category is whichever one you added it from
    const c=readCardCatPick()||startCat;
    const intentIds=readMeIntentIds();
    const alt=$("#meAlt").checked?1:0;
    const seq=(alt && $("#meSeq")&&$("#meSeq").checked)?1:0;
    const firstOnly=$("#meFirst").checked?1:0;
    const paxVoc=$("#meVoc").checked?1:0;
    const allIntents=$("#meAllIntents").checked?1:0;
    const intentTop=$("#meIntentTop").checked?1:0;
    const lockLang=readMeLockLang();
    /* ONLY THE PRIMARY IS REQUIRED. A missing translation falls back to it when the card is
       read (see cardLang), so demanding both taxed every card for a language the desk may not
       write. In reading order, so the dialog lands on the topmost gap. */
    const need=[];
    const fld=(field,msg)=>({msg:msg,
      mark:()=>markMissing($("#"+meFieldId(field,primary))),
      land:()=>meFocusField(field,primary)});
    if(!t) need.push(fld("t","Title is required"));
    if(!text[cardFieldKey("body",primary)]) need.push(fld("body","Macro text is required"));
    if(!c||!CATS[c]) need.push({msg:"Pick a category",
      mark:()=>markMissing($("#meCatPick"),"click"), land:meFocusCat});
    if(edReportMissing(need)) return;
    // Linking is enough: categoriesForIntent() unions this card's category onto each intent.
    const intentsStored=storeIntentIds(intentIds);
    if(isNew || isCustom){
      /* A custom entry is REPLACED wholesale, so every flag has to be written here. allIntents
         and intentTop were missing, which silently stripped them from any custom card that had
         them the first time it was edited. Built-ins never had the bug: their override is
         partial and Object.assign keeps whatever the base declares. */
      const entry=Object.assign({id:isNew?(savedId=uid("u:")):(id),c},text,
        {alt,seq,firstOnly,paxVoc,allIntents,intentTop,lockLang,intents:intentsStored});
      cardStorageKeys().forEach(f=>{
        if(!entry[f] && cardRequiredKeys().indexOf(f)<0) delete entry[f];
      });
      /* paxVoc is deliberately absent from this sweep - see CARD_BOOL_FLAGS. */
      CARD_BOOL_FLAGS.forEach(f=>{ if(!entry[f]) delete entry[f]; });
      if(!entry.lockLang) delete entry.lockLang;
      if(!entry.intents||!entry.intents.length) delete entry.intents;
      if(isNew) pack.custom.push(entry);
      else {
        const ix=pack.custom.findIndex(x=>x.id===id);
        if(ix>-1) pack.custom[ix]=entry; else pack.custom.push(entry);
      }
    } else {
      const full=Object.assign({c},text,{intents:intentsStored,
        alt:alt?1:0, seq:seq?1:0, firstOnly:firstOnly?1:0, paxVoc, allIntents, intentTop, lockLang});
      const o=overrideAgainstBase(baseCard(id), full);
      // Nothing differs from the catalog any more - drop the override so the badge clears too
      if(Object.keys(o).length) pack.overrides[id]=o; else delete pack.overrides[id];
    }
    /* Saving no longer closes - that is the X's job alone. A NEW card is re-opened on
       itself, or a second Save would add a second copy of it. edMarkClean is NOT deferred:
       it is cheap, and leaving it a frame behind opens a window where walking to the next
       card asks about changes that are already saved. */
    if(!isNew) edMarkClean();
    afterPaint(()=>{
      savePack(); rebuildCards();
      toast(isNew?"Card added":"Card saved");
      if(isNew) openCardEditor(savedId,null,fromManage);
      else refreshDialogChrome();   // the title may have changed, and Reset may have woken
    });
  };
  /* WHICHEVER LIST YOU CAME FROM. The main screen can show every card at once, so there the
     arrows walk what is on screen - filtered, searched, sorted. The LIBRARY has no All: it
     only ever shows one category at a time, so there they walk that category and stop at
     its edge. Reading the main list from the Library also disabled both arrows outright
     whenever a filter excluded the card being edited. */
  edWireNav((fromManage ? mgCardsIn(m.c) : shown).map(x=>x&&x.id).filter(Boolean), id,
            nid=>openCardEditor(nid,null,fromManage));
  // Guarded: the dialog can be gone by the time this fires, and an unguarded .focus() on the
  // missing field throws an uncaught TypeError. Same for the intent editor below.
  /* Not during the tour. The tour drives its own buttons from real DOM focus - that is how the
     arrow keys move between Skip, Back and Next - so a dialog grabbing a text field takes the
     keyboard away from it, and the caret landing in Title also reads as "start typing here",
     which is the opposite of what a showcase step is asking for. */
  setTimeout(()=>{
    if(tourActive()) return;
    const el=$("#"+meFieldId("t",CONTENT_LANGS[0])); if(el) el.focus();
  },30);
}

function ensureCustomCat(name){
  applyCatsToGlobal();
  // reuse existing label match
  const hit=Object.keys(CATS).find(k=>CATS[k].toLowerCase()===name.toLowerCase());
  if(hit) return hit;
  let key=slugCat(name);
  if(CATS[key]||BASE_CATS[key]||(pack.customCats&&pack.customCats[key])) key=uid("uc_");
  pack.customCats[key]=name;
  pack.catLabels[key]=name;
  savePack();
  applyCatsToGlobal();
  if(catOrder.indexOf(key)<0) catOrder.push(key);
  nsSet("CatOrder",JSON.stringify(catOrder));
  return key;
}

/** Toggle: hidden entries stay on the list, so the same button undoes it.
 *  Hiding also drops the favourite - the two states are mutually exclusive, since a favourite
 *  is something you want surfaced and hidden is the opposite. The star does not come back on
 *  un-hiding: it was removed deliberately, and silently restoring it would be a surprise.
 *  Any text override is left alone - hiding is about visibility, not about discarding work. */
function hideCard(id){
  if(!id) return;
  if(!Array.isArray(pack.hidden)) pack.hidden=[];
  const at=pack.hidden.indexOf(id);
  const nowHidden=at<0;
  if(at>-1){ pack.hidden.splice(at,1); toast("Shown again"); }
  else {
    pack.hidden.push(id);
    let lostStar=false;
    if(Array.isArray(pack.favourites)){
      const f=pack.favourites.indexOf(id);
      if(f>-1){ pack.favourites.splice(f,1); lostStar=true; }
    }
    toast(lostStar ? "Put away - greyed at the foot of its category, unfavourited"
                   : "Put away - greyed at the foot of its category");
  }
  savePack();
  /* Flip the flag in place: rebuildCards() re-derives everything for a change that
     alters none of it, and its cost lands inside the FLIP's own window - the first third
     of the journey was over before anything painted, which is what made hiding less
     smooth than starring. Symmetric with toggleFavourite() on purpose: same row, same
     move, same animation. Read from `cards`, never findCard(): that falls back to
     BASE_M, and a display flag on a catalog entry outlives the pack that owns it. */
  const m=(cards||[]).find(x=>x&&x.id===id);
  if(m){ if(nowHidden) m._hidden=1; else delete m._hidden; }
  /* The pills and the vocabulary both read what is put away: All loses the card from its
     count, its own category keeps it, and it lends no words to search. */
  recountMacros();
  syncFavouritesMeta();   // hiding strips the star
  drawPills();
  render();
}

function deleteCustomCard(id){
  if(!id) return;
  if(!ask("Delete this custom card permanently?")) return;
  pack.custom=(pack.custom||[]).filter(m=>m.id!==id);
  pack.hidden=(pack.hidden||[]).filter(x=>x!==id);
  savePack(); rebuildCards();
  toast("Custom card deleted");
}

export {
  openCardEditor,
  ensureCustomCat,
  hideCard,
  deleteCustomCard
};
