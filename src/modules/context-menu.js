/* THE OBJECT MENUS (desk-core-no-context-menu and desk-chrome-context-menus, 2026-10-12). A right-click on a reply, an
   intent, a category pill, a group's heading or a conversation tab opens that object's own menu, and so do the Menu key
   and Shift+F10, which the browser turns into the same event on whatever has the focus, or here on the marked reply.
   Every row presses the object's own control, with the modifier its gesture needs, or calls the route its key calls, so
   a row cannot mean something the control does not; and a gesture that only Ctrl or Shift could reach gets a name.
   Fields and selected text keep the shell's edit menu, and anything else keeps the page's silence. */
import { list } from "./dom.js";
import { cssEsc } from "./css-esc.js";
import { esc } from "./esc.js";
import { t, toast } from "./ui-lang.js";
import { CONTENT_LANGS, nextContentLang } from "./content-model.js";
import { cardLang, findCard } from "./card-model.js";
import { copyCardPart } from "./copy-entry.js";
import { setEntrySel } from "./mark.js";
import { entrySel, intentIdxs, cats } from "./app-state.js";
import { isCollapsed } from "./collapse.js";
import { animateFoldAll } from "./list-pointer.js";
import { tabs, addTab, closeTabById, closeOtherTabs, reopenClosedTab, closedTabCount, beginTabRename, clearTabRename } from "./tabs.js";
import { edOpenBeside } from "./dialog.js";
import { intentIdAt, intentIdxOfId } from "./intent-id.js";
import { hooks } from "./hooks.js";
import { pickCategory } from "./pills-bar.js";
import { isFavourite, pack } from "./pack.js";
import { intentPickedLine } from "./intent-text.js";
import { screenOn } from "./screen-tabs.js";
import { toggleFavourite } from "./favourites.js";

let ctxEl=null, ctxBack=null;

/* A click as the control's own gesture makes it, modifiers included: the handlers read e.ctrlKey and e.shiftKey off the
   click itself. */
function press(el, mods){
  if(!el) return;
  const o=Object.assign({ bubbles:true, cancelable:true }, mods||{});
  el.dispatchEvent(new MouseEvent("click", o));
}
const label=(el, fallback)=>(el && el.getAttribute("aria-label")) || fallback;
/* A ROW DOES WHAT ITS CONTROL DOES: it presses the desk's own control where the desk draws it, and otherwise calls what that
   control calls, so it works with the list filtered, the rail folded away or a pill out of sight. */
function pressOr(el, mods, call){
  return ()=>{ if(el) press(el, mods); else call(); };
}
const deskPill=k=>document.querySelector('#pills .pill[data-k="'+cssEsc(String(k))+'"]');
const deskRail=si=>document.querySelector('#intentRail .rail-item[data-si="'+si+'"]');
const deskCard=id=>list ? list.querySelector('.card[data-id="'+cssEsc(String(id))+'"]') : null;

/* WHAT AN EDITOR LISTS: a category chip, a linked intent, a next reply, each with the menu its own panel gives (the same
   builder, on the desk's own pill, rail row or reply), its edit row opening the editor beside the one in hand (dialog.js,
   edOpenBeside). Where the desk is not showing that thing, the edit row alone. A field keeps the shell's edit menu. */
