/* The catalog sitting beside Etiuda, offered rather than loaded, the watched file that
   offers the same way, and the dialog all three channels end in. */
import { activateCatalog, catalogEdited, catalogEditionOlder, catalogMacroCount,
  catalogIntentCount, exportCatalog, isCatalogUpdate } from "./catalog-file.js";
import { E_CATALOG_KEY, E_CATALOG_NAME, E_CATALOG_VERSION, catalogStamp, catalogVersionLabel,
  eCatalog, eCatalogAccepted, eCatalogSignature, storedCatalog, eWatchSupported, eWatchGet,
  eWatchClear, parseCatalogFile, eWatchName, eCatalogRefusedNames, eRefuseCatalogFile } from "./catalog.js";
import { eEmbeddedCatalog } from "./env.js";
import { E_CATALOG_SCRIPT, eCatalogFile, eCatalogFiles, eCatalogFolder, eCatalogFolderShort,
  eCatalogIn, eCatalogBuiltIn, eCatalogMtime, eHost, eLoadedCatalogFile, eOpenCatalogFolder, eOpenedWith,
  eOpenedRefused, eReadCatalogFile } from "./host.js";
import { ejectCatalog } from "./local-memory.js";
import { lsSet, nsGet, nsSet } from "./storage.js";
import { tourDueAtBoot, afterTour } from "./tour.js";
import { placeBubble } from "./bubble.js";
import { markCut } from "./cut-text.js";
import { cutLeaves, dismissNode } from "./motion.js";
import { catalogAwaitingLine, catalogCountsLine, t, toast, toastRefusal } from "./ui-lang.js";
import { esc } from "./esc.js";
import { cards, wholeThingEmpty } from "./app-state.js";
import { totalMacroCount } from "./card-counts.js";
import { cardFieldKey } from "./card-fields.js";
import { CATS, CONTENT_LANGS } from "./content-model.js";
import { intentIdAt, intentOrder } from "./intent-id.js";
import { pack } from "./pack.js";
import { ICON_AWAITING, ICON_SUCCESS } from "./icons.js";
import { catalogTrust, whenTrusted, heldCatalogTrust, recheckHeldTrust, trustMetaHtml, trustOfferLine,
  trustSettled } from "./catalog-trust.js";

/* A catalog sitting beside Etiuda is offered, never forced. Asked once per signature:
   accept it and it loads silently from then on, change it and you are asked again, so what
   you are running is always something you agreed to. Declining is remembered too, so the
   bar does not nag on every launch. */
/* WHERE THIS COPY FOUND IT, and the line says what this BUILD accepts rather than what one of
   them does: a host takes any .ec from its catalog folder, so the folder is half the answer and
   a bare filename leaves a person hunting for it; a browser takes the one sibling script its own
   tag names. The folder is the one the file came out of, which is not always the setting - a
   catalog beside the installation still loads. */
function eFoundHtml(name,where,builtIn){
  // Empty in a browser, where the fixed sibling name is the whole answer.
  const shown=String(name||"")||E_CATALOG_SCRIPT;
  if(builtIn) return t("{FILE} comes with Etiuda.").split("{FILE}").join('<code>'+esc(shown)+'</code>');
  /* A PLACEHOLDER KEY, not two halves round a <code>: every other language puts the folder
     somewhere else in the sentence, and a fragment cannot be reordered. split/join rather than
     replace, because a folder may legitimately hold a $ and a replacement string substitutes it. */
  /* THE FOLDER AS THE EMPTY DESK NAMES IT, short with the full path on hover; the catalog folder
     is also the link that opens it, as it is there. */
  const dir=String(where||""), home=!!dir && dir===eCatalogFolder();
  return t(where?"Located as {FILE} in {FOLDER}.":"Located as {FILE}.")
    .split("{FILE}").join('<code>'+esc(shown)+'</code>')
    .split("{FOLDER}").join('<code'+(home?' class="open-folder" data-ec-open="1" role="button" tabindex="0"':'')
      +' title="'+esc(dir)+'">'+esc(eCatalogFolderShort(dir))+'</code>');
}
/* `asked` means a person pointed at this file - the double-click channels of board 393 - and it
   buys two things a found file does not get: the offer outranks a remembered refusal, and an
   explicit act is answered even when there is nothing to offer. Silence was the whole bug. */
