/* ---------------- app ---------------- */
/* THE ONE CURVE. Every move, fold and fade the script animates settles on it, and the sheet
   writes the same curve by hand; a second curve anywhere would be a second opinion about how
   the interface moves. Durations vary by what is moving; the curve does not. */
const E_EASE="cubic-bezier(.2,.7,.3,1)";
const $=s=>document.querySelector(s), list=$("#list"), pax=$("#pax"), intentEl=$("#intent"),
      agentEl=$("#agent");
// Kill browser/OS form-history & word-suggestion popups (not our intent/ROLE dropdowns).
// autocomplete="off" is often ignored by Chrome/Edge; non-standard tokens + spellcheck off work better.
function suppressBrowserSuggest(){
  function harden(el, token){
    if(!el) return;
    el.setAttribute("autocomplete", token||("rc-"+(el.id||"field")));
    el.setAttribute("autocorrect","off");
    el.setAttribute("autocapitalize","off");
    el.setAttribute("spellcheck","false");
    el.setAttribute("data-lpignore","true");
    el.setAttribute("data-1p-ignore","true");
    el.setAttribute("data-form-type","other");
  }
  harden(agentEl,"rc-agent");
  harden(pax,"rc-pax");
  harden(intentEl,"rc-intent");
  harden($("#factsEdit"),"rc-facts");
  // Stamp the same on any later-created text inputs (modals, manage dialogs)
  document.addEventListener("focusin",e=>{
    const el=e.target;
    if(!el||(el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA")) return;
    if(el.tagName==="INPUT"){
      const t=(el.type||"text").toLowerCase();
      if(t&&t!=="text"&&t!=="search"&&t!=="") return;
    }
    // Card EN/PL editors keep spellcheck on; only nudge autocomplete
    const ac=el.getAttribute("autocomplete");
    if(!ac||ac==="off"||ac==="on") el.setAttribute("autocomplete","rc-"+(el.id||el.name||"x"));
    if(el.tagName==="INPUT"||el.getAttribute("spellcheck")==="false"){
      el.setAttribute("autocorrect","off");
      el.setAttribute("autocapitalize","off");
      el.setAttribute("spellcheck","false");
      el.setAttribute("data-lpignore","true");
      el.setAttribute("data-1p-ignore","true");
      el.setAttribute("data-form-type","other");
    }
  },true);
}
suppressBrowserSuggest();
// INTENT box dual mode: normal intent pick/free-text, or macro search after pressing /
/* One search over two surfaces. railOrder is what the panel SHOWS top to bottom and what
   the arrows walk (matches only - grey rows are inactive); railMarkIdx is the intent Enter
   takes when the cursor is automatic. railMarkUsed: the offer was consumed by a pick or a
   copy, and only typing or the arrows open it again. */
let railSel=-1, railOrder=[], railMarkIdx=-1, railMatch=null;
/* The walk steps OVER picked rows, as the resting mark already does (the rail build and the
   pick tail both seek the first unpicked row): a chosen intent is a fact of the reply, not a
   candidate, and a mark on it would offer Enter as an undo. -1 when every row is picked. */
function railStep(from,step){
  const n=railOrder.length; let pos=from;
  for(let i=0;i<n;i++){ pos=((pos+step)%n+n)%n; if(intentIdxs.indexOf(railOrder[pos])<0) return pos; }
  return -1;
}
let railSortT=0, railSettled=true, railMarkUsed=false;
/* See the beforeinput above: the category filter is armed to drop and lands at railSettle. */
let catsDropArmed=false;
// A live Ctrl+Enter run. While set, a plain Enter ADDS its pick and closes the run -
// replacing would throw away everything picked so far. Survives typing (the run's
// promise is "the box stays for the next name"); dies with the set it was building.
let pickRun=false;
/* Which surface holds THE mark - "intent" or "card", never both. Hover claims it for its
   surface, arrows move it within one, a pick or a copy consumes it. */
let semiKind=null;
function kbdNav(on){ document.body.classList.toggle("e-kbdnav", !!on); }
addEventListener("mousemove",()=>{
  if(document.body.classList.contains("e-kbdnav")) kbdNav(false);
},{passive:true});
function railQuery(){
  return (typeof intentEl!=="undefined" && intentEl) ? String(intentEl.value||"").trim() : "";
}

// Several categories can be active at once (ctrl+click a pill). Empty = All.
let cats=[], shown=[];
// Focused copyable block: { id: cardId, vi: partIndex } or null (↑↓ / Enter target)
let entrySel=null;
// After picking an intent (or opening its category), scroll the list to the first
// card that is explicitly linked to that intent.
let pendingScrollHit=false;
// {INTENT} is either a chip index (so it re-maps when you flip EN<->PL) or free text.
// Several intents can be active at once (ctrl+click). Stored as indexes so each one
// re-maps when the language flips; free text is a separate, single value.
let intentIdxs=[], intentText="";
/* Language is PER-TAB: two chats side by side are routinely in different languages.
   blankTab() carries it, applyTab() installs it, setLang() writes it back; "pbLang"
   records the language last on screen and seeds new tabs - defaulting them to English
   would fight a Polish shift on every chat. */
let lang = (lsGet("pbLang")==="pl") ? "pl" : "en";

// ---- repainting after a language change: it reaches the whole app, so it stays here ----
/* Every localised string is re-read here rather than at construction, so switching language
   repaints the app instead of asking for a reload. Anything built later reads t() itself. */
function applyUiLang(){
  document.documentElement.lang = uiLang();
  /* Re-render what the app builds from strings, then sweep the markup it does not. The order
     matters: syncSettingsMenu writes labels through t(), and the sweep translates whatever was
     authored in HTML. */
  syncSettingsMenu();
  syncMoreBtn();
  syncShortcutTitles();
  /* Surfaces translated at their CALL SITE (cards, panel, pills, tabs, legend) only
     change when drawn again, and changing language draws nothing by itself. The sweep
     handles what is already in the document; this rebuilds what must say something new. */
  /* applyCatsToGlobal leads: category labels can differ by language now, and every surface
     below reads the resolved CATS rather than the catalog. */
  /* References, never names looked up on window: a top-level function is a property of window
     in a classic script and is not one in a module, so a lookup by string turns quietly false
     and these six surfaces stop repainting with nothing thrown and nothing logged. */
  [applyCatsToGlobal,drawIntentRail,drawPills,drawTabs,syncRoleDrum,render].forEach(f=>{
    try{ f(); }catch(e){}
  });
  translateChrome();
  /* The name beside a dialog's title is CONTENT, so the sweep above rightly leaves it alone -
     and nothing else re-derived it, so an open editor kept naming its card in the language
     you had just left while the title itself changed. Re-read, not translated. */
  try{ refreshDialogName(); }catch(e){}
}
/* ---- theme -----------------------------------------------------------------------------
   Theme follows the SYSTEM until the user says otherwise; a stored choice always wins
   and is never overwritten - someone who picked light on a dark machine meant it. While
   nothing is stored the OS decides LIVE (sunset flips mid-shift). data-theme is always
   written explicitly - what lets the stylesheet's :not()/[data-theme] blocks stay as-is. */
function systemTheme(){
  try{ return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
  catch(e){ return "dark"; }
}
function themeChoice(){ const t=lsGet("pbTheme"); return (t==="light"||t==="dark") ? t : null; }
function applyTheme(){ document.documentElement.dataset.theme = themeChoice() || systemTheme(); }
try{ if(lsGet("pbUiLang")==="pl") document.documentElement.lang="pl"; }catch(e){}
applyTheme();
try{
  const _mq=matchMedia("(prefers-color-scheme: light)");
  const _onSys=()=>{ if(!themeChoice()) applyTheme(); };
  if(_mq.addEventListener) _mq.addEventListener("change",_onSys);
  else if(_mq.addListener) _mq.addListener(_onSys);      // older Safari
}catch(e){}
/* THE ONE PLACE THAT DECIDES WHERE A PUT-AWAY CARD MAY APPEAR: at the foot of its own
   category, and nowhere else. Not in All, because a card set aside does not belong among the
   ones that were not, and not in any search, because being offered is the thing you put it
   away to stop. So it wants a category chosen AND an empty box - together those mean "show me
   this shelf" rather than "find me something". Put-away is not a category of its own: the same
   ruling that took the Favourites pill away, and for the same reason. */
function cardInActiveCats(m,terms){
  if(!cats.length) return !(m&&m._hidden);
  if(m&&m._hidden && terms && terms.length) return false;
  return cats.some(k=>m.c===k);
}

// ---- at load: the footer's version, and the icons the prose slots hold ---------
try{ const _v=document.getElementById("eVer"); if(_v) _v.textContent=E_VERSION; }catch(e){}
/* Fills the footer's icon slots and, more importantly, #aboutInfo's - About is built by reading
   that element's innerHTML, so the icons have to be in it before anyone opens the dialog. */
try{ fillProseIcons(document); }catch(e){}

function applyBootCatalog(){
  /* One stored catalog is the source of truth, whether it came from Import or from accepting
     the sibling file. Falling back to the sibling covers the boot where it was just accepted
     but the copy could not be written (storage full), so the user still gets what they chose. */
  const stored=storedCatalog();
  if(stored){ eApplyCatalog(stored); return; }
  /* An embedded catalog outranks the sibling and loads without being asked - it is part
     of this file, already consented to. It sits BELOW a stored catalog, which is what
     makes "import something else" work and lets Reset fall back to the built-in content. */
  const emb=eEmbeddedCatalog();
  if(emb){ eApplyCatalog(emb); return; }
  const c=eCatalog();
  if(c && eCatalogAccepted(c)) eApplyCatalog(c);
}
applyBootCatalog();
// Snapshot built-in intents; runtime SW_* arrays are mutated in place so cards that
// hold sw:SW_EN keep working, and export stays a single source of truth.
const BASE_STORE={};
intentStoreKeys().forEach(k=>{ BASE_STORE[k]=SW_STORE[k].slice(); });
const BASE_N=BASE_STORE.en.length;
let intentOrder=[], intentOrderLoaded=false;
function intentIdAt(i){
  if(i<BASE_N) return "i:"+i;
  const c=(pack.intentCustom||[])[i-BASE_N];
  return c&&c.id ? c.id : "ui:"+i;
}
function isIntentHiddenId(id){ return (pack.intentHidden||[]).indexOf(id)>-1; }
/* The reverse of intentIdAt. Open-coded in two places before a third wanted it. */
function intentIdxOfId(id){
  for(let i=0;i<SW_EN.length;i++) if(intentIdAt(i)===String(id)) return i;
  return -1;
}
function isIntentHiddenIdx(i){ return isIntentHiddenId(intentIdAt(i)); }
function intentIsCustom(i){ return i>=BASE_N; }
function intentIsOverridden(i){
  return i<BASE_N && !!(pack.intentOverrides&&pack.intentOverrides["i:"+i]);
}
function rebuildIntents(){
  dropLabelStats();    // the labels are about to change; their word frequencies go with them
  for(let i=0;i<BASE_N;i++){
    const o=(pack.intentOverrides||{})["i:"+i]||{};
    INTENT_TEXT_FIELDS.forEach(f=>CONTENT_LANGS.forEach(l=>{
      const k=INTENT_FIELD_KEY[f][l], v=o[k];
      const kept=INTENT_BLANK_CLEARS[f] ? (v!=null) : (v!=null && v!=="");
      SW_STORE[k][i]= kept ? v : BASE_STORE[k][i];
    }));
  }
  intentStoreKeys().forEach(k=>{ SW_STORE[k].length=BASE_N; });
  (pack.intentCustom||[]).forEach(c=>{
    intentStoreKeys().forEach(k=>{ SW_STORE[k].push(c[k]||""); });
  });
  const n=SW_EN.length;
  if(!intentOrderLoaded){
    try{ intentOrder=JSON.parse(nsGet("IntentOrder")||"null")||[]; }catch(e){ intentOrder=[]; }
    intentOrderLoaded=true;
  }
  intentOrder=intentOrder.filter(i=>Number.isInteger(i)&&i>=0&&i<n);
  for(let i=0;i<n;i++) if(intentOrder.indexOf(i)<0) intentOrder.push(i);
  // Drop selection of hidden intents; keep full order for Manage list position
  intentIdxs=intentIdxs.filter(i=>intentOrder.indexOf(i)>-1 && !isIntentHiddenIdx(i));
  // Favourites first, then regulars (rail + dropdown share intentOrder)
  syncIntentOrder();
  syncIntentInput();
  drawIntentRail();
}
function refreshAfterIntents(){
  rebuildIntents();
  drawPills();
  render();
}
/* Bumped by the one hook every pack mutation already passes through, so a card's signature
   notices an edit, a star, a hide or a reorder without enumerating them. */
let ePackEpoch=0;
function savePack(){
  ePackEpoch++;
  /* Written under BOTH names - see migratePackKeys(): an older build opened against the
     same storage reads macroOrder/baseMacros and finds them. The duplicates are written
     here rather than kept on `pack`, so the live object carries the new vocabulary only. */
  let out=pack;
  try{
    out=Object.assign({},pack,{macroOrder:pack.cardOrder,baseMacros:pack.baseCards});
  }catch(e){ out=pack; }
  try{ nsSet("Pack",JSON.stringify(out)); }catch(e){ toast("Could not save, perhaps because the browser's storage is full."); }
  /* Every pack mutation lands here, so this is the one hook that cannot be forgotten. Wiring
     the watermark to each individual edit path instead would mean the next new one silently
     leaves a "sample" mark over content somebody has already started rewriting. */
  syncSampleMark();
}
function applyCatsToGlobal(){
  // Removed categories are skipped rather than deleted from BASE_CATS, so Reset brings the
  // catalog's own back. Custom ones are gone from pack.customCats outright - nothing to restore.
  const gone=new Set(pack.removedCats||[]);
  Object.keys(CATS).forEach(k=>{
    if(gone.has(k) || (!BASE_CATS[k] && !(pack.customCats&&pack.customCats[k]))) delete CATS[k];
  });
  /* Falling order of authority; every layer is something a PERSON wrote - the engine
     translates nothing. Polish: the user's Polish name, the catalog's, the user's English
     rename, the canonical. English: rename, then canonical. A name in the English box
     never appears as its own translation - only because nothing Polish was offered. */
  const pl=uiLang()==="pl";
  Object.keys(BASE_CATS).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(pl && (pack.catLabelsPl[k] || CAT_LABELS_PL[k]))
            || pack.catLabels[k] || BASE_CATS[k];
  });
  Object.keys(pack.customCats||{}).forEach(k=>{
    if(gone.has(k)) return;
    CATS[k]=(pl && pack.catLabelsPl[k]) || pack.catLabels[k] || pack.customCats[k] || k;
  });
  // Roles name categories, so they are re-resolved whenever the category set changes
  refreshCatRoles();
}
/** Delete an empty category. Empty-only everywhere, so no path silently destroys contents.
 *  No special-category guard: a category carries no roles, and the empty-only rule is what
 *  actually guards content. */
function removeCategory(k){
  if(!k) return false;
  if(cardCounts[k]){ toast("Move or delete the cards in this category first"); return false; }
  if(pack.customCats && pack.customCats[k]) delete pack.customCats[k];
  else {
    if(!Array.isArray(pack.removedCats)) pack.removedCats=[];
    if(pack.removedCats.indexOf(k)<0) pack.removedCats.push(k);
  }
  if(pack.catLabels) delete pack.catLabels[k];
  // ...and its Polish name, or re-creating the key would inherit a name nothing on screen explains
  if(pack.catLabelsPl) delete pack.catLabelsPl[k];
  // Drop its role too, or re-creating a category with the same key would inherit it
  if(pack.catRoles) delete pack.catRoles[k];
  // ...and its icon and colour, the other two override bags resetCategory knows, for the same reason
  if(pack.catIcons) delete pack.catIcons[k];
  if(pack.catColors) delete pack.catColors[k];
  catOrder=catOrder.filter(x=>x!==k);
  cats=cats.filter(x=>x!==k);
  nsSet("CatOrder",JSON.stringify(catOrder));
  savePack(); rebuildCards();
  toast("Category deleted");
  return true;
}
/* NAMING. A macro is one copyable segment - what a click sends; a card is the titled
   container holding one or more. All user-facing wording and the catalog format use those
   meanings. INTERNAL IDENTIFIERS STILL SAY THE OLD THING (cards[], cardOrder, findCard,
   rebuildCards) - numerous, invisible, and pack.cardOrder is a stored key. Reading
   `macro` in an identifier, think card; prefer the new words in anything a user reads. */
let cards=[];
/* Displayed counts are MACROS in the user's sense - what an agent chooses between.
   cardCounts keeps the container tally separately, and it is not cosmetic: it guards
   category deletion, since a card empty in this language contributes zero segments. */
let counts={}, cardCounts={};
/* cardLang, not lang: a pinned card splits into the same blocks whichever way the toggle
   points, so a tally that asked the toggle counted the wrong language's blocks for it. */
function macroBlockCount(m){ return m ? parts(m,cardLang(m)).length : 0; }
/* What ALL shows, so put-away is not in it. Each category's own count still carries them,
   because opening that category is where they appear. */
function totalMacroCount(){
  return (cards||[]).reduce((t,m)=>t+((m&&m._hidden)?0:macroBlockCount(m)),0);
}
/* Recomputed on language switch as well as on rebuild: segment counts are per-language, since a
   catalog may split a card into a different number of blocks in EN and PL. */
/* Per-category MATCH counts for the live query, null when nothing is typed: the pills
   already carry a number, so the number means matches while a query runs - the answer
   sits where you act on it. Same predicate as the list minus the category filter (the
   question is about categories you are NOT in); hidden stays out. Memoised on the query;
   recountMacros() drops the memo whenever `cards` is rebuilt. */
/* eSCatRank rides along: {cat: {tier, rank}} for the same query, built in the same pass because
   this loop has already filtered every card and the marginal cost is scoring the survivors.
   It is what lets the pill row lead with the category your query is ABOUT - see displayCatOrder. */
let eSCounts=null, eSCountsKey=null, eSCatRank=null;
function searchCounts(){
  const terms=cardSearchTerms();
  if(!terms.length){ eSCounts=null; eSCountsKey=null; eSCatRank=null; return null; }
  const key=terms.join(" ");
  if(key===eSCountsKey && eSCounts) return eSCounts;
  const out={__all:0};
  (cards||[]).forEach(m=>{
    if(!m || m._hidden) return;                 // a query never reaches one, so it never counts one
    if(!cardMatchesSearch(m,terms)) return;
    const n=macroBlockCount(m);
    out[m.c]=(out[m.c]||0)+n;
    out.__all+=n;
  });
  eSCounts=out; eSCountsKey=key;
  return out;
}
/* SEPARATE from searchCounts, its own memo key: the counts are cheap and per-keystroke,
   this scores every match and feeds the debounced ORDER. DAMPED SUM (best full, second
   half, third a third): one excellent card beats a pile of mediocre ones, several good
   still outweigh one - 1/i is the middle of sum and max. */
let eSCatRankKey=null;
function searchCatRank(){
  const terms=cardSearchTerms();
  if(!terms.length){ eSCatRank=null; eSCatRankKey=null; return null; }
  const key=terms.join(" ");
  if(key===eSCatRankKey && eSCatRank) return eSCatRank;
  const per={};
  const aterms=intentAffinityGroups();
  (cards||[]).forEach(m=>{
    if(!m || m._hidden) return;
    if(!cardMatchesSearch(m,terms)) return;
    const s=cardSearchScore(m,terms,aterms);
    const p=per[m.c] || (per[m.c]={tier:9, scores:[]});
    if(s.tier<p.tier) p.tier=s.tier;
    p.scores.push(s.score);
  });
  const rank={};
  Object.keys(per).forEach(k=>{
    const s=per[k].scores.sort((a,b)=>b-a);
    let v=0;
    for(let i=0;i<s.length;i++) v+=s[i]/(i+1);
    rank[k]={tier:per[k].tier, rank:v};
  });
  eSCatRank=rank; eSCatRankKey=key;
  return rank;
}
/** Update the numbers already on screen without rebuilding the row - drawPills() replaces every
 *  node, which would restart the regroup FLIP and drop drag state on every keystroke. */
/* THE PILL ROW CHANGES AS ONE THING: numbers, dimming and order land together on the
   settle - two truths about one query must not arrive at different moments. Between
   keystrokes it holds the last complete statement; the card list lands on the same
   settle, the answer arriving beside its summary. */
function syncPillCounts(){
  if(!pills) return;
  schedulePillOrder();
}
/** The numbers and the dimmed state, written in place. Used when nothing has to move - drawPills
 *  writes both itself when the row is rebuilt, so a reorder never needs this as well.
 *  A count changing digits changes the pill's WIDTH, and a snap there reads as a glitch the
 *  row's own FLIP never allows - so widths tween. Reads batched before writes: interleaved,
 *  every pill costs a forced layout. */
function writePillCounts(){
  if(!pills) return;
  const sc=searchCounts();
  const els=Array.prototype.slice.call(pills.querySelectorAll(".pill[data-k]"));
  const w0=els.map(el=>el.getBoundingClientRect().width);
  els.forEach(el=>{
    const k=el.dataset.k, b=el.querySelector("b");
    if(!b) return;
    const n = sc ? (k==="" ? (sc.__all||0) : (sc[k]||0))
                 : (k==="" ? totalMacroCount() : (counts[k]||0));
    b.textContent=String(n);
    el.classList.toggle("pill-nohit", !!sc && !n && k!=="");
  });
  tweenPillWidths(els, w0);
}
/* FLIP for the horizontal axis: start at the old width, force one layout, release to the
   new. Inline width is the animation and must leave when it ends, or the pill stops
   following its own content. The 1.5px floor is for fractional DPRs, where rounding makes
   every pill "change" on every pass. HEIGHT IS THE INVARIANT: frozen start widths in the
   new order can flip a row break, doubling the bar for the tween's length - so if applying
   them moves the bar's height at all, the whole width tween rolls back and only snaps. */
function tweenPillWidths(els, w0){
  const grew=[];
  /* scrollHeight, never offsetHeight: the auto-hidden bar wears max-height plus
     overflow:hidden, which clamps offsetHeight to two lines on BOTH reads - the guard went
     blind exactly where the clip put the rewrap out of sight, and the tween played it. */
  const hNat=pills.scrollHeight;
  els.forEach((el,i)=>{
    const w1=el.getBoundingClientRect().width;
    if(Math.abs(w1-w0[i])<1.5) return;
    el.style.transition="none";
    el.style.width=w0[i]+"px";
    grew.push({el, w:w1});
  });
  if(!grew.length) return;
  void pills.offsetHeight;
  if(pills.scrollHeight!==hNat){
    grew.forEach(g=>{ g.el.style.transition=""; g.el.style.width=""; });
    return;
  }
  /* Attached two frames on, once the render this rides on has painted: width is a
     main-thread animation and loses its opening to that paint - see animateTabInsert. */
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    grew.forEach(g=>{
      g.el.style.transition="width .18s "+E_EASE;
      g.el.style.width=g.w+"px";
      clearTimeout(g.el._eWT);
      g.el._eWT=setTimeout(()=>{ g.el.style.transition=""; g.el.style.width=""; },220);
    });
  }));
}
/* Counts live, ORDER settles at 400ms: live ordering rebuilt the bar per character
   (73-337ms) under the typing hand. 400 clears a deliberate pace's inter-key gap and the
   180ms FLIP, so a settle cannot begin while the last one animates. Non-typing paths
   arrive as a single call and settle once. */
let ePillOrderT=0;
function schedulePillOrder(){
  clearTimeout(ePillOrderT);
  ePillOrderT=setTimeout(syncPillOrder,400);
}
/** Settle NOW. Entering or leaving macro search is a deliberate act with nothing following it,
 *  so the row should answer immediately rather than sit 400ms behind a decision already made. */
function flushPillState(){
  clearTimeout(ePillOrderT);
  syncPillOrder();
}
/* THE SETTLE: everything the row says about the query lands here - order moved = full
   drawPills rebuild (numbers and dimming ride along); order unchanged = numbers written
   in place. Never a half-updated row. The rebuild is gated on the order actually
   differing, compared as a joined string - typing moves counts every keystroke and order
   rarely. Never mid-drag: a rebuild is the one thing a drag visibly breaks. */
