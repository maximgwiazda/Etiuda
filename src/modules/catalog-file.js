import { splitPartsRaw } from "./card-model.js";
import { cardFieldKey } from "./card-fields.js";
import { cardOrderTouched, cardOrderIsBase, cardOrderIdx } from "./card-order.js";
import { ALWAYS_CATS } from "./cat-roles.js";
import { storedCatalog, storeCatalog, eWatchSupported, eWatchPut, eWatchClear, E_CATALOG_NAME, E_CATALOG_VERSION, parseCatalogFile } from "./catalog.js";
import { catalogToV2, catalogFromV2, isV2 } from "./catalog-v2.js";
import { CATS, intentArr, intentFieldKey, intentCount, catalogLangs, CONTENT_LANGS } from "./content-model.js";
import { eHasCatalogPicker, ePickCatalogFile } from "./host.js";
import { CAT_LABELS_PL, CAT_LABELS_BY_LANG } from "./icons.js";
import { fill } from "./intent-text.js";
import { cardToExportPlain } from "./macros-json.js";
import { FACTS, normWhoList } from "./stock.js";
import { eWipeLatch, mgReopenAfterReload, ssDel, nsGet, nsSet, nsDel } from "./storage.js";
import { TAB_KEY, tabSaveTimer } from "./tabs.js";
import { ask, t, catalogCountsLine, translateTree, toast } from "./ui-lang.js";
import { BASE_CATS, catalogCardId, pack, whoOptions, savePack } from "./pack.js";
import { catIconKey, catSlot } from "./cat-identity.js";
import { normalizeCardIntents } from "./card-intent.js";
import { intentIdAt, intentIdxFromId } from "./intent-id.js";
import { markMissing } from "./lang-tabs.js";
import { esc } from "./esc.js";
import { rebuildCards } from "./rebuild.js";
import { cards } from "./app-state.js";
import { carryCardLayer } from "./card-carry.js";

/* ---- one catalog format, one export, one import -----------------------------------------
   A catalog carries everything Etiuda has no content of its own for: cards, intents,
   categories and quick facts. Export writes it; Import reads it; the auto-load path reads the
   same file. The file is `.js` only because that is the one envelope a page opened from
   file:// can read on its own (measured blocked for .json on Firefox, Chrome and Edge alike).
   The payload inside is plain JSON, and **import parses it, never executes it** - so the only
   path that ever runs catalog code is the sibling auto-load, which the user consents to. */
/** The intents block of an export. Separate so an optional non-primary topic can be omitted
 *  rather than written as undefined. The key ORDER is the one the whitelist reads back and a
 *  catalog's signature is a hash of: every declared clause, the primary's action and topic,
 *  then whatever the rest of them carry. */
