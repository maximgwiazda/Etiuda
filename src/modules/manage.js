import { ensureCustomCat, openCardEditor, hideCard } from "./card-editor.js";
import { baseCard, cardCommits, cardTitle, findCard, cardLang, cardText, parts } from "./card-model.js";
import { stampHtml } from "./card-chain.js";
import { movedCardIds, cardOrderIdx, catSortIdx, ensureCardOrder, cardOrderTouched, moveCardWithin } from "./card-order.js";
import { isAlwaysCat, setCatAlways } from "./cat-roles.js";
import { importCatalogHere, catalogFileName } from "./catalog-file.js";
import { CATS, CONTENT_LANGS } from "./content-model.js";
import { catToggle, closeModal, dressDialogInputs, modalOpen, openCover, wireFolds } from "./dialog.js";
import { markCutText } from "./cut-text.js";
import { openIntentEditor, openCategoryEditor } from "./editors.js";
import { ICON_CHEVRON_R, ICON_EYE_SHUT, ICON_EYE_OPEN, ICON_EDIT, ICON_TRASH, ICON_STAR_ON, ICON_STAR_OFF, ICON_PLUS, ICON_ROLE_ALWAYS } from "./icons.js";
import { intentNavName, fill, escFilled } from "./intent-text.js";
import { askClearLocal, bringBackCleared, clearedHeld } from "./local-memory.js";
import { mgReduceMotion, mgPinCard, E_EASE } from "./motion.js";
import { statsRecentUse } from "./desk-stats.js";
import { drawIntentRail } from "./rail-list.js";
import { normWhoList, WHO_BASE } from "./stock.js";
import { lySet } from "./storage.js";
import { drawPills } from "./tabs.js";
import { t, catalogCountsLine, counted, toast, translateTree, offerUndo } from "./ui-lang.js";
import { isFavourite, isIntentFavourite, pack, whoOptions, savePack } from "./pack.js";
import { removeCard, removeIntent, setIntentHidden, syncIntentOrder, toggleFavourite, toggleIntentFavourite } from "./favourites.js";
import { primaryCatKeys, intentCardCounts, normalizeCardIntents } from "./card-intent.js";
import { catMarkHtml } from "./cat-identity.js";
import { intentIdAt, intentIdxFromId, intentIsCustom, intentIsOverridden, intentOrder, isIntentHiddenIdx } from "./intent-id.js";
import { applyCatsToGlobal, removeCategory } from "./cat-set.js";
import { esc } from "./esc.js";
import { syncRoleDrum } from "./role-drum.js";
import { $, roleSel } from "./dom.js";
import { macroBlockCount, recountMacros, totalMacroCount } from "./card-counts.js";
import { rebuildCards } from "./rebuild.js";
import { render } from "./render.js";
import { paintCatalogList } from "./catalog-offer.js";
import { eHasHistory, openHistory } from "./catalog-history.js";
import { eCatalogFolder, eCatalogFolderShort, eChooseCatalogFolder, eHost, eOpenCatalogFolder } from "./host.js";
import { cards, catOrder, mgOpen, cardCounts } from "./app-state.js";
import { joinDoorButton, openJoinPaste, teamLeads } from "./team-join.js";
import { openScreenTab, registerScreen, screenOn } from "./screen-tabs.js";
import { lmIcon } from "./lm-icon.js";
import { openMaintenance } from "./maintenance.js";
import { formatActionChord } from "./shortcuts.js";


/* Search shows the summary and hides the bar; otherwise the bar shows. The path's id stays
   on the bar, once. The summary copy is the same control without that id. */
function catalogFolderTail(withId){
  const pathId=withId?' id="mgCatFolderPath"':'';
  const editId=withId?' id="mgCatFolder"':'';
  return '<span class="ec-where">'
    +'<code class="open-folder"'+pathId+' role="button" tabindex="0"'
    +' title="'+esc(eCatalogFolder())+'"'
    +' aria-label="'+esc(t("Open this folder"))+': '+esc(eCatalogFolder())+'">'
    +esc(eCatalogFolderShort())+'</code>'
    +'<button type="button" class="btn icbtn ec-where-edit"'+editId+' title="'
    +esc(t("Change folder…"))+'" aria-label="'+esc(t("Change folder…"))+'">'
    +ICON_EDIT+'</button>'
    +'</span>';
}
/** One collapsible Manage section. `body` is trusted markup; `title` is not. */
/* `tail` is TRUSTED markup riding at the right of the title line, where a count would sit:
   the one section whose value is not a number puts its folder there instead. */
function mgSec(key,title,body,count,tail){
  return '<details class="manage-sec" data-mg="'+esc(key)+'"'+(mgOpen.has(key)?" open":"")+'>'+
    '<summary><span class="acc-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span><h3>'+esc(title)+'</h3>'+
      (count!=null?'<span class="mg-count">'+esc(String(count))+'</span>':'')+(tail||"")+
    '</summary>'+
    '<div class="manage-secbody">'+body+'</div></details>';
}

/* What a row can be dragged past. Manage always groups by category, so its band is
   category + favourite + hidden regardless of whether an intent happens to be selected -
   unlike the card list, whose band collapses to relevance rank while an intent is on. */
function mgCardBand(m){
  return String(m&&m.c||"")+"|"+(isFavourite(m&&m.id)?"1":"0")+"|"+((m&&m._hidden)?"1":"0");
}

/* A sentence with a number in it is out of the dialog sweep's reach, so it is put together here. */
function mgUsesTip(n){
  return eHost() ? counted(n,"Copied {N} time on this computer","Copied {N} times on this computer")
    : counted(n,"Copied {N} time in this browser","Copied {N} times in this browser");
}

let mgSent30Map = null;
let mgSortCol = null;
let mgSortDir = null;

function stripLeadingGreetingAndPax(s){
  let str = String(s || "").trim();
  return str.replace(/^(?:\{(?:GREET|PAX)(?::[^{}]*)?\}[,\s.!?\-–—]*\s*)+/i, "");
}

function mgCardOpensWithText(m){
  const l = cardLang(m);
  const ps = parts(m, l);
  const raw = (ps && ps[0]) || "";
  if(!raw) return "";
  const stripped = stripLeadingGreetingAndPax(raw);
  return stripped.replace(/\s+/g, " ").replace(/\{([A-Z][A-Z0-9]*)(?::([^{}]*))?\}/g, "$1").trim();
}

function mgCardOpensWithHtml(m){
  const l = cardLang(m);
  const ps = parts(m, l);
  const raw = (ps && ps[0]) || "";
  if(!raw) return "";
  const stripped = stripLeadingGreetingAndPax(raw);
  const escStr = esc(stripped.replace(/\s+/g, " ").trim());
  return escStr.replace(/\{([A-Z][A-Z0-9]*)(?::([^{}]*))?\}/g, (match, name) => '<span class="lw-tok">' + name + '</span>');
}

function mgCardLangsText(m){
  return CONTENT_LANGS.filter(code => !!cardText(m, "body", code)).join(", ");
}

function mgCardLangsHtml(m){
  return CONTENT_LANGS.filter(code => !!cardText(m, "body", code))
    .map(code => '<i class="lw-lang">' + esc(code.toUpperCase()) + '</i>')
    .join("");
}

function mgCardRepliesText(m){
  const n = macroBlockCount(m);
  if(n <= 1) return "";
  const isSeq = !!(m.alt && m.seq);
  return isSeq ? t("{N} steps").replace("{N}", n) : t("{N} alternatives").replace("{N}", n);
}

function mgCardRepliesHtml(m){
  const txt = mgCardRepliesText(m);
  return txt ? esc(txt) : "";
}

function mgCardIntentsText(m){
  if(m.allIntents) return t("every intent");
  const links = normalizeCardIntents(m);
  if(!links.length) return "";
  const firstIdx = intentIdxFromId(links[0]);
  const firstName = firstIdx >= 0 ? intentNavName(firstIdx) : "";
  if(!firstName) return "";
  if(links.length > 1) return firstName + " +" + (links.length - 1);
  return firstName;
}

function mgCardIntentsHtml(m){
  if(m.allIntents) return '<i class="lw-src">' + esc(t("every intent")) + '</i>';
  const links = normalizeCardIntents(m);
  if(!links.length) return "";
  const firstIdx = intentIdxFromId(links[0]);
  const firstName = firstIdx >= 0 ? intentNavName(firstIdx) : "";
  if(!firstName) return "";
  if(links.length > 1){
    return esc(firstName) + ' <b>+' + (links.length - 1) + '</b>';
  }
  return esc(firstName);
}

function mgCardSource(m){
  let key = "catalog";
  if(m._custom) key = "yours";
  else if(m._overridden) key = "changed here";
  const word = t(key);
  const html = key === "catalog" ? '<u>' + esc(word) + '</u>' : '<i class="lw-src">' + esc(word) + '</i>';
  return { key, word, html };
}

function mgCardSent(m, maxSent){
  const sent30 = mgSent30Map ? (mgSent30Map.get(m.id) || 0) : 0;
  const uses = (pack.useCounts && pack.useCounts[m.id]) | 0;
  let tip = "";
  if(sent30 > 0 || uses > 0){
    tip = t("Sent, 30 days") + ": " + sent30;
    if(uses > 0) tip += "\n" + mgUsesTip(uses);
  }
  let inner = "";
  if(sent30 > 0){
    const w = maxSent > 0 ? Math.max(1, Math.min(40, Math.round((sent30 / maxSent) * 40))) : 0;
    inner = '<em style="width:' + w + 'px"></em>' + sent30;
  }
  return { inner, tip, val: sent30 };
}

/** A card inside the category tree. Hidden rows are greyed; the star is inert on them, so
 *  the only way back is the closed eye - the rule the intent rows already follow. */
function mgCardRow(m, maxSent){
  const hid = !!m._hidden, fav = isFavourite(m.id);
  const favTip = fav ? "Remove from Favourites" : "Add to Favourites";
  const hideShow = hid
    ? '<button type="button" data-show-card="'+esc(m.id)+'" title="Show this card again" aria-label="Show this card again">'+ICON_EYE_SHUT+'</button>'
    : '<button type="button" data-hide-card="'+esc(m.id)+'" title="Put this card away: it greys out at the foot of this category" aria-label="Put this card away">'+ICON_EYE_OPEN+'</button>';

  const openHtml = mgCardOpensWithHtml(m);
  const langsHtml = mgCardLangsHtml(m);
  const repHtml = mgCardRepliesHtml(m);
  const intHtml = mgCardIntentsHtml(m);
  const sent = mgCardSent(m, maxSent);
  const src = mgCardSource(m);

  const sentTipAttr = sent.tip ? ' title="' + esc(sent.tip) + '"' : '';

  return '<div class="manage-row mg-card mg-card-row' + (hid ? " is-hidden" : "") + '" data-cardrow="' + esc(m.id) + '"' +
      ' data-band="' + esc(mgCardBand(m)) + '" title="' + esc(t("Drag to reorder, or onto a category to move it there")) + '">' +
    '<span class="lw-nm">' +
      '<span class="mg-card-lab">' + esc(cardTitle(m) || "") + '</span>' +
      (cardCommits(m) ? stampHtml("mg-stamp") : "") +
    '</span>' +
    '<span class="lw-c op lw-h-op cut-peek">' + openHtml + '</span>' +
    '<span class="lw-c lg lw-h-lg">' + langsHtml + '</span>' +
    '<span class="lw-c st lw-h-st">' + repHtml + '</span>' +
    '<span class="lw-c in lw-h-in">' + intHtml + '</span>' +
    '<span class="lw-c us lw-h-us"' + sentTipAttr + '>' + sent.inner + '</span>' +
    '<span class="lw-c sr lw-h-sr">' + src.html + '</span>' +
    '<span class="cacts">' +
      '<button type="button" data-edit-card="' + esc(m.id) + '" title="Open the full editor" aria-label="Edit card">'+ICON_EDIT+'</button>' +
      hideShow +
      '<button type="button" class="danger mg-trash" data-remove-card="' + esc(m.id) + '" title="Delete this card" aria-label="Delete card">'+ICON_TRASH+'</button>' +
      '<button type="button" class="star-btn' + (fav ? " on" : "") + '" data-fav-card="' + esc(m.id) + '" title="' + esc(favTip) + '" aria-label="' + esc(favTip) + '" aria-pressed="' + (fav ? "true" : "false") + '">'+(fav ? ICON_STAR_ON : ICON_STAR_OFF)+'</button>' +
    '</span></div>';
}

