/* THE PERSON'S OWN SIGN-IN ON THE PAGE (board 980): what the shell says of it, the door in the header and the words of each
   moment. The shell holds the tokens, the browser, the service and seat.json; the page is told the providers offered, who is
   signed in by provider, the sign-in code and how the seat stands, and shows nothing where no provider is offered, so a desk
   with no registration configured looks as it did. Settings' Account draws the same view with signinParts. */
import { $ } from "./dom.js";
import { eHost, eOpenSetAside, eCatalogFolderPinned } from "./host.js";
import { esc } from "./esc.js";
import { t, uiLang, hugDottedGround } from "./ui-lang.js";
import { agentName } from "./agent.js";
import { lsGet, lsSet } from "./storage.js";
import { teamLeads } from "./team-join.js";
import { hooks } from "./hooks.js";
import { catalogLoaded } from "./catalog-boot.js";
import { hangBubble } from "./bubble.js";
import { eDeskFlush } from "./storage.js";

/* "lab" is offered only by the sign-in lab (shell/main.js signinLabRead), never by a desk installed or packaged. */
const SIGNIN_NAMES={microsoft:"Microsoft", google:"Google", lab:"Lab"};
/* The shell's answer as the page keeps it; every field checked, so a missing host reads as nothing offered. */
function signinRead(v){
  const o=v && typeof v==="object" ? v : {};
  const known=id=>Object.prototype.hasOwnProperty.call(SIGNIN_NAMES, id);
  const signedIn=known(o.signedIn) ? o.signedIn : "";
  return {
    offered: Array.isArray(o.offered) ? o.offered.filter(known) : [],
    signedIn: signedIn,
    code: signedIn && /^[0-9A-Z]{16}$/.test(String(o.code)) ? String(o.code) : "",
    seat: o.seat==="held" || o.seat==="lapsed" || o.seat==="none" ? o.seat : "",
    deskOnly: !!signedIn && o.deskOnly===true,
    askLead: !!signedIn && o.askLead===true,
    trialUntil: !!signedIn && Number.isFinite(o.trialUntil) && o.trialUntil>0 ? o.trialUntil : 0,
    /* The service said this account's organisation holds its licence (a managed tenant), and why where it also owns one. */
    licenceManaged: o.licenceManaged===true,
    cause: o.licenceManaged===true && (o.cause==="own-licence" || o.cause==="assigned") ? o.cause : "",
    at: Number.isFinite(o.at) ? o.at : 0,
    reached: o.reached!==false,
    ask: o.ask===true,
    refused: typeof o.refused==="string" ? o.refused : "",
    busy: known(o.busy) ? o.busy : "",
    said: typeof o.said==="string" ? o.said : "",
    preview: o.preview===true && Array.isArray(o.offered) && o.offered.some(known),
    /* The provider's page of the sign-in that waits, only while one does. */
    link: known(o.busy) && typeof o.link==="string" && (/^https:\/\/\S+$/.test(o.link) || (o.busy==="lab" && /^http:\/\/127\.0\.0\.1:[0-9]+\/\S*$/.test(o.link))) ? o.link : "",
    keeps: o.keeps!==false,
    /* The team's relay refused this desk's seat (a licence that follows Entra): "removed" or "renew". */
    relaySeat: signedIn && (o.relaySeat==="removed" || o.relaySeat==="renew") ? o.relaySeat : "",
    /* Signed out, with the service not yet told: the desk's place among the account's three is freed at the next contact. */
    outOwed: !signedIn && o.outOwed===true,
    /* The doors the sign-in handed, offered while the desk keeps no team (the door-finding): each by its place, the relay's host
       and the lead's print, so two leads' doors of one team are told apart. */
    doors: signedIn && Array.isArray(o.doors) ? o.doors.filter(d=>d && Number.isInteger(d.n) && typeof d.host==="string" && d.host.length<=256
      && /^[0-9a-f]{16}$/.test(String(d.print))).slice(0,16).map(d=>({n:d.n, host:d.host, print:String(d.print)})) : [],
    /* Machine policy (decision 49), only where it sets anything: {on, shared, personal, provider, closed, contact}. */
    managed: signinManagedRead(o.managed),
    /* Whether the desk works, judged by the shell on its own clock: that clock, the held certificate's end, the last one's where it
       stopped (each a time in ms, 0 for none), and whether the system has a network. Kept as the shell judged them. deskDoorState reads them. */
    works: o.works===true, /* plant:read-works */
    now: signinTimeRead(o.now),
    until: signinTimeRead(o.until),
    stoppedAt: signinTimeRead(o.stoppedAt), /* plant:read-stopped */
    online: o.online!==false, /* plant:read-online */
    /* When the service first said none while a certificate ran, the seat and trials it last named, and whether this build can sign in
       at all; kept as the shell said them. deskDoorState reads them. */
    ended: signedIn ? signinTimeRead(o.ended) : 0, /* plant:read-ended */
    holding: signedIn ? signinHoldingRead(o.holding) : null,
    trials: signedIn ? signinTrialsRead(o.trials) : null,
    registered: o.registered===true /* plant:read-registered */
  };
}
function signinTimeRead(v){ return Number.isSafeInteger(v) && v>0 && v<=8.64e15 ? v : 0; } /* plant:read-time */
const SIGNIN_HOLDING_ON=["trial", "studio-trial", "own", "team", "org"];
function signinHoldingRead(h){
  if(!h || typeof h!=="object" || SIGNIN_HOLDING_ON.indexOf(h.on)<0) return null; /* plant:read-holding */
  const out={on:h.on, ends:signinTimeRead(h.ends)};
  if(h.on==="team" && typeof h.lead==="string" && h.lead.length<=120 && h.lead.trim() && !/[<>]/.test(h.lead) && !/[\x00-\x1f\x7f-\x9f]/.test(h.lead)) out.lead=h.lead; /* plant:read-lead */
  return out;
}
function signinTrialsRead(v){
  if(!v || typeof v!=="object") return null;
  const out={};
  if(signinTimeRead(v.desk)) out.desk=v.desk;
  if(signinTimeRead(v.studio)) out.studio=v.studio;
  return out.desk || out.studio ? out : null;
}
function signinManagedRead(m){
  if(!m || typeof m!=="object") return null;
  return {on:m.on===true, shared:m.shared===true, personal:m.personal!==false,
    provider:m.provider==="microsoft" || m.provider==="google" ? m.provider : "", tenant:m.tenant===true, closed:m.closed===true,
    contact:typeof m.contact==="string" && m.contact.length<=200 ? m.contact : "", stranded:m.stranded===true, keeps:m.keeps!==false, waiting:m.waiting===true};
}
/* A MANAGED COMPUTER (decision 49): nothing to buy, try or switch, and the account it has kept unless the computer is shared or the shell
   says it keeps none (an account that never held a seat here). */
function signinManaged(v){ return !!(v && v.managed && v.managed.on); }
function signinKeepsAccount(v){ return signinManaged(v) && !v.managed.shared && v.managed.keeps; } /* plant:keeps-account */
/* Where a provider is pinned or personal accounts are off, the line naming personal accounts would not hold. */
function signinCapHolds(v){ return !(v && v.managed && (v.managed.on || v.managed.provider || !v.managed.personal)); } /* plant:cap-holds */
/* The refusal of an account the organisation has not given access, and whom to ask: the policy's contact as written, or its IT;
   that the desk works on is said only where it holds a catalog to work with. */
function signinRefusedWords(v){
  const c=v && v.managed ? v.managed.contact : "";
  return [t("Your organisation has not given this account access to Etiuda."),
    (c ? named(t("To ask for access: {CONTACT}."),"{CONTACT}",c) : t("Its IT department can: asking them to assign the account is enough.")) /* plant:refused-contact */
      + (catalogLoaded() ? " "+t("Etiuda keeps working with the catalog it has.") : "")]; /* plant:refused-catalog */
}
/* An account its organisation gives no Etiuda role (a managed installation, or the service's "no-role"): what to do, and whom to ask
   where SupportContact names someone, as the refusal above does (the copywriter, 2026-11-14). */
function signinNoRoleWords(v){
  const c=v && v.managed ? v.managed.contact : "";
  return [t("This account has no Etiuda role in its organisation, so it holds no seat."),
    c ? named(t("To ask for access: {CONTACT}."),"{CONTACT}",c) : t("Its IT department can assign one.")]; /* plant:no-role-contact */
}
/* A NON-PERSISTENT DESKTOP whose profile did not keep this desk's key (section 12): what happened and whom to ask, never a fault of
   the person's, and everything on the desk working as before. */
function signinStranded(v){ return !!(v && v.managed && v.managed.stranded); } /* plant:np-page */
function signinStrandedWords(v){
  const c=v && v.managed ? v.managed.contact : "";
  const offered=!!(v && (v.offered.length || v.signedIn)); /* plant:stranded-offered */
  return [t("This computer's profile did not keep this desk's key."),
    (c ? named(t("To ask for access: {CONTACT}."),"{CONTACT}",c) : t("The organisation's IT department can have the profile keep it."))
      + " " + (offered ? t("Everything else on this desk works as before; only signing in waits.")
        : t("Everything else on this desk works as before."))];
}
/* MACHINE POLICY HAS NOT ANSWERED (the shell's policyWaits): signing in waits for it, said in its own words and never as a managed
   computer. */
function signinWaiting(v){ return !!(v && v.managed && v.managed.waiting); } /* plant:waiting-page */
function signinWaitingWords(){ /* plant:waiting-words */
  return [t("Waiting for the organisation's settings"),
    t("Etiuda could not yet read what the organisation's IT set for this computer, so signing in waits. It tries again by itself, every few seconds at first and then once a minute, and everything already on this computer works as before.")];
}
/* The reasons that sentence answers: a sign-in outside the pinned tenant always, and the organisation's refusals on a managed computer. */
function signinRefusedHere(reason, v){
  return reason==="signin-tenant" || (signinManaged(v) && (reason==="signin-notassigned" || reason==="signin-notallowed")); /* plant:refused-here */
}
let signinV=signinRead(null);
function signinHost(){
  const h=eHost();
  return h && typeof h.signinState==="function" ? h : null;
}
function signinNow(){
  const h=signinHost();
  if(!h) return signinRead(null);
  try{ signinV=signinRead(h.signinState()); }catch(e){ signinV=signinRead(null); }
  return signinV;
}
/* Whether the door exists: a provider offered, somebody signed in, or the wait for machine policy to say. */
function signinShown(v){ return !!(v && (v.offered.length || v.signedIn || signinWaiting(v) || signinStranded(v))); } /* plant:shown-waiting */
/* FIRST-OPENING SIGN-IN GATE AND MEMORY: shown once on a desk that offers a provider, has
   nobody signed in, has never shown the screen before, and is not pinned by policy (a policy
   desk joins its team from HKLM policy without asking first). Written when the screen opens
   so stopping mid-screen never traps the person behind it again while Sign in stays in the bar. */
