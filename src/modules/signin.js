/* THE PERSON'S OWN SIGN-IN ON THE PAGE (board 980): what the shell says of it, the door in the header and the words of each
   moment. The shell holds the tokens, the browser, the service and seat.json; the page is told the providers offered, who is
   signed in by provider, the sign-in code and how the seat stands, and shows nothing where no provider is offered, so a desk
   with no registration configured looks as it did. Settings' Account draws the same view with signinParts. */
import { $ } from "./dom.js";
import { eHost } from "./host.js";
import { esc } from "./esc.js";
import { t, uiLang } from "./ui-lang.js";
import { agentName } from "./agent.js";
import { teamLeads } from "./team-join.js";
import { hooks } from "./hooks.js";

/* "lab" is offered only by the sign-in lab (shell/main.js signinLabRead), never by a desk installed or packaged. */
const SIGNIN_NAMES={microsoft:"Microsoft", google:"Google", lab:"Lab"}; // placeholder: Claudette, "Lab"
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
    /* Signed out, with the service not yet told: the desk's place among the account's three is freed at the next contact. */
    outOwed: !signedIn && o.outOwed===true,
    /* The doors the sign-in handed, offered while the desk keeps no team (the door-finding): each by its place, the relay's host
       and the lead's print, so two leads' doors of one team are told apart. */
    doors: signedIn && Array.isArray(o.doors) ? o.doors.filter(d=>d && Number.isInteger(d.n) && typeof d.host==="string" && d.host.length<=256
      && /^[0-9a-f]{16}$/.test(String(d.print))).slice(0,16).map(d=>({n:d.n, host:d.host, print:String(d.print)})) : []
  };
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
/* Whether the door exists: a provider offered, or somebody signed in. */
function signinShown(v){ return !!(v && (v.offered.length || v.signedIn)); }
/* The code in four groups of four, as it is read aloud; Copy takes it without the spaces. */
function signinCodeText(code){ return String(code||"").replace(/(.{4})(?=.)/g,"$1 "); }
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
  switch(reason){
    case "unreached": case "signin-unreached": case "signin-timeout": case "signin-browser":
      return [t("The sign-in service could not be reached."), t("Nothing changed: this computer is not signed in, and Etiuda works as before.")];
    case "signin-notallowed":
      return [t("This account's organisation has not allowed Etiuda at its sign-in provider."), t("Its IT department can allow it; another account can be used meanwhile.")];
    case "desks":
      return [t("This account is already in use on three computers."), t("Signing out on one of them makes room here, and so does a computer left unused for 30 days; then Try again.")];
    case "waiting": case "full": /* plant:wait-say */
      return p && p.team && p.team.lead
        ? [named(t("{TEAM} has no free seat just now."),"{TEAM}",p.teamName), named(t("The sign-in worked. This computer takes a seat by itself as soon as one is free; nobody needs to do anything, and {LEAD}, the team's lead, sees this account's sign-in code among those who have signed in."),"{LEAD}",p.team.lead)]
        : [t("No seat is free on the organisation's licence just now."), t("The sign-in worked. This computer takes a seat by itself as soon as one is free; nobody needs to do anything, and the team's lead sees this account's sign-in code among those who have signed in.")];
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
    default:
      return [t("The sign-in did not finish."), t("Nothing changed, and signing in can be tried again.")];
  }
}
/* No free seat: the service's wait, "waiting", or its refusal, "full"; either way the shell renews quietly until a seat frees. */
function signinNoSeat(v){ return v.refused==="waiting" || v.refused==="full"; } /* plant:no-seat */
/* Refusals whose own heading names the reason a sign-in pressed while signed in failed for. */
const SIGNIN_REASON_SAID=["desks","signin-notallowed","unreached","signin-unreached","signin-timeout","signin-browser"];
/* What a signed-in desk is told over its moment, or null: {kind, say, acts, providers}. "pressed", a sign-in the person pressed while
   signed in that failed, which leaves the desk signed in as it was; else a refusal the shell kept from a renewal or Check now. */