function mgCardColVal(m, col){
  if(col === "nm") return (cardTitle(m) || "").toLowerCase();
  if(col === "op") return mgCardOpensWithText(m).toLowerCase();
  if(col === "lg") return mgCardLangsText(m).toLowerCase();
  if(col === "st") return macroBlockCount(m);
  if(col === "in") return mgCardIntentsText(m).toLowerCase();
  if(col === "us") return mgSent30Map ? (mgSent30Map.get(m.id) || 0) : 0;
  if(col === "sr") {
    if(m._custom) return "yours";
    if(m._overridden) return "changed here";
    return "catalog";
  }
  return "";
}

function mgCardCmp(a, b){
  const hDiff = (a.m._hidden ? 1 : 0) - (b.m._hidden ? 1 : 0);
  if(hDiff) return hDiff;

  if(mgSortCol){
    const va = mgCardColVal(a.m, mgSortCol);
    const vb = mgCardColVal(b.m, mgSortCol);
    let diff = 0;
    if(typeof va === "number" && typeof vb === "number"){
      diff = va - vb;
    } else {
      diff = String(va).localeCompare(String(vb));
    }
    if(diff !== 0){
      return mgSortDir === "desc" ? -diff : diff;
    }
  } else {
    const fDiff = (isFavourite(a.m.id) ? 0 : 1) - (isFavourite(b.m.id) ? 0 : 1);
    if(fDiff) return fDiff;
  }

  return (cardOrderIdx(a.m.id) - cardOrderIdx(b.m.id)) || (a.i - b.i);
}

function mgCardsIn(k){
  return (cards||[]).map((m,i)=>({m,i})).filter(o=>o.m&&o.m.c===k)
    .sort(mgCardCmp).map(o=>o.m);
}

function mgSortClick(col){
  if(mgSortCol !== col){
    mgSortCol = col;
    mgSortDir = (col === "st" || col === "us") ? "desc" : "asc";
  } else if(mgSortDir === ((col === "st" || col === "us") ? "desc" : "asc")){
    mgSortDir = (col === "st" || col === "us") ? "asc" : "desc";
  } else {
    mgSortCol = null;
    mgSortDir = null;
  }
  paintLibrary();
}

function mgTreeHeadHtml(){
  const sortTip = esc(t("Sorts the cards inside each category by this column"));
  const sortColName = {
    nm: t("Name"),
    op: t("Opens with"),
    lg: t("Languages"),
    st: t("Replies"),
    in: t("Intents"),
    us: t("Sent, 30 days"),
    sr: t("Source")
  };
  let sortLineHtml = "";
  if(mgSortCol){
    const colName = sortColName[mgSortCol] || mgSortCol;
    const wayName = mgSortDir === "desc" ? t("descending") : t("ascending");
    const lineText = t("Sorted by {COLUMN}, {WAY}. A third click on the heading brings back the catalog's order, and dragging with it.")
      .replace("{COLUMN}", colName).replace("{WAY}", wayName);
    sortLineHtml = '<div class="lw-sort-line">' + esc(lineText) + '</div>';
  }

  const hBtn = (col, cls, label) => {
    return '<span class="' + cls + '" data-sort-col="' + col + '" role="button" tabindex="0" title="'+sortTip+'">' + esc(label) + '</span>';
  };

  return '<div class="lw-head" role="row">' +
    hBtn("nm", "lw-nm lw-h-nm", t("Name")) +
    hBtn("op", "lw-c op lw-h-op", t("Opens with")) +
    hBtn("lg", "lw-c lg lw-h-lg", t("Languages")) +
    hBtn("st", "lw-c st lw-h-st", t("Replies")) +
    hBtn("in", "lw-c in lw-h-in", t("Intents")) +
    hBtn("us", "lw-c us lw-h-us", t("Sent, 30 days")) +
    hBtn("sr", "lw-c sr lw-h-sr", t("Source")) +
    '<span class="lw-ac lw-h-ac"></span>' +
    '</div>' + sortLineHtml;
}

function updateTreeHoverTitles(root){
  const tree = (root || document).querySelector(".mg-tree");
  if(!tree) return;
  const head = tree.querySelector(".lw-head");
  if(!head) return;
  const isColShown = cls => {
    const el = head.querySelector("." + cls);
    return el && el.offsetParent && getComputedStyle(el).display !== "none";
  };
  const hiddenCols = {
    op: !isColShown("lw-h-op"),
    lg: !isColShown("lw-h-lg"),
    st: !isColShown("lw-h-st"),
    in: !isColShown("lw-h-in"),
    us: !isColShown("lw-h-us"),
    sr: !isColShown("lw-h-sr"),
  };
  const dragHint = t("Drag to reorder, or onto a category to move it there");
  const cardRows = tree.querySelectorAll(".mg-cat-body .manage-row.mg-card");
  cardRows.forEach(row => {
    const cid = row.getAttribute("data-cardrow");
    const m = (cards || []).find(c => c && c.id === cid);
    if(!m) return;
    const lines = [dragHint];
    if(hiddenCols.op){
      const op = mgCardOpensWithText(m);
      if(op) lines.push(t("Opens with") + ": " + op);
    }
    if(hiddenCols.lg){
      const lg = mgCardLangsText(m);
      if(lg) lines.push(t("Languages") + ": " + lg);
    }
    if(hiddenCols.st){
      const st = mgCardRepliesText(m);
      if(st) lines.push(t("Replies") + ": " + st);
    }
    if(hiddenCols.in){
      const ins = mgCardIntentsText(m);
      if(ins) lines.push(t("Intents") + ": " + ins);
    }
    if(hiddenCols.us){
      const us = mgSent30Map ? (mgSent30Map.get(m.id) || 0) : 0;
      if(us > 0) lines.push(t("Sent, 30 days") + ": " + us);
    }
    if(hiddenCols.sr){
      const src = mgCardSource(m);
      if(src && src.word) lines.push(t("Source") + ": " + src.word);
    }
    row.setAttribute("title", lines.join("\n"));
  });
}

/** The category -> card tree. Categories run in catOrder - dragging here and dragging
 *  a pill mean the same thing; inside a category, hidden sinks and favourites rise,
 *  matching the card list. Plain rows and an explicit toggle button, not <details>/
 *  <summary>: a summary hijacks every click inside it (an inline rename field could not
 *  take a caret) and is not a sane thing to drag. Disclosure lives in mgOpen either way. */
function mgCatTree(){
  mgSent30Map = statsRecentUse(pack, undefined, 30);
  let maxCardSent = 0;
  (cards || []).forEach(m => {
    if(m){
      const s = mgSent30Map.get(m.id) || 0;
      if(s > maxCardSent) maxCardSent = s;
    }
  });

  const known=Object.keys(CATS);
  known.sort((a,b)=>catSortIdx(a)-catSortIdx(b));
  const byCat={};
  known.forEach(k=>{ byCat[k]=[]; });
  const orphans=[];
  (cards||[]).forEach((m,i)=>{
    const row={m,i};
    if(byCat[m.c]) byCat[m.c].push(row); else orphans.push(row);
  });

  let maxCatSent = 0;
  known.forEach(k => {
    const sum = (byCat[k] || []).reduce((acc, row) => acc + (mgSent30Map.get(row.m.id) || 0), 0);
    if(sum > maxCatSent) maxCatSent = sum;
  });

  /* The tiebreak is pack.cardOrder, NOT the position in `cards`: `cards` is filled in
     catalog order then customs and nothing re-sorts it by the user's arrangement, while
     cardOrder is the record the card list itself sorts by (cmpCardDisplay's final
     tiebreak). Reading `a.i-b.i` here made a drag persist for the list and snap back in
     Manage - two views disagreeing about what "order" means. One record, both views. */
  const order=list=>list.sort(mgCardCmp).map(o=>mgCardRow(o.m, maxCardSent)).join("");

  const group=(k,rows,fixed,label)=>{
    const n=rows.length;                      // CARDS - guards the delete x below
    const nMac=rows.reduce((sum,o)=>sum+macroBlockCount(o.m),0);   // cards - what the badge shows
    const key="cat:"+k;
    const op=mgOpen.has(key);
    /* In the Library a category row's name field takes focus on F2, and inline renaming
       updates the category directly. Fixed / orphan categories use a span. */
    const name=(fixed || k==="__orphan")
      ? '<span class="mg-cat-fixed">'+esc(label)+'</span>'
      : '<input type="text" class="mg-cat-lab2" data-rename="'+esc(k)+'" value="'+esc(label)+'" spellcheck="false" autocomplete="off" aria-label="'+esc(t("Category name"))+'">';
    /* × only on an empty category - the same rule the header pill uses, so no route anywhere
       in the UI deletes a category with cards still in it. */
    const x=(!n && k!=="__orphan")
      ?'<button type="button" class="mg-cat-x2 icbtn" data-delcat="'+esc(k)+'" title="Delete this empty category" aria-label="Delete category">'+ICON_TRASH+'</button>':"";
    const add=k==="__orphan" ? ""
      :(function(){ const tip=esc(t("Add a card to {CAT}").replace("{CAT}",label));
         return '<button type="button" class="mg-cat-add2 icbtn" data-add-card="'+esc(k)+'" title="'+tip+'" aria-label="'+tip+'">'+ICON_PLUS+'</button>'; })();
    /* The pencil opens the whole category - name, icon, colour - the way the card rows do.
       The inline name field beside it stays: a rename is one keystroke away and a dialog for
       one word would be a step backwards. */
    const editc=k==="__orphan" ? ""
      :'<button type="button" class="mg-cat-edit2 icbtn" data-editcat="'+esc(k)+'" title="'+esc(t("Edit this category's names, icon and colour"))+'" aria-label="Edit category">'+ICON_EDIT+'</button>';
    /* Role toggles. The rings they control are the two things about Etiuda that are least
       guessable, so the tooltips say what each does rather than naming the role. Both report
       state through .on, like the star and the eye. */

    const alwaysOn=isAlwaysCat(k);
    const roles=k==="__orphan" ? "" :
      '<button type="button" class="mg-role'+(alwaysOn?" on":"")+'" data-role-always="'+esc(k)+'" aria-pressed="'+(alwaysOn?"true":"false")+'" '+
        'title="'+(alwaysOn
          ? t("Supporting category, relevant regardless of the intent")
          : t("Make this a supporting category, relevant regardless of the intent"))+'" aria-label="'+esc(t("Supporting category"))+'">'+ICON_ROLE_ALWAYS+'</button>';

    const catSent = rows.reduce((acc, row) => acc + (mgSent30Map.get(row.m.id) || 0), 0);
    let catSentTip = "";
    let catSentBar = "";
    if(catSent > 0){
      catSentTip = ' title="' + esc(t("Sent, 30 days") + ": " + catSent) + '"';
      const bw = maxCatSent > 0 ? Math.max(1, Math.min(40, Math.round((catSent / maxCatSent) * 40))) : 0;
      catSentBar = '<em style="width:' + bw + 'px"></em>';
    }

    return '<div class="mg-cat'+(op?" is-open":"")+'" data-cat="'+esc(k)+'">'+
      '<div class="mg-cat-row"'+(k==="__orphan"?"":' data-crow="'+esc(k)+'" title="Drag to reorder"')+'>'+
        '<span class="lw-nm">' +
          '<button type="button" class="mg-tw" data-toggle="'+esc(key)+'" aria-expanded="'+(op?"true":"false")+'" '+
            'title="'+esc(t(op?"Collapse":"Expand"))+'" aria-label="'+esc(t(op?"Collapse":"Expand"))+' '+esc(label)+'">'+ICON_CHEVRON_R+'</button>'+
          name+'<span class="mg-cat-n">'+nMac+'</span>'+
        '</span>'+
        '<span class="lw-c op lw-h-op"></span>'+
        '<span class="lw-c lg lw-h-lg"></span>'+
        '<span class="lw-c st lw-h-st"></span>'+
        '<span class="lw-c in lw-h-in">' + (alwaysOn ? '<i class="lw-src">' + esc(t("every intent")) + '</i>' : '') + '</span>'+
        '<span class="lw-c us lw-h-us"' + catSentTip + '>' + catSentBar + (catSent ? catSent : '') + '</span>'+
        '<span class="lw-c sr lw-h-sr"></span>'+
        '<span class="mg-cat-acts">'+editc+roles+add+x+'</span>'+
      '</div>'+
      '<div class="mg-cat-body"'+(op?"":" hidden")+'>'+
        (n?order(rows):'<div class="manage-empty">'+esc(t("Empty."))+'</div>')+
      '</div></div>';
  };

  const groups=known.map(k=>group(k,byCat[k],false,CATS[k])).join("");
  const stray=orphans.length ? group("__orphan",orphans,true,t("Uncategorised")) : "";
  const treeContent = groups + stray ? mgTreeHeadHtml() + groups + stray : '<div class="manage-empty">'+esc(t("No categories."))+'</div>';
  return '<div class="mg-tree">' + treeContent + '</div>';
}