const FIRST_SIGNIN_KEY="eFirstSigninSeen";
function firstSigninSeen(){ return lsGet(FIRST_SIGNIN_KEY)==="1"; }
function markFirstSigninSeen(){ return lsSet(FIRST_SIGNIN_KEY,"1",true); }
function firstSigninDue(v, opts){
  const s=v===undefined ? signinV : signinRead(v);
  const o=opts && typeof opts==="object" ? opts : null;
  const seen=o && "seen" in o ? !!o.seen : firstSigninSeen();
  const policy=o && "policy" in o ? !!o.policy : eCatalogFolderPinned();
  if(policy) return false; /* plant:first-signin-gate */
  if(signinStranded(s)) return false; /* plant:first-signin-stranded */
  return !!(s && s.offered.length && !s.signedIn && !seen);
}
let firstSigninPending=false, firstSigninOpen=false, firstSigninWaits=[];
function firstSigninStands(){ return !!(firstSigninPending || firstSigninOpen); }
function onFirstSigninClosed(fn){
  if(typeof fn!=="function") return;
  if(!firstSigninStands()){ fn(); return; }
  firstSigninWaits.push(fn);
}
function tellFirstSigninClosed(){
  const w=firstSigninWaits; firstSigninWaits=[];
  w.forEach(fn=>fn());
}
function firstSigninOpenNow(){ return !!firstSigninOpen; }
function firstSigninMarkHtml(){
  const svg=typeof document!=="undefined" ? document.querySelector(".brand-tile svg") : null;
  if(!svg) return "";
  /* The header's mark under a mask id of its own. The header's id is read from its mask and never written here, so the
     page holds that id once (tests/mark-layout.mjs counts it), and a second mark can never answer for the first's mask. */
  const mask=svg.querySelector("mask"), was=mask ? mask.id : "", own=was+"-first-signin";
  const html=was ? svg.outerHTML.split('id="'+was+'"').join('id="'+own+'"').split("url(#"+was+")").join("url(#"+own+")") : svg.outerHTML;
  return '<div class="fs-mark" aria-hidden="true">'+html+'</div>';
}
function paintFirstSignin(){
  if(!firstSigninOpen || typeof document==="undefined") return;
  const el=$("#firstSignin"); if(!el) return;
  const hadFocus=el.contains(document.activeElement);
  const d=signinDoor(signinV);
  const ds=deskDoorState(signinV);
  const doorish=ds.state==="waiting"||ds.state==="trial-over-org"||ds.state==="trial-over"||ds.state==="stopped"||ds.state==="first"||ds.state==="first-offline";
  const opening=!doorish && d && d.moment==="before";
  if(doorish || opening){
    el.innerHTML=firstSigninHtml(signinV, {forceFirst:opening});
  }else{
  const skipBtn='<button type="button" class="btn fs-skip-btn" id="firstSigninSkip">'+esc(t("Not now"))+'</button>';
  const skipLine='<p class="fs-skip-line">'+esc(t("The desk opens as it is, and Sign in stays in the bar at the top for later."))+'</p>';
  let rightBody="";
  if(d){
    rightBody=signinPanelHtml(Object.assign({}, d, {foot:""}));
  }
  el.innerHTML='<div class="fs-grid">'
    +'<div class="fs-left"><div class="fs-left-in"><div class="fs-body">'
      +firstSigninMarkHtml()
      +'<h1 id="fsHeading">'+esc(t("Sign in to Etiuda"))+'</h1>'
      +'<p class="fs-lede">'+esc(t("Your seat belongs to your account, so it comes with you to any computer you sign in on, up to three."))+'</p>'
      +doorStepsHtml()
    +'</div><p class="fs-foot">'+esc(t("No licence key to keep"))+'</p></div></div>'
    +'<div class="fs-right"><div class="fs-right-in">'
      +'<h2 class="fs-rh">'+esc(t("Signing in"))+'</h2>'
      +rightBody
    +'</div></div></div>';
  let showSkip=d && d.moment==="refused";
  if(d && d.moment==="managed-refused") showSkip=true; /* plant:first-signin-managed-skip */
  if(showSkip){
    const acts=el.querySelector(".sgn-acts");
    if(acts){
      acts.insertAdjacentHTML("beforeend", skipBtn);
      acts.insertAdjacentHTML("afterend", skipLine);
    }else{
      const rin=el.querySelector(".fs-right-in");
      if(rin) rin.insertAdjacentHTML("beforeend", '<div class="fs-skip">'+skipBtn+skipLine+'</div>');
    }
  }else if(d && d.moment==="stranded"){
    const rin=el.querySelector(".fs-right-in");
    if(rin) rin.insertAdjacentHTML("beforeend", '<div class="fs-skip"><button type="button" class="btn primary fs-skip-btn" id="firstSigninSkip">'+esc(t("Continue"))+'</button></div>'); /* plant:first-signin-stranded-btn */
  }
  }
  if(hadFocus){
    const first=el.querySelector("button:not(:disabled), input");
    if(first) try{ first.focus({preventScroll:true}); }catch(e){ first.focus(); }
  }
  hugDottedGround(el); /* plant:first-signin-dots */
}
function skipFirstSignin(){
  if(!firstSigninPending && !firstSigninOpen) return;
  if(signinV && signinV.busy) signinCall("signinStop");
  closeFirstSignin();
}
function openFirstSignin(){
  firstSigninPending=false;
  firstSigninOpen=true;
  markFirstSigninSeen(); /* plant:first-signin-mark */
  if(typeof document==="undefined") return;
  document.body.classList.add("e-first-signin");
  const el=$("#firstSignin");
  if(el){ el.hidden=false; el.setAttribute("aria-hidden","false"); }
  paintFirstSignin();
  if(el){
    const first=el.querySelector("button:not(:disabled), input");
    if(first) try{ first.focus({preventScroll:true}); }catch(e){ first.focus(); }
  }
}
function closeFirstSignin(){
  if(!firstSigninPending && !firstSigninOpen) return;
  firstSigninPending=false;
  firstSigninOpen=false;
  if(typeof document!=="undefined"){
    document.body.classList.remove("e-first-signin");
    const el=$("#firstSignin");
    if(el){ el.hidden=true; el.setAttribute("aria-hidden","true"); el.innerHTML=""; }
  }
  tellFirstSigninClosed();
}
function bootFirstSignin(land){
  if(!firstSigninPending && !firstSigninDue()) return;
  if(!firstSigninDue()){ firstSigninPending=false; tellFirstSigninClosed(); return; }
  firstSigninPending=true;
  const run=()=>{
    if(!firstSigninDue()){ closeFirstSignin(); return; }
    openFirstSignin();
  };
  if(typeof land==="function") land(run); else run();
}
/* The code in four groups of four, as it is read aloud; Copy takes it without the spaces. */
function signinCodeText(code){ return String(code||"").replace(/(.{4})(?=.)/g,"$1 "); }
/* A day as the panel says one: "27 Nov". */
function signinDay(at){
  return new Date(at).toLocaleDateString(uiLang()==="pl" ? "pl-PL" : "en-GB",{day:"numeric", month:"short"});
}
/* A day as the door's lines say one: "1 December", with the year when the date is in another year. */
function doorDay(at, now){
  const d=new Date(at), lang=uiLang()==="pl" ? "pl-PL" : "en-GB";
  const opt={day:"numeric", month:"long"};
  if(d.getFullYear()!==new Date(now>0?now:Date.now()).getFullYear()) opt.year="numeric"; /* plant:door-day-year */
  return d.toLocaleDateString(lang, opt);
}
function signinWhen(at){
  if(!at) return "";
  const d=new Date(at), now=new Date(), lang=uiLang()==="pl" ? "pl-PL" : "en-GB";
  const time=d.toLocaleTimeString(lang,{hour:"2-digit", minute:"2-digit"});
  if(d.toDateString()===now.toDateString()) return t("today, {TIME}").split("{TIME}").join(time);
  return d.toLocaleDateString(lang,{day:"numeric", month:"short"})+", "+time;
}
function signinTeam(){
  const l=teamLeads().find(x=>!x.removed);
  return l ? {lead:String(l.lead||"")} : null;
}
const named=(s,k,v)=>String(s).split(k).join(v);
/* The parts every form draws from: who (the initial, the person's own name, the provider's name), the code, the team. Nothing in it
   came from the provider but which provider it is. */
