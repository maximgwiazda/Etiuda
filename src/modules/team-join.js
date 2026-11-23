/* Asking to join: the empty desk and a bubble where a catalog is open.
   The shell keeps the request and says where it stands; this paints that answer and sends the agent's
   acts back. Joining leaves a catalog the desk already has loaded. Once admitted, the same place shows the pinned
   lead's key once, to compare with the lead's, and Settings lists every such team with a way to leave it. A team is
   joined over the relay, by a link or by an invitation to the person's address: no code is shown, typed or read out,
   and no invitation is pasted (board 1017; the shared folder's join went with it). */
import { eHost, eOnCatalogCopy } from "./host.js";
import { t, toast, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { wholeThingEmpty } from "./app-state.js";
import { agentName } from "./agent.js";
import { placeBubble, hangBubble } from "./bubble.js";
import { cutLeaves, dismissNode } from "./motion.js";
import { hooks } from "./hooks.js";
import { ICON_LOCK, ICON_KEY, ICON_DESK } from "./icons.js";
import { nsGet } from "./storage.js";
import { eNotice, dropNotice } from "./pack.js";
import { setStatsWithheld } from "./desk-stats.js";

let joinNow=null;                 // the shell's last answer: {sealed:{file,team}|null, join:{...}|null, leads:[{team,print,admitted,seen,lead,folder,removed,policy}]}
let joinShut="";                  // the answer the agent last hid the bubble on
let joinMode="";                  // "" | "confirm" | "refused": the invitation, held on the page until it is answered
let joinOffer=null;               // {lead, team, relay, left} for a relay invitation, with link:true where the shell holds the link
let joinRead="";                  // "link" while the shell holds the link the confirm on screen is for: yes names it
let joinDoubt="";                 // the team whose "It does not match" is being asked about once before its keys go
let joinWhy="";                   // the refusal's word, as the shell said it
let joinLinkSaid=null;            // {en, pl} when a link was refused: the shell's two sentences, the secret never among them
let lapseUp="";                   // "team|step|until" of the lapse notice on screen
const lapseDismissed=new Set();   // the same keys, dismissed here while the shell's answer is on its way
let joinGate=null;                // door gate wired from main.js to avoid a signin.js <-> team-join.js import cycle
let pendingInvite=null;           // latest link or pasted invitation held while the door stands
let pendingJoinLoad="";           // latest admission/opens catalog file held while the door stands
function joinDoorHolds(){
  return !!(joinGate && typeof joinGate.holds==="function" && joinGate.holds());
}
function whenJoinDoorOpens(fn){
  if(joinGate && typeof joinGate.whenOpen==="function"){ joinGate.whenOpen(fn); return; }
  fn();
}
function replayJoinLoad(){
  if(joinDoorHolds()) return;
  const file=pendingJoinLoad; pendingJoinLoad="";
  if(file && (wholeThingEmpty() || nsGet("Sample")==="1")) hooks.loadCatalogFromFolder(file,0);
}
function replayPendingInvite(){
  if(joinDoorHolds()) return;
  const inv=pendingInvite; pendingInvite=null;
  if(!inv) return;
  if(inv.kind==="link" && inv.offer){
    joinOffer=Object.assign({}, inv.offer);
    joinRead="link"; joinWhy=""; joinLinkSaid=null;
    joinMode="confirm";
    paintJoin();
  }else if(inv.kind==="link-refusal" && inv.refusal){
    dropInvite();
    joinLinkSaid=Object.assign({}, inv.refusal);
    joinWhy="link"; joinMode="refused";
    paintJoin();
  }
}
let contentNow=null;              // {team, told, private:[ids], listed:[ids]} from teamJoin("content")
const toldDismissed=new Set();    // teams whose one-time told notice was dismissed while content-said is in flight
const contentHeard=[];
function onContentChanged(fn){ if(contentHeard.indexOf(fn)<0) contentHeard.push(fn); }
function contentChanged(){ contentHeard.slice().forEach(fn=>{ try{ fn(contentNow); }catch(e){} }); }
/* The shell's answer carries `told`; nothing else is read for it. */
function normalizeContent(v){
  if(!v || typeof v!=="object") return null;
  const team=typeof v.team==="string"?v.team:"";
  const told=v.told===true;
  return {
    team:team,
    told:told,
    private:Array.isArray(v.private)?v.private.map(String):[],
    listed:Array.isArray(v.listed)?v.listed.map(String):[],
    teamCatalogPins:Array.isArray(v.teamCatalogPins)?v.teamCatalogPins.map(String):[]
  };
}
function setContentNow(v){
  const next=normalizeContent(v);
  if(!next) return null;
  const same=JSON.stringify(contentNow)===JSON.stringify(next);
  contentNow=next;
  syncToldNotice();
  if(!same) contentChanged();
  return contentNow;
}
function teamContentNow(){ return contentNow; }
/* The catalog in use, by the id its layer is kept under, is marked private here: a day counted now is kept off the
   lead's answer (desk-stats.js). */
function inUsePrivateNow(){
  const cur=hooks.storedCatalog(), id=cur && cur.id ? String(cur.id) : "";
  return !!id && !!contentNow && contentNow.private.indexOf(id)>=0;
}
setStatsWithheld(inUsePrivateNow);
function teamContent(){
  if(!eHasJoin()) return Promise.resolve(null);
  let asked;
  try{ asked=Promise.resolve(eHost().teamJoin("content","","")); }
  catch(e){ asked=Promise.reject(e); }
  return asked.then(v=>setContentNow(v),()=>null);
}
function sendContentSaid(team){
  team=String(team||"");
  if(!eHasJoin() || !team) return Promise.resolve(null);
  let asked;
  try{ asked=Promise.resolve(eHost().teamJoin("content-said",team,"")); }
  catch(e){ asked=Promise.reject(e); }
  return asked.then(v=>setContentNow(v),()=>null);
}
function markCatalogPrivate(id,on){
  id=String(id||"");
  if(!eHasJoin() || !id) return Promise.resolve(null);
  let asked;
  try{ asked=Promise.resolve(eHost().teamJoin("private",id,on?"on":"off")); }
  catch(e){ asked=Promise.reject(e); }
  return asked.then(v=>setContentNow(v),()=>null);
}
function eHasJoin(){
  const h=eHost();
  return !!h && typeof h.teamJoin==="function";
}
/* A failed call lets go of any invitation the page holds, and of what it shows. `before` sees the answer first and
   says whether it changed what the invitation shows. */
function joinAsk(op,file,name,before){
  if(!eHasJoin()) return Promise.resolve(null);
  let asked;
  try{ asked=Promise.resolve(eHost().teamJoin(op,file||"",name||"")); }
  catch(e){ asked=Promise.reject(e); }
  return asked.then(v=>joinTook(v,typeof before==="function"&&before(v)),()=>{
    const shown=joinMode!=="";
    dropInvite();
    if(shown) repaintJoin();
    return null;
  });
}
/* Lets go of every copy of an invitation the page holds. */
function dropInvite(){
  joinMode=""; joinOffer=null; joinRead=""; joinWhy=""; joinLinkSaid=null; joinDoubt="";
}
/* What the page still holds of an invitation, for the legs that check it lets go. */
function inviteHeld(){
  return {mode:joinMode, read:joinRead, offer:joinOffer?Object.assign({},joinOffer):null};
}
/* Whether an invitation is held, or the join stands on screen as the empty desk's form or the bubble: what the tour gives way to. */
function joinStands(){
  if(joinMode!=="") return true;
  try{ return !!document.querySelector(".empty.e-join, #eTeamJoin:not(.e-gone)"); }catch(e){ return false; }
}
/* What follows the join on screen, told after each paint: the tour (tour.js), which steps behind it and starts only once it is gone. */
const joinHeard=[];
function onJoinPainted(fn){ if(joinHeard.indexOf(fn)<0) joinHeard.push(fn); }
function joinPainted(){ joinHeard.slice().forEach(fn=>{ try{ fn(); }catch(e){} }); }
/* What the empty desk and the bubble show: a lead's key not yet shown, a sealed catalog, or a request under way. */
function teamJoinShown(){
  return joinMode!=="" || (!!joinNow && (!!leadToShow() || !!joinNow.join || !!joinNow.sealed));
}
function teamCanJoin(){
  const unkept=!!(joinNow && joinNow.join && joinNow.join.unkept===true);
  const left=!!(joinNow && joinNow.join && (joinNow.join.left===true || joinNow.join.doubted===true || joinNow.join.keeps===false || joinNow.join.withdrawn===true));
  return eHasJoin() && (unkept || left || !(joinNow && (joinNow.join || leadToShow())));
}
function leadToShow(){
  return ((joinNow&&joinNow.leads)||[]).filter(l=>l.admitted && !l.seen && !l.removed)[0]||null;
}
/* The leads this desk trusts, as the shell last said them. */
function teamLeads(){ return ((joinNow&&joinNow.leads)||[]).slice(); }
function relayDesk(){ return !!(joinNow&&joinNow.onRelay===true); }
function teamPolicySaid(){ return ((joinNow&&joinNow.policySaid)||[]).slice(); }
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
/* The shell's answer to a yes: a refusal stays on screen with only its sentence, a cancelled picker keeps the confirmation card as it was, and anything else lets go. */
function yesTook(v,sent){
  if(joinRead!==sent) return false;
  if(v && typeof v==="object" && v.canceled) return false; /* plant:picker-cancel */
  if(v && typeof v==="object" && v.refused) refuseInvite(v);
  else dropInvite();
  return true;
}
function refuseInvite(v){
  const why=v&&typeof v==="object"&&typeof v.refused==="string"&&v.refused?v.refused:"unread";
  dropInvite();
  joinWhy=why; joinMode="refused";
}
/* The request as the page shows it. An invitation names its lead. */
function joinShown(j){
  if(!j || !(j.file||j.state)) return null;
  const row={file:String(j.file||""),state:String(j.state||""),
    asked:+j.asked||0,name:String(j.name||""),team:String(j.team||"")};
  if(j.invite && typeof j.invite==="object") row.invite=Object.assign({lead:String(j.invite.lead||""),relay:String(j.invite.relay||"")}, j.invite.wrapped ? {wrapped:true} : {},
    j.invite.open===true ? {open:true} : {}, j.invite.door===true ? {door:true} : {});
  if(j.withdrawn===true) row.withdrawn=true;
  if(j.withdrawing===true) row.withdrawing=true;
  if(j.unkept===true) row.unkept=true;
  if(j.readonly===true) row.readonly=true;
  if(j.keeps===false) row.keeps=false;
  if(j.left===true) row.left=true;
  if(j.doubted===true) row.doubted=true;
  if(j.paused===true) row.paused=true;
  return row;
}
/* The head the shell read, or nothing. A folder team sends no head, and a head that is not this shape is left off
   so the row stays as it was. */
function headKept(h){
  if(!h || typeof h!=="object") return null;
  const edition=typeof h.edition==="string"?h.edition:"", published=typeof h.published==="string"?h.published:"";
  if(edition.length<1 || edition.length>120 || published.length<1 || published.length>80 || !Number.isFinite(h.t)) return null;
  if(/[\u0000-\u001f\u007f]/.test(edition+published)) return null;
  const kept={edition:edition, published:published, t:h.t};
  const list=headEntriesKept(h.editions), named=list ? headNamed(list, edition, published) : null;
  if(named){ kept.editions=list; kept.catalog=named.catalog; }
  return kept;
}
/* Each catalog's entry the shell kept, or nothing where one is not that shape, so the note says only what it said before. */
function headEntriesKept(list){
  if(!Array.isArray(list) || !list.length || list.length>64) return null;
  const out=[], ids=new Set();
  for(const e of list){
    if(!e || typeof e!=="object" || typeof e.catalog!=="string" || e.catalog.length<1 || e.catalog.length>200 || ids.has(e.catalog)
      || !Number.isInteger(e.rev) || typeof e.edition!=="string" || typeof e.published!=="string" || e.edition.length>120
      || e.published.length>80 || /[\u0000-\u001f\u007f]/.test(e.catalog+e.edition+e.published)) return null;
    ids.add(e.catalog);
    out.push({catalog:e.catalog, rev:e.rev, edition:e.edition, published:e.published, newer:e.newer===true});
  }
  return out;
}
/* The entry the row's edition and date came from. The shell names the catalog in use where the head lists it, else the
   greatest rev, the last of a tie; two catalogs published on one day share both, so the catalog this page holds decides. */
function headNamed(list, edition, published){
  const same=list.filter(e=>e.edition===edition && e.published===published);
  if(same.length<2) return same[0]||null;
  const c=typeof window!=="undefined" && window.E_CATALOG && typeof window.E_CATALOG==="object" ? String(window.E_CATALOG.id||"") : "";
  let pick=same.filter(e=>e.catalog===c)[0]||null;
  if(!pick) for(const e of same) if(!pick || e.rev>=pick.rev) pick=e;
  return pick;
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
    body:[t("The catalogs on this desk stay as they are and work as before; nothing new arrives through the relay. Either the relay cleared the team's copy after its licence ended, or the team has not reached the relay yet."),
      t("When the team is back on the relay, this desk follows by itself while it is still in the team; nothing is needed here.")].join(" ")};
  return {title:t("The relay no longer holds the team's copy"), body:[stay, t("If the team's lead renews the licence, this desk rejoins by itself while it is still in the team; nothing is needed here.")].join(" ")};
}
/* The team's row in Settings says the title, for as long as the step lasts. */
function lapseNote(l){ return lapseWords(l).title; }
/* A write this desk owes the shared folder that the folder refuses as read-only, one sentence a file, until it lands. */
/* A conflict copy the relay channel kept on this computer beside the team's edition, never sent: one sentence a copy, by its file name,
   for the three the shell names, then one sentence counting the rest. */