function besideRows(rows, label, open){
  const act=()=>{ edOpenBeside(); open(); };
  const out=(rows||[]).map(r=>(r && r.key==="F2") ? Object.assign({}, r, {act:act}) : r);
  if(!out.some(r=>r && r.key==="F2")) out.push("-", {label:t(label), key:"F2", act:act});
  return out;
}
function editorRows(target){
  const desk=!screenOn;
  const chip=target.closest(".cat-chip[data-k]");
  if(chip){
    const k=chip.getAttribute("data-k");
    return besideRows(pillRows(k, {desk:desk}), "Edit this category", ()=>hooks.openCategoryEditor(k, true));
  }
  const ir=target.closest("#meIntents label"), inp=ir && ir.querySelector("input");
  const at=inp ? intentIdxOfId(inp.value) : -1;
  if(at>-1) return besideRows(intentRows(at, {desk:desk}), "Edit this intent", ()=>hooks.openIntentEditor(at));
  const nx=target.closest(".nx-row[data-to]");
  if(nx){
    const id=nx.getAttribute("data-to");
    return besideRows(replyRows(id, null, {anchor:nx, note:false}), "Edit this card", ()=>hooks.openCardEditor(id, null, false));
  }
  return null;
}
/* F2 on a focused thing an editor lists does what its menu's row does. */
function ctxEditorAct(el){
  const rows=(el && el.closest && el.closest("#modalCard")) ? editorRows(el) : null;
  const ed=rows && rows.filter(r=>r && r.key==="F2")[0];
  if(!ed) return false;
  ed.act();
  return true;
}
/* The rows for what the event landed on, or null where nothing here has a menu. A row is {label, act}, or "-". */
function ctxRowsFor(target){
  if(!target || !target.closest) return null;
  if(target.closest("#modalCard")) return editorRows(target);
  const card=target.closest("#list .card[data-id]");
  if(card) return replyRows(card.dataset.id, target, {card:card});
  const sep=target.closest("#list .list-sep");
  if(sep) return headingRows(sep);
  const row=target.closest("#intentRail .rail-item[data-si]");
  if(row) return intentRows(+row.dataset.si, {row:row});
  const pill=target.closest("#pills .pill[data-k]");
  if(pill) return pill.dataset.k ? pillRows(pill.dataset.k, {pill:pill}) : null;
  const tab=target.closest("#tabsBar .tab[data-tid]");
  if(tab) return tabRows(tab);
  return null;
}

/* `o.card` is the desk's own reply when the menu was asked on it; inside an editor: `anchor` where the copy shows itself when
   the reply is not drawn, `note:false` to leave out the note, which hangs from the reply in the desk's list. */
function replyRows(id, target, o){
  o=o||{};
  const m=findCard(id);
  if(!m) return null;
  const card=o.card||deskCard(id);
  const block=(card && target && card.contains(target)) ? target.closest(".txt[data-v]") : null;
  const vi=block ? +block.dataset.v : (entrySel && entrySel.id===id ? (entrySel.vi|0) : 0);
  const anchor=block || (card && card.querySelector('.txt[data-v="'+vi+'"]')) || card || o.anchor || null;
  const rows=[{ label:t("Copy"), act:()=>{ setEntrySel(id, vi); copyCardPart(id, vi, anchor, false); } }];
  if(CONTENT_LANGS.length>1){
    const other=nextContentLang(cardLang(m));
    rows.push({ label:t("Copy the {LANG} version").replace("{LANG}",String(other).toUpperCase()),
      act:()=>{ setEntrySel(id, vi); copyCardPart(id, vi, anchor, true); } });
  }
  const btn=a=>card ? card.querySelector('.cacts [data-act="'+a+'"]') : null;
  const note=btn("note"), edit=btn("edit"), fav=btn("fav"), hide=btn("hide");
  rows.push("-");
  rows.push({ label:label(edit, t("Edit this card")), act:pressOr(edit, null, ()=>hooks.openCardEditor(id)), key:"F2" });
  rows.push({ label:label(fav, t(isFavourite(id) ? "Remove from Favourites" : "Add to Favourites")), act:pressOr(fav, null, ()=>toggleFavourite(id)) });
  if(note && o.note!==false) rows.push({ label:t("Show the note"), act:()=>press(note) });
  rows.push({ label:t(m._hidden ? "Show this card again" : "Put this card away"), act:pressOr(hide, null, ()=>hooks.hideCard(id)) });
  return rows;
}

function headingRows(sep){
  const fold=sep.querySelector(".sep-fold[data-fold-key]");
  if(!fold) return null;
  const keys=list ? Array.prototype.map.call(list.querySelectorAll(".sep-fold[data-fold-key]"), b=>b.getAttribute("data-fold-key")) : [];
  const shut=isCollapsed(fold.getAttribute("data-fold-key"));
  const rows=[{ label:t(shut ? "Show these cards" : "Fold this group away"), act:()=>press(fold) }];
  const anyOpen=keys.some(k=>!isCollapsed(k)), anyShut=keys.some(k=>isCollapsed(k));
  if(anyOpen || anyShut) rows.push("-");
  if(anyOpen) rows.push({ label:t("Fold every group"), act:()=>animateFoldAll(true) });
  if(anyShut) rows.push({ label:t("Unfold every group"), act:()=>animateFoldAll(false) });
  return rows;
}

/* `o.row` is the desk's own row when the menu was asked on it; `o.desk:false`: the screen behind is not the desk, so the pick
   rows, which only change what it shows, are left out. */
