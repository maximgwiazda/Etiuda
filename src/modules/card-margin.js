import { placeBubble } from "./bubble.js";
import { catalogVariables } from "./variables.js";
import { CONTENT_LANGS } from "./content-model.js";
import { cardFieldKey } from "./card-fields.js";
import { langFieldId, langEndonym } from "./lang-tabs.js";
import { E_SPRING, M_MS, mgReduceMotion, dismissNode } from "./motion.js";
import { t } from "./ui-lang.js";
import { esc } from "./esc.js";
import { sayLive } from "./tabs.js";
import { modalCard } from "./dom.js";

/* THE CARD EDITOR'S MARGIN: in the Macro box the fields read as chips, and the two things a desk can check
   alone are said beside the words, a field this catalog does not fill and one language edited while the
   other was not. It speaks after a pause in typing, never takes focus, and F8 walks its findings. */

/* THE FIELDS fill() WRITES (intent-text.js), bare and with words of their own; a catalog's variables join
   both. tests/module-calls.mjs 1007mg1 reads fill() as text and holds these equal to it. */
const MARGIN_BARE=["GREET","PAX","NAME","AGENT","INIT","ROLE","INTENT","ACTION","TOPIC","Z"];
const MARGIN_ARGS=["GENDER","GREET","PAX","NAME","INTENT","TOPIC","AGENT","ROLE","DAYPART"];
const MARGIN_NAME=/^([A-Z][A-Z0-9]*)(?::([^{}]*))?$/;
const MARGIN_TOKEN=/\{([^{}\r\n]{1,40})\}/g;
const MARGIN_PAUSE_MS=1000;
// How long the last answer stays said before the bubble leaves.
const MARGIN_DONE_MS=4000;

function marginKnown(vars){
  const own=((vars&&Array.isArray(vars.list))?vars.list:[]).map(v=>v&&v.name).filter(Boolean);
  return {bare:new Set(MARGIN_BARE.concat(own)), args:new Set(MARGIN_ARGS.concat(own)), own:new Set(own)};
}
function marginTokens(text,known){
  const out=[], s=String(text==null?"":text);
  s.replace(MARGIN_TOKEN,(raw,inner,at)=>{
    const m=MARGIN_NAME.exec(inner);
    const ok=!!m && (m[2]==null ? known.bare.has(m[1]) : known.args.has(m[1]));
    out.push({at:at, end:at+raw.length, raw:raw, inner:inner, known:ok});
    return raw;
  });
  return out;
}
// Optimal string alignment: an edit, or two letters swapped, costs one.
function marginDist(a,b){
  const d=[];
  for(let i=0;i<=a.length;i++) d.push([i]);
  for(let j=1;j<=b.length;j++) d[0][j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++){
    d[i][j]=Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j], d[i-2][j-2]+1);
  }
  return d[a.length][b.length];
}
/* NEAR is one edit, two where the longer name has six letters or more, and none where either has two or
   fewer, so {X} is never offered {Z}; case never counts. Offered only where exactly one field is near, and
   never GENDER, which the words give nothing to say about. */
function marginNear(inner,known){
  const m=/^([^:]*)(:[^]*)?$/.exec(String(inner==null?"":inner));
  const name=m[1].toUpperCase(), rest=m[2]||"";
  if(!name) return "";
  const hits=Array.from(rest?known.args:known.bare).filter(k=>{
    if(k==="GENDER") return false;
    const limit=(k.length<=2||name.length<=2) ? 0 : (Math.max(k.length,name.length)>=6 ? 2 : 1);
    return marginDist(name,k)<=limit;
  });
  return hits.length===1 ? "{"+hits[0]+rest+"}" : "";
}
function marginNorm(s){ return String(s==null?"":s).replace(/\r\n?/g,"\n").trim(); }
function marginCount(text,raw){ return String(text==null?"":text).split(raw).length-1; }
/* The findings of one Macro box, in reading order and then the other languages. A field the catalog's own
   card already carries is the lead's and not this desk's. A language finding needs the catalog's card:
   this box changed against it, and another box still holds its words, which are not empty.
   `silenced` is what Leave it as it is answered: a field by how many times it stood, a language by the
   words that tab held. */