function keptApartNotes(l){
  const out=(Array.isArray(l&&l.keptApart)?l.keptApart:[]).filter(f=>typeof f==="string"&&f).map(f=>
    t("{FILE} was not sent to the team: the team's edition had changed in the meantime, from another computer or from an earlier send of this one. It is kept beside the catalog in the team's folder on this computer, and can be opened and published again if it is the edition wanted.").split("{FILE}").join(f));
  const more=l&&Number.isSafeInteger(l.keptApartMore)&&l.keptApartMore>0?l.keptApartMore:0;
  if(out.length&&more) out.push(t("More files kept the same way: {N}.").split("{N}").join(String(more))); /* plant:kept-apart-more-shown */
  return out;
}
function shareRefusedNotes(l){
  return (Array.isArray(l&&l.shareRefused)?l.shareRefused:[]).filter(r=>r&&typeof r.file==="string"&&r.file).map(r=>(r.kind==="folder"
    ? t("The team's shared folder is read-only where {FILE} goes, so this desk keeps the change and tries again at each check.")
    : t("{FILE} is marked read-only in the team's shared folder, so this desk keeps the change and tries again at each check.")
  ).split("{FILE}").join(r.file));
}
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
/* The team's lead key seen in two hands, as the shell keeps it: "two" where the desk follows neither successor, "later"
   where a key it followed on was handed on again. Claudette's words, 2026-11-01 01:04, the first sentence the notice's lead. */
