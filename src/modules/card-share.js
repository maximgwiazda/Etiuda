/* SHARING A CARD WITH A NAMED TEAMMATE (board 1013): the card's button, the blue picker bubble,
   refusals, the arriving row at the top of the list, Keep / Later / Decline, and the "from" mark. */
import { teamShareState, onJoinPainted, shareToTeammate, shareInboxList, shareKeepCard, shareDropItem } from "./team-join.js";
import { ICON_SHARE } from "./icons.js";
import { hangBubble } from "./bubble.js";
import { dismissNode, cutLeaves } from "./motion.js";
import { esc } from "./esc.js";
import { cssEsc } from "./css-esc.js";
import { t, toast } from "./ui-lang.js";
import { hooks } from "./hooks.js";
import { pack, savePack } from "./pack.js";
import { CONTENT_LANGS, CATS } from "./content-model.js";
import { cardLang, cardTitle, findCard, parts } from "./card-model.js";
import { movedCardIds } from "./card-order.js";
import { catalogFromV2, catalogToV2, V2_FORMAT, V2_KIND } from "./catalog-v2.js";

let shareOpenId="";
let closeShareOut=null;
let closeShareIn=null;
let inboxItems=[];
let inboxLoadedKey="";
let inboxLoading=false;
let inboxBubOpen=false;
let inboxWaitTimer=0;
let lastCopyAt=0;
const deferredIds=new Set();
const seenInboxIds=new Set();

function shareOfferedNow(){
  return !!teamShareState();
}
function cardIsShareable(m) {
  return !!(m && (m._custom || m._overridden || movedCardIds().has(m.id))); /* plant:share-own-only */
}
function shareSenderName(m){
  if(!m || !m.from || !m.from.desk) return "";
  if(m.fromName) return String(m.fromName);
  const st=teamShareState();
  const mate=st && Array.isArray(st.teammates) ? st.teammates.find(x=>x.id===m.from.desk) : null;
  return (mate && mate.name) ? String(mate.name) : String(m.from.desk);
}
function shareDateText(iso){
  const d=iso ? new Date(iso) : new Date();
  return isNaN(d.getTime()) ? new Date().toLocaleDateString() : d.toLocaleDateString();
}
function shareSig(m){
  const id=String(m&&m.id||"");
  const st=teamShareState();
  const on=st && cardIsShareable(m) ? "s" : "";
  const open=shareOpenId===id ? "+" : "";
  const from=(m && m.from && m.from.desk) ? String(m.from.desk)+":"+shareSenderName(m) : "";
  return on+open+from;
}
function shareButtonHtml(m){
  if(!shareOfferedNow() || !cardIsShareable(m)) return "";
  const w=esc(t("Share with a teammate…"));
  const id=String(m.id||"");
  return '<button type="button" data-act="share" title="'+w+'" aria-label="'+w
    +'" aria-expanded="'+(shareOpenId===id?"true":"false")+'">'+ICON_SHARE+'</button>';
}
function shareFromBadgeHtml(m){
  if(!m || !m.from || !m.from.desk) return "";
  const name=shareSenderName(m), date=shareDateText(m.fromAt || m.changedAt);
  const tip=t("Shared by {NAME} on {DATE}. This copy belongs to this desk, and changes to it stay here.")
    .replace("{NAME}", name).replace("{DATE}", date);
  return '<span class="cbadge from" title="'+esc(tip)+'">'+esc(t("from {NAME}").replace("{NAME}", name))+'</span>';
}
function joinNames(names){
  const list=(names||[]).filter(Boolean);
  if(!list.length) return "";
  if(list.length===1) return list[0];
  if(list.length===2) return list[0]+" "+t("and")+" "+list[1];
  return list.slice(0,-1).join(", ")+" "+t("and")+" "+list[list.length-1];
}
function initialsOf(name){
  const parts=String(name||"").trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return "?";
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}
const cardSel=id=>'#list .card[data-id="'+cssEsc(id)+'"]';
const shareBtnOf=id=>document.querySelector(cardSel(id)+' > .chead .cacts [data-act="share"]');

function closeShareBubbles(back){
  if(closeShareOut) closeShareOut(back?"back":undefined);
  if(closeShareIn) closeShareIn();
}

function wholeRefusalLine(reason){
  if(reason==="too-large") return t("This card is too large to share, so nothing was sent.");
  if(reason==="seat-lapsed") return t("This desk has no current seat, so nothing was sent; sharing works again once it has one.");
  return t("This card could not be sent just now.");
}

