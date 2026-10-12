/* THE OBJECT MENUS (desk-core-no-context-menu and desk-chrome-context-menus, 2026-10-12). A right-click on a reply, an
   intent, a category pill, a group's heading or a conversation tab opens that object's own menu, and so do the Menu key
   and Shift+F10, which the browser turns into the same event on whatever has the focus, or here on the marked reply.
   Every row presses the object's own control, with the modifier its gesture needs, or calls the route its key calls, so
   a row cannot mean something the control does not; and a gesture that only Ctrl or Shift could reach gets a name.
   Fields and selected text keep the shell's edit menu, and anything else keeps the page's silence. */
import { list } from "./dom.js";
import { cssEsc } from "./css-esc.js";
import { t } from "./ui-lang.js";
import { CONTENT_LANGS, nextContentLang } from "./content-model.js";
import { cardLang, findCard } from "./card-model.js";
import { copyCardPart } from "./copy-entry.js";
import { setEntrySel } from "./mark.js";
import { entrySel, intentIdxs, cats } from "./app-state.js";
import { isCollapsed } from "./collapse.js";
import { animateFoldAll } from "./list-pointer.js";
import { tabs, addTab, closeTabById, closeOtherTabs, reopenClosedTab, closedTabCount } from "./tabs.js";

let ctxEl=null, ctxBack=null;

/* A click as the control's own gesture makes it, modifiers included: the handlers read e.ctrlKey and e.shiftKey off the
   click itself. */
function press(el, mods){
  if(!el) return;
  const o=Object.assign({ bubbles:true, cancelable:true }, mods||{});
  el.dispatchEvent(new MouseEvent("click", o));
}
const label=(el, fallback)=>(el && el.getAttribute("aria-label")) || fallback;

/* The rows for what the event landed on, or null where nothing here has a menu. A row is {label, act}, or "-". */
function ctxRowsFor(target){
  if(!target || !target.closest) return null;
  const card=target.closest("#list .card[data-id]");
  if(card) return replyRows(card, target);
  const sep=target.closest("#list .list-sep");
  if(sep) return headingRows(sep);
  const row=target.closest("#intentRail .rail-item[data-si]");
  if(row) return intentRows(row);
  const pill=target.closest("#pills .pill[data-k]");
  if(pill) return pill.dataset.k ? pillRows(pill) : null;
  const tab=target.closest("#tabsBar .tab[data-tid]");
  if(tab) return tabRows(tab);
  return null;
}

function replyRows(card, target){
  const id=card.dataset.id, m=findCard(id);
  if(!m) return null;
  const block=target.closest(".txt[data-v]");
  const vi=block ? +block.dataset.v : (entrySel && entrySel.id===id ? (entrySel.vi|0) : 0);
  const anchor=block || card.querySelector('.txt[data-v="'+vi+'"]') || card;
  const rows=[{ label:t("Copy"), act:()=>{ setEntrySel(id, vi); copyCardPart(id, vi, anchor, false); } }];
  if(CONTENT_LANGS.length>1){
    const other=nextContentLang(cardLang(m));
    rows.push({ label:t("Copy the {LANG} version").replace("{LANG}",String(other).toUpperCase()),
      act:()=>{ setEntrySel(id, vi); copyCardPart(id, vi, anchor, true); } });
  }
  const btn=a=>card.querySelector('.cacts [data-act="'+a+'"]');
  const note=btn("note"), edit=btn("edit"), fav=btn("fav"), hide=btn("hide");
  rows.push("-");
  if(edit) rows.push({ label:label(edit, t("Edit this card")), act:()=>press(edit) });
  if(fav) rows.push({ label:label(fav, t("Add to Favourites")), act:()=>press(fav) });
  if(note) rows.push({ label:t("Show the note"), act:()=>press(note) });
  if(hide) rows.push({ label:t(card.classList.contains("is-hidden") ? "Show this card again" : "Put this card away"), act:()=>press(hide) });
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

function intentRows(row){
  const si=+row.dataset.si, picked=intentIdxs.indexOf(si)>-1;
  const rows=[{ label:t(picked ? "Drop this intent" : "Pick this intent"), act:()=>press(row) }];
  if(!picked && intentIdxs.length) rows.push({ label:t("Pick it with the others"), act:()=>press(row, { ctrlKey:true }) });
  const show=row.querySelector("[data-show-intent]");
  rows.push("-");
  if(show){ rows.push({ label:label(show, t("Show this intent again")), act:()=>press(show) }); return rows; }
  const fav=row.querySelector("[data-fav-intent]"), edit=row.querySelector("[data-edit-intent]"), hide=row.querySelector("[data-hide-intent]");
  if(fav) rows.push({ label:label(fav, t("Add to Favourites")), act:()=>press(fav) });
  if(edit) rows.push({ label:label(edit, t("Edit this intent")), act:()=>press(edit, { ctrlKey:true }) });
  if(hide) rows.push({ label:label(hide, t("Hide this intent")), act:()=>press(hide, { shiftKey:true }) });
  return rows;
}

function pillRows(pill){
  const k=pill.dataset.k, only=cats.length===1 && cats[0]===k, inFilter=cats.indexOf(k)>-1;
  const rows=[{ label:t(only ? "Show every category" : "Show only this category"), act:()=>press(pill) }];
  if(cats.length && !only) rows.push({ label:t(inFilter ? "Take it out of the filter" : "Add it to the filter"), act:()=>press(pill, { ctrlKey:true }) });
  const ed=pill.querySelector("[data-editcat]");
  if(ed){ rows.push("-"); rows.push({ label:t("Edit this category"), act:()=>press(ed) }); }
  return rows;
}

function tabRows(tab){
  const id=tab.dataset.tid;
  const rows=[{ label:t("New tab"), act:()=>addTab() }, "-", { label:t("Close this tab"), act:()=>closeTabById(id) }];
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
function openCtxMenu(rows, x, y, byKey){
  closeCtxMenu(false);
  const a=document.activeElement;
  ctxBack=(a && a!==document.body) ? a : null;
  const m=document.createElement("div");
  m.className="menu e-ctx";
  m.setAttribute("role","menu");
  m.tabIndex=-1;
  const items=[];
  rows.forEach((r,i)=>{
    if(r==="-"){ if(i && i<rows.length-1 && rows[i-1]!=="-"){ const s=document.createElement("div"); s.className="menu-sep"; m.appendChild(s); } return; }
    const b=document.createElement("button");
    b.type="button";
    b.setAttribute("role","menuitem");
    b.textContent=r.label;
    b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); closeCtxMenu(false); r.act(); };
    m.appendChild(b);
    items.push(b);
  });
  m.addEventListener("keydown",e=>{
    const n=items.length, at=items.indexOf(document.activeElement);
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closeCtxMenu(true); return; }
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
    if(target && target.closest && target.closest("input,textarea,select,[contenteditable='true'],[contenteditable='']")) return;
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
    openCtxMenu(rows, x, y, byKey);
  });
  addEventListener("pointerdown",e=>{ if(ctxEl && !ctxEl.contains(e.target)) closeCtxMenu(false); }, true);
  addEventListener("blur",()=>closeCtxMenu(false));
  addEventListener("resize",()=>closeCtxMenu(false));
  addEventListener("wheel",e=>{ if(ctxEl && !ctxEl.contains(e.target)) closeCtxMenu(false); }, { passive:true, capture:true });
}

export {
  wireContextMenus,
  ctxRowsFor,
  openCtxMenu,
  closeCtxMenu,
  ctxMenuOpen
};