/* ---- Reordering inside Manage: pointer-based and bound to the document - the swap
   rewrites the row order, and anything bound to a row dies the moment it moves. Two
   lists, both shared with the app: categories write catOrder (the pills' own list),
   cards write pack.cardOrder (the card list's) - a drag here changes the order
   everywhere, the whole point of doing it from Manage. Only the grip starts a drag: the
   rest of a row is a rename field, a toggle or an action. */
let mgDrag=null, mgSwapLock=0;
function mgSiblingIdx(el){
  return el&&el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : -1;
}
/* No midpoint test: a row swaps as soon as the pointer is over it, as in the intent
   panel. The midpoint rule exists for the CARD list, where ~274px entries trade places
   under a stationary cursor; Manage rows are ~30px, rail scale, so the swap lock alone
   is enough and waiting for the centre just makes the drag feel sticky. */
/** FLIP, scoped to one container - the same capture / invert / play the pills and the card list
 *  use. None of the card-list guards apply here: Manage moves the row itself instead of
 *  re-rendering, so membership is identical by construction and nothing can travel further than
 *  the list is tall. */
/* Any tree-changing action re-runs openManage(), which rebuilds the dialog from
   innerHTML - throwing away the scroll position (hiding the fortieth card snapped the
   list to the top) and any chance of animating. This keeps both: scroll restored on the
   two boxes that actually scroll, rows re-found by card id across the rebuild. mgFlip()
   cannot serve here - it holds element references, fine within one render, useless
   across one. */