function intentsExport(keep){
  const out={}, col=(f,l)=>intentArr(f,l)||[];
  CONTENT_LANGS.forEach(l=>{ const a=col("clause",l); out[intentFieldKey("clause",l)]=keep.map(i=>a[i]); });
  ["cmt","topic"].forEach(f=>{
    const a=col(f,CONTENT_LANGS[0]);
    out[intentFieldKey(f,CONTENT_LANGS[0])]=keep.map(i=>a[i]);
  });
  ["topic","cmt"].forEach(f=>CONTENT_LANGS.slice(1).forEach(l=>{
    const a=col(f,l);
    if(keep.some(i=>a[i])) out[intentFieldKey(f,l)]=keep.map(i=>a[i]||"");
  }));
  return out;
}
function currentCatalog(nameOverride,edition){
  rebuildCards();
  const cats={}, catsPl={}, catsOther={};
  /* Every declared language past the primary and past Polish, carried out exactly as it came
     in: those have no personal layer and no editor yet, so an export must not lose them. */
  CONTENT_LANGS.slice(1).forEach(code=>{
    if(code==="pl") return;
    const m=CAT_LABELS_BY_LANG[code];
    if(m && Object.keys(m).length) catsOther["categories:"+code]=Object.assign({},m);
  });
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
  for(let i=0;i<intentCount();i++){ if(!goneIntents.has(intentIdAt(i))) keep.push(i); }
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
  /* THE EDITION IS THE EXPORT'S OWN, chosen in its dialog: exporting is how a desk without
     Studio publishes, so what leaves is the next edition of the catalog rather than a second
     copy of the one that arrived. `rev` moves with it, because a desk watching the folder reads
     rev to tell an update from a stranger. No edition means a BUILD, which bakes what is loaded
     and publishes nothing: both fields then round-trip unchanged. */
  const chosen=String(edition||"");
  if(chosen) out.version=chosen;
  else if(E_CATALOG_VERSION!=null) out.version=E_CATALOG_VERSION;
  /* The namespace key and the edition counter, from the applied catalog because nothing in the
     live arrays knows either. Losing the id renames every personal layer the next load looks for,
     and it is also what tells an export that this catalog has an origin and is not ours. */
  const origin=storedCatalog();
  if(origin&&origin.id!=null) out.id=String(origin.id);
  if(chosen) out.rev=(+(origin&&origin.rev)||0)+1;
  else if(origin&&origin.rev!=null) out.rev=+origin.rev;
  /* The languages and the two tables that follow them, from the origin for the same reason as
     the id: the live arrays hold content, not the declaration. Taken from the file rather than
     from the modules honouring it, because those hold the tables in the shape they use them in
     and this has to give back what arrived. */
  if(origin&&Array.isArray(origin.langs)&&origin.langs.length) out.langs=origin.langs;
  if(origin&&origin.greet&&typeof origin.greet==="object") out.greet=origin.greet;
  if(origin&&origin.stop&&typeof origin.stop==="object") out.stop=origin.stop;
  /* The file's request ids, re-indexed onto what survived the removals. The array is aligned
     with the ORIGINAL order, so an intent added at this desk is past its end and has none. */
  const wasIds=(origin&&Array.isArray(origin.intentIds))?origin.intentIds:[];
  const keptIds=keep.map(oldIdx=>(oldIdx<wasIds.length)?String(wasIds[oldIdx]||""):"");
  if(keptIds.some(x=>x)) out.intentIds=keptIds;
  if(!Object.keys(out.categoriesPl).length) delete out.categoriesPl;
  Object.keys(catsOther).forEach(key=>{ out[key]=catsOther[key]; });
  return out;
}
/* Filename from the catalog's name. Accents are folded rather than dropped (so "Zażółć" gives
   "zazolc", not "z"), and everything that is not a letter or digit becomes a hyphen - the
   intersection of what Windows, macOS and Linux all accept, since a catalog gets emailed
   around. Capped so a rambling name cannot produce a filename a filesystem refuses. */
/* Macros (copyable segments) in a raw catalog object, for previews of a file that is not loaded
   yet - the live app uses recountMacros() instead. Counts the catalog's OWN primary, which is
   the language every card is required to carry; asking for English answered 0 on a catalog
   that does not declare it. */
function catalogMacroCount(c){
  const key=cardFieldKey("body",catalogLangs(c)[0]);
  return ((c&&c.cards)||[]).reduce((t,m)=>{
    if(!m||!m[key]) return t;
    return t + (m.alt ? splitPartsRaw(m[key]).length : 1);
  },0);
}
/* HOW MANY REQUESTS A RAW CATALOG DECLARES, by its own primary's clause column. Every preview
   line that wants the number goes through this: reading `intents.en` answered zero on a
   catalog that does not declare English, and did it silently. */