function eOfferCatalog(given,name,where,force,asked,builtIn){
  // An integrated build carries its own content; a sibling file is not its business
  if(eEmbeddedCatalog()) return false;
  const c=given||eCatalog();
  if(!c) return false;
  if(!force && !storedCatalog() && eCatalogAccepted(c)) return false;
  const file=name||eCatalogFile();
  const shipped=given?!!builtIn:eCatalogBuiltIn();
  const dir=shipped?"":(where||(eHost()?(eCatalogIn()||eCatalogFolder()):""));
  /* ONLY A FILE IN THE CATALOG FOLDER CAN MARK A ROW in the Library's list, so one opened from
     anywhere else names none. `given` is the watch handing over a file it has just read, and
     only the boot channel knows that file's date: the watch's is the date this load started
     with, older than what it is being handed, so it says nothing and the load's own moment
     stands in. */
  const mine=!!file && !!dir && dir===eCatalogFolder();
  const shown=eOfferCatalogDialog(c,{
    foundHtml:eFoundHtml(file,dir,shipped),
    refusedKey:"CatalogNo", force:!!force, asked:!!asked,
    accept:sig=>{ lsSet(E_CATALOG_KEY,sig);
      return activateCatalog(c,{file:mine?file:"", from:file||(eHost()?"":E_CATALOG_SCRIPT),
                                fileAt:(mine&&!given)?eCatalogMtime():0}); }
  });
  const active=asked&&!shown?storedCatalog():null;
  if(active && eCatalogSignature(active)===eCatalogSignature(c))
    toast(t("That file matches the catalog you already have."));
  return shown;
}
/* THE BOOT CHANNEL, and the two things it does differently: a refusal was said about the file as
   it then was, so a newer edition dropped into the folder asks again rather than being silenced
   by a "no" said to the last one, and a file this copy was OPENED with is an act of somebody's
   rather than a find. Only a host can date a file or hand one over, so a browser never forces. */
function eOfferCatalogAtBoot(){
  const at=+(nsGet("CatalogNoAt")||0), mt=eCatalogMtime(), asked=eOpenedWith();
  // A first run's tour asks for a catalog in its own step, so a found file waits for it to end.
  if(!asked && tourDueAtBoot()){ afterTour(eOfferCatalogAtBoot); return; }
  /* THE SAMPLE NEVER ASKS TO REPLACE A CATALOG THE PERSON CHOSE: it is found at every launch where
     Etiuda is installed and waits in the Library. Only an edition of the sample itself asks. */
  const found=eCatalog(), held=storedCatalog();
  if(!asked && found && found.sample && held && !isCatalogUpdate(found,held)) return;
  /* AN EMPTY DESK IS ASKED EVERY TIME, board 399's rule and 424's shape for it: a refusal was
     said to one launch, and somebody looking at nothing with a catalog in the folder is the
     fault the whole item answers. A desk with anything on it keeps the remembered no. */
  eOfferCatalog(null,"","",asked||wholeThingEmpty()||!!(at && mt && mt>at),asked);
}
/* THE WAY BACK FROM A DECLINE: the Load button beside each file in the Library's list, and the
   one on the empty state's own offer, both end here. Forced past the remembered refusal, because
   asking outranks it - the same rule the explicit watch check follows - and through the one
   bubble, which loads at once only where nothing is loaded. The date arrives from the row that was clicked: the
   host read it with the listing, and asking again would be asking for a second answer. */
function loadCatalogFromFolder(name,mtime){
  eReadCatalogFile(name).then(got=>{
    if(!got) return;
    if(!got.text){ toastRefusal(t("{FILE} could not be read.").split("{FILE}").join(String(name||""))); return; }
    let c=null;
    try{ c=parseCatalogFile(got.text); }
    catch(e){
      toastRefusal(t("{FILE} is not a catalog Etiuda can read.").split("{FILE}").join(got.name));
      return;
    }
    const shown=eOfferCatalogDialog(c,{
      foundHtml:eFoundHtml(got.name,eCatalogFolder()),
      refusedKey:"CatalogNo", force:true, asked:true, direct:true,
      accept:sig=>{ lsSet(E_CATALOG_KEY,sig);
        return activateCatalog(c,{file:got.name, fileAt:+mtime||0}); }
    });
    if(!shown) toast(t("That file matches the catalog you already have."));
  });
}
/* THE LIBRARY'S LIST OF CATALOGS, painted from this file rather than from the Library's own:
   the host's watch ends here, and a folder that changes under an open Library has to reach the
   list, which cannot be done the other way round - manage.js imports this file. One row per .ec
   in the folder, newest first as the host sorts them, the loaded one marked; what is loaded but
   is not one of those files takes a row of its own at the head, and that row is the only one a
   browser has. Repainting is free from anywhere: with no list on screen this does nothing. */
