import { cardText } from "./card-model.js";
import { eWatchSupported, eWatchName, editionNameOf, E_CATALOG_VERSION, E_CATALOG_REV, storedCatalog, eCatalog,
  eCatalogAccepted, catalogDocOf, eCatalogSignature } from "./catalog.js";
import { heldCatalogTrust } from "./catalog-trust.js";
import { tourActive, tourDueAtBoot } from "./tour.js";
import { catalogMacroCount, sampleUntouched } from "./catalog-file.js";
import { catalogLoaded } from "./catalog-boot.js";
import { remPx, colMode, colFloor, colCount, COL_GAP } from "./columns.js";
import { CATS, CONTENT_LANGS } from "./content-model.js";
import { dismissModal, closeModal, openDialog } from "./dialog.js";
import { E_VERSION } from "./env.js";
import { eHost, eCatalogFile, eCatalogIn, eCatalogBuiltIn, eCatalogFolder, E_CATALOG_FOLDER_KEY, E_CATALOG_SCRIPT } from "./host.js";
import { lsGet, lsKeys, nsGet, E_NS, E_LS_OK, E_SS_OK, eDeskFileShown, eSaveTrouble, eLastSaved, eHomeless, eDeskHome,
  eDeskRefused } from "./storage.js";
import { ejectCatalog } from "./local-memory.js";
import { tabs } from "./tabs.js";
import { mgSystemStill, M_STILL_Q } from "./motion.js";
import { tc, fileStamp, t } from "./ui-lang.js";
import { openScreenTab, registerScreen } from "./screen-tabs.js";
import { pack } from "./pack.js";
import { RAIL_DOCK_MIN, railLocked, railMaxWidth } from "./rail-panel.js";
import { pageScroller } from "./page-scroll.js";
import { intentOrder } from "./intent-id.js";
import { esc } from "./esc.js";
import { list, modalEl, modalCard, $ } from "./dom.js";
import { systemTheme, themeChoice, themeTrace, traceNote } from "./theme.js";
import { copy } from "./mark.js";
import { pillsLocked } from "./pills-box.js";
import { cards, lang } from "./app-state.js";
import { teamLeads } from "./team-join.js";
import { hooks } from "./hooks.js";
import { lmIcon } from "./lm-icon.js";

// ---- maintenance panel -------------------------------------------------------
/* The diagnostic layer: reports what the machine DID; carries only switches that
   RESCUE. Three rules it must keep: never rendered in glass (it must stay readable where
   glass is the problem); it survives a half-broken app - every reading guarded, printing
   "unavailable" rather than throwing; and the copy-report carries counts and environment
   ONLY, never card text, intent names or quick facts - the content is the employer's.
   The two readings that justify the panel: STORAGE MODE (the in-memory fallback's only
   symptom is stars and hidden cards quietly forgetting themselves) and the NAMESPACE
   with its seed counts ("everything reset itself" must be answerable with "the catalog
   changed"). */
function mtSafe(f){
  try{ const v=f(); return (v==null||v==="")?"-":String(v); }
  catch(e){ return "unavailable"; }
}
/* A READING, NEVER A SWITCH. Nothing in this file behaves differently per browser - what a
   browser can do is asked of the browser, as eWatchSupported does - and this exists so a
   report can name what was running. Ordered: Edge, Opera and Samsung all say Chrome too. */
function mtBrowser(){
  const ua=navigator.userAgent||"";
  const first=(tab,ver)=>{
    for(let i=0;i<tab.length;i++){
      const at=ua.indexOf(tab[i][1]);
      if(at<0) continue;
      const v=ver?parseInt(ua.slice(at+tab[i][1].length),10):0;
      return tab[i][0]+(v?" "+v:"");
    }
    return "";
  };
  const os=(navigator.userAgentData||{}).platform
    || first([["Windows","Windows"],["Android","Android"],["iOS","iPhone"],["iOS","iPad"],
              ["macOS","Mac OS X"],["Linux","Linux"]],false);
  const name=first([["Edge","Edg/"],["Opera","OPR/"],["Samsung Internet","SamsungBrowser/"],
                    ["Firefox","Firefox/"],["Chrome","CriOS/"],["Chrome","Chrome/"],
                    ["Safari","Version/"]],true);
  return (name||"unknown")+(os?" ("+os+")":"");
}
/* WHERE THE CATALOG IN USE CAME FROM: its file, which copy that is, and the folder, as far as the
   desk recorded it. A folder load records its file; a boot that accepted the file the host found
   names that file and whether it is the one shipped inside the program. */