function syncPillOrder(){
  if(!pills || (typeof dragState!=="undefined" && dragState)) return;
  const want=displayCatOrder(intentCats()).filter(k=>CATS[k]);
  const have=listPillKeys().filter(Boolean);
  // Nothing drawn yet (a boot's first render): the ordinary drawPills is about to do this anyway.
  if(!have || !have.length || want.join(" ")===have.join(" ")){ writePillCounts(); return; }
  const before=capturePills();
  drawPills();
  flipPills(before);
}
function recountMacros(){
  eSCountsKey=null; eSCatRank=null; eSCatRankKey=null;   // cards rebuilding; the memos are stale
  dropCatalogVocab();                     // and so are the vocabulary and its corrections
  dropIntentKeywords();                   // and the rare-keyword sets built from those cards
  counts={}; cardCounts={};
  (cards||[]).forEach(m=>{
    if(!m) return;
    /* Both count what is put away. cardCounts answers whether a category can be deleted,
       which is a question about the DATA; counts is what the pill shows, and opening that
       category is exactly where a put-away card appears. Only All leaves them out. */
    cardCounts[m.c]=(cardCounts[m.c]||0)+1;
    counts[m.c]=(counts[m.c]||0)+macroBlockCount(m);
  });
}
function rebuildCards(){
  applyCatsToGlobal();
  rebuildBaseCards();
  rebuildIntents();
  /* Hidden and removed are different states: HIDDEN stays listed - greyed, bottom, out of
     search, never ringed - visibly existing, which is what makes hiding reversible in
     practice; favourite status survives. REMOVED never enters `cards`: gone from the
     interface and from exports, back on Reset because the catalog still has it. */
  const hidden=new Set(pack.hidden||[]);
  const removed=new Set(pack.removed||[]);
  const ov=pack.overrides||{};
  cards=[];
  BASE_M.forEach(base=>{
    if(removed.has(base.id)) return;
    const o=ov[base.id];
    const m=o ? Object.assign({},base,o,{id:base.id,_base:1,_overridden:1})
              : Object.assign({},base);
    if(hidden.has(base.id)) m._hidden=1;
    cards.push(m);
  });
  (pack.custom||[]).forEach(m=>{
    if(!m||!m.id||removed.has(m.id)) return;
    const c=Object.assign({},m,{_custom:1});
    if(hidden.has(m.id)) c._hidden=1;
    cards.push(c);
  });
  syncFavouritesMeta();          // drops dead favourites, then recounts
  /* Every category that exists gets a pill, empty or not - requiring counts[k] made
     Manage list categories the header silently omitted. A 0 badge is honest and gives the
     first card of that kind somewhere to drop. */
  /* Migration off the retired "fav" pseudo-category: stored orders and filters carrying
     it drop it here on the first boot after the upgrade. */
  catOrder=catOrder.filter(k=>CATS[k]);
  Object.keys(CATS).forEach(k=>{
    if(catOrder.indexOf(k)<0) catOrder.push(k);
  });
  cats=cats.filter(k=>CATS[k]);
  drawPills();
  render();
}
function uid(prefix){
  return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
function slugCat(name){
  const s=String(name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,28);
  return "uc_"+(s||"custom");
}
function findCard(id){
  return cards.find(m=>m.id===id)||BASE_M.find(m=>m.id===id)
    ||(pack.custom||[]).find(m=>m.id===id)||null;
}
function baseCard(id){ return BASE_M.find(m=>m.id===id)||null; }

// Card ↔ intent links. Built-ins store base indices (0..BASE_N-1); customs store
// stable ids ("i:4", "ui:…"). Matching always goes through intentIdAt().
function normalizeCardIntents(m){
  return (m&&m.intents?m.intents:[]).map(x=>{
    /* Resolve through intentIdAt, never hardcode "i:"+x: at or above BASE_N the intent is
       custom and its real id lives in pack.intentCustom - the literal made a dead link
       that silently did nothing. Below BASE_N the output is identical. Numeric links stay
       positional by nature; the editor writes string ids for exactly that reason. */
    if(typeof x==="number" && Number.isFinite(x)) return intentIdAt(x);
    return String(x);
  }).filter(Boolean);
}
/* THE definition of "this card belongs to this intent" - everything green derives from
   it. One function on purpose: two copies drifted the moment a third way of linking was
   added, and the pill and the cards inside it disagreed about the same intent. */
function cardLinksIntent(m,want){
  if(!m||m._hidden) return false;
  if(m.allIntents) return true;               // linked to every intent, card by card
  return normalizeCardIntents(m).indexOf(want)>-1;
}
function cardHitsSelectedIntent(m){
  if(!intentIdxs.length) return false;
  // A hidden entry is never ringed. It follows that it never sorts into a ring band either,
  // so hiding something genuinely gets it out of the way rather than only dimming it.
  return intentIdxs.some(i=>cardLinksIntent(m,intentIdAt(i)));
}
/* Blue: this card sits in a SUPPORTING category. ("Supporting" is the user-facing word;
   the stored key is `always`, kept for the format-1 contract - hence the identifiers.)
   Green wins: a card answering the question asked never also rings blue. */
function cardHitsAlwaysCat(m){
  return !!(intentIdxs.length && m && !m._hidden && isAlwaysCat(m.c) && !cardHitsSelectedIntent(m));
}
/* Lower rank sorts first: intentTop greens -> green+fav -> greens -> blue+fav -> blues
   -> rest. INTENT-TOP OUTRANKS A STAR inside the band: a star is a fact about the agent,
   intentTop is where this intent STARTS. The star still lifts within every band. NEVER
   key behaviour off catalog text - a rename must not move a card between bands. */
function intentHitRank(m){
  const hit=cardHitsSelectedIntent(m);
  if(hit){
    /* Star before "top of group", matching the band - see cmpCardDisplay. A filtered view has
       no band, so this is the same ruling reaching the same cards by the other path. */
    if(isFavourite(m&&m.id)) return 0;
    if(m&&m.intentTop) return 1;
    return 2;
  }
  if(cardHitsAlwaysCat(m)){
    if(isFavourite(m&&m.id)) return 3;
    return 4;
  }
  /* A star lifts within EVERY band - one undifferentiated rest-rank made starring an
     unlinked card move nothing while the star lit up. */
  if(isFavourite(m&&m.id)) return 5;
  return 6;
}
// Sort / drag band when an intent is on (numeric). When no intent, use displayBandKey.
function relevanceRank(m){
  if(intentIdxs.length) return intentHitRank(m);
  return isFavourite(m&&m.id) ? 0 : 1;
}
/* ---- What the list is showing: three questions render and the column layout both ask,
   in one place so they cannot drift. "All" = no pill active: the band and the favourites
   block are All-only - both LIFT cards out of their categories, and lifting inside a view
   that is already one category fragments it for nothing. */
function listIsAll(){ return !((cats||[]).length); }
/** The intent band: linked cards raised into a section of their own above the categories. */
function intentBandOn(){
  return !!(intentIdxs.length) && listIsAll() && !cardSearchTerms().length;
}
/** The favourites block, which follows the same rule and yields to the band. */
function favBlockOn(){
  return !intentIdxs.length && listIsAll() && !cardSearchTerms().length;
}
/** Is this card in the band right now? */
function inIntentBand(m){ return intentBandOn() && cardHitsSelectedIntent(m); }

/* Category order for GROUPING the list: with an intent, relevance order - list and bar
   agree about what the chat is about; without one, the drag order as always. Memoised per
   render: the comparator asks for this once per comparison. */
let eCatRel=null, eCatRelKey="";
function catRelIdx(c){
  if(!intentIdxs.length) return catSortIdx(c);
  const band=intentBandOn();
  const key=(band?"b|":"p|")+intentIdxs.join(",")+"|"+catOrder.length+"|"+Object.keys(CATS).length;
  if(eCatRelKey!==key || !eCatRel){
    eCatRel=new Map();
    /* WITH A BAND, A CATEGORY GETS NO CREDIT FOR BEING LINKED - the linked cards have LEFT
       it for the band, so ranking the remainder above the supporting groups ranks
       leftovers over the cards an agent needs in every chat. Dropping `specific` puts
       every remainder after every supporting group. The PILL BAR is deliberately
       unchanged - a pill says which categories the intent touches, still true; only the
       LIST regroups. */
    const hc=intentCats();
    displayCatOrder(band ? {specific:[], always:hc.always} : hc)
      .forEach((k,i)=>eCatRel.set(k,i));
    eCatRelKey=key;
  }
  const i=eCatRel.get(c||"");
  return i===undefined ? CAT_UNKNOWN : i;
}
function intentIdxFromId(id){
  id=String(id||"");
  if(id.indexOf("i:")===0){
    const n=+id.slice(2);
    return (Number.isInteger(n)&&n>=0&&n<BASE_N) ? n : -1;
  }
  const ix=(pack.intentCustom||[]).findIndex(x=>x&&x.id===id);
  return ix>=0 ? BASE_N+ix : -1;
}

loadPack();

// ---- agent identity ------------------------------------------------------------
// One field feeding two tokens: {AGENT} is the text verbatim, /{INIT} the lowercase initials.
// "John Smith" gives display "John Smith" and init "js"; "John S." gives "John S." and "js".
/* {AGENT} reproduces exactly what was typed: abbreviating the surname is one employer's
   policy, not a fact about support work, and a licensed engine must not bake it in.
   Whitespace still collapses - a double space is a typo, not a style. {INIT} is a
   different token doing a different job. */
function agentParts(raw){
  const s=String(raw||"").trim().replace(/\s+/g," ");
  if(!s) return {display:"",init:""};
  const w=s.split(" ").filter(Boolean);
  const first=w[0];
  const last=(w.length>1 ? w[w.length-1] : "").replace(/\.+$/,"");  // "G." -> "G" for the initial
  return {
    display: s,
    init: (first.charAt(0)+(last.charAt(0)||"")).toLowerCase()
  };
}
/* A FILL IS A BURST, NOT AN EVENT. {AGENT}, {PAX} and {ROLE} are substituted while the cards
   are built, so a keystroke in one of those boxes used to rebuild all of them - 40ms of
   Firefox per letter, and a pasted name arrived visibly behind the hand. The value is stored
   on the keystroke; only the card text waits for the pause. Nothing racy hides in the wait:
   a copy re-runs fill() from the source, so the clipboard never reads the screen. */
let eFillT=0;
function renderFillsSoon(){
  if(eFillT) clearTimeout(eFillT);
  eFillT=setTimeout(()=>{ eFillT=0; render(); },110);
}
// Starts empty, not with a name. A de-branded engine must not ship pre-filled with its
// author's identity, and the placeholder already says what the field is for.
agentEl.value = lsGet("pbAgent")!=null ? lsGet("pbAgent") : "";
function syncAgent(){
  lsSet("pbAgent",agentEl.value);
  const a=agentParts(agentEl.value);
  agentEl.title = a.display
    ? t("Customers see \"{NAME}\", and comments sign /{INIT}")
        .replace("{NAME}",a.display).replace("{INIT}",a.init)
    : t("The name customers see, exactly as you type it; comments sign with its initials");
  renderFillsSoon();
}
agentEl.oninput=syncAgent;

// ---- Comment actor ------------------------------------------------------------
// One list covering both booking comments and gift card comments.
const roleSel=$("#roleSel");
/* Suggestions only - the list never constrains what can be typed, which is what lets a catalog
   ship a short list without boxing anyone in (a group booking running past the last suggestion
   was the original reason, and it generalises). The list itself comes from whoOptions(). */
roleSel.value = "";
$("#theme").onclick=()=>{
  /* Flips whatever is on screen, which on a first click means flipping away from the system.
     Storing the result is what pins it: from here the OS no longer moves this page. Reset
     clears pbTheme with every other pb* key, so a wiped Etiuda follows the system again. */
  const cur=document.documentElement.dataset.theme||systemTheme();
  const nx=cur==="dark"?"light":"dark";
  document.documentElement.dataset.theme=nx; lsSet("pbTheme",nx);
  // Half a revolution per press, accumulating - see the #theme svg note in the stylesheet.
  const ic=document.querySelector("#theme svg");
  if(ic && !mgReduceMotion()){
    const turns=(+ic.dataset.eTurns||0)+1;
    ic.dataset.eTurns=turns;
    ic.style.transform="rotate("+(turns*180)+"deg)";
  }
};
function pillsWanted(){ return lsGet("pbPills")!=="0"; }
function pillsLocked(){ return lsGet("pbPillsLock")==="1"; }
function syncLayoutPrefs(){
  document.documentElement.classList.remove("e-pills-off");   // the head script's early call
  document.body.classList.toggle("pills-off", !pillsWanted());
  /* NO WARNING RING for a hidden panel or bar: --warn flags something WRONG, and a chosen
     preference is not. --warn/--warn-bg are read by nothing - kept, like the retired --e-c5:
     a warning colour will be wanted again, and it must mean a real fault (a catalog that
     failed to parse), never a preference set on purpose. */
  syncSettingsMenu();
}
let pillsBoxTimer=null;
/* THE SLOT'S HEIGHT IS THE ANIMATION - it sits in the sticky header, so gliding it
   carries the whole page. Measured, not declared: the ends are display:none and auto,
   which CSS cannot interpolate. Same FLIP discipline as flipPills, forced reflow included.
   `mutate` must land FINAL geometry synchronously - an intermediate layout glides to the
   wrong height. The transition is NOT in the sheet: a standing one would animate every
   step of a resize drag. */
function animatePillsBox(mutate,ms){
  ms=ms||180;
  const slot=pillsSlot();
  if(!slot || mgReduceMotion()){
    // No ride, but the header still changed height and the fixed panel is pinned to it.
    mutate();
    syncRailGeometry();
    return;
  }
  const box=()=>{
    const cs=getComputedStyle(slot);
    // A hidden slot is not a short slot: it reserves nothing, margin included.
    return cs.display==="none" ? {h:0,m:0}
      : {h:slot.getBoundingClientRect().height, m:parseFloat(cs.marginTop)||0};
  };
  const from=box();
  mutate();
  // Any override from a toggle still in flight has to go before the natural height can be read.
  slot.style.transition="none"; slot.style.height=""; slot.style.marginTop="";
  const to=box();
  const done=()=>{
    slot.classList.remove("pills-anim");
    slot.style.transition=""; slot.style.height=""; slot.style.marginTop="";
    syncRailGeometry();
  };
  clearTimeout(pillsBoxTimer);
  if(Math.abs(to.h-from.h)<1 && Math.abs(to.m-from.m)<1){ done(); return; }
  slot.classList.add("pills-anim");
  slot.style.height=from.h+"px"; slot.style.marginTop=from.m+"px";
  void slot.offsetHeight;                    // commit the start - see the note in flipPills
  slot.style.transition="height "+ms+"ms "+E_EASE+",margin-top "+ms+"ms "+E_EASE;
  slot.style.height=to.h+"px"; slot.style.marginTop=to.m+"px";
  /* The panel is fixed and positioned from the header's bottom edge - precisely the thing
     that is moving - so it is told every frame of the ride, not once. rAF stalls in a
     background tab, which is why the timer below has the last word either way. */
  const until=performance.now()+ms+20;
  const follow=()=>{
    syncRailGeometry();
    if(performance.now()<until) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  pillsBoxTimer=setTimeout(done,ms+20);
}
function togglePills(){
  animatePillsBox(()=>{
    lsSet("pbPills", pillsWanted() ? "0" : "1");
    syncLayoutPrefs();
    if(pillsWanted()) document.body.classList.remove("pills-peek");
    // Both ways: showing derives the clip, hiding clears it - see syncPillsCollapse().
    syncPillsCollapse();
  });
  toast(pillsWanted()?"Categories shown":"Categories hidden");
}
function togglePillsLock(){
  animatePillsBox(()=>{
    lsSet("pbPillsLock", pillsLocked() ? "0" : "1");
    // Locking implies the category bar should be preferred on.
    if(pillsLocked() && !pillsWanted()) lsSet("pbPills","1");
    syncLayoutPrefs();
    syncPillsCollapse();
  });
  toast(pillsLocked() ? "Categories stay fully expanded" : "Categories may auto-collapse");
}
// Ctrl/Cmd: pills peek/expand + intent rail overlay when not docked.
function pillsSlot(){ return $("#pillsSlot"); }
let railEdgeHover=false, modifierHeld=false;
/* See applyRailPeek: the window a pointer has to cross the cards and land on the panel. */
const RAIL_REACH_MS=620;
let railSearchPeek=false, railReachT=0;
/* Touch's own door to the overlay: sticky, tap-to-open, tap-outside-to-close. Hover
   cannot be the model on a touch screen - see bindRailHit. */
let railTouchOpen=false;
function applyRailPeek(){
  if(railDocked()){
    document.body.classList.remove("rail-peek");
    return;
  }
  /* Suppressed refuses HOVER and nothing else: hover is ambient and fires when the cursor
     drifts - exactly what hiding is meant to stop; Ctrl is the panel's own multi-select
     gesture, the user reaching for it, and a modifier cannot be held by accident. */
  const suppressed = railSuppressed();
  /* Typing is a reach for the panel as much as the edge is, and just as deliberate as Ctrl,
     so it ignores suppression too. Derived from the mark rather than latched: the peek lasts
     exactly as long as the mark sits on an intent, which is also why it arrives with the
     resort - markSurface withholds that mark until the query has settled. */
  const searching = !!railQuery()
    && markSurface()==="intent";
  const show=!!(modifierHeld || railTouchOpen || searching || (railEdgeHover && !suppressed));
  /* THE REACH. A search peek ends when the mark leaves the intents, and hovering a macro moves
     the mark - so crossing the cards towards the panel would shut it before the pointer could
     arrive. It therefore stands RAIL_REACH_MS after the mark leaves: land on it and hover holds
     it, stay among the cards and it goes. The grace is the search peek's alone - a released
     Ctrl is a decision, and a decision is not a journey. */
  if(show){ clearTimeout(railReachT); railReachT=0; railSearchPeek=searching; }
  else if(railSearchPeek && document.body.classList.contains("rail-peek")){
    if(!railReachT) railReachT=setTimeout(()=>{
      railReachT=0; railSearchPeek=false; applyRailPeek();
    },RAIL_REACH_MS);
    return;
  }else{ clearTimeout(railReachT); railReachT=0; }
  document.body.classList.toggle("rail-peek", show);
  // Re-measure under the (possibly multi-row) header before painting the overlay
  if(show) scheduleRailGeometry();
  else if(show) syncRailGeometry();
}
function updateModifierPeek(e){
  const held=!!(e&&(e.ctrlKey||e.metaKey));
  modifierHeld=held;
  /* Shift rides along on the same event. It reveals the hide button on a hovered star and
     nothing else - it does NOT expand the category bar, which is Ctrl's other job here. */
  document.body.classList.toggle("shift-held", !!(e&&e.shiftKey));
  /* A body class rather than a redraw: the panel rows swap their star for a hide button while
     Ctrl is down, and doing that in CSS keeps it instant and keeps drawIntentRail out of the
     keyboard path entirely. */
  document.body.classList.toggle("ctrl-held", held);
  /* Ctrl expands the bar with no pointer movement at all, so nothing would re-evaluate the order:
     a cursor resting on the panel would sit there while the bar opened over it. Re-ask with the
     last known position. */
  requestAnimationFrame(applyOverlapOrder);
  const slot=pillsSlot();
  // --- category pills ---
  if(!pillsWanted()){
    document.body.classList.remove("pills-lines-expand");
    if(slot) slot.classList.remove("pills-expand");
    /* Only when it actually flips: this runs on EVERY keydown and keyup, and re-asserting
       the class would restart the glide on each keystroke of a held chord. .12s, the
       dropdown tier - a peek answers a held key; .18s is for deliberate toggles. */
    if(held!==document.body.classList.contains("pills-peek")){
      animatePillsBox(()=>document.body.classList.toggle("pills-peek", held),120);
    }
  } else {
    document.body.classList.remove("pills-peek");
    document.body.classList.toggle("pills-lines-expand", held);
    if(slot) slot.classList.toggle("pills-expand", held);
  }
  // --- intent rail overlay (not when docked in the grid) ---
  applyRailPeek();
  // Ctrl also expands pills: re-pin the rail under the full expanded block
  scheduleRailGeometry();
}
/* Arrowing to a category you cannot see: opens the clipped bar while you keep arrowing,
   then lets it retract. It cannot reuse `pills-expand` - updateModifierPeek re-asserts
   that class from modifier state on every keydown/keyup, so the next keystroke would
   strip it; a separate class sharing the same CSS keeps two mechanisms off one flag.
   Only when it would help: the bar must be clipped (never shoved at a user who hid it on
   purpose) and the destination genuinely below the fold. Once open, later presses skip
   the test and re-arm the timer - by then everything IS visible and the test would let
   it shut mid-cycle. */
let pillNavPeekTimer=0;
const PILL_PEEK_MS=1700;
function endPillNavPeek(){
  const slot=pillsSlot();
  clearTimeout(pillNavPeekTimer); pillNavPeekTimer=0;
  if(slot && slot.classList.contains("pills-navpeek")){
    slot.classList.remove("pills-navpeek");
    scheduleRailGeometry();
  }
}
function peekPillsForKey(key){
  const slot=pillsSlot();
  if(!slot || !slot.classList.contains("pills-overflow")) return;   // nothing is being clipped
  if(slot.classList.contains("pills-expand")) return;               // Ctrl already holds it open
  if(!slot.classList.contains("pills-navpeek")){
    const el=pills && pills.querySelector('.pill[data-k="'+cssEsc(key||"")+'"]');
    if(!el) return;
    // Below the clipped edge? Then it is the reason you cannot see where you just moved.
    if(el.getBoundingClientRect().bottom <= slot.getBoundingClientRect().bottom + 1) return;
    slot.classList.add("pills-navpeek");
    scheduleRailGeometry();
  }
  clearTimeout(pillNavPeekTimer);
  pillNavPeekTimer=setTimeout(endPillNavPeek, PILL_PEEK_MS);
}
function clearModifierPeek(){
  railEdgeHover=false;
  railTouchOpen=false;
  modifierHeld=false;
  document.body.classList.remove("pills-peek","pills-lines-expand","rail-peek","ctrl-held");
  const slot=pillsSlot();
  if(slot) slot.classList.remove("pills-expand");
  scheduleRailGeometry();
}
addEventListener("keydown",updateModifierPeek);
addEventListener("keyup",updateModifierPeek);
addEventListener("blur",clearModifierPeek);
window.addEventListener("blur",clearModifierPeek);
// Cap the category bar at two lines of layout space; extra rows overlay when expanded.
// Skipped when locked (⚙ → Lock categories).
function syncPillsCollapse(){
  const el=pills;
  const slot=pillsSlot();
  if(!el||!slot) return;
  document.documentElement.style.removeProperty("--e-pills-h");   // the bar is drawn: the head script's reservation is done
  const keepExpand=slot.classList.contains("pills-expand")||document.body.classList.contains("pills-lines-expand");
  /* CLEARED BEFORE ANY EARLY RETURN: pills-overflow left on a switched-off bar let Ctrl
     peek a bar wearing clipped-bar geometry - the slot reserved two lines, the pills
     flowed three. A bar that is not on screen clips nothing; say so, and the peek needs
     no overrides at all. */
  slot.classList.remove("pills-overflow","pills-expand");
  slot.style.removeProperty("--pills-2line");
  if(!pillsWanted()||document.body.classList.contains("pills-off")) return;
  // Locked: always full height in flow (no 2-line clip / overlay expand).
  if(pillsLocked()) return;
  const first=el.querySelector(".pill");
  if(!first) return;
  // Measure unconstrained height (overflow class removed → pills are in normal flow).
  void el.offsetHeight;
  const lineH=first.getBoundingClientRect().height;
  const styles=getComputedStyle(el);
  const gap=parseFloat(styles.rowGap||styles.gap)||6;
  const two=lineH*2+gap;
  const full=el.scrollHeight;
  /* The open bar is a popover; nothing here needs to know where it sits inside the
     header any more. */
  slot.style.removeProperty("--pills-full");
  if(full>two+1){
    slot.classList.add("pills-overflow");
    slot.style.setProperty("--pills-2line",two+"px");
    /* The open height must be a real length for the transition to run, and it can only be
       read with the open styles applied - padding and border are part of it. Measure with
       the transition suppressed, then hand the number to CSS. One forced layout, in a
       function already forcing one. */
    slot.classList.add("pills-measuring","pills-expand");
    const openH=el.getBoundingClientRect().height;
    slot.classList.remove("pills-expand");
    void el.offsetHeight;                    // land back on the closed height before animating
    slot.classList.remove("pills-measuring");
    slot.style.setProperty("--pills-full",openH+"px");
  }
  if(keepExpand) slot.classList.add("pills-expand");
}
function schedulePillsCollapse(){
  // Wait for rail-on / max-width layout to settle before measuring wrap height.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    syncPillsCollapse();
    rememberPillsShape();
    scheduleRailGeometry();
  }));
}
// What the head script reserves on the next load: the slot's height at rest, per window width.
function rememberPillsShape(){
  const slot=pillsSlot();
  if(!slot||!pillsWanted()||document.body.classList.contains("pills-off")){ lsDel("pbHdrPills"); return; }
  lsSet("pbHdrPills", window.innerWidth+"x"+(Math.round(slot.getBoundingClientRect().height*10)/10));
}
/* No choreography - every way the panel comes or goes takes the same plain path: the
   layout lands frame-zero (cards move at once) and the panel fades in place. A departing
   panel keeps its last geometry (syncRailGeometry); an arriving one is held by rail-ready
   until its geometry is real (syncRailLayout). */