function signinParts(v){
  const name=String(agentName()||"").trim(), prov=SIGNIN_NAMES[v.signedIn]||"";
  const team=signinTeam();
  return {
    initial: name ? name[0].toUpperCase() : "",
    name: name,
    sub: prov ? named(t("Signed in with {PROVIDER}"),"{PROVIDER}",prov)+(v.reached ? "" : " · "+t("service not reached just now")) : "",
    off: !v.reached,
    code: v.code,
    team: team,
    teamName: team ? (team.lead ? named(t("{LEAD}'s team"),"{LEAD}",team.lead) : t("Team")) : ""
  };
}
/* The two sentences a refusal or a quiet state is told in, [heading, line], by the shell's reason. */
function signinSay(reason, v, p){
  const prov=SIGNIN_NAMES[v.busy||v.signedIn]||"";
  if(signinRefusedHere(reason, v)) return signinRefusedWords(v);
  if(reason==="nolicence" && signinManaged(v)) /* plant:no-role-managed */
    return signinNoRoleWords(v);
  switch(reason){
    case "unreached": case "signin-unreached": case "signin-timeout": case "signin-browser":
      return [t("The sign-in service could not be reached."), t("Nothing changed: this computer is not signed in, and Etiuda works as before.")];
    /* Where Managed is not set, decision 20 (b)'s words serve an account not assigned as they serve the organisation's refusal. */
    case "signin-notassigned":
    case "signin-notallowed": /* plant:unmanaged-contact */
      { const c=v && v.managed ? v.managed.contact : "";
        return [t("This account's organisation has not allowed Etiuda at its sign-in provider."),
          c ? named(t("To ask for access: {CONTACT}. Another account can be used meanwhile."),"{CONTACT}",c)
            : t("Its IT department can allow it; another account can be used meanwhile.")]; }
    case "no-role":
      return signinNoRoleWords(v);
    case "seat-removed": /* plant:seat-removed-contact */
      { const c=v && v.managed ? v.managed.contact : "";
        return [t("Your organisation no longer gives this account access to Etiuda."),
          c ? named(t("This desk keeps its catalog and works with it as before, but new editions from the team no longer reach it. To ask for access: {CONTACT}."),"{CONTACT}",c)
            : t("This desk keeps its catalog and works with it as before, but new editions from the team no longer reach it. The organisation's IT department can give access again.")]; }
    case "seat-renew":
      return [t("This account's sign-in needs renewing."), t("This desk keeps its catalog and works with it as before. Signing in again, under Account, brings the team's new editions back.")];
    case "desks":
      return [t("This account is already in use on three computers."), t("Signing out on one of them makes room here, and so does a computer left unused for 30 days; then Try again.")];
    case "waiting": case "full": /* plant:wait-say */
      return p && p.team && p.team.lead
        ? [named(t("{TEAM} has no free seat just now."),"{TEAM}",p.teamName), named(t("The sign-in worked. This computer takes a seat by itself as soon as one is free; nobody needs to do anything, and {LEAD}, the team's lead, sees this account's sign-in code among those who have signed in."),"{LEAD}",p.team.lead)]
        : [t("No seat is free on the organisation's licence just now."), t("The sign-in worked. This computer takes a seat by itself as soon as one is free; nobody needs to do anything, and the team's lead sees this account's sign-in code among those who have signed in.")];
    case "asklead":
      return [t("The organisation's Etiuda licence seats the people its leads add."),
        signinManaged(v) ? t("This account is signed in, and no team has admitted it yet. Once a lead admits it, the catalog arrives by itself.") /* plant:asklead-line-managed */
          : t("Give the team's lead this code. Once added, this desk takes its seat by itself; nothing more is needed here.")];
    case "nolicence":
      return [t("No Etiuda licence has a seat for this account."), t("The sign-in worked. A seat comes from a trial, a purchase, or a team's lead admitting the account; another account can be used meanwhile.")];
    case "offline":
      return [t("The sign-in service cannot be reached just now."), named(t("Etiuda keeps working with the catalog it has. Last checked {WHEN}."),"{WHEN}",signinWhen(v.at))];
    case "lapsed":
      return [t("This desk's seat is due for renewal."), t("It renews by itself the next time the sign-in service answers. Everything on this desk works as before.")];
    case "ask":
      return [t("This computer could not renew its sign-in by itself."), t("Signing in again renews it.")];
    case "signin-preview":
      return [t("Sign-in is not set up yet, so nothing was sent. This is a preview."), ""];
    case "door":
      return [t("This team is no longer offered here, or this computer is already in a team, so nothing was sent."), ""];
    case "signin-keyring":
      return [t("Signing in needs a keyring, and none is open on this computer."), t("Installing or unlocking GNOME Keyring or KDE Wallet, then reopening Etiuda, lets this computer sign in.")];
    case "signin-switch-out":
      return [t("The sign-in service could not be reached."), t("This computer is now signed out of the account it had. Signing in, with either account, works once the sign-in service answers, and nothing on this desk is lost meanwhile.")]; /* plant:switch-out-words */
    case "signin-switch-unmade":
      return [t("The sign-in service did not confirm the change of account."), ""];
    case "signin-other": /* plant:signin-other-words */
      { const c=v && v.managed ? v.managed.contact : "";
        return [t("This computer stays with the account it has."),
          c ? named(t("Your organisation manages the accounts on this computer, so another account cannot sign in here; nothing changed. To ask about it: {CONTACT}."),"{CONTACT}",c)
            : t("Your organisation manages the accounts on this computer, so another account cannot sign in here; nothing changed. The organisation's IT department decides which account is used here.")]; }
    default:
      return [t("The sign-in did not finish."), t("Nothing changed, and signing in can be tried again.")];
  }
}
/* No free seat: the service's wait, "waiting", or its refusal, "full"; either way the shell renews quietly until a seat frees. */
function signinNoSeat(v){ return v.refused==="waiting" || v.refused==="full"; } /* plant:no-seat */
/* Refusals whose own heading names the reason a sign-in pressed while signed in failed for. */
const SIGNIN_REASON_SAID=["desks","no-role","signin-notallowed","unreached","signin-unreached","signin-timeout","signin-browser","signin-notassigned","signin-tenant","signin-switch-unmade"];
/* What a signed-in desk is told over its moment, or null: {kind, say, acts, providers}. "pressed", a sign-in the person pressed while
   signed in that failed, which leaves the desk signed in as it was; else a refusal the shell kept from a renewal or Check now. */
function signinTold(v){
  if(!v || !v.signedIn) return null;
  if(v.said==="signin-other") return {kind:"pressed", say:signinSay("signin-other", v), acts:[{act:"choose", label:t("Try again"), solid:true}]}; /* plant:told-other */
  if(FAIL_FIRST.indexOf(v.said)>=0) return {kind:"pressed", say:[t("The new sign-in did not finish."), named(t("This computer stays signed in with the account it had. {REASON}"),"{REASON}",
    SIGNIN_REASON_SAID.indexOf(v.said)>=0 ? signinSay(v.said, v)[0] : "").trim()],
    acts:[{act:"choose", label:ANOTHER_FOR.indexOf(v.said)>=0 && !signinRefusedHere(v.said, v) ? t("Use another account") : t("Try again"), solid:true}]}; /* plant:told-pressed */
  const r=v.refused;
  if(!r || r==="signin" || signinNoSeat(v)) return null; /* plant:told-renewal */
  if(r==="no-role") return {kind:"renewal", say:signinSay("no-role", v), acts:[]}; /* plant:told-no-role */
  if(r==="signin-notassigned") return {kind:"renewal", say:signinSay("signin-notassigned", v), acts:[]}; /* plant:told-notassigned */
  if(r==="desks") return {kind:"desks", say:[t("This account is signed in on three computers already."),
    t("A seat holds three computers. Signing out on one of the others frees its place, and this computer checks again by itself.")],
    acts:[{act:"check", label:t("Check now"), solid:true}]};
  return {kind:"renewal", say:[t("The sign-in service did not accept this account's sign-in."),
    t("Signing in again settles it; until then, Etiuda keeps working with the catalog it has.")], acts:[], providers:true};
}
const FAIL_FIRST=["unreached","signin-unreached","signin-timeout","signin-browser","signin-notallowed","desks","no-role","token","signin","signin-refused","signin-token","signin-unbound","signin-state","signin-none","signin-preview","signin-keyring"];
/* Decision 49's own: an account not assigned, a sign-in outside the pinned tenant, and another account on a managed computer. */
FAIL_FIRST.push("signin-notassigned","signin-tenant","signin-other");
/* A switch whose held account was signed out at the service, the service then unreached for the new one, or whose switch signout was not confirmed (shell/main.js, the press). */
FAIL_FIRST.push("signin-switch-out","signin-switch-unmade"); /* plant:switch-unmade-first */
/* The refusals whose way on is another account, where the computer offers one. */
const ANOTHER_FOR=["signin-notallowed","signin-notassigned"];
/* THE DESK'S DOOR, as the page is told to show it (piece B-3b). One value, from the fields signinRead already keeps.
   B-3a replaces this body with the gate and leaves every painter. Two facts are the nearest field, marked below. */
