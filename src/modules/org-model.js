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
/* The last re-order's outcome as the shell sent it on etiuda:ai-state. */
let orgOutcome={ranking:"organisation", failures:0, pausedUntil:0};
let orgPauseT=0;
/* The median wait above which the mark says the model is too slow to reorder: the 4 seconds its words name. */
const ORG_SLOW_MS=4000;
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
  if(Number(o.medianMs)>ORG_SLOW_MS) return eAiModel()
    ? {paused:false, label:t("organisation's model too slow to reorder"),
      title:at(t("{HOST} usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the built-in model's order stands."))}
    : {paused:false, label:t("organisation's model too slow to reorder"),
      title:at(t("{HOST} usually takes more than 4 seconds to answer, too long to reorder a list already being read, so the word matches' order stands."))};
  const search=eSearchOn(), suggest=eAiOn();
  const title=search && !suggest ? t("The organisation's model at {HOST} ranks the search. The search text is sent there.")
    : suggest && !search ? t("The organisation's model at {HOST} ranks the suggestions. The copied message they are made from is sent there.")
    : t("The organisation's model at {HOST} ranks the search and the suggestions. The search text and the copied message the suggestions are made from are sent there.");
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
  orgMarkWords,
  syncOrgMark,
  wireOrgModel
};