function intentRows(si, o){
  o=o||{};
  const row=o.row||deskRail(si), id=intentIdAt(si), picked=intentIdxs.indexOf(si)>-1;
  const pick=multi=>()=>{ hooks.pickIntent(si, multi); toast(intentIdxs.length ? intentPickedLine() : t("{INTENT} cleared")); };
  const rows=[];
  if(o.desk!==false){
    rows.push({ label:t(picked ? "Drop this intent" : "Pick this intent"), act:pressOr(row, null, pick(picked)) });
    if(!picked && intentIdxs.length) rows.push({ label:t("Pick it with the others"), act:pressOr(row, { ctrlKey:true }, pick(true)) });
  }
  const slot=s=>row ? row.querySelector(s) : null;
  rows.push("-");
  if(row ? !!slot("[data-show-intent]") : (pack.intentHidden||[]).indexOf(id)>-1){
    rows.push({ label:t("Show this intent again"), act:pressOr(slot("[data-show-intent]"), null, ()=>hooks.setIntentHidden(id, false)) });
    rows.push({ label:t("Edit this intent"), act:()=>hooks.openIntentEditor(si), key:"F2", hidden:true });
    return rows.filter(r=>!(r && r.hidden));
  }
  const fav=slot("[data-fav-intent]"), edit=slot("[data-edit-intent]"), hide=slot("[data-hide-intent]");
  rows.push({ label:label(fav, t((pack.intentFavourites||[]).indexOf(id)>-1 ? "Remove from Favourites" : "Add to Favourites")), act:pressOr(fav, null, ()=>hooks.toggleIntentFavourite(id)) });
  rows.push({ label:label(edit, t("Edit this intent")), act:pressOr(edit, { ctrlKey:true }, ()=>hooks.openIntentEditor(si)), key:"F2" });
  rows.push({ label:label(hide, t("Hide this intent")), act:pressOr(hide, { shiftKey:true }, ()=>hooks.setIntentHidden(id, true)) });
  return rows;
}

/* `o.pill` is the desk's own pill when the menu was asked on it; `o.desk:false`: the screen behind is not the desk, so the
   filter rows are left out. */
function pillRows(k, o){
  o=o||{};
  const pill=o.pill||deskPill(k), only=cats.length===1 && cats[0]===k, inFilter=cats.indexOf(k)>-1;
  const rows=[];
  if(o.desk!==false){
    rows.push({ label:t(only ? "Show every category" : "Show only this category"), act:pressOr(pill, null, ()=>pickCategory(k, false)) });
    if(cats.length && !only) rows.push({ label:t(inFilter ? "Take it out of the filter" : "Add it to the filter"), act:pressOr(pill, { ctrlKey:true }, ()=>pickCategory(k, true)) });
  }
  const ed=pill ? pill.querySelector("[data-editcat]") : null;
  rows.push("-");
  rows.push({ label:t("Edit this category"), act:pressOr(ed, null, ()=>hooks.openCategoryEditor(k, true)), key:"F2" });
  return rows;
}

function tabRows(tab){
  const id=tab.dataset.tid;
  const tb=tabs.find(x=>x.id===id);
  const rows=[];
  rows.push({ label:t("Rename tab"), act:()=>beginTabRename(id) });
  if(tb && ((tb.customName && tb.customName.trim()) || (tb.title && tb.title.trim()))){
    rows.push({
      label:t("Use the automatic name"),
      hint:t("Names the tab after the customer's first name, or New chat while there is none."),
      act:()=>clearTabRename(id)
    });
  }
  rows.push("-");
  rows.push({ label:t("New tab"), act:()=>addTab() });
  rows.push("-");
  rows.push({ label:t("Close this tab"), act:()=>closeTabById(id) });
  if(tabs.length>1) rows.push({ label:t("Close the other tabs"), act:()=>closeOtherTabs(id) });
  if(closedTabCount()) rows.push({ label:t("Reopen the last closed tab"), act:()=>reopenClosedTab() });
  return rows;
}