function mtCatalogPlace(){
  const S=mtSafe, none={file:"-",copy:"(none loaded)",folder:"-"};
  try{
    if(!catalogLoaded() && !storedCatalog()) return none;
    const home=eDeskHome(), inFolder=String(nsGet("CatalogFile")||"");
    if(!eHost()) return {file:S(()=>nsGet("CatalogFrom")||(eCatalogAccepted(eCatalog())?E_CATALOG_SCRIPT:"")),
      copy:eCatalogAccepted(eCatalog())?"beside this page":"imported into this browser", folder:"-"};
    if(inFolder) return {file:inFolder, copy:lsGet(E_CATALOG_FOLDER_KEY)?"the chosen catalog folder's":"Documents\\Etiuda",
      folder:S(()=>eHomeless(eCatalogFolder(),home))};
    if(eCatalogAccepted(eCatalog())) return {file:S(()=>eCatalogFile()),
      copy:eCatalogBuiltIn()?"the program's own":"found beside the program", folder:eCatalogBuiltIn()?"inside the program":S(()=>eHomeless(eCatalogIn(),home))};
    return {file:S(()=>nsGet("CatalogFrom")), copy:"a file opened by hand", folder:"-"};
  }catch(e){ return {file:"unavailable",copy:"unavailable",folder:"unavailable"}; }
}
/* The state the desk holds for the catalog in use, and the key that signed it where that key is
   known from the file this load read. */