function sharePressed(id, fallbackOrigin){
  if(closeShareOut && shareOpenId===id){ closeShareOut("back"); return; }
  if(closeShareOut) closeShareOut();
  if(closeShareIn) closeShareIn();
  const st=teamShareState(), m=findCard(id);
  if(!st || !m || !cardIsShareable(m)) return;
  const mates=(st.teammates||[]).slice();
  const selected=new Set();
  let query="", noteText="", sending=false;
  shareOpenId=id;

  const el=document.createElement("div");
  el.className="bub bub-ask e-share-bub";
  el.setAttribute("role","dialog");
  el.setAttribute("data-side","none");
  el.setAttribute("aria-labelledby","eShareT");

  const renderPicker=()=>{
    const q=query.trim().toLowerCase();
    const shown=q ? mates.filter(x=>x.name.toLowerCase().indexOf(q)>=0) : mates;
    const rowsHtml=shown.map(mate=>{
      const on=selected.has(mate.id);
      return '<label class="e-share-row'+(on?" on":"")+'" data-mate="'+esc(mate.id)+'">'
        +'<input type="checkbox"'+(on?" checked":"")+'>'
        +'<span class="e-share-av" aria-hidden="true">'+esc(initialsOf(mate.name))+'</span>'
        +'<span class="e-share-name">'+esc(mate.name)+'</span></label>';
    }).join("");
    el.innerHTML='<h3 id="eShareT">'+esc(t("Share this card"))+'</h3>'
      +'<p class="e-share-sub">'+esc(t("Each person chosen gets a copy to keep or decline; this card stays as it is."))+'</p>'
      +'<input type="text" class="e-share-find" value="'+esc(query)+'" placeholder="'+esc(t("Find a teammate"))+'" aria-label="'+esc(t("Find a teammate"))+'" spellcheck="false" autocomplete="off">'
      +'<div class="e-share-list" role="group" aria-label="'+esc(t("Find a teammate"))+'">'+rowsHtml+'</div>'
      +'<input type="text" class="e-share-note" value="'+esc(noteText)+'" placeholder="'+esc(t("Add a line for them (optional)"))+'" aria-label="'+esc(t("Add a line for them (optional)"))+'" spellcheck="false" autocomplete="off">'
      +'<p class="e-share-why" role="alert" hidden></p>'
      +'<div class="tour-actions">'
      +'<button type="button" class="btn" data-share="cancel">'+esc(t("Cancel"))+'</button>'
      +'<button type="button" class="btn primary" data-share="send"'+(selected.size===0||sending?" disabled":"")+'>'+esc(t("Send ({N})").replace("{N}", String(selected.size)))+'</button>'
      +'</div>';
    wirePickerEvents();
  };

  const renderRefusals=(sentNames, refusedList)=>{
    const head=sentNames.length ? t("Sent to {NAMES}").replace("{NAMES}", joinNames(sentNames)) : t("Share this card");
    const body=refusedList.map(r=>{
      const line=r.reason==="recipient-full"
        ? t("{NAME} already has too many cards waiting, so this one was not sent; it can be sent again once some of them are kept or declined.").replace("{NAME}", r.name)
        : t("{NAME} is no longer on the team, so the card was not sent there.").replace("{NAME}", r.name);
      const tag=r.reason==="recipient-full" ? t("too many waiting") : t("not on the team");
      return '<p class="e-share-rline">'+esc(line)+'</p>'
        +'<div class="e-share-row dim"><span class="e-share-av" aria-hidden="true">'+esc(initialsOf(r.name))+'</span>'
        +'<span class="e-share-name">'+esc(r.name)+'</span>'
        +'<span class="e-share-tag">'+esc(tag)+'</span></div>';
    }).join("");
    el.innerHTML='<h3 id="eShareT">'+esc(head)+'</h3>'+body
      +'<div class="tour-actions"><button type="button" class="btn primary" data-share="done">'+esc(t("Done"))+'</button></div>';
    const done=el.querySelector('[data-share="done"]');
    if(done){
      done.onclick=()=>close("back");
      try{ done.focus({preventScroll:true}); }catch(e){}
    }
    hangBubble(el, originFn, {width:360});
  };

  const originFn=()=>shareBtnOf(id) || fallbackOrigin || document.querySelector(cardSel(id));
  const outside=e=>{
    const b=shareBtnOf(id);
    if(!el.contains(e.target) && !(b && b.contains(e.target))) close();
  };
  const close=how=>{
    if(closeShareOut!==close) return;
    closeShareOut=null;
    const back=how==="back" || (!how && el.contains(document.activeElement));
    document.removeEventListener("pointerdown", outside, true);
    dismissNode(el);
    if(shareOpenId===id) shareOpenId="";
    hooks.render();
    const to=back && shareBtnOf(id);
    if(to) try{ to.focus({preventScroll:true}); }catch(e){}
  };

  const wirePickerEvents=()=>{
    const findEl=el.querySelector(".e-share-find");
    const noteEl=el.querySelector(".e-share-note");
    const listEl=el.querySelector(".e-share-list");
    const whyEl=el.querySelector(".e-share-why");
    const sendBtn=el.querySelector('[data-share="send"]');
    const cancelBtn=el.querySelector('[data-share="cancel"]');
    const syncSend=()=>{
      if(!sendBtn) return;
      sendBtn.disabled=(selected.size===0 || sending);
      sendBtn.textContent=t("Send ({N})").replace("{N}", String(selected.size));
    };
    if(findEl){
      findEl.oninput=()=>{
        query=findEl.value;
        const pos=findEl.selectionStart;
        renderPicker();
        const f2=el.querySelector(".e-share-find");
        if(f2){ try{ f2.focus({preventScroll:true}); f2.setSelectionRange(pos, pos); }catch(e){} }
      };
    }
    if(noteEl){
      noteEl.oninput=()=>{
        noteText=noteEl.value;
        if(whyEl){ whyEl.hidden=true; whyEl.textContent=""; }
      };
    }
    if(listEl){
      listEl.querySelectorAll(".e-share-row").forEach(row=>{
        const cb=row.querySelector('input[type="checkbox"]');
        const mid=row.getAttribute("data-mate")||"";
        if(!cb) return;
        cb.onchange=()=>{
          if(cb.checked) selected.add(mid); else selected.delete(mid);
          row.classList.toggle("on", cb.checked);
          syncSend();
        };
      });
    }
    if(cancelBtn) cancelBtn.onclick=()=>close("back");
    if(sendBtn) sendBtn.onclick=async ()=>{
      if(sending || selected.size===0) return;
      const cur=hooks.currentCatalog({asIs:true});
      const v2Cur=catalogToV2(cur);
      const v2Card=v2Cur && Array.isArray(v2Cur.cards) ? v2Cur.cards.find(c=>c.id===id) : null;
      if(!v2Card) return;
      const cardJson=JSON.stringify(v2Card);
      const chosen=mates.filter(x=>selected.has(x.id));
      sending=true;
      syncSend();
      const sentNames=[], refusedList=[];
      let wholeWhy="";
      for(const mate of chosen){
        const r=await shareToTeammate(mate.id, cardJson, noteText);
        if(r && r.ok){ sentNames.push(mate.name); continue; }
        const why=(r && r.reason) || "failed";
        if((why==="too-large" || why==="seat-lapsed") && sentNames.length===0 && refusedList.length===0){
          wholeWhy=why;
          break;
        }
        if(why==="not-on-team" || why==="recipient-full"){
          refusedList.push({id:mate.id, name:mate.name, reason:why});
        } else {
          wholeWhy=why;
          break;
        }
      }
      sending=false;
      if(closeShareOut!==close) return;
      if(wholeWhy){
        syncSend();
        if(whyEl){ whyEl.textContent=wholeRefusalLine(wholeWhy); whyEl.hidden=false; }
        return;
      }
      if(refusedList.length===0){
        close("back");
        toast(t("Shared with {NAMES}.").replace("{NAMES}", joinNames(sentNames)));
        return;
      }
      renderRefusals(sentNames, refusedList);
    };
  };

  closeShareOut=close;
  cutLeaves();
  document.body.appendChild(el);
  renderPicker();
  hangBubble(el, originFn, {width:360});
  document.addEventListener("pointerdown", outside, true);
  el.addEventListener("keydown", e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation(); close("back");
  });
  hooks.render();
  const f0=el.querySelector(".e-share-find");
  if(f0) try{ f0.focus({preventScroll:true}); }catch(e){}
}