/* Manage rebuilds its rows on every action, and a rebuilt row measures fresh. */
function mgRefreshAround(mutate){
  const page=libPage(), host=libHost();
  if(!page){ mutate(); return; }
  const pageEl = (host && host.querySelector("#libPage")) || page.querySelector("#libPage");
  const keepPage = pageEl ? pageEl.scrollTop : 0;
  const treeBefore=page.querySelector(".mg-tree");
  const keepTree=treeBefore?treeBefore.scrollTop:0;
  const keepCard=host?host.scrollTop:0;
  /* Rows in BOTH lists: cards live in a scrolling .mg-tree, intents in a plain list that scrolls
     with the dialog. Keyed by id, since openManage replaces every element. */
  const ROWS="[data-cardrow],[data-introw]";
  const rowKey=el=>el.getAttribute("data-cardrow")||el.getAttribute("data-introw");
  const before={};
  if(!mgReduceMotion()){
    page.querySelectorAll(ROWS).forEach(el=>{
      if(!el.offsetParent) return;                  // inside a collapsed section
      before[rowKey(el)]=el.getBoundingClientRect().top;
    });
  }
  mutate();
  paintLibrary();
  const now=libPage();
  if(!now) return;
  const nowPage = (host && host.querySelector("#libPage")) || now.querySelector("#libPage");
  if(nowPage) nowPage.scrollTop = keepPage;
  const tree=now.querySelector(".mg-tree");
  if(tree) tree.scrollTop=keepTree;
  if(host) host.scrollTop=keepCard;
  if(mgReduceMotion()) return;
  /* Clip each row against whatever actually scrolls around it - the tree for a card, the tab's
     page for an intent - so a row animating in one list is never measured against the other. */
  const bodyBox=(nowPage||host||now).getBoundingClientRect();
  const moved=[], dys=[];
  now.querySelectorAll(ROWS).forEach(el=>{
    const b=before[rowKey(el)];
    if(b==null || !el.offsetParent) return;
    const box=nowPage?nowPage.getBoundingClientRect():bodyBox;
    const r=el.getBoundingClientRect();
    if(r.bottom<box.top-40 || r.top>box.bottom+40) return;
    const dy=Math.round(b-r.top);
    if(!dy || Math.abs(dy)>box.height) return;
    moved.push(el); dys.push(dy);
  });
  if(!moved.length || moved.length>60) return;
  moved.forEach((el,i)=>{ el.style.transition="none"; el.style.willChange="transform";
                          el.style.transform="translateY("+dys[i]+"px)"; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void now.offsetHeight;
  const clear=()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
  moved.forEach(el=>{ el.style.transition="transform var(--m-move) "+E_EASE; el.style.transform=""; });
  setTimeout(clear,240);
}
function mgFlip(container,mutate){
  const rows=Array.prototype.slice.call(container.children);
  const before=rows.map(el=>el.getBoundingClientRect());
  mutate();
  const moved=[];
  rows.forEach((el,i)=>{
    const a=el.getBoundingClientRect();
    const dx=Math.round(before[i].left-a.left), dy=Math.round(before[i].top-a.top);
    if(!dx && !dy) return;
    el.style.transition="none";
    el.style.willChange="transform";    // see the note in flipPills
    el.style.transform="translate("+dx+"px,"+dy+"px)";
    moved.push(el);
  });
  if(!moved.length) return;
  const clear=()=>moved.forEach(el=>{ el.style.transition=""; el.style.transform=""; el.style.willChange=""; });
  /* Commit the invert before attaching the transition - see the note at flipPills():
     without a computed start value Firefox shows the end state. Same-task attach also
     avoids the background-tab rAF pause. */
  void container.offsetHeight;
  moved.forEach(el=>{ el.style.transition="transform var(--m-move) "+E_EASE; el.style.transform=""; });
  setTimeout(clear,200);
}
function mgDomMove(fromEl,toEl){
  const fi=mgSiblingIdx(fromEl), ti=mgSiblingIdx(toEl);
  if(fi<0||ti<0) return;
  mgFlip(fromEl.parentNode,()=>{
    if(fi<ti) toEl.parentNode.insertBefore(fromEl, toEl.nextSibling);
    else toEl.parentNode.insertBefore(fromEl, toEl);
  });
}
function mgMoveCatOrder(fromKey,toKey){
  const from=catOrder.indexOf(fromKey), to=catOrder.indexOf(toKey);
  if(from<0||to<0||from===to) return false;
  catOrder.splice(to,0,catOrder.splice(from,1)[0]);
  return true;
}
/** Move a card into another category by dropping it there. A category is ordinary card
 *  data, written like every single-field edit: a PARTIAL override for a built-in - and
 *  dragging a card back to where the catalog put it removes the override, clearing the
 *  "edited" badge; customs own their `c` directly. Placed at the END of the target in
 *  pack.cardOrder: dropping into a container appends - the one rule that reads the same
 *  collapsed, empty or open; favourites still rise within the category by themselves.
 *  `findCard` still reports the OLD category until rebuildCards() runs - exactly what
 *  the position scan wants: every other card's `c` is untouched. */
function mgMoveCardToCategory(id, catKey){
  if(!id || !catKey || catKey==="__orphan" || !CATS[catKey]) return false;
  const m=findCard(id);
  if(!m || m.c===catKey) return false;
  if(m._custom){
    const ix=(pack.custom||[]).findIndex(x=>x&&x.id===id);
    if(ix<0) return false;
    pack.custom[ix].c=catKey;
  } else {
    const base=baseCard(id);
    if(!pack.overrides) pack.overrides={};
    const o=Object.assign({},pack.overrides[id]||{});
    if(base && base.c===catKey) delete o.c; else o.c=catKey;
    if(Object.keys(o).length) pack.overrides[id]=o; else delete pack.overrides[id];
  }
  ensureCardOrder();
  const from=pack.cardOrder.indexOf(id);
  if(from>=0){
    pack.cardOrder.splice(from,1);
    let at=-1;
    pack.cardOrder.forEach((oid,i)=>{
      const om=findCard(oid);
      if(om && om.id!==id && om.c===catKey) at=i;
    });
    pack.cardOrder.splice(at+1,0,id);
    cardOrderTouched();
  }
  return true;
}
function mgClearDropTarget(){
  document.querySelectorAll(".mg-cat.mg-drop").forEach(el=>el.classList.remove("mg-drop"));
}
/** Band for an intent row: hidden sinks, favourites lead, the rest follow - the order the
 *  Library already renders and the panel already sorts. Read live, never from the attribute. */
function mgIntentBand(iid){
  const i=intentIdxFromId(iid);
  if(i<0) return "x";
  if(isIntentHiddenIdx(i)) return "h";
  return isIntentFavourite(iid)?"f":"r";
}
/** Same-band only, like mgMoveCardOrder. intentOrder holds INDICES, so the ids coming off the
 *  rows are resolved to indices first and their positions in the order array are what move. */
function mgMoveIntentOrder(fromId,toId){
  if(mgIntentBand(fromId)!==mgIntentBand(toId)) return false;
  const fi=intentIdxFromId(fromId), ti=intentIdxFromId(toId);
  if(fi<0||ti<0) return false;
  const from=intentOrder.indexOf(fi), to=intentOrder.indexOf(ti);
  if(from<0||to<0||from===to) return false;
  intentOrder.splice(to,0,intentOrder.splice(from,1)[0]);
  return true;
}
/** Same-band only, and the band is checked against live state rather than the rendered
 *  attribute, so a stale row cannot smuggle a favourite past a plain entry. */
function mgMoveCardOrder(fromId,toId){
  ensureCardOrder();
  return moveCardWithin(fromId,toId,mgCardBand);
}
function wireManageDrag(){
  addEventListener("pointerdown",e=>{
    if(e.button!==0 || !e.target.closest || !e.target.closest(".lib-list")) return;
    /* The row is the handle, minus everything that has its own job - the same rule the card list
       uses for its header. A card row is grabbable across its whole width including the title,
       which is plain text; a category row still excludes its rename field through the selector
       below. preventDefault() at the end is what stops a drag from starting a text selection. */
    if(e.target.closest("input,button,select,textarea,a")) return;
    const crow=e.target.closest(".mg-cat-row[data-crow]");
    const mrow=e.target.closest(".manage-row.mg-card[data-cardrow]");
    const irow=e.target.closest(".manage-row[data-introw]");
    const wrow=e.target.closest(".lw-name[data-wrow]");
    if(crow) mgDrag={kind:"cat", key:crow.getAttribute("data-crow"), el:crow.closest(".mg-cat")};
    else if(mrow && !mgSortCol) mgDrag={kind:"card", key:mrow.getAttribute("data-cardrow"), el:mrow};
    else if(irow) mgDrag={kind:"intent", key:irow.getAttribute("data-introw"), el:irow};
    else if(wrow) mgDrag={kind:"who", key:wrow.getAttribute("data-wrow"), el:wrow};
    else return;
    mgClearDropTarget();   // a drag cancelled by the system never reaches pointerup; start clean
    mgDrag.x=e.clientX; mgDrag.y=e.clientY; mgDrag.moved=false; mgDrag.dropCat=null;
    try{ e.preventDefault(); }catch(_){}
  });
  addEventListener("pointermove",e=>{
    if(!mgDrag) return;
    if(!mgDrag.moved){
      if(Math.abs(e.clientX-mgDrag.x)+Math.abs(e.clientY-mgDrag.y)<5) return;
      mgDrag.moved=true;
      document.documentElement.classList.add("mgdrag");
      if(mgDrag.el) mgDrag.el.classList.add("dragging");
      try{ const s=window.getSelection&&window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
    }
    // One swap at a time, and long enough to cover the 180ms FLIP - otherwise the next
    // elementFromPoint reads a row mid-transform and the pair trade places repeatedly.
    if(Date.now()-mgSwapLock<190) return;
    const under=document.elementFromPoint(e.clientX,e.clientY);
    if(!under||!under.closest) return;
    if(mgDrag.kind==="who"){
      const row=under.closest(".lw-name[data-wrow]");
      if(!row||row===mgDrag.el) return;
      if(row.parentNode!==mgDrag.el.parentNode) return;
      const current=whoOptions().slice();
      const fi=current.indexOf(mgDrag.key);
      const ti=current.indexOf(row.getAttribute("data-wrow"));
      if(fi<0||ti<0) return;
      current.splice(fi,1);
      current.splice(ti,0,mgDrag.key);
      setWhoList(current);
      mgSwapLock=Date.now();
      mgDomMove(mgDrag.el,row);
      return;
    }
    if(mgDrag.kind==="intent"){
      /* The simplest of the three: one flat list, no groups to cross and nothing to re-parent, so
         a reorder is the only gesture and it is live all the way. */
      const row=under.closest(".manage-row[data-introw]");
      if(!row||row===mgDrag.el) return;
      if(row.parentNode!==mgDrag.el.parentNode) return;
      if(row.getAttribute("data-band")!==mgDrag.el.getAttribute("data-band")) return;
      if(!mgMoveIntentOrder(mgDrag.key,row.getAttribute("data-introw"))) return;
      mgSwapLock=Date.now();
      mgDomMove(mgDrag.el,row);
      return;
    }
    if(mgDrag.kind==="cat"){
      const row=under.closest(".mg-cat-row[data-crow]");
      if(!row) return;
      const key=row.getAttribute("data-crow");
      if(key===mgDrag.key) return;
      /* Point at the header row but move the whole group, so an expanded category carries its
         cards with it - and so an open category's tall body is not itself a drop target. */
      const toEl=row.closest(".mg-cat");
      if(!toEl||toEl.parentNode!==mgDrag.el.parentNode) return;
      if(!mgMoveCatOrder(mgDrag.key,key)) return;
      mgSwapLock=Date.now();
      mgDomMove(mgDrag.el,toEl);
    } else {
      /* Crossing INTO another category is decided here and applied on RELEASE, unlike a
         reorder, which is live. Three reasons: the target is often collapsed (no row to
         slot into, nothing worth animating); re-parenting mid-gesture is how a drag loses
         its element; and the FLIP measures one container, not two. Highlight and commit
         once - you are dropping into a thing, not swapping with a neighbour. */
      const grp=under.closest(".mg-cat[data-cat]");
      const home=mgDrag.el.closest(".mg-cat[data-cat]");
      const gk=grp?grp.getAttribute("data-cat"):null;
      // "Uncategorised" is a rendering of cards whose category is gone, not a category - you can
      // drag OUT of it, never into it.
      if(grp && home && grp!==home && gk && gk!=="__orphan"){
        if(mgDrag.dropCat!==gk){
          mgClearDropTarget();
          grp.classList.add("mg-drop");
          mgDrag.dropCat=gk;
        }
        return;
      }
      if(mgDrag.dropCat){ mgClearDropTarget(); mgDrag.dropCat=null; }

      const row=under.closest(".manage-row.mg-card[data-cardrow]");
      if(!row||row===mgDrag.el) return;
      if(row.parentNode!==mgDrag.el.parentNode) return;          // reorder never leaves its category
      if(row.getAttribute("data-band")!==mgDrag.el.getAttribute("data-band")) return;
      if(!mgMoveCardOrder(mgDrag.key,row.getAttribute("data-cardrow"))) return;
      mgSwapLock=Date.now();
      mgDomMove(mgDrag.el,row);
    }
  },{passive:true});
  addEventListener("pointerup",endMgDrag);
  addEventListener("pointercancel",endMgDrag);
}
/* Named and bound to BOTH pointerup and pointercancel - every drag in the file carries
   the cancel half. A cancelled pointer (a touch taken by a browser gesture, a pointer lost
   to another window) otherwise strands three things: `html.mgdrag`, which puts
   user-select:none on the whole document; the row's `dragging` class; and a live mgDrag,
   so the global pointermove keeps reordering rows under a button nobody is holding. */
function endMgDrag(){
  if(!mgDrag) return;
  const {kind,moved,key,dropCat}=mgDrag;
  document.documentElement.classList.remove("mgdrag");
  if(mgDrag.el) mgDrag.el.classList.remove("dragging");
  mgClearDropTarget();
  mgDrag=null;
  if(!moved) return;
  if(kind==="who"){
    const page=libPage();
    if(page) refreshRolePage(page);
    return;
  }
  /* A category change rewrites the card's data, not just an order array, so it needs the full
     round: rebuild, repaint the list and the pills (the counts moved), and re-render the tree
     because the row now belongs under a different parent. The target is opened first, so the
     card is visible where it landed rather than swallowed by a collapsed group. */
  if(kind==="card" && dropCat){
    if(mgMoveCardToCategory(key,dropCat)){
      savePack(); rebuildCards();
      recountMacros();
      mgOpen.add("cat:"+dropCat);
      render(); drawPills(); paintLibrary();
      toast(t("Moved to")+" "+(CATS[dropCat]||dropCat));
    }
    return;
  }
  /* Persist once, at the end - the order arrays are mutated live so the rows follow the
     cursor, but a write per swap would be a write per 170ms of dragging. */
  if(kind==="cat"){ lySet("CatOrder",JSON.stringify(catOrder)); drawPills(); }
  /* intentOrder is its own stored key, not part of the pack, and the PANEL has to be redrawn -
     it renders from the same array, so leaving it alone would show two different orders for the
     same list depending on which one you happened to be looking at. */
  else if(kind==="intent"){
    syncIntentOrder();
    drawIntentRail();
  }
  else savePack();
  render();
}

/** Inline category creation at the foot of the tree. Same contract as the "+" pill in the
 *  header - type, Enter to accept, Esc or an empty blur to cancel - rather than a dialog for
 *  one text field. The row is appended to the tree itself so the new category appears where it
 *  will actually live, and the tree scrolls to it. */
function startMgCatAdd(){
  const page=libPage(), tree=page&&page.querySelector(".mg-tree");
  if(!tree || tree.querySelector(".mg-cat-new")) return;
  const wrap=document.createElement("div");
  wrap.className="mg-cat mg-cat-new";
  wrap.innerHTML='<div class="mg-cat-row"><span class="mg-tw" aria-hidden="true">'+ICON_CHEVRON_R+'</span>'+
    '<input type="text" class="mg-cat-lab2" id="mgNewCat" placeholder="New category" '+
    'spellcheck="false" autocomplete="off" aria-label="New category name"></div>';
  tree.appendChild(wrap);
  tree.scrollTop=tree.scrollHeight;
  const inp=wrap.querySelector("#mgNewCat");
  if(!inp) return;
  let done=false;
  const finish=ok=>{
    if(done) return;
    done=true;
    const name=inp.value.trim();
    wrap.remove();
    if(!ok||!name) return;
    const key=ensureCustomCat(name);
    rebuildCards(); drawPills();
    mgOpen.add("cat:"+key);        // open it, so the "+" that adds its first card is right there
    paintLibrary();
    toast("Category added");
  };
  inp.focus();
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); finish(true); }
    else if(e.key==="Escape"){ e.preventDefault(); finish(false); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(true); }, 0); };
}

/* The screen's user-facing name is "LIBRARY". The identifiers - openManage, mg*,
   fromManage - keep their stem on purpose: code names track the code they touch, and
   "Manage" in the comments below is this function's own shorthand, not the label on the
   door. */
/** "Show all hidden (n)" for one of the two lists. Disabled at zero rather than absent: a
 *  control that vanishes teaches nothing, and its greyed "(0)" is the answer to the question
 *  that would otherwise send you hunting through the list for something that is not there. */
