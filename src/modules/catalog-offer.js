/* The catalog sitting beside Etiuda, offered rather than loaded, the watched file that
   offers the same way, and the dialog all three channels end in. */
import { activateCatalog, catalogEditionOlder, catalogMacroCount, isCatalogUpdate } from "./catalog-file.js";
import { E_CATALOG_KEY, catalogVersionLabel, eCatalog, eCatalogAccepted, eCatalogSignature,
  storedCatalog, eWatchSupported, eWatchGet, parseCatalogFile, eWatchName } from "./catalog.js";
import { eEmbeddedCatalog } from "./env.js";
import { E_CATALOG_SCRIPT, eCatalogFile, eCatalogFolder, eCatalogIn, eCatalogMtime, eHost, eOpenedWith,
  eReadCatalogFile } from "./host.js";
import { lsSet, nsGet, nsSet } from "./storage.js";
import { maybeShowTourInvite } from "./tour.js";
import { catalogCountsLine, t, toast } from "./ui-lang.js";
import { esc } from "./esc.js";

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
  const shown=eOfferCatalogDialog(c,{
    foundHtml:eFoundHtml(name||eCatalogFile(),
      where||(eHost()?(eCatalogIn()||eCatalogFolder()):"")),
    refusedKey:"CatalogNo", force:!!force,
    accept:(sig,updating)=>{ lsSet(E_CATALOG_KEY,sig); return activateCatalog(c,{keepPersonal:updating}); }
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
  eOfferCatalog(null,"","",asked||!!(at && mt && mt>at),asked);
}
/* THE WAY BACK FROM A DECLINE: the Load button beside each file in Settings' Catalogs line ends
   here. Forced past the remembered refusal, because asking outranks it - the same rule the
   explicit watch check follows - and through the one dialog, so nothing loads behind anybody. */
function loadCatalogFromFolder(name){
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
      refusedKey:"CatalogNo", force:true,
      accept:(sig,updating)=>{ lsSet(E_CATALOG_KEY,sig); return activateCatalog(c,{keepPersonal:updating}); }
    });
    if(!shown) toast(t("That file matches the catalog you already have."));
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
            refusedKey:"WatchNo", force:!!interactive,
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
    let c=null;
    try{ c=parseCatalogFile(text); }catch(e){ return; }
    eOfferCatalog(c,name,where,!!asked,!!asked);
  });
}
export {
  eCheckWatchedFile,
  eOfferCatalog,
  eOfferCatalogAtBoot,
  eOfferCatalogDialog,
  loadCatalogFromFolder,
  wireHostCatalogWatch
};