function mtSignature(){
  const s=heldCatalogTrust();
  if(!s) return "-";
  const c=eCatalog(), d=catalogDocOf(c), held=storedCatalog();
  const key=(d && d.sig && d.sig.keyId && held && eCatalogSignature(c)===eCatalogSignature(held)) ? String(d.sig.keyId) : "";
  const word={valid:"signed",none:"unsigned",invalid:"changed since signed",unknown:"key not known here"}[s]||s;
  return word+(key?" ("+key+")":"");
}
function mtReadings(){
  const S=mtSafe, r=[];
  /* `title`, not `t`: t() is the translation function and the rows below now use it. */
  const sec=title=>r.push({sec:title});
  const row=(k,v,warn,panelOnly)=>r.push({k:k,v:v,warn:!!warn,panelOnly:!!panelOnly});
  sec("Engine");
  row("version",S(()=>E_VERSION));
  row("running from",S(()=>location.protocol==="file:"?"file://":location.origin));
  row("running in",S(()=>mtBrowser()));
  row("host",S(()=>eHost()?"desktop app":"browser"));
  /* ONE ROW, because neither half answered on its own: data-theme is always written, so
     this could never say "system" and never said whose decision the colour was. What the
     system asks is the answer only while nothing is stored - once you choose, you are. */
  row("theme",S(()=>(document.documentElement.getAttribute("data-theme")||systemTheme())
    +(themeChoice()?" (chosen)":" (system)")));
  sec("Catalog");
  // The rev first, on a row of its own so no number stands under the word edition, and the dated edition after it.
  const edName=(()=>{ try{ return editionNameOf({version:E_CATALOG_VERSION, rev:E_CATALOG_REV}); }catch(e){ return undefined; } })();
  if(edName && edName.r!=null) row("rev",String(edName.r));
  if(!edName || edName.e || edName.r==null) row("edition",edName===undefined ? "unavailable" : (edName && edName.e) || "-");
  row("cards / replies",S(()=>cards.length+" / "+catalogMacroCount({cards:cards})));
  row("intents / categories",S(()=>intentOrder.length+" / "+Object.keys(CATS).length));
  row("content languages",S(()=>CONTENT_LANGS.join(", ")+" (primary "+CONTENT_LANGS[0]+")"));
  row("showing",S(()=>lang));
  /* The reading that explains a card answering in the other language: a second language is
     additive, so a card without one falls back rather than rendering empty - see cardLang. */
  row("cards in one language",S(()=>{
    const others=CONTENT_LANGS.slice(1);
    let n=0;
    (cards||[]).forEach(m=>{ if(others.every(l=>!cardText(m,"body",l))) n++; });
    return n+" / "+(cards||[]).length;
  }));
  sec("Catalog file");
  {
    const at=mtCatalogPlace();
    /* The file's own name is the panel's alone: a name may carry the catalog's, and the report stays
       content-free. Where it lies and which copy it is are the environment, and travel. */
    row("file",at.file,false,true);
    row("copy",at.copy);
    row("folder",at.folder);
  }
  row("id",S(()=>{ const c=storedCatalog(); return (c&&c.id)?c.id:"none"; }));
  row("signature",S(()=>mtSignature()));
  /* The silent update channel: when a desk stops being offered new editions, this says whether
     it was ever watching a file and whether this browser can watch one at all. The NAME is not
     a reading - the Library shows it on screen, and the report must stay content-free. */
  row("file watch",S(()=>!eWatchSupported()?"not supported here":(eWatchName()?"on":"off")));
  sec("Layout");
  row("window",S(()=>innerWidth+" x "+innerHeight));
  row("layout rungs",S(()=>{
    const a=[];
    if(matchMedia("(max-width:640px)").matches) a.push("≤640 tight fills");
    if(matchMedia("(max-width:560px)").matches) a.push("≤560 strip clipped");
    return a.length?a.join(", "):"desktop";
  }));
  /* The frame does not scroll; one region under the header does - so its height against its
     content, not the window's, is what a scrollbar question is about. See pageScroller().
     Its width is the window's, less a scrollbar; y is where the header stops. */
  row("scroll region",S(()=>{
    const sc=pageScroller();
    if(!sc) return "-";
    const r=sc.getBoundingClientRect();
    return Math.round(r.height)+" of "+sc.scrollHeight+" from y "+Math.round(r.top);
  }));
  row("locked open",S(()=>{
    const a=[];
    if(railLocked()) a.push("intent panel");
    if(pillsLocked()) a.push("category bar");
    return a.length?a.join(", "):"nothing";
  }));
  row("columns",S(()=>{
    const n=colCount();
    return n+" ("+colMode()+")";
  }));
  row("list width",S(()=>{
    if(!list) return "-";
    const w=Math.round(list.getBoundingClientRect().width);
    const f=Math.round(colFloor()*remPx());
    return w+"px  (fits "+Math.max(1,Math.floor((w+COL_GAP)/(f+COL_GAP)))+" at "+f+"px)";
  }));
  row("narrowest column",S(()=>{
    const f=colFloor();
    return f+"rem ("+Math.round(f*remPx())+"px)";
  }));
  /* Card and text width, plus what the reading cap is doing. The gap between them is the
     number that decided this feature: .txt holds its line at 105ch and grows its padding, so
     right padding well above its 44px floor means width that became emptiness. */
  row("card / text width",S(()=>{
    const el=list && list.querySelector(".card .txt");
    if(!el) return "-";
    const cs=getComputedStyle(el), pl=parseFloat(cs.paddingLeft)||0, pr=parseFloat(cs.paddingRight)||0;
    const w=el.getBoundingClientRect().width;
    const p=document.createElement("span");
    p.style.cssText="position:absolute;visibility:hidden;white-space:pre;font:"+cs.font;
    p.textContent=new Array(101).join("0");
    document.body.appendChild(p);
    const ch=p.getBoundingClientRect().width/100 || 7;
    p.remove();
    return Math.round(w)+"px / "+Math.round(w-pl-pr)+"px ("+Math.round((w-pl-pr)/ch)+"ch)";
  }));
  row("right padding",S(()=>{
    const el=list && list.querySelector(".card .txt");
    if(!el) return "-";
    const pr=parseFloat(getComputedStyle(el).paddingRight)||0;
    const over=Math.max(0,Math.round(pr-44));
    return Math.round(pr)+"px"+(over?"  ("+over+"px past the reading cap)":"");
  }, false));
  sec("Storage");
  {
    const lsBad=S(()=>E_LS_OK)==="false", ssBad=S(()=>E_SS_OK)==="false";
    /* Under a desk the store is a file, and whether its last write landed is the reading that
       answers "everything reset itself"; the renderer's own localStorage is not in use there. */
    const desk=S(()=>eDeskFileShown()), trouble=eSaveTrouble();
    if(desk!=="-") row("desk file",desk);
    else row("localStorage",lsBad?"IN-MEMORY ONLY - edits last only until this tab closes":"OK",lsBad);
    row("last saved",S(()=>eLastSaved()?fileStamp(eLastSaved()):""));
    if(trouble) row("not saved since",S(()=>fileStamp(trouble.since)),true);
    row("sessionStorage",ssBad?"IN-MEMORY ONLY":"OK",ssBad);
  }
  /* EVERY key on this origin, not only ours: the quota belongs to the origin, and from
     file:// that origin is shared with every other local page. Counted as browsers charge
     it, two bytes a character, so the number can be held against the quota it will meet. */
  row("local memory used",S(()=>{
    const ks=lsKeys();
    let n=0;
    ks.forEach(k=>{ n+=(k.length+String(lsGet(k)||"").length)*2; });
    return Math.max(1,Math.round(n/1024))+" KB in "+ks.length+" keys";
  }));
  row("namespace",S(()=>E_NS));
  sec("Desk");
  row("catalog folder",S(()=>eHost()?eHomeless(eCatalogFolder(),eDeskHome()):""));
  row("tour",S(()=>tourActive()?"under way":tourDueAtBoot()?"offered at the next start":"seen or declined"));
  row("this start",S(()=>(eHost()&&eHost().recovering)?"after a crash":"ordinary"));
  row("last crash",S(()=>{
    const l=themeTrace().filter(x=>x[1]==="lost").pop();
    return l ? fileStamp(l[4]||l[0])+", "+l[2]+(l[3]!=null?" ("+l[3]+")":"") : "";
  }));
  row("desk backup",S(()=>{
    const r=eDeskRefused()[0];
    return r ? "restored"+(r.restored?" from "+fileStamp(r.restored):"") : "not needed";
  }),eDeskRefused().length>0);
  row("statistics",S(()=>{
    const days=Object.keys(pack.days||{}).length;
    let n=0; Object.values(pack.useCounts||{}).forEach(v=>{ n+=(+v||0); });
    return n+" copies, "+days+" days"+(pack.daysSince?" since "+pack.daysSince:"");
  }));
  sec("Display");
  row("device pixel ratio",S(()=>window.devicePixelRatio));
  row("backdrop-filter",S(()=>(CSS.supports("backdrop-filter","blur(1px)")
    ||CSS.supports("-webkit-backdrop-filter","blur(1px)"))?"supported":"NOT SUPPORTED"));
  /* BOTH SOURCES, because either one silences the app and the panel is where "nothing moves"
     gets answered: the Animations switch can only ADD quiet, never remove it - see
     mgReduceMotion - so a system asking for it wins over a switch left on. */
  row("reduced motion",S(()=>{
    const os=mgSystemStill();
    const off=lsGet("eMotionOff")==="1";
    if(os&&off) return "on (system, and Animations off)";
    if(os) return "on (system)";
    if(off) return "on (Animations off)";
    return "off";
  }));
  row("forced colors",S(()=>matchMedia("(forced-colors:active)").matches?"ACTIVE":"off"));
  sec("Intent panel");
  row("state",S(()=>document.body.classList.contains("rail-on")?"docked":"hidden / overlay"));
  row("panel width cap",S(()=>railMaxWidth()+"px"));
  row("dock threshold",S(()=>RAIL_DOCK_MIN+"px window ("+(innerWidth>=RAIL_DOCK_MIN?"met":"not met - panel auto-hides")+")"));
  sec("Personal state");
  row("shortcuts rebound",S(()=>{
    const raw=JSON.parse(lsGet("eShortcuts")||"null");
    return raw?Object.keys(raw).length:0;
  }));
  row("tabs",S(()=>tabs.length));
  /* COUNTS, never names - the content is the employer's. Four questions in the order they
     arrive: what is put away, what is pinned, what is edited, what is yours. Cards and intents
     answer the same four, so they share a header rather than repeating it. */
  r.push({tab:{
    head:["hidden","starred","edited","yours"],
    rows:[["cards",[(pack.hidden||[]).length,(pack.favourites||[]).length,
                    Object.keys(pack.overrides||{}).length,(pack.custom||[]).length]],
          ["intents",[(pack.intentHidden||[]).length,(pack.intentFavourites||[]).length,
                      Object.keys(pack.intentOverrides||{}).length,(pack.intentCustom||[]).length]]]
  }});
  row("categories renamed",S(()=>Object.keys(pack.catLabels||{}).length
    +Object.keys(pack.catLabelsPl||{}).length));
  row("sample untouched",S(()=>(sampleUntouched()?"yes":"no")));
  row("blur effects",S(()=>document.body.classList.contains("glass-off")?"off (rescue)":"on"));
  return r;
}
/* The REPORT stays English whatever the interface language is: it is pasted into a ticket or
   a message to someone who may not read Polish, and its labels are the words that make it
   searchable. The PANEL is what the user reads; the report is what they hand over. */
