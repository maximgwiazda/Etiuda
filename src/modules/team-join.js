/* Asking to join the team a sealed catalog in the folder belongs to: on the empty desk where nothing is loaded,
   and in a bubble from the catalog's name where a catalog is open. The shell keeps the request and says where it
   stands; this paints that answer and sends the agent's acts back. Once admitted, the same place shows the pinned
   lead's key once, to compare with the lead's, and Settings lists every such key with a way to forget it. */
import { eHost } from "./host.js";
import { t } from "./ui-lang.js";
import { esc } from "./esc.js";
import { wholeThingEmpty } from "./app-state.js";
import { agentName } from "./agent.js";
import { placeBubble } from "./bubble.js";
import { cutLeaves, dismissNode } from "./motion.js";
import { hooks } from "./hooks.js";
import { ICON_LOCK } from "./icons.js";

let joinNow=null;                 // the shell's last answer: {sealed:{file,team}|null, join:{...}|null, leads:[{team,print,admitted,seen}]}
let joinShut="";                  // the answer the agent last hid the bubble on
function eHasJoin(){
  const h=eHost();
  return !!h && typeof h.teamJoin==="function";
}
function joinAsk(op,file,name){
  if(!eHasJoin()) return Promise.resolve(null);
  try{ return Promise.resolve(eHost().teamJoin(op,file||"",name||"")).then(joinTook,()=>null); }
  catch(e){ return Promise.resolve(null); }
}
/* What the empty desk and the bubble show: a lead's key not yet shown, a sealed catalog, or a request under way. */
function teamJoinShown(){
  return !!joinNow && (!!leadToShow() || !!joinNow.join || !!joinNow.sealed);
}
function leadToShow(){
  return ((joinNow&&joinNow.leads)||[]).filter(l=>l.admitted && !l.seen)[0]||null;
}
/* The leads this desk trusts, as the shell last said them. */
function teamLeads(){ return ((joinNow&&joinNow.leads)||[]).slice(); }
/* The key in four groups of four, as it is read aloud. */
function leadKeyText(print){ return String(print||"").replace(/(.{4})(?=.)/g,"$1 "); }
function joinTook(v){
  const s=v&&typeof v==="object"?v:{};
  const was=JSON.stringify(joinNow);
  joinNow={sealed:s.sealed&&s.sealed.file?{file:String(s.sealed.file),team:String(s.sealed.team||"")}:null,
           join:s.join&&s.join.file?{file:String(s.join.file),state:String(s.join.state||""),code:String(s.join.code||""),
                                      asked:+s.join.asked||0,name:String(s.join.name||"")}:null,
           leads:Array.isArray(s.leads)?s.leads.filter(l=>l&&l.team).map(l=>({team:String(l.team),print:String(l.print||""),
                                      admitted:l.admitted===true,seen:l.seen===true})):[]};
  /* Admitted, the catalog is loaded the way a Library row loads one: at once on an empty desk, asked over a loaded one. */
  if(s.joined && s.joined.file){ closeJoinBubble(); hooks.loadCatalogFromFolder(String(s.joined.file),0); }
  if(JSON.stringify(joinNow)!==was) paintJoin();
  return joinNow;
}
function wireTeamJoin(){
  if(!eHasJoin()) return;
  if(typeof eHost().onTeamJoin==="function") eHost().onTeamJoin(joinTook);
  joinAsk("state");
}
function paintJoin(){
  if(wholeThingEmpty()){ closeJoinBubble(); hooks.render(); return; }
  if(teamJoinShown() && JSON.stringify(joinNow)!==joinShut) openJoinBubble();
  else if(!teamJoinShown()) closeJoinBubble();
}
function joinTime(ms){
  const d=new Date(ms||Date.now());
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}
/* The six digits in two threes, or six empty places while there is no code yet; the gap and the places are drawn. */
function joinCodeHtml(code){
  return code?'<div class="e-join-code"><span>'+esc(code.slice(0,3))+'</span><span>'+esc(code.slice(3))+'</span></div>'
    :'<div class="e-join-code e-join-wait" aria-hidden="true"><span><i></i><i></i><i></i></span><span><i></i><i></i><i></i></span></div>';
}
/* The title, the line under it, and the acts, for whichever state the request is in. */
function joinParts(){
  const j=joinNow&&joinNow.join, s=joinNow&&joinNow.sealed, who=agentName()||t("this desk"), l=leadToShow();
  if(l) return {title:t("You are on the team"),
    line:t("Compare this key with the Signing key in the lead's Studio Settings. Every later edition is checked against it."),
    body:'<div class="e-join-key">'+esc(leadKeyText(l.print))+'</div>', acts:[["seen",t("It matches")],["forget",t("It does not match")]], lead:l.team};
  const meta=j?'<div class="e-join-meta">'+esc(t("{NAME}, asked at {TIME}").split("{NAME}").join(j.name||who)
    .split("{TIME}").join(joinTime(j.asked)))+'</div>':'';
  if(j && j.state==="code") return {title:t("Read this code to the team's lead"),
    line:t("They type it in Studio, and the catalog opens here once they let this desk in."),
    body:joinCodeHtml(j.code)+meta, acts:[["cancel",t("Cancel the request")]]};
  if(j && j.state==="refused") return {title:t("The lead turned the request down"),
    line:t("Asking again sends a new request."), body:meta, acts:[["ask",t("Ask again")],["load",t("Load another catalog")]]};
  if(j) return {title:t("Waiting for the lead to open the request"),
    line:t("The code to read to them appears here as soon as they do."), body:joinCodeHtml("")+meta,
    acts:[["cancel",t("Cancel the request")]]};
  return {title:t("{FILE} is sealed for its team").split("{FILE}").join(s?s.file:""),
    line:t("Once the team's lead lets this desk in, the catalog opens here by itself."),
    body:'<div class="e-join-meta">'+esc(t("Asks as {NAME}, the name in Settings.").split("{NAME}").join(who))+'</div>',
    acts:[["ask",t("Ask to join")],["load",t("Load another catalog")]]};
}
function joinAct(act){
  const j=joinNow&&joinNow.join, s=joinNow&&joinNow.sealed;
  if(act==="ask") return joinAsk("ask",(j&&j.file)||(s&&s.file)||"",agentName());
  if(act==="cancel") return joinAsk("cancel");
  const l=leadToShow();
  if(act==="seen" && l) return joinAsk("seen",l.team);
  if(act==="forget" && l) return joinAsk("forget",l.team);
  if(act==="load") return Promise.resolve(hooks.importCatalogHere());
  return Promise.resolve(null);
}
/* The empty desk's block, or "" where there is nothing sealed to say. */
function teamJoinEmptyHtml(){
  if(!teamJoinShown()) return "";
  const p=joinParts();
  return '<div class="empty e-join"><div class="e-join-t">'+ICON_LOCK+esc(p.title)+'</div>'
    +'<p>'+esc(p.line)+'</p>'+p.body
    +'<div class="e-join-acts">'+p.acts.map(a=>'<button type="button" class="btn" data-join="'+a[0]+'">'+esc(a[1])+'</button>').join("")
    +'</div></div>';
}
function wireTeamJoinEmpty(root){
  if(!root) return;
  root.querySelectorAll("[data-join]").forEach(b=>{ b.onclick=()=>joinAct(b.getAttribute("data-join")); });
}
/* THE BUBBLE, where a catalog is already open: hung from the catalog's name as the offer is, one at a time, and back
   only when the answer it was hidden on changes. */