function tipShowHidden(kind,n){
  if(!n) return t("Nothing is hidden");
  return kind==="cards" ? t("Un-hide every hidden card") : t("Un-hide every hidden intent");
}
function mgShowHiddenBtn(kind,n){
  return '<button type="button" class="btn" data-show-hidden="'+esc(kind)+'"'+(n?"":" disabled")+
    ' title="'+esc(tipShowHidden(kind,n))+'">'+
    esc(t('Show all hidden'))+' ('+n+')</button>';
}
let mgIntentCardsCache=null;

/* Builds a lookup of cards linked to each intent, ordered:
   favourites first, then marked intentTop, then the Library tree's own order
   (categories in bar order, then mgCardCmp). Hidden cards are excluded. */
function mgIntentCardsMap(){
  const map=new Map();
  (cards||[]).forEach((m,idx)=>{
    if(!m || m._hidden) return;
    const links=normalizeCardIntents(m);
    for(let j=0; j<links.length; j++){
      const iid=links[j];
      let arr=map.get(iid);
      if(!arr){ arr=[]; map.set(iid, arr); }
      arr.push({m, i:idx});
    }
  });
  map.forEach(list=>{
    list.sort((a,b)=>{
      const fa=isFavourite(a.m.id)?0:1;
      const fb=isFavourite(b.m.id)?0:1;
      if(fa!==fb) return fa-fb;
      const ta=a.m.intentTop?0:1;
      const tb=b.m.intentTop?0:1;
      if(ta!==tb) return ta-tb;
      const ca=catSortIdx(a.m.c);
      const cb=catSortIdx(b.m.c);
      if(ca!==cb) return ca-cb;
      return mgCardCmp(a,b);
    });
  });
  return map;
}

/* AN INTENT IN THE RAIL'S FORM: its one dominant category's mark at the head, the name on one line
   fading where it runs out, beside it the number of cards linked to it (hover reads Linked cards: {N}),
   then the linked cards as quiet chips fading at the right (or "no cards yet" when none), and the buttons.
   `catOf`, `linked` and `intentCardsMap` are taken once a list. */
function mgIntentRow(i,catOf,linked,intentCardsMap){
  const iid=intentIdAt(i);
  const hid=isIntentHiddenIdx(i);
  const fav=isIntentFavourite(iid);
  const badge=(intentIsCustom(i)||intentIsOverridden(i))?' <span class="cbadge ed" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>':"";
  const favTip=fav?"Remove from Favourites":"Add to Favourites";
  /* Hide toggles; delete is separate and lives only here. Both built-in and custom intents
     can be deleted now - a built-in goes to pack.intentRemoved and comes back on Reset. */
  const hideShow=hid
    ?'<button type="button" data-show-intent="'+esc(iid)+'" title="Show this intent again" aria-label="Show this intent again">'+ICON_EYE_SHUT+'</button>'
    :'<button type="button" data-hide-intent="'+esc(iid)+'" title="Hide this intent: it greys out and drops to the bottom" aria-label="Hide this intent">'+ICON_EYE_OPEN+'</button>';
  const trash='<button type="button" class="danger mg-trash" data-remove-intent="'+esc(iid)+'" title="Delete this intent" aria-label="Delete this intent">'+ICON_TRASH+'</button>';

  const count=linked.get(iid)||0;
  const countHover=t("Linked cards: {N}").replace("{N}", count);

  const cardMap=intentCardsMap || (typeof mgIntentCardsCache!=="undefined"?mgIntentCardsCache:null) || (typeof mgIntentCardsMap==="function"?mgIntentCardsMap():null);
  const cardList=(cardMap && cardMap.get(iid))||[];
  let chipsHtml="";
  if(cardList.length===0){
    chipsHtml='<span class="lw-empty-chips">'+esc(t("no cards yet"))+'</span>';
  } else {
    chipsHtml=cardList.map(o=>{
      const title=(typeof cardTitle==="function"?cardTitle(o.m):"")||"";
      return '<button type="button" class="lw-chip" data-card-id="'+esc(o.m.id)+'" title="'+esc(t("Opens this card's editor"))+'" aria-label="'+esc(title)+' · '+esc(t("Opens this card's editor"))+'">'+esc(title)+'</button>';
    }).join("");
  }

  /* data-introw so mgRefreshAround() can find this row again after openManage() has replaced
     every element - the same job data-cardrow does in the tree. */
  /* data-band mirrors the card rows: a drag may only swap inside its own band, so hidden
     entries cannot be dragged up among the live ones and a favourite cannot be dragged out of
     the favourites - the same rule moveIntent() enforces for the panel, so the two surfaces
     cannot disagree about what order means. Checked again against live state in
     mgMoveIntentOrder, so a stale attribute cannot smuggle a row past its band. */
  return '<div class="manage-row mg-int'+(hid?" is-hidden":"")+'" data-introw="'+esc(iid)+'"'+
    ' data-band="'+(hid?"h":(fav?"f":"r"))+'">'+
    catMarkHtml(catOf.get(iid)||"")+
    '<span class="mg-int-t cut-peek" data-i18n-skip>'+esc(intentNavName(i)||"")+badge+'</span>'+
    '<span class="mg-int-n" title="'+esc(countHover)+'">'+count+'</span>'+
    '<div class="lw-mid">'+chipsHtml+'</div>'+
    '<span class="cacts">'+
      '<button type="button" data-edit-intent-mg="'+i+'" title="Edit intent" aria-label="Edit intent">'+ICON_EDIT+'</button>'+
      hideShow+
      trash+
      '<button type="button" class="star-btn'+(fav?" on":"")+'" data-fav-intent-mg="'+esc(iid)+'" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'+
    '</span></div>';
}
/* The Library names the relay only while the catalog open is that relay team's own. The relay's folder is the mirror
   the shell shows for it. Where the relay names no folder, the open catalog is its own unless another team's folder
   is the one open. A folder team's catalog, and a catalog of no team, keep the folder and Change folder. */
function normCatalogFolder(p){
  return String(p||"").replace(/[\\/]+$/,"").toLowerCase()
}
function libraryRelayLead(){
  const open=normCatalogFolder(eCatalogFolder())
  if(!open) return null
  const leads=teamLeads().filter(l=>l&&!l.removed)
  if(leads.some(l=>!l.relay && normCatalogFolder(l.folder)===open)) return null
  const relay=leads.filter(l=>l.relay)
  if(!relay.length) return null
  const match=relay.find(l=>normCatalogFolder(l.folder)===open)
  if(match) return match
  if(relay.length===1 && !normCatalogFolder(relay[0].folder)) return relay[0]
  return null
}
/* The page is the section left open. Catalog and data starts that way, and a section a person
   opens stays the page, so a redraw does not jump back to another. */
let libOn="data";
let libQuery="";
/* Built when asked, as Settings' sections are, so each name and lede is a literal t() call the
   strings legs count and the desk's language reaches. */
const libFind=()=>t("Search the library");
const libSections=()=>[
  {key:"catmac", icon:"categories", name:t("Categories & cards"), lede:t("Each category with its cards, its place in the order, and whether it supports every intent.")},
  {key:"intents", icon:"intents", name:t("Intents"), lede:t("Favourites first, hidden intents at the foot.")+" "+t("Beside each, the cards linked to it.")},
  {key:"who", icon:"user", name:t("ROLE suggestions"), lede:t("The names the ROLE wheel offers, in the order it offers them. Dragging a name moves it.")},
  {key:"data", icon:"cards", name:t("Catalog & data"), lede:t("The catalog in use on this desk, and loading another catalog file.")}
];
function libFold(s){
  return String(s||"").toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}
function rememberedLib(){
  const order=["catmac","intents","who","data"];
  const open=order.filter(k=>mgOpen.has(k));
  if(open.length===1) return open[0];
  if(open.indexOf(libOn)>=0) return libOn;
  return open[0]||"catmac";
}
function libNavHtml(){
  const finding=!!libFold(libQuery);
  return libSections().map(s=>{
    const on=!finding && s.key===libOn;
    return '<button type="button" class="sx-sec'+(on?" on":"")+'" data-lm="'+esc(s.key)+'"'
      +(on?' aria-current="page"':'')+'>'+lmIcon(s.icon)+'<span data-i18n-skip>'+esc(s.name)+'</span></button>';
  }).join("");
}
function applyLibView(page){
  if(!page||typeof page.querySelectorAll!=="function") return;
  const buttons=page.querySelectorAll(".sx-sec[data-lm]");
  if(!buttons||!buttons.length) return;
  const q=libFold(libQuery);
  if(page.classList){ if(q) page.classList.add("is-find"); else page.classList.remove("is-find"); }
  let countEl=null;
  let totalHits=0;
  page.querySelectorAll("details.manage-sec").forEach(d=>{
    const key=d.getAttribute("data-mg");
    if(!q){
      const show=key===libOn;
      if(show) d.removeAttribute("hidden"); else d.setAttribute("hidden","");
      /* The page's fold has no summary to open it by, and a hidden fold left open shuts it: the
         folds are an accordion, whose toggle runs after this paint. */
      d.open=show; /* plant:library-page-open */
      if(key===libOn){ const c=d.querySelector(".mg-count"); if(c) countEl=c; }
      if(key==="catmac"){
        d.querySelectorAll(".mg-cat").forEach(cat=>{
          const k=cat.getAttribute("data-cat");
          const op=mgOpen.has("cat:"+k);
          cat.removeAttribute("hidden");
          if(cat.classList) cat.classList.toggle("is-open", op);
          const body=cat.querySelector(".mg-cat-body");
          if(body){ if(op) body.removeAttribute("hidden"); else body.setAttribute("hidden",""); }
          cat.querySelectorAll(".mg-card-row").forEach(r=>r.removeAttribute("hidden"));
        });
      } else if(key==="intents"){
        d.querySelectorAll(".mg-intent-row").forEach(r=>r.removeAttribute("hidden"));
      } else if(key==="who"){
        d.querySelectorAll(".lw-name[data-wrow]").forEach(r=>r.removeAttribute("hidden"));
      }
    } else {
      let hit=false;
      if(key==="catmac"){
        d.querySelectorAll(".mg-cat").forEach(cat=>{
          const lab=cat.querySelector(".mg-cat-lab2");
          const fixed=cat.querySelector(".mg-cat-fixed");
          const catName=(lab && lab.value) || (fixed ? fixed.textContent : "") || "";
          const catMatch=libFold(catName).indexOf(q)>=0;
          let anyCardMatch=false;
          cat.querySelectorAll(".mg-card-row").forEach(crow=>{
            const cHit=libFold(crow.textContent).indexOf(q)>=0;
            if(cHit) anyCardMatch=true;
            if(catMatch || cHit) crow.removeAttribute("hidden");
            else crow.setAttribute("hidden","");
          });
          const catHit=catMatch||anyCardMatch;
          const body=cat.querySelector(".mg-cat-body");
          if(catHit){
            hit=true;
            cat.removeAttribute("hidden");
            if(cat.classList) cat.classList.add("is-open");
            if(body) body.removeAttribute("hidden");
          } else {
            cat.setAttribute("hidden","");
          }
        });
      } else if(key==="intents"){
        d.querySelectorAll(".mg-intent-row").forEach(r=>{
          const iHit=libFold(r.textContent).indexOf(q)>=0;
          if(iHit){ hit=true; r.removeAttribute("hidden"); }
          else r.setAttribute("hidden","");
        });
      } else if(key==="who"){
        const names = whoOptions().join(" ");
        hit=libFold(d.textContent).indexOf(q)>=0 || libFold(names).indexOf(q)>=0;
        d.querySelectorAll(".lw-name[data-wrow]").forEach(r=>{
          const name=r.getAttribute("data-wrow")||"";
          if(!q || libFold(name).indexOf(q)>=0) r.removeAttribute("hidden");
          else r.setAttribute("hidden","");
        });
      } else {
        hit=libFold(d.textContent).indexOf(q)>=0;
      }
      if(hit){
        totalHits++;
        d.removeAttribute("hidden");
        d.open=true;
      } else {
        d.setAttribute("hidden","");
      }
    }
  });

  const card=page.querySelector(".sx-card") || page;
  let emptyP=page.querySelector("#libEmptySearch");
  if(q && totalHits===0){
    if(!emptyP){
      emptyP=document.createElement("p");
      emptyP.className="sx-none";
      emptyP.id="libEmptySearch";
      emptyP.setAttribute("data-i18n-skip","");
      // placeholder: Claudette
      emptyP.textContent="Nothing in the library matches this search.";
      card.appendChild(emptyP);
    }
  } else if(emptyP){
    emptyP.remove();
  }
  buttons.forEach(b=>{
    const on=!q && b.getAttribute("data-lm")===libOn;
    if(b.classList) b.classList.toggle("on", on);
    if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
  });
  const sec=libSections().filter(s=>s.key===libOn)[0];
  const title=page.querySelector("#libTitle");
  const lede=page.querySelector("#libLede");
  if(title) title.textContent=q?String(libQuery||"").trim():(sec?sec.name:"");
  if(lede){
    const n=countEl&&countEl.textContent?countEl.textContent.trim():"";
    lede.textContent=!sec||q?"":(sec.key==="catmac"&&n)?(n+". "+sec.lede):(sec.key==="intents"&&n)?(t("Intents: {N}.").replace("{N}",n)+" "+sec.lede):sec.lede;
  }
}
function wireLibShell(page){
  if(!page||typeof page.querySelectorAll!=="function") return;
  const buttons=page.querySelectorAll(".sx-sec[data-lm]");
  if(!buttons||!buttons.length) return;
  buttons.forEach(b=>{
    b.onclick=()=>{
      libView="list";
      libOn=b.getAttribute("data-lm")||libOn;
      libQuery="";
      mgOpen.add(libOn);
      paintLibrary();
    };
  });
  const find=page.querySelector("#libSearch");
  if(find){
    find.oninput=()=>{
      libQuery=find.value;
      const at=find.selectionStart;
      paintLibrary();
      const again=document.getElementById("libSearch");
      if(!again) return;
      try{ again.focus(); if(at!=null && again.setSelectionRange) again.setSelectionRange(at, at); }catch(e){}
    };
    /* Escape empties the search and stays on the Library, as it does in Settings. */
    find.addEventListener("keydown",e=>{
      if(e.key!=="Escape" || !find.value) return;
      e.preventDefault();
      if(e.stopPropagation) e.stopPropagation();
      libQuery="";
      paintLibrary();
    });
  }
  const mt=page.querySelector("#libMaint");
  if(mt) mt.onclick=()=>openMaintenance();
}
const ICON_GRIP = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg>';
const ICON_REMOVE = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