function mtReportText(){
  const lines=["Etiuda maintenance report"];
  /* The report keeps one line per reading, so a table becomes the flat form it had: the words
     are what makes it searchable in a ticket. */
  mtReadings().forEach(x=>{
    if(x.sec) lines.push("","["+x.sec+"]");
    else if(x.tab) x.tab.rows.forEach(rw=>
      lines.push(rw[0]+" "+x.tab.head.join(" / ")+": "+rw[1].join(" / ")));
    else if(!x.panelOnly) lines.push(x.k+": "+x.v);
  });
  /* The exact string, and only in the report: the panel names the browser because that is what
     a person needs, and a ticket needs the build. Nobody reads this one on screen. */
  lines.push("","[Browser]","user agent: "+navigator.userAgent);
  return lines.join("\n");
}
/* Six tiles above the readings. Each source sits in its own try, so one throw prints
   unavailable and the other five still draw. The strip is not part of the report, and it
   never prints a catalog file name or card text. */
const MT_HEALTH_IDS=["catalog","saving","watch","team","start","crash"];
function mtHealthLabel(id){
  if(id==="catalog") return t("Catalog");
  if(id==="saving") return t("Saving");
  if(id==="watch") return t("File watch");
  if(id==="team") return t("Team");
  if(id==="start") return t("Last start");
  if(id==="crash") return t("Last crash");
  return id;
}
function mtPiece(p){
  const time=p.fill && p.fill["{TIME}"]!=null ? String(p.fill["{TIME}"]) : "";
  if(p.en==="saved {TIME}") return t("saved {TIME}").split("{TIME}").join(time);
  if(p.en==="synced {TIME}") return t("synced {TIME}").split("{TIME}").join(time);
  if(p.en==="relay reachable") return t("relay reachable");
  if(p.en==="relay out of reach") return t("relay out of reach");
  if(p.en==="none recorded") return t("none recorded");
  return tc("maintenance", p.en);
}
function mtHealthSay(tile){
  if(tile.v==="unavailable") return t("unavailable");
  if(tile.parts && tile.parts.length) return tile.parts.map(mtPiece).filter(Boolean).join(" \u00b7 ") || "-";
  if(tile.v==="none recorded") return t("none recorded");
  if(tile.v==null || tile.v==="" || tile.v==="-") return "-";
  return tc("maintenance", tile.v);
}
function mtHealthCatalog(){
  if(!catalogLoaded() && !storedCatalog()) return {v:"(none loaded)"};
  const n=editionNameOf({version:E_CATALOG_VERSION, rev:E_CATALOG_REV});
  const edition=(n && n.e) ? String(n.e) : (n && n.r!=null ? String(n.r) : "");
  const sig=mtSignature();
  const word=(sig && sig!=="-") ? sig.replace(/\s*\([^)]*\)\s*$/,"") : "";
  const parts=[];
  if(edition) parts.push({en:edition});
  if(word) parts.push({en:word});
  if(!parts.length) return {v:"-"};
  return {parts:parts};
}
/* A save that did not land warns with the time alone. The path stays off this tile. */
function mtHealthSaving(){
  const trouble=eSaveTrouble();
  if(trouble){
    const stamp=fileStamp(trouble.since);
    return stamp ? {v:stamp, warn:true} : {v:"-", warn:true};
  }
  const stamp=eLastSaved() ? fileStamp(eLastSaved()) : "";
  if(stamp) return {parts:[{en:"saved {TIME}", fill:{"{TIME}":stamp}}]};
  if(E_LS_OK===false) return {v:"IN-MEMORY ONLY", warn:true};
  return {v:"-"};
}
function mtHealthWatch(){
  const v=!eWatchSupported() ? "not supported here" : (eWatchName() ? "on" : "off");
  return {v:v};
}
/* Leads the page already holds. A folder team is not called a relay. No lead is a dash. */
function mtTeamLine(leads){
  const list=(Array.isArray(leads)?leads:[]).filter(l=>l && !l.removed);
  if(!list.length) return {v:"-", warn:false, parts:null};
  const relay=list.filter(l=>l.relay || l.relayRemoved);
  const parts=[];
  let warn=false;
  if(relay.length){
    const out=relay.every(l=>l.relayRemoved===true || (l.lapse && /^(unknown|lapsed|gone)$/.test(String(l.lapse.step||""))));
    parts.push({en: out ? "relay out of reach" : "relay reachable"});
    if(out) warn=true;
  }
  let newest=0;
  list.forEach(l=>{
    const at=l.head && +l.head.t || 0;
    if(at>newest) newest=at;
  });
  const stamp=newest ? fileStamp(newest) : "";
  if(stamp) parts.push({en:"synced {TIME}", fill:{"{TIME}":stamp}});
  if(!parts.length) return {v:"-", warn:false, parts:null};
  return {v:"", warn:warn, parts:parts};
}
function mtHealthTeam(){ return mtTeamLine(teamLeads()); }
function mtHealthStart(){
  const crash=!!(eHost() && eHost().recovering);
  return {v:crash ? "after a crash" : "ordinary", warn:crash};
}
function mtHealthCrash(){
  const l=themeTrace().filter(x=>x[1]==="lost").pop();
  if(!l) return {v:"none recorded"};
  const when=fileStamp(l[4]||l[0]);
  const why=l[2]!=null ? String(l[2]) : "";
  const exit=l[3]!=null ? " ("+l[3]+")" : "";
  const text=[when, why].filter(Boolean).join(", ")+exit;
  return {v:text || "-", warn:true};
}
function mtHealthRead(id){
  if(id==="catalog") return mtHealthCatalog();
  if(id==="saving") return mtHealthSaving();
  if(id==="watch") return mtHealthWatch();
  if(id==="team") return mtHealthTeam();
  if(id==="start") return mtHealthStart();
  if(id==="crash") return mtHealthCrash();
  return {v:"-"};
}
function mtHealthTiles(plant){
  return MT_HEALTH_IDS.map(id=>{
    let v="-", warn=false, parts=null;
    try{
      const src=(plant && typeof plant[id]==="function") ? plant[id] : ()=>mtHealthRead(id);
      const got=src();
      if(got && typeof got==="object"){
        v=(got.v!=null && got.v!=="") ? String(got.v) : (got.parts ? "" : "-");
        warn=!!got.warn;
        parts=got.parts || null;
      }else if(got==null || got===""){
        v="-";
      }else{
        v=String(got);
      }
    }catch(e){
      v="unavailable"; warn=true; parts=null;
    }
    return {id:id, v:v, warn:warn, parts:parts};
  });
}
function mtHealthHtml(plant){
  return '<div class="mt-health">'+mtHealthTiles(plant).map(tile=>
    '<div class="mt-h'+(tile.warn?" mt-bad":"")+'" data-mt-h="'+tile.id+'"><i></i><div><b>'
    +esc(mtHealthLabel(tile.id))+'</b><small>'+esc(mtHealthSay(tile))+'</small></div></div>'
  ).join("")+'</div>';
}
function mtMaintBody(){
  return '<p class="mt-sub">'+esc(t("What this computer reports, and ways to set things right."))+'</p>'
    +mtHealthHtml()
    +'<h3 class="mt-readings">'+esc(t("Readings"))+'</h3>'
    +mtGridHtml();
}
/* THE READINGS GO STALE WHILE YOU WATCH: half of Layout is the window itself and the rest
   answers to the system, so a panel left open across a resize, a theme switch or an edit made
   in another tab described a machine that had moved on. Throttled, not deferred: it keeps up
   during a drag and still lands on the size the drag ended at. Rebuilding is safe only because
   nothing in the readings can hold focus - the buttons sit in the pinned row. */
