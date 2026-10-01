import { splitPartsRaw } from "./card-model.js";
import { cardFieldKey } from "./card-fields.js";
import { cardOrderTouched, cardOrderIsBase, cardOrderIdx } from "./card-order.js";
import { ALWAYS_CATS } from "./cat-roles.js";
import { storedCatalog, storeCatalog, eWatchSupported, eWatchPut, eWatchClear, parseCatalogFile, catalogDocOf } from "./catalog.js";
import { catalogLoaded } from "./catalog-boot.js";
import { agentName } from "./agent.js";
import { catalogToV2, v2SignedBytes } from "./catalog-v2.js";
import { CATS, intentArr, intentFieldKey, intentCount, catalogLangs, CONTENT_LANGS } from "./content-model.js";
import { eHost, eHasCatalogPicker, ePickCatalogFile, eHasCatalogSaver, eSaveCatalogFile, eLoadedCatalogFile, eHasBranch, eBranchIdentity, eWriteBranch } from "./host.js";
import { CAT_LABELS_PL, CAT_LABELS_BY_LANG } from "./icons.js";
import { fill } from "./intent-text.js";
import { cardToExportPlain } from "./macros-json.js";
import { FACTS, normWhoList } from "./stock.js";
import { ssDel, nsGet, nsSet, nsDel, LAYER_KEYS, layerNsOf, eLayer, lyGet, lySet, lyDel } from "./storage.js";
import { cutLeaves, dismissNode } from "./motion.js";
import { esc } from "./esc.js";
import { newCatalogId } from "./ids.js";
import { TAB_KEY, tabSaveTimer } from "./tabs.js";
import { t, catalogCountsLine, toast, toastRefusal } from "./ui-lang.js";
import { BASE_CATS, BASE_M, pack, whoOptions, savePack, flushStats, retiredCards } from "./pack.js";
import { catIconKey, catSlot } from "./cat-identity.js";
import { normalizeCardIntents } from "./card-intent.js";
import { intentIdAt, intentIdxFromId } from "./intent-id.js";
import { rebuildCards } from "./rebuild.js";
import { cards } from "./app-state.js";
import { carryCardLayer } from "./card-carry.js";
import { hooks } from "./hooks.js";
import { recordCatalogTrust } from "./catalog-trust.js";

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
/* `asIs` reads the cards as they stand, for a caller that must not redraw the list. */
function currentCatalog(opts){
  if(!(opts&&opts.asIs)) rebuildCards();
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
  // A retired card holds its place in the order like any other; 1e9 is the answer for an id with none.
  const asleep=retiredCards(), placed=m=>cardOrderIdx(m.id)<1e9;
  const shown=(cards||[]).concat(asleep.filter(placed)).sort((a,b)=>cardOrderIdx(a&&a.id)-cardOrderIdx(b&&b.id));
  /* One with no place travels where the edition had it: after the card that stood before it. */
  const loose=new Map(asleep.filter(m=>!placed(m)).map(m=>[m.id,m]));
  let anchor=null;
  if(loose.size) BASE_M.forEach(b=>{
    if(loose.has(b.id)) shown.splice(anchor==null?0:shown.findIndex(m=>m.id===anchor)+1,0,loose.get(b.id));
    if(loose.has(b.id) || shown.some(m=>m.id===b.id)) anchor=b.id;
  });
  const list=shown
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
  /* EXPORT MAKES A NEW CATALOG, whatever is loaded: a new id, and the first of its own editions,
     dated today. Keeping the loaded catalog's id would make two catalogs claim one identity. */
  out.id=newCatalogId();
  out.rev=1;
  out.version=todayEdition();
  const origin=storedCatalog();
  /* The languages and the two tables that follow them, from the origin for the same reason as
     the id: the live arrays hold content, not the declaration. Taken from the file rather than
     from the modules honouring it, because those hold the tables in the shape they use them in
     and this has to give back what arrived. */
  if(origin&&Array.isArray(origin.langs)&&origin.langs.length) out.langs=origin.langs;
  if(origin&&origin.greet&&typeof origin.greet==="object") out.greet=origin.greet;
  if(origin&&origin.stop&&typeof origin.stop==="object") out.stop=origin.stop;
  /* From the origin like greet. grew and desk are left behind on purpose: they describe the file
     the origin was, and an export is a new catalog. */
  if(origin&&origin.notes&&typeof origin.notes==="object") out.notes=origin.notes;
  if(origin&&origin.ext&&typeof origin.ext==="object") out.ext=origin.ext;
  /* The file's request ids, re-indexed onto what survived the removals. The array is aligned
     with the ORIGINAL order, so an intent added at this desk is past its end and has none. */
  const wasIds=(origin&&Array.isArray(origin.intentIds))?origin.intentIds:[];
  const keptIds=keep.map(oldIdx=>(oldIdx<wasIds.length)?String(wasIds[oldIdx]||""):"");
  if(keptIds.some(x=>x)) out.intentIds=keptIds;
  if(!Object.keys(out.categoriesPl).length) delete out.categoriesPl;
  Object.keys(catsOther).forEach(key=>{ out[key]=catsOther[key]; });
  return out;
}
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
/* THE SUGGESTED FILENAME IS THE LOADED CATALOG'S OWN FILE'S, so saving as offered keeps its name. Only
   what Windows refuses in a filename is replaced, since the file may have been named on another system. */