function deskDoorState(v){
  if(!v || !Array.isArray(v.offered)) v=signinRead(v);
  const seat=v.holding, seatOn=seat?seat.on:"";
  const deskEnd=(v.trials&&v.trials.desk)||(seatOn==="trial"&&seat&&seat.ends)||0;
  const studioEnd=(v.trials&&v.trials.studio)||0;
  const ends=seat&&seat.ends?seat.ends:0;
  const team=signinTeam();
  const lead=(seat&&seat.lead)||(team&&team.lead)||"";
  const waitingOnLead=!!v.askLead; /* B-3a feeds this */
  const orgLicence=!!v.licenceManaged; /* B-3a feeds this */
  let day=0;
  if(seatOn==="trial" && deskEnd && v.now){
    const left=Math.round((deskEnd-v.now)/86400000);
    day=Math.max(1, Math.min(14, 14-left));
  }
  let state="none";
  if(v.works && v.ended>0) state="ended"; /* plant:door-state-ended */
  else if(!v.works && v.signedIn && (v.ended>0 || (v.stoppedAt>0 && seatOn!=="trial") || (seatOn && seatOn!=="trial"))) state="stopped"; /* plant:door-state-stopped */
  else if(!v.works && v.signedIn && (seatOn==="trial" || (!seatOn && deskEnd>0)) && waitingOnLead) state="waiting"; /* plant:door-state-waiting */
  else if(!v.works && v.signedIn && seatOn==="trial" && orgLicence) state="trial-over-org";
  else if(!v.works && v.signedIn && seatOn==="trial") state="trial-over";
  else if(v.works && v.signedIn && seatOn) state="working";
  else if(!v.signedIn && v.offered.length && !v.online && !signinWaiting(v) && !signinStranded(v)) state="first-offline"; /* plant:door-first-offline */
  else if(!v.signedIn && v.offered.length && v.registered && v.online && !signinWaiting(v) && !signinStranded(v)) state="first";
  return {state:state, lead:lead, deskEnd:deskEnd, studioEnd:studioEnd, ended:v.ended||0, until:v.until||0,
    stoppedAt:v.stoppedAt||0, why:seatOn, seatOn:seatOn, ends:ends, day:day, waitingOnLead:waitingOnLead,
    orgLicence:orgLicence, online:v.online!==false, now:v.now||0};
}
function deskWhySentence(on, lead){
  if(on==="trial") return t("its trial ended");
  if(on==="studio-trial") return t("the Etiuda Studio trial that covered it ended");
  if(on==="own") return t("the licence ended");
  if(on==="team") return lead ? named(t("the seat on the team {LEAD} leads ended"),"{LEAD}",lead) : t("the seat on the team ended");
  if(on==="org") return t("the organisation's licence no longer gives this account a seat");
  return "";
}
/* Heading and line for the state the door, the panel and the Seat row all read. */
function deskDoorLines(ds){
  const lead=ds.lead||"", n=String(ds.day||0), dayAt=(at)=>at?doorDay(at, ds.now):"";
  const desk=dayAt(ds.deskEnd), studio=dayAt(ds.studioEnd);
  const ends=dayAt(ds.ends), ended=dayAt(ds.ended), until=dayAt(ds.until);
  const stopped=dayAt(ds.stoppedAt);
  const fill=(s, map)=>Object.keys(map).reduce((a,k)=>a.split(k).join(map[k]), s);
  if(ds.state==="first" || ds.state==="first-offline") return [t("Etiuda starts with a sign-in."),
    t("Signing in with Microsoft or Google gives this computer a seat: the team's, where its lead has admitted this account, or else a trial of fourteen days. Catalogs open once the seat is here.")];
  if(ds.state==="waiting") return [t("The request to join is waiting."),
    lead ? fill(t("Catalogs open here again once {LEAD}, the team's lead, accepts it. Etiuda's own fourteen days ended on {DESK_END}."), {"{LEAD}":lead, "{DESK_END}":desk})
      : fill(t("Catalogs open here again once the team's lead accepts it. Etiuda's own fourteen days ended on {DESK_END}."), {"{DESK_END}":desk})];
  if(ds.state==="trial-over-org") return [t("Etiuda's trial has ended."),
    fill(t("It ended on {DESK_END}. This account's organisation holds an Etiuda licence, so a team's lead can admit this account; buying a licence opens the catalogs again too."), {"{DESK_END}":desk})];
  if(ds.state==="trial-over") return [t("Etiuda's trial has ended."),
    fill(t("It ended on {DESK_END}. Buying a licence opens the catalogs again."), {"{DESK_END}":desk})];
  if(ds.state==="ended") return [fill(t("This account's seat ended on {ENDED}."), {"{ENDED}":ended}),
    fill(t("Etiuda keeps working on this computer until {DATE}, when its last confirmation runs out, and then stops. A purchase, or a team's lead admitting this account, brings the seat back."), {"{DATE}":until})];
  if(ds.state==="stopped") return [t("Etiuda has stopped on this computer."),
    fill(t("It stopped on {DATE}: {WHY}. Signing in with an account that has a seat, a purchase, or a team's lead admitting this account starts it again."),
      {"{DATE}":stopped, "{WHY}":deskWhySentence(ds.why, lead)})];
  if(ds.state==="working" && ds.seatOn==="studio-trial") return [t("Etiuda now runs on the Etiuda Studio trial."),
    fill(t("Etiuda's own fourteen days ended on {DESK_END}. The Etiuda Studio trial on this account began later and covers Etiuda too, until {STUDIO_END}."), {"{DESK_END}":desk, "{STUDIO_END}":studio})];
  if(ds.state==="working" && ds.seatOn==="own") return [t("This account holds an Etiuda licence."),
    fill(t("Paid until {ENDS}, on up to three computers."), {"{ENDS}":ends})];
  if(ds.state==="working" && ds.seatOn==="team") return [lead ? fill(t("This account has a seat on the team {LEAD} leads."), {"{LEAD}":lead}) : t("This account has a seat on a team."),
    fill(t("It renews by itself; the team's licence runs until {ENDS}."), {"{ENDS}":ends})];
  if(ds.state==="working" && ds.seatOn==="org") return [t("This account has a seat on its organisation's licence."),
    fill(t("It renews by itself; the licence runs until {ENDS}."), {"{ENDS}":ends})];
  if(ds.state==="working" && ds.waitingOnLead) return [t("Etiuda's own trial is running."),
    lead ? fill(t("Day {N} of 14, until {DESK_END}. The request to join waits for {LEAD}, and Etiuda works meanwhile."), {"{N}":n, "{DESK_END}":desk, "{LEAD}":lead})
      : fill(t("Day {N} of 14, until {DESK_END}. The request to join waits for the team's lead, and Etiuda works meanwhile."), {"{N}":n, "{DESK_END}":desk})];
  if(ds.state==="working") return [t("Etiuda's own trial is running."),
    fill(t("Day {N} of 14, until {DATE}, on up to three computers."), {"{N}":n, "{DATE}":desk})];
  return ["", ""];
}
function doorBandState(v){
  const ds=deskDoorState(v);
  if(ds.state!=="ended") return {shown:false, dot:false, text:"", tip:""}; /* plant:door-band-ended */
  const ended=doorDay(ds.ended, ds.now), until=doorDay(ds.until, ds.now);
  return {shown:true, dot:true,
    text:named(named(t("Seat ended {ENDED} · Etiuda stops {DATE}"),"{ENDED}",ended),"{DATE}",until),
    tip:named(t("This account's seat has ended; Etiuda stops on {DATE}."),"{DATE}",until)};
}
function doorAskLabel(lead){
  if(!lead) return t("Ask a team's lead…"); /* plant:door-ask-noname */
  return named(t("Ask {LEAD}"),"{LEAD}",lead);
}
function doorPress(label, solid, act){
  const buy=act==="buy"?' data-e-open="buy"':'';
  return '<button type="button" class="btn'+(solid?" primary":"")+'" data-signin-act="'+esc(act)+'"'+buy+'>'+esc(label)+'</button>';
}
function doorTextPress(label, act){
  return '<button type="button" class="door-text" data-signin-act="'+esc(act)+'">'+esc(label)+'</button>';
}
function doorScreen(leftBody, rightInner, foot){
  return '<div class="fs-grid"><div class="fs-left"><div class="fs-left-in"><div class="fs-body">'
    +firstSigninMarkHtml()+leftBody+'</div>'+(foot||"")+'</div></div>'
    +'<div class="fs-right"><div class="fs-right-in">'+rightInner+'</div></div></div>';
}
function doorBare(heading, line){
  return doorScreen('<h1 id="fsHeading">'+esc(heading)+'</h1><p class="fs-lede">'+esc(line)+'</p>', "", "");
}
function doorStepsHtml(){
  return '<h2 class="fs-steps-h">'+esc(t("What happens"))+'</h2><ol class="fs-steps">'
    +'<li><span class="fs-step-n" aria-hidden="true">1</span><span>'+esc(t("The browser opens the sign-in page"))+'</span></li>'
    +'<li><span class="fs-step-n" aria-hidden="true">2</span><span>'+esc(t("You choose your account there"))+'</span></li>'
    +'<li><span class="fs-step-n" aria-hidden="true">3</span><span>'+esc(t("Etiuda carries on here by itself"))+'</span></li>'
    +'</ol>';
}
/* The full screen for the state `v` is told, or for sentences (b) and (c) when opts.doorKind says so. "" when nothing stands. */
function firstSigninHtml(v, opts){
  const o=opts && typeof opts==="object" ? opts : {};
  if(o.doorKind==="no-signin") return doorBare(t("This build of Etiuda cannot sign in."),
    t("It was made without a way to sign in, so no catalog opens here."));
  if(o.doorKind==="browser") return doorBare(t("Etiuda works in its desktop app."), t("In a browser, no catalog opens."));
  if(!v) return "";
  const ds=deskDoorState(v);
  if(ds.state==="waiting" || ds.state==="trial-over-org" || ds.state==="trial-over" || ds.state==="stopped") return doorLaterHtml(v, ds);
  if(ds.state==="first" || ds.state==="first-offline" || o.forceFirst) return doorFirstHtml(v, ds);
  return "";
}
function doorFirstHtml(v, ds){
  const drawn=ds.state==="first" || ds.state==="first-offline" ? ds : Object.assign({}, ds, {state:ds.online?"first":"first-offline"});
  const pair=deskDoorLines(drawn.state==="first" || drawn.state==="first-offline" ? drawn : Object.assign({}, drawn, {state:"first"}));
  const door=signinDoor(v)||{moment:""};
  const d={state:ds.state, moment:door.moment||""};
  const showSkip=(d.state==="none") && (d.moment==="refused" || d.moment==="managed-refused"); /* plant:door-no-skip */
  const offline=drawn.state==="first-offline" || ds.state==="first-offline";
  const priv=t("This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The leads and administrator of the licence it joins see the account's name, address and picture."); /* plant:door-privacy-short */
  let right='<h2 class="fs-rh">'+esc(t("Signing in"))+'</h2>';
  if(offline) right+='<div class="door-off"><span>'+esc(t("Signing in needs an internet connection. The buttons appear here by themselves once this computer is online."))+'</span></div>';
  else if(v.offered && v.offered.length) right+=signinProvidersHtml(v.offered, false);
  if(signinCapHolds(v)) right+='<p class="sgn-cap">'+esc(t("Microsoft: a work, school or personal account. Google: a Workspace or personal account."))+'</p>';
  right+='<p class="sgn-cap fs-privacy">'+esc(priv)+'</p>';
  if(v.keeps===false) right+='<p class="sgn-cap">'+esc(t("This computer cannot keep a sign-in, so Etiuda asks for one again when the seat renews, at most every thirty days."))+'</p>';
  if(showSkip) right+='<div class="fs-skip"><button type="button" class="btn fs-skip-btn" id="firstSigninSkip">'+esc(t("Not now"))+'</button>'
    +'<p class="fs-skip-line">'+esc(t("The desk opens as it is, and Sign in stays in the bar at the top for later."))+'</p></div>';
  const left='<h1 id="fsHeading">'+esc(pair[0])+'</h1><p class="fs-lede">'+esc(pair[1])+'</p>'+doorStepsHtml();
  const foot='<p class="fs-foot">'+esc(t("No licence key to keep"))+'</p>';
  return doorScreen(left, right, foot);
}
function doorLaterHtml(v, ds){
  const pair=deskDoorLines(ds);
  const askable=ds.state==="trial-over-org" || (ds.state==="stopped" && (ds.orgLicence || ds.seatOn==="team"));
  const checkFilled=ds.state==="waiting";
  let acts="";
  if(checkFilled) acts+=doorPress(t("Check now"), true, "check");
  else if(askable) acts+=doorPress(doorAskLabel(ds.lead), true, "ask");
  else acts+=doorPress(t("Buy"), true, "buy");
  if(checkFilled || askable) acts+=doorPress(t("Buy"), false, "buy");
  const quiet=[];
  if(!checkFilled) quiet.push(doorTextPress(t("Check now"), "check"));
  quiet.push(doorTextPress(t("Use another account"), "another"));
  quiet.push(doorTextPress(t("Sign out"), "out"));
  const out=ds.state!=="waiting";
  const wayOut=out ? '<div class="door-out"><button type="button" class="btn" data-door-save>'+esc(t("Save your own work as files…"))+'</button><p class="sgn-cap">'+esc(t("What this account made here can still be saved as files, in a folder of your choice: its own cards, its edits to a catalog's cards, and the flags it raised. Catalogs themselves are not saved."))+'</p></div>' : "";
  const p=signinParts(v);
  const right=signinIdentHtml({initial:p.initial, name:p.name, sub:p.sub, off:p.off})
    +'<div class="sgn-acts door-acts">'+acts+'</div><div class="door-quiet">'+quiet.join("")+'</div>'+wayOut;
  const left='<h1 id="fsHeading">'+esc(pair[0])+'</h1><p class="fs-lede">'+esc(pair[1])+'</p>';
  return doorScreen(left, right, "");
}
function paintDoorBand(){
  const band=doorBandState(signinV);
  const el=$("#doorBand");
  if(el){
    el.hidden=!band.shown;
    el.setAttribute("aria-hidden", band.shown ? "false" : "true");
    el.innerHTML=band.shown ? '<span class="door-band-dot" aria-hidden="true"></span><span>'+esc(band.text)+'</span>' : "";
  }
  const btn=$("#signinBtn");
  if(!btn || typeof btn.querySelector!=="function") return; /* plant:door-band-dot */
  let dot=btn.querySelector(".door-btn-dot");
  if(band.dot){
    if(!dot) btn.insertAdjacentHTML("beforeend", '<span class="door-btn-dot" aria-hidden="true"></span>');
    btn.title=band.tip;
  }else if(dot) dot.remove();
}
/* THE DOOR'S CONTENT for the view `v`, whatever form draws it: {moment, ident, heading, line, say, calm, code, providers, cap, privacy, foot,
   acts: [{act, label, solid}]}; null where there is no door. The shell is separate from what it does: signinPanelHtml is the one
   form drawn today (a button in the header with a panel under it), and another form takes the same content. */