let mtLiveT=0;
function mtGridEl(){
  if(modalEl && !modalEl.hidden && modalCard && modalCard.classList.contains("mt-modal")){
    return modalCard.querySelector(".mt-grid");
  }
  const sh=typeof document!=="undefined"?document.getElementById("screenHost"):null;
  if(sh && !sh.hidden){
    return sh.querySelector(".mt-grid");
  }
  return null;
}
function mtPanelOpen(){
  return !!mtGridEl();
}
function mtRefreshLive(){
  if(mtLiveT || !mtPanelOpen()) return;
  mtLiveT=setTimeout(()=>{
    mtLiveT=0;
    const g=mtGridEl();
    if(!g) return;
    const root=g.parentNode;
    if(root && typeof root.querySelector==="function"){
      const strip=root.querySelector(".mt-health");
      if(strip) strip.outerHTML=mtHealthHtml();
      const head=root.querySelector(".mt-readings");
      if(head) head.textContent=t("Readings");
    }
    g.outerHTML=mtGridHtml();
  },120);
}
/* Width crossings arrive as resize, which the one listener already carries. These are the
   states that change with no resize at all - and the store, which another tab can write. */
function wireMaintenanceWatch(){
try{
  const h=eHost();
  if(h && h.recovering && h.lostPage) traceNote(["lost",String(h.lostPage.reason),h.lostPage.exitCode,+h.lostPage.at||0]);
  ["(prefers-color-scheme: light)",M_STILL_Q,"(forced-colors: active)"]
    .forEach(q=>{
      const m=matchMedia(q);
      if(m.addEventListener) m.addEventListener("change",mtRefreshLive);
      else if(m.addListener) m.addListener(mtRefreshLive);   // older Safari
    });
  addEventListener("storage",mtRefreshLive);
}catch(e){}
}
/* Rebuilt, not merely built: one place has to own the readings and the markup they take. */
function mtGridHtml(){
  const rows=mtReadings();
  let html='<div class="mt-grid">';
  let open=false;
  rows.forEach(x=>{
    if(x.sec){
      if(open) html+='</div>';
      html+='<div class="mt-sec" data-mt-sec="'+esc(x.sec)+'"><h3>'+esc(tc("maintenance",x.sec))+'</h3>';
      open=true;
    }else if(x.tab){
      const th=w=>'<span class="h">'+esc(tc("maintenance",w))+'</span>';
      html+='<div class="mt-tab">'+th("")+x.tab.head.map(th).join("")
        +x.tab.rows.map(rw=>'<span>'+esc(tc("maintenance",rw[0]))+'</span>'
          +rw[1].map(v=>'<span>'+esc(String(v))+'</span>').join("")).join("")
        +'</div>';
    }else{
      /* The readings stay plain data; the PANEL translates them. The value goes through t()
         too - a plain word like "on" has a Polish form, a measurement like "1280 x 800" has
         no entry and falls through unchanged, which is exactly the fallback rule. */
      html+='<div class="mt-row"><span class="k">'+esc(tc("maintenance",x.k))+'</span>'
        +'<span class="v'+(x.warn?" mt-warn":"")+'">'+esc(tc("maintenance",x.v))+'</span></div>';
    }
  });
  if(open) html+='</div>';
  html+='</div>';
  return html;
}

