/* A person's own replies, brought in at the desk without Studio: pasted, or a sheet or a Word
   document dropped in. Where the desk shows the sample, or nothing, or replies brought in before,
   they become the person's own catalog, and the sample steps aside; where a team's catalog is
   loaded, they join it as the person's own cards. Either way nothing already there is lost. */
import { t, uiLang, toast } from "./ui-lang.js";
import { esc } from "./esc.js";
import { repliesFromText, repliesFromRows, csvRows, sheetText, workbookRows, docxText, textLang } from "./sheet-read.js";
import { activateCatalog, refusePractice } from "./catalog-file.js";
import { catalogToV2, V2_FORMAT, V2_KIND } from "./catalog-v2.js";
import { eCatalog, eCatalogSignature, parseCatalogFile, storedCatalog } from "./catalog.js";
import { eCatalogSample } from "./host.js";
import { CONTENT_LANGS } from "./content-model.js";
import { cardFieldKey } from "./card-fields.js";
import { pack, savePack } from "./pack.js";
import { uid } from "./ids.js";
import { nsGet, ssGet, ssSet, ssDel } from "./storage.js";
import { hooks } from "./hooks.js";
import { ePractice } from "./env.js";
import { OWN_ID } from "./card-carry.js";

/* THE PERSON'S OWN CATALOG IS ONE CATALOG, whatever was brought in and how often: its id (OWN_ID,
   in card-carry.js) is what makes a second import an edition of the first rather than a stranger. */
const OWN_DONE="eOwnDone";
const norm=s=>String(s||"").replace(/\s+/g," ").trim().toLowerCase();

/* What the desk will do with them, read off what is loaded now. */
function ownTarget(){
  const held=storedCatalog();
  if(held && held.id===OWN_ID) return "extend";
  if(!held || nsGet("Sample")==="1") return "catalog";
  return "cards";
}
/* ONE SHAPE FOR EVERY SOURCE: {title, text:{"":body} or {code:body}, cat, named}. A text's replies
   carry no language, and the sheet's per-language columns carry theirs. */
function fromText(text){
  const got=repliesFromText(text);
  return { replies:got.replies.map(r=>({ title:r.title, text:{"":r.text}, cat:"", named:r.named })),
           split:got.split, langs:[] };
}
function readFile(f){
  const name=String(f&&f.name||"").toLowerCase();
  return f.arrayBuffer().then(buf=>{
    const bytes=new Uint8Array(buf);
    if(/\.xlsx$/.test(name)) return workbookRows(bytes).then(rows=>rows?Object.assign({split:false},repliesFromRows(rows)):null);
    if(/\.docx$/.test(name)) return docxText(bytes).then(text=>text==null?null:fromText(text));
    if(/\.(csv|tsv)$/.test(name)) return Object.assign({split:false},repliesFromRows(csvRows(sheetText(bytes))));
    if(/\.(txt|text|md)$/.test(name)) return fromText(sheetText(bytes));
    return null;
  }).catch(()=>null);
}
/* Word for word the same text is brought in once, against what is already on the desk too. */
function dedupe(got,have){
  const seen=new Set(have||[]), keep=[];
  let twice=0;
  got.replies.forEach(r=>{
    const k=Object.keys(r.text).map(l=>norm(r.text[l])).join("|");
    if(seen.has(k)){ twice++; return; }
    seen.add(k); keep.push(r);
  });
  return { replies:keep, twice };
}
function haveKeys(){
  const held=storedCatalog();
  if(!held || held.id!==OWN_ID) return [];
  const doc=catalogToV2(held);
  return (doc.cards||[]).map(c=>Object.keys(c.body||{}).map(l=>norm(c.body[l])).join("|"));
}