function catalogIntentCount(c){
  const key=intentFieldKey("clause",catalogLangs(c)[0]);
  return (((c&&c.intents)||{})[key]||[]).length;
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
  /* THE EDITION BELONGS TO THE CATALOG EXPORT ALONE. A build bakes the catalog into a page and
     is nobody's next edition of the file, so its dialog keeps the one field it had. */
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id="eNameModal";
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'
    +'<h2>'+esc(html?t("Name this build"):t("Name this catalog"))+'</h2>'
    /* No explanatory paragraph. "Name this catalog" over a live filename preview is the
       whole instruction: what the name does is demonstrated by the preview under the box,
       and what to do with the file belongs to the button that opened this dialog. */
    +'<div class="mf"><label>'+esc(t("Name"))+'</label>'
    +'<input id="eNameInp" autocomplete="off" spellcheck="false" placeholder="Etiuda catalog"></div>'
    +(html?'':'<div class="mf"><label>'+esc(t("Edition"))+'</label>'
      +'<input id="eEdInp" autocomplete="off" spellcheck="false"></div>'
      +'<p class="modal-sub" id="eEdSay" style="margin:2px 0 8px" hidden>'
      +esc(t("Editions read 2026-09-15, or 2026-09-15a for a second the same day."))+'</p>')
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
  const edInp=wrap.querySelector("#eEdInp");
  const edSay=wrap.querySelector("#eEdSay");
  const prev=wrap.querySelector("#eNamePreview");
  const close=()=>{ document.removeEventListener("keydown", onKey, true); wrap.remove(); };
  const sync=()=>{
    const slug=catalogFileSlug(inp.value||initial);
    prev.textContent=t("Saves as")+" "+slug+(html ? ".html" : ".js");
  };
  /* REFUSED RATHER THAN CARRIED. An edition outside the form is evidence of age to no reader, so
     a slip typed here would become an undated catalog at the next desk instead. A value INSIDE
     the form stands as typed, even where it orders before the loaded one: that is the author's
     call, and this dialog is where they make it. */
  const ok=()=>{
    const v=inp.value.trim()||initial||"Etiuda catalog";
    if(edInp){
      const ed=edInp.value.trim();
      if(!EDITION_DATED.test(ed)){ edSay.hidden=false; markMissing(edInp); edInp.focus(); return; }
      close(); onOk(v,ed); return;
    }
    close(); onOk(v);
  };
  function onKey(e){
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); }
    else if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); ok(); }
  }
  document.addEventListener("keydown", onKey, true);
  inp.value=initial||"";
  inp.oninput=sync; sync();
  if(edInp){
    edInp.value=proposeEdition(E_CATALOG_VERSION);
    edInp.oninput=()=>{ edSay.hidden=true; };
  }
  wrap.querySelector("#eNameNo").onclick=close;
  wrap.querySelector("#eNameYes").onclick=ok;
  setTimeout(()=>{ inp.focus(); try{ inp.select(); }catch(_){} },30);
}
function exportCatalog(){
  if(!(cards||[]).length){ toast("Export is ready once the catalog holds a card."); return; }
  /* Defaults to the name whose slug IS the auto-load filename - accepting it produces
     etiuda-catalog.js, the file that loads by itself beside Etiuda.html, with no rename
     step to explain. Pre-selected, so typing replaces it. Deliberately NOT the loaded
     catalog's own name: a file named after the catalog is a fine backup and does exactly
     nothing when dropped next to the engine. */
  askCatalogName("Etiuda catalog", (name,edition)=>{
    const c=currentCatalog(name,edition);
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
      +"   A file named etiuda-catalog.js beside Etiuda.html also loads on launch, and the\n"
      +"   installed Etiuda loads any .ec catalog from the folder named in its Settings. */\n";
    const js=head+"window.E_CATALOG = "+JSON.stringify(catalogToV2(c),null,1)+";\n";
    saveCatalogFile(file, js).then(saved=>{
      if(!saved) return;                              // cancelled in the browser's Save dialog
      toast(catalogCountsLine("Exported {FILE} with {MACROS} in {CARDS}",
        c.cards.length, catalogMacroCount(c), 0, 0).replace("{FILE}",saved));
    });
  });
}
/** Make a catalog the active one. Reloads, because BASE_N is fixed at boot and cannot grow. */
/* The same catalog moving forward is not a different catalog arriving. The file's own id
   decides when both sides carry one; the name is the fallback when either does not. */
function isCatalogUpdate(incoming,active){
  if(!incoming||!active) return false;
  const incomingId=String(incoming.id||"").trim();
  const activeId=String(active.id||"").trim();
  if(incomingId && activeId) return incomingId===activeId;
  const a=String(incoming.name||"").trim().toLowerCase();
  const b=String(active.name||"").trim().toLowerCase();
  return !!a && a===b;
}
/* AGE IS CLAIMED ONLY WHERE IT CAN BE READ. The edition is the catalog's own string, so only
   the form this app writes - a date and a run of letters - can be ordered. Anything else is not
   evidence of age, and the offer then says exactly what it said before. */
