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
import { ICON_LOCK, ICON_KEY, ICON_DESK } from "./icons.js";

let joinNow=null;                 // the shell's last answer: {sealed:{file,team}|null, join:{...}|null, leads:[{team,print,admitted,seen}]}
let joinShut="";                  // the answer the agent last hid the bubble on
let joinMode="";                  // "" | "paste" | "confirm" | "refused": the invitation, held on the page until it is answered
let joinOffer=null;               // {folder, lead, code, host, cloud, local} the shell read from joinRead
let joinBlob="";                  // the paste box's text while it is open, so a repaint keeps it
let joinRead="";                  // the text the shell read for the confirm on screen: yes sends this, never the box
let joinTyped="";                 // the check code the agent typed on the confirm
let joinWhy="";                   // the refusal's word, as the shell said it
let joinReads=0;                  // which read an answer belongs to: only the last one asked is shown
function eHasJoin(){
  const h=eHost();
  return !!h && typeof h.teamJoin==="function";
}
/* A failed call lets go of any invitation the page holds, and of what it shows. `before` sees the answer first and
   says whether it changed what the invitation shows. */
function joinAsk(op,file,name,check,before){
  if(!eHasJoin()) return Promise.resolve(null);
  let asked;
  try{ asked=Promise.resolve(eHost().teamJoin(op,file||"",name||"",check||"")); }
  catch(e){ asked=Promise.reject(e); }
  return asked.then(v=>joinTook(v,typeof before==="function"&&before(v)),()=>{
    const shown=joinMode!=="";
    dropInvite();
    if(shown) repaintJoin();
    return null;
  });
}
/* Lets go of every copy of an invitation the page holds; a read still in flight is then answered to nobody. */
function dropInvite(){
  joinMode=""; joinOffer=null; joinBlob=""; joinRead=""; joinTyped=""; joinWhy=""; joinReads++;
}
/* Whether the agent typed this invitation's check code, which the shell made at read and checks again at yes. */
function typedOk(){
  const want=joinOffer?joinOffer.code:"";
  return /^[0-9]{5}$/.test(want) && joinTyped.replace(/\s+/g,"")===want;
}
function typedWrong(){ return joinTyped.replace(/\s+/g,"").length>=5 && !typedOk(); }
/* What the page still holds of an invitation, for the legs that check it lets go. */
function inviteHeld(){
  return {mode:joinMode, draft:joinBlob, read:joinRead, typed:joinTyped, offer:joinOffer?Object.assign({},joinOffer):null};
}
/* What the empty desk and the bubble show: a lead's key not yet shown, a sealed catalog, or a request under way. */
function teamJoinShown(){
  return joinMode!=="" || (!!joinNow && (!!leadToShow() || !!joinNow.join || !!joinNow.sealed));
}
function teamCanJoin(){
  return eHasJoin() && !(joinNow && (joinNow.join || leadToShow()));
}
function leadToShow(){
  return ((joinNow&&joinNow.leads)||[]).filter(l=>l.admitted && !l.seen)[0]||null;
}
/* The leads this desk trusts, as the shell last said them. */
function teamLeads(){ return ((joinNow&&joinNow.leads)||[]).slice(); }
/* The same, asked of the shell now: a page that never showed the join has no answer to read. [] where there is none. */
function leadsNow(){
  if(!eHasJoin()) return Promise.resolve([]);
  try{ return Promise.resolve(eHost().teamJoin("leads")).then(v=>(v&&Array.isArray(v.leads))?v.leads:[],()=>[]); }
  catch(e){ return Promise.resolve([]); }
}
/* The key in four groups of four, as it is read aloud. */
function leadKeyText(print){ return String(print||"").replace(/(.{4})(?=.)/g,"$1 "); }
/* THE KEY'S SIGN: the four groups after a small disc that says whose, violet with a key for the lead's Studio key, cobalt
   with the desk glyph for a desk's, as Studio prints the same keys. */
