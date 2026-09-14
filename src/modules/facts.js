import { FACTS } from "./stock.js";
import { lsGet, lsSet } from "./storage.js";
import { t } from "./ui-lang.js";
import { pack } from "./pack.js";
import { esc } from "./esc.js";

// Quick facts: editable personal text (pack.facts); default is built-in FACTS.
// View mode: URL-like tokens are one-click copy (display without https://, copy with).
function getFactsText(){
  if(pack && typeof pack.facts==="string") return pack.facts;
  return FACTS;
}
function factsIsCustom(){
  return !!(pack && typeof pack.facts==="string" && pack.facts!==FACTS);
}
function renderFacts(){
  const el=$("#facts");
  if(!el) return;
  const s=getFactsText();
  // Host + optional path (no scheme). Avoid short false positives like "e.g."
  const re=/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,})(?:\/[^\s]*)?/gi;
  let html="", last=0, m;
  while((m=re.exec(s))){
    const raw=m[0];
    // Skip "fee-like" leftovers if any; require a real TLD segment of letters only
    if(!/\.[a-z]{2,}(?:\/|$)/i.test(raw)) continue;
    /* Filenames are not links: "etiuda-catalog.js" parses as host + TLD, and the sample
       facts mention filenames - they rendered as copyable https:// phantoms. A known file
       extension with no path after it is a file somebody typed, not a site. */
    if(!/\//.test(raw) &&
       /\.(?:m?jsx?|json|html?|css|txt|md|pdf|docx?|xlsx?|pptx?|csv|xml|ya?ml|ini|log|zip|rar|7z|exe|msi|bat|cmd|ps1|png|jpe?g|gif|svg|webp|ico|mp[34]|wav)$/i.test(raw)) continue;
    const full=/^https?:\/\//i.test(raw) ? raw : "https://"+raw;
    html+=esc(s.slice(last,m.index));
    html+='<span class="fact-link" role="button" tabindex="0" data-copy="'+esc(full)+'" title="'+esc(t("Click to copy full URL"))+'">'+esc(raw)+'</span>';
    last=m.index+raw.length;
  }
  html+=esc(s.slice(last));
  el.innerHTML=html;
}
function setFactsEditMode(on){
  const panel=$("#factsPanel");
  const editBtn=$("#factsEditBtn"), saveBtn=$("#factsSaveBtn"), cancelBtn=$("#factsCancelBtn"), resetBtn=$("#factsResetBtn");
  if(panel) panel.classList.toggle("editing", !!on);
  if(editBtn) editBtn.hidden=!!on;
  if(saveBtn) saveBtn.hidden=!on;
  if(cancelBtn) cancelBtn.hidden=!on;
  if(resetBtn) resetBtn.hidden=!on;
}
/* AN INTERRUPTED EDIT IS KEPT, NOT DROPPED. Cancel and Esc SAY discard, and the draft
   goes; closing the panel does not mean it, so the text is kept in memory and the panel
   reopens straight into edit. Nothing touches storage - Save remains the only commit. */
let factsDraft=null;
function exitFactsEdit(save,discard){
  const panel=$("#factsPanel");
  if(!panel||!panel.classList.contains("editing")) return;
  const ta=$("#factsEdit");
  if(save){
    const next=ta?ta.value:getFactsText();
    if(next===FACTS) pack.facts=null;
    else pack.facts=next;
    savePack();
    renderFacts();
    factsDraft=null;
    toast(factsIsCustom()?"Quick facts saved":"Quick facts match built-in default");
  }else if(discard){
    factsDraft=null;
  }else{
    // Interrupted: remember it only if it actually differs from what is stored.
    const cur=ta?ta.value:null;
    factsDraft=(cur!=null && cur!==getFactsText()) ? cur : null;
  }
  setFactsEditMode(false);
}
function enterFactsEdit(){
  const ta=$("#factsEdit");
  if(!ta) return;
  // A draft only exists when a previous edit was interrupted rather than cancelled.
  ta.value=(factsDraft!=null) ? factsDraft : getFactsText();
  setFactsEditMode(true);
  try{ ta.focus(); ta.setSelectionRange(0,0); }catch(_){ try{ ta.focus(); }catch(__){} }
}
function wireFactsCopy(){
  const el=$("#facts");
  if(!el || el._factsCopyWired) return;
  el._factsCopyWired=1;
  el.addEventListener("click",e=>{
    const a=e.target.closest(".fact-link");
    if(!a) return;
    e.preventDefault();
    copy(a.getAttribute("data-copy")||a.textContent, "Link copied");
  });
  el.addEventListener("keydown",e=>{
    if(e.key!=="Enter" && e.key!==" ") return;
    const a=e.target.closest(".fact-link");
    if(!a) return;
    e.preventDefault();
    copy(a.getAttribute("data-copy")||a.textContent, "Link copied");
  });
}
function wireFactsEditor(){
  const editBtn=$("#factsEditBtn"), saveBtn=$("#factsSaveBtn"), cancelBtn=$("#factsCancelBtn"), resetBtn=$("#factsResetBtn");
  const ta=$("#factsEdit");
  if(editBtn) editBtn.onclick=e=>{ e.stopPropagation(); enterFactsEdit(); };
  if(saveBtn) saveBtn.onclick=e=>{ e.stopPropagation(); exitFactsEdit(true); };
  // Cancel MEANS discard - the draft goes with it. See exitFactsEdit.
  if(cancelBtn) cancelBtn.onclick=e=>{ e.stopPropagation(); exitFactsEdit(false,true); };
  if(resetBtn) resetBtn.onclick=e=>{
    e.stopPropagation();
    if(!ask("Restore built-in quick facts? Your edited text will be discarded.")) return;
    pack.facts=null;
    savePack();
    factsDraft=null;                 // the confirm said discarded; mean it
    if(ta) ta.value=FACTS;
    renderFacts();
    setFactsEditMode(false);
    toast("Built-in quick facts restored");
  };
  if(ta){
    ta.addEventListener("keydown",e=>{
      /* A plain printable key is text here, never a shortcut: this is the one prose field
         outside a dialog, and the language key is a slash. */
      if(!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length===1){ e.stopPropagation(); return; }
      // Ctrl/Cmd+S saves; Esc cancels edit (does not clear intents)
      if((e.ctrlKey||e.metaKey) && (e.key==="s"||e.key==="S")){
        e.preventDefault(); e.stopPropagation();
        exitFactsEdit(true);
        return;
      }
      if(e.key==="Escape"){
        e.preventDefault(); e.stopPropagation();
        exitFactsEdit(false,true);   // Esc is the keyboard's Cancel: an explicit discard
      }
    });
  }
}
/* The panel's size belongs to whoever dragged it, remembered between sessions. Stored
   as the inline width/height the browser's own handle writes - nothing to parse, and the
   CSS clamps do the rest: a tall-monitor save is capped by max-height on a laptop, which
   is why nothing is clamped here. Global, like the theme: a preference about this
   browser, not about a catalog's content. */