/* A WATCHED FILE IS A FACT ABOUT THE LOADED CATALOG, so it is that row's third line rather
   than a strip under the list: the two acts it offers are words in the sentence they belong to,
   which is the only place they mean anything. The pair travels as one - letting it break where
   it liked put a leading middle dot at the head of a line. */
function ecWatchHtml(){
  if(!(eWatchSupported() && eWatchName())) return "";
  return '<small class="ec-watch">'+esc(t("Watching"))+' <code>'+esc(eWatchName())+'</code> · '
    +'<span class="acts"><button type="button" class="act" data-ec-check="1" title="'
      +esc(t("Read that file again and offer it if it has changed"))+'">'
      +esc(t("Check for updates"))+'</button>'
    +'<span class="sep" aria-hidden="true">·</span>'
    +'<button type="button" class="act" data-ec-unwatch="1">'+esc(t("Stop watching"))
    +'</button></span></small>';
}
function ecRowHtml(o){
  return '<div class="ec-row'+(o.loaded?" is-loaded":"")+'">'
    +'<span class="ec-name"><b>'+esc(o.name)+'</b>'
    +(o.meta?'<small class="ec-meta">'+o.meta+'</small>':'')
    +(o.loaded?trustMetaHtml(heldCatalogTrust(), nsGet("Sample")==="1")+ecWatchHtml():'')+'</span>'
    /* A MARK RATHER THAN A WORD on the loaded row, and no tag at all on the sample. The row
       carrying the acts is the one with the least room, and a pill beside them wrapped the line
       of counts underneath. The sample is still never told it is Newer - it arrives after
       whatever is already in the folder and it is nobody's update. ICON_SUCCESS is the drawing;
       the site owns the name. */
    +(o.loaded?loadedTickHtml():'')
    +(o.newer&&!o.sample?'<span class="ec-tag" title="'+esc(t("Written after the catalog you have"))+'">'
        +esc(t("Newer"))+'</span>':'')
    +(o.loaded
      /* EXPORT IS THERE WHEN THERE IS SOMETHING TO EXPORT: with no edit of this desk's own on
         top of it, the file this catalog came out of already holds every word the export would
         write, and the button is a third act competing for the row's width. */
      ?(catalogEdited()
        ?'<button type="button" class="btn" id="mgExportCatalog" data-ec-export="1" title="'
          +esc(t("Save everything loaded now as a catalog file, your edits merged in"))+'">'
          +esc(t("Export…"))+'</button>':'')
        +'<button type="button" class="btn" data-ec-eject="1" title="'
        +esc(t("Put this catalog down and start empty"))+'">'+esc(t("Eject"))+'</button>'
      :'<button type="button" class="btn" data-ec-load="'+esc(o.name)+'" data-ec-at="'
        +(+o.mtime||0)+'">'+esc(t("Load"))+'</button>')
    +'</div>';
}
/* AN EMPTY FOLDER IS A ROW-SHAPED PLACEHOLDER and carries no button: what to do about it is
   already on the bar below, and a second Import here would be the same act twice on one
   screen. The folder itself stays clickable, because the answer is usually to put a file in
   it. Only where a host answers - a browser has no folder to be empty. */