function toggleRail(){
  lsSet("pbRail", railWanted() ? "0" : "1");
  // Hiding the panel does not clear the pin preference (restored when shown again).
  syncRailLayout();
  drawIntentRail();
  render();
  syncLayoutPrefs();
  schedulePillsCollapse();
  toast(railWanted() ? "Intent panel shown" : "Intent panel hidden");
}
function toggleRailLock(){
  lsSet("pbRailLock", railLocked() ? "0" : "1");
  // Pinning implies the panel should be preferred on.
  if(railLocked() && !railWanted()) lsSet("pbRail","1");
  syncRailLayout();
  drawIntentRail();
  render();
  syncLayoutPrefs();
  schedulePillsCollapse();
  /* The hidden case needs the way back in the message itself: the control that undoes it lives in
     the panel, and the panel is what just went away. */
  toast(railLocked()
    ? (railWanted() ? "Intent panel locked - open, and fixed width"
                    : "Intent panel locked off - hold Ctrl to show it")
    : (railWanted() ? "Intent panel unlocked - may auto-hide, width draggable"
                    : "Intent panel unlocked - hover the left edge to peek"));
}
function syncRailPinBtn(){
  const btn=$("#railPinBtn");
  if(!btn) return;
  const on=railLocked();
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  /* THE PANEL STAYS AS IT IS - shown stays shown, hidden stays hidden, the width stays
     put. The title names whichever half is about to matter: locking a visible panel pins
     it open, locking a peeked one puts it away for good - and that case says where the
     way back is, since the button lives in the panel that just went. */
  const hidden = !railWanted();
  btn.title = t(on
    ? (hidden ? "Unlock - let the panel appear again when you hover the left edge"
              : "Unlock - allow auto-hide on narrow windows, and allow the width to be dragged")
    : (hidden ? "Lock - stop the panel appearing on hover (Ctrl still shows it)"
              : "Lock - keep the panel docked on narrow windows, and fix its width"));
  btn.setAttribute("aria-label", t(on ? "Unlock the intent panel" : "Lock the intent panel open and fix its width"));
  /* Redrawn rather than restyled: the icon IS the state. The markup ships the open cut so
     the first paint is right before this runs. */
  btn.innerHTML = on ? ICON_LOCK : ICON_LOCK_OPEN;
  syncRailResizeUI();
}
function syncSettingsMenu(){
  const pillsBtn=$("#menuPills");
  const railBtn=$("#menuRail");
  if(pillsBtn){
    pillsBtn.textContent = pillsWanted() ? t("Hide categories") : t("Show categories");
    // Avoid formatActionChord here during early boot (scReady may still be false).
    const hold=scReady?formatActionChord("expandPills"):"Hold Ctrl";
    pillsBtn.title = pillsWanted()
      ? (pillsLocked()
        ? t("Hide the category bar, which is locked fully expanded when shown")
        : t("Hide the category bar; {KEY} peeks while it is hidden").replace("{KEY}",hold))
      : t("Show the category bar under the header.");
  }
  if(railBtn){
    railBtn.textContent = railWanted() ? t("Hide intent panel") : t("Show intent panel");
    railBtn.title = t(railWanted()
      ? (railLocked()
        ? "Panel is locked open (always docked). Hide turns it off entirely."
        : "Prefer showing the intent panel when the window is wide. On narrow windows it auto-hides; hover the left edge or hold Ctrl to peek. Use the lock at the top of the panel, or Settings, to keep it open.")
      : "Intent panel off. Hold Ctrl to peek the intent list as an overlay.");
  }
  syncRailPinBtn();
}
function closeSettingsMenu(){
  const menu=$("#settingsMenu"), btn=$("#settingsBtn");
  if(menu) menu.hidden=true;
  if(btn){ btn.classList.remove("on"); btn.setAttribute("aria-expanded","false"); }
}
function openSettingsMenu(){
  const menu=$("#settingsMenu"), btn=$("#settingsBtn");
  if(!menu||!btn) return;
  closeFactsPanel();
  closeMoreMenu();
  syncSettingsMenu();
  menu.hidden=false;
  btn.classList.add("on");
  btn.setAttribute("aria-expanded","true");
}
/* The brand mark for anywhere that is not the header's own markup - the header keeps
   its copy inline so the tile paints on first parse. If the mark is ever redrawn, both
   change together or the About box quietly ships the old one. */
/* CLEARING TEXT AND CLEARING A SELECTION ARE NOT THE SAME ACT. The eraser is right for
   AGENT/PAX/ROLE - something typed being rubbed out - and wrong for chosen intents, where
   nothing was written: the selection is being started over. The second mark is the
   category set's `undo` arrow: the NAME misleads, the SHAPE is a loop back to the
   beginning - judge the drawing, not the constant it is stored under. Deliberately NOT
   the app's Reset: that has no icon, and if it ever grows one, it must not be this. */
const ICON_CLEAR_TEXT='<svg class="ic-x" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.8 17.5l-3.6-3.6c-.8-.8-.8-2 0-2.8l8-8c.8-.8 2-.8 2.8 0l4.7 4.7c.8.8.8 2 0 2.8l-6.9 6.9"/><path d="M18.3 17.5H5.8"/><path d="M4.2 9.2l7.5 7.5"/></svg>';
const TILE_MARK='<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><g transform="translate(-7.441 -7.441) scale(1.0581)"><path fill="currentColor" d="M190.65 89.21L191.65 89.01Q203.00 94.28 203.00 106.44L203.00 106.44Q203.00 112.91 200.21 118.54Q197.42 124.17 193.19 127.20Q188.96 130.24 183.03 131.64Q177.10 133.03 163.96 135.32L163.96 135.32Q175.81 140.40 175.81 152.85L175.81 152.85Q175.81 165.10 166.20 175.86Q156.59 186.62 139.11 193.69Q121.63 200.76 102.70 200.76L102.70 200.76Q92.44 200.76 83.53 198.47Q74.61 196.18 67.44 190.90Q60.27 185.62 56.64 178.10Q53.00 170.58 53.00 161.12L53.00 161.12Q53.00 131.54 94.33 118.19L94.33 118.19Q86.37 117.29 80.89 111.42Q75.41 105.54 75.41 96.58L75.41 96.58Q75.41 88.91 79.29 82.63Q83.18 76.36 91.94 69.48Q100.71 62.61 108.68 58.93Q116.65 55.24 127.00 55.24L127.00 55.24Q139.06 55.24 149.41 60.42L149.41 60.42L150.01 61.72Q149.22 63.51 147.62 73.12Q146.03 82.73 145.93 86.02L145.93 86.02L145.13 86.91L140.65 86.91L139.85 86.02L139.45 74.66Q131.49 66.50 119.83 66.50L119.83 66.50Q109.47 66.50 102.40 72.77Q95.33 79.05 95.33 88.91L95.33 88.91Q95.33 95.48 98.57 100.56Q101.80 105.64 106.83 108.03Q111.86 110.42 117.24 110.42L117.24 110.42Q119.24 110.42 122.32 109.92L122.32 109.92L123.12 110.72Q120.93 118.79 120.73 121.97L120.73 121.97Q117.44 121.38 114.35 121.38L114.35 121.38Q104.99 121.38 96.03 125.16Q87.06 128.95 82.08 137.16Q77.10 145.38 77.10 155.44L77.10 155.44Q77.10 165.60 81.93 173.42Q86.76 181.24 95.48 185.47Q104.20 189.70 116.35 189.70L116.35 189.70Q125.21 189.70 132.43 187.46Q139.65 185.22 145.28 180.84Q150.91 176.46 154.20 170.43Q157.48 164.40 157.48 157.53L157.48 157.53Q157.48 152.35 155.24 147.97Q153.00 143.59 148.82 141.55Q144.63 139.50 140.75 139.50L140.75 139.50Q137.76 139.50 134.47 140.75Q131.19 141.99 129.29 144.63Q127.40 147.27 126.75 149.12Q126.11 150.96 125.11 155.44L125.11 155.44L124.22 156.34L120.73 156.34L120.03 155.44L122.22 134.23Q128.80 127.85 136.32 125.46Q143.84 123.07 158.98 121.08L158.98 121.08Q173.12 119.28 180.49 117.59Q187.86 115.90 191.50 112.16Q195.13 108.43 195.13 103.65L195.13 103.65Q195.13 96.18 188.06 93.79L188.06 93.79L188.06 92.49L190.65 89.21Z"/></g></svg>';
// About Etiuda: elegant in-page modal with tool name + footer help/credits.
function openAbout(){
  /* Built from #aboutInfo plus a freshly rendered shortcut list. The legend cannot simply be
     cloned from the footer - it lives in an element with an id, and two of those in one
     document is a bug waiting to happen - so it is regenerated here from the same source. */
  const src=document.getElementById("aboutInfo");
  const info=src ? src.innerHTML : "";
  const keys='<b>'+esc(t("Keys"))+'</b> - '+keysLegendHtml()+' · '+esc(t("customise in"))
    +' <b><span data-icon="settings"></span> '+esc(t("→ Settings → Keyboard shortcuts"))+'</b>.<br><br>';
  openDialog({
    cls: "about-modal",
    title: "Etiuda",
    lead: '<span class="brand-tile about-tile" aria-hidden="true">'+TILE_MARK+'</span>',
    sub: t("About Etiuda · Version {V} · MIT License · © 2026 Maxim Gwiazda")
           .replace("{V}",E_VERSION),
    body: '<div class="about-body">'+keys+info+'</div>',
    actions: '<button type="button" class="btn primary" id="aboutClose">Close</button>',
    wire: ()=>{
      fillProseIcons(modalCard);
      const closeBtn=$("#aboutClose");
      if(closeBtn){
        /* Just dismissModal - the modifier class is the opener's business (openDialog resets
           the card's class list). */
        closeBtn.onclick=()=>dismissModal();
        try{ closeBtn.focus(); }catch(_){}
      }
    }
  });
}
// ---- at load: the facts panel's size watch, and the header's own menus ----
wireFactsPanel();
wireHeaderMenus();
/* Re-measure on the signals that change the inputs: window size (zoom fires resize
   too), the body class (the rail docking or leaving; the algorithm's own class writes are
   kept from ringing by the guard), and tab count via scheduleHeaderSync from drawTabs. Order
   is fixed here: the algorithm decides WHAT hides, then the chevron reads what hid.
   rAF-coalesced, so a drag costs one pass per frame at most. */
function wireHeaderShedSync(){
  let raf=0, belt=0;
  const run=()=>{
    if(raf){ cancelAnimationFrame(raf); raf=0; }
    if(belt){ clearTimeout(belt); belt=0; }
    /* Not mid-grow: a shed class toggling while the tabs transition re-lays the row under
       them - the first tab visibly jumped. The grow's completion re-asks against still
       boxes; dropping this pass loses nothing because that one always follows. */
    if(typeof tabInsertAnimating!=="undefined" && tabInsertAnimating) return;
    /* Choreography brackets BOTH syncs: the door's visibility is syncMoreBtn's to flip, so a
       diff closed before it would miss the door opening. Probes inside stay invisible. */
    const shedBefore=shedSnap();
    shedHold(()=>{ syncHeaderShed(); syncMoreBtn(); });
    if(shedBefore) shedAnimate(shedBefore);
  };
  /* rAF plus a TIMEOUT BELT: rAF is fully suspended in a hidden document, so a page
     booted in a background tab parks its boot-time ask forever and the header never syncs
     until the first resize after focus. The belt fires even hidden (timers throttle but
     run); whichever of the two lands first cancels the other. */
  const ask=()=>{
    if(!raf) raf=requestAnimationFrame(run);
    if(!belt) belt=setTimeout(run, 200);
  };
  window.scheduleHeaderSync=ask;
  addEventListener("resize", ()=>{ syncHeaderShed._refreshNat=true; syncHeaderShed._lastResize=performance.now(); ask(); });
  document.addEventListener("visibilitychange", ask);   // surface from a background boot synced
  if(typeof MutationObserver==="function"){
    /* The algorithm writes body classes, which fires this observer once more; the second pass
       computes the same k from the same inputs, toggles nothing, and the observer goes quiet.
       Purity is the loop guard - the same property that makes the boundary flicker-free. */
    new MutationObserver(ask).observe(document.body,{attributes:true,attributeFilter:["class"]});
  }
  ask();   // boot state - the page can load already narrow, or already rail-hidden
}
wireHeaderShedSync();
syncLayoutPrefs();
// re-render so the filled value appears in every card as you type, not just on copy
pax.oninput=()=>{
  renderFillsSoon();
  scheduleTabSave();
};
function updateIntentPlaceholder(){
  if(!intentEl) return;
  intentEl.placeholder=t("search intents and cards");
  const ph=$("#intentPh");
  if(ph) ph.innerHTML=t("search intents and cards · <kbd>Enter</kbd> selects the marked intent · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> for several");
}
/* Dropping the query is the only "leaving" there is. Selected intents and the category
   filter are untouched; the rail un-sorts and un-greys. */
function clearSearchQuery(){
  if(intentEl) intentEl.value="";
  railSel=-1;
  clearTimeout(railSortT); railSortT=0;
  syncIntentInput();
  syncIntentClearBtns();
  syncShortcutTitles();
  drawIntentRail();
  render();
  flushPillState();
}
intentEl.oninput=()=>{
  // The query never alters selected intents; picking is Enter's job.
  intentEl.classList.toggle("set", !!String(intentEl.value||"").trim());
  syncIntentClearBtns();
  entrySel=null; markEntrySel(); railSel=-1; railMarkUsed=false; semiKind=null;
  kbdNav(true);
  queueSearchSettle();
  scheduleTabSave();
};
/* A QUERY MEANS "SHOW ME THIS, WHEREVER IT IS", so the category filter drops - it can hide
   every match, and strand you in a category the arrow walk will not even stop at. ARMED here,
   DROPPED at the settle with the cards and the numbers: the bar moving to All while the list
   under it still showed the category was two answers to one question. Only the keystroke that
   STARTS a query arms it - a pill clicked mid-search has to stick - and typing over the whole
   box starts one, since select-all-and-retype is how a second search is made. */
intentEl.addEventListener("beforeinput",e=>{
  if(!cats.length) return;
  if(e.inputType && e.inputType.indexOf("insert")!==0) return;
  const q=String(intentEl.value||"");
  if(q.trim() && !(intentEl.selectionStart===0 && intentEl.selectionEnd===q.length)) return;
  catsDropArmed=true;
});
/* A keystroke paints NOTHING: rail order, pill row and the card list all land together at
   the settle - one statement about the finished query, nothing redrawn under the typing
   hand. Reaching for the arrows or Enter settles everything at once. */
function queueSearchSettle(){
  railSettled=false;
  railDecorate(false);
  railScheduleSort();
}
/* The box's own keydown, and stopImmediatePropagation keeps these keys from the document's
   shortcut handlers behind it. Down/Up walk the MATCHES from the mark - an arrow also
   settles a pending resort first, since reaching for the arrows says "I stopped typing".
   Enter takes the marked intent and hands the arrows to the cards; Ctrl+Enter takes it and
   keeps the box for the next name. Nothing marked - Enter releases focus to the cards. */
/* The caret lives at the end, where letters land. A bare click into the middle snaps
   back; a dragged SELECTION survives, because select-and-retype is a repair this box
   keeps. Deferred a tick: the browser sets the caret after these events fire. */
function pinSearchCaret(){
  if(!intentEl) return;
  const n=intentEl.value.length;
  if(intentEl.selectionStart===intentEl.selectionEnd && intentEl.selectionEnd!==n){
    try{ intentEl.setSelectionRange(n,n); }catch(_){}
  }
}
intentEl.addEventListener("mouseup",()=>setTimeout(pinSearchCaret,0));
intentEl.addEventListener("focus",()=>setTimeout(pinSearchCaret,0));
intentEl.addEventListener("keydown",e=>{
  if(e.altKey || e.metaKey) return;
  // The box's door onto the escape ladder.
  if(e.key==="Escape"){ e.preventDefault(); e.stopImmediatePropagation(); escapeLadderStep(); return; }
  /* THE BOX HAS NO CARET KEYS - a query is a probe, not a document, so ←/→ steer the
     categories from inside it exactly as they do from outside, and focus stops mattering
     to the arrows at all. Repair is the clear button, Esc, or Ctrl+A and retyping. The
     modified variants are RESERVED, not free: Shift may yet mean something here, and Ctrl
     already means "several" on the pills themselves - so both fall dead, and Home/End die
     with the caret they served. */
  if(e.key==="ArrowLeft"||e.key==="ArrowRight"){
    e.preventDefault(); e.stopImmediatePropagation();
    if(e.ctrlKey) return;                       // still reserved
    if(e.shiftKey){ runShortcut(e.key==="ArrowRight"?"navPillLast":"navPillFirst"); return; }
    runShortcut(e.key==="ArrowRight"?"navPillRight":"navPillLeft");
    return;
  }
  if(e.key==="Home"||e.key==="End"){ e.preventDefault(); e.stopImmediatePropagation(); return; }
  const q=String(intentEl.value||"").trim();
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    if(e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // reserved
    if(e.shiftKey){
      e.preventDefault(); e.stopImmediatePropagation();
      if(railSortT) railSettle();
      runShortcut(e.key==="ArrowDown"?"markBottom":"markTop");
      return;
    }
    /* By markSurface, not semiKind alone - the surface test the decorator paints by. A
       card mark can outlive its claim (plain pick, then refocus): still walkable here. */
    if(markSurface()==="card"){
      e.preventDefault(); e.stopImmediatePropagation();
      kbdNav(true);
      navEntry(e.key==="ArrowDown"?1:-1);
      return;
    }
    if(!q && semiKind!=="intent") return;
    e.preventDefault(); e.stopImmediatePropagation();
    kbdNav(true);
    if(railSortT) railSettle();
    /* An empty intent surface hands the arrows to the cards rather than eating them - a
       query can match no intent at all, and the cards are then the only answer there is. */
    if(!railOrder.length){ semiKind="card"; navEntry(e.key==="ArrowDown"?1:-1); return; }
    semiKind="intent";
    railMarkUsed=false;
    if(entrySel){ entrySel=null; markEntrySel(); }
    const n=railOrder.length;
    const step=e.key==="ArrowDown"?1:-1;
    const from = railSel>=0 ? railSel : (railMarkIdx>=0?railOrder.indexOf(railMarkIdx):-1);
    const to = railStep(from<0 ? (step>0?-1:n) : from, step);
    if(to<0){ semiKind="card"; navEntry(step); return; }   // every row is picked: the cards are the only answer
    railSel=to;
    railDecorate(true);
    return;
  }
  if(e.key==="Enter"){
    if(!q && semiKind!=="intent") return;
    e.preventDefault(); e.stopImmediatePropagation();
    kbdNav(true);
    if(railSortT) railSettle();       // Enter takes what the settle marks, never a stale best
    const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
    if(idx<0 || (railMarkUsed && railSel<0)){ try{ intentEl.blur(); }catch(_){} return; }
    /* Inside a run a plain Enter still ADDS, then closes the run by hand - the copy
       shortcut is Enter's alter ego and mirrors this; see runShortcut. */
    const run = !e.ctrlKey && pickRun && intentIdxs.length>0;
    pickIntent(idx, !!e.ctrlKey || run);   // clears the query - the pick reveals the full view
    if(run){ railMarkUsed=true; semiKind=null; pickRun=false; }
    railSel=-1;
    if(!e.ctrlKey){ try{ intentEl.blur(); }catch(_){} }
    return;
  }
});

/* One full turn of the pick arrow, every click - see the .e-spin-pick note in the
   stylesheet. Restartable: a second click mid-spin rewinds and goes around again. */
function spinPickClear(btn){
  if(!btn) return;
  btn.classList.remove("e-spin-pick");
  void btn.offsetWidth;
  btn.classList.add("e-spin-pick");
  clearTimeout(btn._eSpinT);
  btn._eSpinT=setTimeout(()=>btn.classList.remove("e-spin-pick"),500);
}
const intentClearBtn=$("#intentClear");
if(intentClearBtn){
  intentClearBtn.onclick=e=>{
    e.preventDefault(); e.stopPropagation();
    /* Erase only - the intents' own exits are Esc and the rail. The button greys while
       the box is empty, and spaces count as content, erased rather than ignored. */
    clearSearchQuery();   // the same leaving as Esc, so the rail un-sorts and un-greys with the box
    try{ intentEl.focus(); }catch(_){}
  };
}
updateIntentPlaceholder();
// Clear × on search / agent / pax / who - always visible, disabled when empty
function bindFieldClear(input, btn, onClear){
  if(!input||!btn) return;
  /* .length, not .trim(). A field holding three spaces is NOT empty - it looks full, it behaves
     full, and the one control that could empty it was greying itself out. Whether the content is
     meaningful is a separate question from whether there is any. */
  function sync(){ btn.disabled=!String(input.value||"").length; }
  btn.addEventListener("click",e=>{
    e.preventDefault(); e.stopPropagation();
    if(btn.disabled) return;
    input.value="";
    if(typeof onClear==="function") onClear();
    else input.dispatchEvent(new Event("input",{bubbles:true}));
    sync();
    try{ input.focus(); }catch(_){}
  });
  input.addEventListener("input",sync);
  sync();
  return sync;
}
bindFieldClear(agentEl, $("#agentClear"), ()=>{ syncAgent(); });
bindFieldClear(pax, $("#paxClear"), ()=>{
  render();
  scheduleTabSave();
});
// language segmented control
const seg=$("#seg");
/* Split in two because applyTab() needs the first half only: it draws the pills and re-renders
   the list itself, once, after installing the whole tab. Calling setLang() from there would
   render twice and write the tab back while it is still being applied. */
/* The state and the thumb: everything a click must do in its own frame, and nothing that
   costs more than a class toggle. */
function applyLangState(l){
  lang = (l==="pl") ? "pl" : "en";
  /* Records the language ON SCREEN, not the last one deliberately chosen - written on a
     tab switch as well as a click: pick PL in tab 1, switch to an English tab, close the
     browser - reopening should resume in EN, the language actually being worked in. */
  lsSet("pbLang",lang);
  seg.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.l===lang));
}
function applyLangHeavy(){
  syncShortcutTitles();
  drawIntentRail();    // the rail lists clauses in the language on screen
  recountMacros();   // segment counts are per-language
}
function applyLangUI(l){ cancelLangTail(); applyLangState(l); applyLangHeavy(); }
/* THE THUMB FIRST, THE LANGUAGE UNDER IT. The .on toggle is the whole receipt and the CSS
   slides the thumb for .18s; the rest of a switch is ~200ms of synchronous work in Firefox,
   which ate the slide whole and left it snapping (Chrome is fast enough that it never
   showed). Fired two thirds of the way in, where the easing has already spent 93% of its
   travel, so the rebuild lands after the eye has stopped following the thumb. Reduced motion
   has no slide to protect and runs it straight. Cancelled by a second click and by a tab
   switch, so an EN/PL/EN run rebuilds once. */
let eLangTailT=0;
function cancelLangTail(){ if(eLangTailT){ clearTimeout(eLangTailT); eLangTailT=0; } }
function setLang(l){
  applyLangState(l);
  const tail=()=>{
    applyLangHeavy();
    syncIntentInput();   // a listed intent re-maps to the other language
    if(typeof catOrder!=="undefined") drawPills();
    /* The fast path never calls render(): the list's structure is language-blind, so a
       full paint would spend a 40-60ms style pass re-inserting 6.7k unchanged nodes. The
       screenful rebuilds in place, the rest follows in chunks. Search stays a full render -
       relevance order is per-language. The viewport scan exits early because a rect read
       under content-visibility resolves the card it touches: measuring everything IS the
       burst being avoided. */
    if(cardSearchTerms().length || typeof list==="undefined" || !list
       || !list.querySelector(".card[data-id]") || (typeof cardDrag!=="undefined"&&cardDrag)){
      render();
    } else {
      cancelLangChunks();
      list.querySelectorAll(".list-sep.e-catsep span[data-k]").forEach(sp=>{
        const k=sp.getAttribute("data-k");
        sp.innerHTML=catIconSvg(k)+esc(CATS[k]||k||"");
      });
      const vh=(window.innerHeight||900)+240;
      const els=list.querySelectorAll(".card[data-id]");
      const nowIds=[], laterIds=[];
      let past=false;
      for(let k=0;k<els.length;k++){
        const id=els[k].getAttribute("data-id");
        if(past){ laterIds.push(id); continue; }
        const r=els[k].getBoundingClientRect();
        if(r.top>vh){ past=true; laterIds.push(id); }
        else if(r.bottom<-240) laterIds.push(id);
        else nowIds.push(id);
      }
      nowIds.forEach(rebuildCardInPlace);
      runLangChunks(laterIds);
    }
    // Language belongs to the active tab, so a switch is a tab edit like PAX or ROLE.
    scheduleTabSave();
  };
  cancelLangTail();
  let still=false;
  try{ still=matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  if(still){ tail(); return; }
  /* After the seg glide (180ms), plus the pick-tail's own +20 - the tail is quick now,
     but even a quick tail landing mid-glide costs the one animation this delay buys. */
  eLangTailT=setTimeout(()=>{ eLangTailT=0; tail(); },200);
}
/* Folded, only the active button is on screen, so a click there has to TOGGLE -
   clicking the language you are already in would read as broken. The fold is read back
   from the DOM, not the media query: the stylesheet owns the breakpoint, and asking the
   element whether its sibling is displayed cannot drift from it. */
function segFolded(){
  return [...seg.querySelectorAll("button")].some(b=>b.offsetParent===null);
}
seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{
  const other=[...seg.querySelectorAll("button")].find(x=>x!==b);
  setLang(segFolded()&&other?other.dataset.l:b.dataset.l);
});
/* Retitle on resize: the tooltip has to describe what a click will DO, and that differs between
   the two layouts. Only the wording depends on the media query - the behaviour above does not. */