function forkKept(v){
  if(!v||typeof v!=="object"||(v.kind!=="two"&&v.kind!=="later")) return null;
  const o={kind:v.kind,seen:v.seen===true};
  if(typeof v.key==="string"&&/^[0-9a-f]{64}$/.test(v.key)) o.key=v.key;
  return o;
}
function forkWords(kind){
  if(kind==="two") return {title:t("This team's lead key was handed to two different new keys at once, so this desk follows neither."),
    body:t("The catalogs on it stay as they are. Tell the team's lead about it.")};
  return {title:t("Someone has used this team's old lead key to hand the team to another key as well, so that key is evidently in someone else's hands."),
    body:t("This desk stays with the key it already follows, and the catalogs on it stay as they are. Tell the team's lead about it.")};
}
let forkUp="";
const forkDismissed=new Set();
/* The notice is one per fork key. Without a key it stays one per team and kind, as a row that names none still can. */
function forkNoteKey(x){
  let k=x.team+"|"+(x.fork&&x.fork.kind);
  if(x.fork&&typeof x.fork.key==="string"&&/^[0-9a-f]{64}$/.test(x.fork.key)) k=x.fork.key; /* plant:fork-note-key */
  return k;
}
/* One notice per fork the shell keeps, up until the agent dismisses that fork. */
function syncForkNotice(){
  if(typeof document==="undefined" || typeof document.getElementById!=="function") return;
  const l=((joinNow&&joinNow.leads)||[]).filter(x=>x.fork && !x.fork.seen && !forkDismissed.has(forkNoteKey(x)))[0]||null;
  const want=l?forkNoteKey(l):"", up=document.getElementById("eTeamFork");
  if(want===forkUp && (!want || up)) return;
  if(up) dropNotice(up);
  forkUp=want;
  if(!l) return;
  const w=forkWords(l.fork.kind), team=l.team;
  eNotice("eTeamFork", w.title, w.body, ()=>{
    forkDismissed.add(want);
    if(forkUp===want) forkUp="";
    joinAsk("fork-seen", team);
  });
}
/* Left behind by a handover to a key with a box of its own and the key change after it, as the shell keeps it. The
   copywriter's words, the first sentence the notice's lead. */
