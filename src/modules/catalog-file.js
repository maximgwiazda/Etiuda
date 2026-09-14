import { splitPartsRaw } from "./card-model.js";
import { cardOrderTouched, cardOrderIsBase, cardOrderIdx } from "./card-order.js";
import { ALWAYS_CATS } from "./cat-roles.js";
import { storedCatalog, storeCatalog, eWatchSupported, eWatchPut, eWatchClear, E_CATALOG_NAME, E_CATALOG_VERSION, parseCatalogFile } from "./catalog.js";
import { CATS, SW_EN, SW_PL, SW_CMT, SW_CMT_PL, SW_TOPIC, SW_TOPIC_PL } from "./content-model.js";
import { E_SELF } from "./env.js";
import { CAT_LABELS_PL } from "./icons.js";
import { fill } from "./intent-text.js";
import { cardToExportPlain } from "./macros-json.js";
import { FACTS, normWhoList } from "./stock.js";
import { eWipeLatch, ssDel, nsGet, nsSet, nsDel } from "./storage.js";
import { TAB_KEY, tabSaveTimer } from "./tabs.js";
import { ask, t, catalogCountsLine, translateTree } from "./ui-lang.js";
import { BASE_CATS, catalogCardId, pack, whoOptions } from "./pack.js";
import { catIconKey, catSlot } from "./cat-identity.js";
import { normalizeCardIntents } from "./card-intent.js";
import { intentIdAt, intentIdxFromId } from "./intent-id.js";
import { esc } from "./esc.js";

/* ---- one catalog format, one export, one import -----------------------------------------
   A catalog carries everything Etiuda has no content of its own for: cards, intents,
   categories and quick facts. Export writes it; Import reads it; the auto-load path reads the
   same file. The file is `.js` only because that is the one envelope a page opened from
   file:// can read on its own (measured blocked for .json on Firefox, Chrome and Edge alike).
   The payload inside is plain JSON, and **import parses it, never executes it** - so the only
   path that ever runs catalog code is the sibling auto-load, which the user consents to. */
/** The intents block of an export. Separate so the optional Polish topic can be omitted
 *  rather than written as undefined. */