function ecEmptyHtml(){
  const dir=eCatalogFolder();
  if(!dir) return "";
  return '<div class="ec-row ec-empty">'
    +t("Catalogs in {FOLDER} appear here: load one from anywhere else, or put its file in the folder.")
      .split("{FOLDER}").join('<code class="open-folder" data-ec-open="1" role="button"'
        +' tabindex="0" title="'+esc(dir)+'">'+esc(eCatalogFolderShort())+'</code>')
    +'</div>';
}
function loadedTickHtml(){
  const name=esc(t("Loaded"));
  return ICON_SUCCESS.replace('class="ic"','class="ic ec-tick"')
    .replace(' aria-hidden="true"',' role="img" aria-label="'+name+'"')
    .replace('><path','><title>'+name+'</title><path');
}
/* THE EDITION AND THEN THE SAME FIVE COUNTS THE LOADED ROW CARRIES, in that order and in those
   words: one list says one thing about a catalog, whether it is in use or sitting in the folder.
   The numbers are the host's, read off the file, and the rule behind each is written at ecCounts
   in shell/main.js. A count of -1 is a file the host could not read as a catalog, and the row
   then says what it does know rather than a nought that would be untrue. The awaiting phrases
   follow the counts on that same rule, and a file awaiting nothing carries none. */
function ecMeta(stamp,f){
  const parts=[stamp, f.cards>=0
    ? catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
        f.cards, f.macros, f.intents, f.cats)
    : ""].filter(Boolean).map(esc);
  return parts.concat(f.cards>=0?ecAwaitingHtml(f.awaiting):[]).join(" · ");
}
/* THE AWAITING COUNT OF THE CATALOG IN USE, board 505's rule read off the desk rather than off a
   file: one entry per language declared past the primary, holding the cards carrying no text in
   it. The population is the row's own card count - every card, put away or not - because the two
   numbers stand in one line and a subset counted another way reads as an error. CONTENT_LANGS is
   the declared order, primary first, and every declared code has a column - the table's own for
   the founding pair, a derived one for the rest, which is what cardFieldKey answers. */
function liveAwaiting(){
  return CONTENT_LANGS.slice(1).map(code=>{
    const key=cardFieldKey("body",code);
    const n=key?(cards||[]).filter(m=>m&&!String(m[key]||"").trim()).length:0;
    return {code:code, n:n};
  }).filter(o=>o.n>0);
}
/* What a row adds after its counts: one phrase per waiting language, in declared order, each
   naming its own language, wearing ICON_AWAITING. Nothing at all where nothing waits, on a
   row from either source. The phrase is escaped; the mark is markup. */
function ecAwaitingHtml(list){
  return (Array.isArray(list)?list:[]).filter(o=>o&&+o.n>0)
    .map(o=>'<span class="ec-await">'+ICON_AWAITING+esc(catalogAwaitingLine(+o.n,o.code))+'</span>');
}
/* The Library's own intent count: intentOrder keeps a deleted intent's slot, and the Intents
   section lists what survives. Counted the same way here, so one screen cannot carry two
   numbers for one list. */
function liveIntentCount(){
  const gone=new Set(pack.intentRemoved||[]);
  return intentOrder.filter(i=>!gone.has(intentIdAt(i))).length;
}
/* WHAT THE LOADED ROW SAYS INSTEAD OF A FILE'S SIZE: the counts the green summary line above
   this list used to carry, which are the catalog with this desk's own edits in it - so this row
   is about the catalog in use and every other row is about a file on disk. `stamp` is what the
   file has to offer where the applied catalog names no edition. */
function loadedMeta(stamp){
  const ver=(E_CATALOG_VERSION!=null)?catalogVersionLabel(E_CATALOG_VERSION):"";
  const parts=[ver||stamp,
    catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
      (cards||[]).length, totalMacroCount(), liveIntentCount(), Object.keys(CATS).length)]
    .filter(Boolean).map(esc);
  return parts.concat(ecAwaitingHtml(liveAwaiting())).join(" · ");
}
/* WHICH COPY A ROW IS, where two could be: the one Etiuda ships, or this folder's file of the same
   name, which is read in its place. */