/* No labels: the placeholders name their fields outright (customer's name, agent's name,
   the drum's class), constant at every width, translated by the sweep. */

// category pills - order is user-arrangeable by dragging, and persists
const pills=$("#pills");
let catOrder=[];
try{ catOrder=JSON.parse(nsGet("CatOrder")||"null")||[]; }catch(e){ catOrder=[]; }
// Legacy: Boarding pass (bp) → Check-in (cin)
catOrder=catOrder.map(k=>k==="bp"?"cin":k).filter((k,i,a)=>a.indexOf(k)===i);
let dragState=null, suppressClick=false, swapLock=0;
applyCatsToGlobal();
// counts + cards filled after rebuildCards(); seed order from base cats first
catOrder=catOrder.filter(k=>CATS[k]);

/* The one-line category tag under an intent's name (panel, card editor, Manage).
   OPENER-role categories are left out: the role links them to every intent, and a label
   identical everywhere says nothing while hiding the differences. They still show where
   they ARE information: the pill's green ring, the editor's ticked chip. */
/* Derived: it names what will actually ring green. Role categories are left out - the
   link role puts them on every intent, and a label identical everywhere says nothing. */
function intentTagCats(i){
  /* Only categories this intent reaches SPECIFICALLY. A card flagged linked-to-every-intent puts
     its category on every intent, so naming it here would repeat the same word under every row -
     and a label identical everywhere tells you nothing while hiding the real differences. */
  const want=intentIdAt(i), out=[], seen={};
  (cards||[]).forEach(m=>{
    if(!m||!m.c||!CATS[m.c]||seen[m.c]) return;
    if(normalizeCardIntents(m).indexOf(want)<0) return;
    seen[m.c]=1; out.push(m.c);
  });
  return out;
}
function primaryCatLabel(i){
  return intentTagCats(i).map(k=>CATS[k]||k).filter(Boolean).join(" · ");
}
/* "Does this intent belong to this category", for floating matching intents to the top
   of the card editor's 42-entry list. Derived from card links like everything else - and
   the better answer: it floats at least as many intents per category as the declared
   field did, more for the busiest ones. */
function intentHasPrimaryCat(i, cat){
  return !!cat && categoriesForIntent(i).indexOf(cat)>-1;
}
// Categories the selected {INTENT}(s) touch: every category that
// has a card linked to that intent (so one intent can light up several green pills).

/* Green derives ENTIRELY from card links - a second declared source could disagree, and
   a category could ring green while every card inside stayed grey. Green means one thing:
   this category holds a card linked to this intent. */
function categoriesForIntent(i){
  const out=[], seen={};
  const add=k=>{ if(k&&!seen[k]&&CATS[k]){ seen[k]=1; out.push(k); } };
  const want=intentIdAt(i);
  (cards||[]).forEach(m=>{
    if(!m||!m.c) return;
    /* No exemption for SUPPORTING categories: green outranks blue, so a linked card greens
       its category even when it is marked supporting - otherwise card and pill disagree
       about the same intent. */
    if(cardLinksIntent(m,want)) add(m.c);
  });
  return out;
}
/* Picking a category RE-RANKS the panel, so a scrolled panel shows the middle of an
   order that has just been rewritten - the top is the only place the new ranking means
   anything. Smooth unless motion is turned down, by the app's usual test: a system asking
   for reduced motion is honoured whether or not the app's own box is ticked. */
function scrollRailTop(){
  const el=document.getElementById("intentRailList");
  if(!el || !el.scrollTop) return;
  try{ el.scrollTo({top:0, behavior: mgReduceMotion()?"auto":"smooth"}); }
  catch(e){ el.scrollTop=0; }
}
function intentCats(){
  if(!intentIdxs.length) return {specific:[],always:[]};
  const specific=[], seen={};
  intentIdxs.forEach(i=>{
    categoriesForIntent(i).forEach(k=>{
      if(!seen[k]){ seen[k]=1; specific.push(k); }
    });
  });
  /* No special case for the opener any more: it reaches this set as a real category link on
     each intent, the same way every other green category does. */
  return {specific, always:ALWAYS_CATS};
}

/* Ring band for pill ordering, same precedence as the ring classes in mk():
   1 intent-linked (green) · 2 supporting (blue) · 3 the rest. Numbering starts at 1 on
   purpose: it is a precedence, not a census. */
function pillBand(k, hc){
  if(!hc) return 3;
  if(hc.specific.indexOf(k)>-1) return 1;
  if(hc.always.indexOf(k)>-1) return 2;
  return 3;
}
/** Display order only - NEVER mutates catOrder, the drag order, which must survive
 *  intents, searches and clearing unchanged. WHILE A QUERY IS LIVE: empty categories sink,
 *  live ones order by the CARD SORT'S OWN aggregated keys - never by count, which cannot
 *  tell "about it" from "merely mentions it": bestTier, then the damped score sum.
 *  Dragged order stays the final tiebreak. The search band is the OUTER key, above the
 *  intent bands - while narrowing, a green category holding nothing is noise and a grey
 *  one holding five is where you are going. Stable, with `i` final. */
/* WHAT A SIGNAL IS WORTH, not which tier it lands in: points add, so a category BOTH
   linked and always-useful outranks one that is merely either - a tier had to pick.
   Behind the search tier: an asterisk cannot push a generically useful category over the
   one the query names. */
const CAT_PTS_INTENT=100;   // the selected intent links cards that live here
const CAT_PTS_ALWAYS=50;    // somebody marked this category useful in every chat
function catIntentPoints(k,hc){
  if(!hc) return 0;
  let p=0;
  if(hc.specific.indexOf(k)>-1) p+=CAT_PTS_INTENT;
  if(hc.always.indexOf(k)>-1)   p+=CAT_PTS_ALWAYS;
  return p;
}
function displayCatOrder(hc){
  const sc=searchCounts();
  if(!sc && !intentIdxs.length) return catOrder.slice();
  return catOrder
    .map((k,i)=>{
      const cr=sc ? searchCatRank() : null;
      const r=cr ? cr[k] : null;
      return {k, i,
        s:(sc && !(sc[k]||0)) ? 1 : 0,        // empty categories to the tail
        t:r?r.tier:9,                          // then the category your query is ABOUT
        /* Under an intent the search rank is absent, so the points carry the order. */
        v:r?r.rank:(intentIdxs.length?catIntentPoints(k,hc):0),
        b:pillBand(k,hc)};
    })
    .sort((a,b)=>(a.s-b.s) || (a.t-b.t) || (b.v-a.v) || (a.b-b.b) || (a.i-b.i))
    .map(o=>o.k);
}
/* A stable pseudorandom number from a string. Stable is the point: an icon or a colour picked
   by Math.random() would be a different one on every load, which is not an identity at all. */
function catHash(s){
  let h=0; s=String(s||"");
  for(let j=0;j<s.length;j++) h=(h*31+s.charCodeAt(j))|0;
  return Math.abs(h);
}
/* Identity slot, in falling order of authority: the user's own pick, then - for a
   catalog category - its position in the CATALOG's order, never catOrder, so colour
   follows the category and reordering pills repaints nothing. A user-made category gets a
   pseudorandom slot, so two added in a row are not palette neighbours. All ("") is
   chrome, not taxonomy, and gets no slot at all. */
/* A slot is legal only if the engine still DEALS it: a stored 5 kept resurrecting retired
   pink while a bare token count stood in for validity. The cycle is the only authority; an
   unrecognised slot falls through exactly as an absent one, giving the category the colour
   it would have had if pink never existed. */
function hueIsOffered(n){
  return n!=null && E_HUE_CYCLE.indexOf(n|0) >= 0;
}
function catSlot(id){
  if(!id) return -1;
  const ov=pack&&pack.catColors?pack.catColors[id]:null;
  if(hueIsOffered(ov)) return ov|0;
  const dec=CAT_COLORS_CATALOG[id];
  if(hueIsOffered(dec)) return dec|0;
  if(pack&&pack.customCats&&pack.customCats[id]!=null) return E_HUE_CYCLE[catHash(id)%E_HUE_CYCLE.length];
  const i=Object.keys(CATS).indexOf(id);
  /* Modulo the CYCLE's length, never the token count: they were the same number until pink
     left, and with a cycle of seven the wider range lands on index 7 and returns undefined. */
  return E_HUE_CYCLE[(i>-1?i:catHash(id))%E_HUE_CYCLE.length];
}
/* Falling order of authority: the user's own pick, then what the CATALOG declares,
   then a guess from the name, then the musical pool by hash - a maintained catalog
   arrives as its author intended, an unknown category still means something, and every
   category has a mark from the moment it exists. */
/* A category is OVERRIDDEN when any of the four things its editor writes differs from what
   the catalog declares. Presence is not enough: the icon and the colour are written on every
   save whether or not they changed, so a category saved once but never altered would
   otherwise offer to reset itself to what it already is. */
function categoryIsOverridden(k){
  if(!k || !pack) return false;
  const lab=(pack.catLabels||{})[k];
  if(lab && lab!==BASE_CATS[k]) return true;
  const labPl=(pack.catLabelsPl||{})[k];
  if(labPl && labPl!==CAT_LABELS_PL[k]) return true;
  const ic=(pack.catIcons||{})[k];
  if(ic!=null && ic!==CAT_ICONS_CATALOG[k]) return true;
  const col=(pack.catColors||{})[k];
  if(col!=null && col!==CAT_COLORS_CATALOG[k]) return true;
  /* The role is layer 3 like the four above, so Reset has to see it - see the note at
     refreshCatRoles(). Held as a boolean, and only a boolean overrides. */
  const role=(pack.catRoles||{})[k];
  if(role && typeof role.always==="boolean"
     && role.always!==(CATALOG_ROLES.always.indexOf(k)>-1)) return true;
  return false;
}
/* Drops all five, so the category answers to the catalog again. A custom category has no
   catalog version to fall back to, which is why its editor is never offered this. */
function resetCategory(k){
  if(!k || !pack) return;
  [ "catLabels","catLabelsPl","catIcons","catColors","catRoles" ].forEach(bag=>{
    if(pack[bag]) delete pack[bag][k];
  });
  savePack(); applyCatsToGlobal();
}
function catIconKey(id){
  if(!id) return null;
  const ov=pack&&pack.catIcons?pack.catIcons[id]:null;
  if(ov && CAT_ICONS[ov]) return ov;
  const dec=CAT_ICONS_CATALOG[id];
  if(dec && CAT_ICONS[dec]) return dec;
  /* The CANONICAL name, never CATS[id]: that one is localised, and hints written in English
     stop matching the moment the UI turns Polish - every guessed icon would fall through to
     the hash pool and the categories would change their marks on a language switch. */
  const label=String((pack&&pack.catLabels&&pack.catLabels[id]) || BASE_CATS[id]
                     || (pack&&pack.customCats&&pack.customCats[id]) || id);
  for(let i=0;i<CAT_ICON_HINTS.length;i++){
    if(CAT_ICON_HINTS[i][0].test(label)) return CAT_ICON_HINTS[i][1];
  }
  return CAT_ICON_MUSIC[catHash(id)%CAT_ICON_MUSIC.length];
}
function catIconSvg(id,cls){
  const k=catIconKey(id);
  if(!k||!CAT_ICONS[k]) return "";
  return '<svg class="'+(cls||"cat-ic")+'" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+catIconInner(k)+'</svg>';
}
/* drawPills() wraps this to repaint the tab accents; the wrapper sits beside syncTabAccent. */
function drawPillsCore(){
  /* The + button is the bar's one focusable control, and a redraw replaces its node
     UNDER a keyboard user's focus when the language key or the tab key redraws the bar's
     labels. Text fields keep focus through such a switch by not being redrawn; the +
     earns the same by hand. */
  const addHadFocus=document.activeElement&&document.activeElement.classList
    &&document.activeElement.classList.contains("pill-add");
  pills.innerHTML="";
  const hc=intentCats();
  const mk=(id,label,n,drag)=>{
    const b=document.createElement("div");
    let extra="";
    const on = id ? cats.indexOf(id)>-1 : cats.length===0;   // "All" is on when nothing is
    // Keep intent/always hints even when the pill is selected (combined with .on in CSS).
    if(id){
      if(hc.specific.indexOf(id)>-1) extra=" hint2";        // issue-relevant - green ring
      else if(hc.always.indexOf(id)>-1) extra=" hint";      // always needed - blue ring
    }
    b.className="pill"+(on?" on":"")+extra
      +((searchCounts() && id && !n) ? " pill-nohit" : "");
    // Count including 0 - an empty category gets a 0 badge rather than no badge.
    // esc(label): names come from catalogs and renames - Import promises the file is
    // "read as data, never executed", and an unescaped label here broke that promise.
    b.innerHTML=(id
        ?catIconSvg(id)
        :'<svg class="e-pillall" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+ICON_ALL+'</svg>')
      /* data-i18n-skip: a category name belongs to whoever wrote the catalog. #pills lives
         inside <header>, which translateChrome sweeps - without the marker, a label that
         collided with an engine string was silently rewritten the moment the interface
         went Polish. All is unaffected: its label goes through t() at the call site. */
      +'<span class="pill-lab" data-i18n-skip>'+esc(label)+'</span>'
      /* ONE SLOT, TWO STATES: the card count, and a pencil while Ctrl is held. The pencil
         replaces the COUNT, which every category pill has - so every category is editable,
         which earlier shapes could not manage. Deleting lives in the editor the pencil
         opens, greyed with a reason instead of simply not existing. Same mechanic as the
         panel's star-to-hide swap, same body class, same instant-CSS reason. */
      +(id
        ? '<span class="pill-r">'
          +((n||n===0)?'<b>'+n+'</b>':"")
          +'<span class="pill-e" data-editcat="'+esc(id)+'" title="'+esc(t("Edit this category's names, icon and colour"))+'" aria-label="'+esc(t("Edit this category"))+'">'+ICON_EDIT+'</span>'
          +'</span>'
        : ((n||n===0)?" <b>"+n+"</b>":""));
    b.dataset.k=id;
    const _cs=catSlot(id);
    if(_cs>=0) b.dataset.ec=_cs;
    if(id){
      let tip=t("Click to filter · Ctrl+click to add/remove · drag to reorder");
      /* Green describes what the category HOLDS - a card linked to the chosen intent. Blue
         describes the category itself. */
      tip+=" · "+t("hold Ctrl to edit it");
      if(extra.indexOf("hint2")>-1) tip+=" · "+t("Green ring: holds a card linked to the chosen intent");
      else if(extra.indexOf("hint")>-1) tip+=" · "+t("Blue ring: a supporting category");
      b.title=tip;
    }
    if(drag && dragState && dragState.moved && dragState.key===id) b.classList.add("dragging");
    b.onclick=ev=>{
      if(suppressClick){ suppressClick=false; return; }   // finished a drag, not a click
      catsDropArmed=false;                                 // chosen by hand outranks the arming
      /* Before the pill's own handler, and stopping the event dead: a Ctrl+click on a pill means
         "add this category to the selection", and the pencil sits inside the pill. */
      const ed=ev&&ev.target&&ev.target.closest?ev.target.closest("[data-editcat]"):null;
      if(ed){ ev.preventDefault(); ev.stopPropagation(); openCategoryEditor(ed.getAttribute("data-editcat"),true); return; }
      // Captured before cats changes, so the rail's echo animates from where it really was
      const railBefore=captureRail(), relBefore=railRelKeys();
      if(!id){ cats=[]; }                                  // "All" clears the filter
      else if(ev && (ev.ctrlKey||ev.metaKey)){             // ctrl+click adds/removes
        const at=cats.indexOf(id);
        if(at>-1) cats.splice(at,1); else cats.push(id);
      }
      else cats = (cats.length===1 && cats[0]===id) ? [] : [id];
      // Opening a category while an intent is selected → jump to its linked entries
      pendingScrollHit=!!intentIdxs.length;
      drawPills(); render();
      railEchoRedraw(railBefore, relBefore);
      scrollRailTop();
      scheduleTabSave();
    };
    // Pointer-based dragging. HTML5 drag-and-drop gave a no-drop cursor and never
    // fired drop; pointer events also let the list reorder live, under the cursor.
    if(drag) b.onpointerdown=e=>{
      if(e.pointerType==="touch") return;   // taps are taps - see the rail rows for the story
      if(e.button!==0) return;
      if(e.target.closest&&e.target.closest("[data-editcat]")) return;   // the pencil is not a drag handle
      // clear any stale suppression: a drag that ended over a different pill fires its
      // click on the container, so the flag would otherwise swallow the NEXT real click
      suppressClick=false;
      dragState={key:id,x:e.clientX,y:e.clientY,moved:false};
    };
    pills.appendChild(b);
  };
  const _sc=searchCounts();
  const PN=k=>_sc ? (k==="" ? (_sc.__all||0) : (_sc[k]||0))
                  : (k==="" ? totalMacroCount() : (counts[k]||0));
  mk("",t("All"),PN(""),false);   // cards, like every other pill - not cards
  // double-click "All" restores the original order
  pills.firstChild.title=t("Show all categories; double-click to reset their order");
  pills.firstChild.ondblclick=()=>animateReorder(()=>{
    catOrder=Object.keys(CATS);
    nsDel("CatOrder");
  });
  displayCatOrder(hc).forEach(k=>{
    if(!CATS[k]) return;
    mk(k,CATS[k],PN(k),true);          // empty categories included, with a 0 badge
  });
  /* "+" sits after the last category, mirroring Manage's. Appended outside catOrder and
     not draggable - a control, not a category. A real <button>, the bar's only focus
     stop: pills are drag-and-toggle surfaces, this one ACTS, and a button is what a click,
     a screen reader and Enter expect of it. Focus is not walked on this screen - Tab and
     Shift+Tab are bound, the owner's call - so a click is its way in. The drag logic keys
     off dataset.k, which this never carries. */
  const add=document.createElement("button");
  add.type="button";
  add.className="pill pill-add";
  add.innerHTML=ICON_PLUS;         // drawn, not typed - see .pill-add for why
  add.title=t("Add a category");
  add.setAttribute("aria-label",t("Add a category"));
  add.onclick=()=>startPillCatAdd(add);
  pills.appendChild(add);
  if(addHadFocus) add.focus();
  // Two rAFs: wait for layout after DOM rebuild, then measure overflow.
  schedulePillsCollapse();
}
/** Inline category creation from the pill strip. Same contract as the Manage chip: type,
 *  Enter to accept, Esc or an empty blur to cancel. */
function startPillCatAdd(addEl){
  if(!pills || pills.querySelector(".pill-new")) return;
  const wrap=document.createElement("div");
  wrap.className="pill pill-new";
  wrap.innerHTML='<input type="text" placeholder="'+esc(t("New category"))+'" spellcheck="false" autocomplete="off">';
  pills.insertBefore(wrap, addEl);
  addEl.hidden=true;
  const inp=wrap.querySelector("input");
  const finish=ok=>{
    const name=inp&&inp.value?inp.value.trim():"";
    wrap.remove();
    addEl.hidden=false;
    if(!ok||!name) return;
    ensureCustomCat(name);
    rebuildCards();
    toast("Category added");
  };
  inp.focus();
  /* Keyboard exits hand focus back to the +; a mouse-blur leaves it where the user
     clicked. Queried, not the captured addEl: accepting rebuilds the bar and the
     closure's node is detached - the query finds the fresh one (and IS the captured one
     on the cancel path, where nothing redraws). */
  const refocus=()=>{ const a=pills.querySelector(".pill-add")||addEl; a.focus(); };
  // stopPropagation, or Enter and Esc also reach the app's global shortcut handling
  inp.onkeydown=e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); finish(true); refocus(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(false); refocus(); }
  };
  inp.onblur=()=>{ setTimeout(()=>{ if(document.activeElement!==inp) finish(!!(inp.value&&inp.value.trim())); },0); };
}

// FLIP: measure where every pill is, apply the change, then animate each one from
// its old box to its new one. Cheap, and it survives pills wrapping to a new line.
/* FLIP split in two halves so the capture can precede a state change that is not a
   simple mutate() callback - intent selection regroups the pills from several call
   sites, and those sites capture, change, redraw, then flip. Opt-in per call site rather
   than folded into drawPills(): most callers (tab restore, rename, wipe) should redraw
   instantly with no motion. */
/** Rects of every pill, keyed by category key. The "first" half of a FLIP. */
/* THE FLIPS ANSWER THE SWITCH AT THEIR CAPTURE: one handed nothing plays nothing, and every
   caller already treats an empty capture as "redraw, do not animate". Same in the two below. */
function capturePills(){
  if(mgReduceMotion()) return null;
  const before={};
  pills.querySelectorAll(".pill").forEach(p=>{ if(p.dataset.k) before[p.dataset.k]=p.getBoundingClientRect(); });
  return before;
}
// ---- at load: the frame pump's own kick, and the pill drag's document listeners ----
wirePumpKick();
wirePillDrag();

// ---- picking an intent: it reaches the rail, the pills and the whole render, so it stays here ----
// multi=true (ctrl held) toggles the clause in the set; otherwise it replaces it
function pickIntent(idx,multi){
  // A plain pick consumes the semi-selection and ends any run; Ctrl means "and more".
  if(!multi){ railMarkUsed=true; semiKind=null; pickRun=false; }
  /* "And more" must be a CLAIM, not a leftover: the typed flow arrives surfaceless, and
     the card mark a render would then plant takes the arrows with it (markSurface reads a
     bare entrySel as card). Claimed the way railHoverClaim claims, so the rail walks on. */
  else{ pickRun=true; semiKind="intent"; railMarkUsed=false;
        if(entrySel){ entrySel=null; markEntrySel(); } }
  const pillsBefore=capturePills();   // pills regroup into bands below - animate the move
  const cardsBefore=captureCards();   // cards re-sort too; guards inside decide if it animates
  const railBefore=captureRail();     // chosen intents rise to the top of the panel
  if(multi){
    const at=intentIdxs.indexOf(idx);
    // Preserve pick order for {INTENT} and comment {ACTION}/{TOPIC} (no re-sort)
    if(at>-1) intentIdxs.splice(at,1); else intentIdxs.push(idx);
  } else {
    intentIdxs=[idx];
  }
  intentText="";
  /* CATEGORY FILTER AND QUERY BOTH DROP - an intent's cards span categories, and both
     filters hide what was just asked for: the pick's meaning is "show me this intent's
     full view". A query that survives the pick shows a filtered sliver of the linked
     cards, which stings more than the lost text. */
  if(intentIdxs.length){
    cats=[];
    if(intentEl && intentEl.value){ intentEl.value=""; railSel=-1; }
  }
  // Scroll to linked cards when the list already shows them (All, or the right cat).
  pendingScrollHit=!!intentIdxs.length;
  syncIntentInput();
  /* THE ANSWER IN THIS FRAME, THE WORK IN THE NEXT, AND THE ANIMATIONS AFTER IT. The rings
     and the box are the click's receipt and cost 2ms, so they land immediately. Everything
     expensive is scheduled - and the three flips go WITH it, after the rebuild rather than
     before, because a transition started on this side of a 100ms rebuild spends its middle
     on a blocked thread and arrives looking like a jump. On the far side the thread is free
     and they play whole. The captures are still valid: nothing between the two frames moves
     a pill, a row or a card. */
  paintIntentRings(); paintRailSelection();
  schedulePickTail(()=>{
    drawPills(); drawIntentRail();
    if(multi && pickRun){
      // The resting mark for the next pick: the first unpicked row of the fresh order.
      let nm=-1;
      for(let i=0;i<railOrder.length;i++){ if(intentIdxs.indexOf(railOrder[i])<0){ nm=railOrder[i]; break; } }
      railMarkIdx = nm>=0 ? nm : (railOrder.length?railOrder[0]:-1);
      railSel=-1;
      railDecorate(true);
    }
    flipPills(pillsBefore);
    // The rows just selected must animate however far they came - see flipRail().
    return flipRail(railBefore,new Set(intentIdxs.map(String)));
  },()=>{ render(); flipCards(cardsBefore);
           // unpicking the last one is a clear - see clearIntents()
           if(!intentIdxs.length) scrollPageTop(); });
  scheduleTabSave();
}

