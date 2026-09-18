/* The catalog sitting beside Etiuda, offered rather than loaded, the watched file that
   offers the same way, and the dialog all three channels end in. */
import { activateCatalog, catalogEdited, catalogEditionOlder, catalogMacroCount, exportCatalog,
  isCatalogUpdate } from "./catalog-file.js";
import { E_CATALOG_KEY, E_CATALOG_NAME, E_CATALOG_VERSION, catalogStamp, catalogVersionLabel,
  eCatalog, eCatalogAccepted, eCatalogSignature, storedCatalog, eWatchSupported, eWatchGet,
  eWatchClear, parseCatalogFile, eWatchName } from "./catalog.js";
import { eEmbeddedCatalog } from "./env.js";
import { E_CATALOG_SCRIPT, eCatalogFile, eCatalogFiles, eCatalogFolder, eCatalogFolderShort,
  eCatalogIn, eCatalogMtime, eHost, eLoadedCatalogFile, eOpenCatalogFolder, eOpenedWith,
  eReadCatalogFile } from "./host.js";
import { ejectCatalog, ejectedJustNow } from "./local-memory.js";
import { MG_REOPEN, lsSet, nsGet, nsSet, ssGet } from "./storage.js";
import { maybeShowTourInvite } from "./tour.js";
import { catalogCountsLine, t, toast } from "./ui-lang.js";
import { esc } from "./esc.js";
import { cards, wholeThingEmpty } from "./app-state.js";
import { totalMacroCount } from "./card-counts.js";
import { CATS } from "./content-model.js";
import { intentIdAt, intentOrder } from "./intent-id.js";
import { pack } from "./pack.js";

/* A catalog sitting beside Etiuda is offered, never forced. Asked once per signature:
   accept it and it loads silently from then on, change it and you are asked again, so what
   you are running is always something you agreed to. Declining is remembered too, so the
   bar does not nag on every launch. */
/* WHERE THIS COPY FOUND IT, and the line says what this BUILD accepts rather than what one of
   them does: a host takes any .ec from its catalog folder, so the folder is half the answer and
   a bare filename leaves a person hunting for it; a browser takes the one sibling script its own
   tag names. The folder is the one the file came out of, which is not always the setting - a
   catalog beside the installation still loads. */
function eFoundHtml(name,where){
  // Empty in a browser, where the fixed sibling name is the whole answer.
  const shown=String(name||"")||E_CATALOG_SCRIPT;
  /* A PLACEHOLDER KEY, not two halves round a <code>: every other language puts the folder
     somewhere else in the sentence, and a fragment cannot be reordered. split/join rather than
     replace, because a folder may legitimately hold a $ and a replacement string substitutes it. */
  return t(where?"Located as {FILE} in {FOLDER}.":"Located as {FILE}.")
    .split("{FILE}").join('<code>'+esc(shown)+'</code>')
    .split("{FOLDER}").join('<code>'+esc(String(where))+'</code>');
}
/* `asked` means a person pointed at this file - the double-click channels of board 393 - and it
   buys two things a found file does not get: the offer outranks a remembered refusal, and an
   explicit act is answered even when there is nothing to offer. Silence was the whole bug. */