/* In the sign-in preview (shell/main.js signinPreviewing) every moment carries the copywriter's line, drawn in the frame, but the
   press's, whose heading is the line. */
function signinDoor(v){
  const d=signinDoorOf(v);
  if(d && v.signedIn && signinDoorRefused){ d.say=signinSay("door", v); d.calm=false; }
  if(d && v.preview && v.said!=="signin-preview") d.preview=t("Preview only.")+" "+t("Sign-in is not set up yet, so nothing here is sent.");
  return d;
}
function signinDoorOf(v){
  if(!signinShown(v)) return null;
  const p=signinParts(v), acct={act:"account", label:t("Account settings")};
  const ident={initial:p.initial, name:p.name, sub:p.sub, off:p.off};
  if(signinWaiting(v)) return {moment:"policy-waiting", say:signinWaitingWords()}; /* plant:door-waiting */
  if(signinStranded(v)) return {moment:"stranded", say:signinStrandedWords(v)};
  if(v.busy) return {moment:"waiting", heading:t("Finish signing in in the browser"),
    line:named(t("The browser has opened {PROVIDER}'s sign-in page. Etiuda waits here and carries on by itself when you come back."),"{PROVIDER}",SIGNIN_NAMES[v.busy]),
    wait:named(t("Waiting for {PROVIDER}…"),"{PROVIDER}",SIGNIN_NAMES[v.busy]),
    acts:(v.link ? [{act:"again", label:t("Open the browser again")}] : []).concat([{act:"stop", label:t("Cancel")}]), link:v.link}; /* plant:waiting-again */
  if(!v.signedIn){
    if(FAIL_FIRST.indexOf(v.said)>=0){
      const s=signinSay(v.said, v);
      /* The account the organisation has not given access, as the product designer drew it: who, the refusal, whom to ask, Try again. */
      if(signinRefusedHere(v.said, v)) return {moment:"managed-refused", ident:{initial:"", name:t("Not signed in"), sub:"", off:false}, say:s,
        acts:[{act:"choose", label:t("Try again"), solid:true}]}; /* plant:door-refused-managed */
      return {moment:"refused", heading:s[0], line:s[1],
        /* The preview's press stopped nothing, so its way on is Back to the choice, never Try again. */
        acts:[ANOTHER_FOR.indexOf(v.said)>=0 ? {act:"choose", label:t("Use another account"), solid:true}
          : v.said==="signin-preview" ? {act:"choose", label:t("Back")} : {act:"choose", label:t("Try again"), solid:true}]};
    }
    return {moment:"before", heading:t("Sign in to Etiuda"),
      line:t("Your seat belongs to your account, so it comes with you to any computer you sign in on, up to three."),
      providers:v.offered, cap:signinCapHolds(v) ? t("Microsoft: a work, school or personal account. Google: a Workspace or personal account.") : "", privacy:t("This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The licence service keeps the account's name, address and picture, and shows them only to the leads and administrator of the licence it asks to join."),
      foot:""};
  }
  const told=signinTold(v), toldDoor=()=>({moment:told.kind, ident, say:told.say, providers:told.providers ? v.offered : undefined, acts:told.acts.concat([acct])});
  if(told && told.kind==="pressed") return toldDoor();
  /* The relay refused this desk's seat: what that means to the person, never a fault of the team or its lead. */
  if(v.relaySeat) return {moment:"relayseat", ident, say:signinSay(v.relaySeat==="removed" ? "seat-removed" : "seat-renew", v), /* plant:relay-seat-moment */
    providers:v.relaySeat==="renew" ? v.offered : undefined, acts:[acct]};
  if(v.ask) return {moment:"ask", ident, say:signinSay("ask", v), providers:v.offered, acts:[acct]};
  if(told) return toldDoor();
  if(signinNoSeat(v)) return {moment:"noseat", ident, say:signinSay(v.refused, v, p), acts:[{act:"check", label:t("Check now"), solid:true}, acct]};
  /* The door's states 4 and 6, read from the one value. A refusal, a relay and a renewal still say what they said above. */
  const ds=deskDoorState(v);
  if(ds.state==="ended"){
    const endedPair=deskDoorLines(ds);
    const ask=!!(ds.orgLicence || ds.seatOn==="team");
    const acts=[];
    if(ask) acts.push({act:"ask", label:doorAskLabel(ds.lead), solid:true});
    else acts.push({act:"check", label:t("Check now"), solid:true});
    acts.push({act:"buy", label:t("Buy")});
    if(ask) acts.push({act:"check", label:t("Check now")});
    acts.push(acct);
    return {moment:"ended", ident, heading:endedPair[0], line:endedPair[1], acts:acts};
  }
  const pair=deskDoorLines(ds);
  if(ds.state==="working") return {moment:"working", ident, heading:pair[0], line:pair[1], acts:[{act:"check", label:t("Check now")}, acct]}; /* plant:door-panel-working */
  /* ASK YOUR LEAD: the organisation's licence seats the people its
     leads add, so the code is given to a lead; beside it, never in its place, the person's own trial where it runs, which the service
     started at the sign-in. */
  if(v.askLead) return {moment:"asklead", ident, say:signinSay("asklead", v), code:signinManaged(v)?"":v.code, /* plant:asklead-code-managed */
    acts:[{act:"check", label:t("Check now")}, acct],
    own:signinManaged(v)?null:v.seat==="held" && v.trialUntil ? [t("This account's own trial is running."), /* plant:asklead-trial-managed */
      named(t("Fourteen days, until {DATE}, on up to three computers. A lead can add this account at any time, without waiting for the trial to end."),"{DATE}",signinDay(v.trialUntil))] : null};
  /* No certificate: the service found no licence with a seat for this account. The code still shows, since a lead admits by it, save on
     a managed computer, where nobody is admitted by code. */
  if(v.seat==="none" || !v.seat) return {moment:"nolicence", ident, say:signinSay("nolicence", v), code:signinManaged(v) ? "" : v.code, /* plant:code-managed */
    acts:[{act:"check", label:t("Check now"), solid:true}, acct]};
  /* A managed computer's seat, as the product designer drew it: who decides, and the seat with when it was last checked; no code and no button. */
  if(signinManaged(v) && v.reached && v.seat==="held" && !(!p.team && v.doors.length)) return {moment:"managed", ident, /* plant:door-managed */
    say:[t("Managed by your organisation."), t("Your organisation gave this account its seat on this desk. Its IT department decides who uses Etiuda here, and with which account.")],
    foot:named(t("Seat held · checked {WHEN}"),"{WHEN}",signinWhen(v.at))};
  /* A team on the relay under this licence: one press asks to join it, and its lead's Studio lets a person it knows in. */
  if(!p.team && v.seat==="held" && v.doors.length) return {moment:"doors", ident, heading:t("A team on this licence"),
    line:t("This licence has a team on the relay. If the team's lead has admitted this account before, asking to join lets this computer in once the lead's Studio sees the request; otherwise the lead can send an invitation."),
    doors:v.doors, acts:[acct]};
  /* A desk-only licence has no lead to wait for, so it is not told to wait for one. */
  if(!p.team && v.reached && v.seat==="held") return {moment:"noteam", ident, heading:v.deskOnly ? t("Working without a team") : t("Signed in. No team yet"),
    line:v.deskOnly ? t("This computer has its seat, and Etiuda works with its own catalog. Nothing else is needed.") /* plant:panel-desk-only */
      : t("No team has admitted this account yet. Once a lead admits it by the code below, the catalog arrives by itself."), code:v.code,
    acts:[{act:"check", label:t("Check now")}, acct]};
  const out={moment:"signed", ident, team:p.team ? p.teamName+(p.team.lead ? " · "+named(t("Led by {LEAD}"),"{LEAD}",p.team.lead) : "") : t("No team yet"), acts:[acct]};
  if(!v.reached){ out.moment="offline"; out.say=signinSay("offline", v); out.calm=true; out.acts=[{act:"check", label:t("Check now")}, acct]; }
  else if(v.seat==="lapsed"){ out.moment="lapsed"; out.say=signinSay("lapsed", v); out.calm=true; out.acts=[{act:"check", label:t("Check now")}, acct]; }
  return out;
}

/* ---- the drawing, shared by the panel and Account ------------------------------------------------------------------------ */
const ICON_PERSON='<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="6.8" r="3.2"/><path d="M3.6 17c.7-3.2 3.3-5 6.4-5s5.7 1.8 6.4 5"/></svg>';
const LOGO={
  microsoft:'<svg class="sgn-lg" width="21" height="21" viewBox="0 0 21 21" aria-hidden="true" focusable="false"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>',
  google:'<svg class="sgn-lg" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>'
};
/* The providers' own buttons, the same size, in their own words; `row` side by side, else stacked. The trusted click the preload
   names is the button's data-e-open. */