function intentsExport(keep){
  const out={en:keep.map(i=>SW_EN[i]), pl:keep.map(i=>SW_PL[i]),
             cmt:keep.map(i=>SW_CMT[i]), topic:keep.map(i=>SW_TOPIC[i])};
  if(keep.some(i=>SW_TOPIC_PL[i])) out.topicPl=keep.map(i=>SW_TOPIC_PL[i]||"");
  if(keep.some(i=>SW_CMT_PL[i])) out.cmtPl=keep.map(i=>SW_CMT_PL[i]||"");
  return out;
}
function currentCatalog(nameOverride){
  rebuildCards();
  const cats={}, catsPl={};
  Object.keys(CATS).forEach(k=>{
    /* THE CANONICAL NAME, never what the screen currently shows: CATS holds whatever the
       interface language resolved to, and exporting that would write Polish into the field every
       engine reads. Both names come out the same way they go in - the user's own, else the
       catalog's - so an export round-trips whatever the category editor was showing. */
    cats[k]=(pack.catLabels && pack.catLabels[k]) || BASE_CATS[k]
            || (pack.customCats && pack.customCats[k]) || CATS[k];
    const plName=(pack.catLabelsPl && pack.catLabelsPl[k]) || CAT_LABELS_PL[k];
    if(plName) catsPl[k]=plName;
  });
  /* Card -> intent links are ids at runtime ("i:4", "ui:…"). Emit positional indices instead:
     in the exported catalog every intent becomes a base intent numbered by its position, so a
     custom intent that was "ui:34" is simply index 34 to whoever loads the file. */
  /* Removed intents must not travel - and dropping them renumbers everything after, so build
     the surviving list first and remap every card link through it. Exporting the raw SW_*
     arrays would have shipped deleted intents and left the surviving links pointing at the
     wrong ones. Removed cards need no filter: they never enter `cards` at all. */
  const keep=[];
  const goneIntents=new Set(pack.intentRemoved||[]);
  for(let i=0;i<SW_EN.length;i++){ if(!goneIntents.has(intentIdAt(i))) keep.push(i); }
  const remap={};
  keep.forEach((oldIdx,newIdx)=>{ remap[oldIdx]=newIdx; });
  /* Cards are emitted in pack.cardOrder - the user's own arrangement IS the catalog's
     order. NOT the rendered order: the on-screen list layers favourites, intent bands and
     search rank on top, and baking those in would mean starring a card moved its house. */
  const list=(cards||[]).slice()
    .sort((a,b)=>cardOrderIdx(a&&a.id)-cardOrderIdx(b&&b.id))
    .map(m=>{
    const o=cardToExportPlain(m);
    const idx=normalizeCardIntents(m)
      .map(id=>intentIdxFromId(id))
      .filter(i=>i>=0 && remap[i]!=null)
      .map(i=>remap[i]);
    if(idx.length) o.intents=idx; else delete o.intents;
    return o;
  });
  const out={
    format:1,
    kind:"playbook-catalog",
    // Named at export time, so the name and the filename are decided in one place
    name:(nameOverride||E_CATALOG_NAME||"Etiuda catalog"),
    exported:new Date().toISOString(),
    categories:cats,
    /* Absent, not empty, when the catalog has no Polish names - for the same reason topicPl is
       below: a catalog that never used them should not grow an empty map for having been
       exported by a newer engine. Deleted after the literal, since a key assigned undefined
       still exists. */
    categoriesPl:catsPl,
    /* Always written out, even when they match the engine defaults: an export is a
       complete, self-describing catalog - implicit roles make a file that only behaves
       because its keys happen to collide with the defaults, the exact trap this
       mechanism closes. Filtered to surviving categories, so a deleted one cannot be
       exported as a role. */
    /* The look of every surviving category, resolved through the same chain the screen
       uses - your pick, else the catalog's, else the name guess - and written out for
       all of them, for the same reason as the roles: complete and self-describing, never
       right-by-lucky-guess. Icon KEYS, never drawings: the pictures stay in the engine. */
    icons:(()=>{ const o={}; Object.keys(cats).forEach(k=>{ const v=catIconKey(k); if(v) o[k]=v; }); return o; })(),
    colors:(()=>{ const o={}; Object.keys(cats).forEach(k=>{ const v=catSlot(k); if(v>=0) o[k]=v; }); return o; })(),
    roles:{ always:ALWAYS_CATS.filter(k=>cats[k]),
            /* `opener` is not written: the role no longer exists. An older build reading this
               file simply finds none declared, which is the correct outcome - its cards carry
               their own "linked to every intent" flag either way. */ },
    /* No `cat`: nothing reads it to decide anything - it was written only so a catalog
       round-tripped, and an export from here does not carry it. */
    /* topicPl is ABSENT, not empty, when no intent has one - `{topicPl:undefined}` still
       creates the key, and a catalog that never used Polish topics should not grow an array of
       empty strings just for having been exported by a newer engine. */
    intents:intentsExport(keep),
    cards:list,
    // The effective list, so an export round-trips the user's edits like every other field
    who:whoOptions().slice(),
    /* An empty string is an answer - the panel was cleared on purpose - and only an unset
       one means "never written". Both read as unset here, so a deliberate blank arrived at
       the next desk as the built-in paragraph. */
    facts:(pack.facts!=null)?pack.facts:FACTS
  };
  /* An edition number round-trips unchanged - bumping it is the author's call, not the
     export's. Taken from the applied catalog, which is the only place that knows it: the
     live SW arrays and M carry content, not metadata. */
  if(E_CATALOG_VERSION!=null) out.version=E_CATALOG_VERSION;
  if(!Object.keys(out.categoriesPl).length) delete out.categoriesPl;
  return out;
}
/* Filename from the catalog's name. Accents are folded rather than dropped (so "Zażółć" gives
   "zazolc", not "z"), and everything that is not a letter or digit becomes a hyphen - the
   intersection of what Windows, macOS and Linux all accept, since a catalog gets emailed
   around. Capped so a rambling name cannot produce a filename a filesystem refuses. */