function ecCopyHtml(f){
  const said=f.builtIn ? t("comes with Etiuda") : f.replaces ? t("takes the place of the copy that comes with Etiuda") : "";
  return said ? '<span class="ec-copy" data-ec-copy="'+(f.builtIn?"builtin":"own")+'">'+esc(said)+'</span>' : "";
}
function paintCatalogList(){
  const box=document.getElementById("mgCatList");
  if(!box) return;
  const held=storedCatalog();
  const mine=eLoadedCatalogFile();
  recheckHeldTrust(eCatalog(),held,paintCatalogList);
  eCatalogFiles().then(files=>{
    if(!box.isConnected) return;
    /* WHICH ROW IS THE CATALOG IN USE. The file the load recorded, first: that is the one route
       that knows. Where no route recorded a file - an import through the picker names a file
       this list cannot address, and a desk older than the key names none - the newest file that
       IS this catalog by the identity rule of board 431 takes the mark instead. One catalog is
       one row whichever way it was loaded; before this, the imported copy took a row of its own
       at the head and the folder listed the very same file again beneath it. */
    let onAt=mine?files.findIndex(f=>f.name===mine):-1;
    if(onAt<0 && held) onAt=files.findIndex(f=>isCatalogUpdate({id:f.id,name:f.catalogName},held));
    /* WHAT "NEWER" IS MEASURED AGAINST: the file's own date at the moment it was loaded, so the
       loaded file rewritten since is marked too. A desk older than that key falls back to the
       loaded row's date, which can only under-mark - the safe direction. */
    const at=+(nsGet("CatalogFileAt")||0) || ((files[onAt]||{}).mtime||0);
    const rows=files.map((f,i)=>{
      const on=i===onAt;
      const stamp=catalogStamp(f.edition,f.mtime);
      const copy=ecCopyHtml(f), meta=on?loadedMeta(stamp):ecMeta(stamp,f);
      return ecRowHtml({ name:f.name, mtime:f.mtime, loaded:on, newer:at>0 && f.mtime>at,
        sample:!!f.sample, meta:copy&&meta ? copy+" · "+meta : copy||meta });
    });
    /* THE CATALOG IN USE ALWAYS HAS A ROW, even where no file in the folder is it: a browser's
       import, a copy loaded from elsewhere, or a desk whose catalog was applied before the store
       existed. What is APPLIED decides rather than what is stored, because "no catalog" over two
       hundred visible cards is worse than useless. */
    const applied=(typeof E_CATALOG_NAME!=="undefined" && E_CATALOG_NAME) ? E_CATALOG_NAME : "";
    if((held||applied||(cards||[]).length) && onAt<0)
      rows.unshift(ecRowHtml({ name:shownCatalogName(String(applied||(held&&held.name)||"")),
        loaded:true, newer:false, meta:loadedMeta("") }));
    box.innerHTML=rows.length?rows.join(""):ecEmptyHtml();
    box.querySelectorAll("button[data-ec-load]").forEach(b=>{
      b.onclick=()=>loadCatalogFromFolder(b.getAttribute("data-ec-load"),
                                          +b.getAttribute("data-ec-at")||0);
    });
    const out=box.querySelector("button[data-ec-eject]");
    if(out) out.onclick=ejectCatalog;
    /* Wired here rather than in the Library, because the row is painted after that dialog has
       finished wiring itself: the host answers the folder asynchronously. */
    const exp=box.querySelector("button[data-ec-export]");
    if(exp) exp.onclick=()=>exportCatalog();
    const chk=box.querySelector("button[data-ec-check]");
    if(chk) chk.onclick=()=>eCheckWatchedFile(true);
    const stop=box.querySelector("button[data-ec-unwatch]");
    if(stop) stop.onclick=()=>eWatchClear().then(()=>{
      toast(t("No longer watching that file."));
      paintCatalogList();
    });
    const dir=box.querySelector("[data-ec-open]");
    if(dir){
      dir.onclick=()=>eOpenCatalogFolder();
      dir.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); eOpenCatalogFolder(); } };
    }
  });
}
/* Every channel ends here: same guards, same wording, same promise about what is kept.
   Returns whether anything was actually put on screen, which is how an explicit check
   knows to say the file matched. */
let offerStanding=null;
/* A BUBBLE HANGING FROM THE TOP BAR'S CATALOG NAME, never a window: the desk stays usable under it,
   and a click anywhere else leaves it standing until it is answered. */