function eOfferCatalog(given,name,where,force,asked){
  // An integrated build carries its own content; a sibling file is not its business
  if(eEmbeddedCatalog()) return false;
  const c=given||eCatalog();
  if(!c) return false;
  if(!force && !storedCatalog() && eCatalogAccepted(c)) return false;
  const file=name||eCatalogFile();
  const dir=where||(eHost()?(eCatalogIn()||eCatalogFolder()):"");
  /* ONLY A FILE IN THE CATALOG FOLDER CAN MARK A ROW in the Library's list, so one opened from
     anywhere else names none. `given` is the watch handing over a file it has just read, and
     only the boot channel knows that file's date: the watch's is the date this load started
     with, older than what it is being handed, so it says nothing and the load's own moment
     stands in. */
  const mine=!!file && !!dir && dir===eCatalogFolder();
  const shown=eOfferCatalogDialog(c,{
    foundHtml:eFoundHtml(file,dir),
    refusedKey:"CatalogNo", force:!!force, asked:!!asked,
    accept:(sig,updating)=>{ lsSet(E_CATALOG_KEY,sig);
      return activateCatalog(c,{keepPersonal:updating, file:mine?file:"",
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
  /* Read whatever else this launch decides, so the launch after an eject asks like any other. */
  if(ejectedJustNow()) return;
  const at=+(nsGet("CatalogNoAt")||0), mt=eCatalogMtime(), asked=eOpenedWith();
  /* AN EMPTY DESK IS ASKED EVERY TIME, board 399's rule and 424's shape for it: a refusal was
     said to one launch, and somebody looking at nothing with a catalog in the folder is the
     fault the whole item answers. A desk with anything on it keeps the remembered no. */
  eOfferCatalog(null,"","",asked||wholeThingEmpty()||!!(at && mt && mt>at),asked);
}
/* THE WAY BACK FROM A DECLINE: the Load button beside each file in the Library's list, and the
   one on the empty state's own offer, both end here. Forced past the remembered refusal, because
   asking outranks it - the same rule the explicit watch check follows - and through the one
   dialog, so nothing loads behind anybody. The date arrives from the row that was clicked: the
   host read it with the listing, and asking again would be asking for a second answer. */
function loadCatalogFromFolder(name,mtime){
  eReadCatalogFile(name).then(got=>{
    if(!got) return;
    if(!got.text){ toast(t("{FILE} could not be read.").split("{FILE}").join(String(name||""))); return; }
    let c=null;
    try{ c=parseCatalogFile(got.text); }
    catch(e){
      toast(t("{FILE} is not a catalog Etiuda can read.").split("{FILE}").join(got.name));
      return;
    }
    const shown=eOfferCatalogDialog(c,{
      foundHtml:eFoundHtml(got.name,eCatalogFolder()),
      refusedKey:"CatalogNo", force:true, asked:true,
      accept:(sig,updating)=>{ lsSet(E_CATALOG_KEY,sig);
        return activateCatalog(c,{keepPersonal:updating, file:got.name, fileAt:+mtime||0}); }
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
    +(o.meta?'<small class="ec-meta">'+esc(o.meta)+'</small>':'')
    +(o.loaded?ecWatchHtml():'')+'</span>'
    /* A MARK RATHER THAN A WORD on the loaded row, and no tag at all on the sample. The row
       carrying the acts is the one with the least room, and a pill beside them wrapped the line
       of counts underneath. The sample is still never told it is Newer - it arrives after
       whatever is already in the folder and it is nobody's update. */
    +(o.loaded?'<svg class="ec-tick" viewBox="0 0 20 20" role="img" aria-label="'+esc(t("Loaded"))
        +'"><title>'+esc(t("Loaded"))+'</title><path d="M4.4 10.4l3.6 3.6L15.6 6.4"/></svg>':'')
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
    +t("No catalogs in {FOLDER} yet. Import one, or drop a file into the folder.")
      .split("{FOLDER}").join('<code class="open-folder" data-ec-open="1" role="button"'
        +' tabindex="0" title="'+esc(dir)+'">'+esc(eCatalogFolderShort())+'</code>')
    +'</div>';
}
/* THE EDITION AND THEN THE SAME FIVE COUNTS THE LOADED ROW CARRIES, in that order and in those
   words: one list says one thing about a catalog, whether it is in use or sitting in the folder.
   The numbers are the host's, read off the file, and the rule behind each is written at ecCounts
   in shell/main.js. A count of -1 is a file the host could not read as a catalog, and the row
   then says what it does know rather than a nought that would be untrue. */
function ecMeta(stamp,f){
  return [stamp, f.cards>=0
    ? catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
        f.cards, f.macros, f.intents, f.cats)
    : ""].filter(Boolean).join(" · ");
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
  return [ver||stamp,
    catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
      (cards||[]).length, totalMacroCount(), liveIntentCount(), Object.keys(CATS).length)]
    .filter(Boolean).join(" · ");
}
function paintCatalogList(){
  const box=document.getElementById("mgCatList");
  if(!box) return;
  const held=storedCatalog();
  const mine=eLoadedCatalogFile();
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
      return ecRowHtml({ name:f.name, mtime:f.mtime, loaded:on, newer:at>0 && f.mtime>at,
        sample:!!f.sample, meta:on?loadedMeta(stamp):ecMeta(stamp,f) });
    });
    /* THE CATALOG IN USE ALWAYS HAS A ROW, even where no file in the folder is it: a browser's
       import, a copy loaded from elsewhere, or a desk whose catalog was applied before the store
       existed. What is APPLIED decides rather than what is stored, because "no catalog" over two
       hundred visible cards is worse than useless. */
    const applied=(typeof E_CATALOG_NAME!=="undefined" && E_CATALOG_NAME) ? E_CATALOG_NAME : "";
    if((held||applied||(cards||[]).length) && onAt<0)
      rows.unshift(ecRowHtml({ name:String(applied||(held&&held.name)||t("Unnamed catalog")),
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
/* Both channels end here: same guards, same wording, same promise about what is kept.
   Returns whether anything was actually put on screen, which is how an explicit check
   knows to say the file matched. */
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
  /* NOT OVER THE LIBRARY, and only a file somebody pointed at gets past this. That screen lists
     every catalog in the folder, marks the one loaded and offers Load on each row, so a dialog
     about the folder argues with a person already looking at the answer. MG_REOPEN as well as
     the list itself: a Load or an Eject made there reloads, and the offer would arrive on the far
     side of the reload, over the screen the act was made in. Ruled 2026-09-17. */
  if(!src.asked && (document.getElementById("mgCatList") || ssGet(MG_REOPEN))){
    paintCatalogList(); return false;
  }
  if(document.getElementById("eCatalogModal")) return false;
  const replacing=!!active;
  const updating=isCatalogUpdate(c,active);
  const older=updating && catalogEditionOlder(c.version, active.version);
  const n=(c.cards||[]).length,
        i=((c.intents||{}).en||[]).length,
        k=Object.keys(c.categories||{}).length;
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id="eCatalogModal";
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'
    +'<h2>'+esc(t(older?"Older catalog found":updating?"Updated catalog found"
        :replacing?"Different catalog found":"Load catalog?"))+'</h2>'
    +(replacing
        ? '<p class="modal-sub">'+esc(t(older
            ? "The file beside Etiuda is an earlier edition than the one you have."
            : updating
            ? "The catalog beside Etiuda has changed since you loaded it."
            : "The file beside Etiuda no longer matches what is loaded."))+'</p>'
        : '')
    /* Name and edition on one line, counts on the next. The date belongs with the name - the
       two together are WHICH catalog this is, and the counts are how big it is - and moving it
       up also takes about ninety pixels off a line that was wrapping at 430px and stranding
       "categories" on its own. */
    +'<div class="about-body"><b>'+esc(String(c.name||"Catalog"))+'</b>'
    +(c.version!=null?' · '+esc(catalogVersionLabel(c.version)):'')
    +(updating && active.version!=null && String(active.version)!==String(c.version)
        ? '<div class="ec-counts">'+esc(t("You have {V}.")).replace("{V}",esc(catalogVersionLabel(active.version)))+'</div>'
        : '')
    // Non-breaking spaces still hold each number to its noun, so any break lands on a separator.
    +'<div class="ec-counts">'
    /* A single text node, which the sweep cannot reach inside: the line is built from counted
       noun phrases and the key carries only their order. */
    +catalogCountsLine("{CARDS} · {MACROS} · {INTENTS} · {CATEGORIES}",
       n, catalogMacroCount(c), i, k)
    +'</div></div>'
    /* The filename is an element, so this paragraph is not a leaf and the sweep would skip
       it - each half is translated where it is written, and the <code> stays between them. */
    +'<p class="modal-sub" style="margin:10px 0 0">'+src.foundHtml
    +(replacing?' '+esc(t(updating?"Your own cards and edits are kept.":"Loading it replaces the catalog you have now.")):'')+'</p>'
    +'<div class="modal-actions">'
    +'<button type="button" class="btn" id="ecNo">'+esc(t(replacing?"Keep current":"Start empty"))+'</button>'
    +'<button type="button" class="btn primary" id="ecYes">'+esc(t(older?"Load it anyway":updating?"Load the update":replacing?"Load it":"Load catalog"))+'</button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  /* Whichever way this closes without loading, the "New here?" invite takes its turn - it was
     held back while this was open, and it is the only thing left offering a way in. */
  const close=()=>{
    document.removeEventListener("keydown", onKey, true);
    wrap.remove();
    maybeShowTourInvite();
  };
  /* Esc closes without recording a refusal, so a stray keypress cannot permanently suppress
     the offer - it simply returns next launch. Only the explicit "Start empty" is remembered.
     Captured and stopped so the app's own Esc handling does not also fire underneath. */
  function onKey(e){
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation();
    close();
  }
  document.addEventListener("keydown", onKey, true);
  /* Reloads on success, so nothing after it runs, and the invite appears on the far side by
     itself, reading the loaded catalog and offering the plain tour rather than the sample.
     Storage that refuses the catalog returns false instead, and the offer has to come down:
     left standing over its own failure toast it reads as a button that does nothing. */
  wrap.querySelector("#ecYes").onclick=()=>{ if(src.accept(sig,updating)===false) close(); };
  wrap.querySelector("#ecNo").onclick=()=>{
    /* The date as well as the signature: the signature says WHAT was refused and the date says
       WHEN, which is what lets a later edition of the same file ask again. */
    if(src.refusedKey){ nsSet(src.refusedKey,sig); nsSet(src.refusedKey+"At",String(Date.now())); }
    close();
    toast(replacing?"Keeping the loaded catalog.":"Starting empty. Load one any time from the Library.");
  };
  const yes=wrap.querySelector("#ecYes");
  if(yes && typeof yes.focus==="function") yes.focus();
  return true;
}

/* The watched file. Silent at boot and only while the browser still holds permission:
   re-granting needs a user gesture, which is what `interactive` supplies. The stored edit
   time is a skip, not the answer - the signature decides whether anything really changed. */
function eCheckWatchedFile(interactive){
  if(!eWatchSupported()) return;
  if(document.getElementById("eCatalogModal")) return;
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
          catch(e){ if(interactive) toast(t("That file is not a catalog Etiuda can read.")); return null; }
          const shown=eOfferCatalogDialog(c,{
            /* No folder: this file was PICKED, so it may sit anywhere, and naming the catalog
               folder beside it would say it came from there. */
            foundHtml:eFoundHtml(eWatchName()||f.name,""),
            refusedKey:"WatchNo", force:!!interactive, asked:!!interactive,
            accept:(sig,updating)=>activateCatalog(c,{keepPersonal:updating})
          });
          if(!shown && interactive) toast(t("That file matches the catalog you already have."));
          return null;
        });
      });
    });
  }).catch(()=>{ if(interactive) toast(t("Could not read the watched file.")); });
}
/* The third channel into the dialog above, spec 11.5: the desktop host watches the file beside
   Etiuda and hands over its text when it changes. The picker channel cannot serve here - there
   is no handle and no permission to re-grant - but the promise is the same one, so an edit
   surfaces as an offer rather than replacing what somebody is working in. */
function wireHostCatalogWatch(){
  const h=(typeof window!=="undefined" && window.E_HOST)||null;
  if(!h || typeof h.onCatalogFile!=="function") return;
  h.onCatalogFile((text,name,where,asked)=>{
    /* The list first, and whatever this text turns out to be: the folder has changed, so a
       Library standing open is out of date whether or not the file is one it can offer. */
    paintCatalogList();
    let c=null;
    try{ c=parseCatalogFile(text); }catch(e){ return; }
    eOfferCatalog(c,name,where,!!asked,!!asked);
  });
}
export {
  eCheckWatchedFile,
  paintCatalogList,
  eOfferCatalog,
  eOfferCatalogAtBoot,
  eOfferCatalogDialog,
  loadCatalogFromFolder,
  wireHostCatalogWatch
};