/* Macros (copyable segments) in a raw catalog object, for previews of a file that is not loaded
   yet - the live app uses recountMacros() instead. Counts EN, which is the required language. */
function catalogMacroCount(c){
  return ((c&&c.cards)||[]).reduce((t,m)=>{
    if(!m||!m.en) return t;
    return t + (m.alt ? splitPartsRaw(m.en).length : 1);
  },0);
}
function catalogFileSlug(name){
  /* NFD splits a base letter from its accent, but only for letters that HAVE one. Polish ł is
     its own codepoint with nothing to strip, so it survived NFD and then became a hyphen -
     "Zażółć" came out "zazo-c". These are the Latin letters that need transliterating rather
     than decomposing; the rest of the alphabet is handled by NFD above. */
  const s=String(name||"")
    .normalize("NFD").replace(/[̀-ͯ]/g,"")
    /* Apostrophes are ELIDED, not separated: "John's" is one word and must slug to "johns".
       Letting the catch-all below turn it into a hyphen produced "max-s", which reads as a
       stray initial. Both the typographic and the typed form, since a name can arrive either
       way. */
    .replace(/['’]/g,"")
    .replace(/[łŁ]/g,"l").replace(/[đĐ]/g,"d").replace(/[øØ]/g,"o")
    .replace(/[æÆ]/g,"ae").replace(/[œŒ]/g,"oe").replace(/[þÞ]/g,"th").replace(/ß/g,"ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,60)
    .replace(/-+$/,"");
  return s || "etiuda-catalog";
}
/* A build's filename is just the name, slugged. No "-etiuda" tag: the extension already
   says what the file is, the default name carries the word anyway, and appending it to a
   name the user chose is the app overruling them about their own file. */
/* The one place the agent's identity serves anything but {AGENT}: a build is a
   personal artifact, and the default name says who made it and when. First word only -
   the part that takes the possessive; a trailing dot is dropped so an initial gives
   "M's", not "M.'s". Empty AGENT box = "Custom". The date is formatted explicitly:
   toLocaleDateString follows the machine's locale and names the same build differently
   on a colleague's laptop. */
function buildDefaultName(){
  const a=agentParts(agentEl.value);
  const first=a.display ? String(a.display).split(" ")[0].replace(/[.,;:]+$/,"") : "";
  const d=new Date();
  const date=d.getDate()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+d.getFullYear();
  return (first ? first+"'s" : "Custom")+" Etiuda Build "+date;
}
/* No export numbering (-2, -3): it defeated the default name - the whole point of
   defaulting to "Etiuda catalog" is that accepting it yields etiuda-catalog.js, the one
   filename that loads by itself, and the second export of the day silently produced a file
   that does nothing when dropped beside the engine. The browsers also handle the collision
   better than a page can: Chromium's Save dialog warns before overwriting, Firefox appends
   "(1)" - neither loses a file, and both tell the user, which the silent -2 never did. */
/** Write the file. Where it lands is the browser's call, not ours: a page cannot choose a
 *  directory. showSaveFilePicker at least hands the user a real Save dialog that opens where
 *  they last saved, so the file can go beside Etiuda.html without a trip through Downloads.
 *  Chromium has it; Firefox does not, and falls back to an ordinary download. */
function saveCatalogFile(name, text){
  if(typeof window.showSaveFilePicker==="function"){
    return window.showSaveFilePicker({
        suggestedName:name,
        types:[{description:"Etiuda catalog", accept:{"text/javascript":[".js"]}}]
      })
      .then(h=>h.createWritable().then(w=>w.write(text).then(()=>w.close()).then(()=>h.name||name)))
      .catch(e=>{
        if(e && (e.name==="AbortError"||e.name==="NotAllowedError")) return null;  // cancelled
        return downloadCatalogFile(name, text);        // unsupported here - fall back
      });
  }
  return Promise.resolve(downloadCatalogFile(name, text));
}
function downloadCatalogFile(name, text){
  const blob=new Blob([text],{type:"text/javascript;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  return name;
}
/** Small modal of its own rather than the shared one, so it can sit on top of Manage without
 *  destroying it - the same trick the sibling-catalog offer uses. */
/** @param mode "catalog" (a .js catalog file) or "html" (a standalone build). It decides the
 *  wording and the previewed filename - the two exports produce different things and the
 *  preview has to say which, or it quietly promises a .js and hands over an .html. */
function askCatalogName(initial, onOk, mode){
  const html=mode==="html";
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id="eNameModal";
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'
    +'<h2>'+esc(html?t("Name this build"):t("Name this catalog"))+'</h2>'
    /* No explanatory paragraph. "Name this catalog" over a live filename preview is the
       whole instruction: what the name does is demonstrated by the preview under the box,
       and what to do with the file belongs to the button that opened this dialog. */
    +'<div class="mf"><input id="eNameInp" autocomplete="off" spellcheck="false" placeholder="Etiuda catalog"></div>'
    +'<p class="modal-sub" id="eNamePreview" style="margin:2px 0 0"></p>'
    +'<div class="modal-actions">'
    +'<button type="button" class="btn" id="eNameNo">Cancel</button>'
    +'<button type="button" class="btn primary" id="eNameYes">Export</button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  /* Appended straight to <body>, so the chrome roots never see it - swept here instead,
     at the one moment it exists. */
  translateTree(wrap);
  const inp=wrap.querySelector("#eNameInp");
  const prev=wrap.querySelector("#eNamePreview");
  const close=()=>{ document.removeEventListener("keydown", onKey, true); wrap.remove(); };
  const sync=()=>{
    const slug=catalogFileSlug(inp.value||initial);
    prev.textContent=t("Saves as")+" "+slug+(html ? ".html" : ".js");
  };
  const ok=()=>{ const v=inp.value.trim()||initial||"Etiuda catalog"; close(); onOk(v); };
  function onKey(e){
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); ok(); }
  }
  document.addEventListener("keydown", onKey, true);
  inp.value=initial||"";
  inp.oninput=sync; sync();
  wrap.querySelector("#eNameNo").onclick=close;
  wrap.querySelector("#eNameYes").onclick=ok;
  setTimeout(()=>{ inp.focus(); try{ inp.select(); }catch(_){} },30);
}
function exportCatalog(){
  if(!(cards||[]).length){ toast("The catalog is empty, so there is nothing to export."); return; }
  /* Defaults to the name whose slug IS the auto-load filename - accepting it produces
     etiuda-catalog.js, the file that loads by itself beside Etiuda.html, with no rename
     step to explain. Pre-selected, so typing replaces it. Deliberately NOT the loaded
     catalog's own name: a file named after the catalog is a fine backup and does exactly
     nothing when dropped next to the engine. */
  askCatalogName("Etiuda catalog", name=>{
    const c=currentCatalog(name);
    const slug=catalogFileSlug(c.name);
    const file=slug+".js";
    /* One of a thing says so. The header is read by whoever opens the file, and stays English
       like the rest of this comment: it describes the format, not the interface. */
    const num=(v,one,many)=>v+" "+(v===1?one:many);
    const head="/* Etiuda catalog - "+String(c.name).replace(/\*\//g,"")+"\n"
      +"   "+num(catalogMacroCount(c),"macro","macros")+" in "+num(c.cards.length,"card","cards")
      +" · "+num(c.intents.en.length,"intent","intents")
      +" · "+num(Object.keys(c.categories).length,"category","categories")+"\n"
      +"   To load it: Library > Import catalog. Any filename, any folder.\n"
      +"   A file named etiuda-catalog.js beside Etiuda.html also loads on launch. */\n";
    const js=head+"window.PB_CATALOG = "+JSON.stringify(c,null,1)+";\n";
    saveCatalogFile(file, js).then(saved=>{
      if(!saved) return;                              // cancelled in the browser's Save dialog
      toast(catalogCountsLine("Exported {FILE} with {MACROS} in {CARDS}",
        c.cards.length, catalogMacroCount(c), 0, 0).replace("{FILE}",saved));
    });
  });
}
/* Export HTML - one self-contained file with the current catalog baked in. Opens with
   the content already loaded, needs no sibling, and Reset returns to that content, because
   the catalog is part of the file rather than part of the browser.
   Built from E_SELF - the DOM serialised before the app touched it - NEVER by fetching
   our own source: fetch(location.href) on file:// works in Firefox and is refused by
   Chromium, so it works at home and fails silently at work. */
function exportHtml(){
  if(!(cards||[]).length){ toast("The catalog is empty, so there is nothing to build."); return; }
  if(!E_SELF){ toast("Could not read this page's own source"); return; }
  askCatalogName(buildDefaultName(), name=>{
    const c=currentCatalog(name);
    /* "<" escaped throughout, so no string inside the catalog can close the <script> block
       early. \\u003c is valid JSON and parses straight back to "<". */
    const json=JSON.stringify(c).replace(/</g,"\\u003c");
    const slot=/(<script\b[^>]*\bid="eEmbedded"[^>]*>)([\s\S]*?)(<\/script>)/i;
    if(!slot.test(E_SELF)){ toast("Could not find the embedded-catalog slot"); return; }
    // Function replacement, so $& and friends inside the JSON are never treated as patterns
    const html=E_SELF.replace(slot,(m,open,old,close)=>open+json+close);
    const file=catalogFileSlug(c.name)+".html";
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=file;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    toast(catalogCountsLine("Built {FILE} with {MACROS} inside",
        0, catalogMacroCount(c), 0, 0).replace("{FILE}",file));
  }, "html");
}
/** Make a catalog the active one. Reloads, because BASE_N is fixed at boot and cannot grow. */
/* The same catalog moving forward is not a different catalog arriving. Name is what the
   author controls and what an agent recognises, so it decides. Ids being category+title,
   a false match can only reach a card that is the same card anyway. */
function isCatalogUpdate(incoming,active){
  if(!incoming||!active) return false;
  const a=String(incoming.name||"").trim().toLowerCase();
  const b=String(active.name||"").trim().toLowerCase();
  return !!a && a===b;
}
/* AGE IS CLAIMED ONLY WHERE IT CAN BE READ. The edition is the catalog's own string, so only
   the form this app writes - a date with an optional letter - can be ordered. Anything else is
   not evidence of age, and the offer then says exactly what it said before. */
const EDITION_DATED=/^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$/;
function catalogEditionOlder(incoming,active){
  const a=String(incoming==null?"":incoming).trim();
  const b=String(active==null?"":active).trim();
  if(!EDITION_DATED.test(a)||!EDITION_DATED.test(b)) return false;
  return a<b;
}
/* keepPersonal is the caller saying THIS IS AN UPDATE. Default is to drop, because personal
   layers were written against the catalog being replaced and mean nothing against another. */
function activateCatalog(c,opts){
  const keep=!!(opts&&opts.keepPersonal);
  /* THE CATALOG LANDS BEFORE ANYTHING IS PRUNED FOR IT. The personal layers below are
     filtered down to ids the INCOMING catalog knows, which for a different catalog is
     nearly nothing - so doing that first and discovering afterwards that the catalog could
     not be written left the old catalog standing over emptied stars, hides and order. */
  if(!storeCatalog(c)) return false;
  if(!keep){
    pack.overrides={};
    pack.custom=[];
    /* The ROLE list is the same kind of thing: an edit made against the previous catalog's
       vocabulary. Left in place it silently shadowed the incoming catalog's own `who`, so
       importing a catalog appeared to ignore its suggestions entirely. */
    pack.who=null;
    /* Addressed by INDEX, so against another catalog they mean whatever now sits at those
       numbers - see the note at NS_DROP_POSITIONAL. The order is a list of indices too. */
    pack.intentOverrides={};
    pack.intentCustom=[];
    pack.intentHidden=[];
    pack.intentFavourites=[];
    pack.intentRemoved=[];
    nsDel("IntentOrder");
  }
  pack.baseCards=null;
  /* Derived, not read: m.id is absent on a catalog card, so reading it gave a set holding
     one undefined and quietly emptied all three lists on every activation. */
  const alive=new Set((c.cards||[]).map(catalogCardId));
  (pack.custom||[]).forEach(m=>{ if(m&&m.id) alive.add(m.id); });
  // An edit whose card the update removed has nothing left to apply to.
  if(keep) Object.keys(pack.overrides||{}).forEach(id=>{
    if(!alive.has(id)) delete pack.overrides[id];
  });
  pack.hidden=(pack.hidden||[]).filter(id=>alive.has(id));
  pack.favourites=(pack.favourites||[]).filter(id=>alive.has(id));
  pack.cardOrder=(pack.cardOrder||[]).filter(id=>alive.has(id));
  cardOrderTouched();
  savePack();
  nsDel("CatalogNo");
  /* Set here rather than in loadSampleCatalog(), because EVERY route to a catalog passes
     through this function - the sample button, an import, accepting the sibling file. Loading
     anything without the flag therefore clears the watermark by itself, with no path that can
     leave it stranded over real content. */
  try{
    if(c && c.sample) nsSet("Sample","1");
    else nsDel("Sample");
  }catch(e){}
  /* A CATALOG ARRIVES ON A CLEAN DESK. Selected intents are stored by INDEX, so an index
     points at whatever intent now sits there: all per-tab state goes, updates included.
     What the agent owns is not per-tab and is untouched.
     DELETING IS NOT ENOUGH: reload fires beforeunload, which saves the session back over the
     delete. The latch stops it - ssSet honours eWiping, ssDel does not - so it goes up AFTER
     the catalog is written, and nothing may persist between here and the reload. */
  try{ clearTimeout(tabSaveTimer); ssDel(TAB_KEY); eWipeLatch(); }catch(e){}
  location.reload();
  return true;
}
/** True while the sample is still, word for word, the one that shipped. The test is
 *  "would an export differ from the sample?" - edits, additions, deletions, renames,
 *  role and quick-facts changes all clear the watermark: you have started making it
 *  yours. Ordering, favourites and hiding change none of it - they say where an entry
 *  sits, not what is in the file - so they leave the warning alone. */
function sampleUntouched(){
  const p=pack||{};
  const noKeys=o=>!o||Object.keys(o).length===0;
  const noItems=a=>!Array.isArray(a)||a.length===0;
  return noKeys(p.overrides) && noItems(p.custom) &&
         noItems(p.removed) && noItems(p.removedCats) && noItems(p.intentRemoved) &&
         noKeys(p.catLabels) && noKeys(p.customCats) && noKeys(p.catRoles) &&
         noKeys(p.intentOverrides) && noItems(p.intentCustom) &&
         p.facts==null && p.who==null &&
         /* Order is content, so a reordered sample is no longer the sample as shipped.
            Reversible by construction: drag it back and this returns to true. */
         cardOrderIsBase();
}
/** Watermark visibility. The flag is read from storage rather than the live catalog because it
 *  has to survive activateCatalog()'s reload, and because a Reset wipes every pb* key - so a
 *  reset Etiuda cannot come back still marked. */
function syncSampleMark(){
  const el=document.getElementById("sampleMark");
  if(!el) return;
  let on=false;
  on=nsGet("Sample")==="1";
  el.hidden=!(on && (cards||[]).length>0 && sampleUntouched());
}
// The sample is a sibling file, so it can simply not be there - every route offering it asks here.
function sampleReady(){ return typeof PB_SAMPLE!=="undefined" && !!PB_SAMPLE; }
/* Routes through activateCatalog() like any import - a real catalog you keep and can edit,
   not a temporary illusion. It NEVER replaces a loaded catalog: activateCatalog() drops every
   override and custom, and wanting the demo on top of real content is not a thing anyone wants
   - Reset first. The caller already fires only on an empty Etiuda; the rule is stated here so
   a route added later cannot get around it. */
function loadSampleCatalog(){
  if((cards||[]).length || !sampleReady()) return false;
  return activateCatalog(JSON.parse(JSON.stringify(PB_SAMPLE)),{keepPersonal:false});
}
/* Asks, and hands back what to activate rather than activating: the picker route has to
   store its handle BEFORE the reload that activateCatalog() ends in, or it is never kept. */
function catalogFromFileText(text,fileName){
      try{
        const c=parseCatalogFile(String(text||""));
        const updating=isCatalogUpdate(c,storedCatalog());
        const msg=t("Import catalog")+"\n\n"+
          t("Load this catalog on this browser:")+"\n"+fileName+"\n\n"+
          catalogCountsLine("{MACROS} in {CARDS} · {INTENTS} · {CATEGORIES}",
            c.cards.length, catalogMacroCount(c), c.intents.en.length,
            Object.keys(c.categories).length)+"\n\n"+
          (updating
            ? t("This is a newer copy of the catalog you already have, so your own cards and edits are kept.")
            : t("It replaces the catalog loaded now. Personal card edits and custom cards on this")+" "+
              t("browser are cleared, because they belong to the catalog they were written against."))+"\n\n"+
          t("Nothing on disk is changed. Etiuda reloads to apply it.")+"\n\n"+t("Continue?");
        if(!ask(msg)) return null;
        return {c:c,keepPersonal:updating};
      }catch(e){
        toast(t("Import failed -")+" "+(e&&e.message?e.message:"invalid file"));
        return null;
      }
}
/* The plain input, which is all Firefox has. It also puts down any watch: the file being
   watched is no longer the file this catalog came from. */
/* THE import route, wherever it is offered from. The picker where there is one: it is the only
   route that yields a handle, so choosing it here is what makes the watch available at all. */
function importCatalogHere(){
  if(eWatchSupported()) importCatalogPicked(); else importCatalogFile();
}
function importCatalogFile(){
  const inp=document.createElement("input");
  inp.type="file";
  inp.accept=".js,.json,text/javascript,application/json,text/plain";
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];
    if(!f) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const plan=catalogFromFileText(String(reader.result||""),f.name);
      if(!plan) return;
      eWatchClear().then(()=>activateCatalog(plan.c,{keepPersonal:plan.keepPersonal}));
    };
    reader.onerror=()=>toast("Could not read file");
    reader.readAsText(f);
  };
  inp.click();
}
/* The picker returns a HANDLE - the same dialog to the user, but what comes back can be
   kept and re-read later, which is the whole update channel. Cancelling rejects with
   AbortError rather than resolving empty, so the catch is also the cancel path. */
function importCatalogPicked(){
  let handle=null;
  window.showOpenFilePicker({
    multiple:false,
    types:[{description:"Etiuda catalog",accept:{"text/javascript":[".js"],"application/json":[".json"]}}]
  }).then(picked=>{
    handle=picked&&picked[0];
    return handle?handle.getFile():null;
  }).then(f=>{
    if(!f) return null;
    return f.text().then(text=>{
      const plan=catalogFromFileText(text,f.name);
      if(!plan) return null;
      nsSet("WatchName",f.name);
      nsSet("WatchSeen",String(f.lastModified||0));
      nsDel("WatchNo");
      return eWatchPut(handle).then(()=>activateCatalog(plan.c,{keepPersonal:plan.keepPersonal}));
    });
  }).catch(e=>{
    if(e && e.name==="AbortError") return;
    toast(t("Import failed -")+" "+((e&&e.message)?e.message:"invalid file"));
  });
}

export {
  catalogMacroCount,
  exportCatalog,
  exportHtml,
  isCatalogUpdate,
  catalogEditionOlder,
  activateCatalog,
  sampleUntouched,
  syncSampleMark,
  sampleReady,
  loadSampleCatalog,
  importCatalogHere
};