// ---- the panel's repaint after a dock change: it reaches the rail's list and the whole
// render, so it stays here ----
/* Named, so rebuildRailMQ can move it to the new query. An anonymous listener could be added but
   never removed, and every resize would leave another one behind. */
function onRailMQChange(){
  syncRailLayout();
  drawIntentRail();
  render();
}

// ---- at load: the panel's stored width, its watches, its resizer and its two doors ----
applyStoredRailWidth();
wireOverlapPointer();
watchPillBarHeight();
buildRailResizer();
wirePageScroll();
wireRailObservers();
wireRailWheel();
bindRailHit();

// ---- at load: the pointer's own motion claims a row, and every gesture on the rail ----
wireRailHover();
wireRailPointer();

/* CSS does the normal case; this slides the list back only when it would spill.
   documentElement.clientWidth, NOT innerWidth: an overflowing list puts the page into
   horizontal scroll, and innerWidth then reports the widened document - the correction
   chases the problem it is fixing and never settles. The nudge is a delta on the SAME
   calc the stylesheet uses, so the centring stays in one place. */

/* The role is a DRUM - a slot wheel over whoOptions() with an empty notch that clears.
   The mouse wheel and the arrow keys turn it; the hidden roleSel stays the one value
   {ROLE} reads, so everything downstream is untouched by the control's shape. */
/* The notches, and the ONE list both the wheel and its display read. A stored role the
   catalog no longer offers joins the wheel rather than vanishing from it: it still fills
   {ROLE}, so a drum showing the empty notch would be lying, and stepping away drops it. */
function roleOpts(){
  const opts=[""].concat(whoOptions());
  const v=roleSel.value;
  if(v && opts.indexOf(v)<0) opts.push(v);
  return opts;
}
function syncRoleDrum(){
  const d=$("#roleDrum"); if(!d) return;
  const opts=roleOpts();
  let i=opts.indexOf(roleSel.value); if(i<0) i=0;
  const lab=v=>v===""?t("class"):v;
  const n=opts.length;
  d.querySelector(".rd-prev").textContent=lab(opts[(i-1+n)%n]);
  const c=d.querySelector(".rd-cur");
  c.textContent=lab(opts[i]);
  c.classList.toggle("rd-empty", opts[i]==="");
  d.querySelector(".rd-next").textContent=lab(opts[(i+1)%n]);
  d.setAttribute("aria-valuetext", lab(opts[i]));
}
function stepRoleDrum(dir){
  const d=$("#roleDrum"); if(!d) return;
  const opts=roleOpts();
  let i=opts.indexOf(roleSel.value); if(i<0) i=0;
  roleSel.value=opts[(i+dir+opts.length)%opts.length];
  syncRoleDrum();
  const tr=d.querySelector(".rd-track");
  tr.classList.remove("rd-up","rd-down"); void tr.offsetWidth;
  tr.classList.add(dir>0?"rd-up":"rd-down");
  render();
  scheduleTabSave();
}
function wireRoleDrum(){
  const d=$("#roleDrum"); if(!d) return;
  d.addEventListener("wheel",e=>{ e.preventDefault(); stepRoleDrum(e.deltaY>0?1:-1); },{passive:false});
  /* A CLICK IS THE ONLY ROUTE A FINGER HAS - no wheel, no arrow keys - so it advances a
     notch, and the wheel cycles, which means every value stays reachable from a tap. */
  d.addEventListener("click",()=>{ stepRoleDrum(1); });
  d.addEventListener("keydown",e=>{
    if(e.key!=="ArrowDown"&&e.key!=="ArrowUp") return;
    if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey) return;   // those belong to the card list
    e.preventDefault();
    /* STOP HERE. The window dispatcher skips real fields via typingInField(), and a div is
       not one - unstopped, one arrow turned the drum AND walked the cards behind it. */
    e.stopPropagation();
    stepRoleDrum(e.key==="ArrowDown"?1:-1);
  });
  syncRoleDrum();
}
wireRoleDrum();
// Keep the header box showing whatever {INTENT} currently resolves to.
function intentIsSet(){
  // Clear buttons stay inactive on bare mode switch (/) until there is real content
  return intentIdxs.length>0
    || !!(intentText&&String(intentText).trim())
    /* .length on the visible box, while intentText stays trimmed: intentText is a
       resolved value, but the BOX is what the user is looking at, and spaces in it are
       characters they typed and can see. Trimming here disabled the × and made Escape a
       no-op on a field that was plainly not empty. */
    || !!(intentEl&&String(intentEl.value||"").length);
}
function syncIntentClearBtns(){
  // The rail's arrow never disables - killing it the frame a clear lands kills the spin.
  const railBtn=$("#intentRailClear");
  if(railBtn){ railBtn.hidden=false; railBtn.disabled=false; }
  const fab=$("#clearIntentsFab");
  if(fab){
    const n=intentIdxs.length;
    fab.classList.toggle("on",n>0);
    fab.classList.toggle("many",n>1);
    fab.setAttribute("aria-hidden",n?"false":"true");
    fab.tabIndex=n?0:-1;
    fab.querySelector(".fab-n").textContent=n>1?String(n):"";
    fab.title=n>1 ? t("Clear the chosen intents ({N})").replace("{N}",n) : t("Clear the intent");
    fab.setAttribute("aria-label",fab.title);
    fab.onclick=()=>clearIntents();
  }
  const boxBtn=$("#intentClear");
  if(boxBtn){
    boxBtn.hidden=false;
    // Greys on exactly one question: is there text to rub out?
    boxBtn.disabled=!String(intentEl.value||"").length;
    boxBtn.title=t("Clear search text");
    boxBtn.innerHTML=ICON_CLEAR_TEXT;
  }
}
function clearIntents(){
  if(!intentIsSet()) return false;
  const pillsBefore=capturePills();   // bands collapse back to catOrder - animate the move
  const cardsBefore=captureCards();
  /* The list goes to its top before the capture, as a settled query does: the order it returns
     to begins there, and the glide is judged against the window the user will see. */
  const railBox=$("#intentRailList"); if(railBox) railBox.scrollTop=0;
  const railBefore=captureRail();     // panel returns to its dragged order
  intentIdxs=[]; intentText="";
  railSel=-1; railMarkUsed=false; pickRun=false;   // the selection goes and the offer re-opens; the QUERY stays
  syncIntentInput();
  drawPills();
  flipPills(pillsBefore);
  drawIntentRail();
  flipRail(railBefore);
  render();
  flipCards(cardsBefore);
  /* THE SAME ARRIVAL AS THE PICK, in reverse: the list re-sorts back to its resting order
     under a viewport parked wherever the intent's answer was, and that order begins at the
     top. The other two ways out of a selection do this too. */
  scrollPageTop();
  scheduleTabSave();
  toast("{INTENT} cleared");
  return true;
}
// Esc from INTENT box: leave search mode, wipe query, cancel all intents
/* Escape sheds ONE thing per press. It used to be nuclear - mode, query AND intents
   in one press, so recovering from a mis-typed mode cost the intents. Two steps now:
     1. in macro search -> leave it, intents survive
     2. otherwise      -> clear the intents (clearIntents owns that, and its toast)
   Returns false when there was nothing left to shed, so callers can fall through. */
function intentEscapeStep(){
  /* Escape also LEAVES the box: whatever else this press sheds, focus returns to the
     page so ←/→ resume walking the categories at once - the box holding on made the
     arrows dead exactly when you had just said "never mind" and reached for them. */
  if(typeof intentEl!=="undefined" && intentEl && document.activeElement===intentEl) intentEl.blur();
  if(String((intentEl&&intentEl.value)||"").trim()){
    clearSearchQuery();
    toast("Search cleared");
    return true;
  }
  /* intentIsSet answers false while searching, so ask the selection directly */
  if(intentIdxs.length || intentText){
    return clearIntents();
  }
  return false;
}
/* THE LADDER ITSELF. Two doors reach it - the shortcut and the intent box's own key
   handler - and they must climb the same rungs or a press means different things
   depending on where the caret happens to be. */
function escapeLadderStep(){
  if(intentEscapeStep()) return true;
  return escCloseAllTabsStep();
}
function syncIntentInput(){
  // The box holds the query; the selection lives in the rail, never written over the text.
  intentEl.classList.toggle("set", intentIdxs.length>0 || !!String(intentEl.value||"").trim());
  syncIntentClearBtns();
}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
/* esc() first, THEN swap the fences for tags - never the other way round. split/join rather than
   a regex so the control characters need no escaping to read. Only fill(...,true) produces
   fences, and it always writes them in pairs, so the result cannot be unbalanced. */
function escFilled(s){
  return esc(s).split(FILL_A).join('<span class="fillx">').split(FILL_B).join("</span>")
                .split(FILL_M_A).join('<span class="fillmiss">').split(FILL_M_B).join("</span>");
}
/* The floating door's two states: it names the category it would file into when exactly one is
   filtered, and asks for one when not. Hidden only when there is no category to file into at
   all, which is an empty Etiuda. */
function syncAddFab(){
  const b=document.getElementById("addCardFab");
  if(!b) return;
  const one=(cats.length===1 && CATS[cats[0]]) ? cats[0] : null;
  b.hidden=!Object.keys(CATS).length;
  // The one place a new card is asked for outright: the chosen category holds none.
  b.classList.toggle("nudge", !!one && !cardCounts[one]);
  b.title=one ? t("Create a card in {CAT}").replace("{CAT}",CATS[one]) : t("Create a card");
  b.setAttribute("aria-label", b.title);
  b.onclick=()=>openCardEditor(null, one);
}


/* The FIRST render precedes layout, so the list measures zero wide, Auto resolves to
   one column, and nothing happens until the next redraw - wait a frame and ask again.
   Bounded: a genuinely zero-wide list (a hidden tab) would otherwise re-ask forever. */
let colTries=0;
/* Card nodes, kept by id between renders. Cleared wholesale when it outgrows the list so a
   catalog swap cannot leave the old one's cards alive in here. */
let cardPool=new Map();
const cardTpl=document.createElement("template");
function parseCardHtml(html){
  cardTpl.innerHTML=html;
  return cardTpl.content.firstElementChild;
}
/* Everything a PICK changes, and nothing else - the rest lives in the signature and forces a
   rebuild instead. Kept beside the builder that writes the same markup, or the two drift. */
function patchCard(el,it){
  el.className="card"+(it.hidden?" is-hidden":"")+(it.hit?" intent-hit":"")
    +(it.catHit?" cat-hit":"")+(it.dragging?" dragging":"");
  el.setAttribute("title",it.dragTip);
  el.setAttribute("data-i",it.i);
  el.setAttribute("data-rank",it.band);
  const head=el.querySelector(".chead");
  if(!head) return;
  const anchor=head.querySelector(".ccat");
  if(!anchor) return;
  let hitB=head.querySelector(".cbadge.hit"), catB=head.querySelector(".cbadge.cat");
  if(it.hit && !hitB){ hitB=parseCardHtml(it.hitBadge); anchor.insertAdjacentElement("afterend",hitB); }
  else if(!it.hit && hitB){ hitB.remove(); hitB=null; }
  if(it.catHit && !catB){ catB=parseCardHtml(it.catBadge); (hitB||anchor).insertAdjacentElement("afterend",catB); }
  else if(!it.catHit && catB){ catB.remove(); }
}
/* A language flip changes every card's bytes but nothing structural, so the tail never
   calls render(): the screenful rebuilds in place, the rest follows in chunks, and the
   category separators swap their text. Each rebuilt card gets the exact signature a full
   render would write, so the pool stays honest and any interleaved render heals the rest. */
/* A FRESH CARD NODE PAINTS ONCE AT ITS ESTIMATE. content-visibility lays a new node out at
   the 220px stub and resolves it a frame later; kept nodes carry a remembered size, fresh ones
   do not - so a rebuild that touches what is on screen (a typed pick clears the query, and
   with it every signature) shows one frame of uniform stubs, then the cards. Forced real here,
   in the same task as the insertion, and handed back two frames on. The glides force their
   watched cards the same way and release later; the double release is idempotent. */
let eFreshHeld=[], eFreshR=0;
function holdFresh(el){
  if(el.style.contentVisibility) return;
  el.style.contentVisibility="visible";
  eFreshHeld.push(el);
  if(eFreshR) return;
  eFreshR=requestAnimationFrame(()=>requestAnimationFrame(()=>{
    eFreshR=0;
    const held=eFreshHeld; eFreshHeld=[];
    held.forEach(x=>{ if(x.style.contentVisibility==="visible") x.style.contentVisibility=""; });
  }));
}
// Estimate rects are enough to shortlist: a card within a viewport of the screen is forced.
function settleFreshCards(){
  if(!list) return;
  const vh=window.innerHeight, margin=vh;
  list.querySelectorAll(".card[data-id]").forEach(el=>{
    if(el.style.contentVisibility) return;
    const r=el.getBoundingClientRect();
    if(r.bottom<-margin || r.top>vh+margin) return;
    holdFresh(el);
  });
}
let eLangChunkR=0;
function cancelLangChunks(){
  if(eLangChunkR){ cancelAnimationFrame(eLangChunkR); eLangChunkR=0; }
}
function rebuildCardInPlace(id){
  const m=findCard(id), el=cardPool.get(id);
  if(!m || !el || !el.isConnected) return;
  const renderKey=String(uiLang())+"|"+lang+"|"+cardSearchTerms().join(" ");
  const b=cardBodyHtml(m, +el.getAttribute("data-i")||0,
    {hit:cardHitsSelectedIntent(m), catHit:cardHitsAlwaysCat(m), fav:isFavourite(m.id),
     band:displayBandKey(m), other:lang==="en"?"pl":"en",
     dragTip:t(intentIdxs.length
       ? "Drag header to reorder within the same highlight group"
       : "Drag header to reorder within the same highlight group; same category only")});
  const fresh=parseCardHtml(b.cardH);
  if(!fresh) return;
  fresh.__sig=ePackEpoch+"|"+renderKey+"|"+cardFillKey(m)
    +"|"+(entrySel&&entrySel.id===m.id?entrySel.vi:-1);
  const ord=el.getAttribute("data-ord");
  if(ord!=null) fresh.setAttribute("data-ord",ord);
  const was=el.getBoundingClientRect(), vh=window.innerHeight;
  el.replaceWith(fresh);
  if(was.bottom>-vh && was.top<2*vh) holdFresh(fresh);   // see the note at holdFresh()
  cardPool.set(id,fresh);
}
function runLangChunks(ids){
  const step=()=>{
    eLangChunkR=0;
    ids.splice(0,28).forEach(rebuildCardInPlace);
    if(ids.length) eLangChunkR=requestAnimationFrame(step);
  };
  cancelLangChunks();
  if(ids.length) eLangChunkR=requestAnimationFrame(step);
}
/* Separators are rebuilt every render - there are a handful and they depend on their
   neighbours. Cards are kept unless their signature moved. */
function paintList(spellNote,items){
  if(cardPool.size>2000) cardPool=new Map();
  const frag=document.createDocumentFragment();
  const add=html=>{ if(!html) return; cardTpl.innerHTML=html;
    while(cardTpl.content.firstChild) frag.appendChild(cardTpl.content.firstChild); };
  add(spellNote);
  for(let k=0;k<items.length;k++){
    const it=items[k];
    add(it.sepH);
    if(!it.id) continue;
    let el=cardPool.get(it.id);
    if(!el || el.__sig!==it.sig){
      el=parseCardHtml(it.cardH);
      if(!el) continue;
      el.__sig=it.sig;
      cardPool.set(it.id,el);
    }else{
      patchCard(el,it);
    }
    frag.appendChild(el);
  }
  /* Verification hook: with it on, every kept card is rebuilt and compared. Off in normal
     use - it exists so the probe can prove the pool rather than sample it. */
  if(window.__verifyPool) verifyPool(items);
  list.replaceChildren(frag);
}
/* setAttribute APPENDS on a kept node where the builder interleaves, so serialisation order
   differs while the attribute set does not. CSS and dataset are order-blind; compare sorted. */