const EDITION_DATED=/^([0-9]{4}-[0-9]{2}-[0-9]{2})([a-z]*)$/;
function editionParts(v){
  const m=EDITION_DATED.exec(String(v==null?"":v).trim());
  return m?{date:m[1],n:m[2].length,s:m[2]}:null;
}
/* The letters run like spreadsheet columns, by LENGTH and then alphabetically: "z" is a day's
   twenty-sixth export and "aa" its twenty-seventh, an order plain "<" reverses. */
function catalogEditionOlder(incoming,active){
  const a=editionParts(incoming), b=editionParts(active);
  if(!a||!b) return false;
  if(a.date!==b.date) return a.date<b.date;
  if(a.n!==b.n) return a.n<b.n;
  return a.s<b.s;
}
function nextEditionLetters(s){
  const a=String(s||"").split("");
  for(let i=a.length-1;i>=0;i--){
    if(a[i]!=="z"){ a[i]=String.fromCharCode(a[i].charCodeAt(0)+1); return a.join(""); }
    a[i]="a";
  }
  return "a"+a.join("");
}
/* WHAT THE EXPORT DIALOG PROPOSES: today, in the one form that can be ordered, and the loaded
   edition's next letter where that edition already claims today. A stamp dated AHEAD of today
   takes its own next letter too, so an export is never proposed older than the catalog it came
   from. Anything else, including an edition in no form at all, simply proposes today. */
function proposeEdition(current){
  const d=new Date(), p=v=>String(v).padStart(2,"0");
  const today=d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
  const was=editionParts(current);
  return (was && was.date>=today) ? was.date+nextEditionLetters(was.s) : today;
}
/* keepPersonal carries the personal layer across, and every route through the offer passes it,
   another catalog included: loading a catalog erases nothing a person made. Import drops it, and
   its confirm says so; so does the sample, which loads only on an empty desk. */
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
  /* Derived, not read: m.id is absent on a catalog card, so reading it gave a set holding
     one undefined and quietly emptied all three lists on every activation. */
  let alive=new Set((c.cards||[]).map(catalogCardId));
  if(keep) alive=carryCardLayer(c);
  else (pack.custom||[]).forEach(m=>{ if(m&&m.id) alive.add(m.id); });
  pack.baseCards=null;
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
  /* WHICH FILE IN THE CATALOG FOLDER THIS CAME OUT OF, and when that file was last written.
     Nothing else on the desk records it, and the Library's list marks the row that is loaded.
     Every route passes through here, so a route that names no file BLANKS it rather than
     leaving the last one standing; blanked and not deleted, because an absent key is a desk
     older than this feature and host.js answers that case differently. */
  try{
    nsSet("CatalogFile",String((opts&&opts.file)||""));
    nsSet("CatalogFileAt",String(+(opts&&opts.fileAt)||0));
  }catch(e){}
  /* A CATALOG ARRIVES ON A CLEAN DESK. Selected intents are stored by INDEX, so an index
     points at whatever intent now sits there: all per-tab state goes, updates included.
     What the agent owns is not per-tab and is untouched.
     DELETING IS NOT ENOUGH: reload fires beforeunload, which saves the session back over the
     delete. The latch stops it - ssSet honours eWiping, ssDel does not - so it goes up AFTER
     the catalog is written, and nothing may persist between here and the reload. */
  /* A LIBRARY STANDING OPEN COMES BACK OPEN. Import and the list's own Load both end here, and
     both are acts inside that dialog rather than reasons to shut it. Before the latch on the
     line below, which is what stops every write from here to the reload. */
  mgReopenAfterReload();
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
/** THE SAME QUESTION THE WATERMARK ASKS, ASKED OF ANY CATALOG: would an export differ from the
 *  file this catalog came out of? The test above reads the personal layer alone and never the
 *  sample, so one predicate serves the watermark and the Library's Export button both. */
function catalogEdited(){ return !sampleUntouched(); }
/** Watermark visibility. The flag is read from storage rather than the live catalog because it
 *  has to survive activateCatalog()'s reload, and because a Reset wipes every e* key - so a
 *  reset Etiuda cannot come back still marked. */