function eOfferCatalogDialog(c,src){
  const sig=eCatalogSignature(c);
  /* Silent when the sibling is already what is loaded. Offered when nothing is loaded, and
     also when something different is loaded - editing the sibling file, or importing another
     catalog, both surface here rather than being applied behind the user's back. */
  const active=storedCatalog();
  if(active && eCatalogSignature(active)===sig) return false;
  /* A refusal is remembered so boot does not nag, but ASKING outranks it: an explicit check
     that answered "already have it" about a file you declined would simply be untrue. */
  if(!src.force && src.refusedKey && nsGet(src.refusedKey)===sig) return false;
  catalogTrust(c);
  /* A CATALOG SOMEBODY CHOSE LOADS AT ONCE ON AN EMPTY DESK: nothing is put down, so there is
     nothing to ask. Over a loaded catalog the question stands. */
  if(src.direct && !active){ whenTrusted(c).then(()=>src.accept(sig)); return true; }
  /* NOT OVER THE LIBRARY, and only a file somebody pointed at gets past this. That screen lists
     every catalog in the folder, marks the one loaded and offers Load on each row, so a question
     about the folder argues with a person already looking at the answer. Ruled 2026-09-17. */
  if(!src.asked && document.getElementById("mgCatList")){
    paintCatalogList(); return false;
  }
  /* One bubble at a time. A file somebody chose takes the place of one found and left standing,
     since that is the question they are waiting on; anything found waits behind the one up. */
  if(document.getElementById("eCatalogOffer")){
    if(!src.asked || !offerStanding) return false;
    offerStanding();
  }
  const replacing=!!active;
  const updating=isCatalogUpdate(c,active);
  const older=updating && catalogEditionOlder(c.version, active.version);
  const n=(c.cards||[]).length,
        i=catalogIntentCount(c),
        k=Object.keys(c.categories||{}).length;
  const trustHtml=line=>line?'<p class="ec-trust">'+esc(line)+'</p>':'';
  const wrap=document.createElement("div");
  wrap.className="bub bub-ask e-offer";
  wrap.id="eCatalogOffer";
  wrap.setAttribute("role","dialog");
  wrap.setAttribute("aria-labelledby","ecTitle");
  wrap.innerHTML=
    /* REPLACING IS THE MIRROR OF LOADING, ruled 2026-09-17: one catalog is being put down and
       another taken up, which the question asks and no sentence beneath it can improve on. The
       two editions of ONE catalog keep their sentence: what is at stake there is what happens to
       this desk's own work, which the screen cannot show. */
    '<h3 id="ecTitle">'+esc(t(older?"Older catalog found":updating?"Updated catalog found"
        :replacing?"Replace catalog?":"Load catalog?"))+'</h3>'
    +(updating
        ? '<p class="ec-sub">'+esc(t(older
            ? "This file is an earlier edition than the one loaded now."
            : "This catalog has changed since it was loaded."))+'</p>'
        : '')
    // Name and edition on one line, counts on the next: WHICH catalog, then how big it is.
    +'<div class="ec-what"><b>'+esc(String(c.name||"Catalog"))+'</b>'
    +(c.version!=null?' · '+esc(catalogVersionLabel(c.version)):'')
    +(updating && active.version!=null && String(active.version)!==String(c.version)
        ? '<div class="ec-counts">'+esc(t("You have {V}.")).replace("{V}",esc(catalogVersionLabel(active.version)))+'</div>'
        : '')
    /* A single text node, which the sweep cannot reach inside: the line is built from counted
       noun phrases and the key carries only their order. */
    +'<div class="ec-counts">'
    +catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
       n, catalogMacroCount(c), i, k)
    +'</div></div>'
    /* The filename is an element, so this paragraph is not a leaf and the sweep would skip
       it - each half is translated where it is written, and the <code> stays between them. */
    +'<p class="ec-sub">'+src.foundHtml
    +(updating?' '+esc(t("Your own cards and edits are kept.")):'')+'</p>'
    +trustHtml(trustOfferLine(trustSettled(c),updating))
    +'<div class="tour-actions">'
    +'<button type="button" class="btn" id="ecNo">'+esc(t(replacing?"Keep current":"Not now"))+'</button>'
    +'<button type="button" class="btn primary" id="ecYes">'+esc(t(older?"Load it anyway":updating?"Load the update":replacing?"Load it":"Load catalog"))+'</button>'
    +'</div>';
  cutLeaves();
  document.body.appendChild(wrap);
  // Placed against the indicator, and again on a resize, since it may outlive one.
  const place=()=>{
    const at=document.getElementById("catNow"), r=at && at.getBoundingClientRect();
    placeBubble(wrap, (r && r.width) ? {top:r.top, left:r.left, width:r.width, height:r.height}
      : {top:0, left:innerWidth-24, width:0, height:40}, {width:340});
  };
  place();
  addEventListener("resize",place);
  // A verification still running when the bubble opened adds its line once it has an answer.
  if(!wrap.querySelector(".ec-trust")) catalogTrust(c).then(state=>{
    const line=trustOfferLine(state,updating);
    if(!line || !wrap.isConnected || wrap.querySelector(".ec-trust")) return;
    wrap.querySelector(".tour-actions").insertAdjacentHTML("beforebegin",trustHtml(line));
    place();
  });
  const close=()=>{ removeEventListener("resize",place); dismissNode(wrap); if(offerStanding===close) offerStanding=null; };
  offerStanding=close;
  /* Escape answers nothing and records no refusal, so a stray press only postpones the question
     to the next launch; it is the bubble's own key, and only while the keyboard is inside it. */
  wrap.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation();
    close();
  });
  /* Reloads on success, so nothing after it runs. Storage that refuses the catalog returns false
     instead, and the bubble has to come down: left standing over its own failure toast it reads
     as a button that does nothing. */
  /* After the signature has been read, or its wait is over, so the state stored is this file's. */
  let taking=false;
  wrap.querySelector("#ecYes").onclick=()=>{
    if(taking) return;
    taking=true;
    whenTrusted(c).then(()=>{ taking=false; if(src.accept(sig)===false) close(); });
  };
  wrap.querySelectorAll("[data-ec-open]").forEach(el=>{
    el.onclick=()=>eOpenCatalogFolder();
    el.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); eOpenCatalogFolder(); } };
  });
  wrap.querySelector("#ecNo").onclick=()=>{
    /* The date as well as the signature: the signature says WHAT was refused and the date says
       WHEN, which is what lets a later edition of the same file ask again. */
    if(src.refusedKey){ nsSet(src.refusedKey,sig); nsSet(src.refusedKey+"At",String(Date.now())); }
    close();
  };
  // Only an act of somebody's takes the keyboard; a file found at boot leaves it in the search.
  if(src.asked){ const yes=wrap.querySelector("#ecYes"); if(yes) yes.focus(); }
  return true;
}
/* THE FILE DIALOG'S CATALOG, asked about in the same bubble as every other route. */
function eOfferPickedCatalog(c,name,accept){
  const shown=eOfferCatalogDialog(c,{foundHtml:eFoundHtml(name,""), force:true, asked:true,
    direct:true, accept:()=>accept()});
  if(!shown) toast(t("That file matches the catalog you already have."));
}
/* A catalog file that names itself nothing is stored as "Unnamed catalog" (catalog.js) and shown
   in the interface's language. */