let mgRoleMarked = "";

function setWhoList(nextList){
  const next = normWhoList(nextList);
  pack.who = (next.join("\u0000") === WHO_BASE.join("\u0000")) ? null : next;
  savePack();
  syncRoleDrum();
}

function roleUsesCards(){
  return (cards || []).filter(m => {
    const l = cardLang(m);
    const body = cardText(m, "body", l);
    return body.indexOf("{ROLE}") >= 0;
  });
}

function fillCardReply(m, markedName){
  const l = cardLang(m);
  const raw = cardText(m, "body", l);
  const was = roleSel ? roleSel.value : "";
  let res = "";
  try {
    if(roleSel) roleSel.value = markedName;
    res = fill(raw, m, true, l);
  } finally {
    if(roleSel) roleSel.value = was;
  }
  return escFilled(res);
}

function roleWheelHtml(names, markedName){
  let prev="", cur="", next="";
  const n=names.length;
  if(n>0){
    let i=names.indexOf(markedName);
    if(i<0) i=0;
    cur=names[i]||"";
    if(n===1){
      prev=cur; next=cur;
    } else {
      prev=names[(i-1+n)%n]||"";
      next=names[(i+1)%n]||"";
    }
  }
  return '<div class="lw-wheel">'+
    '<div class="lw-drum">'+
      '<span class="rd-prev p">'+esc(prev)+'</span>'+
      '<span class="rd-cur c">'+esc(cur)+'</span>'+
      '<span class="rd-next q">'+esc(next)+'</span>'+
    '</div>'+
    '<div class="lw-drumfield">'+esc(t("customer's name"))+'</div>'+
  '</div>';
}

function mgWhoRowsHtml(names, markedName){
  const tiles = names.map(name => {
    const on = name === markedName ? " on" : "";
    const moveTitle = t("Move {NAME}").replace("{NAME}", name);
    const takeTitle = t("Take {NAME} off the wheel").replace("{NAME}", name);
    return '<div class="lw-name'+on+'" tabindex="0" role="listitem" data-wrow="'+esc(name)+'">'+
      '<span class="g" aria-label="'+esc(moveTitle)+'" title="'+esc(moveTitle)+'">'+ICON_GRIP+'</span>'+
      '<span class="n">'+esc(name)+'</span>'+
      '<button type="button" class="lw-del" aria-label="'+esc(takeTitle)+'" title="'+esc(takeTitle)+'">'+ICON_REMOVE+'</button>'+
    '</div>';
  }).join("");

  const addRow = '<div class="lw-name add">'+
    '<span class="g">+</span>'+
    '<input type="text" id="mgAddWho" placeholder="'+esc(t("Add a name"))+'" aria-label="'+esc(t("Add a name"))+'" title="'+esc(t("Enter adds it; commas between names add several"))+'" spellcheck="false" autocomplete="off">'+
    '<kbd>Enter</kbd>'+
  '</div>';

  return tiles + addRow;
}

function mgWhoSideHtml(names, markedName){
  const uses = roleUsesCards();
  const wheel = roleWheelHtml(names, markedName);
  const countStr = uses.length > 0
    ? t("Cards that say the ROLE: {N}").replace("{N}", uses.length)
    : t("No card says the ROLE yet.");

  const reads = '<div class="lw-reads">'+
    uses.map(m => {
      const title = cardTitle(m);
      const filled = fillCardReply(m, markedName);
      return '<div class="lw-ct" role="button" tabindex="0" data-card-id="'+esc(m.id)+'" title="'+esc(t("Opens this card's editor"))+'" aria-label="'+esc(t("Opens this card's editor"))+'">'+
        '<div class="t">'+esc(title)+'</div>'+
        '<div class="r">'+filled+'</div>'+
      '</div>';
    }).join("")+
  '</div>';

  return '<div class="lw-side">'+
    '<div class="lw-h">'+esc(t("On the wheel"))+'</div>'+
    wheel+
    '<div class="lw-h lw-h2">'+esc(t("How it reads"))+' · <span class="lw-role-count">'+esc(countStr)+'</span></div>'+
    reads+
  '</div>';
}

function mgWhoSectionHtml(){
  const names = whoOptions();
  if(!names.includes(mgRoleMarked)) mgRoleMarked = names[0] || "";
  return '<div class="lw-role role-b">'+
    '<div class="lw-main">'+
      '<div class="lw-names">'+mgWhoRowsHtml(names, mgRoleMarked)+'</div>'+
    '</div>'+
    mgWhoSideHtml(names, mgRoleMarked)+
  '</div>';
}

function refreshRolePage(page){
  page = page || libPage() || document;
  const sec = page.querySelector('details.manage-sec[data-mg="who"] .manage-secbody');
  if(!sec) return;
  sec.innerHTML = mgWhoSectionHtml();
  wireRolePage(page);
  const cnt = page.querySelector('details.manage-sec[data-mg="who"] .mg-count');
  if(cnt) cnt.textContent = String(whoOptions().length);
  markCutText(page);
}

function wireRolePage(page){
  if(!page) return;
  const addInput = page.querySelector("#mgAddWho");
  if(addInput){
    addInput.onkeydown = e => {
      if(e.key === "Enter"){
        e.preventDefault();
        const val = addInput.value.trim();
        if(!val) return;
        const rawAdd = val.split(",").map(s => s.trim()).filter(Boolean);
        const current = whoOptions();
        const next = normWhoList(current.concat(rawAdd));
        setWhoList(next);
        addInput.value = "";
        refreshRolePage(page);
      }
    };
  }

  page.querySelectorAll(".lw-name:not(.add)").forEach(row => {
    row.onclick = e => {
      if(e.target.closest(".lw-del")) return;
      const name = row.getAttribute("data-wrow");
      if(!name) return;
      mgRoleMarked = name;
      refreshRolePage(page);
    };

    row.onkeydown = e => {
      const name = row.getAttribute("data-wrow");
      if(!name) return;
      if(e.key === "Delete"){
        e.preventDefault();
        const delBtn = row.querySelector(".lw-del");
        if(delBtn) delBtn.click();
        return;
      }
      if(e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")){
        e.preventDefault();
        const current = whoOptions().slice();
        const idx = current.indexOf(name);
        if(idx < 0) return;
        const targetIdx = e.key === "ArrowDown" ? idx + 1 : idx - 1;
        if(targetIdx < 0 || targetIdx >= current.length) return;
        current.splice(idx, 1);
        current.splice(targetIdx, 0, name);
        setWhoList(current);
        refreshRolePage(page);
        const newRow = page.querySelector('.lw-name[data-wrow="'+esc(name)+'"]');
        if(newRow) newRow.focus();
        return;
      }
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        row.click();
      }
    };

    const delBtn = row.querySelector(".lw-del");
    if(delBtn){
      delBtn.onclick = e => {
        e.stopPropagation();
        const name = row.getAttribute("data-wrow");
        if(!name) return;
        const current = whoOptions();
        const was = Array.isArray(pack.who) ? pack.who.slice() : null;
        const next = current.filter(n => n !== name);
        setWhoList(next);
        if(mgRoleMarked === name){
          mgRoleMarked = next[0] || "";
        }
        refreshRolePage(page);
        const undoMsg = t("Taken off the wheel: {NAME}.").replace("{NAME}", name);
        offerUndo(undoMsg, () => {
          pack.who = was;
          savePack();
          syncRoleDrum();
          mgRoleMarked = name;
          refreshRolePage(page);
        });
      };
    }
  });

  page.querySelectorAll(".lw-reads .lw-ct[data-card-id]").forEach(cardEl => {
    cardEl.onclick = () => {
      const cid = cardEl.getAttribute("data-card-id");
      if(cid) openCardEditor(cid, null, true);
    };
    cardEl.onkeydown = e => {
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        cardEl.click();
      }
    };
  });
}