// ---- turning replies into the person's catalog ---------------------------------------------------
function primaryOf(replies,langs){
  const fall=uiLang()==="pl"?"pl":"en";
  const n={pl:0,en:0};
  replies.forEach(r=>Object.keys(r.text).forEach(l=>{ const c=l||textLang(r.text[l],fall); n[c]=(n[c]||0)+1; }));
  if(langs.length) return n.pl>=n.en ? (langs.indexOf("pl")>-1?"pl":langs[0]) : (langs.indexOf("en")>-1?"en":langs[0]);
  return n.pl===n.en ? fall : (n.pl>n.en?"pl":"en");
}
/* A shelf per category the source names, reused where a shelf of that name is already there. */
function ownDoc(replies,langs){
  const held=storedCatalog();
  const prev=(held && held.id===OWN_ID) ? catalogToV2(held) : null;
  const codes=prev ? prev.langs.map(x=>x.code) : (()=>{
    const p=primaryOf(replies,langs);
    return [p].concat(langs.filter(l=>l!==p));
  })();
  const L=codes[0];
  const tags=prev ? prev.tags.slice() : [];
  const cards=prev ? prev.cards.slice() : [];
  const shelfFor=name=>{
    const label=String(name||"").trim() || t("Your replies");
    const hit=tags.find(x=>x.kind==="shelf" && (x.label||{})[L]===label);
    if(hit) return hit.id;
    let id="t-own", n=1;
    while(tags.some(x=>x.id===id)) id="t-own-"+(++n);
    tags.push({ id, kind:"shelf", label:{ [L]:label } });
    return id;
  };
  let seq=cards.length;
  const nextId=()=>{ let id; do{ id="c-own-"+(++seq); }while(cards.some(c=>c.id===id)); return id; };
  replies.forEach(r=>{
    const body={};
    Object.keys(r.text).forEach(l=>{ if(l && codes.indexOf(l)>-1) body[l]=r.text[l]; });
    /* A reply with no language of its own is written as it came, in the catalog's first language. */
    if(!body[L]) body[L]=r.text[""] || r.text[Object.keys(r.text).find(l=>l)] || "";
    if(!body[L]) return;
    cards.push({ id:nextId(), shelf:shelfFor(r.cat), title:{ [L]:r.title||body[L].slice(0,40) }, body, bodyShape:"plain" });
  });
  const d=new Date(), p=v=>String(v).padStart(2,"0");
  return { format:V2_FORMAT, kind:V2_KIND, id:OWN_ID, name:prev?prev.name:t("Your replies"),
           rev:(prev&&+prev.rev||0)+1, date:d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()),
           langs:codes.map(c=>({ code:c, label:c.toUpperCase() })), tags, cards };
}
/* Beside a team's catalog: the person's own cards on a shelf of their own, in the catalog's first
   language, the way a card written at this desk is kept. No reload, so nothing on screen moves. */
function asOwnCards(replies){
  const L=CONTENT_LANGS[0];
  const tKey=cardFieldKey("t",L), bKey=cardFieldKey("body",L);
  let n=0;
  replies.forEach(r=>{
    const text=r.text[L] || r.text[""] || r.text[Object.keys(r.text)[0]];
    if(!text) return;
    const c=hooks.ensureCustomCat(String(r.cat||"").trim() || t("Your replies"));
    pack.custom.push({ id:uid("u:"), c, [tKey]:r.title||text.slice(0,40), [bKey]:text });
    n++;
  });
  savePack();
  hooks.rebuildCards();
  return n;
}
function bringIn(got){
  if(refusePractice()) return false;
  const aim=ownTarget();
  if(aim==="cards"){ showDone(asOwnCards(got.replies),false); return true; }
  const doc=ownDoc(got.replies,got.langs||[]);
  let c;
  try{ c=parseCatalogFile(JSON.stringify(doc)); }
  catch(e){ toast(t("This file's contents can come in by pasting: Ctrl+A and Ctrl+C in the file, then Ctrl+V here. The file itself is not in a form Etiuda can read.")); return false; }
  /* THE SAMPLE STEPS ASIDE AND STAYS ASIDE: the file is still in the folder, and without a refusal
     on record the next launch would offer it back over the person's own replies. */
  const found=eCatalog();
  const refuse=(found && eCatalogSample()) ? eCatalogSignature(found) : "";
  try{ ssSet(OWN_DONE,JSON.stringify({ n:got.replies.length, aside:nsGet("Sample")==="1" })); }catch(e){}
  const ok=activateCatalog(c,{ keepPersonal:true, refuse });
  if(ok===false){ try{ ssDel(OWN_DONE); }catch(e){} }
  return ok!==false;
}