function marginFindings(o){
  const known=o.known, text=String(o.text==null?"":o.text), sil=o.silenced||{};
  const theirs=new Set(marginTokens(o.base||"",known).map(x=>x.raw));
  const out=[], nth={};
  marginTokens(text,known).forEach(x=>{
    if(x.known || theirs.has(x.raw)) return;
    if(sil.fields && sil.fields[x.raw]===marginCount(text,x.raw)) return;
    nth[x.raw]=(nth[x.raw]||0)+1;
    out.push({kind:"field", at:x.at, end:x.end, raw:x.raw, nth:nth[x.raw], sug:marginNear(x.inner,known)});
  });
  if(o.base!=null && marginNorm(text)!==marginNorm(o.base)) (o.others||[]).forEach(x=>{
    const now=marginNorm(x.text);
    if(!marginNorm(x.base) || now!==marginNorm(x.base)) return;
    if(sil.langs && Object.prototype.hasOwnProperty.call(sil.langs,x.l) && sil.langs[x.l]===now) return;
    out.push({kind:"lang", l:x.l});
  });
  return out;
}
function marginReplace(text,f,sug){
  const s=String(text==null?"":text);
  return s.slice(0,f.at)+sug+s.slice(f.end);
}
/* THE MIRROR'S MARKUP: the box's text character for character, braces included, so it wraps exactly as the
   box does; a known field is a chip whose braces are drawn in no ink. `bad` holds the places marked. */