function shownCatalogName(n){ return (!n || n==="Unnamed catalog") ? t("Unnamed catalog") : n; }
/* THE TOP BAR SAYS WHICH CATALOG IS LOADED, and nothing else: inert, and no replacement for the
   Library. What is applied decides, as in the Library's list. */
function paintCatNow(){
  const el=document.getElementById("catNow");
  if(!el) return;
  const held=storedCatalog();
  const name=String((typeof E_CATALOG_NAME!=="undefined" && E_CATALOG_NAME) || (held && held.name) || "");
  /* The file's name, extension and all, so the file is known again among the person's own; the
     name inside the catalog only where no route named a file (catalog-file.js, CatalogFrom). */
  const file=(name||held) ? String(nsGet("CatalogFrom")||eLoadedCatalogFile()||"") : "";
  const shown=file||(name ? shownCatalogName(name) : "");
  const own=el.querySelector(".cn-name"), none=el.querySelector(".cn-none");
  if(own){ own.textContent=shown; own.hidden=!shown; if(shown) markCut(own); }
  // The sweep translates from the English it finds recorded here, so a language switch follows.
  if(none){ const key=held?"Unnamed catalog":"No catalog loaded";
    none.setAttribute("data-i18n-text",key); none.textContent=t(key); none.hidden=!!shown; }
}

/* The watched file. Silent at boot and only while the browser still holds permission:
   re-granting needs a user gesture, which is what `interactive` supplies. The stored edit
   time is a skip, not the answer - the signature decides whether anything really changed. */
