/* Asking to join: the empty desk, a bubble where a catalog is open, and Join a team in Settings, the Library and
   the Menu. The shell keeps the request and says where it stands; this paints that answer and sends the agent's
   acts back. Joining leaves a catalog the desk already has loaded. Once admitted, the same place shows the pinned
   lead's key once, to compare with the lead's, and Settings lists every such team with a way to leave it. An
   invitation's wait names the lead and draws no code until the opening is read; the code then shows. */
import { eHost, eOnCatalogCopy } from "./host.js";
import { t, toast, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { wholeThingEmpty } from "./app-state.js";
import { agentName } from "./agent.js";
import { placeBubble } from "./bubble.js";
import { cutLeaves, dismissNode } from "./motion.js";
import { hooks } from "./hooks.js";
import { ICON_LOCK, ICON_KEY, ICON_DESK } from "./icons.js";
import { nsGet } from "./storage.js";
import { eNotice, dropNotice } from "./pack.js";

let joinNow=null;                 // the shell's last answer: {sealed:{file,team}|null, join:{...}|null, leads:[{team,print,admitted,seen,lead,folder,removed,policy}]}
let joinShut="";                  // the answer the agent last hid the bubble on
let joinMode="";                  // "" | "paste" | "confirm" | "refused": the invitation, held on the page until it is answered
let joinOffer=null;               // {folder, lead, code, host, cloud, local, left} the shell read from joinRead; {lead, team, relay} for a relay invitation, with link:true where the shell holds the link
let joinBlob="";                  // the paste box's text while it is open, so a repaint keeps it
let joinRead="";                  // the text the shell read for the confirm on screen: yes sends this, never the box
let joinTyped="";                 // the check code the agent typed on the confirm
let joinWhy="";                   // the refusal's word, as the shell said it
let joinLinkSaid=null;            // {en, pl} when a link was refused: the shell's two sentences, the secret never among them
let joinReads=0;                  // which read an answer belongs to: only the last one asked is shown
let lapseUp="";                   // "team|step|until" of the lapse notice on screen
const lapseDismissed=new Set();   // the same keys, dismissed here while the shell's answer is on its way
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
    syncJoinDoor();
    if(shown) repaintJoin();
    return null;
  });
}
/* Lets go of every copy of an invitation the page holds; a read still in flight is then answered to nobody. */
function dropInvite(){
  joinMode=""; joinOffer=null; joinBlob=""; joinRead=""; joinTyped=""; joinWhy=""; joinLinkSaid=null; joinReads++;
}
/* Whether the agent typed this invitation's check code, which the shell made at read and checks again at yes. */
function typedOk(){
  const want=joinOffer?joinOffer.code:"";
  return /^[0-9]{5}$/.test(want) && joinTyped.replace(/\s+/g,"")===want;
}
/* A relay invitation's confirm asks for no check code: the link itself is the lead's word. */
function relayConfirm(){ return !!(joinOffer && joinOffer.relay); }
function confirmReady(){ return relayConfirm() || typedOk(); }
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
  const unkept=!!(joinNow && joinNow.join && joinNow.join.unkept===true);
  const left=!!(joinNow && joinNow.join && (joinNow.join.keeps===false || joinNow.join.withdrawn===true));
  return eHasJoin() && (unkept || left || !(joinNow && (joinNow.join || leadToShow())));
}
function leadToShow(){
  return ((joinNow&&joinNow.leads)||[]).filter(l=>l.admitted && !l.seen && !l.removed)[0]||null;
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
   read, or one that comes after the paste box was left, shows nothing. A relay invitation is judged by what it is and not by
   how it arrived: its offer names the lead, the team and the relay's host, and it gets the link's confirm and no check code. */
function readTook(v,n,sent){
  if(n!==joinReads || joinMode!=="paste") return false;
  const o=v&&typeof v==="object"?v.offer:null;
  if(o && typeof o.relay==="string" && o.relay){
    joinOffer={lead:String(o.lead||""),team:String(o.team||""),relay:String(o.relay),code:"",left:String(o.left||"")};
    joinRead=sent; joinBlob=""; joinTyped=""; joinWhy=""; joinMode="confirm"; /* plant:paste-relay */
  }else if(o && typeof o.folder==="string"){
    joinOffer={folder:String(o.folder),lead:String(o.lead||""),code:String(o.code||""),
      host:String(o.host||""),cloud:String(o.cloud||""),local:o.local===true,left:String(o.left||""),
      relay:String(o.relay||""),team:String(o.team||"")};
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
/* The request as the page shows it. An invitation names its lead and keeps the code the shell sent. */
function joinShown(j){
  if(!j || !(j.file||j.state)) return null;
  const row={file:String(j.file||""),state:String(j.state||""),code:String(j.code||""),
    asked:+j.asked||0,name:String(j.name||""),team:String(j.team||"")};
  if(j.invite && typeof j.invite==="object") row.invite={lead:String(j.invite.lead||""),relay:String(j.invite.relay||"")};
  if(j.withdrawn===true) row.withdrawn=true;
  if(j.withdrawing===true) row.withdrawing=true;
  if(j.unkept===true) row.unkept=true;
  if(j.readonly===true) row.readonly=true;
  if(j.keeps===false) row.keeps=false;
  return row;
}
/* The Menu's Join a team follows the same rule as the other two doors: hidden while a request is in flight or a new key is still to be compared. */
function syncJoinDoor(){
  try{
    const el=document.getElementById("menuJoin");
    if(el) el.hidden=!teamCanJoin();
  }catch(e){}
}
/* The head the shell read, or nothing. A folder team sends no head, and a head that is not this shape is left off
   so the row stays as it was. */
function headKept(h){
  if(!h || typeof h!=="object") return null;
  const edition=typeof h.edition==="string"?h.edition:"", published=typeof h.published==="string"?h.published:"";
  if(edition.length<1 || edition.length>120 || published.length<1 || published.length>80 || !Number.isFinite(h.t)) return null;
  if(/[\u0000-\u001f\u007f]/.test(edition+published)) return null;
  return {edition:edition, published:published, t:h.t};
}
/* The lapse the shell judged for a relay team past its grant, or nothing: a team inside its grant sends none. */
const LAPSE_STEPS=["grace","read-only","lapsed","gone","unknown"];
const instantOk=v=>v===null || Number.isSafeInteger(v);
function lapseKept(v){
  if(!v || typeof v!=="object" || LAPSE_STEPS.indexOf(v.step)<0 || !instantOk(v.until) || !instantOk(v.readOnly) || !instantOk(v.swept)) return null;
  if(v.step==="grace" && (v.until===null || v.readOnly===null)) return null;
  return {step:v.step, until:v.until, readOnly:v.readOnly, swept:v.swept, seen:v.seen===true};
}
/* What each step says: its title, which the team's row in Settings shows, and the body the notice adds under it. A copy
   kept to a day the relay did not tell leaves that sentence out. */
function lapseWords(l){
  const day=ms=>leftDay(new Date(ms).toISOString());
  const kept=s=>l.swept===null?"":t(s).split("{DATE}").join(day(l.swept));
  const stay=t("The catalogs on this desk stay as they are and work as before.");
  if(l.step==="grace") return {title:t("The team's relay is due for renewal"),
    body:t("It fell due on {DATE}. Everything works as before until {READONLY}; after that the catalogs on this desk stay as they are, but nothing new passes between this desk and the team until the relay is renewed. The team's lead renews it in Studio; nothing is needed here.")
      .split("{DATE}").join(day(l.until)).split("{READONLY}").join(day(l.readOnly))};
  if(l.step==="read-only") return {title:t("The team's relay is read-only until renewed"),
    body:[t("The catalogs on this desk stay as they are and work as before; nothing new passes between this desk and the team."),
      kept("The relay keeps the team's copy until {DATE}."), t("The team's lead renews it in Studio.")].filter(Boolean).join(" ")};
  if(l.step==="lapsed") return {title:t("The team's relay has stopped"),
    body:[t("The licence or trial it came with has ended."), stay, kept("The relay keeps the team's copy until {DATE}."),
      t("The team's lead can start it again from Studio with a licence.")].filter(Boolean).join(" ")};
  if(l.step==="unknown") return {title:t("The relay does not know the team just now"), /* plant:lapse-unknown-words */
    body:t("The catalogs on this desk stay as they are and work as before; nothing new arrives through the relay. Either the relay cleared the team's copy after its licence ended, or the team has not reached the relay yet.")};
  return {title:t("The relay no longer holds the team's copy"), body:[stay, t("If the team's lead renews the licence, this desk rejoins by itself while it is still in the team; nothing is needed here.")].join(" ")};
}
/* The team's row in Settings says the title, for as long as the step lasts. */
function lapseNote(l){ return lapseWords(l).title; }
const lapseKey=l=>l.team+"|"+l.lapse.step+"|"+l.lapse.until;
/* One notice per step of each team's lapse, up until the agent dismisses it; a sync at the same step adds nothing. */
function syncLapseNotice(){
  if(typeof document==="undefined" || typeof document.getElementById!=="function") return;
  const l=((joinNow&&joinNow.leads)||[]).filter(x=>x.lapse && !x.lapse.seen && !lapseDismissed.has(lapseKey(x)))[0]||null;
  const want=l?lapseKey(l):"", up=document.getElementById("eTeamLapse");
  if(want===lapseUp && (!want || up)) return; /* plant:lapse-once */
  if(up) dropNotice(up);
  lapseUp=want;
  if(!l) return;
  const w=lapseWords(l.lapse), team=l.team, step=l.lapse.step;
  eNotice("eTeamLapse", w.title, w.body, ()=>{
    lapseDismissed.add(want);
    if(lapseUp===want) lapseUp="";
    joinAsk("lapse-seen", team, step);
  });
}
/* The relay told this desk it is no longer on the team. The notice says so, and only for that: a roster that has
   dropped the desk already has its own sentence, and this one must not promise that the catalog opens by itself,
   because the desk has stopped asking. */
let relayGoneUp="";
const relayGoneDismissed=new Set();
function syncRelayRemoved(){
  if(typeof document==="undefined" || typeof document.getElementById!=="function" || typeof document.createElement!=="function") return;
  const l=((joinNow&&joinNow.leads)||[]).filter(x=>x.relayRemoved===true && !relayGoneDismissed.has(x.team))[0]||null;
  const want=l?l.team:"", up=document.getElementById("eTeamRemoved");
  if(want===relayGoneUp && (!want || up)) return;
  if(up) dropNotice(up);
  relayGoneUp=want;
  if(!l) return;
  eNotice("eTeamRemoved", t("This team no longer includes this desk."),
    /* Claudette's words, 2026-10-27 01:23. */
    t("The catalogs on this desk stay as they are. A new invitation from the team's lead lets it in again."), ()=>{
      relayGoneDismissed.add(want);
      if(relayGoneUp===want) relayGoneUp="";
    });
}
function joinTook(v,changed){
  const s=v&&typeof v==="object"?v:{};
  const was=JSON.stringify(joinNow);
  joinNow={sealed:s.sealed&&s.sealed.file?{file:String(s.sealed.file),team:String(s.sealed.team||"")}:null,
           join:joinShown(s.join),
           leads:Array.isArray(s.leads)?s.leads.filter(l=>l&&l.team).map(l=>{
             const row={team:String(l.team),print:String(l.print||""),
               admitted:l.admitted===true,seen:l.seen===true,lead:String(l.lead||""),folder:String(l.folder||""),
               removed:l.removed===true,policy:l.policy===true};
             if(l.relayRemoved===true) row.relayRemoved=true;
             const head=headKept(l.head);
             if(head) row.head=head;
             const lapse=lapseKept(l.lapse);
             if(lapse) row.lapse=lapse;
             return row;
           }):[]};
  /* Admitted: an empty desk loads the catalog the invitation named. A desk that already has one keeps it. */
  if(s.joined && s.joined.file){
    closeJoinBubble();
    if(wholeThingEmpty() || nsGet("Sample")==="1") hooks.loadCatalogFromFolder(String(s.joined.file),0);
  }
  syncJoinDoor();
  syncLapseNotice();
  syncRelayRemoved();
  const refusal=s.linkRefusal;
  if(refusal && typeof refusal==="object" && typeof refusal.en==="string" && refusal.en){
    dropInvite();
    joinLinkSaid={en:String(refusal.en), pl:typeof refusal.pl==="string"?String(refusal.pl):""};
    joinWhy="link"; joinMode="refused";
    paintJoin();
    return joinNow;
  }
  const offer=s.offer;
  if(offer && offer.link===true && typeof offer.relay==="string" && offer.relay){
    joinOffer={lead:String(offer.lead||""), team:String(offer.team||""), relay:String(offer.relay), link:true, code:"", left:String(offer.left||"")};
    joinRead="link"; joinBlob=""; joinTyped=""; joinWhy=""; joinLinkSaid=null;
    joinMode="confirm"; /* plant:link-page */
    paintJoin();
    return joinNow;
  }
  if(changed===true || JSON.stringify(joinNow)!==was) paintJoin();
  return joinNow;
}
function noteCatalogCopy(){
  toast("At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team.");
}
function wireTeamJoin(){
  if(!eHasJoin()) return;
  if(typeof eHost().onTeamJoin==="function") eHost().onTeamJoin(joinTook);
  if(typeof eHost().onCatalogCopy==="function") eOnCatalogCopy(noteCatalogCopy);
  joinAsk("state");
  joinAsk("held");
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
/* One door, from the empty desk, from a sealed catalog, and from Settings, the Library and the Menu. */
function openJoinPaste(){
  if(!teamCanJoin()) return;
  dropInvite();
  joinMode="paste";
  repaintJoin();
}
/* Settings, the Library and the Menu share this door. It is the same paste, and it is there only while the desk can take an invitation. */
function joinDoorButton(id){
  if(!teamCanJoin()) return "";
  return '<button type="button" class="btn" id="'+esc(id)+'" title="'+esc(t("Paste the invitation from the team's lead."))+'">'+esc(t("Join a team"))+'</button>';
}
function joinDisclosure(){
  return '<div class="e-join-meta">'+esc(t("Once this desk joins, the team's lead can see which catalog it uses, by name and edition, and the lead's Studio can take a copy of it at any time, without asking here. The copy is sealed for the team, so anyone on the team can open it. The desk's use counts only in the team's totals, never on its own."))+'</div>';
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
      +esc(t("Paste the invitation from the team's lead."))+'">'+esc(joinBlob)+'</textarea>'+joinDisclosure(),
    acts:[["read",t("Continue")],["back",t("Cancel")]]};
  /* Neither the key nor the code is shown here: a code on the screen proves only that it was read off it. */
  if(joinMode==="confirm" && joinOffer){
    const o=joinOffer, ask=t("Ask the team's lead for this invitation's check code, and type its five digits here.");
    const title=o.left?t("This desk left this team on {DATE}. Join it again?").split("{DATE}").join(leftDay(o.left)):t("Join this team?");
    /* The relay link names the lead, the team and the host, and it asks for no code. */
    if(o.relay){
      const line=t("{LEAD} invites this desk to join the team through {HOST}.").split("{LEAD}").join(o.lead).split("{HOST}").join(o.relay);
      let disc="";
      disc=joinDisclosure(); /* plant:relay-confirm-disclosure */
      return {title:title, line:line,
        body:'<div class="e-join-meta">'+esc(t("Lead: {NAME}").split("{NAME}").join(o.lead))+'</div>'
          +'<div class="e-join-meta">'+esc(t("Team: {TEAM}").split("{TEAM}").join(o.team))+'</div>'
          +'<div class="e-join-meta">'+esc(t("Relay: {HOST}").split("{HOST}").join(o.relay))+'</div>'
          +disc,
        acts:[["invite",t("Join this team"),false],["back",t("Cancel")]]};
    }
    return {title:title, line:joinWhere(o),
      body:'<div class="e-join-meta">'+esc(t("Folder: {FOLDER}").split("{FOLDER}").join(o.folder))+'</div>'
        +'<div class="e-join-meta">'+esc(t("Lead: {NAME}").split("{NAME}").join(o.lead))+'</div>'
        +'<div class="e-join-ask">'+esc(ask)+'</div>'
        +'<div class="e-join-why">'+esc(t("Only the real invitation gives this code, so it confirms the invitation comes from the team's own lead."))+'</div>'
        +'<input type="text" class="e-join-check" data-join-check maxlength="5" inputmode="numeric" spellcheck="false" autocomplete="off" aria-label="'
        +esc(t("Check"))+'" value="'+esc(joinTyped)+'">'
        +'<div class="e-join-ask e-join-miss" data-join-miss'+(typedWrong()?'':' hidden')+'>'
        +esc(t("This code does not match this invitation. Ask the lead again before joining."))+'</div>'
        +joinDisclosure(),
      acts:[["invite",t("Join this team"),!typedOk()],["back",t("Cancel")]]};
  }
  if(joinMode==="refused" && joinWhy==="link" && joinLinkSaid){
    const said=uiLang()==="pl" && joinLinkSaid.pl ? joinLinkSaid.pl : joinLinkSaid.en;
    return {title:t("Join a team"), line:said, body:"", acts:[["back",t("Cancel")]]};
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
/* The day a desk left a team, in the interface's language, as About writes a day; the shell's ISO text where that fails. */
function leftDay(iso){
  const d=new Date(String(iso||"")), lang=uiLang();
  if(isNaN(d.getTime())) return String(iso||"");
  try{ return new Intl.DateTimeFormat(lang==="en"?"en-GB":lang,{day:"numeric",month:"long",year:"numeric"}).format(d); }
  catch(e){ return String(iso).slice(0,10); }
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
  /* An invitation waits under its lead's name only until the opening is read. The code then follows the request's own door. */
  if(j && j.invite && j.state==="waiting"){
    const lead=String(j.invite.lead||"").trim()||t("the lead");
    /* Claudette's words, 2026-10-27. */
    if(j.withdrawn===true) return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead), /* plant:e4-card */
      line:t("The request is withdrawn: the team's lead no longer sees it. This desk keeps what the invitation gave it, so Ask again sends the request anew without a new link."),
      body:meta, acts:[["ask",t("Ask again")]]};
    /* Claudette's words, 2026-10-27. */
    if(j.unkept===true) return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
      line:t("The relay could not withdraw this request, because it no longer keeps invitations that old. The team's lead may still see the request until it expires. To join after all, a new invitation from the team's lead is needed."),
      body:meta, acts:[["join",t("Join a team")],["load",t("Load another catalog")]]}; /* plant:c5-card-unkept */
    /* Claudette's words, 2026-10-27. */
    if(j.withdrawing===true && j.readonly===true) return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
      line:t("The request is being withdrawn. The team's relay is read-only until it is renewed, so it takes the withdrawal then, and until that the team's lead may still see the request. If the relay clears the team's copy first, the request goes with it."),
      body:meta, acts:[]}; /* plant:c5-card-held */
    /* Until the relay has taken the withdrawal the lead may still see the request, so the card says so, with nothing to press. Claudette's words, 2026-10-27. */
    if(j.withdrawing===true) return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
      line:t("The request is being withdrawn. The relay takes the withdrawal shortly, and until then the team's lead may still see the request."),
      body:meta, acts:[]}; /* plant:g2-card */
    /* Claudette's words, 2026-10-27. */
    if(j.keeps===false) return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
      line:t("This desk has left the team, so it no longer keeps what the invitation gave it. The request waits with the team's lead until it is answered."),
      body:meta, acts:[["join",t("Join a team")],["load",t("Load another catalog")]]};
    return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
      line:j.invite.relay?t("Waiting for the team's lead to let this desk in. Nothing more is needed here, and the team's catalogs are already open to work with.")
        :t("Waiting for the team's lead to let this desk in. Usually this happens by itself; if a code appears here, read it to the lead."),
      body:meta, acts:[["cancel",t("Cancel the request")]]};
  }
  /* A relay invitation the relay refused: its token was spent by another desk, it ended unused, or it was made before
     the team's lead removed this desk. Cancel the request clears it. */
  if(j && j.invite && j.invite.relay && j.state==="removed") return {title:t("Join a team"),
    /* Claudette's words, 2026-10-27. */
    line:t("This invitation was made before the team's lead removed this desk, so it no longer works. The lead can make a new one."),
    body:'<div class="e-join-meta">'+esc(t("Lead: {NAME}").split("{NAME}").join(String(j.invite.lead||"").trim()||t("the lead")))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Team: {TEAM}").split("{TEAM}").join(j.team))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Relay: {HOST}").split("{HOST}").join(j.invite.relay))+'</div>',
    acts:[["cancel",t("Cancel the request")],["load",t("Load another catalog")]]};
  if(j && j.invite && j.invite.relay && (j.state==="used" || j.state==="ended")) return {title:t("Join a team"),
    line:j.state==="used"?t("This invitation has already been used. Ask your lead for a new one."):t("This invitation has expired. Ask your lead for a new one."),
    body:'<div class="e-join-meta">'+esc(t("Lead: {NAME}").split("{NAME}").join(String(j.invite.lead||"").trim()||t("the lead")))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Team: {TEAM}").split("{TEAM}").join(j.team))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Relay: {HOST}").split("{HOST}").join(j.invite.relay))+'</div>',
    acts:[["cancel",t("Cancel the request")],["load",t("Load another catalog")]]};
  if(j && j.state==="code") return {title:t("Read this code to the team's lead"),
    line:t("They type it in Studio, and the catalog opens here once they let this desk in."),
    body:joinCodeHtml(j.code)+meta, acts:[["cancel",t("Cancel the request")]]};
  if(j && j.state==="refused") return {title:t("The lead turned the request down"),
    line:t("Asking again sends a new request."), body:meta, acts:[["ask",t("Ask again")],["load",t("Load another catalog")]]};
  if(j) return {title:t("Waiting for the lead to open the request"),
    line:t("The code to read to them appears here as soon as they do."), body:joinCodeHtml("")+meta,
    acts:[["cancel",t("Cancel the request")]]};
  const ask='<div class="e-join-meta">'+esc(t("Asks as {NAME}, the name in Settings.").split("{NAME}").join(who))+'</div>'+joinDisclosure();
  const acts=[["ask",t("Ask to join")],["join",t("Join a team")],["load",t("Load another catalog")]];
  /* A team whose roster no longer lists this desk says so in place of the ask a desk never on it gets. */
  const gone=s?((joinNow&&joinNow.leads)||[]).filter(x=>x.team===s.team && x.removed)[0]:null;
  if(gone){
    const title=gone.lead?t("{LEAD}'s team no longer includes this desk").split("{LEAD}").join(gone.lead):t("The team no longer includes this desk");
    let hushLine=false;
    hushLine=gone.relayRemoved===true; /* plant:h35-hush-card */
    /* Claudette's words, 2026-10-27. */
    if(hushLine) return {title:title,
      line:t("The relay says this desk is no longer on the team, so nothing new reaches it. The catalogs on it stay as they are. Once the team's lead lets this desk in again, the catalog opens here by itself."),
      body:ask, acts:acts};
    return {title:title, line:t("Once the team's lead lets this desk in again, the catalog opens here by itself."), body:ask, acts:acts};
  }
  return {title:t("{FILE} is sealed for its team").split("{FILE}").join(s?s.file:""),
    line:t("Once the team's lead lets this desk in, the catalog opens here by itself."), body:ask, acts:acts};
}
function joinAct(act){
  const j=joinNow&&joinNow.join, s=joinNow&&joinNow.sealed;
  if(act==="join") return Promise.resolve(openJoinPaste());
  if(act==="back"){
    if((joinOffer&&joinOffer.link) || (joinMode==="refused"&&joinWhy==="link"))
      return joinAsk("link-no","","","",()=>{ dropInvite(); return true; });
    return Promise.resolve(clearJoinAsk());
  }
  if(act==="read"){
    const sent=pastedText(), n=++joinReads;
    joinBlob=sent;
    return joinAsk("read",sent,"","",v=>readTook(v,n,sent));
  }
  if(act==="invite"){
    if(joinMode!=="confirm" || !joinOffer) return Promise.resolve(null);
    if(joinOffer.link) return joinAsk("link","",agentName(),"",v=>yesTook(v,"link"));
    /* A pasted relay invitation sends the text that was read and no code; a folder invitation sends the code the agent typed. */
    if(!joinRead || (!joinOffer.relay && !typedOk())) return Promise.resolve(null);
    const sent=joinRead;
    return joinAsk("invite",sent,agentName(),joinOffer.relay?"":joinTyped,v=>yesTook(v,sent));
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
  if(offer) dismissNode(offer);
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

/* Leaves a team from Settings: the shell forgets its lead and every key kept under it, as "It does not match" does, and
   remembers when it left, so a later invitation asks rather than refuses; the catalog in use stays. `then()` runs once the
   shell has answered. */
function forgetTeamLead(team,then){
  return joinAsk("leave",team).then(v=>{ if(typeof then==="function") then(); return v; });
}

export { lapseNote, wireTeamJoin, teamJoinShown, teamJoinEmptyHtml, wireTeamJoinEmpty, closeJoinBubble, teamLeads, leadsNow, leadKeyText, keySignHtml, keyTipHtml, forgetTeamLead, paintJoin, openJoinPaste, joinDoorButton, teamCanJoin, inviteHeld, noteCatalogCopy };