let joinBubbleClose=null;
function closeJoinBubble(){ if(joinBubbleClose) joinBubbleClose(); }
function openJoinBubble(){
  closeJoinBubble();
  const offer=document.getElementById("eCatalogOffer");
  if(offer && !offer.classList.contains("e-gone")) return;
  const p=joinParts();
  const wrap=document.createElement("div");
  wrap.className="bub bub-ask e-offer e-join-bub";
  wrap.id="eTeamJoin";
  wrap.setAttribute("role","dialog");
  wrap.setAttribute("aria-labelledby","ejTitle");
  wrap.innerHTML='<h3 id="ejTitle">'+esc(p.title)+'</h3><p class="ec-sub">'+esc(p.line)+'</p>'+p.body
    +'<div class="tour-actions"><button type="button" class="btn" data-join="hide">'+esc(t("Hide"))+'</button>'
    +p.acts.map((a,i)=>'<button type="button" class="btn'+(i?'':' primary')+'" data-join="'+a[0]+'">'+esc(a[1])+'</button>').join("")
    +'</div>';
  cutLeaves();
  document.body.appendChild(wrap);
  const place=()=>{
    const at=document.getElementById("catNow"), r=at && at.getBoundingClientRect();
    placeBubble(wrap,(r && r.width)?{top:r.top,left:r.left,width:r.width,height:r.height}
      :{top:0,left:innerWidth-24,width:0,height:40},{width:340});
  };
  place();
  addEventListener("resize",place);
  const close=()=>{ removeEventListener("resize",place); dismissNode(wrap); if(joinBubbleClose===close) joinBubbleClose=null; };
  joinBubbleClose=close;
  // Hiding the lead's key counts as having been shown it; the key stays in Settings.
  const hide=()=>{ joinShut=JSON.stringify(joinNow); close(); if(p.lead) joinAsk("seen",p.lead); };
  wrap.addEventListener("keydown",e=>{ if(e.key!=="Escape") return; e.preventDefault(); e.stopPropagation(); hide(); });
  wrap.querySelectorAll("[data-join]").forEach(b=>{
    const act=b.getAttribute("data-join");
    b.onclick=()=>{ if(act==="hide") return hide(); close(); joinAct(act); };
  });
}

/* Forgets a lead from Settings, then `then()` once the shell has answered. */
function forgetTeamLead(team,then){
  return joinAsk("forget",team).then(v=>{ if(typeof then==="function") then(); return v; });
}

export { wireTeamJoin, teamJoinShown, teamJoinEmptyHtml, wireTeamJoinEmpty, closeJoinBubble, teamLeads, leadKeyText, forgetTeamLead, paintJoin };