let strandedUp="";
const strandedDismissed=new Set();
function syncStrandedNotice(){
  if(typeof document==="undefined" || typeof document.getElementById!=="function") return;
  const l=((joinNow&&joinNow.leads)||[]).filter(x=>x.stranded && !x.stranded.seen && !strandedDismissed.has(x.team))[0]||null;
  const want=l?l.team:"", up=document.getElementById("eTeamStranded");
  if(want===strandedUp && (!want || up)) return;
  if(up) dropNotice(up);
  strandedUp=want;
  if(!l) return;
  eNotice("eTeamStranded", t("While this desk was switched off, the team moved to a new key and its keys were secured anew, so this desk cannot open what comes next."),
    t("It sends nothing new to the team, and everything on this computer stays as it is. To join, a new invitation from the team's lead is needed."), ()=>{
      strandedDismissed.add(want);
      if(strandedUp===want) strandedUp="";
      joinAsk("stranded-seen", want);
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
/* The team's file names a relay this build does not use: the copywriter's two sentences, {TEAM} as the row names the team. */
function relayElsewhereWords(l){
  const team=l&&l.lead?t("{LEAD}'s team").split("{LEAD}").join(l.lead):t("Team");
  return {lead:t("The team file of {TEAM} names a relay this Etiuda does not use, so this desk does not follow it: it keeps its team, its catalog and its connection as they were, and sends nothing there.").split("{TEAM}").join(team), body:t("If the team moves back, nothing is needed; otherwise a new invitation from the team's lead is.")};
}
/* The team's row in Settings says both, for as long as the file names that relay. */
function relayElsewhereNote(l){ const w=relayElsewhereWords(l); return w.lead+" "+w.body; }
/* A team this desk holds through a shared folder, which Etiuda no longer follows: the copywriter's sentence, {TEAM} as the row names
   the team. */
function folderHeldNote(l){
  const team=l&&l.lead?t("{LEAD}'s team").split("{LEAD}").join(l.lead):t("Team");
  return t("{TEAM} worked through a shared folder, which Etiuda no longer follows: its catalog stays on this computer as it is, and a new invitation from the team's lead brings the team back.").split("{TEAM}").join(team);
}
/* And a notice once a run, as the relay's below: Dismiss takes it down for that run; the row still says it. */
let folderHeldUp="";
const folderHeldDismissed=new Set();
function syncFolderHeld(){
  if(typeof document==="undefined" || typeof document.getElementById!=="function" || typeof document.createElement!=="function") return;
  const l=((joinNow&&joinNow.leads)||[]).filter(x=>x.folderHeld===true && !folderHeldDismissed.has(x.team))[0]||null;
  const want=l?l.team:"", up=document.getElementById("eTeamFolderHeld");
  if(want===folderHeldUp && (!want || up)) return;
  if(up) dropNotice(up);
  folderHeldUp=want;
  if(!l) return;
  eNotice("eTeamFolderHeld", folderHeldNote(l), "", ()=>{
      folderHeldDismissed.add(want);
      if(folderHeldUp===want) folderHeldUp="";
    });
}
/* And a notice, once a run for each such team: Dismiss takes it down for that run; the row still says it. */
let elsewhereUp="";
const elsewhereDismissed=new Set();
function syncRelayElsewhere(){
  if(typeof document==="undefined" || typeof document.getElementById!=="function" || typeof document.createElement!=="function") return;
  const l=((joinNow&&joinNow.leads)||[]).filter(x=>x.relayElsewhere===true && !elsewhereDismissed.has(x.team))[0]||null;
  const want=l?l.team:"", up=document.getElementById("eTeamElsewhere");
  if(want===elsewhereUp && (!want || up)) return;
  if(up) dropNotice(up);
  elsewhereUp=want;
  if(!l) return;
  const w=relayElsewhereWords(l);
  eNotice("eTeamElsewhere", w.lead, w.body, ()=>{
      elsewhereDismissed.add(want);
      if(elsewhereUp===want) elsewhereUp="";
    });
}
function joinTook(v,changed){
  const s=v&&typeof v==="object"?v:{};
  const was=JSON.stringify(joinNow);
  joinNow={sealed:s.sealed&&s.sealed.file?{file:String(s.sealed.file),team:String(s.sealed.team||"")}:null,
           join:joinShown(s.join),
           askRefused:(s.askRefused || s.refused) || null,
           /* The shell's sentences for what machine policy set and this desk cannot use, as text in the desk's language. */
           policySaid:Array.isArray(s.policySaid)?s.policySaid.filter(x=>typeof x==="string"&&x).map(String):[],
           leads:Array.isArray(s.leads)?s.leads.filter(l=>l&&l.team).map(l=>{
             const row={team:String(l.team),print:String(l.print||""),
               admitted:l.admitted===true,seen:l.seen===true,lead:String(l.lead||""),folder:String(l.folder||""),
               removed:l.removed===true,policy:l.policy===true};
             if(l.waiting===true) row.waiting=true;
             if(l.otherLead===true) row.otherLead=true;
             if(typeof l.relay==="string" && l.relay) row.relay=String(l.relay);
             if(l.relayRemoved===true) row.relayRemoved=true;
             if(l.relayElsewhere===true) row.relayElsewhere=true; /* plant:elsewhere-kept */
             if(l.folderHeld===true) row.folderHeld=true;
             const head=headKept(l.head);
             if(head) row.head=head;
             const lapse=lapseKept(l.lapse);
             if(lapse) row.lapse=lapse;
             if(l.asking===true) row.asking=true;
             const fork=forkKept(l.fork);
             if(fork) row.fork=fork;
             if(l.stranded && typeof l.stranded==="object") row.stranded={seen:l.stranded.seen===true};
             const keptApart=Array.isArray(l.keptApart)?l.keptApart.filter(f=>typeof f==="string"&&f&&f.length<=200).map(String).slice(0,3):[];
             if(keptApart.length) row.keptApart=keptApart; /* plant:kept-apart-kept */
             if(keptApart.length && Number.isSafeInteger(l.keptApartMore) && l.keptApartMore>0) row.keptApartMore=l.keptApartMore; /* plant:kept-apart-more-kept */
             if(l.awaitsEdition===true) row.awaitsEdition=true;
             /* The shell's still-reading sentence, as text. The page prints it; it is not a translation of its own. */
             if(typeof l.reading==="string" && l.reading) row.reading=String(l.reading);
             return row;
           }):[]};
  /* Admitted: an empty desk loads the catalog the invitation named. A desk that already has one keeps it. */
  if(s.joined && s.joined.file){
    closeJoinBubble();
    if(wholeThingEmpty() || nsGet("Sample")==="1"){
      let waitAdmit=false;
      if(joinDoorHolds()){ pendingJoinLoad=String(s.joined.file); whenJoinDoorOpens(replayJoinLoad); waitAdmit=true; } /* plant:join-admit-door */
      if(!waitAdmit) hooks.loadCatalogFromFolder(String(s.joined.file),0);
    }
  }
  /* A relay team's catalog the shell can now open, from the invitation's wrap or at admission, opens the same way. */
  else if(s.opens && typeof s.opens.file==="string" && s.opens.file && (wholeThingEmpty() || nsGet("Sample")==="1")){
    let waitOpens=false;
    if(joinDoorHolds()){ pendingJoinLoad=String(s.opens.file); whenJoinDoorOpens(replayJoinLoad); waitOpens=true; } /* plant:join-opens-door */
    if(!waitOpens){
      hooks.loadCatalogFromFolder(s.opens.file,0); /* plant:opens-load */
    }
  }
  syncLapseNotice();
  syncRelayRemoved();
  syncRelayElsewhere(); /* plant:elsewhere-notice */
  syncFolderHeld(); /* plant:folder-held-notice */
  syncForkNotice();
  syncStrandedNotice();
  const refusal=s.linkRefusal;
  if(refusal && typeof refusal==="object" && typeof refusal.en==="string" && refusal.en){
    const heldRefusal={en:String(refusal.en), pl:typeof refusal.pl==="string"?String(refusal.pl):""};
    if(joinDoorHolds()){ pendingInvite={kind:"link-refusal", refusal:heldRefusal}; whenJoinDoorOpens(replayPendingInvite); return joinNow; }
    dropInvite();
    joinLinkSaid=heldRefusal;
    joinWhy="link"; joinMode="refused";
    paintJoin();
    return joinNow;
  }
  if(s.onRelay===true) joinNow.onRelay=true;
  if(s.share && typeof s.share==="object" && s.share.team){
    joinNow.share={
      team:String(s.share.team),
      inbox:Number(s.share.inbox)||0,
      teammates:Array.isArray(s.share.teammates)
        ? s.share.teammates.filter(x=>x&&x.id).map(x=>({id:String(x.id), name:String(x.name||x.id)}))
        : [],
    };
    if(s.share.kept && typeof s.share.kept==="object" && !Array.isArray(s.share.kept)){
      const kept={};
      Object.keys(s.share.kept).forEach(card=>{
        const rows=Array.isArray(s.share.kept[card]) ? s.share.kept[card].filter(x=>x&&x.id&&x.at).map(x=>({id:String(x.id), name:String(x.name||x.id), at:String(x.at)})) : [];
        if(rows.length) kept[card]=rows;
      });
      joinNow.share.kept=kept;
    }
    if(s.share.off===true) joinNow.share.off=true;
  }
  const offer=s.offer;
  if(offer && offer.link===true && typeof offer.relay==="string" && offer.relay){
    const heldOffer={lead:String(offer.lead||""), team:String(offer.team||""), relay:String(offer.relay), link:true, left:String(offer.left||"")};
    if(joinDoorHolds()){ pendingInvite={kind:"link", offer:heldOffer}; whenJoinDoorOpens(replayPendingInvite); return joinNow; } /* plant:join-link-door */
    joinOffer=heldOffer;
    joinShut=""; /* plant:link-unshut */ // a link's offer is not in the state a hidden bubble was shut at, so each new link is drawn
    joinRead="link"; joinWhy=""; joinLinkSaid=null;
    joinMode="confirm"; /* plant:link-page */
    paintJoin();
    return joinNow;
  }
  if(changed===true || JSON.stringify(joinNow)!==was) paintJoin();
  if(JSON.stringify(joinNow)!==was || (s.joined && s.joined.file)) teamContent();
  return joinNow;
}
function noteCatalogCopy(m){
  toast(m && m.lead===true ? "At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team's lead alone." : "At the request of the team lead's Studio, a copy of the catalog in use here was sent to the team.");
}
function wireTeamJoin(gate){
  if(gate!==undefined) joinGate=(gate && typeof gate.holds==="function") ? gate : null;
  if(!eHasJoin()) return;
  if(typeof eHost().onTeamJoin==="function") eHost().onTeamJoin(joinTook);
  if(typeof eHost().onCatalogCopy==="function") eOnCatalogCopy(noteCatalogCopy);
  joinAsk("state");
  joinAsk("held");
  teamContent();
}
function paintJoin(){
  if(joinDoorHolds()){ closeJoinBubble(); whenJoinDoorOpens(paintJoin); return; }
  if(wholeThingEmpty()){ closeJoinBubble(); hooks.render(); syncToldNotice(); joinPainted(); return; }
  if(teamJoinShown() && JSON.stringify(joinNow)!==joinShut) openJoinBubble();
  else if(!teamJoinShown()) closeJoinBubble();
  syncToldNotice();
  joinPainted();
}
function joinTime(ms){
  const d=new Date(ms||Date.now());
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}
function repaintJoin(){
  if(wholeThingEmpty()){ closeJoinBubble(); hooks.render(); joinPainted(); return; }
  paintJoin();
}
function clearJoinAsk(){
  dropInvite();
  repaintJoin();
}
function joinDisclosure(){
  return '<div class="e-join-meta">'+esc(t("Once this desk joins, the team's lead can see the catalogs it uses, their content included, and this desk's changes to them. The lead's Studio can take a copy of any of them at any time, without asking here: of a team catalog, one the lead publishes to the team, sealed for the team; of a personal catalog, any other on this desk, sealed for the lead alone. A personal catalog can be marked Private in the Library, under Catalog & data; the lead then sees nothing of it, not even that it is used. The lead's Studio lists this desk by name, unless the organisation turns names off, with the catalog and edition it uses unless that catalog is Private, and the period counted, and goes on listing it if it falls quiet. The desk's own counts go to the lead sealed, none of them from a Private catalog, and Studio shows them in the team's totals."))+'</div>';
}
function joinInviteParts(){
  /* The link's confirm, which names the lead, the team and the relay's host and asks for no code. */
  if(joinMode==="confirm" && joinOffer){
    const o=joinOffer;
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
  }
  if(joinMode==="refused" && joinWhy==="link" && joinLinkSaid){
    const said=uiLang()==="pl" && joinLinkSaid.pl ? joinLinkSaid.pl : joinLinkSaid.en;
    return {title:t("Join a team"), line:said, body:"", acts:[["back",t("Cancel")]]};
  }
  if(joinMode==="refused") return {title:t("Join a team"),
    line:joinWhy==="relay-mirror"?t("Etiuda could not make its own copy of the team's files on this computer, so nothing was written. Once the disk has room and Etiuda may write in its folder, Join again; the invitation still works.")
      :joinWhy==="silent"?t("This folder could not be reached, so nothing was written.")
      :joinWhy==="pinned"?t("This invitation names a team this desk already knows, but with a different lead's key. It was not used, and nothing changed. Tell the team's lead about it.")
      :joinWhy==="barred"?t("This invitation names a team whose lead was forgotten on this desk. It was not used, and nothing changed. To join, the team's lead sends a new invitation.")
      :joinWhy==="policy"?t("The organisation's IT sets this desk's team, so invitations are turned off.")
      :joinWhy==="waiting"?t("This invitation waits until Etiuda can read what the organisation's IT set for this computer. Nothing is lost: it can be used again then.")
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
  /* "It does not match" leaves the team as Settings' Leave this team does, so it asks once, saying so; the copywriter's words. */
  if(l && joinDoubt===l.team) return {title:t("Leave this team on this desk?"),
    line:t("If the key the team's lead sees does not match this one, this desk forgets the team's lead and every key kept under it, so nothing new from this team reaches it. The catalog in use stays. Joining again takes a new invitation, which shows the lead's key to compare once more."),
    body:'<div class="e-join-key">'+keySignHtml("studio",l.print)+'</div>', acts:[["forget",t("Leave this team"),false,"danger"],["keep",t("Cancel")]]};
  if(l) return {title:t("You are on the team"),
    line:t("Compare this key with the Signing key in the lead's Studio Settings. Every later edition is checked against it."),
    body:'<div class="e-join-key">'+keySignHtml("studio",l.print)+'</div>', acts:[["seen",t("It matches")],["forget",t("It does not match")]], lead:l.team};
  const invited=joinInviteParts();
  if(invited) return invited;
  const meta=j?'<div class="e-join-meta">'+esc(t("{NAME}, asked at {TIME}").split("{NAME}").join(j.name||who)
    .split("{TIME}").join(joinTime(j.asked)))+'</div>':'';
  /* An invitation waits under its lead's name until the lead lets the desk in. */
  if(j && j.invite && j.state==="waiting"){
    const lead=String(j.invite.lead||"").trim()||t("the lead");
    const isLeft=j.left===true;
    const isDoubted=j.doubted===true;
    /* Cause, status and way forward, joined: Claudette's words, 2026-10-27 20:05, and the unkept status 21:11. */
    if(isLeft || isDoubted){
      const cause=isLeft
        ? t("This desk has left the team and keeps nothing the invitation gave it.")
        : t("The key shown did not match the team's lead's, so this desk does not trust it and keeps nothing the invitation gave it.");
      const status=(j.withdrawing===true && j.readonly===true)
        ? t("Its request is being withdrawn. The team's relay is read-only until it is renewed, so it takes the withdrawal then, and until that the team's lead may still see the request; if the relay clears the team's copy first, the request goes with it.")
        : j.withdrawing===true
        ? t("Its request is being withdrawn; the relay takes the withdrawal shortly, and until then the team's lead may still see it.")
        : j.unkept===true /* plant:e5-unkept */
        ? t("The relay no longer holds its request, so it could not be withdrawn there; the team's lead may still see it until it expires.")
        : t("Its request is withdrawn, and the team's lead no longer sees it.");
      const forward=t("To join, a new invitation from the team's lead is needed.");
      return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
        line:cause+" "+status+" "+forward,
        body:meta, acts:[["load",t("Load another catalog file")]]};
    }
    /* A request at a team's door, while it is taken back, is titled by that act: the copywriter's words. */
    let backTitle=t("Joining {LEAD}'s team").split("{LEAD}").join(lead);
    if(j.invite.door===true) backTitle=t("Withdrawing the request to join"); /* plant:door-withdraw-title */
    /* Claudette's words, 2026-10-27. */
    if(j.withdrawn===true) return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead), /* plant:e4-card */
      line:t("The request is withdrawn: the team's lead no longer sees it. This desk keeps what the invitation gave it, so Ask again sends the request anew without a new link."),
      body:meta, acts:[["ask",t("Ask again")]]};
    /* Claudette's words, 2026-10-27 20:37. */
    if(j.unkept===true) return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
      line:t("The relay no longer holds this request, so it could not be withdrawn there. The team's lead may still see it until it expires. To join after all, a new invitation from the team's lead is needed."),
      body:meta, acts:[["load",t("Load another catalog file")]]}; /* plant:c5-card-unkept */
    /* Claudette's words, 2026-10-27. */
    if(j.withdrawing===true && j.readonly===true) return {title:backTitle,
      line:t("The request is being withdrawn. The team's relay is read-only until it is renewed, so it takes the withdrawal then, and until that the team's lead may still see the request. If the relay clears the team's copy first, the request goes with it."),
      body:meta, acts:[]}; /* plant:c5-card-held */
    /* Until the relay has taken the withdrawal the lead may still see the request, so the card says so, with nothing to press. Claudette's words, 2026-10-27. */
    if(j.withdrawing===true) return {title:backTitle,
      line:t("The request is being withdrawn. The relay takes the withdrawal shortly, and until then the team's lead may still see the request."),
      body:meta, acts:[]}; /* plant:g2-card */
    /* The catalogs are said to be open only once the shell has opened the team's here; until then the line says what it
       waits for, the copywriter's words. */
    let relayWait=t("Waiting for the team's lead to let this desk in. Nothing more is needed here, and the team's catalogs are already open to work with.");
    if(j.invite.open!==true) relayWait=t("Waiting for the team's lead to let this desk in. Nothing more is needed here: the team's catalog opens here by itself once it is."); /* plant:wait-not-open */
    return {title:t("Joining {LEAD}'s team").split("{LEAD}").join(lead),
      line:j.paused?t("The team's lead cannot let anyone in for now, as the lead's licence is paused. Nothing needs doing here: once the licence is active again, this desk is let in by itself.") /* copywriter, 2026-10-30 00:20 */
        :(j.invite.relay || j.invite.wrapped)?relayWait
        :t("Waiting for the team's lead to let this desk in. Nothing more is needed here."),
      body:meta, acts:[["cancel",t("Cancel the request")]]};
  }
  /* A request at the team's standing door the relay or the lead turned away, or the relay refused as removed: the desk cannot tell
     which, nor why. Cancel the request clears it. */
  if(j && j.invite && j.invite.relay && j.invite.door===true && (j.state==="turned" || j.state==="removed")) return {title:t("Join a team"),
    line:t("The team did not let this computer in. Its lead can send an invitation instead."),
    body:'<div class="e-join-meta">'+esc(t("Relay: {HOST}").split("{HOST}").join(j.invite.relay))+'</div>',
    acts:[["cancel",t("Cancel the request")],["load",t("Load another catalog file")]]};
  /* A relay invitation the relay refused: its token was spent by another desk, it ended unused, or it was made before
     the team's lead removed this desk. Cancel the request clears it. */
  if(j && j.invite && j.invite.relay && j.state==="removed") return {title:t("Join a team"),
    /* Claudette's words, 2026-10-27. */
    line:t("This invitation was made before the team's lead removed this desk, so it no longer works. The lead can make a new one."),
    body:'<div class="e-join-meta">'+esc(t("Lead: {NAME}").split("{NAME}").join(String(j.invite.lead||"").trim()||t("the lead")))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Team: {TEAM}").split("{TEAM}").join(j.team))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Relay: {HOST}").split("{HOST}").join(j.invite.relay))+'</div>',
    acts:[["cancel",t("Cancel the request")],["load",t("Load another catalog file")]]};
  if(j && j.invite && j.invite.relay && (j.state==="used" || j.state==="ended")) return {title:t("Join a team"),
    line:j.state==="used"?t("This invitation has already been used. Ask your lead for a new one."):t("This invitation has expired. Ask your lead for a new one."),
    body:'<div class="e-join-meta">'+esc(t("Lead: {NAME}").split("{NAME}").join(String(j.invite.lead||"").trim()||t("the lead")))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Team: {TEAM}").split("{TEAM}").join(j.team))+'</div>'
      +'<div class="e-join-meta">'+esc(t("Relay: {HOST}").split("{HOST}").join(j.invite.relay))+'</div>',
    acts:[["cancel",t("Cancel the request")],["load",t("Load another catalog file")]]};
  if(j && j.state==="refused"){
    if(j.invite) return {title:t("The lead turned the request down"), line:t("To join, a new invitation from the team's lead is needed."), body:meta, acts:[["cancel",t("Cancel the request")],["load",t("Load another catalog file")]]}; /* plant:relay-refused-card */
    return {title:t("The lead turned the request down"),
      line:t("Asking again sends a new request."), body:meta, acts:[["ask",t("Ask again")],["load",t("Load another catalog file")]]};
  }
  if(j) return {title:t("Join a team"),
    line:j.paused?t("The team's lead cannot let anyone in for now, as the lead's licence is paused. Nothing needs doing here: once the licence is active again, this desk is let in by itself.") /* copywriter, 2026-10-30 00:20 */
      :t("Waiting for the team's lead to let this desk in. Nothing more is needed here."), body:meta,
    acts:[["cancel",t("Cancel the request")]]};
  const acts=[["load",t("Load another catalog file")]];
  /* A team whose roster no longer lists this desk says so in place of the ask a desk never on it gets. */
  const gone=s?((joinNow&&joinNow.leads)||[]).filter(x=>x.team===s.team && x.removed)[0]:null;
  if(gone){
    const title=gone.lead?t("{LEAD}'s team no longer includes this desk").split("{LEAD}").join(gone.lead):t("The team no longer includes this desk");
    let hushLine=false;
    hushLine=gone.relayRemoved===true; /* plant:h35-hush-card */
    /* Claudette's words, 2026-10-27. */
    if(hushLine) return {title:title,
      line:t("The relay says this desk is no longer on the team, so nothing new reaches it. The catalogs on it stay as they are. Once the team's lead lets this desk in again, the catalog opens here by itself."),
      body:"", acts:acts};
    return {title:title, line:t("Once the team's lead lets this desk in again, the catalog opens here by itself."), body:"", acts:acts};
  }
  /* A sealed catalog this desk holds no key for is joined through the team's lead: an invitation to the person's address or a link, never a request of the desk's own. */
  const line=t("This catalog belongs to a team. Once the team's lead has invited this desk and it has joined, the catalog opens here by itself.");
  return {title:t("{FILE} is sealed for its team").split("{FILE}").join(s?s.file:""),
    line:line, body:"", acts:acts};
}
function joinAct(act){
  const j=joinNow&&joinNow.join, s=joinNow&&joinNow.sealed;
  if(joinDoorHolds() && (act==="invite" || act==="ask")) return Promise.resolve(null); /* plant:join-act-door */
  if(act==="back"){
    if((joinOffer&&joinOffer.link) || (joinMode==="refused"&&joinWhy==="link"))
      return joinAsk("link-no","","",()=>{ dropInvite(); return true; });
    return Promise.resolve(clearJoinAsk());
  }
  if(act==="invite"){
    if(joinMode!=="confirm" || !joinOffer) return Promise.resolve(null);
    const offerTeam=String(joinOffer.team||"");
    const prevTeams=new Set(((joinNow&&joinNow.leads)||[]).map(l=>l&&l.team).filter(Boolean));
    const afterJoin=v=>{
      if(!v || typeof v!=="object" || v.canceled || v.refused) return v;
      const added=Array.isArray(v.leads) ? v.leads.find(l=>l&&l.team&&!prevTeams.has(l.team)) : null;
      const team=String((v.join&&v.join.team)||(v.joined&&v.joined.team)||offerTeam||(added&&added.team)||"");
      if(team) sendContentSaid(team); /* plant:join-confirm-said */
      else teamContent();
      return v;
    };
    if(joinOffer.link) return joinAsk("link","",agentName(),v=>yesTook(v,"link")).then(afterJoin);
    return Promise.resolve(null);
  }
  if(act==="ask"){
    const askTeam=String((j&&j.team)||(s&&s.team)||"");
    return joinAsk("ask",(j&&j.file)||(s&&s.file)||"",agentName()).then(v=>{
      if(v && typeof v==="object" && !v.refused && !v.askRefused){
        const team=String((v.join&&v.join.team)||askTeam||"");
        if(team) sendContentSaid(team);
      }
      return v;
    });
  }
  if(act==="cancel") return joinAsk("cancel");
  const l=leadToShow();
  if(act==="seen" && l) return joinAsk("seen",l.team);
  if(act==="keep"){ joinDoubt=""; return Promise.resolve(repaintJoin()); }
  if(act==="forget" && l && joinDoubt!==l.team){ joinDoubt=l.team; return Promise.resolve(repaintJoin()); } /* plant:doubt-asks */
  if(act==="forget" && l){ joinDoubt=""; return forgetTeamLead(l.team); } /* plant:mismatch-leaves */
  if(act==="load") return Promise.resolve(hooks.importCatalogHere());
  return Promise.resolve(null);
}
/* The shell's sentence while this folder team's mirror has no listing yet, or "". */
function teamReadingLine(){
  const row=((joinNow&&joinNow.leads)||[]).filter(l=>typeof l.reading==="string" && l.reading)[0];
  return row?String(row.reading):"";
}
/* The empty desk's block for that wait, or "" once the listing has landed. */
function teamReadingEmptyHtml(){
  const line=teamReadingLine();
  if(!line) return "";
  return '<div class="empty empty-desk">'+esc(line)+'</div>';
}
/* The empty desk's block, or "" where there is nothing sealed to say. */
function teamJoinEmptyHtml(){
  if(!teamJoinShown()) return "";
  const p=joinParts();
  return '<div class="empty e-join"><div class="e-join-t">'+ICON_LOCK+esc(p.title)+'</div>'
    +'<p>'+esc(p.line)+'</p>'+p.body
    +'<div class="e-join-acts">'+p.acts.map(a=>'<button type="button" class="btn'+(a[3]?' '+a[3]:'')+'" data-join="'+a[0]+'"'+(a[2]?' disabled':'')+'>'
      +esc(a[1])+'</button>').join("")
    +'</div></div>';
}
function wireTeamJoinEmpty(root){
  if(!root) return;
  root.querySelectorAll("[data-join]").forEach(el=>{
    if(el.getAttribute && el.getAttribute("data-join")) el.onclick=()=>joinAct(el.getAttribute("data-join"));
  });
}
/* THE BUBBLE, where a catalog is already open: hung from the catalog's name as the offer is, one at a time, and back
   only when the answer it was hidden on changes. Shared with the one-time told notice and the Library's Private switch. */