function eCheckWatchedFile(interactive){
  if(!eWatchSupported()) return;
  if(document.getElementById("eCatalogOffer")) return;
  eWatchGet().then(h=>{
    if(!h){ if(interactive) toast(t("No catalog file is being watched.")); return null; }
    const q=h.queryPermission?h.queryPermission({mode:"read"}):"granted";
    return Promise.resolve(q).then(state=>{
      if(state==="granted") return h;
      if(!interactive) return null;
      return h.requestPermission({mode:"read"}).then(v=>v==="granted"?h:null);
    }).then(ok=>{
      if(!ok){ if(interactive) toast(t("Etiuda needs permission to read that file again.")); return null; }
      return ok.getFile().then(f=>{
        const seen=nsGet("WatchSeen");
        if(!interactive && seen && String(f.lastModified||0)===seen) return null;
        nsSet("WatchSeen",String(f.lastModified||0));
        return f.text().then(text=>{
          let c=null;
          try{ c=parseCatalogFile(text); }
          catch(e){ if(interactive) toastRefusal(t("That file is not a catalog Etiuda can read.")); return null; }
          const shown=eOfferCatalogDialog(c,{
            /* No folder: this file was PICKED, so it may sit anywhere, and naming the catalog
               folder beside it would say it came from there. */
            foundHtml:eFoundHtml(eWatchName()||f.name,""),
            refusedKey:"WatchNo", force:!!interactive, asked:!!interactive,
            accept:()=>activateCatalog(c,{from:eWatchName()||f.name})
          });
          if(!shown && interactive) toast(t("That file matches the catalog you already have."));
          return null;
        });
      });
    });
  }).catch(()=>{ if(interactive) toastRefusal(t("Could not read the watched file.")); });
}
/* The third channel into the dialog above, spec 11.5: the desktop host watches the file beside
   Etiuda and hands over its text when it changes. The picker channel cannot serve here - there
   is no handle and no permission to re-grant - but the promise is the same one, so an edit
   surfaces as an offer rather than replacing what somebody is working in. */
/* A file somebody asked for is answered even when it cannot be offered: `why` is the host's
   refusal, "read" for a file it could not open and anything else for one it would not parse. */
function refuseAskedFile(name,why){
  toastRefusal(t(why==="read"?"{FILE} could not be read.":"{FILE} is not a catalog Etiuda can read.")
    .split("{FILE}").join(String(name||"")));
}
function wireHostCatalogWatch(){
  const h=(typeof window!=="undefined" && window.E_HOST)||null;
  if(!h || typeof h.onCatalogFile!=="function") return;
  /* A FILE THE HOST HANDED AND THIS ENGINE REFUSED is said as a double-clicked one is, found or
     asked for: the host passed it over for the next, and a desk that never names it looks empty
     or stale for no reason anybody can see. The newest refused is the one named. */
  eCatalog();
  const cold=eOpenedRefused()||(eCatalogRefusedNames().length?{name:eCatalogRefusedNames()[0],why:"parse"}:null);
  // Deferred with the same hand as the boot's other toasts: no toast host exists this early.
  if(cold) setTimeout(()=>{ try{ refuseAskedFile(cold.name,cold.why); }catch(e){} },1400);
  h.onCatalogFile((text,name,where,asked,why,builtIn)=>{
    /* The list first, and whatever this text turns out to be: the folder has changed, so a
       Library standing open is out of date whether or not the file is one it can offer. */
    paintCatalogList();
    let c=null;
    try{ if(!why) c=parseCatalogFile(text); }catch(e){ c=null; }
    if(!c && !why){
      refuseAskedFile(name,"parse");
      const next=eRefuseCatalogFile(name);
      let n=null;
      try{ n=next?parseCatalogFile(String(next.json)):null; }catch(e){ n=null; }
      if(n && !asked) eOfferCatalog(n,String(next.file||""),String(next.in||""),false,false,!!next.builtIn);
      return;
    }
    if(!c){ if(asked) refuseAskedFile(name,why||"parse"); return; }
    eOfferCatalog(c,name,where,!!asked,!!asked,builtIn);
  });
}
export {
  eCheckWatchedFile,
  paintCatalogList,
  eOfferCatalog,
  eOfferCatalogAtBoot,
  eOfferCatalogDialog,
  eOfferPickedCatalog,
  paintCatNow,
  loadCatalogFromFolder,
  wireHostCatalogWatch
};