/* Measured from ITS OWN top - the facts button's bottom, not the header's: the panel
   overlays the pill bar, and anchoring to the header threw away that many pill rows of
   room. Top does not depend on height, so measuring the panel to size the panel is safe. */
function syncFactsGeometry(){
  const p=$("#factsPanel");
  if(!p||p.hidden) return;
  const r=p.getBoundingClientRect();
  /* Both edges the panel is pinned by, and neither is the window's. `top` is the button's bottom,
     `right` is the button's right - and because the panel is anchored at those, neither moves
     when its width or height changes, so measuring the panel to size the panel is safe. */
  const availH=Math.max(140, Math.round(window.innerHeight - r.top - 14));
  const availW=Math.max(320, Math.round(r.right - 14));
  const root=document.documentElement;
  root.style.setProperty("--facts-max", availH+"px");
  root.style.setProperty("--facts-maxw", availW+"px");
}
function restoreFactsSize(p){
  if(!p) return;
  const w=lsGet("pbFactsW"), h=lsGet("pbFactsH");
  if(w) p.style.width=w;
  if(h) p.style.height=h;
}
let factsSizeTimer=0;
function rememberFactsSize(p){
  if(!p) return;
  clearTimeout(factsSizeTimer);
  // Debounced: a ResizeObserver fires every frame of a drag, and none of those are the answer.
  factsSizeTimer=setTimeout(()=>{
    if(p.style.width) lsSet("pbFactsW", p.style.width);
    if(p.style.height) lsSet("pbFactsH", p.style.height);
  },180);
}
function factsPanelOpen(){
  const p=$("#factsPanel");
  return p && !p.hidden;
}
function closeFactsPanel(){
  const p=$("#factsPanel"), b=$("#factsBtn");
  exitFactsEdit(false);
  if(p) p.hidden=true;
  if(b){ b.classList.remove("on"); b.setAttribute("aria-expanded","false"); }
}
function openFactsPanel(){
  const p=$("#factsPanel"), b=$("#factsBtn");
  if(!p||!b) return;
  closeSettingsMenu();
  exitFactsEdit(false);
  renderFacts();
  restoreFactsSize(p);
  p.hidden=false;
  syncFactsGeometry();          // after it is visible - a hidden element has no rect to measure
  b.classList.add("on");
  b.setAttribute("aria-expanded","true");
  /* An edit that was interrupted rather than cancelled resumes where it stopped, so a stray
     click costs a reopen instead of the text. See exitFactsEdit. */
  if(typeof factsDraft!=="undefined" && factsDraft!=null){
    enterFactsEdit();
  }
}
function toggleFactsPanel(){
  if(factsPanelOpen()) closeFactsPanel(); else openFactsPanel();
}
function wireFactsPanel(){
  /* Watched rather than hooked to pointerup: the resize handle is the browser's, so
     there is no event of our own, and a pointerup can land anywhere once the drag leaves
     the corner. Guarded on the panel being open, so the observer's first callback - fired
     on attach - does not write the size of a hidden element. */
  if(typeof ResizeObserver==="function"){
    const fp=$("#factsPanel");
    if(fp) new ResizeObserver(()=>{ if(!fp.hidden) rememberFactsSize(fp); }).observe(fp);
  }
  $("#factsBtn").onclick=e=>{
    e.stopPropagation();
    toggleFactsPanel();
  };
}

export {
  syncFactsGeometry,
  factsPanelOpen,
  closeFactsPanel,
  toggleFactsPanel,
  renderFacts,
  wireFactsCopy,
  wireFactsEditor,
  wireFactsPanel
};