function catalogFileStem(name){
  const refused='<>:"/\\|?*';
  const s=Array.from(String(name||""))
    .map(ch=>(ch.charCodeAt(0)<32 || refused.indexOf(ch)>-1) ? "-" : ch).join("")
    .trim().replace(/[. ]+$/,"").slice(0,80).trim();
  return s || "Etiuda catalog";
}
/* The catalog's name from the file it was saved as: the name without its catalog extension. */
function catalogNameOfFile(file){
  return String(file||"").replace(/\.(ec|json|js)$/i,"").trim();
}
/* THE LOADED CATALOG'S NAME IS ITS FILE'S, extension and all: the file a route recorded wherever it lay,
   else the folder's file this load read. "" where nothing is loaded or no route named a file. */
function catalogFileName(){
  if(!catalogLoaded() && !storedCatalog()) return "";
  return String(nsGet("CatalogFrom")||eLoadedCatalogFile()||"");
}
/** Write the file. Where it lands is the person's call in a save dialog: the host's, else the
 *  browser's showSaveFilePicker (Chromium), else an ordinary download (Firefox). `build` makes the
 *  text, and runs only once the choice is made. */
function saveCatalogFile(name, build){
  if(eHasCatalogSaver()) return eSaveCatalogFile(t("Export"),name,t("Catalogs"),build).then(r=>{
    if(r && !r.ok) toastRefusal(t("{FILE} could not be saved.").split("{FILE}").join(r.name));
    return (r && r.ok) ? r.name : null;
  });
  if(typeof window.showSaveFilePicker==="function"){
    return window.showSaveFilePicker({
        suggestedName:name,
        types:[{description:t("Etiuda catalog"), accept:{"application/json":[".ec"]}}]
      })
      .then(h=>{
        const as=h.name||name, text=build();
        return h.createWritable().then(w=>w.write(text).then(()=>w.close())).then(()=>as);
      })
      .catch(e=>{
        /* AbortError is the person closing the dialog, and only that is silent. NotAllowedError is
           the browser refusing to open it, so it falls back to the download like any failure. */
        if(e && e.name==="AbortError") return null;
        return downloadCatalogFile(name, build());
      });
  }
  return Promise.resolve(downloadCatalogFile(name, build()));
}
function downloadCatalogFile(name, text){
  const blob=new Blob([text],{type:"application/json;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  return name;
}
/* NOTHING STANDS BETWEEN THE BUTTON AND THE SAVE DIALOG. What is written is the .ec document itself,
   the shape every reader parses as it stands. Resolves to the saved file's name, or null where
   nothing was saved. */
function exportCatalog(){
  if(!(cards||[]).length){ toast("Export is ready once the catalog holds a card."); return Promise.resolve(null); }
  let c=null;
  const build=()=>{
    c=currentCatalog();
    return JSON.stringify(catalogToV2(c),null,1)+"\n";
  };
  return saveCatalogFile(catalogFileStem(catalogNameOfFile(catalogFileName()))+".ec", build).then(saved=>{
    if(!saved || !c) return null;                    // cancelled in the Save dialog
    if(!catalogLoaded()) lySet("Exported",looseMark());
    toast(catalogCountsLine("Exported {FILE} with {MACROS} in {CARDS}",
      c.cards.length, catalogMacroCount(c), 0, 0).replace("{FILE}",saved));
    return saved;
  });
}
/* ---- the desk's own file in the catalog folder -----------------------------------------------
   The personal layer stays the source of truth and this is its projection: what an export would
   hold, grown from the edition in use, signed by the desk's own key, which only the host holds.
   Favourites, hides and counts are not in an export, so they are not in this file either. */
const SHA_K=[
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
/* SHA-256 of bytes, as hex, synchronously: the page has no other way to hash inside a save. */
function sha256Hex(bytes){
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const n=bytes.length, total=((n+9+63)>>6)<<6, buf=new Uint8Array(total);
  buf.set(bytes); buf[n]=0x80;
  const dv=new DataView(buf.buffer), w=new Uint32Array(64);
  dv.setUint32(total-8,Math.floor(n/0x20000000)); dv.setUint32(total-4,(n<<3)>>>0);
  for(let o=0;o<total;o+=64){
    for(let i=0;i<16;i++) w[i]=dv.getUint32(o+i*4);
    for(let i=16;i<64;i++){
      const x=w[i-15], y=w[i-2];
      w[i]=w[i-16]+(((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3))+w[i-7]+(((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10));
    }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let i=0;i<64;i++){
      const t1=h+(((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)))+((e&f)^(~e&g))+SHA_K[i]+w[i];
      const t2=(((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)))+((a&b)^(a&c)^(b&c));
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,h].forEach((v,i)=>{ H[i]=(H[i]+v)|0; });
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,"0")).join("");
}
/* THE EDITION IN USE, PINNED. A signature covers the document and the stored copy keeps only what
   the runtime reads, so the pin is made where the document is still in hand: every route to a
   catalog ends in takeCatalog. A catalog stored without one has no desk file until it is loaded again. */
function pinned(c){
  const doc=catalogDocOf(c);
  if(!doc) return c;
  try{ return Object.assign({},c,{pin:"sha256:"+sha256Hex(v2SignedBytes(doc))}); }
  catch(e){ return c; }
}
/* Eight hex of the grown-from catalog's id: the end of the desk file's own id and of its file name. */
function branchHex(origin){ return sha256Hex(new TextEncoder().encode(String(origin.id))).slice(0,8); }
/* The desk file's catalog: an export's content with the id this desk and this edition always give
   it, the edition's own pin in `grew` and the desk's public halves in `desk`. The edition number is
   the host's to raise, so it is 1 here. */
function branchCatalog(who,origin){
  const c=currentCatalog({asIs:true}), name=String(agentName()||"").trim();
  c.id=who.id+"-"+branchHex(origin);
  c.rev=1;
  c.version=todayEdition();
  c.grew={id:String(origin.id), rev:+origin.rev||0, sha:String(origin.pin)};
  c.desk={id:who.id, key:who.key, box:who.box};
  if(name) c.desk.name=name;
  return c;
}
const BRANCH_WAIT_MS=1500;
let branchTimer=0, branchBusy=null, branchAgain=false;
/* One write at a time, the latest state when it runs. A layer holding nothing an export would carry
   (deskBranchHolds) takes the file away; a browser, a desk with no pin and a desk whose key cannot be kept write nothing. */
function writeDeskBranch(){
  if(!eHasBranch() || !catalogLoaded()) return Promise.resolve(false);
  if(branchBusy){ branchAgain=true; return branchBusy; }
  const origin=storedCatalog();
  if(!origin || !origin.id || !/^sha256:[0-9a-f]{64}$/.test(String(origin.pin||""))) return Promise.resolve(false);
  const stem=catalogFileStem(catalogNameOfFile(catalogFileName()))+"-"+branchHex(origin);
  const run=deskBranchHolds()
    ? eBranchIdentity().then(who=>who ? eWriteBranch(stem,JSON.stringify(catalogToV2(branchCatalog(who,origin)))) : {ok:false})
    : eWriteBranch(stem,"");
  branchBusy=run.then(r=>!!(r&&r.ok),()=>false).then(ok=>{
    branchBusy=null;
    if(branchAgain){ branchAgain=false; scheduleDeskBranch(); }
    return ok;
  });
  return branchBusy;
}
function scheduleDeskBranch(){
  if(!eHasBranch()) return;
  clearTimeout(branchTimer);
  branchTimer=setTimeout(()=>{ branchTimer=0; writeDeskBranch(); },BRANCH_WAIT_MS);
}
/* The same catalog moving forward is not a different catalog arriving. The file's own id decides,
   and a side without one is never the same catalog as anything. */
function isCatalogUpdate(incoming,active){
  if(!incoming||!active) return false;
  const incomingId=String(incoming.id||"").trim();
  return !!incomingId && incomingId===String(active.id||"").trim();
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
/* A new catalog's first edition: today, in the one form that can be ordered. */
function todayEdition(){
  const d=new Date(), p=v=>String(v).padStart(2,"0");
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
}
/* WHAT AN EXPORT OF THE LOOSE LAYER CARRIED, so a later load can tell loose content saved as a
   catalog from content that exists nowhere else. The fields are the ones sampleUntouched reads. */
const LOOSE_FIELDS=["overrides","custom","removed","removedCats","intentRemoved","catLabels","catLabelsPl",
  "customCats","catRoles","catIcons","catColors","intentOverrides","intentCustom","facts","who","cardOrder"];
function looseMark(){
  const o={};
  LOOSE_FIELDS.forEach(k=>{ o[k]=(pack||{})[k]; });
  const s=JSON.stringify(o);
  let h=5381;
  for(let i=0;i<s.length;i++) h=(((h<<5)+h)^s.charCodeAt(i))>>>0;
  return s.length+"|"+h.toString(36);
}
function looseUnexported(){
  return !catalogLoaded() && catalogEdited() && lyGet("Exported")!==looseMark();
}
/* LOADING A CATALOG ERASES THE EMPTY DESK'S OWN CONTENT, so content never exported is offered its
   own catalog first: Export saves it and then loads, Load anyway loads without it, Escape does
   neither. */
function askLoose(go){
  const was=document.getElementById("eLoose");
  if(was) was.remove();
  const el=document.createElement("div");
  el.className="bub bub-ask e-undo";
  el.id="eLoose";
  el.setAttribute("role","alertdialog");
  el.setAttribute("data-side","none");
  el.innerHTML='<p>'+esc(t("Loading a catalog erases the cards you made without one. Export them as a catalog of their own first?"))+'</p>'
    +'<div class="tour-actions">'
    +'<button type="button" class="btn" id="eLooseLoad">'+esc(t("Load anyway"))+'</button>'
    +'<button type="button" class="btn primary" id="eLooseExport">'+esc(t("Export…"))+'</button></div>';
  cutLeaves();
  document.body.appendChild(el);
  const close=()=>dismissNode(el);
  el.querySelector("#eLooseLoad").onclick=()=>{ close(); go(); };
  el.querySelector("#eLooseExport").onclick=()=>{ close(); exportCatalog().then(saved=>{ if(saved) go(); }); };
  el.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation(); close();
  });
  el.querySelector("#eLooseExport").focus();
}
/* Whatever the layer in view still owes its keys, written before another layer takes its place. */
function flushLayer(){
  try{ hooks.flushPillState(); }catch(e){}
  flushStats();
}
/** Make a catalog the active one, and the desk starts again with it in place. The personal layer
 *  in view goes with the catalog it orbits; a new edition of the same catalog carries it forward. */
function activateCatalog(c,opts){
  if(looseUnexported()){ askLoose(()=>takeCatalog(c,opts)); return true; }
  return takeCatalog(c,opts);
}
function takeCatalog(c,opts){
  const same=catalogLoaded() && layerNsOf(c)===eLayer();
  const loose=!catalogLoaded();
  flushLayer();
  /* THE CATALOG LANDS BEFORE ANYTHING IS PRUNED FOR IT: a catalog that could not be written must
     leave the one loaded standing over its own stars, hides and order. */
  if(!storeCatalog(pinned(c))) return false;
  if(same){
    const alive=carryCardLayer(c);
    pack.baseCards=null;
    pack.hidden=(pack.hidden||[]).filter(id=>alive.has(id));
    pack.favourites=(pack.favourites||[]).filter(id=>alive.has(id));
    pack.cardOrder=(pack.cardOrder||[]).filter(id=>alive.has(id));
    cardOrderTouched();
    savePack();
  } else if(loose) LAYER_KEYS.forEach(n=>lyDel(n));
  nsDel("CatalogNo");
  /* Set here, because EVERY route to a catalog passes
     through this function - an import, a Library row, accepting the sibling file. Loading
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
    /* The file's own name wherever it lay, which the top bar shows; `file` above is only ever one
       in the catalog folder. Blanked by a route that names none, for the same reason. */
    nsSet("CatalogFrom",String((opts&&(opts.from||opts.file))||""));
    recordCatalogTrust(c);
  }catch(e){}
  /* A CATALOG ARRIVES ON A CLEAN DESK. Selected intents are stored by INDEX, so an index
     points at whatever intent now sits there: all per-tab state goes, updates included.
     What the agent owns is not per-tab and is untouched. */
  clearTimeout(tabSaveTimer);
  ssDel(TAB_KEY);
  hooks.restartDesk();
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
/* WHETHER THE LAYER HOLDS ANYTHING AN EXPORT WOULD CARRY, for the desk's own file: the fields are
   LOOSE_FIELDS, read directly, and presence counts for all but three. The category editor writes the icon
   and the colour on every save, so those and the Polish name count only where they differ from what the
   category would show with no pick at all. Order counts as sampleUntouched counts it. */
function deskBranchHolds(){
  const p=pack||{};
  const bare=(bag,k,read)=>{
    const m=p[bag];
    p[bag]=Object.keys(m).reduce((o,x)=>{ if(x!==k) o[x]=m[x]; return o; },{});
    try{ return read(k); } finally{ p[bag]=m; }
  };
  const differs=(bag,read)=>{
    const m=p[bag]||{};
    return Object.keys(CATS).some(k=>m[k]!=null && m[k]!=="" && m[k]!==bare(bag,k,read));
  };
  return LOOSE_FIELDS.some(f=>{
    const v=p[f];
    if(f==="cardOrder") return !cardOrderIsBase();
    if(f==="facts" || f==="who") return v!=null;
    if(f==="catLabelsPl") return differs(f,k=>CAT_LABELS_PL[k]);
    if(f==="catIcons") return differs(f,catIconKey);
    if(f==="catColors") return differs(f,catSlot);
    return Array.isArray(v) ? v.length>0 : !!v && typeof v==="object" && Object.keys(v).length>0;
  });
}
/** Watermark visibility. The flag is read from storage rather than the live catalog because it
 *  has to survive activateCatalog()'s reload, and because a Reset wipes every e* key - so a
 *  reset Etiuda cannot come back still marked. */
function syncSampleMark(){
  // Every pack save, a restart and the boot pass here, which makes it the one place the desk file is told.
  scheduleDeskBranch();
  const el=document.getElementById("sampleMark");
  if(!el) return;
  let on=false;
  on=nsGet("Sample")==="1";
  el.hidden=!(on && (cards||[]).length>0 && sampleUntouched());
}
/* Reads a picked file's text into a catalog, or names the file and hands back null. */
function catalogFromFileText(text,fileName){
      try{
        return parseCatalogFile(String(text||""));
      }catch(e){
        /* NAMED. The dialog opens on a folder that may hold several of these, and a refusal that
           says only that something failed leaves a person guessing which file they picked. */
        toastRefusal(t("{FILE} is not a catalog Etiuda can read.")
          .split("{FILE}").join(String(fileName||"")));
        return null;
      }
}
/* THE READING HALF OF IMPORT, wherever the bytes came from - a browser's file input, the
   shell's dialog - so that a file the folder scan accepts is a file this accepts. The picker
   route below keeps its own tail, because it has a handle to store before the reload. */
function importCatalogText(text,fileName){
  const c=catalogFromFileText(String(text||""),fileName);
  if(!c) return false;
  hooks.offerPickedCatalog(c,fileName,()=>{ eWatchClear().then(()=>activateCatalog(c,{from:fileName})); });
  return true;
}
/* The host's dialog, and the file comes back already read: the engine calls no OS API. No watch
   is put down, unlike the picker - this build's shell watches the catalog folder, and a second
   channel saying the same thing is one more thing to keep in step. */
function importCatalogHosted(){
  ePickCatalogFile(t("Load catalog"),t("Catalogs")).then(got=>{
    if(!got) return;
    if(!got.text){ toastRefusal(t("{FILE} could not be read.").split("{FILE}").join(got.name)); return; }
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
    reader.onerror=()=>toastRefusal(t("{FILE} could not be read.").split("{FILE}").join(f.name));
    reader.readAsText(f);
  };
  inp.click();
}
/* A FILE DROPPED ON THE WINDOW is a catalog somebody pointed at. Every file drag is taken, since
   one the page leaves becomes a navigation the shell refuses without a word, and which file it is
   can only be read on the drop. A host is handed the file's path, so a drop is answered as a
   double-click is; a browser reads the bytes, as the file input does. */
function isFileDrag(e){
  const dt=e.dataTransfer;
  return !!dt && Array.prototype.indexOf.call(dt.types||[],"Files")>-1;
}
function wireCatalogDrop(){
  addEventListener("dragover",e=>{
    if(!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect="copy";
  });
  addEventListener("drop",e=>{
    if(!isFileDrag(e)) return;
    e.preventDefault();
    const f=e.dataTransfer.files && e.dataTransfer.files[0];
    if(!f) return;
    if(!/[.](ec|json|js)$/i.test(f.name)){
      toastRefusal(t("{FILE} is not a catalog Etiuda can read.").split("{FILE}").join(f.name));
      return;
    }
    const h=eHost();
    if(h && typeof h.offerDropped==="function" && /[.]ec$/i.test(f.name) && h.offerDropped(f)) return;
    f.text().then(text=>importCatalogText(text,f.name),
      ()=>toastRefusal(t("{FILE} could not be read.").split("{FILE}").join(f.name)));
  });
}
/* The picker returns a HANDLE - the same dialog to the user, but what comes back can be
   kept and re-read later, which is the whole update channel. Cancelling rejects with
   AbortError rather than resolving empty, so the catch is also the cancel path. */
function importCatalogPicked(){
  let handle=null, picked="";
  window.showOpenFilePicker({
    multiple:false,
    types:[{description:t("Etiuda catalog"),accept:{"application/json":[".ec",".json"],"text/javascript":[".js"]}}]
  }).then(picked=>{
    handle=picked&&picked[0];
    return handle?handle.getFile():null;
  }).then(f=>{
    if(!f) return null;
    picked=f.name;
    return f.text().then(text=>{
      const c=catalogFromFileText(text,f.name);
      if(!c) return null;
      hooks.offerPickedCatalog(c,f.name,()=>{
        nsSet("WatchName",f.name);
        nsSet("WatchSeen",String(f.lastModified||0));
        nsDel("WatchNo");
        eWatchPut(handle).then(()=>activateCatalog(c,{from:f.name}));
      });
      return null;
    });
  }).catch(e=>{
    if(e && e.name==="AbortError") return;
    /* The browser's own sentence is English whatever the interface speaks, so the line names the
       file instead, or where none was picked the error's own name. */
    toastRefusal(t("The catalog could not be loaded:")+" "+(picked || (e&&e.name) || ""));
  });
}

export {
  wireCatalogDrop,
  catalogMacroCount,
  catalogIntentCount,
  exportCatalog,
  catalogFileName,
  catalogNameOfFile,
  isCatalogUpdate,
  catalogEditionOlder,
  todayEdition,
  activateCatalog,
  catalogEdited,
  sampleUntouched,
  syncSampleMark,
  importCatalogHere,
  importCatalogText,
  sha256Hex,
  deskBranchHolds,
  writeDeskBranch
};