function shareRowHtml(){
  if(!shareOfferedNow() || !inboxItems.length) return "";
  const senders=[];
  inboxItems.forEach(it=>{ if(it.fromName && senders.indexOf(it.fromName)<0) senders.push(it.fromName); });
  const sub=t("cards: {N}, from {NAMES}")
    .replace("{N}", String(inboxItems.length))
    .replace("{NAMES}", joinNames(senders));
  return '<div class="e-share-in-row" id="eShareRow">'
    +'<span class="e-share-dot" aria-hidden="true"></span>'
    +'<span class="e-share-row-t"><b>'+esc(t("Shared with you"))+'</b> '+esc(sub)+'</span>'
    +(inboxBubOpen ? '' : '<button type="button" class="btn e-share-show" id="eShareShow">'+esc(t("Show"))+'</button>')
    +'</div>';
}

function previewCardHtml(v2Card){
  const primary=CONTENT_LANGS[0]||"en";
  const pickLang=L=>(v2Card.body && v2Card.body[L]) ? L : primary;
  const L=pickLang(CONTENT_LANGS.find(x=>v2Card.body&&v2Card.body[x])||primary);
  const title=(v2Card.title && (v2Card.title[L]||v2Card.title[primary])) || "";
  const body=(v2Card.body && (v2Card.body[L]||v2Card.body[primary])) || "";
  const shelf=(v2Card.shelf && CATS[v2Card.shelf]) ? CATS[v2Card.shelf] : "";
  return '<div class="e-share-preview">'
    +'<div class="e-share-phead"><span class="e-share-ptitle" data-i18n-skip>'+esc(title)+'</span>'
    +(shelf ? '<span class="e-share-pshelf">'+esc(shelf)+'</span>' : '')+'</div>'
    +'<div class="e-share-pbody" data-i18n-skip><span class="tag">'+esc(L.toUpperCase())+'</span> '+esc(body)+'</div>'
    +'</div>';
}

