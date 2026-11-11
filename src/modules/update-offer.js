/* The update offer: the release the shell's signed version note offers, shown as a dot on the Menu button, the Menu's first
   row, and two lines in Settings' About. The shell reads and judges the note and opens the release page; the page only
   shows what the shell answered, and shows nothing in a browser. Later puts the dot and the row off for seven days, or
   until a still newer release is offered; About shows the offer whatever was put off. */
import { $ } from "./dom.js";
import { eHost } from "./host.js";
import { lsGet, lsSet } from "./storage.js";
import { t } from "./ui-lang.js";

const UPDATE_LATER_MS=7*24*60*60*1000;
let updateNow={offer:"", look:""};

function updateHost(){
  const h=eHost();
  return h && typeof h.updateState==="function" ? h : null;
}
/* The shell's answer as the page keeps it: a release of three numbers or "", and "read", "failed" or "". */
function updateRead(v){
  const o=v && typeof v==="object" ? v : {};
  return {
    offer: typeof o.offer==="string" && /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(o.offer) ? o.offer : "",
    look: o.look==="read" || o.look==="failed" ? o.look : ""
  };
}
/* What Later stored, {version, until}, or null. */
function updateLaterHeld(){
  let o=null;
  try{ o=JSON.parse(lsGet("eUpdateLater")||"null"); }catch(e){ o=null; }
  return o && typeof o==="object" && typeof o.version==="string" && Number.isFinite(o.until) ? o : null;
}
/* The release the dot and the row offer at `now`: the offer, unless Later was pressed for that same release within the week. */
function updateInMenu(state, later, now){
  const offer=state && state.offer;
  if(!offer) return "";
  if(later && later.version===offer && now<later.until) return ""; /* plant:later-holds */
  return offer;
}
function updateLater(now){
  if(!updateNow.offer) return;
  lsSet("eUpdateLater", JSON.stringify({version:updateNow.offer, until:(now==null ? Date.now() : now)+UPDATE_LATER_MS}));
  syncUpdateOffer();
}
function openUpdatePage(){
  const h=updateHost();
  if(!h || typeof h.openUpdatePage!=="function") return;
  try{ Promise.resolve(h.openUpdatePage()).catch(()=>{}); }catch(e){ /* the shell has gone */ }
}
/* Settings' About under a host: the running release, then the offered one, the newest, or that the look could not be made.
   null in a browser, where nothing is looked for. */
function updateAbout(running){
  if(!updateHost()) return null;
  const s=updateNow;
  const second=s.offer ? t("Newest available: {VERSION}").split("{VERSION}").join(s.offer)
    : s.look==="read" ? t("This is the newest version.")
    : t("Whether a newer version exists could not be checked just now. This one works as it is.");
  return { lines:[t("This version: {VERSION}").split("{VERSION}").join(String(running)), second], offer:s.offer };
}
function syncUpdateOffer(){
  const v=updateHost() ? updateInMenu(updateNow, updateLaterHeld(), Date.now()) : "";
  const btn=$("#settingsBtn"), dot=$("#updDot"), row=$("#menuUpdate"), sep=$("#menuUpdateSep");
  const words=t("Etiuda {VERSION} is available").split("{VERSION}").join(v);
  if(dot){
    dot.hidden=!v;
    if(v){
      const said=t("A newer Etiuda is available: {VERSION}").split("{VERSION}").join(v);
      dot.setAttribute("aria-label", said);
      dot.title=said;
    }
  }
  // The desk's node page builds a Menu button without removeAttribute (as paintMenuIcons notes for insertAdjacentHTML).
  if(btn && typeof btn.removeAttribute==="function"){ if(v) btn.setAttribute("aria-describedby","updDot"); else btn.removeAttribute("aria-describedby"); }
  if(row){
    row.hidden=!v;
    const head=$("#menuUpdateT"), see=$("#menuUpdateSee"), later=$("#menuUpdateLater");
    if(head) head.textContent=v ? words : "";
    if(see){ see.textContent=t("See what's new"); see.title=t("Opens the page of this release"); }
    if(later) later.textContent=t("Later");
  }
  if(sep) sep.hidden=!v;
}
/* The shell's answer at boot, then each one it sends after a look. */
function wireUpdateOffer(){
  const h=updateHost();
  if(!h) return;
  try{ updateNow=updateRead(h.updateState()); }catch(e){ updateNow=updateRead(null); }
  if(typeof h.onUpdate==="function") h.onUpdate(v=>{ updateNow=updateRead(v); syncUpdateOffer(); });
  syncUpdateOffer();
}

export {
  UPDATE_LATER_MS,
  openUpdatePage,
  syncUpdateOffer,
  updateAbout,
  updateInMenu,
  updateLater,
  updateLaterHeld,
  updateRead,
  wireUpdateOffer
};