function signinProvidersHtml(ids, row){
  return '<div class="sgn-provs'+(row?' sgn-row':'')+'">'+ids.map(id=>'<button type="button" class="sgn-p '+esc(id)+'" data-e-open="signin" data-e-provider="'+esc(id)+'">'
    +(LOGO[id]||"")+'<span>'+esc(id==="microsoft" ? t("Sign in with Microsoft") : id==="google" ? t("Sign in with Google") : SIGNIN_NAMES[id])+'</span></button>').join("")+'</div>';
}
function signinAvatarHtml(initial, off, big){
  return '<span class="sgn-av'+(big?' l':'')+(off?' off':'')+'" aria-hidden="true">'+(initial ? esc(initial) : ICON_PERSON)+'</span>';
}
/* With no name written, the line under it ("Signed in with ...") is the bold one, alone. */
function signinIdentHtml(ident){
  const bold=ident.name || ident.sub, under=ident.name ? ident.sub : "";
  return '<div class="sgn-id">'+signinAvatarHtml(ident.initial, ident.off, true)+'<div><b>'+esc(bold)+'</b>'
    +(under?'<small>'+esc(under)+'</small>':'')+'</div></div>';
}
/* The sign-in's Copy, the code's and the link's alike: both labels stacked in one cell, so the button keeps the wider of the two
   and nothing moves when "Copied" stands in for SIGNIN_COPIED_MS after a copy (signinCopied). */
function signinCopyHtml(act){
  return '<button type="button" class="btn sgn-copy" data-signin-act="'+esc(act)+'"><span>'+esc(t("Copy"))+'</span><span>'+esc(t("Copied"))+'</span></button>';
}
function signinCodeHtml(code, label){
  return '<div class="sgn-code">'+(label?'<span class="k">'+esc(label)+'</span>':'')+'<code>'+esc(signinCodeText(code))+'</code>'
    +signinCopyHtml("copy")+'</div>';
}
/* The doors offered, one row each in the code's own row: the relay's host, the lead's print, and Ask to join. */
function signinDoorsHtml(doors){
  return doors.map(d=>'<div class="sgn-code" data-signin-door-row><span class="k">'+esc(d.host)+'</span><code>'+esc(d.print)+'</code>'
    +'<button type="button" class="btn primary" data-signin-act="door" data-signin-door="'+esc(String(d.n))+'">'+esc(t("Ask to join"))+'</button></div>').join("");
}
function signinActsHtml(acts){
  return '<div class="sgn-acts">'+acts.map(a=>'<button type="button" class="btn'+(a.solid?' primary':'')+'" data-signin-act="'+esc(a.act)+'">'+esc(a.label)+'</button>').join("")+'</div>';
}
/* The preview's line, as the panel and Account draw it, its first sentence the bold one; "" outside the preview. */
function signinPreviewHtml(v){
  return v && v.preview ? '<p class="sgn-cap sgn-preview" data-signin-preview><b>'+esc(t("Preview only."))+'</b> <span>'
    +esc(t("Sign-in is not set up yet, so nothing here is sent."))+'</span></p>' : "";
}
/* The sign-in link while the browser is awaited, last in the waiting state wherever it is drawn: the line in the preview line's
   form, then the link in a read-only field that never wraps, a click selecting all of it, and the code's own Copy; "" with no link. */
function signinLinkHtml(link){
  if(!link) return "";
  return '<div class="sgn-link" data-signin-link><p class="sgn-cap"><b>'+esc(t("Browser did not open?"))+'</b> <span>'
    +esc(t("Paste this link into a browser on this computer."))+'</span></p><div class="sgn-link-row"><input type="text" class="sgn-link-f" readonly'
    +' spellcheck="false" autocomplete="off" aria-label="'+esc(t("Paste this link into a browser on this computer."))+'" value="'+esc(link)+'">'
    +signinCopyHtml("copylink")+'</div></div>';
}
/* Form B's panel: the door's content in the panel's own type, the cannot-be-done moments as its heading and line, no box. The
   preview's line follows the heading and line, just before what they are about. */
function signinPanelHtml(d){
  let h="";
  if(d.ident) h+=signinIdentHtml(d.ident);
  if(d.heading) h+='<h4>'+esc(d.heading)+'</h4>';
  if(d.line) h+='<p class="sgn-lede">'+esc(d.line)+'</p>';
  if(d.preview) h+=signinPreviewHtml({preview:true});
  if(d.wait) h+='<div class="sgn-wait">'+esc(d.wait)+'</div><div class="sgn-run" aria-hidden="true"></div>';
  if(d.team) h+='<p class="sgn-ln">'+esc(d.team)+'</p>';
  if(d.say) h+='<p class="sgn-say'+(d.calm?' calm':'')+'"><b>'+esc(d.say[0])+'</b><span>'+esc(d.say[1])+'</span></p>';
  if(d.code) h+=signinCodeHtml(d.code, "");
  if(d.doors && d.doors.length) h+=signinDoorsHtml(d.doors);
  if(d.providers && d.providers.length) h+=signinProvidersHtml(d.providers, false);
  if(d.cap) h+='<p class="sgn-cap">'+esc(d.cap)+'</p>';
  if(d.privacy) h+='<p class="sgn-cap">'+esc(d.privacy)+'</p>';
  if(d.acts && d.acts.length) h+=signinActsHtml(d.acts);
  if(d.own) h+='<p class="sgn-say sgn-own"><b>'+esc(d.own[0])+'</b><span>'+esc(d.own[1])+'</span></p>';
  if(d.link) h+=signinLinkHtml(d.link);
  if(d.foot) h+='<p class="sgn-ft">'+esc(d.foot)+'</p>';
  return h;
}

/* ---- form B: the header's button and its panel --------------------------------------------------------------------------- */
let signinOpen=false, signinChoosing=false;
/* A press at a door the shell refused, said where it was pressed until the next act or the panel closes. */
let signinDoorRefused=false;
/* Who else draws the view: Settings registers its repaint here, so this module imports nothing above it. */
const signinTellers=[];
function signinOnChange(fn){ if(typeof fn==="function") signinTellers.push(fn); }
function signinTell(){ signinTellers.forEach(fn=>{ try{ fn(); }catch(e){ /* a closed screen */ } }); }
function paintSigninButton(){
  const wrap=$("#signinWrap"), btn=$("#signinBtn");
  if(!wrap || !btn) return;
  const v=signinV, show=signinShown(v);
  wrap.hidden=!show;
  if(!show){ closeSigninPanel(); return; }
  const p=signinParts(v), word=t("Sign in");
  btn.classList.toggle("on", signinOpen || !!v.busy);
  if(v.signedIn){
    btn.innerHTML=signinAvatarHtml(p.initial, p.off, false);
    btn.setAttribute("aria-label", t("Account"));
    btn.title=t("Account");
  } else {
    btn.innerHTML=ICON_PERSON+'<span class="sgn-w">'+esc(word)+'</span>';
    btn.setAttribute("aria-label", word);
    btn.title=word;
  }
  paintDoorBand();
}
function paintSigninPanel(){
  const panel=$("#signinPanel");
  if(!panel) return;
  const d=signinChoosing && !signinV.busy ? signinDoor(Object.assign({}, signinV, {signedIn:"", said:""})) : signinDoor(signinV);
  if(!d){ closeSigninPanel(); return; }
  panel.dataset.moment=d.moment;
  panel.innerHTML=signinPanelHtml(d);
  panel.hidden=!signinOpen;
}
function openSigninPanel(){
  signinOpen=true;
  paintSigninPanel();
  paintSigninButton();
  const btn=$("#signinBtn");
  if(btn) btn.setAttribute("aria-expanded","true");
}
function closeSigninPanel(back){
  const panel=$("#signinPanel"), btn=$("#signinBtn");
  const was=signinOpen;
  signinOpen=false;
  signinChoosing=false;
  signinDoorRefused=false;
  if(panel) panel.hidden=true;
  if(btn){ btn.setAttribute("aria-expanded","false"); btn.classList.toggle("on", !!signinV.busy); }
  if(was && back && btn) try{ btn.focus({preventScroll:true}); }catch(e){}
}
/* The view changed: the button, the open panel, and Settings where it is open. The panel opens by itself only when a sign-in's
   answer comes back, never at start. */
function signinChanged(v, answered){
  signinV=signinRead(v);
  paintSigninButton();
  if(firstSigninOpen || firstSigninPending){
    if(signinV.signedIn){ closeFirstSignin(); signinTell(); return; }
    if(firstSigninOpen){ paintFirstSignin(); signinTell(); return; }
  }
  if(answered && signinShown(signinV) && !signinV.busy) signinOpen=true;
  if(signinOpen) paintSigninPanel();
  signinTell();
}
function signinCall(name, arg){
  const h=signinHost();
  if(!h || typeof h[name]!=="function") return Promise.resolve(null);
  try{ return Promise.resolve(h[name](arg)).catch(()=>null); }catch(e){ return Promise.resolve(null); }
}
/* `text` to the clipboard; resolves true once the clipboard took it, false otherwise. */
function signinCopy(text){
  if(!text) return Promise.resolve(false);
  try{ const h=eHost(); if(h && typeof h.noteOwnText==="function") h.noteOwnText(text); }catch(e){}
  try{ if(navigator.clipboard&&window.isSecureContext) return navigator.clipboard.writeText(text).then(()=>true, ()=>false); }catch(e){}
  return Promise.resolve(false);
}
const SIGNIN_COPIED_MS=1500;
/* The Copy pressed reads "Copied" for SIGNIN_COPIED_MS, then "Copy" again. */
function signinCopied(btn){
  if(!btn || !btn.classList) return;
  btn.classList.add("sgn-done");
  clearTimeout(btn.sgnCopied);
  btn.sgnCopied=setTimeout(()=>btn.classList.remove("sgn-done"), SIGNIN_COPIED_MS);
}
/* One act of the door or of Account, by its data-signin-act; `btn` the button pressed. */
function signinAct(act, btn){
  signinDoorRefused=false;
  if(act==="account"){ closeSigninPanel(); if(typeof hooks.openSettings==="function") hooks.openSettings("account"); return; }
  if(act==="copy" || act==="copylink"){
    return signinCopy(act==="copy" ? signinV.code : signinV.busy ? signinV.link : "").then(ok=>{ if(ok) signinCopied(btn); return ok; });
  }
  if(act==="choose"){ signinChoosing=true; signinV=Object.assign({}, signinV, {said:""}); paintSigninPanel(); if(firstSigninOpen) paintFirstSignin(); signinTell(); return; }
  if(act==="stop"){ signinCall("signinStop"); return; }
  if(act==="again"){ signinCall("signinAgain"); return; }
  if(act==="check"){ signinCall("signinCheck").then(v=>{ if(v) signinChanged(v, false); }); return; }
  if(act==="out"){ signinCall("signinOut").then(v=>{ if(v) signinChanged(v, false); }); return; }
  if(act==="door"){
    const n=Number(btn && btn.getAttribute ? btn.getAttribute("data-signin-door") : NaN);
    if(!Number.isInteger(n)) return;
    return signinCall("signinDoor", n).then(r=>{ signinDoorRefused=!!(r && r.refused==="door"); signinChanged(signinNow(), false); });
  }
  if(act==="another"){ signinChoosing=true; signinTell(); return; }
  if(act==="keep"){ signinChoosing=false; signinTell(); }
}
/* A provider's button, anywhere: the preload has already named the trusted click; the shell runs the rest. The answer opens the
   header's panel only for a press made there: one made in Account (`here` "account") is answered in Account alone. */