function marginHtml(text,known,bad){
  const s=String(text==null?"":text);
  let out="", i=0;
  marginTokens(s,known).forEach(x=>{
    out+=esc(s.slice(i,x.at));
    if(x.known) out+='<span class="me-chip"><span class="me-br">{</span>'+esc(x.inner)+'<span class="me-br">}</span></span>';
    else if(bad && bad.has(x.at)) out+='<span class="me-bad" data-at="'+x.at+'">'+esc(x.raw)+'</span>';
    else out+=esc(x.raw);
    i=x.end;
  });
  out+=esc(s.slice(i));
  // A closing line break draws no line in a block; the box draws one.
  if(!s || s.charAt(s.length-1)==="\n") out+=String.fromCharCode(0x200b);
  return out;
}
function marginWhat(name,known){
  if(known && known.own.has(name)) return t("filled by this catalog");
  switch(name){
    case "GREET": return t("the greeting for the time of day");
    case "PAX": return t("the customer's name");
    case "NAME": return t("the customer's full name");
    case "AGENT": return t("the name customers see");
    case "INIT": return t("the initials of the name customers see");
    case "ROLE": return t("who is on the chat");
    case "INTENT": return t("the intent chosen in this conversation");
    case "ACTION": return t("what was done, for internal comments");
    case "TOPIC": return t("the topic of the chosen intent");
    case "Z": return t("z or ze, to suit the word after it");
    case "DAYPART": return t("words chosen by the time of day");
  }
  return "";
}
function marginSugName(sug){ const m=/^\{([A-Z][A-Z0-9]*)/.exec(String(sug||"")); return m?m[1]:""; }
// A tab is named by its label, quoted: a Polish sentence cannot take "Polski" capitalised mid-way.
function marginTab(l){ return '"'+langEndonym(l)+'"'; }
function marginHeading(f,known){
  if(f.kind==="lang") return t("{TAB} still has the earlier text").replace("{TAB}",()=>marginTab(f.l));
  if(f.sug) return t("Perhaps {SUGGESTED}, {WHAT}?").replace(/\{SUGGESTED\}|\{WHAT\}/g,k=>k==="{WHAT}" ? marginWhat(marginSugName(f.sug),known) : f.sug);
  return t("{TOKEN} goes out exactly as typed").replace("{TOKEN}",()=>f.raw);
}
function marginLine(f){
  if(f.kind==="lang") return t("Copied in that language, the card goes out as it was before this edit.");
  if(f.sug) return t("{TOKEN} is not a field this catalog fills, so the customer would see it as typed, braces and all.")
    .replace("{TOKEN}",()=>f.raw);
  return t("This catalog fills no field by that name.");
}
// esc() first and the tokens after, so a token's braces and the code tag survive as written.
function marginCode(words,tok,val){ return esc(words).split(tok).join("<code>"+esc(val)+"</code>"); }
function marginBubbleHtml(f,at,all,known){
  let head, line, acts="";
  if(f.kind==="lang"){
    head=esc(t("{TAB} still has the earlier text")).split("{TAB}").join(esc(marginTab(f.l)));
    line=esc(marginLine(f));
    acts='<button type="button" class="btn primary" data-act="open">'
      +esc(t("Open {TAB}").replace("{TAB}",()=>marginTab(f.l)))+'</button>';
  } else if(f.sug){
    head=esc(t("Perhaps {SUGGESTED}, {WHAT}?")).replace(/\{SUGGESTED\}|\{WHAT\}/g,
      k=>k==="{WHAT}" ? esc(marginWhat(marginSugName(f.sug),known)) : "<code>"+esc(f.sug)+"</code>");
    line=marginCode(t("{TOKEN} is not a field this catalog fills, so the customer would see it as typed, braces and all."),"{TOKEN}",f.raw);
    acts='<button type="button" class="btn primary" data-act="fix">'
      +esc(t("Change it to {SUGGESTED}").replace("{SUGGESTED}",()=>f.sug))+'</button>';
  } else {
    head=marginCode(t("{TOKEN} goes out exactly as typed"),"{TOKEN}",f.raw);
    line=esc(marginLine(f));
  }
  acts+='<button type="button" class="btn" data-act="leave">'+esc(t("Leave it as it is"))+'</button>';
  return '<h3>'+head+'</h3><p>'+line+'</p><div class="tour-actions">'+acts
    +'<span class="e-margin-at">'+esc(t("{AT} of {ALL} · F8: next").replace("{AT}",at).replace("{ALL}",all))+'</span></div>';
}
function marginSay(words){ sayLive(words); }
// The same finding across edits: a language by its tab, a field by its words and which of them it is.
const marginSame=(a,b)=>!!a && !!b && a.kind===b.kind && (a.kind==="lang" ? a.l===b.l : a.raw===b.raw && a.nth===b.nth);

let MG=null;
function marginDown(){ if(MG){ const m=MG; MG=null; m.down(); } }
/** Wires the margin onto the card editor just drawn; `base` is the catalog's card, or null for one of this
 *  desk's own. Whatever the previous editor wired comes down first. */
function wireCardMargin(base){
  marginDown();
  const boxes=CONTENT_LANGS.map(l=>{
    const ta=document.getElementById(langFieldId("me","body",l)), mir=ta&&ta.nextElementSibling;
    if(!ta || !mir || !mir.classList || !mir.classList.contains("me-mirror")) return null;
    return {l:l, ta:ta, mir:mir, over:null, base:base?String(base[cardFieldKey("body",l)]==null?"":base[cardFieldKey("body",l)]):null};
  }).filter(Boolean);
  if(!boxes.length) return;
  const known=marginKnown(catalogVariables());
  const sil={fields:{}, langs:{}};
  let bub=null, box=null, cur=null, folded=false, spoken=new Set(), pauseT=0, doneT=0, acting=false, dead=false;
  let moveAt=null, moveRaf=0;
  const active=()=>boxes.find(b=>b.ta.closest && b.ta.closest(".lang-pane.on"))||null;
  const findings=b=>marginFindings({text:b.ta.value, base:b.base, known:known, silenced:sil,
    others:b.base==null ? [] : boxes.filter(o=>o!==b).map(o=>({l:o.l, text:o.ta.value, base:o.base}))});
  const metrics=b=>{
    const cs=getComputedStyle(b.ta);
    ["fontFamily","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","wordSpacing","tabSize",
     "textIndent","textTransform","paddingTop","paddingLeft","paddingBottom",
     "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth"].forEach(k=>{ b.mir.style[k]=cs[k]; });
    // The box's scrollbar narrows its lines, so the mirror's right padding takes the same width.
    const bar=b.ta.offsetWidth-b.ta.clientWidth-parseFloat(cs.borderLeftWidth)-parseFloat(cs.borderRightWidth);
    b.mir.style.paddingRight=(parseFloat(cs.paddingRight)+Math.max(0,bar))+"px";
    b.over=b.ta.scrollHeight>b.ta.clientHeight;
  };
  const paint=(b,fl)=>{
    const bad=new Set((fl||findings(b)).filter(f=>f.kind==="field" && spoken.has(f.raw)).map(f=>f.at));
    b.mir.innerHTML=marginHtml(b.ta.value,known,bad);
    b.ta.classList.toggle("me-chipped",!!b.ta.value);
    if((b.ta.scrollHeight>b.ta.clientHeight)!==b.over) metrics(b);
    b.mir.scrollTop=b.ta.scrollTop;
  };
  const describe=(b,fl)=>{
    const f=(cur && box===b && fl.find(x=>marginSame(x,cur)))||fl[0];
    if(f) b.ta.setAttribute("aria-description",t("Finding: {HEADING}").replace("{HEADING}",()=>marginHeading(f,known)));
    else b.ta.removeAttribute("aria-description");
  };
  const tabFor=(b,l)=>{
    const pane=b.ta.closest(".lang-pane"), strip=pane&&pane.parentNode&&pane.parentNode.querySelector(".lang-tabs");
    return strip ? strip.querySelector('button[data-l="'+l+'"]') : null;
  };
  const unmarkTabs=()=>{ if(modalCard) modalCard.querySelectorAll(".lang-tabs .me-stale").forEach(x=>x.classList.remove("me-stale")); };
  /* THE TARGET SPANS THE BOX, so whichever side placeBubble() chooses lies outside it; where no side fits,
     the bubble stays hidden rather than cover the words being typed. */
  const place=()=>{
    if(!bub || !box) return;
    if(!box.ta.isConnected){ down(); return; }
    const r=box.ta.getBoundingClientRect();
    let target={left:r.left+24, width:0, top:r.top, height:r.height}, prefer="below";
    if(cur && cur.kind==="lang"){
      const tab=tabFor(box,cur.l), tr=tab&&tab.getBoundingClientRect();
      if(tr && tr.width){ target={left:tr.left, width:tr.width, top:tr.top, height:Math.max(tr.height,r.bottom-tr.top)}; prefer="above"; }
    } else if(cur){
      const sp=box.mir.querySelector('.me-bad[data-at="'+cur.at+'"]'), sr=sp&&sp.getClientRects()[0];
      if(sr){ const x=Math.max(r.left,Math.min(r.right,sr.left)); target.left=x; target.width=Math.max(0,Math.min(sr.width,r.right-x)); }
    }
    const res=(r.width&&r.height) ? placeBubble(bub,target,{prefer:prefer}) : {side:"none"};
    bub.style.visibility=res.side==="none" ? "hidden" : "";
  };
  const hide=()=>{
    clearTimeout(doneT);
    if(bub){ const b=bub; bub=null; dismissNode(b); }
    cur=null; folded=false;
    unmarkTabs();
  };
  const show=(b,fl,i,viaKey)=>{
    clearTimeout(doneT);
    const f=fl[i], was=bub&&!folded&&bub.style.visibility!=="hidden" ? bub.getBoundingClientRect() : null;
    if(!bub){
      bub=document.createElement("div");
      bub.className="bub bub-ask e-margin";
      bub.addEventListener("click",onAct);
      bub.addEventListener("keydown",onBubKey);
      bub.innerHTML=marginBubbleHtml(f,i+1,fl.length,known);
      document.body.appendChild(bub);
    } else bub.innerHTML=marginBubbleHtml(f,i+1,fl.length,known);
    box=b; cur=f; folded=false;
    unmarkTabs();
    if(f.kind==="lang"){ const tab=tabFor(b,f.l); if(tab) tab.classList.add("me-stale"); }
    paint(b,fl);
    place();
    if(was && !mgReduceMotion() && bub.animate){
      const now=bub.getBoundingClientRect(), dx=was.left-now.left, dy=was.top-now.top;
      if(dx||dy) bub.animate([{transform:"translate("+dx+"px,"+dy+"px)"},{transform:"none"}],{duration:M_MS.travel, easing:E_SPRING});
    }
    describe(b,fl);
    const head=marginHeading(f,known);
    marginSay(viaKey ? t("Finding {AT} of {ALL}: {HEADING}").replace("{AT}",i+1).replace("{ALL}",fl.length).replace("{HEADING}",()=>head)
      : head+(/[.?!]$/.test(head) ? " " : ". ")+marginLine(f));
  };
  const fold=words=>{
    const fl=findings(box);
    folded=true; cur=null;
    unmarkTabs();
    bub.innerHTML='<p class="e-margin-said">'+esc(fl.length ? words.replace("{N}",fl.length) : t("Every finding is answered."))+'</p>';
    if(!fl.length) doneT=setTimeout(hide,MARGIN_DONE_MS);
    spoken=new Set(fl.filter(f=>f.kind==="field" && spoken.has(f.raw)).map(f=>f.raw));
    paint(box,fl);
    place();
    describe(box,fl);
    marginSay(bub.textContent);
  };
  const pause=b=>{
    if(dead || active()!==b) return;
    const fl=findings(b);
    spoken=new Set(fl.filter(f=>f.kind==="field").map(f=>f.raw));
    paint(b,fl);
    describe(b,fl);
    if(!fl.length){ if(bub && !folded) hide(); return; }
    const i=(bub && !folded && box===b && cur) ? fl.findIndex(x=>marginSame(x,cur)) : -1;
    if(i>-1){ cur=fl[i]; bub.innerHTML=marginBubbleHtml(cur,i+1,fl.length,known); place(); return; }
    show(b,fl,0,false);
  };
  const onInput=e=>{
    const b=boxes.find(x=>x.ta===e.target);
    if(!b) return;
    const fl=findings(b);
    paint(b,fl);
    if(acting) return;
    if(bub && folded) hide();
    else if(bub && box===b){
      const i=cur ? fl.findIndex(x=>marginSame(x,cur)) : -1;
      if(i<0) hide();
      else { cur=fl[i]; place(); }
    }
    clearTimeout(pauseT);
    pauseT=setTimeout(()=>pause(b),MARGIN_PAUSE_MS);
  };
  const onScroll=e=>{
    const b=boxes.find(x=>x.ta===e.target);
    if(b) b.mir.scrollTop=b.ta.scrollTop;
    place();
  };
  // A chip names its field in the box's own tooltip, since the mirror over the box takes no pointer.
  const onMove=e=>{
    moveAt=e;
    if(moveRaf) return;
    moveRaf=requestAnimationFrame(()=>{
      moveRaf=0;
      const ev=moveAt, b=ev&&boxes.find(x=>x.ta===ev.target);
      if(!b) return;
      let tip="";
      b.mir.querySelectorAll(".me-chip").forEach(c=>{
        if(tip) return;
        Array.prototype.some.call(c.getClientRects(),r=>{
          if(ev.clientX<r.left || ev.clientX>r.right || ev.clientY<r.top || ev.clientY>r.bottom) return false;
          const raw=c.textContent, m=MARGIN_NAME.exec(raw.slice(1,-1)), what=m?marginWhat(m[1],known):"";
          tip=what ? raw+": "+what : raw;
          return true;
        });
      });
      if(tip) b.ta.title=tip; else b.ta.removeAttribute("title");
    });
  };
  const onKey=e=>{
    if(e.key!=="F8" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const b=active();
    if(!b) return;
    e.preventDefault();
    clearTimeout(pauseT);
    const fl=findings(b);
    if(!fl.length){ if(bub) hide(); describe(b,fl); return; }
    spoken=new Set(fl.filter(f=>f.kind==="field").map(f=>f.raw));
    const at=(bub && !folded && box===b && cur) ? fl.findIndex(x=>marginSame(x,cur)) : -1;
    show(b,fl,at<0 ? 0 : (at+1)%fl.length,true);
  };
  const onBubKey=e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation();
    const b=box; hide();
    if(b && b.ta.isConnected) b.ta.focus({preventScroll:true});
  };
  function onAct(e){
    const btn=e.target.closest && e.target.closest("button[data-act]");
    if(!btn || !cur || !box) return;
    const f=cur, b=box, act=btn.getAttribute("data-act");
    if(act==="fix"){
      const ta=b.ta, s0=ta.selectionStart, s1=ta.selectionEnd, d=f.sug.length-(f.end-f.at);
      const moved=p=>p>=f.end ? p+d : (p>f.at ? f.at+f.sug.length : p);
      const want=marginReplace(ta.value,f,f.sug);
      acting=true;
      try{
        ta.focus({preventScroll:true});
        ta.setSelectionRange(f.at,f.end);
        // insertText keeps the box's own undo; where it is refused the text is set and the edit announced.
        try{ document.execCommand("insertText",false,f.sug); }catch(x){}
        if(ta.value!==want){ ta.value=want; ta.dispatchEvent(new Event("input",{bubbles:true})); }
        ta.setSelectionRange(moved(s0),moved(s1));
      } finally { acting=false; }
      fold(t("Changed to {SUGGESTED}. Still to answer: {N}. F8: next").replace("{SUGGESTED}",()=>f.sug));
    } else if(act==="leave"){
      if(f.kind==="field") sil.fields[f.raw]=marginCount(b.ta.value,f.raw);
      else { const o=boxes.find(x=>x.l===f.l); sil.langs[f.l]=marginNorm(o?o.ta.value:""); }
      fold(t("Left as it is. Still to answer: {N}. F8: next"));
      b.ta.focus({preventScroll:true});
    } else if(act==="open"){
      const tab=tabFor(b,f.l), o=boxes.find(x=>x.l===f.l);
      hide();
      if(tab) tab.click();
      if(o) o.ta.focus({preventScroll:true});
    }
  }
  const onTabs=e=>{
    if(!e.target.closest || !e.target.closest(".lang-tabs button[data-l]")) return;
    clearTimeout(pauseT);
    hide();
  };
  const onResize=()=>{ boxes.forEach(b=>{ if(b.ta.offsetWidth) metrics(b); }); place(); };
  const ro=typeof ResizeObserver==="function" ? new ResizeObserver(onResize) : null;
  const mo=(typeof MutationObserver==="function" && modalCard) ? new MutationObserver(()=>{
    if(!modalCard.contains(boxes[0].ta)) down();
  }) : null;
  function down(){
    if(dead) return;
    dead=true;
    if(MG && MG.down===down) MG=null;
    clearTimeout(pauseT); clearTimeout(doneT);
    if(moveRaf) cancelAnimationFrame(moveRaf);
    if(bub){ const b=bub; bub=null; b.remove(); }
    unmarkTabs();
    boxes.forEach(b=>{
      b.ta.removeEventListener("input",onInput);
      b.ta.removeEventListener("scroll",onScroll);
      b.ta.removeEventListener("mousemove",onMove);
    });
    document.removeEventListener("keydown",onKey);
    removeEventListener("resize",onResize);
    if(modalCard){ modalCard.removeEventListener("click",onTabs); modalCard.removeEventListener("scroll",place,true); }
    if(ro) ro.disconnect();
    if(mo) mo.disconnect();
  }
  boxes.forEach(b=>{
    b.ta.addEventListener("input",onInput);
    b.ta.addEventListener("scroll",onScroll);
    b.ta.addEventListener("mousemove",onMove);
    if(ro) ro.observe(b.ta);
    if(b.ta.offsetWidth) metrics(b);
    paint(b);
  });
  document.addEventListener("keydown",onKey);
  addEventListener("resize",onResize);
  if(modalCard){ modalCard.addEventListener("click",onTabs); modalCard.addEventListener("scroll",place,true); }
  if(mo) mo.observe(modalCard,{childList:true});
  MG={down:down};
}

export {
  MARGIN_BARE,
  MARGIN_ARGS,
  marginKnown,
  marginTokens,
  marginNear,
  marginFindings,
  marginReplace,
  marginHtml,
  marginHeading,
  marginBubbleHtml,
  marginSame,
  marginSay,
  wireCardMargin
};