function openInboxBubble(){
  if(closeShareIn) closeShareIn();
  if(closeShareOut) closeShareOut();
  if(!inboxItems.length) return;
  const item=inboxItems[0];
  inboxBubOpen=true;
  hooks.render();

  const el=document.createElement("div");
  el.className="bub bub-ask e-share-in-bub";
  el.setAttribute("role","dialog");
  el.setAttribute("data-side","none");
  el.setAttribute("aria-labelledby","eShareInT");

  const renderItem=()=>{
    const cur=inboxItems[0];
    if(!cur){ close(); return; }
    seenInboxIds.add(cur.id);
    const noteHtml=cur.note ? '<p class="e-share-in-note" data-i18n-skip>'+esc(cur.note)+'</p>' : '';
    el.innerHTML='<h3 id="eShareInT">'+esc(t("{NAME} shared a card with you").replace("{NAME}", cur.fromName||cur.from))+'</h3>'
      +noteHtml
      +previewCardHtml(cur.card||{})
      +'<p class="e-share-in-sub">'+esc(t("Keep adds it to this desk as a card of its own: a copy that stays as it is, whatever happens to the original."))+'</p>'
      +'<p class="e-share-in-why" role="alert" hidden></p>'
      +'<div class="tour-actions">'
      +'<button type="button" class="btn" data-share-in="later">'+esc(t("Later"))+'</button>'
      +'<button type="button" class="btn" data-share-in="decline">'+esc(t("Decline"))+'</button>'
      +'<button type="button" class="btn primary" data-share-in="keep">'+esc(t("Keep"))+'</button>'
      +'</div>';
    wireItemEvents(cur);
    hangBubble(el, originFn, {width:380});
  };

  const originFn=()=>document.getElementById("eShareShow") || document.getElementById("eShareRow");
  const outside=e=>{
    const row=document.getElementById("eShareRow");
    if(!el.contains(e.target) && !(row && row.contains(e.target))) deferClose();
  };
  const deferClose=()=>{
    if(inboxItems[0]) deferredIds.add(inboxItems[0].id);
    close();
  };
  const close=()=>{
    if(closeShareIn!==close) return;
    closeShareIn=null;
    inboxBubOpen=false;
    document.removeEventListener("pointerdown", outside, true);
    dismissNode(el);
    hooks.render();
  };

  const wireItemEvents=(cur)=>{
    const laterBtn=el.querySelector('[data-share-in="later"]');
    const decBtn=el.querySelector('[data-share-in="decline"]');
    const keepBtn=el.querySelector('[data-share-in="keep"]');
    const whyEl=el.querySelector(".e-share-in-why");
    const busy=on=>[laterBtn, decBtn, keepBtn].forEach(b=>{ if(b) b.disabled=on; });
    if(laterBtn) laterBtn.onclick=()=>deferClose();
    if(decBtn) decBtn.onclick=async ()=>{
      busy(true);
      await shareDropItem(cur.id);
      inboxItems=inboxItems.filter(x=>x.id!==cur.id);
      deferredIds.delete(cur.id);
      if(!inboxItems.length) close(); else renderItem();
    };
    if(keepBtn) keepBtn.onclick=async ()=>{
      busy(true);
      if(whyEl){ whyEl.hidden=true; whyEl.textContent=""; }
      const sc=hooks.storedCatalog();
      const catalogId=(sc && sc.id) || "";
      const opened=JSON.stringify({ from: cur.from, team: cur.team, card: JSON.stringify(cur.card) });
      const res=await shareKeepCard(opened, catalogId);
      if (!res || res.ok !== true || !res.card) { /* plant:share-verdict-first */
        busy(false);
        if(whyEl){ whyEl.textContent=(res && res.reason) ? String(res.reason) : t("This card could not be kept just now."); whyEl.hidden=false; }
        return;
      }
      const catalogNow=hooks.currentCatalog({asIs:true});
      const v2Cur=catalogToV2(catalogNow);
      const parsed=catalogFromV2({
        format: V2_FORMAT, kind: V2_KIND,
        id: catalogId || v2Cur.id || "etiuda-catalog", rev: 1,
        langs: v2Cur.langs, tags: v2Cur.tags, cards: [res.card]
      });
      const kept=parsed && Array.isArray(parsed.cards) ? parsed.cards[0] : null;
      if(!kept){
        busy(false);
        if(whyEl){ whyEl.textContent=t("This card could not be kept just now."); whyEl.hidden=false; }
        return;
      }
      const nowIso=new Date().toISOString();
      const entry=Object.assign({}, kept, {
        from: res.card.from || { desk: cur.from, card: cur.card && cur.card.id },
        fromName: cur.fromName || cur.from,
        fromAt: nowIso,
        changedAt: nowIso,
      });
      delete entry._base;
      delete entry._overridden;
      if(!Array.isArray(pack.custom)) pack.custom=[];
      pack.custom.push(entry);
      savePack([entry.id]);
      hooks.rebuildCards();
      await hooks.writeDeskBranch();
      await shareDropItem(cur.id);
      inboxItems=inboxItems.filter(x=>x.id!==cur.id);
      deferredIds.delete(cur.id);
      if(!inboxItems.length) close(); else renderItem();
    };
  };

  closeShareIn=close;
  cutLeaves();
  document.body.appendChild(el);
  document.addEventListener("pointerdown", outside, true);
  el.addEventListener("keydown", e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation(); deferClose();
  });
  renderItem();
}