const bubbleClosers=new Map();
function closeTeamBubble(id){ const fn=bubbleClosers.get(id); if(fn) fn(); }
function openTeamBubble(opts){
  if(typeof document==="undefined" || typeof document.createElement!=="function" || !document.body || typeof document.body.appendChild!=="function") return null;
  const wrap=document.createElement("div");
  if(!wrap || typeof wrap.setAttribute!=="function" || typeof wrap.addEventListener!=="function" || typeof wrap.querySelector!=="function") return null;
  const id=String(opts.id||"");
  if(id) closeTeamBubble(id);
  wrap.className="bub bub-ask e-offer e-join-bub"+(opts.cls?" "+opts.cls:"");
  if(id) wrap.id=id;
  wrap.setAttribute("role",opts.role||"dialog");
  if(opts.labelId) wrap.setAttribute("aria-labelledby",opts.labelId);
  wrap.innerHTML=opts.html||"";
  cutLeaves();
  document.body.appendChild(wrap);
  const originRect=()=>{
    const o=typeof opts.origin==="function"?opts.origin():document.getElementById("catNow");
    const r=o && typeof o.getBoundingClientRect==="function" ? o.getBoundingClientRect() : null;
    return (r && (r.width || r.height)) ? {top:r.top,left:r.left,width:r.width,height:r.height} : null;
  };
  const place=()=>{
    const r=originRect();
    placeBubble(wrap, r || {top:0,left:innerWidth-24,width:0,height:40}, {width:opts.width||340, prefer:opts.prefer||"below"});
  };
  place();
  const dropHang=(opts.hang && wrap.isConnected && typeof opts.origin==="function")
    ? hangBubble(wrap, ()=>{ const r=originRect(); return r ? opts.origin() : null; }, {width:opts.width||340, prefer:opts.prefer||"below"})
    : null;
  if(typeof addEventListener==="function") addEventListener("resize",place);
  let closed=false;
  const onOutside=e=>{
    if(wrap.contains && wrap.contains(e.target)) return;
    close();
  };
  const close=()=>{
    if(closed) return;
    closed=true;
    if(typeof document.removeEventListener==="function") document.removeEventListener("pointerdown",onOutside,true);
    if(dropHang) dropHang();
    if(typeof removeEventListener==="function") removeEventListener("resize",place);
    dismissNode(wrap);
    if(id && bubbleClosers.get(id)===close) bubbleClosers.delete(id);
    if(typeof opts.onClose==="function") opts.onClose();
  };
  if(id) bubbleClosers.set(id,close);
  if(opts.dismissOnOutside){
    queueMicrotask(()=>{
      if(!closed && typeof document!=="undefined" && typeof document.addEventListener==="function"){
        document.addEventListener("pointerdown",onOutside,true);
      }
    });
  }
  wrap.addEventListener("keydown",e=>{
    if(e.key!=="Escape") return;
    e.preventDefault(); e.stopPropagation();
    if(typeof opts.onEscape==="function") opts.onEscape(close);
    else close();
  });
  return {wrap, close, place};
}
let joinBubbleClose=null;
function closeJoinBubble(){ if(joinBubbleClose) joinBubbleClose(); }
function openJoinBubble(){
  closeJoinBubble();
  closeToldBubble();
  const offer=document.getElementById("eCatalogOffer");
  if(offer) dismissNode(offer);
  const p=joinParts();
  const b=openTeamBubble({
    id:"eTeamJoin",
    labelId:"ejTitle",
    html:'<h3 id="ejTitle">'+esc(p.title)+'</h3><p class="ec-sub">'+esc(p.line)+'</p>'+p.body
      +'<div class="tour-actions"><button type="button" class="btn" data-join="hide">'+esc(t("Hide"))+'</button>'
      +p.acts.map((a,i)=>'<button type="button" class="btn'+(a[3]?' '+a[3]:i?'':' primary')+'" data-join="'+a[0]+'"'+(a[2]?' disabled':'')+'>'
        +esc(a[1])+'</button>').join("")
      +'</div>',
    onClose:()=>{ if(joinBubbleClose===close) joinBubbleClose=null; },
    onEscape:()=>hide()
  });
  if(!b) return;
  const wrap=b.wrap, close=b.close;
  joinBubbleClose=close;
  // Hiding the lead's key counts as having been shown it; the key stays in Settings. Hiding an invitation lets it go, a link's in the shell too,
  // as Cancel does, so a link waiting behind it is offered.
  const hide=()=>{
    const link=!!(joinOffer&&joinOffer.link) || (joinMode==="refused"&&joinWhy==="link");
    joinShut=JSON.stringify(joinNow); dropInvite(); close(); joinPainted(); if(p.lead) joinAsk("seen",p.lead);
    if(link) joinAsk("link-no"); /* plant:hide-link-no */
  };
  wrap.querySelectorAll("[data-join]").forEach(el=>{
    const act=el.getAttribute("data-join");
    el.onclick=()=>{ if(act==="hide") return hide(); close(); joinAct(act); };
  });
}
let toldTeamOpen="", toldLangOpen="";
function closeToldBubble(){ toldTeamOpen=""; toldLangOpen=""; closeTeamBubble("eTeamTold"); }
function syncToldNotice(){
  if(typeof document==="undefined" || typeof document.createElement!=="function" || !document.body) return;
  const want=(contentNow && contentNow.team && !contentNow.told && !toldDismissed.has(contentNow.team) && !teamJoinShown()) ? contentNow.team : "";
  const up=document.getElementById("eTeamTold");
  if(!want){ closeToldBubble(); return; }
  const lang=uiLang();
  if(up && toldTeamOpen===want && toldLangOpen===lang){
    const b=bubbleClosers.get("eTeamTold");
    if(b) return;
  }
  closeToldBubble();
  const offer=document.getElementById("eCatalogOffer");
  if(offer) dismissNode(offer);
  toldTeamOpen=want; toldLangOpen=lang;
  const dismiss=()=>{
    toldDismissed.add(want);
    closeToldBubble();
    sendContentSaid(want); /* plant:told-bubble-said */
  };
  const b=openTeamBubble({
    id:"eTeamTold",
    labelId:"etTitle",
    html:'<h3 id="etTitle">'+esc(t("What the team's lead can see has changed."))+'</h3>'
      +'<p class="ec-sub">'+esc(t("From now on, the team's lead can see every catalog this desk uses, their content included, and this desk's changes to them: personal catalogs as well as team catalogs. A personal catalog can be marked Private in the Library, under Catalog & data; the lead then sees nothing of it, not even that it is used. Nothing of this desk's personal catalogs has been sent yet."))+'</p>'
      +'<div class="tour-actions"><button type="button" class="btn primary" data-join="told-ok">'+esc(t("Understood"))+'</button></div>',
    onEscape:()=>dismiss(),
    onClose:()=>{ if(toldTeamOpen===want){ toldTeamOpen=""; toldLangOpen=""; } }
  });
  if(!b){ toldTeamOpen=""; toldLangOpen=""; return; }
  const ok=b.wrap.querySelector('[data-join="told-ok"]');
  if(ok) ok.onclick=dismiss;
}

