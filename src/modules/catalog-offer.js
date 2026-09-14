/* The catalog sitting beside Etiuda, offered rather than loaded, the watched file that
   offers the same way, and the dialog all three channels end in. */
import { activateCatalog, catalogEditionOlder, catalogMacroCount, isCatalogUpdate } from "./catalog-file.js";
import { E_CATALOG_KEY, catalogVersionLabel, eCatalog, eCatalogAccepted, eCatalogSignature,
  storedCatalog, eWatchSupported, eWatchGet, parseCatalogFile, eWatchName } from "./catalog.js";
import { eEmbeddedCatalog } from "./env.js";
import { lsSet, nsGet, nsSet } from "./storage.js";
import { maybeShowTourInvite } from "./tour.js";
import { catalogCountsLine, t, toast } from "./ui-lang.js";
import { esc } from "./esc.js";

/* A catalog sitting beside Etiuda is offered, never forced. Asked once per signature:
   accept it and it loads silently from then on, change it and you are asked again, so what
   you are running is always something you agreed to. Declining is remembered too, so the
   bar does not nag on every launch. */
function eOfferCatalog(){
  // An integrated build carries its own content; a sibling file is not its business
  if(eEmbeddedCatalog()) return;
  const c=eCatalog();
  if(!c) return;
  if(!storedCatalog() && eCatalogAccepted(c)) return;
  eOfferCatalogDialog(c,{
    foundHtml:esc(t("Located as"))+' <code>etiuda-catalog.js</code>.',
    refusedKey:"CatalogNo",
    accept:(sig,updating)=>{ lsSet(E_CATALOG_KEY,sig); return activateCatalog(c,{keepPersonal:updating}); }
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
    if(src.refusedKey) nsSet(src.refusedKey,sig);
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
            foundHtml:esc(t("Located as"))+' <code>'+esc(eWatchName()||f.name)+'</code>.',
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
export {
  eCheckWatchedFile,
  eOfferCatalog,
  eOfferCatalogDialog
};