/* ---- the menu itself: the header Menu's look, standing where it was asked for */
function closeCtxMenu(giveBack){
  const el=ctxEl; ctxEl=null;
  if(el && el.parentNode) el.parentNode.removeChild(el);
  const to=ctxBack; ctxBack=null;
  if(giveBack && to && typeof to.focus==="function" && document.contains(to)) try{ to.focus({preventScroll:true}); }catch(_){}
}
function ctxMenuOpen(){ return !!ctxEl; }
function openCtxMenu(rows, x, y, byKey, over){
  closeCtxMenu(false);
  const a=document.activeElement;
  ctxBack=(a && a!==document.body) ? a : null;
  const m=document.createElement("div");
  m.className="menu e-ctx";
  /* Asked for inside an editor, the menu stands above every editor. */
  if(over) m.classList.add("e-ctx-ed");
  m.setAttribute("role","menu");
  m.tabIndex=-1;
  const items=[];
  rows.forEach((r,i)=>{
    if(r==="-"){ if(i && i<rows.length-1 && rows[i-1]!=="-"){ const s=document.createElement("div"); s.className="menu-sep"; m.appendChild(s); } return; }
    const b=document.createElement("button");
    b.type="button";
    b.setAttribute("role","menuitem");
    if(r.hint) b.title=r.hint;
    if(r.key){
      b.innerHTML='<span>'+esc(r.label)+'</span><small>'+esc(r.key)+'</small>';
    } else {
      b.textContent=r.label;
    }
    b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); closeCtxMenu(false); r.act(); };
    m.appendChild(b);
    items.push(b);
  });
  m.addEventListener("keydown",e=>{
    const n=items.length, at=items.indexOf(document.activeElement);
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closeCtxMenu(true); return; }
    /* Ctrl+Tab is the next conversation, not another step of this menu, as a header menu already ignores it. */
    if(e.ctrlKey||e.altKey||e.metaKey) return;
    if(["ArrowDown","ArrowUp","Home","End","Tab"].indexOf(e.key)<0 || !n) return;
    e.preventDefault(); e.stopPropagation();
    const back=e.key==="ArrowUp"||(e.key==="Tab"&&e.shiftKey);
    const to = e.key==="Home" ? 0 : e.key==="End" ? n-1 : ((at<0 ? (back ? 0 : -1) : at)+(back ? -1 : 1)+n)%n;
    items[to].focus();
  });
  document.body.appendChild(m);
  /* Inside the window: a menu asked for near an edge opens towards the room there is. */
  const w=m.offsetWidth||220, h=m.offsetHeight||200;
  const vw=window.innerWidth||1280, vh=window.innerHeight||800;
  m.style.left=Math.max(4, Math.min(x, vw-w-4))+"px";
  m.style.top=Math.max(4, (y+h>vh-4) ? y-h : y)+"px";
  ctxEl=m;
  try{ (byKey && items[0] ? items[0] : m).focus({preventScroll:true}); }catch(_){}
}

function wireContextMenus(){
  document.addEventListener("contextmenu",e=>{
    if(e.defaultPrevented) return;
    let target=e.target;
    /* A linked intent's checkbox is a named thing, not a field. */
    if(target && target.closest && target.closest("input,textarea,select,[contenteditable='true'],[contenteditable='']")
      && !(target.matches && target.matches("#meIntents input[type=checkbox]"))) return;
    const sel=window.getSelection ? window.getSelection() : null;
    if(sel && !sel.isCollapsed && String(sel) && sel.containsNode && sel.containsNode(target,true)) return;
    /* The keyboard's menu with nothing focused is the marked reply's, as Enter's copy is. */
    const byKey=e.button!==2;
    if(byKey && (!target || target===document.body || target===document.documentElement) && entrySel && list){
      target=list.querySelector('.card[data-id="'+cssEsc(String(entrySel.id))+'"] .txt[data-v="'+(entrySel.vi|0)+'"]')||target;
    }
    const rows=ctxRowsFor(target);
    if(!rows) return;
    e.preventDefault();
    let x=e.clientX, y=e.clientY;
    if(byKey && target && target.getBoundingClientRect){ const r=target.getBoundingClientRect(); x=r.left+8; y=r.bottom; }
    openCtxMenu(rows, x, y, byKey, !!(target && target.closest && target.closest("#modal")));
  });
  addEventListener("pointerdown",e=>{ if(ctxEl && !ctxEl.contains(e.target)) closeCtxMenu(false); }, true);
  addEventListener("blur",()=>closeCtxMenu(false));
  addEventListener("resize",()=>closeCtxMenu(false));
  addEventListener("wheel",e=>{ if(ctxEl && !ctxEl.contains(e.target)) closeCtxMenu(false); }, { passive:true, capture:true });
}

export {
  wireContextMenus,
  ctxEditorAct,
  ctxRowsFor,
  openCtxMenu,
  closeCtxMenu,
  ctxMenuOpen
};