function normAttrOrder(el){
  return el.outerHTML.replace(/<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)(\s*\/?)>/g,
    (m,name,attrs,close)=>{
      /* data-ord is stamped by the column dealer AFTER paint, so a kept node carries it and a
         fresh parse does not. It is not part of what the builder wrote. */
      const got=((attrs||"").match(/[\w:-]+(?:="[^"]*")?/g)||[]).filter(a=>a.indexOf("data-ord")!==0);
      return "<"+name+(got.length?" "+got.sort().join(" "):"")+close+">";
    });
}
function verifyPool(items){
  const bad=[];
  items.forEach(it=>{
    if(!it.id) return;
    const el=cardPool.get(it.id);
    if(!el) return;
    const fresh=parseCardHtml(it.cardH);
    if(fresh && normAttrOrder(fresh)!==normAttrOrder(el))
      bad.push({id:it.id,want:fresh.outerHTML,got:el.outerHTML});
  });
  window.__poolMismatch=bad;
}
function applyCardColumns(){
  if(!list) return;
  list.classList.remove("cols");
  list.style.removeProperty("--col-n");
  list.style.removeProperty("grid-template-rows");
  if(colMode()==="auto" && !colBoxWidth() && colTries<6){
    colTries++;
    requestAnimationFrame(applyCardColumns);
    return;
  }
  colTries=0;
  let n=colCount();
  colSetLastN(n);                    // what the WIDTH allows, which is what a resize compares
  if(n<2) return;

  /* THE FLAT ORDER, stamped before a single node moves: dealing puts the DOM into
     column order, so querySelectorAll no longer returns cards in the order the list
     means. Everything that walks the list in sequence reads this instead. */
  let ord=0;
  list.querySelectorAll(".card[data-id]").forEach(c=>{ c.dataset.ord=ord++; });

  const kids=[].slice.call(list.children);
  if(!kids.length) return;

  /* THE RESTRUCTURING HAPPENS OFF THE PAGE: attached, every node move invalidates style
     on a live list (160 of a 200ms render); detached, it is bookkeeping and one reflow on
     return. The list is put back before anything MEASURES it - a detached element has no
     geometry. */
  const _parent=list.parentNode, _next=list.nextSibling;
  if(_parent) _parent.removeChild(list);

  /* .e-span marks a SEMI-GROUP - a lifted set, not a shelf. Only the intent band wears it
     and spans the columns: it is an answer, not a home, and dealing an answer into one column
     buries it. The favourites block is a shelf like any category and is dealt with them. */
  const kinds=kids.map(el=>el.matches(".e-span") ? "bandsep"
                        : el.matches(COL_SEP) ? "sep"
                        : el.classList.contains("card") ? "card" : "other");
  const plan=colPlan(kinds,n);
  /* Put the list back before leaving: every exit between the detach and the reattach has to,
     or the card list simply stops existing. */
  if(plan.mode==="none" && !plan.band){ if(_parent) _parent.insertBefore(list,_next); return; }
  /* THE WIDTH SAYS HOW MANY FIT; THE PLAN SAYS HOW MANY THERE ARE. Asking only the width gave
     three columns to two things and left one empty, with both cards a third of the list wide
     for no reason - and a group is dealt whole, so two groups can never fill three columns
     however wide the window is. The band shares the columns, so it speaks for itself. ACROSS A
     DIVIDER each side is dealt from the first column on its own, so the wider side is what
     there is: counting both sides gave four columns to two and two, and filled two. */
  const _units = plan.mode==="groups" ? plan.runs.length
               : plan.divider>=0 ? Math.max(plan.before.length, plan.after.length)
               : (plan.cards||[]).length;
  const _band = plan.band ? plan.band.items.filter(i=>kinds[i]==="card").length : 0;
  n=Math.max(1,Math.min(n,Math.max(_units,_band)));
  if(n<2){ if(_parent) _parent.insertBefore(list,_next); return; }

  /* The band first and full width, with its own columns inside. Its heading spans those. */
  const boxes=[];
  const anchor=plan.trail.length?kids[plan.trail[0]]:null;
  for(let i=0;i<n;i++){
    const c=document.createElement("div");
    c.className="col";
    if(anchor) list.insertBefore(c,anchor); else list.appendChild(c);
    boxes.push(c);
  }

  /* THE BAND SHARES THE COLUMNS rather than sitting in a box of its own: a box is as
     tall as its TALLEST inner column, so the shorter band columns left dead space and
     every category below began at that line. Sharing means each column's categories start
     where its band cards ended; the heading still spans - it describes all of them. */
  let bandSepEl=null, bandShown=0;
  if(plan.band){
    const bandCards=[];
    for(let m=0;m<plan.band.items.length;m++){
      const el=kids[plan.band.items[m]];
      if(el.classList.contains("card")) bandCards.push(el);
      else { bandSepEl=el; list.insertBefore(el, boxes[0]); }
    }
    for(let m=0;m<bandCards.length;m++) boxes[m%n].appendChild(bandCards[m]);
    bandShown=bandCards.length;
    /* The heading's PLACEMENT waits until the end of this function: it measures the
       heading, and the top margin is only zeroed by a rule that needs it to be the list's
       first child - which it is not yet, with everything undealt still in front of it. */
  }

  if(plan.mode==="groups"){
    for(let i=0;i<plan.runs.length;i++){
      const g=document.createElement("div");
      g.className="cgroup";
      for(let m=0;m<plan.runs[i].items.length;m++) g.appendChild(kids[plan.runs[i].items[m]]);
      boxes[i%n].appendChild(g);
    }
  }else{
    /* Whatever is not a card - a lone category's separator, a spelling note - sits above the
       columns and spans them. */
    for(let i=0;i<plan.lead.length;i++) list.insertBefore(kids[plan.lead[i]],boxes[0]);
    if(plan.divider>=0){
      for(let i=0;i<plan.before.length;i++) boxes[i%n].appendChild(kids[plan.before[i]]);
      const div=kids[plan.divider];   // spans by the grid's own rule for anything that is not a column
      if(anchor) list.insertBefore(div,anchor); else list.appendChild(div);
      const below=[];
      for(let i=0;i<n;i++){
        const c=document.createElement("div");
        c.className="col";
        if(anchor) list.insertBefore(c,anchor); else list.appendChild(c);
        below.push(c);
      }
      for(let i=0;i<plan.after.length;i++) below[i%n].appendChild(kids[plan.after[i]]);
    }else{
      for(let i=0;i<plan.cards.length;i++) boxes[i%n].appendChild(kids[plan.cards[i]]);
    }
  }

  list.style.setProperty("--col-n",n);
  list.classList.add("cols");
  if(_parent) _parent.insertBefore(list,_next);   // back on the page, one reflow, before measuring

  /* THE HEADING'S PLACEMENT, last of all - once everything is dealt it is genuinely the
     first child and the grid is on, so what is measured is what paints. A heading spans
     ONLY the columns its cards fill; the columns past it span both rows and start level
     with it. k comes from the GROUP'S size, not the rendered count - a collapsed band
     renders none and must not claim the width. ROW ONE IS PINNED IN PIXELS: a spanning
     item contributes its intrinsic size to every track it covers, and min-content let a
     column of cards grow row one thousands of px tall. Safe to measure:
     align-items:start never stretches an item by its track. */
  if(bandSepEl){
    const badgeEl=bandSepEl.querySelector(".sep-n");
    const badge=badgeEl ? parseInt(badgeEl.textContent,10) : NaN;
    const total=isFinite(badge) ? badge : bandShown;
    const k=Math.min(Math.max(bandShown,total),n);
    if(k>0 && k<n){
      bandSepEl.style.gridColumn="1 / span "+k;
      bandSepEl.style.gridRow="1";
      for(let i=0;i<n;i++){
        boxes[i].style.gridColumn=String(i+1);
        boxes[i].style.gridRow = (i<k) ? "2" : "1 / span 2";
      }
      const sc=getComputedStyle(bandSepEl);
      const h=bandSepEl.getBoundingClientRect().height
             +(parseFloat(sc.marginTop)||0)+(parseFloat(sc.marginBottom)||0);
      list.style.gridTemplateRows=Math.ceil(h)+"px auto";
    }
  }
}

/* Auto reads the available width, so a resized window can want a different count. Re-render
   rather than re-shuffle: render() is the only thing that knows the flat order. */
let colResizeT=null;
addEventListener("resize",()=>{
  clearTimeout(colResizeT);
  colResizeT=setTimeout(()=>{ if(colCount()!==colLastN) render(); },160);
});
/* Where colAvailW comes from. Reading inside the callback is free - the observer fires
   after layout - and it also catches the widths a resize never reports: the panel docking,
   its drag, the shell's own animation. Re-deals only when the COUNT changes, so a render
   here cannot feed itself: dealing changes the list's height, never the box's width. */
if(typeof ResizeObserver==="function" && list && list.parentNode){
  new ResizeObserver(()=>{
    const w=list.parentNode.clientWidth||0;
    if(w===colAvailW) return;
    colSetAvailW(w);
    if(colCount()!==colLastN) requestAnimationFrame(()=>render());
  }).observe(list.parentNode);
}

/* The card body, extracted so a language flip can rebuild one card at a time - the
   render map and the flip's idle chunks must write the same bytes (verifyPool checks).
   ctx carries the map's per-card locals; everything else the body reads is global. */
function cardBodyHtml(m,i,ctx){
  const hit=ctx.hit, catHit=ctx.catHit, fav=ctx.fav, band=ctx.band,
        other=ctx.other, dragTip=ctx.dragTip;
  let cardH="";
    cardH+='<div class="card'+(m._hidden?" is-hidden":"")+(hit?" intent-hit":"")+(catHit?" cat-hit":"")
      +(cardDrag&&cardDrag.moved&&cardDrag.key===m.id?" dragging":"")
      +'" data-i="'+i+'" data-id="'+esc(m.id||'')+'" data-rank="'+esc(band)+'"'
      +(catSlot(m.c)>=0?' data-ec="'+catSlot(m.c)+'"':'')
      +' title="'+esc(dragTip)+'">';
    cardH+='<div class="chead">';
    /* data-i18n-skip: a card title and a category name are the employer's content. Nothing
       sweeps the card list today, but the marker travels with the markup if anything ever does. */
    cardH+='<span class="ctitle" data-i18n-skip>'+esc(cardTitle(m))+'</span><span class="ccat" data-i18n-skip>'+catIconSvg(m.c)+esc(CATS[m.c]||m.c||"")+'</span>';
    /* Captured rather than appended inline: a kept card has its badges added and removed by
       patchCard(), and they must be the same bytes a rebuild would have written. */
    const hitBadge='<span class="cbadge hit" title="'+esc(t("Linked to the selected intent"))+'">'+esc(t("int"))+'</span>';
    const catBadge='<span class="cbadge cat" title="'+esc(t("In a supporting category, relevant regardless of the intent"))+'">'+esc(t("sup"))+'</span>';
    if(hit) cardH+=hitBadge;
    if(catHit) cardH+=catBadge;
    if(fav) cardH+='<span class="cbadge fav" title="'+esc(t("In Favourites"))+'">'+esc(t("fav"))+'</span>';
    /* Moved counts as edited now that order is content: the card differs from the one
       the catalog shipped, even though its words do not. So does a card of your own. */
    if(m._custom || m._overridden || movedCardIds().has(m.id))
      cardH+='<span class="cbadge ed" title="'+esc(t("Changed or added by you, not what the catalog shipped"))+'">'+esc(t("mod"))+'</span>';
    const favTip=t(fav?"Remove from Favourites":"Add to Favourites");
    /* Hide is a toggle now that hidden entries stay on the list - the card itself is where you
       undo it. Delete lives only in Manage, so an irreversible action is never one stray click
       away while you are working a chat. */
    const hideTip=t(m._hidden
      ? "Show this card again"
      : (fav ? "Put this card away: it greys out at the foot of this category and loses its star"
             : "Put this card away: it greys out at the foot of this category"));
    const _note=noteFor(m);
    cardH+='<span class="cacts">'
      +(_note ? '<button type="button" data-act="note" title="'+esc(t("Internal note"))+'" aria-label="'+esc(t("Internal note"))+'" aria-expanded="false">'+_svg("ic",_NOTE)+'</button>' : '')
      +'<button type="button" data-act="edit" title="'+esc(t("Edit this card"))+'" aria-label="'+esc(t("Edit this card"))+'">'+ICON_EDIT+'</button>'
      +'<button type="button" class="'+(m._hidden?"":"danger")+'" data-act="hide" title="'+esc(hideTip)+'" aria-label="'+esc(hideTip)+'">'+(m._hidden?ICON_EYE_SHUT:ICON_EYE_OPEN)+'</button>'
      +'<button type="button" class="star-btn'+(fav?" on":"")+'" data-act="fav" title="'+esc(favTip)+'" aria-label="'+esc(favTip)+'" aria-pressed="'+(fav?"true":"false")+'">'+(fav?ICON_STAR_ON:ICON_STAR_OFF)+'</button>'
      +'</span></div>';
    /* A pinned card shows the version it speaks, not the one the toggle names. */
    const _L=cardLang(m);
    const ps=parts(m,_L), cls=_L==="pl"?" plx":"";
    if(ps.length){
      // _L, never lang: on a pinned card the badge must name the language actually shown.
      const many=ps.length>1, word=m.seq?t("STEP"):_L.toUpperCase();
      cardH+=ps.map((p,vi)=>{
        const on=entrySel&&entrySel.id===m.id&&entrySel.vi===vi?" sel":"";
        // role=button tells assistive tech these blocks act, not just read. No tabindex on
        // purpose: 200+ stops would swamp the tab order, and ↑↓/Enter already drive them.
        return '<div class="txt'+cls+on+'" role="button" data-v="'+vi+'"'+(many?' title="'+esc(t("Click to copy, or drag to reorder these"))+'"':' title="'+esc(t("Click to copy"))+'"')+'>'+
        '<span class="tag">'+word+(many?" "+(vi+1)+"/"+ps.length:"")+'</span>'+
        escFilled(fill(p,m,true))+'</div>';
      }).join("");
    } else {
      // a one-language card, which the maintenance panel counts: the other language's text is all it has
      cardH+='<div class="miss">'+esc(t("No {LANG} version for this card").replace("{LANG}",_L.toUpperCase()))
         +' - '+esc(t("switch to {LANG} to use it").replace("{LANG}",other.toUpperCase()))+'.</div>';
    }
    // In-card chips only when the side rail is off - otherwise the left panel is the list.
    const sws=(lang==="pl"?(m.swpl||m.sw):(m.sw||m.swpl));
    if(sws && !railActive()){
      // How-to on the tooltip: this strip sits inside a card the agent is reading at speed
      cardH+='<div class="swap" title="Click to pick, again to clear, and hold Ctrl for several"><b>Set {INTENT}</b> '+
        intentOrder.filter(si=>!isIntentHiddenIdx(si)).map(si=>{
          const s=sws[si]; if(s==null) return "";
          return '<code'+(intentIdxs.indexOf(si)>-1?' class="on"':'')+' data-si="'+si+'">'+
            esc(s)+'</code>';
        }).join("")+'</div>';
    }
    cardH+='</div>';
  return {cardH:cardH, hitBadge:hitBadge, catBadge:catBadge};
}
/* THE NOTE IS A CALLOUT, NOT A BOX ON THE CARD: the tour's card, placed by the tour's rules
   with the whole card as the spotlight and never over it, and the tour's arrow landing on the
   card's edge. It closes on anything that moves the ground under it - a click elsewhere, Esc,
   a scroll, a resize, a render - so it can never be stale. */
let notePaneEl=null, noteArrowEl=null, notePaneBtn=null;
function notePaneOpen(){ return !!notePaneEl; }
function closeNotePane(){
  if(notePaneEl){ notePaneEl.remove(); notePaneEl=null; }
  if(noteArrowEl){ noteArrowEl.remove(); noteArrowEl=null; }
  if(notePaneBtn){ notePaneBtn.setAttribute("aria-expanded","false"); notePaneBtn=null; }
}
function toggleNotePane(btn, id){
  if(notePaneBtn===btn){ closeNotePane(); return; }
  openNotePane(btn.closest(".card"), id, btn);
}
function openNotePane(card, id, btn){
  closeNotePane();
  const m=findCard(id), note=m&&noteFor(m);
  if(!card||!note) return;
  const pane=document.createElement("div");
  pane.className="tour-card note-pane"; pane.id="notePane"; pane.setAttribute("role","note");
  // A token named in a note wears the chip the macro gives it, not its braces.
  pane.innerHTML='<h3>'+esc(cardTitle(m))+'</h3><p>'+esc(note).replace(/\{([A-Z_]+)\}/g,'<span class="fillmiss">$1</span>')+'</p>';
  document.body.appendChild(pane);
  const vw=innerWidth, vh=innerHeight, pad=4, gap=44, cr=card.getBoundingClientRect();
  const hole={top:cr.top-pad,left:cr.left-pad,width:cr.width+pad*2,height:cr.height+pad*2};
  const w=Math.min(320,vw-28); pane.style.width=w+"px";
  const h=pane.offsetHeight;
  const clampX=x=>Math.max(14,Math.min(vw-w-14,x)), sideTop=Math.max(12,Math.min(vh-h-12,hole.top));
  const rightX=hole.left+hole.width+gap, leftX=hole.left-w-gap;
  let place, top, left;
  if(rightX+w<vw-10){ place="side"; left=rightX; top=sideTop; }
  else if(hole.top+hole.height+gap+h<vh-10){ place="below"; top=hole.top+hole.height+gap; left=clampX(hole.left+hole.width/2-w/2); }
  else if(hole.top-h-gap>10){ place="above"; top=hole.top-h-gap; left=clampX(hole.left+hole.width/2-w/2); }
  else if(leftX>=14){ place="side"; left=leftX; top=sideTop; }
  else { place="center"; top=Math.max(12,Math.min(vh-h-12,hole.top+40)); left=clampX(hole.left+hole.width/2-w/2); }
  pane.style.top=top+"px"; pane.style.left=left+"px";
  const route=place!=="center" ? tourArrowRoute({top,left,width:w,height:h},hole,place,0) : null;
  if(route){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("class","tour-arrow note-arrow");
    svg.innerHTML='<path class="tour-shaft" pathLength="1"/><path class="tour-head"/>';
    document.body.appendChild(svg);
    drawTourArrow(svg,route,true);
    noteArrowEl=svg;
  }
  notePaneEl=pane; notePaneBtn=btn||null; if(btn) btn.setAttribute("aria-expanded","true");
  requestAnimationFrame(()=>{ if(notePaneEl===pane){ pane.classList.add("in"); if(noteArrowEl) noteArrowEl.classList.add("show"); } });
}
/* Hover opens the note where the switch is on and a hover exists; a rest of a third of a second,
   so a sweep across the list opens nothing. Leaving the card closes it unless the pointer went
   into the pane, and leaving the pane closes it unless it went back to the card. */
let noteHoverT=0, noteHoverCard=null;
function noteHoverOn(){ return document.body.classList.contains("note-hover") && matchMedia("(hover:hover)").matches; }
function noteHoverLeave(to){
  clearTimeout(noteHoverT); noteHoverT=0;
  if(to && ((to.closest && to.closest(".note-pane")) || (noteHoverCard && noteHoverCard.contains(to)))) return;
  noteHoverCard=null;
  if(notePaneEl && !notePaneBtn) closeNotePane();
}
document.addEventListener("mouseover",e=>{
  if(!noteHoverOn()) return;
  const pane=e.target.closest(".note-pane");
  if(pane) return;
  const card=e.target.closest("#list .card[data-id]");
  if(!card){ noteHoverLeave(e.target); return; }
  if(card===noteHoverCard) return;
  noteHoverLeave(null);
  noteHoverCard=card;
  if(!card.querySelector('[data-act="note"]')) return;
  noteHoverT=setTimeout(()=>{ noteHoverT=0; if(noteHoverCard===card && noteHoverOn()) openNotePane(card, card.dataset.id, null); },300);
});
document.addEventListener("mouseout",e=>{
  if(!noteHoverCard && !notePaneEl) return;
  const to=e.relatedTarget;
  const from=e.target.closest(".note-pane") || e.target.closest("#list .card[data-id]");
  if(from && !(to && from.contains(to))) noteHoverLeave(to);
});
document.addEventListener("click",e=>{
  if(notePaneEl && !notePaneEl.contains(e.target) && !(notePaneBtn&&notePaneBtn.contains(e.target))) closeNotePane();
},true);
addEventListener("scroll",()=>{ if(notePaneEl) closeNotePane(); },true);
addEventListener("resize",()=>{ if(notePaneEl) closeNotePane(); });
function render(){
  closeNotePane();
  cancelLangChunks();
  const terms=cardSearchTerms();
  syncPillCounts();
  ensureCardOrder();
  // Filter first, order second, so scoring only ever touches entries that already matched.
  const hits=cards.filter(m=>{
    if(!cardInActiveCats(m,terms)) return false;
    // Macro search: title + keywords + notes + full EN/PL text (not titles only)
    return cardMatchesSearch(m, terms);
  });
  // Also read below, to place the tier separator between the two groups.
  const sc=new Map();
  if(terms.length){
    /* Sort key: intent band -> tier -> score -> cmpCardDisplay.
       BAND: linkage is a band, not a tiebreaker - as a tiebreaker the linked entries
       interleaved with textually higher-scoring cards and the green rings scattered, so
       the sort and the colours disagreed. An intent states what the customer wants; the
       query narrows within it. Same predicate as the green ring, so customs are covered
       by construction; with no intent every card lands in band 1 and this is inert.
       TIER/SCORE: category order cannot be the outer key - it is what buried the real
       answers. cmpCardDisplay breaks the last tie; catOrder/cardOrder are read, never
       mutated - the pill regroup's own contract. */
    const aterms=intentAffinityGroups();  // once per render, not once per card
    hits.forEach(m=>{
      const s=cardSearchScore(m, terms, aterms);
      s.band=(intentIdxs.length && cardHitsSelectedIntent(m)) ? 0 : 1;
      sc.set(m, s);
    });
    shown=hits.sort((a,b)=>{
      const A=sc.get(a), B=sc.get(b);
      if(A.band!==B.band) return A.band-B.band;
      if(A.tier!==B.tier) return A.tier-B.tier;
      if(A.score!==B.score) return B.score-A.score;
      return cmpCardDisplay(a,b);
    });
  }else{
    // Intent bands / category+fav groups, then manual order within each band.
    shown=hits.sort(cmpCardDisplay);
  }

  if(!shown.length){
    /* An empty category needs no prose: the add-card is the whole answer and already
       names the category, so it becomes the first (only) card. The message stays where no
       add-card can stand in - a search with no hits, or All on an empty Etiuda. */
    const oneCat=(cats.length===1) ? cats[0] : null;
    /* A completely empty Etiuda gets a way in, not just a statement of fact - the sample is
       the fastest route to understanding what any of this is for. */
    const wholeThingEmpty=!cards.length && !cats.length;
    /* A clause following a button brings its own leading space unless it opens with punctuation:
       Polish closes these with a comma, and a space written into the markup floats it off the chip. */
    const afterBtn=c=>(/^[,.;:!?]/.test(c)?"":" ")+esc(c);
    list.innerHTML=terms.length
      ? '<div class="empty">'+esc(t("No cards match."))+'<br><br>'
        +esc(t("Press"))+' <kbd>Esc</kbd> '+esc(t("to clear macro search and intents."))+'</div>'
      : (wholeThingEmpty
        ? '<div class="empty">'+esc(t("Etiuda is empty."))+'<br><br>'
          /* A first run has no menu habits yet, and Import is the route someone who downloaded
             the file is looking for - so it is a button here, not the name of one elsewhere. */
          +esc(t(sampleReady() ? "Add a card to a category," : "Add a card to a category, or"))
          +' <button type="button" class="btn" id="emptyImport">'+esc(t("import a catalog"))+'</button>'
          /* Both branches close on words: a sentence ending on a button chip reads as unfinished,
             and a bare full stop after one reads as a stray mark. */
          +(sampleReady()
            ? ' '+esc(t("or"))
              +' <button type="button" class="btn" id="emptySample">'+esc(t("load a sample catalog"))+'</button>'
              +afterBtn(t("to see how it works."))
            : afterBtn(t("you already have.")))
          /* Said here because here is where it goes wrong - and WHICH answer is right depends on
             where the copy runs, the same split the boot script's storage advice makes. On a disk
             the usual fault is a catalog beside Etiuda under the wrong name, and an unexplained
             empty screen reads as broken software; opened from a link there is no file beside it,
             so that rule would be advice about a machine the reader is not using. */
          +'<br><br><span style="font-size:12.5px;opacity:.75">'
          +(location.protocol==="file:"
            ? esc(t("A catalog file next to Etiuda loads by itself when it is called"))+' '
              +'<code>etiuda-catalog.js</code>. '
              +esc(t("Under any other name, bring it in with the button above."))
            : esc(t("The catalog you import stays in this browser, ready whenever you come back.")))
          +'</span></div>'
        /* A chosen category with nothing in it: the same quiet drawing as the other empty
           states, but the category's own icon, so it says WHICH shelf is bare. Only when the
           category really holds no cards; filtered to nothing is a different sentence, and
           there is none to write for it. */
        : (oneCat
          ? (cardCounts[oneCat] ? "" : '<div class="empty empty-cat">'+catIconSvg(oneCat,"cat-ic empty-ic")
              +esc(t("This category is empty."))+'<br><br>'
              +esc(t("Press"))+' '+chordChips("newCard")+' '
              +esc(t("to create a card here."))+'</div>')
          : '<div class="empty">'+esc(t("Nothing here yet."))+'</div>'));
    const es=$("#emptySample");
    if(es) es.onclick=()=>loadSampleCatalog();
    const ei=$("#emptyImport");
    if(ei) ei.onclick=importCatalogHere;
    syncAddFab();
    applyCardColumns();
    pendingScrollHit=false;
    entrySel=null;
    return;
  }
  const other = lang==="en" ? "pl" : "en";
  /* One separator, marking whichever boundary is the meaningful one: with an intent the
     linked / not-linked edge (the band); without one the "about it" / "merely mentions
     it" edge (the tier). Never both - two lines in a result list reads as structure the
     user has to decode. */
  const sepByBand = terms.length && intentIdxs.length;
  const sepGroup = m => { const s=sc.get(m)||{}; return sepByBand ? s.band : s.tier; };
  const sepLabel = t(sepByBand ? "not linked to your intent" : "also mentions your search");
  const dragTip = terms.length
    ? t("A search ranks the cards by relevance; clear it to order them yourself")
    : t(intentIdxs.length
        ? "Drag header to reorder within the same highlight group"
        : "Drag header to reorder within the same highlight group; same category only");
  /* Landmarks show whenever the list is RESTING: macro search is relevance-ordered and
     carries its own tier separator above, so a query hides them; an intent only changes what
     the first landmark is, it does not remove them all. The hidden tail is one "put away"
     zone and gets no labels. */
  const groupList = !terms.length;
  /* Owning up to a spelling fix, ahead of everything the list holds. Prepending it costs the
     first landmark its `:first-child` zero top margin, which is right: there is content above
     it now, so the gap it was suppressing is the gap it should have. */
  const spellNote=(eSpellFix&&eSpellFix.length)
    ? '<div class="e-spellfix">'+esc(t("Searched for"))+' '+eSpellFix.map(f=>'<b>'+esc(f.to)+'</b>').join(" "+esc(t("and"))+" ")
      +' · '+esc(t("you typed"))+' '+eSpellFix.map(f=>esc(f.from)).join(" "+esc(t("and"))+" ")+'</div>'
    : "";
  /* One pass for the counts the separators show. Done here rather than inside the map
     because a separator is emitted before its cards, so the number has to exist first. */
  const groupN={};
  if(groupList) shown.forEach(m=>{
    const k=groupKeyOf(m); groupN[k]=(groupN[k]||0)+1; });
  /* A lone category is no landmark: its heading only repeats the pill, and a fold on the one
     group on screen would blank it. The band and favourites headings stay: they say why. */
  const gk=Object.keys(groupN);
  const soloCat=gk.length===1 && gk[0]!==COLLAPSE_BAND && gk[0]!==COLLAPSE_FAV;
  /* ITEMS, not one string: a separator is rebuilt every render and a card may be KEPT,
     so the two are carried apart even though they are joined again right below. */
  /* Shared by every card this render: the two languages, the search terms and the drag tip.
     Per-card inputs ride on cardFillKey(). */
  /* dragTip is deliberately ABSENT: it names the current selection, so signing it would
     rebuild all 257 cards on the very action this exists to make cheap. patchCard sets it. */
  const renderKey=String(uiLang())+"|"+String(typeof lang!=="undefined"?lang:"")
    +"|"+terms.join(" ");
  const items=shown.map((m,i)=>{
    const hit=cardHitsSelectedIntent(m);
    const catHit=cardHitsAlwaysCat(m);
    const fav=isFavourite(m.id);
    const band=displayBandKey(m);
    let sepH="";
    /* The list is sorted 0 then 1 on whichever key sepGroup picks, so there is exactly
       one transition. Sits between cards and takes no part in drag or focus logic - card
       drag resolves through .closest(".card"), block focus walks .txt; this is neither. */
    if(terms.length && i>0 && sepGroup(shown[i-1])===0 && sepGroup(m)===1){
      sepH+='<div class="list-sep"><i></i><span>'+esc(sepLabel)+'</span><i></i></div>';
    }
    /* Resting landmarks: the favourites header, the INTENT band header, then a category
       separator at every change below - all between cards, no part in drag or focus.
       Category changes INSIDE a band are deliberately silent: everything under that
       heading is there for the same reason, and the categories resume when it ends. */
    if(groupList && !soloCat){
      const prevM=i>0?shown[i-1]:null;
      /* Gated on the BLOCK, not on the star. Without favBlockOn() here, a starred card in a
         filtered view still counted as ending a favourites block that was never drawn, and
         the category separator fired a second time under it. */
      const prevFav=!!(favBlockOn() && prevM && isFavourite(prevM.id));
      const band=inIntentBand(m), prevBand=prevM?inIntentBand(prevM):false;
      const fav=favBlockOn() && isFavourite(m.id);
      if(band && i===0){
        /* The band spans every column rather than being dealt into one - it is a result set,
           not a shelf, and burying the most relevant cards in column one would be the whole
           point of the exercise undone. FOLDED there is no set to bury: the heading takes a
           column like any other and the categories come up beside it, which is what folding
           was asked for. `e-bandsep` is what the column layout keys on. */
        sepH+='<div class="list-sep e-catsep e-bandsep'+(isCollapsed(COLLAPSE_BAND)?'':' e-span')
          +'"><span>'+ICON_INTENT_LINK
          +esc(t("Matching your intent"))+'</span>'
          +collapseCtrlHtml(COLLAPSE_BAND,groupN[COLLAPSE_BAND]||0)+'</div>';
      }else if(fav && i===0){
        sepH+='<div class="list-sep e-favsep"><span><svg class="e-favstar" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+_STAR+'</svg>'+esc(t("Favourites"))+'</span>'
          +collapseCtrlHtml(COLLAPSE_FAV,groupN[COLLAPSE_FAV]||0)+'</div>';
      }else if(!band && !fav && (!prevM || prevBand || prevFav || prevM.c!==m.c)){
        const _sl=catSlot(m.c);
        sepH+='<div class="list-sep e-catsep"><span data-k="'+esc(m.c||"")+'"'+(_sl>=0?' data-ec="'+_sl+'"':'')+'>'
          +catIconSvg(m.c)+esc(CATS[m.c]||m.c||"")+'</span>'
          +collapseCtrlHtml(String(m.c||""),groupN[String(m.c||"")]||0)+'</div>';
      }
    }
    /* FOLDED: the heading is already in h, so returning here keeps the landmark and
       drops everything under it. Gated on groupList, so a search - which draws no
       groups at all - can never hide a hit behind a fold. */
    /* Folded: the heading is in sepH and there is no card to keep, so the item carries no id. */
    if(groupList && !soloCat && isCollapsed(groupKeyOf(m)))
      return {sepH:sepH, cardH:"", id:null};
    const built=cardBodyHtml(m,i,{hit:hit,catHit:catHit,fav:fav,band:band,other:other,dragTip:dragTip});
    return {sepH:sepH, cardH:built.cardH, id:m.id,
      sig:ePackEpoch+"|"+renderKey+"|"+cardFillKey(m)
        +"|"+(entrySel&&entrySel.id===m.id?entrySel.vi:-1),
      hit:hit, catHit:catHit, hidden:!!m._hidden, i:i, band:band,
      dragging:!!(cardDrag&&cardDrag.moved&&cardDrag.key===m.id),
      hitBadge:built.hitBadge, catBadge:built.catBadge, dragTip:dragTip};
  });
  paintList(spellNote,items);
  syncAddFab();
  /* Last thing before anything measures the list: everything above builds one flat
     sequence, and this is the only step that knows about columns. */
  applyCardColumns();
  settleFreshCards();
  eApplyRecency();

  // Drop focus if that block disappeared after filter/reorder
  if(entrySel && !list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]')){
    entrySel=null;
  }

  if(pendingScrollHit){
    pendingScrollHit=false;
    // Wait a frame so layout has the new cards, then reveal the first intent-linked entry.
    requestAnimationFrame(()=>{
      /* The FIRST intent-hit, deliberately - with an openers category that is an opener, and
         that is the point: the cold open adapted to this intent is worth seeing first.
         Aiming past the openers at the first intent-specific card was tried and reverted.
         The scroll tolerates a standing category filter: it looks for a linked card and
         does nothing when the filter hides them all. */
      const hit=list.querySelector(".card.intent-hit .txt[data-v]");
      if(!hit) return;
      const card=hit.closest(".card[data-id]");
      /* The reveal is for the eyes; the mark follows only when the cards hold the arrows.
         An armed run keeps them on the rail, and a mark nothing walks must never show. */
      if(card && semiKind!=="intent") entrySel={id:card.dataset.id, vi:+hit.dataset.v};
      markEntrySel();
      /* Only scroll if the entry is not already ON SCREEN - centring unconditionally slid
         the list hundreds of px to move a card already readable, which is what read as
         juddering. The header is sticky, so "visible" starts at its underside, not 0. */
      const hdr=document.querySelector("header");
      const top=(hdr?hdr.getBoundingClientRect().bottom:0)+12;
      const r=hit.getBoundingClientRect();
      if(r.top>=top && r.bottom<=window.innerHeight-12) return;
      /* With a band the answer is AT THE TOP by construction - go there, no hunting. */
      const target=intentBandOn() ? (list.querySelector(".e-bandsep") || hit) : hit;
      // The first thing in the list means the top of the page - see scrollPageTop().
      const firstBlock=list.querySelector(".card, .e-bandsep");
      if(firstBlock && (firstBlock===target || firstBlock.contains(target) || target.contains(firstBlock))){
        scrollPageTop(); return;
      }
      target.scrollIntoView({block:intentBandOn()?"start":"center",behavior:"smooth"});
    });
  } else {
    markEntrySel();
  }
  /* Scheduled, not immediate: a title's width is not settled until its column is dealt and
     the card it sits in has been laid out. */
  scheduleCutScan();
}

