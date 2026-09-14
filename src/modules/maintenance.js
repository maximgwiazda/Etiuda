import { cardText } from "./card-model.js";
import { eWatchSupported, eWatchName, catalogVersionLabel, E_CATALOG_NAME, E_CATALOG_VERSION } from "./catalog.js";
import { catalogMacroCount, sampleUntouched } from "./catalog-file.js";
import { remPx, colMode, colFloor, colCount, COL_GAP } from "./columns.js";
import { CATS, CONTENT_LANGS } from "./content-model.js";
import { dismissModal, openDialog } from "./dialog.js";
import { eEmbeddedCatalog, E_VERSION } from "./env.js";
import { lsGet, lsDel, lsKeys, E_NS, E_LS_OK, E_SS_OK } from "./storage.js";
import { clearLocalMemory, ejectCatalog } from "./local-memory.js";
import { loadShortcuts } from "./shortcuts.js";
import { tabs } from "./tabs.js";
import { ask, tc, toast } from "./ui-lang.js";
import { pack } from "./pack.js";
import { RAIL_DOCK_MIN, railLocked, railMaxWidth } from "./rail-panel.js";
import { pageScroller } from "./page-scroll.js";
import { intentOrder } from "./intent-id.js";
import { esc } from "./esc.js";
import { list, modalEl, modalCard, $ } from "./dom.js";
import { systemTheme, themeChoice } from "./theme.js";
import { copy } from "./mark.js";

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
function mtReadings(){
  const S=mtSafe, r=[];
  /* `title`, not `t`: t() is the translation function and the rows below now use it. */
  const sec=title=>r.push({sec:title});
  const row=(k,v,warn)=>r.push({k:k,v:v,warn:!!warn});
  sec("Engine");
  row("version",S(()=>E_VERSION));
  row("running from",S(()=>location.protocol==="file:"?"file://":location.origin));
  row("running in",S(()=>mtBrowser()));
  /* ONE ROW, because neither half answered on its own: data-theme is always written, so
     this could never say "system" and never said whose decision the colour was. What the
     system asks is the answer only while nothing is stored - once you choose, you are. */
  row("theme",S(()=>(document.documentElement.getAttribute("data-theme")||systemTheme())
    +(themeChoice()?" (chosen)":" (system)")));
  sec("Catalog");
  row("name",S(()=>E_CATALOG_NAME||"(none loaded)"));
  row("edition",S(()=>E_CATALOG_VERSION!=null?catalogVersionLabel(E_CATALOG_VERSION):"-"));
  row("cards / macros",S(()=>cards.length+" / "+catalogMacroCount({cards:cards})));
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
    row("localStorage",lsBad?"IN-MEMORY ONLY - edits last only until this tab closes":"OK",lsBad);
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
  /* The counts used to be in this seed and are deliberately gone: an edition that added a card
     moved everyone to a new namespace and took their work with it. What the seed is made OF,
     never the name itself: Catalog prints that already, and one line has to hold whatever a
     catalog is called. */
  row("namespace seed",S(()=>{
    const c=eEmbeddedCatalog();
    if(!c) return "none (shared)";
    return String(c.name||"").trim() ? "catalog name only" : "unnamed (shared)";
  }));
  sec("Display");
  row("device pixel ratio",S(()=>window.devicePixelRatio));
  row("backdrop-filter",S(()=>(CSS.supports("backdrop-filter","blur(1px)")
    ||CSS.supports("-webkit-backdrop-filter","blur(1px)"))?"supported":"NOT SUPPORTED"));
  /* BOTH SOURCES, because either one silences the app and the panel is where "nothing moves"
     gets answered: the Animations switch can only ADD quiet, never remove it - see
     mgReduceMotion - so a system asking for it wins over a switch left on. */
  row("reduced motion",S(()=>{
    const os=matchMedia("(prefers-reduced-motion:reduce)").matches;
    const off=lsGet("pbMotionOff")==="1";
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
    const raw=JSON.parse(lsGet("pbShortcuts")||"null");
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
    else lines.push(x.k+": "+x.v);
  });
  /* The exact string, and only in the report: the panel names the browser because that is what
     a person needs, and a ticket needs the build. Nobody reads this one on screen. */
  lines.push("","[Browser]","user agent: "+navigator.userAgent);
  return lines.join("\n");
}
/* THE READINGS GO STALE WHILE YOU WATCH: half of Layout is the window itself and the rest
   answers to the system, so a panel left open across a resize, a theme switch or an edit made
   in another tab described a machine that had moved on. Throttled, not deferred: it keeps up
   during a drag and still lands on the size the drag ended at. Rebuilding is safe only because
   nothing in the readings can hold focus - the buttons sit in the pinned row. */
let mtLiveT=0;
function mtPanelOpen(){
  return !!(modalEl && !modalEl.hidden && modalCard
    && modalCard.classList.contains("mt-modal") && modalCard.querySelector(".mt-grid"));
}
function mtRefreshLive(){
  if(mtLiveT || !mtPanelOpen()) return;
  mtLiveT=setTimeout(()=>{
    mtLiveT=0;
    if(mtPanelOpen()) modalCard.querySelector(".mt-grid").outerHTML=mtGridHtml();
  },120);
}
/* Width crossings arrive as resize, which the one listener already carries. These are the
   states that change with no resize at all - and the store, which another tab can write. */
try{
  ["(prefers-color-scheme: light)","(prefers-reduced-motion: reduce)","(forced-colors: active)"]
    .forEach(q=>{
      const m=matchMedia(q);
      if(m.addEventListener) m.addEventListener("change",mtRefreshLive);
      else if(m.addListener) m.addListener(mtRefreshLive);   // older Safari
    });
  addEventListener("storage",mtRefreshLive);
}catch(e){}
/* Rebuilt, not merely built: one place has to own the readings and the markup they take. */
function mtGridHtml(){
  const rows=mtReadings();
  let html='<div class="mt-grid">';
  let open=false;
  rows.forEach(x=>{
    if(x.sec){
      if(open) html+='</div>';
      html+='<div class="mt-sec"><h3>'+esc(tc("maintenance",x.sec))+'</h3>';
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
function openMaintenance(backFn){
  /* Closing returns wherever you came from - the same contract every sub-dialog keeps.
     Opened over the Library, the X and Done go back to the Library; opened from the bare
     page, they just close. The caller says which, because only the caller knows. */
  const html=mtGridHtml();
  openDialog({
    cls: "mt-modal",
    back: backFn||null,
    title: "Maintenance",
    body: html,
    /* The rescues belong in the row that never scrolls: they are what the panel is FOR, and a
       section at the foot of the readings slid away exactly when a stuck app needed it. Grouped
       left, away from Done, as the card and category editors place their own destructive controls. */
    actions: '<div class="mf-left">'
      +'<button type="button" class="btn" id="mtShortcuts">Reset shortcuts</button>'
      +'<button type="button" class="btn danger" id="mtClear">Clear local memory…</button>'
      +'<button type="button" class="btn danger" id="mtEject">Eject catalog…</button>'
      +'</div>'
      +'<button type="button" class="btn" id="mtCopy" title="Copy the report: counts and environment only, never your content">Copy report</button>'
      +'<button type="button" class="btn primary" id="mtClose">Done</button>',
    wire: wireMaintenance
  });
  function wireMaintenance(){
  /* No glass switch here any more: it tunes rather than rescues, and Settings owns it. */
  $("#mtShortcuts").onclick=()=>{
    if(!ask("Reset all shortcuts to defaults?")) return;
    lsDel("pbShortcuts"); loadShortcuts();
    toast("Shortcuts reset");
  };
  $("#mtClear").onclick=clearLocalMemory;
  $("#mtEject").onclick=ejectCatalog;
  $("#mtCopy").onclick=()=>copy(mtReportText(),"Report copied");
  // Done goes where the X goes - back one screen, then out - not straight out.
  $("#mtClose").onclick=()=>dismissModal();
  }
}

export {
  mtRefreshLive,
  openMaintenance
};