function syncSampleMark(){
  const el=document.getElementById("sampleMark");
  if(!el) return;
  let on=false;
  on=nsGet("Sample")==="1";
  el.hidden=!(on && (cards||[]).length>0 && sampleUntouched());
}
// The sample is a sibling file, so it can simply not be there - every route offering it asks here.
function sampleReady(){ return typeof E_SAMPLE!=="undefined" && isV2(E_SAMPLE); }
/* Routes through activateCatalog() like any import - a real catalog you keep and can edit,
   not a temporary illusion. It NEVER replaces a loaded catalog: activateCatalog() drops every
   override and custom, and wanting the demo on top of real content is not a thing anyone wants
   - Reset first. The caller already fires only on an empty Etiuda; the rule is stated here so
   a route added later cannot get around it. */
function loadSampleCatalog(){
  if((cards||[]).length || !sampleReady()) return false;
  return activateCatalog(catalogFromV2(JSON.parse(JSON.stringify(E_SAMPLE))),{keepPersonal:false});
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
            c.cards.length, catalogMacroCount(c), catalogIntentCount(c),
            Object.keys(c.categories).length)+"\n\n"+
          (updating
            ? t("This is a newer copy of the catalog you already have, so your own cards and edits are kept.")
            : t("It replaces the catalog loaded now. Personal card edits and custom cards on this")+" "+
              t("browser are cleared, because they belong to the catalog they were written against."))+"\n\n"+
          t("Nothing on disk is changed. Etiuda reloads to apply it.")+"\n\n"+t("Continue?");
        if(!ask(msg)) return null;
        return {c:c,keepPersonal:updating};
      }catch(e){
        /* NAMED. Import opens on a folder that may hold several of these, and a refusal that
           says only that something failed leaves a person guessing which file they picked. */
        toast(t("{FILE} is not a catalog Etiuda can read.")
          .split("{FILE}").join(String(fileName||"")));
        return null;
      }
}
/* THE READING HALF OF IMPORT, wherever the bytes came from - a browser's file input, the
   shell's dialog - so that a file the folder scan accepts is a file this accepts. The picker
   route below keeps its own tail, because it has a handle to store before the reload. */
function importCatalogText(text,fileName){
  const plan=catalogFromFileText(String(text||""),fileName);
  if(!plan) return false;
  eWatchClear().then(()=>activateCatalog(plan.c,{keepPersonal:plan.keepPersonal}));
  return true;
}
/* The host's dialog, and the file comes back already read: the engine calls no OS API. No watch
   is put down, unlike the picker - this build's shell watches the catalog folder, and a second
   channel saying the same thing is one more thing to keep in step. */
function importCatalogHosted(){
  ePickCatalogFile(t("Import catalog"),t("Catalogs")).then(got=>{
    if(!got) return;
    if(!got.text){ toast(t("{FILE} could not be read.").split("{FILE}").join(got.name)); return; }
    importCatalogText(got.text,got.name);
  });
}
/* The plain input, which is all Firefox has. It also puts down any watch: the file being
   watched is no longer the file this catalog came from. */
/* THE import route, wherever it is offered from. The picker where there is one: it is the only
   route that yields a handle, so choosing it here is what makes the watch available at all. */
function importCatalogHere(){
  if(eHasCatalogPicker()) importCatalogHosted();
  else if(eWatchSupported()) importCatalogPicked();
  else importCatalogFile();
}
function importCatalogFile(){
  const inp=document.createElement("input");
  inp.type="file";
  inp.accept=".ec,.js,.json,text/javascript,application/json,text/plain";
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];
    if(!f) return;
    const reader=new FileReader();
    reader.onload=()=>{ importCatalogText(String(reader.result||""),f.name); };
    reader.onerror=()=>toast(t("{FILE} could not be read.").split("{FILE}").join(f.name));
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
    types:[{description:"Etiuda catalog",accept:{"application/json":[".ec",".json"],"text/javascript":[".js"]}}]
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
  catalogIntentCount,
  exportCatalog,
  isCatalogUpdate,
  catalogEditionOlder,
  proposeEdition,
  activateCatalog,
  catalogEdited,
  sampleUntouched,
  syncSampleMark,
  sampleReady,
  loadSampleCatalog,
  importCatalogHere,
  importCatalogText
};
