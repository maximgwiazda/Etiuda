/* THE ORGANISATION'S MODEL ON THE PAGE (board 992): what the shell says is in force, the mark beside the search box while
   that model ranks, and the sentences that change with it. The shell holds the fields, the key and the requests; the page
   is told whether the option is on and ready, the host, and each re-order's outcome, and shows nothing in a browser. */
import { $ } from "./dom.js";
import { eHost, eAiModel, eAiOn, eSearchOn } from "./host.js";
import { t } from "./ui-lang.js";

function orgModelHost(){
  const h=eHost();
  return h && typeof h.deskAiSettings==="function" ? h : null;
}
/* The shell's answer as Settings draws it, or null where the host has none. Read afresh at each ask, since a save moves it. */
function orgModel(){
  const h=orgModelHost();
  if(!h) return null;
  let s=null;
  try{ s=h.deskAiSettings(); }catch(e){ s=null; }
  return s && typeof s==="object" ? s : null;
}
/* Whether the organisation's model ranks: the option on and everything a request needs in place. Anything else, the built-in
   model ranks, and the sentences that say nothing leaves this computer are true. */
function orgRanks(st){
  const s=st===undefined ? orgModel() : st;
  return !!(s && s.on===true && s.ready===true);
}
/* Whether a reword at the person's press can be sent: the shell says the person's Rewording switch is on (rewordOn is true, as the sending
   code reads it, failing closed) and names the address one would go to (rewordAt). Anything else, including a state that says nothing of
   it, reads as off, so the sentences below never say less than what can be sent. Read afresh at each use. */
function rewordSent(){
  const h=eHost();
  let s=null;
  try{ s=h && typeof h.aiState==="function" ? h.aiState() : null; }catch(e){ s=null; }
  return !!(s && s.rewordOn===true && typeof s.rewordAt==="string" && s.rewordAt!=="");
}
/* What leaves, in one sentence, while the organisation's model ranks: by the two switches and by the Rewording switch. The AI section's
   lede and the mark's title are this one string, with {HOST} for the address, so the two cannot drift apart. */
function orgSaid(search, suggest){
  const line=search && suggest ? t("The organisation's model at {HOST} ranks the search and the suggestions. The search text, the selected message the suggestions are made from, and up to 12 short pieces of the cards being ranked are sent there.")
    : search ? t("The organisation's model at {HOST} ranks the search. The search text is sent there, with up to 12 short pieces of the cards being ranked.")
    : suggest ? t("The organisation's model at {HOST} ranks the suggestions. The selected message they are made from is sent there, with up to 12 short pieces of the cards being ranked.")
    : "";
  const rewords=rewordSent();
  if(line) return rewords ? line+" "+t("At your press, the words or the card you ask it to reword go there too.") : line;
  return rewords ? t("The organisation's model at {HOST} is set. With both switches off, only the words or the card you ask it to reword are sent to it, at your press.")
    : t("The organisation's model at {HOST} is set, and with both switches and Rewording off, nothing is sent to it.");
}
/* The last re-order's outcome as the shell sent it on etiuda:ai-ranking. `slow` is the shell's: the median of the service's
   last answer times over the 4 seconds the mark's words name (shell/desk-ai.cjs WINDOW_CEILING_MS). */
let orgOutcome={ranking:"organisation", failures:0, pausedUntil:0, slow:false};
let orgPauseT=0;
/* The mark's words at `now`: {label, title, paused}. Its sentence follows the two switches, so it never says text goes where it
   does not. Paused is the shell's pause after three failures in a row, while the built-in model, or the word matches where
   the desk carries none, rank meanwhile. */
function orgMarkWords(st, outcome, now){
  const host=String(st && st.host || "");
  const o=outcome || {};
  const at=s=>s.split("{HOST}").join(host);
  if(Number(o.pausedUntil)>now) return eAiModel()
    ? {paused:true, label:t("organisation's model not answering, built-in model ranking"),
      title:at(t("{HOST} has not answered three times in a row, so the built-in model ranks on this computer, sending nothing, and the desk asks {HOST} again in a minute."))}
    : {paused:true, label:t("organisation's model not answering, word matches only"),
      title:at(t("{HOST} has not answered three times in a row, so the search matches words alone, and the desk asks {HOST} again in a minute."))};
  /* Too slow keeps the quiet colour and no dot: nothing has failed. */
  if(o.slow===true) return eAiModel()
    ? {paused:false, label:t("organisation's model too slow to reorder"),
      title:at(t("{HOST} usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the built-in model's order stands, and the desk still sends one query a minute to {HOST}."))}
    : {paused:false, label:t("organisation's model too slow to reorder"),
      title:at(t("{HOST} usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the word matches' order stands, and the desk still sends one query a minute to {HOST}."))};
  const search=eSearchOn(), suggest=eAiOn();
  const title=orgSaid(search, suggest);
  return {paused:false, label:t("organisation's model"), title:at(title)};
}
/* The mark: there while the organisation's model ranks for either switch, on every screen, and absent otherwise. */
function syncOrgMark(st){
  const mark=$("#orgMark");
  if(!mark) return;
  const s=st===undefined ? orgModel() : st;
  const on=orgRanks(s) && (eAiOn() || eSearchOn());
  mark.hidden=!on;
  clearTimeout(orgPauseT); orgPauseT=0;
  if(!on) return;
  const now=Date.now(), w=orgMarkWords(s, orgOutcome, now);
  const words=mark.querySelector(".om-words"), dot=mark.querySelector(".om-dot");
  if(words) words.textContent=w.label;
  if(dot) dot.hidden=!w.paused;
  mark.classList.toggle("om-paused", w.paused);
  mark.title=w.title;
  mark.setAttribute("aria-label", w.title);
  /* The pause ends quietly: the mark returns by itself when the shell's pause runs out. */
  if(w.paused) orgPauseT=setTimeout(()=>syncOrgMark(), Math.min(Number(orgOutcome.pausedUntil)-now+50, 120000));
}
function wireOrgModel(){
  const h=orgModelHost();
  if(h && typeof h.onAiRanking==="function"){
    try{ h.onAiRanking(v=>{ orgOutcome=v && typeof v==="object" ? v : orgOutcome; syncOrgMark(); }); }catch(e){}
  }
  syncOrgMark();
}

export {
  orgModel,
  orgRanks,
  orgSaid,
  rewordSent,
  orgMarkWords,
  syncOrgMark,
  wireOrgModel
};