/** Cards in the order the LIST means, which is only document order while there is one
 *  column. See the stamping in applyCardColumns(). */
function listCardsOrdered(){
  if(!list) return [];
  const a=Array.prototype.slice.call(list.querySelectorAll(".card[data-id]"));
  if(!list.classList.contains("cols")) return a;
  return a.sort((x,y)=>(+x.dataset.ord||0)-(+y.dataset.ord||0));
}
/** All copyable blocks in list order (alts, steps, or single body). */
function listEntryEls(){
  const out=[];
  listCardsOrdered().forEach(c=>{
    Array.prototype.slice.call(c.querySelectorAll(".txt[data-v]")).forEach(t=>out.push(t));
  });
  return out;
}
function markEntrySel(){
  if(!list) return;
  list.querySelectorAll(".txt.sel").forEach(el=>el.classList.remove("sel"));
  if(!entrySel) return;
  const el=list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]');
  if(el) el.classList.add("sel");
  else entrySel=null;
}
function setEntrySel(id, vi, opts){
  opts=opts||{};
  if(id==null){ entrySel=null; markEntrySel(); return; }
  entrySel={id:String(id), vi:+vi||0};
  markEntrySel();
  if(opts.scroll && list){
    const el=list.querySelector('.card[data-id="'+cssEsc(entrySel.id)+'"] .txt[data-v="'+entrySel.vi+'"]');
    if(el) el.scrollIntoView({block:opts.block||"nearest", behavior:opts.smooth===false?"auto":"smooth"});
  }
  scheduleTabSave();
}
/* THE PAGE'S SCROLLER IS AN ELEMENT, not the window: the frame is fixed and one region under
   the header scrolls. Asked for rather than cached, because a stale node scrolls nothing.
   The fallbacks are for a document that never got the shell. */
function pageScroller(){
  return document.getElementById("pageScroll") || document.scrollingElement || document.documentElement;
}
function pageScrollY(){ const el=pageScroller(); return (el&&el.scrollTop)||0; }
/* THE PAGE KEYS: the browser answered these while the window was the scroller and cannot now,
   because the scrolling element is never the focused one. Instant, like the keys they stand
   in for. Which of them survive a caret is the callers' business, not this one's. */
function pageKeyScroll(key){
  const sc=pageScroller(), page=Math.max(120, sc.clientHeight-60);
  const dy = key==="PageDown" ?  page : key==="PageUp" ? -page
           : key==="End"      ?  sc.scrollHeight : key==="Home" ? -sc.scrollHeight : null;
  if(dy==null) return false;
  sc.scrollBy({top:dy, left:0, behavior:"auto"});
  return true;
}
/* Landing on the FIRST macro means the top of the page, not merely far enough up to see
   it: scroll-margin-top stops short - correct for every other entry, wrong for this one,
   because nothing above it is worth hiding and arriving at the beginning should look like
   the beginning. Every way of arriving there uses this. */
function scrollPageTop(){
  const el=pageScroller();
  try{ el.scrollTo({top:0, left:0, behavior:"smooth"}); }
  catch(_){ try{ el.scrollTop=0; }catch(__){} }
}
/** Navigate focus across every copyable block (not whole cards). */
function navEntry(dir){
  const els=listEntryEls();
  if(!els.length) return false;
  let i=els.findIndex(el=>{
    if(!entrySel) return false;
    const card=el.closest(".card[data-id]");
    return card&&card.dataset.id===entrySel.id && +el.dataset.v===entrySel.vi;
  });
  /* Wraps, like navPill - it used to CLAMP, a dead stop at both ends, and the two lists
     sat side by side behaving differently: the kind of inconsistency you feel long before
     you can name it. */
  if(i<0) i=dir>0?0:els.length-1;
  else i=((i+dir)%els.length+els.length)%els.length;
  const el=els[i];
  const card=el.closest(".card[data-id]");
  if(!card) return false;
  setEntrySel(card.dataset.id, +el.dataset.v, {scroll:i>0});
  if(i===0) scrollPageTop();
  return true;
}
/** Pill keys in on-screen order (All = "", then category order). [data-k] rather than
 *  .pill: the trailing "+" and the inline input are pills by class but not categories -
 *  mapped to "" they were indistinguishable from All (a real key), so ←/→ landed on the
 *  "+" and read as a dead press. Selecting on the attribute means a new control added to
 *  the strip cannot rejoin the keyboard cycle by accident. */
function listPillKeys(){
  if(!pills) return [];
  return Array.prototype.map.call(pills.querySelectorAll(".pill[data-k]"), el=>el.dataset.k);
}
/** ←/→ cycle category filter like a plain click (single pill; All clears filter). */
/* SHIFT IS THE SAME AXIS, ALL THE WAY - the compass's amplitude. The walkable set is
   navPill's own, so a search that hides empty categories hides them here too; All is
   skipped because "first category" means a category. */
function navPillEnd(dir){
  let keys=listPillKeys();
  if(!keys.length) return false;
  const sc=searchCounts();
  if(sc){
    const live=keys.filter(k=>!k || (sc[k]||0)>0);
    if(live.length>1) keys=live;
  }
  const real=keys.filter(Boolean);
  if(!real.length) return false;
  const k=dir>0?real[real.length-1]:real[0];
  if(cats.length===1 && cats[0]===k) return true;
  const railBefore=captureRail(), relBefore=railRelKeys();
  cats=[k];
  pendingScrollHit=!!intentIdxs.length;
  drawPills();
  render();
  railEchoRedraw(railBefore, relBefore);
  peekPillsForKey(k);
  scheduleTabSave();
  return true;
}
/* The mark to the far end of its own surface - and, when it is already there, across to
   the other surface's matching end. That second press is the only way to reach the cards
   without accepting an intent, and it is symmetric: the same press comes back. A surface
   with nothing active refuses the crossing, because grey means inactive. */
/* WHERE THE MARK IS, by the same test the decorator paints by - semiKind alone is not
   the answer: the mark a query puts on the best intent claims no surface, so it reads as
   null while being plainly visible. */
function markSurface(){
  if(semiKind==="card" || entrySel) return entrySel?"card":null;
  if(railMarkUsed) return null;
  const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
  if(idx<0) return null;
  return (railSel>=0 || semiKind==="intent" || (railQuery() && railSettled)) ? "intent" : null;
}
function markEnd(dir){
  const endPos=railStep(dir>0?railOrder.length:-1, dir>0?-1:1);   // the last or first UNPICKED row
  const railHas=endPos>=0;
  const els=listEntryEls();
  const cardHas=els.length>0;
  const onIntent = markSurface()==="intent";
  const atEnd = onIntent
    ? (railHas && railOrder.indexOf(railSel>=0?railOrder[railSel]:railMarkIdx)===endPos)
    : (!!entrySel && els.length
        && els[dir>0?els.length-1:0].closest(".card[data-id]").dataset.id===entrySel.id
        && +els[dir>0?els.length-1:0].dataset.v===entrySel.vi);
  let toIntent = onIntent ? !atEnd : atEnd;
  if(toIntent && !railHas) return !!onIntent;     // nothing to cross to - stay put
  if(!toIntent && !cardHas) return !!onIntent;
  kbdNav(true);
  if(toIntent){
    semiKind="intent"; railMarkUsed=false;
    if(entrySel){ entrySel=null; markEntrySel(); }
    railSel = endPos;
    railMarkIdx = railOrder[railSel];
    railDecorate(true);
  }else{
    semiKind="card"; railSel=-1;
    railDecorate(false);
    const el=els[dir>0?els.length-1:0];
    const card=el.closest(".card[data-id]");
    setEntrySel(card.dataset.id, +el.dataset.v, {scroll:dir>0, block:"nearest"});
    if(dir<0) scrollPageTop();
  }
  return true;
}
function navPill(dir){
  let keys=listPillKeys();
  if(!keys.length) return false;
  /* While a query is live, walk only the categories that contain matches - 25
     categories and a two-hit query meant pressing through twenty empty ones. All stays
     reachable always (empty key); the restriction drops if it would leave only All. */
  const sc=searchCounts();
  if(sc){
    const live=keys.filter(k=>!k || (sc[k]||0)>0);
    if(live.length>1) keys=live;
  }
  let i;
  if(!cats.length) i=0; // All
  else {
    i=keys.findIndex(k=>k && cats.indexOf(k)>-1);
    if(i<0) i=0;
  }
  const n=keys.length;
  i=((i+dir)%n+n)%n;
  const k=keys[i];
  // Captured before cats changes - see the pill click handler, same shape
  const railBefore=captureRail(), relBefore=railRelKeys();
  if(!k) cats=[];
  else cats=[k];
  pendingScrollHit=!!intentIdxs.length;
  drawPills();
  render();
  railEchoRedraw(railBefore, relBefore);
  // after drawPills, so the pill being measured is the one now on screen
  peekPillsForKey(k);
  /* The category walk moves the FILTER and nothing else - seeding the first block here
     minted a second mark and stole the surface from an intent mark the arrows were
     following. A card mark that survives the filter keeps working; one that does not is
     nulled by the render's own re-validation; with no mark, navEntry starts from the top
     on its own. */
  scheduleTabSave();
  return true;
}
/** Copy the focused block (or other language at the same part index). */
function copyEntrySel(otherLang){
  if(!entrySel) return false;
  const m=findCard(entrySel.id)||shown.find(x=>x&&x.id===entrySel.id);
  if(!m) return false;
  /* The pinned language is what is on screen, so it is what a copy means - and what the
     other-language shortcut flips away from. */
  const shown_l=cardLang(m);
  const l=otherLang?(shown_l==="en"?"pl":"en"):shown_l;
  const ps=parts(m,l);
  if(!ps.length){ toast(t("No {LANG} version for this card").replace("{LANG}",l.toUpperCase())); return true; }
  const vi=Math.max(0, Math.min(ps.length-1, entrySel.vi|0));
  bumpUseCount(entrySel.id);
  copy(fill(ps[vi],m,0,l), copiedToastMsg(m, l, vi, ps.length));
  eCopyFeedback(entrySel.id);   // wash the selected block + recency trace, same as a click
  return true;
}
// ---- a value safe inside a CSS selector ----
function cssEsc(s){
  if(window.CSS&&typeof CSS.escape==="function") return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g,ch=>"\\"+ch);
}
// ---- at load: every pointer gesture the card list answers ----
wireListPointer();

/* ONE SENTENCE, BUILT ONCE, for both copy routes: glued from fragments it stays English in
   a Polish interface however well toast() translates, and two gluings disagree about the
   same card. The language code is not translated: EN and PL name the card's language, not
   the interface's. */
function copiedToastMsg(m, lang, vi, total){
  const code=String(lang||"").toUpperCase();
  const where=m&&m.seq ? code+" "+t("step")+" "+(vi+1)+"/"+total
                       : code+(total>1 ? " "+(vi+1)+"/"+total : "");
  return t("Copied {WHAT} from {TITLE}").replace("{WHAT}",where).replace("{TITLE}",cardTitle(m));
}
/* Local copy counter: one integer per card id, stored in the pack, never exported and
   never sent anywhere (nothing in this file could send it). Answers two questions
   nothing else can: which phrases earn their place - a count on the Manage rows - and
   how often the tool is actually used, the honest denominator for any time-saved
   estimate. Reset clears it with everything else. */
function bumpUseCount(id){
  if(!id) return;
  if(!pack.useCounts||typeof pack.useCounts!=="object") pack.useCounts={};
  pack.useCounts[id]=(pack.useCounts[id]|0)+1;
  savePack();
}
function copy(text,msg){
  // Copying consumes the semi-selection - every copy, click or keyboard, funnels through here.
  railMarkUsed=true; semiKind=null;
  railDecorate(false);
  const done=()=>toast(msg);
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(done,()=>fallback(text,done));
  } else fallback(text,done);
}
function fallback(text,cb){
  const ta=document.createElement("textarea");
  ta.value=text; ta.style.cssText="position:fixed;opacity:0";
  document.body.appendChild(ta); ta.select();
  try{document.execCommand("copy");cb();}catch(e){toast("The browser blocked the copy, so select the text yourself.");}
  ta.remove();
}
let tt;
function ask(m){ return confirm(t(m)); }
const TOAST_MS=1700;
var toastSerial=0;
function toast(m){
  toastSerial++;
  /* Every message the app speaks passes through here, so this is the one place a toast needs
     translating - not fifty call sites. */
  m=t(m);
  const el=$("#toast"); el.textContent=m; markCut(el); el.classList.add("show");
  clearTimeout(tt); tt=setTimeout(()=>el.classList.remove("show"),TOAST_MS);
}

// ---- at load: the quick facts text, its copy targets and its editor ----
renderFacts();
wireFactsCopy();
wireFactsEditor();

// ---- running a shortcut: the dispatcher reaches the whole app, so it stays here -------
function runShortcut(id){
  if(id==="langToggle"){ setLang(lang==="en"?"pl":"en"); return true; }
  if(id==="tabNext"){ stepTab(1); return true; }
  if(id==="tabNew"){ addTab(); return true; }
  if(id==="maintenance"){ closeLooseOverlays(); openMaintenance(); return true; }
  if(id==="quickFacts"){ toggleFactsPanel(); return true; }
  if(id==="newCard"){ const b=$("#addCardFab"); if(!b||b.hidden) return false; closeLooseOverlays(); b.click(); return true; }
  if(id==="selectSearch"){
    if(!intentEl) return false;
    closeLooseOverlays();
    try{ intentEl.focus({preventScroll:true}); }catch(_){ try{ intentEl.focus(); }catch(__){} }
    try{ intentEl.select(); }catch(_){}
    return true;
  }
  if(id==="focusPax"){ pax.focus(); pax.select(); return true; }
  if(id==="focusRole"){ const d=$("#roleDrum"); if(d) d.focus(); return true; }
  if(id==="toggleRail"){ toggleRail(); return true; }
  if(id==="togglePills"){ togglePills(); return true; }
  /* Unhandled when no editor is open, or when the arrow is at its end, so the key falls
     through instead of being silently swallowed. */
  if(id==="edPrevEntry"||id==="edNextEntry"){
    const b=$(id==="edPrevEntry"?"#edPrev":"#edNext");
    if(!b||b.disabled) return false;
    b.click();
    return true;
  }
  if(id==="edPrevLang") return edStepLang(-1);
  if(id==="edNextLang") return edStepLang(1);
  if(id==="clearIntent"){
    clearIntents();
    return true;
  }
  if(id==="allCats"){
    const railBefore=captureRail(), relBefore=railRelKeys();
    cats=[]; drawPills(); render();
    railEchoRedraw(railBefore, relBefore);
    toast("All categories");
    return true;
  }
  if(id==="navUp"||id==="navDown"){
    kbdNav(true);
    if(semiKind==="intent" && !railMarkUsed && (railSel>=0 || railMarkIdx>=0)){
      const n=railOrder.length;
      if(n){
        const step=id==="navDown"?1:-1;
        const from=railSel>=0?railSel:railOrder.indexOf(railMarkIdx);
        const to=railStep(from<0 ? (step>0?-1:n) : from, step);
        if(to>=0){
          railSel=to;
          railMarkIdx=railOrder[railSel];
          railDecorate(true);
          return true;
        }
      }
    }
    semiKind="card";
    navEntry(id==="navDown"?1:-1);
    return true;
  }
  if(id==="navPillLeft"||id==="navPillRight"){
    navPill(id==="navPillRight"?1:-1);
    return true;
  }
  if(id==="markTop"||id==="markBottom"){
    kbdNav(true);
    return markEnd(id==="markBottom"?1:-1);
  }
  if(id==="navPillFirst"||id==="navPillLast"){
    return navPillEnd(id==="navPillLast"?1:-1);
  }
  if(id==="copy"||id==="copyOther"){
    kbdNav(true);
    // The mark's surface decides what Enter means: an intent mark is picked, a card copied.
    if(id==="copy" && semiKind==="intent" && railMarkIdx>=0 && !railMarkUsed){
      const idx = railSel>=0 && railSel<railOrder.length ? railOrder[railSel] : railMarkIdx;
      // Enter's alter ego: inside a run it ADDS and closes, exactly as the key does.
      const run = pickRun && intentIdxs.length>0;
      pickIntent(idx, run);
      if(run){ railMarkUsed=true; semiKind=null; pickRun=false; }
      return true;
    }
    if(!entrySel){
      // Nothing focused yet - focus first block then copy (Enter after open)
      if(!navEntry(1)) return false;
    }
    return copyEntrySel(id==="copyOther");
  }
  if(id==="escape"){
    if(notePaneOpen()){ closeNotePane(); return true; }
    if(factsPanelOpen()){ closeFactsPanel(); return true; }
    if($("#settingsMenu")&&!$("#settingsMenu").hidden){ closeSettingsMenu(); return true; }
    escapeLadderStep();
    return true;
  }
  return false;
}
/* Reaching for the search box dismisses the loose overlays: quick facts and the settings
   menu hang off the header directly over the box and the first cards, and neither is a mode
   you leave deliberately - a keystroke aimed somewhere else says you are done with them.
   DIALOGS ARE NOT INCLUDED, deliberately: they are modal, they hold unsaved work, and the
   global keydown returns before ever reaching here while one is open. */
function closeLooseOverlays(){
  if($("#settingsMenu") && !$("#settingsMenu").hidden){
    closeSettingsMenu();
  }
  if(factsPanelOpen()){
    closeFactsPanel();
  }
  closeNotePane();
}
function typingInField(){
  const a=document.activeElement;
  if(!a) return false;
  if(a.isContentEditable) return true;
  const tag=(a.tagName||"").toLowerCase();
  return tag==="input"||tag==="textarea"||tag==="select";
}
/* The list, its capture handling and its reset are ONE component, rendered into whatever
   container asks - the Settings accordion today, any future surface tomorrow - so a
   rebinding made anywhere behaves identically. */
function shortcutsListHtml(){
  const bind=(d,slot)=>{
    const fixed=!!d.fixed, listening=scCaptureId===d.id&&scCaptureSlot===slot;
    const c=slot===2?scChord2(d.id):scChord(d.id), empty=!c||(!c.code&&!c.key);
    const shown=slot===2?formatChord(c):formatActionChord(d.id);
    // a caption longer than the slot shrinks its type rather than the slot growing
    return '<button type="button" class="sc-bind'+(fixed?" fixed":"")+(listening?" listening":"")+(slot===2?" sc-alt":"")+(empty?" sc-empty":"")+(shown.length>7?" sc-long":"")+
      '" data-bind="'+esc(d.id)+'" data-slot="'+slot+'"'+
      (fixed?" disabled":' title="'+esc(t(slot===2?"An alternative: click, then press the key combo":"Click, then press the new key combo"))+'"')+'>'+
      (listening?esc(t("Press keys…")):(empty?esc(t("none")):esc(shown)))+'</button>';
  };
  const row=d=>{
    return '<div class="sc-row" data-sc="'+esc(d.id)+'">'+
      '<div class="sc-label">'+esc(t(d.label))+
        (d.hint?'<small>'+esc(t(d.hint))+'</small>':'')+
      '</div><div class="sc-binds">'+bind(d,1)+(d.fixed?"":bind(d,2))+'</div></div>';
  };
  /* Rebindable rows first, fixed rows grouped under their own separator - the split is the
     explanation a per-row tooltip could not give: tooltips on disabled buttons never reach
     keyboard or touch users, and the WHY is one fact shared by all of these, so it is said
     once, visibly, where the group starts. Render-level split only; SC_DEFS keeps its order. */
  return SC_DEFS.filter(d=>!d.fixed).map(row).join("")+
    '<div class="sc-sep">'+esc(t("Fixed keys"))+
      '<small>'+esc(t("The grammar the rest stands on: Esc is how key capture itself cancels, arrows and Enter keep their native meanings, and a held Ctrl is a hold, not a chord."))+'</small>'+
    '</div>'+
    SC_DEFS.filter(d=>d.fixed).map(row).join("");
}
/* The capture state is the list's rather than the chord model's: what it is listening
   for, and for which of the two slots. */
var scCaptureId=null, scCaptureSlot=1;
/** Paints the list into `box` and wires capture. `repaint` is how the component asks its host
 *  to draw again - the host owns the surrounding markup, so it decides what redrawing means. */
/* Whichever surface last painted the list owns the repaint - a rebinding must repaint in
   place, never throw the user into a different screen on a keystroke. */
let scRepaint=null;
function wireShortcutsList(box, repaint){
  if(!box) return;
  scRepaint=repaint;
  box.innerHTML=shortcutsListHtml();
  box.querySelectorAll("[data-bind]").forEach(btn=>{
    if(btn.disabled) return;
    btn.onclick=()=>{
      scCaptureId=btn.getAttribute("data-bind");
      scCaptureSlot=+btn.getAttribute("data-slot")||1;
      repaint();
      toast(scCaptureSlot===2?"Press the alternative (Esc to cancel, Backspace to clear)":"Press the new shortcut (Esc to cancel, Backspace for the default)");
    };
  });
}
/* Both doors (Library and Maintenance) open onto this pair. FORGETTING WHAT YOU MADE AND
   PUTTING THE CATALOG DOWN ARE TWO ACTS: one button doing both charged the common one the
   price of the rare one. The prefix filter is load-bearing - file:// pages can share one
   storage area, and another local page's keys must be left alone. The reload is what
   actually empties the engine: the catalog is applied once at boot. */
const CATALOG_KEEP=[E_CATALOG_STORE,E_CATALOG_KEY,nsKey("Sample")];
/* WHOSE KEYS ARE THESE. Preferences are bare and deliberately machine-wide - a theme is
   shared, a catalog is not - so Reset forgets them wherever they were set. Everything else
   is namespaced, and the trap is that the plain engine's own namespace IS the bare "pb":
   its prefix therefore also matches every OTHER copy's "pb<hash>~" keys, and a Reset run in
   one build was deleting a neighbouring copy's catalog, pack, stars and order. */
const E_PREF_KEYS=["pbTheme","pbGlassOff","pbMotionOff","pbUiLang","pbLang","pbAgent","pbPax","pbNoteHover",
  "pbWho","pbPills","pbPillsLock","pbRail","pbRailLock","pbRailW","pbCollapsed","pbFactsW",
  "pbFactsH","pbShortcuts","pbHdrPills"];