function isBusyTypingOrCopied(){
  const a=typeof document!=="undefined" ? document.activeElement : null;
  if(a && (a.tagName==="INPUT" || a.tagName==="TEXTAREA" || a.tagName==="SELECT" || a.isContentEditable)) return true;
  if(typeof document!=="undefined" && document.querySelector("#ecYes, .e-offer, .e-launch-veil")) return true;
  return Date.now()-lastCopyAt < 2000;
}

function scheduleInboxOpen(){
  clearTimeout(inboxWaitTimer);
  const first=inboxItems[0];
  if(!first || inboxBubOpen || closeShareOut || deferredIds.has(first.id) || seenInboxIds.has(first.id)) return;
  if(isBusyTypingOrCopied()){
    inboxWaitTimer=setTimeout(scheduleInboxOpen, 300);
    return;
  }
  openInboxBubble();
}

function refreshShareInbox(){
  if(inboxLoading || !shareOfferedNow()) return;
  inboxLoading=true;
  shareInboxList().then(r=>{
    inboxLoading=false;
    if(!r || !r.ok || !Array.isArray(r.items)) return;
    inboxItems=r.items.slice();
    hooks.render();
    scheduleInboxOpen();
  }, ()=>{ inboxLoading=false; });
}

function syncShareState(){
  const st=teamShareState();
  if(!st){
    const had=inboxItems.length>0;
    inboxItems=[];
    inboxLoadedKey="";
    if(had) hooks.render();
    return;
  }
  const key=st.team+"|"+String(st.inbox||0);
  if(key!==inboxLoadedKey){
    inboxLoadedKey=key;
    refreshShareInbox();
  } else {
    hooks.render();
  }
}

function wireCardShare(){
  onJoinPainted(syncShareState);
  if(typeof addEventListener==="function"){
    addEventListener("copy", ()=>{ lastCopyAt=Date.now(); });
  }
  syncShareState();
}

export {
  shareOfferedNow,
  cardIsShareable,
  shareSig,
  shareButtonHtml,
  shareFromBadgeHtml,
  sharePressed,
  shareRowHtml,
  openInboxBubble,
  wireCardShare
};
