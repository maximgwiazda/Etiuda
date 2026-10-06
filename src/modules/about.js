import { dismissModal, openDialog } from "./dialog.js";
import { E_BUILT, E_VERSION } from "./env.js";
import { formatActionChord } from "./shortcuts.js";
import { t, tc, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { $ } from "./dom.js";

/* The brand mark for anywhere that is not the header's own markup - the header keeps
   its copy inline so the tile paints on first parse. If the mark is ever redrawn, both
   change together or the About box quietly ships the old one. */
const TILE_MARK='<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><g transform="translate(-7.441 -7.441) scale(1.0581)"><path fill="currentColor" d="M188.85 60.08a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M184.92 61.83a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M181 63.6a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M177.13 65.37a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M173.19 67.19a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M169.33 69a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M165.48 70.82a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M161.62 72.67a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M157.68 74.59a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M153.83 76.49a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M149.99 78.41a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M146.18 80.35a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M142.27 82.37a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M138.44 84.38a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M134.54 86.45a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M130.76 88.51a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M126.94 90.62a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M123.11 92.78a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M119.43 94.9a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M115.75 97.07a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M112.09 99.27a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M108.46 101.52a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M104.86 103.79a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M101.16 106.2a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M97.51 108.64a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M93.95 111.11a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M90.47 113.6a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M86.95 116.22a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M83.54 118.85a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M80.14 121.61a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M76.89 124.37a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M73.69 127.25a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M70.58 130.24a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M67.58 133.33a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M64.75 136.51a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M62.03 139.89a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M59.51 143.44a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M57.27 147.16a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M55.41 151.01a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M53.98 155.07a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M53.15 159.31a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M53.06 163.58a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M53.81 167.84a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M55.38 171.79a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M57.69 175.42a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M60.52 178.6a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M63.8 181.41a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M67.32 183.82a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M71.05 185.92a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M74.9 187.73a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M78.91 189.32a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M83.05 190.71a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M87.27 191.91a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M91.52 192.92a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M95.77 193.76a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M99.99 194.45a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M104.29 195a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M108.67 195.43a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M112.94 195.72a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M117.25 195.88a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M121.56 195.92a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M125.88 195.84a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M130.18 195.64a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M134.44 195.32a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M138.8 194.86a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M143.08 194.27a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M147.26 193.55a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M151.48 192.67a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M155.68 191.62a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M159.85 190.38a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M163.93 188.95a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M167.89 187.32a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M171.77 185.41a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M175.5 183.2a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M178.98 180.68a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M182.11 177.81a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M184.83 174.5a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M186.95 170.8a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M188.33 166.71a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M188.84 162.49a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M188.54 158.17a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M187.54 153.99a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M186 150a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M184 146.13a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M181.71 142.51a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M179.17 139.05a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M176.47 135.77a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M173.57 132.59a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M170.51 129.49a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M167.34 126.51a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M164.1 123.63a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M160.81 120.87a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M157.37 118.11a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M153.93 115.48a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M150.38 112.87a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M146.87 110.39a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M143.28 107.93a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M139.62 105.49a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M135.9 103.1a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M132.29 100.83a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M128.64 98.6a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M124.98 96.41a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M121.3 94.25a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M117.46 92.06a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M113.63 89.91a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M109.82 87.82a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M106.06 85.78a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M102.18 83.73a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M98.37 81.74a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M94.49 79.74a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M90.56 77.76a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M86.76 75.87a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M82.83 73.94a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M78.96 72.06a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M75.05 70.2a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M71.19 68.38a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M67.25 66.54a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M63.32 64.73a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M59.42 62.95a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M55.52 61.2a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0M53 60.08a7.08 7.08 0 1 0 14.15 0a7.08 7.08 0 1 0 -14.15 0Z"/></g></svg>';
/* The trademark notice, both languages on one line so that registration is a one-line edit here;
   tests/test.js holds the installer's licence texts to it. A language without a key reads English. */
const TRADEMARK={en:"Etiuda is a trademark of Maxim Gwiazda.", pl:"Etiuda jest znakiem towarowym Maxima Gwiazdy."};
/* The maker line, under the notice: {STARDUST} becomes the link, whose address is this constant and
   never text from a catalog or the agent. A language without a key reads English. */
const STARDUST_URL="https://stardustengineering.dev";
const MAKER={en:"Made by {STARDUST}.", pl:"Etiuda. Tworzy ją {STARDUST}."};
/* The licence card's line, both languages on one line so that the wording still open is a one-line swap.
   The other wording: {en:"At work, each person has a subscription of their own.", pl:"W pracy każda osoba ma własną subskrypcję."} */
const TERMS={en:"Free for your own affairs; at work, each person has a subscription of their own.", pl:"Do własnych spraw bezpłatnie; w pracy każda osoba ma własną subskrypcję."};
/* The end-user agreement, the installer's own text: tools/build.mjs writes each file over its
   placeholder. A language without a key reads English. */
const EULA={en:"@EULA_EN@", pl:"@EULA_PL@"};
/* WHAT THIS VERSION BROUGHT, then what each earlier one did, newest first. A version's list is
   written for it before it ships and moves to ABOUT_EARLIER with the next, taking its number as `v`
   and its build's day as `built`. {KEY1} and {KEY4} are the live bindings, so a rebound key reads true. */
const ABOUT_NEW=[
  {title:"The team's catalog in editions.", body:"When the catalog changes, the desk offers the new edition and shows, card by card, what changed, before anything is loaded."},
  {title:"Signed by the team's lead.", body:"A desk that joins a team keeps its lead's key and checks every later edition against it, and a file changed after signing never goes unnoticed."},
  {title:"The conversation's path.", body:"Space turns from the cards to the conversation in front: the replies it has sent and those that can follow. Space again brings the cards back."},
  {title:"Next replies on {KEY1} to {KEY4}.", body:"After each reply sent, up to four that can follow wait one key each: the catalog's own first, then those this desk has learnt."}
];
const ABOUT_EARLIER=[
  {items:[{title:"Up to 1.16.7.", body:"Etiuda as a single file, opened in a web browser, under the MIT licence. The last of them, 1.16.7, still opens at etiuda.dev/v1."}]}
];
/* A day as the interface's language writes it, empty for anything that is not a date, which is the
   source before a build has stamped it. */
function aboutDay(iso){
  const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(String(iso||""));
  if(!m) return "";
  const lang=uiLang();
  try{
    return new Intl.DateTimeFormat(lang==="en"?"en-GB":lang,{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})
      .format(Date.UTC(+m[1],m[2]-1,+m[3]));
  }catch(e){ return m[0]; }
}
function aboutItemHtml(it){
  const keyed=t(it.title).split("{KEY1}").join(formatActionChord("nextCopy1")).split("{KEY4}").join(formatActionChord("nextCopy4"));
  return '<li><b>'+esc(keyed)+'</b> '+esc(t(it.body))+'</li>';
}
/** The Earlier versions page: a version headed by its number and its day, the 1.x line on its own. */
function aboutEarlierHtml(list){
  return list.map(r=>(r.v ? '<h3 class="about-h">'+esc(t("{VERSION}, built on {DATE}").split("{VERSION}").join(r.v)
      .split("{DATE}").join(aboutDay(r.built)))+'</h3>' : "")
    +'<ul class="about-new" data-i18n-skip>'+r.items.map(aboutItemHtml).join("")+'</ul>').join("");
}
/* The credit: copyright and the trademark notice, then the maker line, whose {STARDUST} becomes the link. */
function aboutCredit(lang){
  const maker=esc(MAKER[lang]||MAKER.en).split("{STARDUST}")
    .join('<a href="'+STARDUST_URL+'" target="_blank" rel="noopener">Stardust</a>');
  return "© 2026 Maxim Gwiazda. "+esc(TRADEMARK[lang]||TRADEMARK.en)+"<br>"+maker;
}
/* A page within the About: its X, Escape and Back all return there. */
function aboutPage(title, body){
  openDialog({
    cls: "about-page",
    title: title,
    back: openAbout,
    body: body,
    actions: '<button type="button" class="btn primary" id="aboutBack">'+esc(tc("about","Back"))+'</button>',
    wire: ()=>{
      const b=$("#aboutBack");
      if(b){ b.onclick=()=>dismissModal(); try{ b.focus(); }catch(_){} }
    }
  });
}
function openEarlier(){
  aboutPage("Earlier versions of Etiuda", aboutEarlierHtml(ABOUT_EARLIER));
}
/* The agreement's first line is its title, the rest its paragraphs; a paragraph that opens on a
   heading of four words or fewer ("Seats.") sets it in bold. */
function openLicence(){
  const paras=String(EULA[uiLang()]||EULA.en).split(/\n\s*\n/).map(p=>p.replace(/\s+/g," ").trim()).filter(Boolean);
  const title=paras.shift()||"";
  aboutPage(title, '<div class="about-legal" data-i18n-skip>'+paras.map(p=>{
    const m=/^([^.,]+\.) (.+)$/.exec(p);
    return '<p>'+(m && m[1].split(" ").length<=4 ? '<b>'+esc(m[1])+'</b> '+esc(m[2]) : esc(p))+'</p>';
  }).join("")+'</div>');
}
function openAbout(){
  const lang=uiLang(), day=aboutDay(E_BUILT);
  const cap=esc(t("the version on this computer"))+(day ? '<br>'+esc(t("Built on {DATE}").split("{DATE}").join(day)) : "");
  openDialog({
    cls: "about-modal",
    title: "Etiuda",
    lead: '<span class="brand-tile about-tile" aria-hidden="true">'+TILE_MARK+'</span>',
    body: '<div class="about-ver" data-i18n-skip><span class="about-num">'+esc(E_VERSION)+'</span>'
        +'<span class="about-cap">'+cap+'</span></div>'
      +'<h3 class="about-h">'+esc(t("New in this version"))+'</h3>'
      +'<ul class="about-new" data-i18n-skip>'+ABOUT_NEW.map(aboutItemHtml).join("")+'</ul>'
      +'<div class="about-lic" data-i18n-skip><span class="about-lic-t">'+esc(t("Etiuda End-User Licence Agreement"))
        +'<small>'+esc(TERMS[lang]||TERMS.en)+'</small></span>'
        +'<button type="button" class="btn" id="aboutLicence">'+esc(t("Read the licence"))+'</button></div>'
      +'<p class="about-credit" data-i18n-skip>'+aboutCredit(lang)+'</p>',
    actions: '<div class="mf-left"><button type="button" class="btn" id="aboutEarlier">'+esc(t("Earlier versions of Etiuda"))+'</button></div>'
      +'<button type="button" class="btn primary" id="aboutClose">'+esc(t("Close"))+'</button>',
    wire: ()=>{
      // The X is named for a screen reader as the Close beside it.
      const x=$("#modalX");
      if(x) x.setAttribute("aria-label", t("Close"));
      const lic=$("#aboutLicence"), earlier=$("#aboutEarlier"), closeBtn=$("#aboutClose");
      if(lic) lic.onclick=openLicence;
      if(earlier) earlier.onclick=openEarlier;
      if(closeBtn){
        /* Just dismissModal - the modifier class is the opener's business (openDialog resets
           the card's class list). */
        closeBtn.onclick=()=>dismissModal();
        try{ closeBtn.focus(); }catch(_){}
      }
    }
  });
}

export {
  aboutEarlierHtml,
  openAbout
};
