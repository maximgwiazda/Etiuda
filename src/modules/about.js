import { dismissModal, openDialog } from "./dialog.js";
import { E_BUILT, E_VERSION } from "./env.js";
import { formatActionChord } from "./shortcuts.js";
import { t, tc, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { $ } from "./dom.js";

/* The brand mark for anywhere that is not the header's own markup - the header keeps
   its copy inline so the tile paints on first parse. If the mark is ever redrawn, both
   change together or the About box quietly ships the old one. */
const TILE_MARK='<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><g transform="translate(-7.441 -7.441) scale(1.0581)"><path fill="currentColor" d="M113.87 94.22C112.32 95.18 110.77 96.15 109.22 97.13C107.68 98.11 106.14 99.1 104.61 100.11C103.08 101.12 101.56 102.14 100.05 103.18C98.53 104.21 97.02 105.26 95.52 106.33C94.02 107.4 92.53 108.49 91.05 109.6C89.57 110.7 88.1 111.83 86.64 112.97C85.19 114.12 83.74 115.29 82.31 116.49C80.88 117.68 79.46 118.9 78.06 120.15C76.66 121.4 75.27 122.68 73.91 124C72.55 125.32 71.21 126.67 69.9 128.06C68.59 129.45 67.3 130.89 66.05 132.38C64.8 133.87 63.59 135.41 62.43 137.01C61.27 138.62 60.15 140.29 59.12 142.05C58.08 143.8 57.11 145.64 56.26 147.57C55.41 149.51 54.67 151.55 54.1 153.7C53.54 155.84 53.16 158.1 53.04 160.43C52.98 161.6 52.99 162.78 53.07 163.96C53.15 165.15 53.3 166.34 53.54 167.51C53.77 168.69 54.08 169.85 54.46 170.98C54.84 172.12 55.29 173.23 55.8 174.29C56.82 176.42 58.09 178.39 59.49 180.16C60.89 181.94 62.44 183.52 64.05 184.95C65.67 186.38 67.35 187.66 69.08 188.81C70.8 189.96 72.56 190.99 74.34 191.93C76.13 192.86 77.93 193.7 79.75 194.47C81.56 195.24 83.39 195.93 85.23 196.56C87.06 197.19 88.91 197.76 90.76 198.27C92.61 198.79 94.47 199.25 96.32 199.67C98.18 200.08 100.05 200.45 101.91 200.78C103.78 201.11 105.65 201.4 107.52 201.66C109.39 201.91 111.26 202.12 113.13 202.3C115 202.48 116.88 202.62 118.75 202.73C120.62 202.84 122.5 202.92 124.37 202.96C126.25 203 128.13 203.01 130 202.99C131.88 202.96 133.75 202.91 135.63 202.82C137.5 202.73 139.37 202.6 141.25 202.45C143.12 202.29 144.99 202.09 146.86 201.86C148.73 201.63 150.6 201.37 152.47 201.06C154.34 200.75 156.2 200.41 158.06 200.02C159.92 199.62 161.78 199.19 163.64 198.7C165.49 198.22 167.34 197.68 169.18 197.09C171.02 196.49 172.85 195.84 174.68 195.12C176.5 194.39 178.31 193.6 180.11 192.71C181.9 191.83 183.68 190.86 185.42 189.78C187.16 188.69 188.88 187.5 190.53 186.15C192.18 184.81 193.78 183.32 195.26 181.65C196.74 179.98 198.1 178.13 199.26 176.1C199.83 175.08 200.36 174.02 200.82 172.92C201.28 171.82 201.67 170.69 201.99 169.53C202.3 168.38 202.55 167.2 202.72 166.02C202.88 164.83 202.98 163.64 203 162.46C203.04 160.11 202.79 157.79 202.34 155.58C201.89 153.38 201.23 151.27 200.45 149.28C199.67 147.28 198.76 145.39 197.76 143.59C196.77 141.78 195.7 140.07 194.57 138.42C193.43 136.78 192.25 135.2 191.02 133.68C189.79 132.16 188.53 130.7 187.23 129.28C185.94 127.86 184.61 126.49 183.26 125.15C181.91 123.81 180.54 122.51 179.15 121.25C177.76 119.98 176.35 118.74 174.93 117.53C173.51 116.32 172.07 115.14 170.62 113.97C169.16 112.81 167.7 111.68 166.23 110.56C164.75 109.44 163.27 108.34 161.77 107.26C160.28 106.19 158.78 105.12 157.27 104.08C155.75 103.03 154.24 102 152.71 100.99C151.18 99.97 149.65 98.97 148.11 97.98C146.57 96.99 145.03 96.02 143.48 95.05C143.03 94.77 142.58 94.5 142.13 94.22L142.13 94.22C143.68 93.38 145.24 92.53 146.8 91.7C148.37 90.87 149.93 90.04 151.51 89.22C153.08 88.4 154.65 87.58 156.23 86.77C157.81 85.96 159.39 85.16 160.98 84.36C162.56 83.57 164.15 82.78 165.74 81.99C167.34 81.2 168.93 80.42 170.53 79.65C172.13 78.87 173.73 78.1 175.34 77.34C176.94 76.57 178.55 75.81 180.16 75.05C181.77 74.3 183.38 73.55 184.99 72.8C186.61 72.05 188.22 71.31 189.84 70.57C191.46 69.83 193.08 69.1 194.71 68.37C195.39 68.06 196.07 67.76 196.75 67.45C197.09 67.3 197.43 67.15 197.77 67C197.95 66.92 198.12 66.84 198.29 66.77C198.37 66.73 198.46 66.69 198.54 66.65C198.58 66.64 198.63 66.62 198.67 66.6C198.71 66.58 198.75 66.56 198.8 66.54A7.08 7.08 0 0 0 202.39 57.2A7.08 7.08 0 0 0 193.05 53.61C193 53.63 192.95 53.66 192.9 53.68C191.25 54.41 189.6 55.15 187.96 55.89C186.31 56.63 184.67 57.38 183.02 58.13C181.38 58.88 179.74 59.63 178.1 60.39C176.47 61.15 174.83 61.92 173.2 62.69C171.56 63.46 169.93 64.23 168.3 65.02C166.67 65.8 165.04 66.58 163.41 67.37C161.79 68.16 160.16 68.96 158.54 69.76C156.92 70.57 155.3 71.38 153.69 72.19C152.07 73.01 150.46 73.83 148.85 74.66C147.24 75.49 145.63 76.32 144.02 77.16C142.42 78 140.82 78.85 139.22 79.71C137.62 80.57 136.02 81.43 134.43 82.3C132.84 83.18 131.25 84.06 129.67 84.95C129.11 85.26 128.55 85.57 128 85.89L128 85.89C126.42 84.99 124.83 84.11 123.24 83.23C121.65 82.35 120.06 81.48 118.47 80.62C116.87 79.75 115.27 78.9 113.67 78.05C112.06 77.2 110.46 76.36 108.85 75.53C107.24 74.7 105.63 73.87 104.01 73.05C102.4 72.23 100.78 71.42 99.16 70.61C97.54 69.8 95.92 69 94.3 68.21C92.67 67.41 91.05 66.62 89.42 65.84C87.79 65.05 86.16 64.28 84.52 63.5C82.89 62.73 81.26 61.96 79.62 61.2C77.98 60.43 76.34 59.67 74.7 58.92C73.06 58.17 71.42 57.42 69.78 56.67C68.13 55.93 66.49 55.19 64.84 54.45C64.52 54.31 64.21 54.17 63.89 54.03C63.74 53.96 63.58 53.89 63.42 53.82C63.34 53.78 63.26 53.75 63.19 53.71C63.15 53.7 63.11 53.68 63.07 53.66C63.05 53.65 63.03 53.64 63.01 53.64C63 53.63 62.99 53.63 62.98 53.62C62.97 53.62 62.93 53.6 62.95 53.61A7.08 7.08 0 0 0 53.61 57.2A7.08 7.08 0 0 0 57.2 66.54C57.23 66.55 57.21 66.55 57.22 66.55C58.85 67.27 60.47 68 62.1 68.73C63.72 69.46 65.34 70.2 66.96 70.94C68.58 71.68 70.19 72.42 71.81 73.17C73.42 73.92 75.03 74.67 76.64 75.43C78.25 76.19 79.86 76.95 81.46 77.72C83.06 78.48 84.66 79.26 86.26 80.03C87.86 80.81 89.45 81.59 91.05 82.38C92.64 83.17 94.22 83.96 95.81 84.76C97.39 85.56 98.98 86.36 100.55 87.17C102.13 87.99 103.7 88.8 105.27 89.63C106.84 90.45 108.41 91.28 109.97 92.11C111.27 92.81 112.57 93.52 113.87 94.22ZM128 102.23C129.52 103.12 131.03 104.03 132.54 104.94C134.04 105.86 135.54 106.78 137.03 107.71C138.52 108.64 140 109.59 141.48 110.54C142.95 111.49 144.41 112.46 145.87 113.43C147.32 114.41 148.76 115.4 150.2 116.4C151.63 117.4 153.05 118.41 154.45 119.44C155.86 120.46 157.25 121.5 158.62 122.56C160 123.61 161.36 124.68 162.7 125.77C164.04 126.85 165.36 127.96 166.66 129.08C167.95 130.2 169.23 131.33 170.47 132.49C171.72 133.65 172.94 134.82 174.12 136.02C175.3 137.21 176.44 138.43 177.55 139.67C178.65 140.91 179.7 142.16 180.7 143.44C181.7 144.72 182.64 146.02 183.51 147.34C184.38 148.66 185.17 149.99 185.86 151.33C186.55 152.67 187.15 154.02 187.62 155.36C188.09 156.7 188.43 158.02 188.64 159.31C188.84 160.6 188.9 161.85 188.81 163.06C188.72 164.26 188.49 165.43 188.1 166.55C187.72 167.68 187.19 168.78 186.5 169.85C185.82 170.92 184.99 171.96 184.03 172.96C183.08 173.95 182 174.9 180.82 175.79C179.65 176.68 178.38 177.52 177.05 178.3C175.72 179.09 174.32 179.81 172.87 180.49C171.43 181.17 169.94 181.79 168.41 182.37C166.89 182.95 165.33 183.48 163.75 183.96C162.17 184.45 160.56 184.89 158.94 185.3C157.32 185.7 155.67 186.07 154.02 186.4C152.37 186.73 150.7 187.02 149.03 187.28C147.35 187.54 145.67 187.76 143.98 187.96C142.29 188.15 140.59 188.31 138.89 188.44C137.19 188.57 135.48 188.67 133.78 188.73C132.07 188.8 130.36 188.84 128.65 188.85C126.94 188.86 125.23 188.83 123.52 188.78C121.82 188.73 120.11 188.64 118.41 188.53C116.7 188.42 115 188.27 113.31 188.1C111.62 187.92 109.93 187.71 108.25 187.47C106.57 187.23 104.9 186.95 103.24 186.64C101.58 186.33 99.93 185.98 98.3 185.6C96.67 185.21 95.05 184.79 93.46 184.33C91.87 183.86 90.29 183.35 88.75 182.8C87.21 182.25 85.7 181.65 84.24 180.99C82.77 180.34 81.34 179.64 79.98 178.89C78.61 178.13 77.31 177.32 76.09 176.46C74.87 175.59 73.74 174.67 72.72 173.7C71.7 172.73 70.8 171.71 70.04 170.66C69.29 169.61 68.68 168.52 68.22 167.41C67.76 166.29 67.45 165.15 67.29 163.97C67.12 162.78 67.11 161.56 67.24 160.29C67.37 159.02 67.64 157.7 68.05 156.37C68.46 155.04 68.99 153.7 69.63 152.35C70.27 151.01 71.02 149.67 71.85 148.34C72.67 147.02 73.58 145.71 74.55 144.42C75.52 143.13 76.55 141.86 77.62 140.61C78.7 139.37 79.83 138.14 80.99 136.93C82.15 135.73 83.35 134.54 84.59 133.37C85.82 132.21 87.08 131.06 88.36 129.93C89.65 128.8 90.96 127.69 92.29 126.6C93.62 125.5 94.97 124.43 96.33 123.36C97.7 122.3 99.08 121.25 100.48 120.22C101.88 119.19 103.29 118.17 104.72 117.16C106.14 116.15 107.58 115.16 109.03 114.18C110.48 113.2 111.94 112.23 113.4 111.27C114.87 110.31 116.35 109.36 117.84 108.42C119.32 107.49 120.82 106.56 122.32 105.64C123.82 104.72 125.33 103.81 126.85 102.91C127.23 102.68 127.62 102.46 128 102.23Z"/></g></svg>';
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