function signinStart(id, here){
  signinChoosing=false;
  signinCall("signIn", id).then(v=>{ if(v) signinChanged(v, here!=="account"); });
}
function signinChoosingNow(){ return signinChoosing; }
function signinDoorRefusedNow(){ return signinDoorRefused; }
/* A click in the link's field selects all of it. */
function signinLinkSelect(f){ try{ f.select(); }catch(e){ /* a field gone with the wait */ } }
function signinClicks(root){
  if(!root) return;
  root.addEventListener("click", e=>{
    const f=e.target && e.target.closest ? e.target.closest(".sgn-link-f") : null;
    if(f){ signinLinkSelect(f); return; }
    const b=e.target && e.target.closest ? e.target.closest("button") : null;
    if(!b) return;
    if(b.dataset.eOpen==="signin"){ signinStart(b.dataset.eProvider); return; }
    if(b.dataset.signinAct) signinAct(b.dataset.signinAct, b);
  });
}
/* ---- sync across computers: what the shell's storeRow answers (shell/sync/store.cjs), the row's words and the one bubble ---------
   The page is told a line (SYNC_LINES), the switch, whether policy holds it, the
   reason, the pause's start and what to say once; never a key, a store or a token. */
const SYNC_LINES=["on","off","ending","marking","ungiven","ungiven-held","org-off","unavailable","anew","first","checking","unconnected","resuming","signin-refused","again","spent","refused","lapsed","paused","conflict","full","noseat","ask"];
function syncRead(v){
  const o=v && typeof v==="object" ? v : {};
  if(o.shown!==true || SYNC_LINES.indexOf(o.line)<0) return {shown:false, line:"", on:false, held:false, why:"", since:0, say:"", askNow:false, at:0};
  return {shown:true, line:o.line, on:o.on===true, held:o.held===true, why:typeof o.why==="string" ? o.why.slice(0,40) : "",
    since:Number.isFinite(o.since) && o.since>0 ? o.since : 0, say:typeof o.say==="string" ? o.say.slice(0,40) : "", askNow:o.askNow===true,
    at:Number.isFinite(o.at) && o.at>0 ? o.at : 0};
}
function syncNow(){
  const h=eHost();
  if(!h || typeof h.storeState!=="function") return syncRead(null);
  try{ return syncRead(h.storeState()); }catch(e){ return syncRead(null); }
}
/* The reason a folder could not be reached that the person cannot mend, in the copywriter's words. "no-drive" is OneDrive missing on
   Microsoft and Drive switched off on Google; "consent" the organisation's refusal; "" a system that seals nothing for real. A folder
   consent never given is the row's "ungiven"; a reason not named here is read as the provider's refusal, retried at each renewal. */
function syncWhyWords(why, provider){
  if(why==="no-drive") return provider==="google" ? t("your organisation has switched off Google Drive for it") : t("the account has no OneDrive");
  if(why==="full") return t("the account's storage is full");
  if(why==="consent") return t("your organisation has not allowed it; its IT department decides");
  if(why==="") return t("this computer cannot keep it locked for this Windows account");
  return t("the account's provider turned down Etiuda's request; it tries again each time Etiuda opens, and about once a day while it stays open");
}
/* Why the ended mark of Off everywhere was not written to the person's folder (the copywriter's section 16). */
function syncMarkWords(why, provider){
  if(why==="refused") return t("the account's folder refused the change");
  if(why==="failed") return t("the change could not be written to the account's folder");
  return named(t("your {PROVIDER} account is not signed in here or could not be reached"),"{PROVIDER}",SIGNIN_NAMES[provider]||"Microsoft");
}
/* The row's line, beside the feature's name; "alone", the bubble's, which names it. */
function syncUnavailable(why, provider, alone){
  return named(alone ? t("Sync across computers is not available on this account: {REASON}. Everything works on this computer as before.")
    : t("Not available on this account: {REASON}. Everything works on this computer as before."),"{REASON}",syncWhyWords(why, provider));
}
function syncDate(at){
  return new Date(at).toLocaleDateString(uiLang()==="pl" ? "pl-PL" : "en-GB",{day:"numeric", month:"long"});
}
/* A passing failure's reason, which side was not reached, in words the person can check (the copywriter's section 15). */
function syncPassingWords(why, provider, refused){
  if(refused) return t("our service turned down this computer's last request");
  if(why==="offline") return named(t("this computer cannot reach the {PROVIDER} account"),"{PROVIDER}",SIGNIN_NAMES[provider]||"Microsoft");
  if(why==="rate") return t("our service is busy");
  return t("this computer cannot reach our service");
}
function syncPassing(s, provider){
  const frame=s.line==="spent" || s.line==="refused" ? t("Not syncing: {REASON}. Sync tries again each time Etiuda opens, and about once a day while it stays open; nothing on this computer is lost.")
    : s.at ? named(t("Not syncing just now: {REASON}. Sync tries again at {TIME}, and nothing on this computer is lost."),"{TIME}",
      new Date(s.at).toLocaleTimeString(uiLang()==="pl" ? "pl-PL" : "en-GB",{hour:"2-digit", minute:"2-digit"}))
    : t("Not syncing just now: {REASON}. Sync tries again by itself, and nothing on this computer is lost.");
  return named(frame,"{REASON}",syncPassingWords(s.why, provider, s.line==="refused"));
}
/* The row's small line for view `s`, the person signed in with `provider`. */
function syncLine(s, provider){
  if(s.line==="org-off") return t("Your organisation has not turned this on.");
  if(s.line==="off") return t("Only on this computer.");
  if(s.line==="ending") return t("Off everywhere. The synced copy is deleted as soon as this computer reaches our service.");
  if(s.line==="marking") return named(t("Off on this computer, but not yet everywhere: {CAUSE}, so your other computers have not been told. Etiuda tries again by itself."),"{CAUSE}",syncMarkWords(s.why, provider));
  if(s.line==="ungiven") return named(t("Off. Turning it on asks {PROVIDER} to let Etiuda use its folder in this account."),"{PROVIDER}",SIGNIN_NAMES[provider]||"Microsoft");
  if(s.line==="ungiven-held") return named(t("Your organisation has turned this on, and {PROVIDER} has not yet let Etiuda use its folder in this account."),"{PROVIDER}",SIGNIN_NAMES[provider]||"Microsoft");
  if(s.line==="unavailable") return syncUnavailable(s.why, provider);
  if(s.line==="anew") return t("Turned off everywhere from another computer. Your organisation keeps sync on for this computer, so a new synced copy starts from what is on it.");
  if(s.line==="first") return t("Connecting for the first time.");
  if(s.line==="checking") return t("Checking for changes.");
  if(s.line==="unconnected") return t("Not connected yet. Sync starts once this computer reaches our service.");
  if(s.line==="resuming") return t("Sync starts again in a moment.");
  if(s.line==="signin-refused") return t("Not syncing while signing in on this computer is refused. Sync runs once signing in works, and nothing on this computer is lost.");
  if(s.line==="again" || s.line==="spent" || s.line==="refused") return syncPassing(s, provider);
  /* A lapse with no reason known. */
  if(s.line==="lapsed") return t("Not syncing just now. Sync resumes when this computer reaches our service, and nothing on this computer is lost.");
  if(s.line==="paused") return named(t("Paused since {DATE}. It resumes when this computer reaches our service."),"{DATE}",syncDate(s.since));
  if(s.line==="conflict") return t("Changed on two computers: the newer change is in use, and the older one is kept, so nothing is lost.");
  if(s.line==="full") return t("Sync is full, so new changes stay on this computer until something is removed.");
  if(s.line==="noseat") return t("Waiting for a seat. Sync resumes when this account holds one again, and nothing on this computer is lost.");
  if(s.line==="ask") return t("Waiting for your answer about what is on this desk. Nothing syncs until then.");
  return t("Your catalogs, edits and settings on every computer you sign in on.");
}
let syncWaiting=null, syncWhoseShut=null;
function syncNoticeBubble(id, headText, tailText, anchor, primary, onDismiss, extra){
  const prev=document.getElementById(id); if(prev) prev.remove();
  const d=document.createElement("div");
  d.id=id; d.className="bub bub-ask e-sync-said"; d.setAttribute("role","status");
  const p=document.createElement("p"), b=document.createElement("b");
  b.textContent=headText; p.appendChild(b);
  if(tailText) p.appendChild(document.createTextNode(tailText));
  d.appendChild(p);
  const row=document.createElement("div"); row.className="tour-actions";
  if(extra && extra.label){
    const o=document.createElement("button");
    o.type="button"; o.className="btn"; o.textContent=extra.label;
    o.onclick=extra.onClick;
    row.appendChild(o);
  }
  const x=document.createElement("button");
  x.type="button"; x.className=primary ? "btn primary" : "btn"; x.textContent=t("Dismiss");
  x.onclick=()=>{ d.remove(); if(onDismiss) onDismiss(); };
  row.appendChild(x); d.appendChild(row);
  document.body.appendChild(d);
  hangBubble(d, anchor);
  return d;
}
/* "kept": a set-aside that failed with something it could not put back, which is in the folder; the desk is not the account's and
   the question still stands, so it has a notice of its own. */