function signinTold(v){
  if(!v || !v.signedIn) return null;
  if(FAIL_FIRST.indexOf(v.said)>=0) return {kind:"pressed", say:[t("The new sign-in did not finish."), named(t("This computer stays signed in with the account it had. {REASON}"),"{REASON}",
    SIGNIN_REASON_SAID.indexOf(v.said)>=0 ? signinSay(v.said, v)[0] : "").trim()],
    acts:[{act:"choose", label:v.said==="signin-notallowed" ? t("Use another account") : t("Try again"), solid:true}]}; /* plant:told-pressed */
  const r=v.refused;
  if(!r || r==="signin" || signinNoSeat(v)) return null; /* plant:told-renewal */
  if(r==="desks") return {kind:"desks", say:[t("This account is signed in on three computers already."),
    t("A seat holds three computers. Signing out on one of the others frees its place, and this computer checks again by itself.")],
    acts:[{act:"check", label:t("Check now"), solid:true}]};
  return {kind:"renewal", say:[t("The sign-in service did not accept this account's sign-in."),
    t("Signing in again settles it; until then, Etiuda keeps working with the catalog it has.")], acts:[], providers:true};
}
const FAIL_FIRST=["unreached","signin-unreached","signin-timeout","signin-browser","signin-notallowed","desks","token","signin","signin-refused","signin-token","signin-unbound","signin-state","signin-none","signin-preview","signin-keyring"];
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
  if(v.busy) return {moment:"waiting", heading:t("Finish signing in in the browser"),
    line:named(t("The browser has opened {PROVIDER}'s sign-in page. Etiuda waits here and carries on by itself when you come back."),"{PROVIDER}",SIGNIN_NAMES[v.busy]),
    wait:named(t("Waiting for {PROVIDER}…"),"{PROVIDER}",SIGNIN_NAMES[v.busy]),
    acts:[{act:"again", label:t("Open the browser again")}, {act:"stop", label:t("Cancel")}], link:v.link};
  if(!v.signedIn){
    if(FAIL_FIRST.indexOf(v.said)>=0){
      const s=signinSay(v.said, v);
      return {moment:"refused", heading:s[0], line:s[1],
        /* The preview's press stopped nothing, so its way on is Back to the choice, never Try again. */
        acts:[v.said==="signin-notallowed" ? {act:"choose", label:t("Use another account"), solid:true}
          : v.said==="signin-preview" ? {act:"choose", label:t("Back")} : {act:"choose", label:t("Try again"), solid:true}]};
    }
    return {moment:"before", heading:t("Sign in to Etiuda"),
      line:t("Your seat belongs to your account, so it comes with you to any computer you sign in on, up to three."),
      providers:v.offered, cap:t("Microsoft: a work, school or personal account. Google: a Workspace or personal account."), privacy:t("This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The team's lead sees no name or address from the account."),
      foot:t("Etiuda for personal use, outside work, needs no sign-in.")};
  }
  const told=signinTold(v), toldDoor=()=>({moment:told.kind, ident, say:told.say, providers:told.providers ? v.offered : undefined, acts:told.acts.concat([acct])});
  if(told && told.kind==="pressed") return toldDoor();
  if(v.ask) return {moment:"ask", ident, say:signinSay("ask", v), providers:v.offered, acts:[acct]};
  if(told) return toldDoor();
  if(signinNoSeat(v)) return {moment:"noseat", ident, say:signinSay(v.refused, v, p), acts:[{act:"check", label:t("Check now"), solid:true}, acct]};
  /* No certificate: the service found no licence with a seat for this account. The code still shows, since a lead admits by it. */
  if(v.seat==="none" || !v.seat) return {moment:"nolicence", ident, say:signinSay("nolicence", v), code:v.code,
    acts:[{act:"check", label:t("Check now"), solid:true}, acct]};
  /* A team on the relay under this licence: one press asks to join it, and its lead's Studio lets a person it knows in. */
  if(!p.team && v.seat==="held" && v.doors.length) return {moment:"doors", ident, heading:t("A team on this licence"),
    line:t("This licence has a team on the relay. If the team's lead has admitted this account before, asking to join lets this computer in once the lead's Studio sees the request; otherwise the lead can send an invitation."),
    doors:v.doors, acts:[acct]};
  if(!p.team && v.reached && v.seat==="held") return {moment:"noteam", ident, heading:t("Signed in. No team yet"),
    line:t("No team has admitted this account yet. Once a lead admits it by the code below, the catalog arrives by itself."), code:v.code,
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
  if(act==="choose"){ signinChoosing=true; signinV=Object.assign({}, signinV, {said:""}); paintSigninPanel(); signinTell(); return; }
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
function wireSignin(){
  const h=signinHost();
  if(!h) return;
  signinNow();
  if(typeof h.onSignin==="function") h.onSignin(v=>signinChanged(v, false));
  const btn=$("#signinBtn"), panel=$("#signinPanel"), wrap=$("#signinWrap");
  if(btn) btn.onclick=e=>{ e.stopPropagation(); if(signinOpen) closeSigninPanel(true); else openSigninPanel(); };
  signinClicks(panel);
  addEventListener("pointerdown", e=>{ if(signinOpen && wrap && !wrap.contains(e.target)) closeSigninPanel(false); });
  addEventListener("keydown", e=>{
    if(e.key==="Escape" && signinOpen && wrap && wrap.contains(document.activeElement)){ e.stopPropagation(); closeSigninPanel(true); }
  }, true);
  paintSigninButton();
}

export {
  SIGNIN_NAMES,
  signinAct,
  signinActsHtml,
  signinChanged,
  signinChoosingNow,
  signinClicks,
  signinCodeHtml,
  signinCodeText,
  signinCopyHtml,
  SIGNIN_COPIED_MS,
  signinDoor,
  signinDoorRefusedNow,
  signinIdentHtml,
  signinLinkHtml,
  signinLinkSelect,
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
  wireSignin
};