/* Leaves a team, from Settings and from "It does not match": the shell forgets its lead and every key kept under it, and
   remembers when it left, so a later invitation asks rather than refuses; the catalog in use stays. `then()` runs once the
   shell has answered. */
function forgetTeamLead(team,then){
  return joinAsk("leave",team).then(v=>{ teamContent(); if(typeof then==="function") then(); return v; });
}
function teamShareState(){
  return (joinNow && joinNow.share) ? joinNow.share : null;
}
function shareToTeammate(recipientId, cardJson, note){
  if(!eHasJoin()) return Promise.resolve({ok:false, reason:"not-on-team"});
  try{ return Promise.resolve(eHost().teamJoin("share-to", String(recipientId||""), String(cardJson||""), String(note||""))).catch(()=>({ok:false, reason:"failed"})); }
  catch(e){ return Promise.resolve({ok:false, reason:"failed"}); }
}
function shareInboxList(){
  if(!eHasJoin()) return Promise.resolve({ok:true, items:[]});
  try{ return Promise.resolve(eHost().teamJoin("share-inbox")).catch(()=>({ok:false, items:[]})); }
  catch(e){ return Promise.resolve({ok:false, items:[]}); }
}
function shareKeepCard(openedJson, catalogId){
  if(!eHasJoin()) return Promise.resolve({ok:false, reason:"not-on-team"});
  try{ return Promise.resolve(eHost().teamJoin("share-keep", String(openedJson||""), String(catalogId||""))).catch(()=>({ok:false, reason:"failed"})); }
  catch(e){ return Promise.resolve({ok:false, reason:"failed"}); }
}
function shareKeptNote(senderId, cardId){
  if(!eHasJoin()) return Promise.resolve({ok:false});
  try{ return Promise.resolve(eHost().teamJoin("share-kept", String(senderId||""), String(cardId||""))).catch(()=>({ok:false})); }
  catch(e){ return Promise.resolve({ok:false}); }
}
function shareDropItem(blobId){
  if(!eHasJoin()) return Promise.resolve({ok:false});
  try{ return Promise.resolve(eHost().teamJoin("share-drop", String(blobId||""))).catch(()=>({ok:false})); }
  catch(e){ return Promise.resolve({ok:false}); }
}

export { lapseNote, shareRefusedNotes, keptApartNotes, relayElsewhereNote, folderHeldNote, wireTeamJoin, teamJoinShown, joinStands, onJoinPainted, teamJoinEmptyHtml, teamReadingEmptyHtml, wireTeamJoinEmpty, closeJoinBubble, teamLeads, teamPolicySaid, relayDesk, leadsNow, leadKeyText, keySignHtml, keyTipHtml, forgetTeamLead, paintJoin, teamCanJoin, inviteHeld, noteCatalogCopy, joinTook, teamContent, teamContentNow, markCatalogPrivate, onContentChanged, openTeamBubble, closeTeamBubble, teamShareState, shareToTeammate, shareInboxList, shareKeepCard, shareKeptNote, shareDropItem };
