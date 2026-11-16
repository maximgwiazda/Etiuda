/* REWORD ON A CARD: a card's words reworded by the organisation's own model at a press, shown in place of the card's own until
   Approve, which keeps them as the person's edit through the editor's rule, or Revert, which shows the card as it was.
   Untouched, the rewording lasts until the page is next opened: it is kept in card-model.js's REWORDED, in this page's memory
   alone, and written nowhere. The button and the menu exist only while the shell names the service it sends to (aiState). */
import { REWORDED, rewordKeep, rewordShown, findCard, baseCard, cardText, cardLang, overrideAgainstBase, putOverride, stampChanged, splitPartsRaw } from "./card-model.js";
import { cardFieldKey } from "./card-fields.js";
import { VAR_TOKEN_RE } from "./variables.js";
import { pack, savePack } from "./pack.js";
import { hooks } from "./hooks.js";
import { eHost } from "./host.js";
import { hangBubble } from "./bubble.js";
import { esc } from "./esc.js";
import { _svg } from "./icons.js";
import { t, toast } from "./ui-lang.js";
import { cutLeaves, dismissNode } from "./motion.js";

const ICON_REWORD=_svg("ic",'<path d="M3.5 8h7"/><path d="M3.5 12h13"/><path d="M3.5 16h9"/><path d="M15 2.6c.3 1.9 1 2.6 2.9 2.9-1.9.3-2.6 1-2.9 2.9-.3-1.9-1-2.6-2.9-2.9 1.9-.3 2.6-1 2.9-2.9z"/>');
/* The three acts the menu offers, by the instruction the shell holds for each (shell/desk-ai.cjs REWORD_ACTS). */
const RW_ACTS=[["shorter","Shorter"],["friendlier","Friendlier"],["formal","More formal"]];
/* The host the shell names, asked at most once a second, since every card drawn asks: "" where there is no host, no reword
   in it, or no service in force, and then the button is absent. */
let rwHostAt=0, rwHostWas="";
function rewordHostNow(){
  const now=Date.now();
  if(now-rwHostAt<1000) return rwHostWas;
  rwHostAt=now;
  const h=eHost();
  let s=null;
  try{ s=h && typeof h.aiState==="function" && typeof h.reword==="function" ? h.aiState() : null; }catch(e){ s=null; }
  rwHostWas=s && typeof s.reword==="string" ? s.reword : "";
  return rwHostWas;
}
/* THE PERSON'S OWN SWITCH, as the shell holds it: `at` the address a reword would go to (empty where no organisation's model is in
   force, and then Settings draws no row), `on` whether the person has it on for themselves, on unless the shell says otherwise.
   Off, the shell names no host to the buttons, so they are absent, and it refuses a request however it is made. */
function rewordState(){
  const h=eHost();
  let s=null;
  try{ s=h && typeof h.aiState==="function" ? h.aiState() : null; }catch(e){ s=null; }
  return { at:s && typeof s.rewordAt==="string" ? s.rewordAt : "", on:!s || s.rewordOn!==false };
}
function rewordSwitchSet(on){
  const h=eHost();
  try{ if(h && typeof h.setReword==="function") h.setReword(!!on); }catch(e){}
  rwHostAt=0;
  if(!on) closeRewordMenu();
}
function rewordButtonHtml(){
  if(!rewordHostNow()) return "";
  const w=t("Reword");
  return '<button type="button" data-act="reword" title="'+esc(w)+'" aria-label="'+esc(w)+'" aria-haspopup="dialog" aria-expanded="false">'+ICON_REWORD+'</button>';
}
function rewordChipHtml(r){
  const act=RW_ACTS.filter(a=>a[0]===r.act)[0];
  const chip=act ? t("Reworded: {ACT}").split("{ACT}").join(t(act[1])) : t("Reworded as described");
  return '<div class="rw-chip"><span class="rw-badge">'+esc(chip)+'</span><span class="rw-unsaved" title="'
    +esc(t("Shown until Etiuda is next opened, unless you approve it."))+'">'+esc(t("Not saved."))+'</span></div>';
}
function rewordAnswersHtml(){
  return '<div class="rw-ans"><button type="button" class="btn" data-rw="approve" title="'+esc(t("Keep these words as your own edit of the card"))+'">'
    +esc(t("Approve"))+'</button><button type="button" class="btn" data-rw="revert" title="'+esc(t("Show the card as it was"))+'">'
    +esc(t("Revert"))+'</button></div>';
}
/* A RESULT IS SHOWN ONLY AS A CARD OF THE SAME SHAPE: the same names filled in ({PAX}, {DATE:short}), each as often; and on a
   card of alternatives or steps, as many parts, each opening with the same mark line where it had one. */