function eKeyIsPref(k){ return E_PREF_KEYS.indexOf(k)>-1 || k.indexOf("pbTour")===0; }
function eKeyIsMine(k){
  return k.indexOf(E_NS)===0 && (E_NS!=="pb" || !/^pb[0-9a-z]+~/.test(k));
}
function clearLocalMemory(){
  /* One t() per line, and every space kept OUTSIDE the key: a key with a trailing space
     can never be matched against the source, because what the scanner reads it trims. */
  if(!ask(t("Clear Etiuda's local memory in this browser?")+"\n\n"
    +t("Removes every personal card, intent, edit, hide, category rename and quick-facts edit,")+" "
    +t("and forgets your agent name, theme and layout choices.")+" "
    +t("Catalog files on disk are not touched.")+"\n\n"
    +t("The loaded catalog stays, and Etiuda restarts with it."))) return;
  /* Latch first, delete second - see eWiping: the reload does not stop timers, and a
     pending debounced save would write its key straight back. Cancelling the known timer as
     well is not redundant: the latch stops the write, this stops the work. */
  mgReopenAfterReload();            // before the latch, which ssSet obeys
  eWipeLatch();
  clearTimeout(tabSaveTimer);
  /* The watched-file HANDLE lives in IndexedDB, so a key sweep cannot reach it: deleting
     only WatchName left a live watch the interface no longer showed any control for, still
     free to announce an update about a file nobody could stop watching. */
  let watchGone=null;
  try{ watchGone=eWatchClear(); }catch(e){}
  try{ lsKeys().filter(k=>(eKeyIsMine(k)||eKeyIsPref(k)) && CATALOG_KEEP.indexOf(k)<0)
         .forEach(k=>lsDel(k)); }catch(e){}
  ssDel(TAB_KEY);
  /* The reload waits for that delete, which is asynchronous and would otherwise be abandoned
     mid-transaction - but never for long: a wipe the user asked for must not hang on it. */
  if(watchGone && typeof watchGone.then==="function"){
    let done=false;
    const go=()=>{ if(!done){ done=true; location.reload(); } };
    watchGone.then(go,go);
    setTimeout(go,600);
  } else location.reload();
}
/* The other half. The personal layers go WITH the catalog because they only mean anything
   against its cards - the same reasoning activateCatalog applies when one catalog replaces
   another. Preferences stay: a name, a theme and a layout are yours, not the catalog's. */
function ejectCatalog(){
  if(!ask(t("Eject the catalog from this browser?")+"\n\n"
    +t("Your own cards, edits, stars and card order are KEPT, and come back where they were when you load this catalog again.")+" "
    +t("Loading a different catalog clears them, because they were written against this one.")+"\n\n"
    +t("Your agent name, theme and layout choices stay, and catalog files on disk are not touched.")+"\n\n"
    +t("Etiuda restarts empty. If a catalog file sits beside it you will be asked whether to load it."))) return;
  /* The ONE personal field that has to go: an older import route stored the catalog itself
     here, and BASE_M is built from it, so leaving it would hand the cards straight back. */
  pack.baseCards=null;
  savePack();                       // written BEFORE the latch, or the change never lands
  mgReopenAfterReload();            // and so is this, for the same reason
  eWipeLatch();
  clearTimeout(tabSaveTimer);
  CATALOG_KEEP.forEach(k=>lsDel(k));
  nsDel("CatalogNo");
  ssDel(TAB_KEY);
  location.reload();
}

/* A rescue that must also survive the NEXT boot: applied here, before anything glass is
   drawn, and readable in the maintenance panel. */
try{ if(lsGet("pbGlassOff")==="1") document.body.classList.add("glass-off"); }catch(e){}
try{ if(lsGet("pbNoteHover")!=="0") document.body.classList.add("note-hover"); }catch(e){}

// ---- the modal window's own two elements, which every dialog is drawn into ----
const modalEl=$("#modal"), modalCard=$("#modalCard");
// ---- the cut pass's two instruments: a module body may not touch the DOM at load ----
/* SUB-PIXEL, BECAUSE THE ELLIPSIS IS: scrollWidth and clientWidth are whole numbers, so a
   line overflowing by less than a pixel rounds to no overflow at all and the dots get drawn
   where nothing here can see them. A Range gives the text its true width, the rect less
   padding gives the box. Blink lays out in 64ths, so 0.01 is under anything real. */
const cutRange=document.createRange();
/* A PLACEHOLDER IS IN NO MEASUREMENT THE ELEMENT OFFERS. The Range cannot reach into an input
   at all, and scrollWidth ignores a placeholder entirely, so the canvas measures the same
   string in the same font: sub-pixel, and without a layout. One context for every field, so
   the spacing is written each time - "normal" is not a length it accepts, and the last real
   value would stand in its place. */
const cutInk=document.createElement("canvas").getContext("2d");
// ---- at load: the fields that watch their own cut, the X, and the body wrapper ----
wireCutFields();
wireModalX();
wireModalBody();
/* THE SCRIM DOES NOT CLOSE. Every dialog here carries an X, and the editors carry Cancel and
   Save: a click that lands beside the card is a miss, not an instruction, and answering it by
   throwing away an edit costs more than the one it saves. Escape still closes - that is the
   keyboard's X, not a stray. */

// Capture rebinds while the shortcuts modal is open (capture phase)
addEventListener("keydown",e=>{
  if(!scCaptureId||!modalOpen()) return;
  if(e.key==="Escape"){
    e.preventDefault(); e.stopPropagation();
    scCaptureId=null;
    if(scRepaint) scRepaint();
    return;
  }
  const id=scCaptureId, slot=scCaptureSlot;
  if(e.key==="Backspace"||e.key==="Delete"){
    e.preventDefault(); e.stopPropagation();
    const d=SC_DEFS.find(x=>x.id===id);
    if(slot===2) scMap2[id]=emptyChord(); else scMap[id]=cloneChord(d.def);
    scCaptureId=null; saveShortcuts(); if(scRepaint) scRepaint();
    toast(slot===2?"Alternative cleared":"Back to the default");
    return;
  }
  const chord=chordFromEvent(e);
  if(!chord) return;
  e.preventDefault(); e.stopPropagation();
  /* THE FIXED KEYS ARE NOT ON OFFER: the list says they keep their own meanings, and the sweep
     below cannot take a chord back off one - it skips them. Refusing the capture is what keeps
     that promise; the row stays open for another key. */
  const fixedOwner=SC_DEFS.find(d=>d.fixed && (chordsEqual(d.def,chord)||chordsEqual(d.def2,chord)));
  if(fixedOwner){
    toast(t("{KEY} is fixed and keeps its own meaning").replace("{KEY}",formatChord(chord)));
    return;
  }
  // The chord leaves whichever slot held it, on any action: the taken slot returns to its default.
  SC_DEFS.forEach(d=>{
    if(d.fixed) return;
    if(!(d.id===id&&slot===1) && chordsEqual(scMap[d.id],chord)) scMap[d.id]=cloneChord(d.def);
    if(!(d.id===id&&slot===2) && chordsEqual(scMap2[d.id],chord)) scMap2[d.id]=emptyChord();
  });
  if(slot===2) scMap2[id]=chord; else scMap[id]=chord;
  scCaptureId=null;
  saveShortcuts();
  if(scRepaint) scRepaint();
  toast(t("Saved {KEY}").replace("{KEY}",formatChord(chord)));
}, true);

loadShortcuts();

addEventListener("keydown",e=>{
  if(scCaptureId) return;

  if(tourActive()){
    if(e.key==="Escape" || eventMatchesAction(e,"escape")){
      e.preventDefault();
      endTour(false);
    }

    // ←/→ move the selection across the tour buttons; Enter presses the selected one.
    if(e.key==="ArrowRight"){
      e.preventDefault();
      moveTourFocus(1);
    } else if(e.key==="ArrowLeft"){
      e.preventDefault();
      moveTourFocus(-1);
    } else if(e.key==="Enter"){
      e.preventDefault();
      activateTourFocus();
    }
    return;
  }

  if(modalOpen()){
    // Escape is the keyboard's X, and goes where the X goes - back one screen, then out.
    if(e.key==="Escape"){ e.preventDefault(); dismissModal(); }
    /* A rescue must be reachable from anywhere - including from inside a dialog, where a
       misbehaving Etiuda is often being poked. It swaps into the modal the way the
       Library's sub-dialogs do, and closing RETURNS to the swapped-out screen: the
       Library and the shortcuts list are recognised by their own furniture and reopened;
       anything else closes outright. */
    else if(eventMatchesAction(e,"maintenance")){
      e.preventDefault();
      const back=$("#mgClose")?(()=>openManage())
        :$("#setBody")?(()=>openSettings("keys"))
        :null;
      openMaintenance(back);
    }
    /* AND THE EDITORS KEEP THEIR OWN ARROWS. Everything else stays suppressed - a dialog
       holds unsaved work and the main screen's keys have no meaning over it - but walking
       to the next card is what these two are FOR, and they exist nowhere else. */
    else if(eventMatchesAction(e,"edPrevEntry")){ e.preventDefault(); runShortcut("edPrevEntry"); }
    else if(eventMatchesAction(e,"edNextEntry")){ e.preventDefault(); runShortcut("edNextEntry"); }
    /* Swallowed whether or not it lands, unlike on the main screen: at the last tab the key
       has nothing to do, and letting it through would be the browser leaving the editor. */
    else if(eventMatchesAction(e,"edPrevLang")){ e.preventDefault(); runShortcut("edPrevLang"); }
    else if(eventMatchesAction(e,"edNextLang")){ e.preventDefault(); runShortcut("edNextLang"); }
    else if(e.key==="Tab"){
      const to=modalTabTarget(e.shiftKey);
      if(to){ e.preventDefault(); try{ to.focus({preventScroll:true}); }catch(x){ to.focus(); } }
    }
    return;
  }


  if(eventMatchesAction(e,"escape")){
    if($("#settingsMenu")&&!$("#settingsMenu").hidden){
      e.preventDefault(); closeSettingsMenu(); return;
    }
    if(factsPanelOpen()){ e.preventDefault(); closeFactsPanel(); return; }
  }

  const inField=typingInField();
  for(let i=0;i<SC_DEFS.length;i++){
    const d=SC_DEFS[i];
    if(d.fixed) continue;
    if(!eventMatchesAction(e,d.id)) continue;
    if(inField&&!d.inField) continue;
    // runShortcut may return false to decline (an editor arrow with no editor open)
    if(runShortcut(d.id)!==false){
      e.preventDefault();
      return;
    }
  }

  /* After the rebindable pass, so a binding placed on one of these still wins. Page up and
     down run from inside the search box too - a caret in a single-line field has no use for
     them - while Home and End keep their meaning there, behind the guard below. */
  const plain=!e.ctrlKey && !e.altKey && !e.metaKey;
  if(plain && (e.key==="PageDown"||e.key==="PageUp") && pageKeyScroll(e.key)){ e.preventDefault(); return; }
  if(inField) return;
  if(plain && (e.key==="Home"||e.key==="End") && pageKeyScroll(e.key)){ e.preventDefault(); return; }
  if(eventMatchesAction(e,"navUp")){ e.preventDefault(); runShortcut("navUp"); return; }
  if(eventMatchesAction(e,"navDown")){ e.preventDefault(); runShortcut("navDown"); return; }
  if(eventMatchesAction(e,"markTop")){ e.preventDefault(); runShortcut("markTop"); return; }
  if(eventMatchesAction(e,"markBottom")){ e.preventDefault(); runShortcut("markBottom"); return; }
  if(eventMatchesAction(e,"navPillFirst")){ e.preventDefault(); runShortcut("navPillFirst"); return; }
  if(eventMatchesAction(e,"navPillLast")){ e.preventDefault(); runShortcut("navPillLast"); return; }
  if(eventMatchesAction(e,"navPillLeft")){ e.preventDefault(); runShortcut("navPillLeft"); return; }
  if(eventMatchesAction(e,"navPillRight")){ e.preventDefault(); runShortcut("navPillRight"); return; }
  if(eventMatchesAction(e,"copyOther")){ e.preventDefault(); runShortcut("copyOther"); return; }
  if(eventMatchesAction(e,"copy")){ e.preventDefault(); runShortcut("copy"); return; }
  if(eventMatchesAction(e,"escape")){ e.preventDefault(); runShortcut("escape"); return; }

  // Nothing focused (e.g. clicked empty space): printable keys go straight into INTENT.
  // First character is inserted manually because focus alone would swallow this keydown.
  if(e.ctrlKey||e.altKey||e.metaKey) return;
  if(e.key.length!==1) return;
  if(!intentEl) return;
  e.preventDefault();
  closeLooseOverlays();
  try{ intentEl.focus({preventScroll:true}); }catch(_){ try{ intentEl.focus(); }catch(__){} }
  /* No special case for any bound printable key here: the dispatch loop above owns every
     binding and returns before this point. A hardcoded key here survives rebinds and makes the
     shortcuts screen a liar - a key that reaches this line is an ordinary character and
     gets typed. */
  const v=String(intentEl.value||"");
  const start=intentEl.selectionStart==null?v.length:intentEl.selectionStart;
  const end=intentEl.selectionEnd==null?v.length:intentEl.selectionEnd;
  intentEl.value=v.slice(0,start)+e.key+v.slice(end);
  const caret=start+e.key.length;
  try{ intentEl.setSelectionRange(caret,caret); }catch(_){}
  intentEl.dispatchEvent(new Event("input",{bubbles:true}));
});

// ---- at load: the one listener behind every editor's language strip ----
wireLangTabs();

// ---- at load: the pointer listeners a Library drag runs on ----
wireManageDrag();

// ---- at load: the pointer listeners a tab drag runs on ----
wireTabDrag();

rebuildCards();
syncAgent();
applyLangUI(lang);   // initTabs() -> applyTab() installs the tab's own language and renders
rebuildRailMQ();     // the dock threshold, now that the column geometry it reads is declared
syncRailLayout();
/* Collapse the category bar NOW, in the same task as the first render. drawPills()
   ends in schedulePillsCollapse(), which waits two rAFs to measure a settled layout -
   right for a resize, wrong for boot, where syncRailLayout() settled it synchronously a
   line above: the wait painted two frames of a full-height bar, and everything below
   jumped when the clip arrived. The scheduled pass still runs and corrects anything that
   settles late; this one only makes sure the first frame is not wrong. */
syncPillsCollapse();
drawIntentRail();
initTabs();
/* Boot is painted, so a saved interface language may repaint the chrome. Two frames, so the
   first paint and the frame that settles after it are both behind us. With a timeout behind
   THAT, because rAF DOES NOT RUN IN A HIDDEN TAB: restored into a background tab the class
   would never arrive - the same trap that kept schedulePillsCollapse's two-frame wait from
   ever firing there. First one wins. */
let eReadyDone=false;
function markEReady(){
  if(eReadyDone) return;
  eReadyDone=true;
  /* A saved interface language repaints the chrome once the markup exists. The HTML ships
     English, so this is the only moment a Polish build stops looking English. */
  applyUiLang();
}
requestAnimationFrame(()=>requestAnimationFrame(markEReady));
setTimeout(markEReady,300);

// On open: focus the first copyable entry so ↑↓ work immediately (no INTENT capture).
// INTENT still receives typing when the user starts typing (global keydown → intent field).
function focusFirstEntryOnOpen(){
  try{
    const a=document.activeElement;
    if(a&&a!==document.body&&typeof a.blur==="function") a.blur();
  }catch(_){}
  const els=listEntryEls();
  if(!els.length) return;
  const el=els[0];
  const card=el.closest(".card[data-id]");
  if(!card) return;
  setEntrySel(card.dataset.id, +el.dataset.v, {scroll:false, smooth:false});
}
// Back-compat name used after tour
function focusIntentOnOpen(){ focusFirstEntryOnOpen(); }
focusFirstEntryOnOpen();
// Re-assert after layout (paint / sticky chrome can steal focus)
requestAnimationFrame(()=>requestAnimationFrame(focusFirstEntryOnOpen));

// A shift crosses 12:00 or 18:00 with the page still open - re-render on the boundary
// so the greeting never goes stale mid-session.
let lastGreet=greeting();
setInterval(()=>{ const g=greeting(); if(g!==lastGreet){ lastGreet=g; render(); } }, 30000);

// ---- at load: the tour wiring and its first-run invite, and the sample mark --------
wireTourUi();
syncSampleMark();
maybeShowTourInvite();
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
eOfferCatalog();
/* The sibling channel is synchronous and free, so it goes first and this only speaks if it
   left the screen clear. */
setTimeout(()=>{ try{ eCheckWatchedFile(false); }catch(e){} }, 900);

/* ---- Macro search is a drill-down, not a resting state: entered for one lookup, it
   stays until something leaves it - and the first act after stepping away is almost
   always a NEW chat, which begins with an intent. So: return to the window with the
   query box untouched, and the box goes back to intents on its own. Three guards, each
   the difference between helpful and infuriating: only when the query is EMPTY (nothing
   typed is ever discarded); only after a real absence (30s - alt-tabbing to read a
   booking leaves the mode alone); only from macro mode. blur/focus, not
   visibilitychange: switching to the chat window does not always hide the tab. */



/* ---- Star pop. The moment a favourite turns ON, its own star blooms from the button and
   fades - _STAR, the same path the button draws, so the two can never drift apart. Wired on
   the CAPTURE phase: the button must be read before the app's own click handler toggles the
   state and re-renders the row, after which the node may already be replaced. The bloom is a
   fixed overlay for the same reason - it outlives the re-render. Turning a favourite OFF is
   not a celebration, and reduced motion never spawns one.
   MATCH THE STAR, DO NOT EXCLUDE ITS SIBLINGS: edit, hide and unhide all wear .rail-fav for
   the shared geometry, so a blacklist grows a bug every time one is added. data-fav-intent
   is carried by the star alone. */
document.addEventListener("click",e=>{
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const b=e.target&&e.target.closest&&e.target.closest(".star-btn,.rail-fav[data-fav-intent]");
  if(!b||b.classList.contains("on")) return;
  const r=b.getBoundingClientRect();
  const d=document.createElement("div");
  d.className="e-star-pop";
  d.style.left=(r.left+r.width/2)+"px";
  d.style.top=(r.top+r.height/2)+"px";
  d.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true">'+_STAR+'</svg>';
  document.body.appendChild(d);
  d.addEventListener("animationend",()=>d.remove());
  setTimeout(()=>{ if(d.parentNode) d.remove(); },800);
},true);

/* ---- Eye pop: a hide closes an eye, a return opens one, in the buttons' own strokes and the
   button's colour, spawned like the star pop; a card's hide button says which way by its class,
   danger while the card is visible. READ ON THE NEAR SIDE, DRAWN AFTER THE PAINT: rect and
   colour are taken on the capture phase, before the row is replaced; the overlay is added two
   frames on, once the rebuilt list has painted, because the lid is a path animation on the main
   thread and Firefox drops its first frames under that paint. The star rides the compositor. */
let eEyePopN=0;
document.addEventListener("click",e=>{
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const b=e.target&&e.target.closest&&e.target.closest('[data-act="hide"],[data-hide-intent],[data-show-intent],[data-hide-card],[data-show-card]');
  if(!b) return;
  const opening=b.hasAttribute("data-show-intent")||b.hasAttribute("data-show-card")
    ||(b.getAttribute("data-act")==="hide" && !b.classList.contains("danger"));
  const r=b.getBoundingClientRect();
  const colour=getComputedStyle(b).color;
  /* The button's own small eye would show through the pop's open one and read as a second
     pupil under the lid, so it steps aside while the pop plays. The row usually re-renders
     the button before the pop ends; if this one survives, it comes back. */
  const ic=b.querySelector("svg"); if(ic) ic.style.visibility="hidden";
  requestAnimationFrame(()=>requestAnimationFrame(()=>{   // after the rebuilt frame has painted - see animateTabInsert
    const d=document.createElement("div");
    d.className="e-eye-pop"+(opening?" open":"");
    d.style.color=colour;
    d.style.left=(r.left+r.width/2)+"px";
    d.style.top=(r.top+r.height/2)+"px";
    const clip="eEyeClip"+(++eEyePopN);   // one clip per pop: two pops can be in flight
    d.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><clipPath id="'+clip+'"><path class="lid"/></clipPath>'
      +'<circle class="pupil" cx="10" cy="10" r="2.5" clip-path="url(#'+clip+')"/>'
      +'<path class="lid"/><g class="lashes"><path d="M3.5 12.07l-1.4 1.9"/><path d="M7.2 13.64l-0.7 2.3"/><path d="M12.8 13.64l0.7 2.3"/><path d="M16.5 12.07l1.4 1.9"/></g></svg>';
    document.body.appendChild(d);
    const done=()=>{ d.remove(); if(ic&&ic.isConnected) ic.style.visibility=""; };
    d.querySelector("svg").addEventListener("animationend",e=>{ if(e.target===e.currentTarget) done(); });
    setTimeout(()=>{ if(d.parentNode) done(); },1000);
  }));
},true);

/* ---- Copy wash. Clicking a macro washes THAT block success-green while the toast below
   carries the words - the WHERE at the fingertip, the WHAT where it always was. Click only:
   a keyboard copy already holds the selection ring on the very block it copies. The
   pointerdown distance check keeps a drag-reorder quiet - the app suppresses the copy on a
   drag, so the wash must not fire either. Bubble phase: the app's own handler goes first. */
let eWashDownX=0,eWashDownY=0;
document.addEventListener("pointerdown",e=>{ eWashDownX=e.clientX; eWashDownY=e.clientY; },true);
function eWashOver(el){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r=el.getBoundingClientRect();
  const d=document.createElement("div");
  d.className="e-copy-wash";
  d.style.left=r.left+"px"; d.style.top=r.top+"px";
  d.style.width=r.width+"px"; d.style.height=r.height+"px";
  document.body.appendChild(d);
  d.addEventListener("animationend",()=>d.remove());
  setTimeout(()=>{ if(d.parentNode) d.remove(); },900);
}
document.addEventListener("click",e=>{
  if(Math.hypot(e.clientX-eWashDownX,e.clientY-eWashDownY)>5) return;
  const t=e.target&&e.target.closest&&e.target.closest(".txt");
  if(!t) return;
  eWashOver(t);
  const card=t.closest(".card[data-id]");
  if(card) eNoteRecent(card.dataset.id);
});
/* Keyboard copies answer the same way - copyEntrySel calls this after a successful copy, so
   Enter (or any rebound copy key) washes the selected block exactly like a click. */
function eCopyFeedback(id){
  const sel=document.querySelector(".txt.sel");
  if(sel) eWashOver(sel);
  eNoteRecent(id);
}

/* ---- Recency trace. The last three copied cards keep a short green tick (CSS above),
   newest strongest. Session-only ON PURPOSE - it is a trace of this shift, not a record,
   so it lives in a variable and dies with the tab. render() re-applies the marks.
   `var`, not `let`, plus the guard below: boot's FIRST render() calls eApplyRecency
   before this line has executed. A hoisted function meeting a `let` in its dead zone threw,
   the boot guard read the throw as a corrupt-state crash and cleared storage, and Etiuda
   ate its own catalog acceptance in an accept-reload-offer loop. */
var eRecentIds=[];
function eApplyRecency(){
  if(!eRecentIds) return;   /* boot-order guard - see above */
  document.querySelectorAll("#list .card[data-erec]").forEach(c=>c.removeAttribute("data-erec"));
  eRecentIds.forEach((id,i)=>{
    const c=list.querySelector('.card[data-id="'+cssEsc(id)+'"]');
    if(c) c.setAttribute("data-erec",String(i+1));
  });
}
function eNoteRecent(id){
  if(!id) return;
  eRecentIds=eRecentIds.filter(x=>x!==id);
  eRecentIds.unshift(id);
  eRecentIds=eRecentIds.slice(0,3);
  eApplyRecency();
}


/* ---- ONE RESIZE LISTENER ------------------------------------------------------------------
   One listener, one place, a stated order: cheap flags first, text swaps, then the
   rAF-debounced geometry, then things that read finished layout. Every member is
   idempotent or self-debouncing, so the cost per event is what it always was. The old
   matchMedia(max-width:720px) change listener is folded in too: resize fires on every
   threshold crossing, and unlike matchMedia it also fires in emulated viewports. */
addEventListener("resize",()=>{
  syncHeaderElevation();                                // cheap flag, no layout read
  syncShortcutTitles();   // seg fold retitles EN/PL
  schedulePillsCollapse();                              // rAF: pill bar two-line measure
  scheduleRailGeometry();                               // rAF: rail top + dock threshold
  syncFactsGeometry();                                  // facts panel max size
  fitTabLabels();  // tabs: names re-fit, cap breathes
  if(tourActive()) scheduleTourPlace();                 // spotlight follows its target
  mtRefreshLive();                                      // maintenance readings, while open
  scheduleCutScan();                                    // what fits changed, so what is cut did
},{passive:true});

/* Last line of the app, on purpose: reaching it is the definition of a successful boot.
   The guard at the top of the file waits for this and offers a way out if it never comes. */
try{ if(typeof E_BOOT_OK==="function") E_BOOT_OK(); }catch(e){}
// After boot, so the warning sits over a working Etiuda rather than an empty frame.
try{ showPackMigrationWarning(); }catch(e){}
/* Back where you were. Consumed on read so a later refresh does not keep reopening it, and
   never over the catalog offer: being asked whether to load a file is the more urgent
   question, and it is the one that appears after an eject. */
try{
  if(ssGet(MG_REOPEN)){
    ssDel(MG_REOPEN);
    if(!document.getElementById("eCatalogModal")) openManage();
  }
}catch(e){}
