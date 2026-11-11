/* THE ORGANISATION'S MODEL ON THE PAGE (board 992): what the shell says is in force, the mark beside the search box while
   that model ranks, and the sentences that change with it. The shell holds the fields, the key and the requests; the page
   is told whether the option is on and ready, the host, and each re-order's outcome, and shows nothing in a browser. */
import { $ } from "./dom.js";
import { eHost, eAiModel } from "./host.js";
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
/* The mark's words at `now`: {label, title, paused}. Paused is the shell's pause after failures in a row, while the built-in
   model, or the word matches where the desk carries none, rank meanwhile. */
function orgMarkWords(st, outcome, now){
  const host=String(st && st.host || "");
  const o=outcome || {};
  const paused=Number(o.pausedUntil)>now;
  if(paused) return {paused:true, label:t("organisation's model not answering"), // placeholder: Claudette
    title:(eAiModel()
      ? t("Your organisation's model at {HOST} is not answering, so the built-in model ranks meanwhile.") // placeholder: Claudette
      : t("Your organisation's model at {HOST} is not answering, so word matches stand meanwhile.") // placeholder: Claudette
    ).split("{HOST}").join(host)};
  const said=t("Your organisation's model at {HOST} ranks the search and the suggestions. The search text and the message the suggestions are made from are sent there.").split("{HOST}").join(host); // placeholder: Claudette
  return {paused:false, label:t("organisation's model"), // placeholder: Claudette
    title:o.failures>0 ? said+" "+t("The last search had no answer from it in time, so the built-in model ranked that one.") : said}; // placeholder: Claudette
}
/* The mark: there while the organisation's model ranks, on every screen, and absent otherwise. */
function syncOrgMark(st){
  const mark=$("#orgMark");
  if(!mark) return;
  const s=st===undefined ? orgModel() : st;
  const on=orgRanks(s);
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