const RW_MARK_RE=/^\[(step|alt)(:[^\x5d]*)?\]$/;
function rewordTokens(s){ return (String(s==null?"":s).match(VAR_TOKEN_RE)||[]).slice().sort().join("\n"); }
function rewordKeepsShape(from,to,alt){
  if(!String(to||"").trim() || rewordTokens(from)!==rewordTokens(to)) return false; /* plant:reword-tokens */
  if(!alt) return true;
  const a=splitPartsRaw(from), b=splitPartsRaw(to);
  if(a.length!==b.length) return false; /* plant:reword-parts */
  const mark=p=>{ const first=(String(p).split("\n")[0]||"").trim(); return RW_MARK_RE.test(first) ? first : ""; };
  const rest=p=>(mark(p) ? String(p).split("\n").slice(1).join("\n") : String(p)).trim();
  return a.every((p,i)=>mark(p)===mark(b[i]) && rest(b[i]).length>0);
}
/* Whether a refused result kept every name and every part and mark, but left one part with no words after its mark line. */
function rewordPartEmpty(from,to,alt){
  if(!alt || rewordTokens(from)!==rewordTokens(to)) return false;
  const a=splitPartsRaw(from), b=splitPartsRaw(to);
  if(a.length-b.length) return false;
  const mark=p=>{ const first=(String(p).split("\n")[0]||"").trim(); return RW_MARK_RE.test(first) ? first : ""; };
  const rest=p=>(mark(p) ? String(p).split("\n").slice(1).join("\n") : String(p)).trim();
  return a.every((p,i)=>mark(p)===mark(b[i])) && b.some(p=>rest(p).length===0);
}
let rwMenu=null, rwAsk=0;
function rwButtonOf(id){
  return [...document.querySelectorAll('#list .card[data-id] .cacts [data-act="reword"]')].filter(b=>b.closest(".card").dataset.id===id)[0]||null;
}
function closeRewordMenu(){
  if(!rwMenu) return;
  const was=rwMenu;
  rwMenu=null; rwAsk++;
  try{ was.drop(); }catch(e){}
  removeEventListener("mousedown", was.outside, true);
  dismissNode(was.el);
  const b=rwButtonOf(was.id);
  if(b) b.setAttribute("aria-expanded","false");
}
/* The menu: the family's blue bubble from the card's button, above it so the card stays readable. It says what goes out and
   where before anything is sent; a press of an act, or Enter in the field, is the one thing that sends. */
function openRewordMenu(btn,id){
  if(rwMenu && rwMenu.id===id){ closeRewordMenu(); return; }
  closeRewordMenu();
  const host=rewordHostNow(), m=findCard(id);
  if(!host || !m) return;
  const el=document.createElement("div");
  el.className="bub bub-ask rw-bub"; el.id="eReword";
  el.setAttribute("role","dialog"); el.setAttribute("aria-labelledby","eRewordTitle");
  const how=t("Or say how, then press Enter");
  el.innerHTML='<h3 id="eRewordTitle">'+esc(t("Reword this card"))+'</h3><div class="tour-actions rw-bacts">'
    +RW_ACTS.map(a=>'<button type="button" class="btn" data-rw-act="'+a[0]+'">'+esc(t(a[1]))+'</button>').join("")+'</div>'
    +'<input type="text" class="rw-how" id="eRewordHow" maxlength="200" autocomplete="off" spellcheck="false" placeholder="'+esc(how)+'" aria-label="'+esc(how)+'">'
    +'<p class="rw-bline" role="status"></p><div class="tour-actions"><button type="button" class="btn primary" id="eRewordNo">'+esc(t("Cancel"))+'</button></div>';
  cutLeaves();
  document.body.appendChild(el);
  const line=el.querySelector(".rw-bline"), field=el.querySelector("#eRewordHow");
  const say=s=>{ line.textContent=String(s||"").split("{ADDRESS}").join(host); };
  say(t("Sends this card's words to {ADDRESS}. The card itself changes only if you approve the result."));
  const drop=hangBubble(el, ()=>rwButtonOf(id), {prefer:"above", width:340});
  const outside=e=>{ if(!el.contains(e.target) && !(e.target.closest && e.target.closest('[data-act="reword"]'))) closeRewordMenu(); };
  addEventListener("mousedown", outside, true);
  rwMenu={el:el, id:id, drop:drop, outside:outside};
  btn.setAttribute("aria-expanded","true");
  el.addEventListener("click",e=>{
    const b=e.target.closest && e.target.closest("button[data-rw-act]");
    if(b) rewordPress(id, b.getAttribute("data-rw-act"), "", say);
  });
  el.addEventListener("keydown",e=>{
    if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closeRewordMenu(); try{ btn.focus({preventScroll:true}); }catch(_){} }
    else if(e.key==="Enter" && e.target===field){ e.preventDefault(); e.stopPropagation(); if(field.value.trim()) rewordPress(id, "own", field.value, say); }
  });
  el.querySelector("#eRewordNo").onclick=()=>closeRewordMenu();
  try{ el.querySelector("button[data-rw-act]").focus({preventScroll:true}); }catch(e){}
}
/* ONE PRESS, ONE REQUEST: the card's own text in the language shown, its names as the catalog writes them and never the
   values filled in, with the act or the person's own words of how. A later press, Cancel or Esc lets an answer go. */