// ---- the screens ----------------------------------------------------------------------------------
function modal(id,inner){
  const wrap=document.createElement("div");
  wrap.className="modal";
  wrap.id=id;
  wrap.innerHTML='<div class="modal-bg"></div><div class="modal-card">'+inner+'</div>';
  document.body.appendChild(wrap);
  const close=()=>{ document.removeEventListener("keydown",onKey,true); wrap.remove(); };
  function onKey(e){ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); } }
  document.addEventListener("keydown",onKey,true);
  return { wrap, close };
}
const OWN_FILE_RE=/\.(docx|xlsx|csv|tsv|txt)$/i;
function openOwnImport(file){
  if(refusePractice() || document.getElementById("eOwnImport")) return;
  const formats=t("Word (.docx), a spreadsheet (.xlsx, .csv) or plain text (.txt)");
  const { wrap, close }=modal("eOwnImport",
    '<h2>'+esc(t("Your replies"))+'</h2>'
    +'<div class="modal-body">'
    +'<p class="modal-sub">'+esc(t("Paste them here, or drop the file: {FORMATS}.").split("{FORMATS}").join(formats))+'</p>'
    +'<p class="modal-sub e-own-rule">'+esc(t("An empty line separates one reply from the next. In a spreadsheet, each row is one reply."))+'</p>'
    +'<textarea id="eOwnText" class="e-own-text" spellcheck="false" placeholder="'+esc(t("Paste your replies here"))+'"></textarea>'
    +'<div class="e-own-drop" id="eOwnDrop" role="button" tabindex="0">'+esc(t("or drop the file here"))+'</div>'
    +'<div class="e-own-seen" id="eOwnSeen" aria-live="polite"></div>'
    +'</div>'
    +'<div class="modal-actions"><button type="button" class="btn" id="eOwnCancel">'+esc(t("Cancel"))+'</button>'
    +'<button type="button" class="btn primary" id="eOwnGo" disabled>'+esc(t("Bring them in"))+'</button></div>');
  const text=wrap.querySelector("#eOwnText"), seen=wrap.querySelector("#eOwnSeen"),
        go=wrap.querySelector("#eOwnGo"), drop=wrap.querySelector("#eOwnDrop");
  let got=null, fromFile=false, timer=0;
  const show=(g,file,unread)=>{
    fromFile=!!file;
    got=g ? Object.assign(dedupe(g,haveKeys()),{ langs:g.langs||[], split:!!g.split }) : null;
    go.disabled=!(got && got.replies.length);
    if(unread){ seen.innerHTML='<p class="modal-sub">'+esc(t("This file's contents can come in by pasting: Ctrl+A and Ctrl+C in the file, then Ctrl+V here. The file itself is not in a form Etiuda can read."))+'</p>'; return; }
    if(!got || !got.replies.length){ seen.innerHTML=""; return; }
    const n=got.replies.length;
    let h='<h3>'+esc(t("Replies ready to come in: {N}").split("{N}").join(String(n)))+'</h3><ul class="e-own-list" data-i18n-skip>'
      +got.replies.slice(0,8).map(r=>'<li>'+esc(r.title)+'</li>').join("")+(n>8?'<li class="e-own-more">'+esc(String(n-8))+' +</li>':'')+'</ul>';
    if(got.twice) h+='<p class="modal-sub">'+esc(t("Repeated word for word, brought in once: {N}").split("{N}").join(String(got.twice)))+'</p>';
    if(got.split) h+='<p class="modal-sub">'+esc(t("Etiuda tells replies apart by the empty lines between them. With those added, the text can be pasted again."))+'</p>';
    if(got.replies.some(r=>!r.named)) h+='<p class="modal-sub">'+esc(t("Each becomes a card, like Mirabelka's. Its first words are its title, which can be changed at any time."))+'</p>';
    h+='<p class="modal-sub">'+esc(t("Replies come in exactly as they were written. The greeting for the hour and the customer's name can be added to any of them when the card is edited."))+'</p>';
    if(fromFile) h+='<p class="modal-sub">'+esc(t("The file they came from is left as it was."))+'</p>';
    seen.innerHTML=h;
  };
  text.oninput=()=>{ clearTimeout(timer); timer=setTimeout(()=>show(text.value.trim()?fromText(text.value):null,false),250); };
  const take=f=>{ if(!f) return; readFile(f).then(g=>{ text.value=""; show(g,true,!g); }); };
  const pick=()=>{
    const inp=document.createElement("input");
    inp.type="file"; inp.accept=".docx,.xlsx,.csv,.tsv,.txt";
    inp.onchange=()=>take(inp.files&&inp.files[0]);
    inp.click();
  };
  drop.onclick=pick;
  drop.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(); } };
  wrap.addEventListener("dragover",e=>{ e.preventDefault(); drop.classList.add("on"); });
  wrap.addEventListener("dragleave",e=>{ if(e.target===drop) drop.classList.remove("on"); });
  wrap.addEventListener("drop",e=>{ e.preventDefault(); drop.classList.remove("on");
    take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  wrap.querySelector("#eOwnCancel").onclick=close;
  go.onclick=()=>{ if(got && got.replies.length && bringIn(got)!==false) close(); };
  try{ text.focus(); }catch(e){}
  if(file) take(file);
}
/* After the reload a catalog lands with, or at once beside a team's catalog: how many came in, and
   where the sample went when it stepped aside. */
function showDone(n,aside){
  const { wrap, close }=modal("eOwnDone",
    '<h2>'+esc(t("Replies brought in: {N}").split("{N}").join(String(n)))+'</h2>'
    +(aside?'<p class="modal-sub">'+esc(t("From now on they are the ones waiting for a word. The sample Mirabelka makes room for them and stays in the Library, should it be wanted again."))+'</p>':'')
    +'<p class="modal-sub">'+esc(t("Type a word from any of them at the top."))+'</p>'
    +'<p class="modal-sub">'+esc(t("New card adds another, at any time."))+'</p>'
    +'<div class="modal-actions"><button type="button" class="btn primary" id="eOwnOk">'+esc(t("OK"))+'</button></div>');
  wrap.querySelector("#eOwnOk").onclick=close;
  try{ wrap.querySelector("#eOwnOk").focus(); }catch(e){}
}
function wireOwnImport(){
  if(ePractice()) return;
  let done=null;
  try{ done=JSON.parse(ssGet(OWN_DONE)||"null"); }catch(e){ done=null; }
  if(done){ try{ ssDel(OWN_DONE); }catch(e){} setTimeout(()=>showDone(+done.n||0,!!done.aside),400); }
  /* A sheet or a document dropped anywhere on the desk opens this with it; the dialog takes its own
     drops, and anything else dropped is left to whatever already answers it. */
  addEventListener("dragover",e=>{
    if(e.dataTransfer && [...(e.dataTransfer.types||[])].indexOf("Files")>-1) e.preventDefault();
  });
  addEventListener("drop",e=>{
    const f=e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(!f || !OWN_FILE_RE.test(f.name) || document.getElementById("eOwnImport")) return;
    e.preventDefault();
    openOwnImport(f);
  });
}

export {
  ownTarget,
  ownDoc,
  openOwnImport,
  bringIn,
  wireOwnImport
};
