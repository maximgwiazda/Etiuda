import { nameGender, VAR_GENDERS } from "./variables.js";
import { t } from "./ui-lang.js";
import { pax, $ } from "./dom.js";

/* CONTRACT: nothing here imports a module inside the load cycle, as role-drum.js; the gestures that
   render and save live in gender-turn.js. */

/* The customer's gender as {GENDER} and the team's address read it: from the first name, unless the
   agent turned the glyph, which holds for the tab until another first name is typed. */
let handGender=null;
function firstKeyOf(raw){ return String(raw==null?"":raw).trim().split(/\s+/)[0].toLowerCase(); }
function custGender(){
  const first=firstKeyOf(pax?pax.value:"");
  if(handGender && handGender.first!==first) handGender=null;
  if(handGender) return {v:handGender.v, hand:true, empty:!first};
  return {v:nameGender(first), hand:false, empty:!first};
}
function setHandGender(v){
  if(VAR_GENDERS.indexOf(v)<0) return;
  handGender={v:v, first:firstKeyOf(pax?pax.value:"")};
}
function getHandGender(){ return handGender ? {v:handGender.v, first:handGender.first} : null; }
function putHandGender(h){
  handGender=(h && VAR_GENDERS.indexOf(h.v)>-1) ? {v:h.v, first:String(h.first==null?"":h.first)} : null;
}
const GENDER_GLYPH={
  m:'<path d="M11.3 8.7 16 4"/><path d="M12 4h4v4"/><circle cx="8.2" cy="11.8" r="4.4"/>',
  f:'<circle cx="10" cy="7.6" r="4.4"/><path d="M10 12v6.2"/><path d="M7.2 15.3h5.6"/>',
  n:'<circle cx="10" cy="13.4" r="4.4"/><path d="M10 9V2"/><path d="M7.4 3.6l5.2 3.2"/><path d="M12.6 3.6 7.4 6.8"/>'
};
function genderSvg(g,cls){
  return '<svg class="'+cls+'" viewBox="0 0 20 20" aria-hidden="true" focusable="false">'+GENDER_GLYPH[g]+'</svg>';
}
/* What a screen reader hears and what the tooltip says, by how the value was reached. */
function genderSaid(s){
  if(s.hand) return {
    text:s.v==="m" ? t("male, set by hand") : s.v==="f" ? t("female, set by hand") : t("nonbinary, set by hand"),
    tip:t("Gender, set by hand. A new name is read afresh.")};
  if(s.v==="n") return {
    text:s.empty ? t("nonbinary, until a name is typed") : t("nonbinary, as the name leaves it open"),
    tip:t("Gender, nonbinary while the name leaves it open. A click or the wheel changes it.")};
  return {
    text:s.v==="m" ? t("male, read from the name") : t("female, read from the name"),
    tip:t("Gender, read from the first name. A click or the wheel changes it.")};
}
function syncGenderGlyph(){
  const d=$("#genderDrum"); if(!d) return;
  const s=custGender(), i=VAR_GENDERS.indexOf(s.v), n=VAR_GENDERS.length;
  const tr=d.querySelector(".gd-track");
  if(tr) tr.innerHTML=genderSvg(VAR_GENDERS[(i-1+n)%n],"gd-prev")+genderSvg(s.v,"gd-cur")+genderSvg(VAR_GENDERS[(i+1)%n],"gd-next");
  d.classList.toggle("gd-hand", s.hand);
  d.dataset.g=s.v;
  const said=genderSaid(s);
  d.setAttribute("aria-label", t("Customer's gender"));
  d.setAttribute("aria-valuetext", said.text);
  d.title=said.tip;
}

export {
  custGender,
  setHandGender,
  getHandGender,
  putHandGender,
  syncGenderGlyph
};