function rewordPress(id,act,how,say){
  const m=findCard(id), h=eHost(), menu=rwMenu;
  if(!m || !menu || menu.id!==id || !h || typeof h.reword!=="function") return;
  const L=cardLang(m), from=cardText(m,"body",L); /* plant:reword-card-raw */
  if(!from) return;
  const mine=++rwAsk;
  menu.el.querySelectorAll("button[data-rw-act]").forEach(b=>b.classList.toggle("tour-sel", b.getAttribute("data-rw-act")===act));
  say(t("Waiting for the service at {ADDRESS}…"));
  /* Each case where nothing was sent says so (the service paused, words over 4000 characters, the person's switch off at the press, the
     organisation's model gone, a press the desk cannot say more of); "No result came back" stays for a request that went and brought nothing. */
  const why=r=>r && r.why;
  const fail=r=>say(why(r)==="late" ? t("The service at {ADDRESS} did not answer in time. The card is as it was.")
    : why(r)==="busy" ? t("The service at {ADDRESS} is busy; a later try may go through. The card is as it was.")
    : why(r)==="paused" ? t("The service at {ADDRESS} failed three times in a row, so Etiuda waits before asking it again; nothing was sent. The card is as it was.")
    : why(r)==="toolong" ? t("These words are over 4000 characters, more than can be sent, so nothing was sent. The card is as it was.")
    : why(r)==="switch" ? t("Rewording is turned off on this computer, so nothing was sent. The card is as it was.")
    : why(r)==="model" ? t("The organisation's model is no longer set, so nothing was sent. The card is as it was.")
    : why(r)==="unavailable" || why(r)==="refused" || why(r)==="off" ? t("Rewording is not available just now, so nothing was sent. The card is as it was.")
    : t("No result came back from {ADDRESS}. The card is as it was."));
  Promise.resolve(h.reword({act:act, words:from, how:act==="own" ? String(how||"") : "", to:""})).then(r=>{
    if(mine!==rwAsk || rwMenu!==menu) return;
    menu.el.querySelectorAll("button.tour-sel").forEach(b=>b.classList.remove("tour-sel"));
    if(!r || r.ok!==true || typeof r.text!=="string"){ fail(r); return; }
    if(!rewordKeepsShape(from, r.text, !!m.alt)){
      const empty=!String(r.text||"").trim();
      say(empty ? t("The result came back empty, so it is not shown. The card is as it was; another try may do better.")
        : rewordPartEmpty(from, r.text, !!m.alt) ? t("One of this card's alternatives came back with no words, so the result is not shown. The card is as it was; another try may do better.")
        : t("The result lost a name this card fills in, or one of its steps, so it is not shown. The card is as it was; another try may keep them."));
      return;
    }
    const now=findCard(id);
    closeRewordMenu();
    if(!now || cardText(now,"body",L)!==from) return;
    rewordKeep(id, {L:L, from:from, text:r.text, act:act});
    hooks.rebuildCards();
  }, ()=>{ if(mine===rwAsk && rwMenu===menu) fail(null); });
}
/* APPROVE IS THE EDITOR'S SAVE OF ONE FIELD: the body in the language reworded, stored as the editor stores it (an own card in
   place, a catalog card as an override against its base), then saved and drawn as any edit is, the "mod" mark with it. */
function approveReword(id){
  const r=REWORDED.get(id), m=findCard(id);
  REWORDED.delete(id);
  const key=r ? cardFieldKey("body",r.L) : "";
  if(!r || !m || !key || cardText(m,"body",r.L)!==r.from){ hooks.rebuildCards(); return false; }
  const moved={[key]:r.text};
  if(m._custom){
    const ix=(pack.custom||[]).findIndex(x=>x && x.id===id);
    if(ix<0){ hooks.rebuildCards(); return false; }
    const was=Object.assign({}, pack.custom[ix]);
    stampChanged(Object.assign(pack.custom[ix], moved), was);
  } else {
    const base=baseCard(id);
    if(!base){ hooks.rebuildCards(); return false; }
    putOverride(id, overrideAgainstBase(base, Object.assign({}, m, moved)));
  }
  savePack([id]);
  hooks.rebuildCards();
  toast("Card saved");
  return true;
}
function revertReword(id){
  REWORDED.delete(id);
  hooks.rebuildCards();
}

export {
  rewordState,
  rewordSwitchSet,
  rewordHostNow,
  rewordButtonHtml,
  rewordChipHtml,
  rewordAnswersHtml,
  rewordKeepsShape,
  openRewordMenu,
  closeRewordMenu,
  approveReword,
  revertReword
};