function keySignHtml(kind,print){
  const desk=kind==="desk", word=t(desk?"A desk's key":"Studio's signing key");
  return '<span class="e-ksig"><span class="e-kdisc'+(desk?' desk':'')+'" role="img" aria-label="'+esc(word)+'">'
    +(desk?ICON_DESK:ICON_KEY)+'</span><span>'+esc(leadKeyText(print))+'</span></span>';
}
/* A sentence that prints a key, as a bubble's html: the words escaped, the key in fours wearing its sign. Null where the
   sentence does not hold that key, so the caller sets it as text. */
function keyTipHtml(tip,print,kind){
  const fours=print?leadKeyText(print):"";
  return fours && String(tip).indexOf(fours)>=0 ? String(tip).split(fours).map(esc).join(keySignHtml(kind,print)) : null;
}
/* The shell's answer to a read: the confirm for exactly the text that was read, or the refusal. An answer to an older
   read, or one that comes after the paste box was left, shows nothing. */
function readTook(v,n,sent){
  if(n!==joinReads || joinMode!=="paste") return false;
  const o=v&&typeof v==="object"?v.offer:null;
  if(o && typeof o.folder==="string"){
    joinOffer={folder:String(o.folder),lead:String(o.lead||""),code:String(o.code||""),
      host:String(o.host||""),cloud:String(o.cloud||""),local:o.local===true};
    joinRead=sent; joinBlob=""; joinTyped=""; joinWhy=""; joinMode="confirm";
  }else refuseInvite(v);
  return true;
}
/* The shell's answer to a yes: a refusal stays on screen with only its sentence, and anything else lets go. */
function yesTook(v,sent){
  if(joinRead!==sent) return false;
  if(v && typeof v==="object" && v.refused) refuseInvite(v);
  else dropInvite();
  return true;
}
function refuseInvite(v){
  const why=v&&typeof v==="object"&&typeof v.refused==="string"&&v.refused?v.refused:"unread";
  dropInvite();
  joinWhy=why; joinMode="refused";
}
function joinTook(v,changed){
  const s=v&&typeof v==="object"?v:{};
  const was=JSON.stringify(joinNow);
  joinNow={sealed:s.sealed&&s.sealed.file?{file:String(s.sealed.file),team:String(s.sealed.team||"")}:null,
           join:s.join&&(s.join.file||s.join.state)?{file:String(s.join.file||""),state:String(s.join.state||""),code:String(s.join.code||""),
                                      asked:+s.join.asked||0,name:String(s.join.name||"")}:null,
           leads:Array.isArray(s.leads)?s.leads.filter(l=>l&&l.team).map(l=>({team:String(l.team),print:String(l.print||""),
                                      admitted:l.admitted===true,seen:l.seen===true})):[]};
  /* Admitted, the catalog is loaded the way a Library row loads one: at once on an empty desk, asked over a loaded one. */
  if(s.joined && s.joined.file){ closeJoinBubble(); hooks.loadCatalogFromFolder(String(s.joined.file),0); }
  if(changed===true || JSON.stringify(joinNow)!==was) paintJoin();
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
function pastedText(){
  try{
    const el=document.querySelector("[data-join-paste]");
    if(el && typeof el.value==="string") return el.value;
  }catch(e){}
  return joinBlob;
}
function repaintJoin(){
  if(wholeThingEmpty()){ closeJoinBubble(); hooks.render(); return; }
  paintJoin();
}
function clearJoinAsk(){
  dropInvite();
  repaintJoin();
}
/* One door, from the empty desk and from a sealed catalog: the invitation is pasted here. */
function openJoinPaste(){
  if(!teamCanJoin()) return;
  dropInvite();
  joinMode="paste";
  repaintJoin();
}
function joinWhere(o){
  if(!o) return "";
  const host=o.host?t("This folder is on the computer {HOST}.").split("{HOST}").join(o.host):"";
  const cloud=o.cloud==="sharepoint"?t("This folder is a SharePoint library that OneDrive keeps in sync.")
    :o.cloud==="onedrive"?t("OneDrive keeps this folder in sync.")
    :o.cloud==="dropbox"?t("Dropbox keeps this folder in sync.")
    :o.cloud==="gdrive"?t("Google Drive keeps this folder in sync.")
    :o.local?t("Desks on other computers read this folder only if it is shared with them."):"";
  return [host,cloud].filter(Boolean).join(" ");
}
function joinInviteParts(){
  if(joinMode==="paste") return {title:t("Join a team"), line:t("Paste the invitation from the team's lead."),
    body:'<textarea class="e-join-paste" data-join-paste spellcheck="false" autocomplete="off" aria-label="'
      +esc(t("Paste the invitation from the team's lead."))+'">'+esc(joinBlob)+'</textarea>',
    acts:[["read",t("Continue")],["back",t("Cancel")]]};
  /* Neither the key nor the code is shown here: a code on the screen proves only that it was read off it. */
  if(joinMode==="confirm" && joinOffer){
    const o=joinOffer, ask=t("Ask the team's lead for this invitation's check code, and type its five digits here.");
    return {title:t("Join this team?"), line:joinWhere(o),
      body:'<div class="e-join-meta">'+esc(t("Folder: {FOLDER}").split("{FOLDER}").join(o.folder))+'</div>'
        +'<div class="e-join-meta">'+esc(t("Lead: {NAME}").split("{NAME}").join(o.lead))+'</div>'
        +'<div class="e-join-ask">'+esc(ask)+'</div>'
        +'<div class="e-join-why">'+esc(t("Only the real invitation gives this code, so it confirms the invitation comes from the team's own lead."))+'</div>'
        +'<input type="text" class="e-join-check" data-join-check maxlength="5" inputmode="numeric" spellcheck="false" autocomplete="off" aria-label="'
        +esc(t("Check"))+'" value="'+esc(joinTyped)+'">'
        +'<div class="e-join-ask e-join-miss" data-join-miss'+(typedWrong()?'':' hidden')+'>'
        +esc(t("This code does not match this invitation. Ask the lead again before joining."))+'</div>',
      acts:[["invite",t("Join this team"),!typedOk()],["back",t("Cancel")]]};
  }
  if(joinMode==="refused") return {title:t("Join a team"),
    line:joinWhy==="silent"?t("This folder could not be reached, so nothing was written.")
      :joinWhy==="pinned"?t("This invitation names a team this desk already knows, but with a different lead's key. It was not used, and nothing changed. Tell the team's lead about it.")
      :joinWhy==="barred"?t("This invitation names a team whose lead was forgotten on this desk. It was not used, and nothing changed. To join, ask from the team's catalog instead.")
      :joinWhy==="foreign"?t("This folder holds another team, or the same team under a different lead's key, so nothing was written. Tell the team's lead about it.")
      :joinWhy==="unreadable"?t("The team file in this folder could not be read, so this desk did not join and nothing was written. Let the team's lead know, so they can check the folder.")
      :joinWhy==="check"?t("This code does not match this invitation. Ask the lead again before joining.")
      :joinWhy==="policy"?t("The organisation's IT sets this desk's team, so invitations are turned off.")
      :t("This invitation cannot be read, so nothing was changed."),
    body:"", acts:[["back",t("Cancel")]]};
  return null;
}
/* The title, the line under it, and the acts, for whichever state the request is in. */
function joinParts(){
  const j=joinNow&&joinNow.join, s=joinNow&&joinNow.sealed, who=agentName()||t("this desk"), l=leadToShow();
  if(l) return {title:t("You are on the team"),
    line:t("Compare this key with the Signing key in the lead's Studio Settings. Every later edition is checked against it."),
    body:'<div class="e-join-key">'+keySignHtml("studio",l.print)+'</div>', acts:[["seen",t("It matches")],["forget",t("It does not match")]], lead:l.team};
  const invited=joinInviteParts();
  if(invited) return invited;
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
    acts:[["ask",t("Ask to join")],["join",t("Join a team")],["load",t("Load another catalog")]]};
}
function joinAct(act){
  const j=joinNow&&joinNow.join, s=joinNow&&joinNow.sealed;
  if(act==="join") return Promise.resolve(openJoinPaste());
  if(act==="back") return Promise.resolve(clearJoinAsk());
  if(act==="read"){
    const sent=pastedText(), n=++joinReads;
    joinBlob=sent;
    return joinAsk("read",sent,"","",v=>readTook(v,n,sent));
  }
  if(act==="invite"){
    if(joinMode!=="confirm" || !joinRead || !typedOk()) return Promise.resolve(null);
    const sent=joinRead;
    return joinAsk("invite",sent,agentName(),joinTyped,v=>yesTook(v,sent));
  }
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
    +'<div class="e-join-acts">'+p.acts.map(a=>'<button type="button" class="btn" data-join="'+a[0]+'"'+(a[2]?' disabled':'')+'>'
      +esc(a[1])+'</button>').join("")
    +'</div></div>';
}
/* The confirm's yes and its line for a wrong code follow the typing, with no repaint to take the caret away. */
function followCheck(root,el){
  joinTyped=String(el.value||"");
  if(!root || typeof root.querySelector!=="function") return;
  const yes=root.querySelector('[data-join="invite"]'), miss=root.querySelector("[data-join-miss]");
  if(yes) yes.disabled=!typedOk();
  if(miss) miss.hidden=!typedWrong();
}
function wireTeamJoinEmpty(root){
  if(!root) return;
  root.querySelectorAll("[data-join], [data-join-paste], [data-join-check]").forEach(el=>{
    if(el.hasAttribute && el.hasAttribute("data-join-paste")) el.oninput=()=>{ joinBlob=String(el.value||""); };
    else if(el.hasAttribute && el.hasAttribute("data-join-check")) el.oninput=()=>followCheck(root,el);
    else if(el.getAttribute && el.getAttribute("data-join")) el.onclick=()=>joinAct(el.getAttribute("data-join"));
  });
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
    +p.acts.map((a,i)=>'<button type="button" class="btn'+(i?'':' primary')+'" data-join="'+a[0]+'"'+(a[2]?' disabled':'')+'>'
      +esc(a[1])+'</button>').join("")
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
  // Hiding the lead's key counts as having been shown it; the key stays in Settings. Hiding an invitation lets it go.
  const hide=()=>{ joinShut=JSON.stringify(joinNow); dropInvite(); close(); if(p.lead) joinAsk("seen",p.lead); };
  wrap.addEventListener("keydown",e=>{ if(e.key!=="Escape") return; e.preventDefault(); e.stopPropagation(); hide(); });
  wrap.querySelectorAll("[data-join], [data-join-paste], [data-join-check]").forEach(el=>{
    if(el.hasAttribute("data-join-paste")){ el.oninput=()=>{ joinBlob=String(el.value||""); }; return; }
    if(el.hasAttribute("data-join-check")){ el.oninput=()=>followCheck(wrap,el); return; }
    const act=el.getAttribute("data-join");
    el.onclick=()=>{ if(act==="hide") return hide(); close(); joinAct(act); };
  });
}

/* Forgets a lead from Settings, then `then()` once the shell has answered. */
function forgetTeamLead(team,then){
  return joinAsk("forget",team).then(v=>{ if(typeof then==="function") then(); return v; });
}

export { wireTeamJoin, teamJoinShown, teamJoinEmptyHtml, wireTeamJoinEmpty, closeJoinBubble, teamLeads, leadsNow, leadKeyText, keySignHtml, keyTipHtml, forgetTeamLead, paintJoin, openJoinPaste, teamCanJoin, inviteHeld };