function syncChoiceNotice(choice, view){
  if(choice!=="mine" && choice!=="start" && choice!=="kept") return;
  /* Sync not on after the answer (turned off here, or the folder not yet allowed): nothing says it syncs or that the account's content
     is here; Start's notice keeps what was set aside and its button. */
  const off=!!view && view.shown===true && view.on===false;
  if(off && choice==="mine") return; /* plant:choice-off */
  const btn=$("#signinBtn");
  if(!btn || !btn.getClientRects().length) return;
  const tpl=choice==="mine" ? t("Syncing now, with what was already on this desk.")
    : choice==="kept" ? t("Starting from your account did not finish, and nothing was lost. What could not be put back is kept on this computer, in Etiuda's \"Set aside\" folder, and is never uploaded. The question about what is on this desk still waits for your answer.")
    : t("This desk now has your account's content. What was here before is kept on this computer, in Etiuda's \"Set aside\" folder, and is never uploaded.");
  const i=tpl.indexOf(". "), rest=off && choice==="start" && i>=0 ? tpl.slice(i+2) : tpl;
  const j=rest.indexOf(". ");
  const head=j<0 ? rest : rest.slice(0,j+1), tail=j<0 ? "" : " "+rest.slice(j+2);
  const extra=choice!=="mine" ? { label: t("Open this folder"), onClick: () => eOpenSetAside() } : null;
  const d=syncNoticeBubble("eSyncChoiceNote", head, tail, ()=>$("#signinBtn"), true, ()=>{
    const said=document.getElementById("eSyncSaid"); if(said) hangBubble(said, ()=>$("#signinBtn"));
  }, extra);
  const said=document.getElementById("eSyncSaid"); if(said) hangBubble(said, d);
}
function syncAnswer(choice){
  const h=eHost();
  if(!h || typeof h.storeAnswer!=="function") return Promise.resolve(syncNow());
  try{ eDeskFlush(); }catch(e){} /* plant:answer-flush */
  try{
    return Promise.resolve(h.storeAnswer(String(choice||""))).then(res=>{
      if (res && res.ok) syncChoiceNotice(res.choice, res.view);
      if (res && !res.ok && res.kept === true) syncChoiceNotice("kept");
      return res && res.view ? syncRead(res.view) : syncNow();
    }, ()=>syncNow());
  }catch(e){ return Promise.resolve(syncNow()); }
}
/* WHOSE THE DESK IS: asked from the account button automatically while askNow stands, or from Account's Decide button.
   Escape and Not now answer "later" for this run only; choices close the bubble and hand "mine" or "start" to the shell. */
function askSyncWhose(origin){
  if(syncWhoseShut){ syncWhoseShut(false); syncWhoseShut=null; }
  const target=origin || (()=>$("#signinBtn"));
  const anchor=typeof target==="function" ? target() : target;
  if(!anchor || !anchor.getClientRects().length) return;
  const el=document.createElement("div");
  el.className="bub bub-ask e-sync-whose";
  el.id="eSyncWhose";
  el.setAttribute("role","alertdialog");
  el.setAttribute("aria-labelledby","eSyncWhoseT");
  const h3=document.createElement("h3"); h3.id="eSyncWhoseT";
  h3.textContent=t("Is what is on this desk yours?");
  const lead=document.createElement("p");
  lead.textContent=t("Another account was signed in here before, and its settings, edits and own cards are still on this desk. Nothing syncs until you choose.");
  const opt=(bold, rest)=>{
    const p=document.createElement("p"); p.className="e-sync-opt";
    const b=document.createElement("b"); b.textContent=t(bold);
    p.appendChild(b); p.appendChild(document.createTextNode(": "+t(rest)));
    return p;
  };
  const acts=document.createElement("div"); acts.className="tour-actions";
  const mkBtn=(label, cls, fn)=>{
    const b=document.createElement("button"); b.type="button"; b.className=cls;
    b.textContent=t(label); b.onclick=fn; acts.appendChild(b); return b;
  };
  el.appendChild(h3);
  el.appendChild(lead);
  el.appendChild(opt("It is mine", "it joins what your account syncs."));
  el.appendChild(opt("Start from my account", "this desk takes your account's content; what is here is set aside, not deleted."));
  const shut=(later)=>{
    removeEventListener("keydown", onEsc, true);
    if(syncWhoseShut===shut) syncWhoseShut=null;
    el.remove();
    if(later) syncAnswer("later");
  };
  const onEsc=e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); shut(true); } };
  addEventListener("keydown", onEsc, true);
  syncWhoseShut=shut;
  const choose=what=>{ shut(false); syncAnswer(what); };
  mkBtn("It is mine", "btn", ()=>choose("mine"));
  mkBtn("Start from my account", "btn", ()=>choose("start"));
  const laterBtn=mkBtn("Not now", "btn primary", ()=>shut(true));
  el.appendChild(acts);
  document.body.appendChild(el);
  hangBubble(el, target, {width:440});
  try{ laterBtn.focus({preventScroll:true}); }catch(_){}
}
/* SAID ONCE, FROM THE ACCOUNT CONTROL: that sync is on, at the sign-in that made the person's store, or why it is not available. The
   shell hands it until the page says it was shown (storeSaid), so a second view never says it again; while the account panel is open,
   it waits for the panel to close, since both hang from the one button. */
function syncSay(s){
  if(s.line!=="ask" && syncWhoseShut) syncWhoseShut(false);
  const wantAsk=s.line==="ask" && s.askNow && !document.getElementById("eSyncWhose");
  const wantSay=!!s.say && !document.getElementById("eSyncSaid");
  if(!wantAsk && !wantSay) return;
  const btn=$("#signinBtn"), panel=$("#signinPanel");
  if(!btn || !btn.getClientRects().length) return;
  if(panel && !panel.hidden){
    if(syncWaiting) return;
    syncWaiting=new MutationObserver(()=>{ if(panel.hidden){ syncWaiting.disconnect(); syncWaiting=null; syncSay(syncNow()); } });
    syncWaiting.observe(panel, {attributes:true, attributeFilter:["hidden"]});
    return;
  }
  if(wantAsk) askSyncWhose();
  if(!wantSay) return;
  const words=s.say==="on" ? t("Your catalogs, edits and settings now follow you to every computer you sign in on. You can turn this off in Account.")
    : syncUnavailable(s.say, signinV.signedIn, true);
  const i=words.indexOf(". ");
  /* Where policy holds the switch, the line's last sentence, which says it can be turned off, is not said. */
  const tail=(i<0 || (s.say==="on" && s.held===true)) ? "" : " "+words.slice(i+2); /* plant:say-held */
  syncNoticeBubble("eSyncSaid", i<0 ? words : words.slice(0,i+1), tail, ()=>document.getElementById("eSyncChoiceNote") || $("#signinBtn"), false);
  const h=eHost();
  try{ if(h && typeof h.storeSaid==="function") h.storeSaid(); }catch(e){ /* the shell has gone */ } /* plant:sync-said-told */
}
/* The row's conflict line was painted where the person sees it: the shell stops counting the versions kept so far; they stay kept. */
function syncOpened(){
  const h=eHost();
  try{ if(h && typeof h.storeOpened==="function") h.storeOpened(); }catch(e){ /* the shell has gone */ }
}
const syncTellers=[];
function syncOnChange(fn){ if(typeof fn==="function") syncTellers.push(fn); }
function syncChanged(){
  const s=syncNow();
  syncSay(s);
  syncTellers.forEach(fn=>{ try{ fn(s); }catch(e){ /* a closed screen */ } });
}
/* The switch: "on", or off "here" or "everywhere"; resolves the new view once the shell has acted. */
function syncSet(what){
  const h=eHost();
  if(!h || typeof h.storeSet!=="function") return Promise.resolve(syncNow());
  try{ return Promise.resolve(h.storeSet(what)).catch(()=>null).then(()=>syncNow()); }catch(e){ return Promise.resolve(syncNow()); }
}
/* On where the folder's consent was never given: the shell opens the provider's page for it at once, for the trusted click the
   preload saw on the switch's On (data-e-open="store-on"). Resolves the shell's answer, or "none". */
function syncConsent(){
  const h=eHost();
  if(!h || typeof h.storeConsent!=="function") return Promise.resolve("none");
  try{ return Promise.resolve(h.storeConsent()).catch(()=>"none"); }catch(e){ return Promise.resolve("none"); }
}
function wireSignin(){
  const h=signinHost();
  if(!h) return;
  signinNow();
  firstSigninPending=firstSigninDue();
  if(typeof h.onSignin==="function") h.onSignin(v=>signinChanged(v, false));
  if(typeof h.onStore==="function") h.onStore(()=>syncChanged());
  const btn=$("#signinBtn"), panel=$("#signinPanel"), wrap=$("#signinWrap"), fs=$("#firstSignin");
  if(btn) btn.onclick=e=>{ e.stopPropagation(); if(signinOpen) closeSigninPanel(true); else openSigninPanel(); };
  signinClicks(panel);
  if(fs){
    signinClicks(fs);
    fs.addEventListener("click", e=>{
      const s=e.target && e.target.closest ? e.target.closest("#firstSigninSkip") : null;
      if(s) skipFirstSignin();
    });
  }
  addEventListener("pointerdown", e=>{ if(signinOpen && wrap && !wrap.contains(e.target)) closeSigninPanel(false); });
  addEventListener("keydown", e=>{
    if(e.key==="Escape" && signinOpen && wrap && wrap.contains(document.activeElement)){ e.stopPropagation(); closeSigninPanel(true); }
  }, true);
  paintSigninButton();
  syncSay(syncNow());
}

export {
  FIRST_SIGNIN_KEY,
  SIGNIN_NAMES,
  bootFirstSignin,
  closeFirstSignin,
  firstSigninDue,
  firstSigninOpenNow,
  firstSigninSeen,
  firstSigninStands,
  markFirstSigninSeen,
  onFirstSigninClosed,
  paintFirstSignin,
  signinAct,
  skipFirstSignin,
  signinActsHtml,
  signinChanged,
  signinChoosingNow,
  signinClicks,
  signinCodeHtml,
  signinCodeText,
  signinCopyHtml,
  SIGNIN_COPIED_MS,
  signinDoor,
  deskDoorState,
  deskDoorLines,
  doorBandState,
  firstSigninHtml,
  signinDoorRefusedNow,
  signinIdentHtml,
  signinLinkHtml,
  signinLinkSelect,
  signinManaged,
  signinStranded,
  signinStrandedWords,
  signinWaiting,
  signinWaitingWords,
  signinKeepsAccount,
  signinCapHolds,
  signinNow,
  signinOnChange,
  signinPanelHtml,
  signinDoorsHtml,
  signinParts,
  signinPreviewHtml,
  signinProvidersHtml,
  signinRead,
  signinSay,
  signinNoSeat,
  signinTold,
  signinStart,
  signinShown,
  signinWhen,
  syncChanged,
  syncConsent,
  syncLine,
  syncNow,
  syncOnChange,
  syncOpened,
  syncRead,
  syncSay,
  syncSet,
  askSyncWhose,
  wireSignin
};