function wireMaintenanceActions(root, closeFn){
  const $q = s => root ? root.querySelector(s) : $(s);
  const ej = $q("#mtEject"); if(ej) ej.onclick=ejectCatalog;
  const cp = $q("#mtCopy"); if(cp) cp.onclick=()=>copy(mtReportText(),"Report copied");
  const cls = $q("#mtClose"); if(cls) cls.onclick=()=>{ if(closeFn) closeFn(); else dismissModal(); };
}

const MT_MOVED="Reset defaults and Clear local memory are in Settings, under Data and defaults.";
let mtOn="health";
/* Built when asked, so each name and lede is a literal t() call the strings legs count and the
   desk's language reaches. */
const mtPages=()=>[
  {key:"health", icon:"health", name:t("Health")},
  {key:"engine", icon:"desks", name:t("Engine and display")},
  {key:"catalog", icon:"categories", name:t("Catalog")},
  {key:"storage", icon:"data", name:t("Storage and desk")},
  {key:"layout", icon:"layout", name:t("Layout and intent panel")},
  {key:"state", icon:"user", name:t("Personal state")}
];
const mtLede=()=>({
  engine:t("What runs Etiuda here, and what the screen offers it."),
  catalog:t("The catalog in use, and the file it came from."),
  storage:t("Where the desk keeps its memory, and its own state."),
  layout:t("How the window is laid out, and the intent panel."),
  state:t("What you have made your own on this desk.")
});
function mtNavHtml(){
  return mtPages().map(p=>{
    const on=p.key===mtOn;
    return '<button type="button" class="sx-sec'+(on?" on":"")+'" data-mt="'+esc(p.key)+'"'
      +(on?' aria-current="page"':'')+'>'+lmIcon(p.icon)+'<span data-i18n-skip>'+esc(p.name)+'</span></button>';
  }).join("");
}
function mtShellHtml(){
  const pages=mtPages(), page=pages.filter(p=>p.key===mtOn)[0]||pages[0];
  return '<div class="sx lm lm-mt mt-screen" data-page="'+esc(page.key)+'">'
    +'<div class="lm-split">'
    +'<nav class="sx-nav" aria-label="'+esc(t("Maintenance"))+'"><h1>'+esc(t("Maintenance"))+'</h1>'
    +'<div class="sx-secs" id="mtSecs">'+mtNavHtml()+'</div>'
    +'<div class="sx-foot"><button type="button" class="sx-maint" id="mtSettings">'+lmIcon("general")
    +esc(t("Settings"))+'</button></div></nav>'
    +'<div class="sx-page" id="mtPage"><div class="sx-crumb">'+esc(t("Maintenance"))+'</div>'
    +'<h2 id="mtTitle" data-i18n-skip>'+esc(page.name)+'</h2>'
    +'<p class="lede" id="mtLede" data-i18n-skip>'+esc(page.key==="health"?"":(mtLede()[page.key]||""))+'</p>'
    +mtMaintBody()
    +'<p class="mt-moved sx-note" id="mtMoved">'+esc(t(MT_MOVED))
    +' <button type="button" class="btn" id="mtOpenData">'+esc(t("Open Data and defaults"))+'</button></p>'
    +'</div></div>'
    +'<div class="screen-actions"><div class="mf-left">'
    +'<button type="button" class="btn danger" id="mtEject">'+esc(t("Eject catalog"))+'</button></div>'
    +'<button type="button" class="btn" id="mtCopy" title="'+esc(t("Copy the report: counts and environment only, never your content"))+'">'+esc(t("Copy report"))+'</button>'
    +'<button type="button" class="btn primary" id="mtClose">'+esc(t("Done"))+'</button>'
    +'</div></div>';
}
function wireMtShell(root){
  if(!root||typeof root.querySelectorAll!=="function") return;
  const buttons=root.querySelectorAll(".sx-sec[data-mt]");
  if(!buttons||!buttons.length) return;
  const show=key=>{
    mtOn=key||"health";
    root.setAttribute("data-page", mtOn);
    root.querySelectorAll(".sx-sec[data-mt]").forEach(b=>{
      const on=b.getAttribute("data-mt")===mtOn;
      if(b.classList) b.classList.toggle("on", on);
      if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
    });
    const page=mtPages().filter(p=>p.key===mtOn)[0];
    const title=root.querySelector("#mtTitle");
    if(title&&page) title.textContent=page.name;
    const lede=root.querySelector("#mtLede");
    if(lede) lede.textContent=mtOn==="health"?"":(mtLede()[mtOn]||"");
  };
  buttons.forEach(b=>{ b.onclick=()=>show(b.getAttribute("data-mt")); });
  const gear=root.querySelector("#mtSettings");
  if(gear) gear.onclick=()=>{ if(typeof hooks.openSettings==="function") hooks.openSettings(); };
  const data=root.querySelector("#mtOpenData");
  if(data) data.onclick=()=>{ if(typeof hooks.openSettings==="function") hooks.openSettings("data"); };
}
registerScreen("maintenance", {
  title: () => t("Maintenance"),
  render: (host, closeFn) => {
    host.innerHTML = mtShellHtml();
    wireMaintenanceActions(host, closeFn);
    wireMtShell(host.querySelector ? host.querySelector(".sx.lm-mt") : null);
  }
});