function openManage(justHtml){
  applyCatsToGlobal();
  /* The page follows whichever fold is open. A fold the person closed stays closed: the
     redraw reads mgOpen and does not put a section back. */
  if(!libFold(libQuery)) libOn=rememberedLib();

  /* Full intentOrder, minus deleted ones - hidden stay in place, greyed, with a closed eye.
     The removed filter matters here: Manage is the one surface that shows hidden rows, and
     without it a deleted intent would still be listed and re-editable from this dialog. */
  const mgGoneIntents=new Set(pack.intentRemoved||[]);
  /* Same banding every other surface uses - favourites lifted, hidden sunk, dragged
     order kept within bands. Manage read the raw intentOrder instead, so starring here
     moved nothing while the panel moved it to the top. Built here rather than from
     intentRows() on purpose: that helper drops rows with no label in the current
     language - right for a search surface, wrong for the screen where you would FIX one. */
  const mgIntentIdxs=intentOrder
    .filter(i=>!mgGoneIntents.has(intentIdAt(i)))
    .map((i,n)=>({i,n}))
    .sort((a,b)=>{
      const ha=isIntentHiddenIdx(a.i)?1:0, hb=isIntentHiddenIdx(b.i)?1:0;
      if(ha!==hb) return ha-hb;
      const fa=isIntentFavourite(intentIdAt(a.i))?0:1, fb=isIntentFavourite(intentIdAt(b.i))?0:1;
      if(fa!==fb) return fa-fb;
      return a.n-b.n;
    })
    .map(x=>x.i);
  const catOf=primaryCatKeys(), linked=intentCardCounts();
  mgIntentCardsCache=mgIntentCardsMap();
  const intentListRows=mgIntentIdxs.map(i=>mgIntentRow(i,catOf,linked)).join("")
    ||'<div class="manage-empty">'+esc(t("No intents."))+'</div>';
  mgIntentCardsCache=null;

  const headingRow='<div class="lw-ihead" aria-hidden="true">'+
    '<span class="lw-ih-int">'+esc(t("Intent"))+'</span>'+
    '<span class="lw-ih-cards">'+esc(t("Linked cards"))+'</span>'+
    '<span class="lw-ih-acts"></span>'+
    '</div>';

  const catCount=Object.keys(CATS).length;
  /* Hiding is the one personal act with no way back at scale: hidden things are
     invisible BY DESIGN, accumulate quietly, and cannot be undone by finding them -
     finding them is the problem; the only other cure, Clear local changes, is a cliff
     where a step was wanted. The count is IN the label, so a greyed "(0)" answers "did I
     hide anything?" by itself. Not danger-red: showing again destroys nothing.
     NO equivalent for favourites, weighed and declined: a star is visible, leads every
     list, and is curated over months - bulk-erasing it is a real loss with no undo,
     against a need that almost never arises. */
  const hiddenCardCount=(cards||[]).filter(m=>m&&m._hidden).length;
  const hiddenIntentCount=mgIntentIdxs.filter(i=>isIntentHiddenIdx(i)).length;

  let relayLead=null;
  relayLead=libraryRelayLead(); /* plant:library-relay-host */
  const dataTail=relayLead
    ? '<span class="ec-where"><small>'+esc(t("Relay: {HOST}").split("{HOST}").join(relayLead.relay))+'</small></span>'
    : eCatalogFolder()
    ? catalogFolderTail(true)
    : '';
  const summaryTail=relayLead||!eCatalogFolder()?dataTail:catalogFolderTail(false);

  const mgBody=''+
    mgSec("catmac","Categories & cards",
      mgCatTree()+
      '<div class="cat-new" style="margin-top:8px">'+
        '<button type="button" class="btn" id="mgAddCat" title="Create a new category">New category…</button>'+
        mgShowHiddenBtn("cards",hiddenCardCount)+'</div>',
      catalogCountsLine("{MACROS} in {CARDS}, {CATEGORIES}",
        (cards||[]).length, totalMacroCount(), 0, catCount))+
    mgSec("intents","Intents",
      '<div class="mg-intents">'+headingRow+intentListRows+'</div>'+
      '<div class="cat-new" style="margin-top:8px">'+
        '<button type="button" class="btn" id="mgAddIntent" title="Write a new clause for {INTENT}">New intent…</button>'+
        mgShowHiddenBtn("intents",hiddenIntentCount)+'</div>',
      mgIntentIdxs.length)+
    /* Its own section, between the two lists it belongs with and the library-wide operations
       below. It is content in exactly the way categories, cards and intents are - the words a
       desk uses for who it is talking to - not a setting about the catalog file. */
    mgSec("who","ROLE suggestions",
      mgWhoSectionHtml(),
      whoOptions().length)+
    /* Everything here acts on the whole library rather than on one entry - what is loaded,
       taking a copy out, bringing one in - which is exactly the line that separates it from
       the two sections above. Not called "administrative" or "compliance": nothing is gated
       and nobody is being administered. */
    /* NOTHING IN THIS SECTION FLOATS. Every act belongs to the thing it acts on: the folder is
       the list's header and sits on Catalog and data's bar (.mg-data-bar), a catalog's own acts ride in its row, and
       bringing one in is the Library's, so it stands in the Library's bar. What is left here is
       the list, which is the answer to "what is on this desk". */
    mgSec("data","Catalog & data",
      (dataTail ? '<div class="mg-data-bar">'+dataTail+'</div>' : '')+
      '<div class="ec-list" id="mgCatList"></div>'+
      libraryActionsHtml(),
      null,
      summaryTail
    );
  if(justHtml) return mgBody;
  /* THE LIBRARY IS A TAB: opening it fronts the one tab, and a pop-up standing over it closes back
     onto it, which is how an editor opened from here returns. */
  libView="list";
  if(modalOpen()) closeModal(); /* plant:library-editor-closes-back */
  if(screenOn===LIB_SCREEN) paintLibrary(null,mgBody);
  else openScreenTab(LIB_SCREEN);
}
/* The tab's heading carries the catalog's file name for the reason an editor carries its entry's:
   every section is about one catalog, and only "Catalog & data" otherwise says which. */