function openMaintenanceModal(backFn){
  openDialog({
    cls: "mt-modal",
    back: backFn||null,
    title: "Maintenance",
    body: mtMaintBody()+'<p class="mt-moved" id="mtMoved">'+esc(t(MT_MOVED))+'</p>',
    actions: '<div class="mf-left">'
      +'<button type="button" class="btn danger" id="mtEject">'+esc(t("Eject catalog"))+'</button>'
      +'</div>'
      +'<button type="button" class="btn" id="mtCopy" title="'+esc(t("Copy the report: counts and environment only, never your content"))+'">'+esc(t("Copy report"))+'</button>'
      +'<button type="button" class="btn primary" id="mtClose">'+esc(t("Done"))+'</button>',
    wire: () => wireMaintenanceActions(null, () => dismissModal())
  });
}

function openMaintenance(backFn){
  if(typeof closeModal === "function"){
    try { closeModal(); } catch(_) {}
  }
  try {
    openScreenTab("maintenance");
    return;
  } catch (_) {}
  openMaintenanceModal(backFn);
}

export {
  wireMaintenanceWatch,
  mtRefreshLive,
  openMaintenance,
  openMaintenanceModal,
  mtGridHtml,
  wireMaintenanceActions,
  mtHealthTiles,
  mtHealthHtml,
  mtReportText,
  mtTeamLine,
  mtMaintBody
};