function libraryHeadHtml(){
  const name=catalogFileName();
  if(libView==="history"){
    return '<div class="sx-nav-title"><h2>'+esc(t("Library"))+'</h2></div>';
  }
  return '<div class="screen-head"><h2>'+esc(t("Library"))+'</h2>'
    +(name?'<span class="screen-name" data-i18n-skip>'+esc(name)+'</span>':'')+'</div>';
}
const LIB_SCREEN="library";
// "list", or "history" while Earlier versions stands in the tab; a fresh open is the list.
let libView="list";
function libHost(){
  if(screenOn!==LIB_SCREEN) return null;
  const host=document.getElementById("screenHost");
  return host && !host.hidden ? host : null;
}
function libPage(){ const host=libHost(); return host ? host.querySelector(".lib-list") : null; }
function paintLibrary(host,body){
  host=host||libHost();
  if(!host) return;
  const isHist=libView==="history";
  const name=catalogFileName();
  host.innerHTML='<div class="sx lm lm-lib lib-screen lib-list'+(isHist?' is-history':'')+'" tabindex="-1">'
    +'<div class="lm-split">'
    +'<nav class="sx-nav" aria-label="'+esc(t("Library"))+'">'+libraryHeadHtml()
    +'<label class="sx-search">'+lmIcon("search")
    +'<input type="search" id="libSearch" autocomplete="off" spellcheck="false"'
    +' placeholder="'+esc(libFind())+'" aria-label="'+esc(libFind())+'" value="'+esc(libQuery)+'"></label>'
    +'<div class="sx-secs" id="libSecs">'+libNavHtml()+'</div>'
    +'<div class="sx-foot"><button type="button" class="sx-maint" id="libMaint">'+lmIcon("statistics")
    +esc(t("Maintenance"))+' <kbd>'+esc(formatActionChord("maintenance"))+'</kbd></button></div></nav>'
    +(isHist
      ? '<div class="sx-page" id="libPage"><div class="sx-crumb">'+esc(t("Library"))
        +' · <span data-i18n-skip>'+esc(t("Saved copies"))+'</span></div>'
        +'<div class="screen-head"><h2>'+esc(t("Saved copies"))+'</h2></div>'
        +'<div class="sx-card"><div id="ehView"></div></div></div>'
      : '<div class="sx-page" id="libPage"><div class="sx-crumb">'+esc(t("Library"))
        +(name?' · <span data-i18n-skip>'+esc(name)+'</span>':'')+'</div>'
        +'<h2 id="libTitle" data-i18n-skip></h2><p class="lede" id="libLede" data-i18n-skip></p>'
        +'<div class="sx-card">'+(body||openManage(true))+'</div></div>')
    +'</div>'
    +(isHist ? '<div class="screen-actions"><div class="mf-left"></div><button type="button" class="btn primary" id="ehClose">'+esc(t("Back to the Library"))+'</button></div>' : '')+'</div>';
  const page=host.querySelector(".lib-list");
  if(isHist){
    wireLibShell(page);
    openHistory(host.querySelector("#ehView")||host);
    const back=host.querySelector("#ehClose");
    if(back) back.onclick=()=>{ libView="list"; paintLibrary(host); };
  } else {
    wireLibrary(page);
    translateTree(page);
    applyLibView(page);
    dressDialogInputs(page);
    markCutText(page);
    updateTreeHoverTitles(page);
  }
  // The tab takes the keyboard where its wiring left focus nowhere inside it, as a dialog does.
  const at=document.activeElement;
  if(!page.contains(at) && !modalOpen() && !openCover() && !(at && at.closest && at.closest("#tourCard")))
    try{ page.focus({preventScroll:true}); }catch(e){}
}
registerScreen(LIB_SCREEN,{ title:()=>t("Library"), render:host=>paintLibrary(host) });
function wireLibrary(page){
  wireLibShell(page);
  $("#mgAddIntent").onclick=()=>openIntentEditor(null, true);
  $("#mgAddCat").onclick=()=>startMgCatAdd();
  wireRolePage(page);
  $("#mgImportCatalog").onclick=importCatalogHere;
  /* Join sits beside Load. It does not replace the catalog this desk has open. */
  const joinBtn=$("#mgJoinTeam");
  if(joinBtn) joinBtn.onclick=()=>openJoinPaste();
  if($("#mgHistory")) $("#mgHistory").onclick=()=>{ libView="history"; paintLibrary(); };
  paintCatalogList();
  /* BOTH LIVE INSIDE A SUMMARY, where a click is the browser's own way of folding the section:
     each stops the event before that happens. The path answers Enter and Space as well, the way
     the same control does on the empty screen - it is a code element, so nothing is given. */
  const openFolder=e=>{ e.preventDefault(); e.stopPropagation(); eOpenCatalogFolder(); };
  if(page && page.querySelectorAll) page.querySelectorAll("code.open-folder").forEach(fpath=>{
    fpath.onclick=openFolder;
    fpath.onkeydown=e=>{ if(e.key==="Enter"||e.key===" ") openFolder(e); };
  });
  /* The picker is the host's and its caption goes out already translated, the shell having no
     t(). Writing the key is the whole act: the shell watches the desk, re-aims its own watch and
     offers whatever the new folder holds, so the list is repainted from the answer rather than
     from a guess about when that has happened. */
  if(page && page.querySelectorAll) page.querySelectorAll("button.ec-where-edit").forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      eChooseCatalogFolder(t("Choose the folder Etiuda reads catalogs from")).then(dir=>{
        if(dir) paintLibrary();
      });
    };
  });
  const wipe=$("#mgWipe");
  if(wipe) wipe.onclick=askClearLocal;
  const bring=$("#mgBring");
  if(bring) bring.onclick=bringBackCleared;
  /* Remember which groups are open, so the re-render after every edit does not shut them.
     Written on toggle rather than read back later because openManage() replaces the nodes. */
  wireFolds(page,"details[data-mg]","details.manage-sec",
    d=>{ const k=d.getAttribute("data-mg"); if(d.open) mgOpen.add(k); else mgOpen.delete(k); });
  /* Expand / collapse a category. Only this button toggles - clicking the name edits it, and
     the row itself is a drag handle, so there is no ambiguous "click anywhere" target. */
  page.querySelectorAll("[data-toggle]").forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      // pinned like the sections; catToggle does its own measuring inside modalResize
      mgPinCard();
      catToggle(btn.closest(".mg-cat"), btn.getAttribute("data-toggle"));
      markCutText(btn.closest(".mg-cat"));
      updateTreeHoverTitles(page);
    };
  });

  page.querySelectorAll(".lw-head [data-sort-col]").forEach(btn=>{
    btn.onclick=()=>{
      mgSortClick(btn.getAttribute("data-sort-col"));
    };
    btn.onkeydown=e=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        mgSortClick(btn.getAttribute("data-sort-col"));
      }
    };
  });
  page.querySelectorAll(".mg-cat-body .manage-row.mg-card").forEach(r=>{
    r.addEventListener("pointerenter", ()=>updateTreeHoverTitles(page), {passive:true});
  });
  const treeEl = page.querySelector(".mg-tree");
  const cardBox = (treeEl && treeEl.closest(".sx-card")) || treeEl;
  if(cardBox && typeof ResizeObserver !== "undefined"){
    const ro = new ResizeObserver(() => {
      updateTreeHoverTitles(page);
    });
    ro.observe(cardBox);
  }

  // ---- card rows in the category tree
  /* Role toggles. Both repaint the pills and the cards, because the rings they control are on
     screen behind the dialog - the point of the toggle is watching that change. */
  page.querySelectorAll("[data-role-always]").forEach(btn=>{
    btn.onclick=()=>{
      const k=btn.getAttribute("data-role-always");
      mgRefreshAround(()=>{
        setCatAlways(k,!isAlwaysCat(k));
        rebuildCards(); drawPills(); render();
        toast((CATS[k]||k)+" "+t(isAlwaysCat(k)?"is now a supporting category"
                                       :"is an ordinary category"));
      });
    };
  });
  page.querySelectorAll("[data-add-card]").forEach(btn=>{
    // New cards are created inside a category, so the editor needs no category picker
    btn.onclick=()=>openCardEditor(null, btn.getAttribute("data-add-card"), true);
  });
  page.querySelectorAll("[data-edit-card]").forEach(btn=>{
    btn.onclick=()=>openCardEditor(btn.getAttribute("data-edit-card"), null, true);
  });
  page.querySelectorAll("[data-editcat]").forEach(btn=>{
    btn.onclick=()=>openCategoryEditor(btn.getAttribute("data-editcat"));
  });
  // hideCard is the same toggle the card uses, so the un-favourite rule cannot drift apart
  page.querySelectorAll("[data-hide-card],[data-show-card]").forEach(btn=>{
    btn.onclick=()=>{
      /* No render()/openManage() after this: mgRefreshAround() rebuilds the dialog itself,
         and a SECOND rebuild replaced every row the animation had just set up -
         cancelling it and losing the scroll. The bare render() that sat here was the
         same mistake one level down: hideCard() already ends in render(). Every mutator
         called from Manage repaints what it changed - do not add a repaint after one. */
      mgRefreshAround(()=>hideCard(btn.getAttribute("data-hide-card")||btn.getAttribute("data-show-card")));
    };
  });
  page.querySelectorAll("[data-remove-card]").forEach(btn=>{
    btn.onclick=()=>{ const id=btn.getAttribute("data-remove-card");
      // Confirm FIRST, outside the animation: a cancelled delete must not re-render anything.
      if(!findCard(id)) return;
      mgRefreshAround(()=>{ removeCard(id); }); };   // removeCard ends in rebuildCards()
  });
  page.querySelectorAll("[data-fav-card]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>toggleFavourite(btn.getAttribute("data-fav-card")));
  });
  page.querySelectorAll(".lw-chip[data-card-id]").forEach(chip=>{
    chip.onclick=e=>{
      e.stopPropagation();
      const cid=chip.getAttribute("data-card-id");
      if(cid) openCardEditor(cid, null, true);
    };
  });
  page.querySelectorAll("[data-edit-intent-mg]").forEach(btn=>{
    btn.onclick=()=>openIntentEditor(+btn.getAttribute("data-edit-intent-mg"), true);
  });
  page.querySelectorAll("[data-fav-intent-mg]").forEach(btn=>{
    // Starring lifts an intent to the top of the list, so it animates like every other move.
    btn.onclick=()=>mgRefreshAround(()=>toggleIntentFavourite(btn.getAttribute("data-fav-intent-mg")));
  });
  /* Both use setIntentHidden, so Manage and the panel cannot drift apart on the rule, and both
     go through mgRefreshAround for the same reason the star does: hiding sends a row to the
     bottom of the list, which is the longest move Manage makes and was the one that jumped. */
  /* Un-hide every hidden card, or every hidden intent. No confirm: it destroys nothing,
     and each one can be hidden again with the eye it came from. Routed through the SAME
     per-item functions the eye buttons call - hideCard also clears the runtime flag,
     setIntentHidden also touches the order - reproducing either here is how paths drift. */
  page.querySelectorAll("[data-show-hidden]").forEach(btn=>{
    btn.onclick=()=>{
      const kind=btn.getAttribute("data-show-hidden");
      if(kind==="cards"){
        const ids=(cards||[]).filter(m=>m&&m._hidden).map(m=>m.id);
        if(!ids.length) return;
        ids.forEach(id=>hideCard(id));            // a toggle, and every one of these IS hidden
        toast(ids.length===1?t("1 card shown again")
                    :t("{N} cards shown again").replace("{N}",ids.length));
      }else{
        const ids=(pack.intentHidden||[]).slice();
        if(!ids.length) return;
        ids.forEach(id=>setIntentHidden(id,false));
        toast(ids.length===1?t("1 intent shown again")
                    :t("{N} intents shown again").replace("{N}",ids.length));
      }
      paintLibrary();
    };
  });
  page.querySelectorAll("[data-hide-intent]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>setIntentHidden(btn.getAttribute("data-hide-intent"), true));
  });
  page.querySelectorAll("[data-show-intent]").forEach(btn=>{
    btn.onclick=()=>mgRefreshAround(()=>setIntentHidden(btn.getAttribute("data-show-intent"), false));
  });
  page.querySelectorAll("[data-remove-intent]").forEach(btn=>{
    btn.onclick=()=>{ if(removeIntent(btn.getAttribute("data-remove-intent"))) paintLibrary(); };
  });
  page.querySelectorAll("input.mg-cat-lab2[data-rename]").forEach(inp=>{
    const k=inp.getAttribute("data-rename");
    const orig=()=>CATS[k]||k;
    const apply=()=>{
      const name=inp.value.trim();
      if(!name || name===orig()){ inp.value=orig(); return; }
      if(!pack.catLabels) pack.catLabels={};
      pack.catLabels[k]=name;
      if(pack.customCats && pack.customCats[k]) pack.customCats[k]=name;
      savePack(); applyCatsToGlobal(); drawPills(); render();
      if(typeof drawIntentRail==="function") drawIntentRail();
      inp.value=name;
      toast("Category updated");
    };
    inp.addEventListener("focus",()=>{ try{ inp.select(); }catch(_){} });
    inp.addEventListener("keydown",e=>{
      if(e.key==="Enter"){ e.preventDefault(); inp.blur(); }
      else if(e.key==="Escape"){ e.preventDefault(); inp.value=orig(); inp.blur(); }
    });
    inp.addEventListener("blur",apply);
  });
  /* One deletion path for categories everywhere: removeCategory() owns the empty-only rule,
     the built-in / custom split, so the pill and this button cannot
     disagree about what is deletable. Look's Give it back removes only a category Look added (desk-look.js). */
  page.querySelectorAll("[data-delcat]").forEach(btn=>{
    btn.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      const k=btn.getAttribute("data-delcat");
      if(cardCounts[k]){ toast("Move or delete cards in this category first"); return; }
      if(removeCategory(k)){ mgOpen.delete("cat:"+k); drawPills(); render(); paintLibrary(); }
    };
  });
}

function libraryBodyHtml(){ return openManage(true); }

/* WHAT ACTS ON THE WHOLE LIBRARY, as rows of the Catalog and data page in the Settings row's own form. Join
   sits beside Load and does not replace the catalog this desk has open. */
function libraryActRow(key,icon,title,hint,ctl){
  return '<div class="set-row" data-row="'+esc(key)+'">'+lmIcon(icon)+'<div class="set-label">'+esc(title)
    +'<small>'+esc(hint)+'</small></div><div class="set-ctl">'+ctl+'</div></div>';
}
function libraryActionsHtml(){
  const join=joinDoorButton("mgJoinTeam");
  return '<div class="mg-data-acts">'
    +libraryActRow("load","data",t("Load catalog"),t("Loads a catalog file from this computer."),
      '<button type="button" class="btn" id="mgImportCatalog" title="Load a catalog file from disk: it is read as data, never executed. It replaces what is loaded now, and nothing on disk changes.">Load catalog…</button>')
    +(join?libraryActRow("join","teams",t("Join a team"),t("Joins a team with an invitation from its lead."),join):'')
    +(eHasHistory()?libraryActRow("history","refresh",t("Saved copies"),t("Each catalog this desk opens or saves leaves a copy here, kept for 30 days."),
      '<button type="button" class="btn" id="mgHistory">'+esc(t("Saved copies…"))+'</button>'):'')
    +(clearedHeld()
      ? libraryActRow("clear","delete",t("Bring back local changes"),
        t("These changes stay on this desk until Etiuda closes, and a restart leaves the catalog as delivered."),
        '<button type="button" class="btn" id="mgBring">'+esc(t("Bring back local changes"))+'</button>')
      : libraryActRow("clear","delete",t("Clear local changes"),t("Removes every change made to the content on this computer, so the catalog reads as delivered."),
        '<button type="button" class="btn danger" id="mgWipe">'+esc(t("Clear local changes"))+'</button>'))
    +'</div>';
}

export {
  libraryHeadHtml,
  mgCardRow,
  mgCardsIn,
  mgUsesTip,
  mgRefreshAround,
  libraryBodyHtml,
  openManage,
  wireManageDrag,
  libraryActionsHtml,
  paintLibrary,
  mgSortClick
};
