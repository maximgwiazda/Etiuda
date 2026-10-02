import { dismissModal, openDialog } from "./dialog.js";
import { E_VERSION } from "./env.js";
import { fillProseIcons } from "./icons.js";
import { keysLegendHtml } from "./shortcuts.js";
import { t, uiLang } from "./ui-lang.js";
import { esc } from "./esc.js";
import { modalCard, $ } from "./dom.js";
import { eCatalogBuiltIn, eCatalogFile, eCatalogIn } from "./host.js";

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
// About Etiuda: elegant in-page modal with tool name + footer help/credits.
function openAbout(){
  /* Built from #aboutInfo plus a freshly rendered shortcut list. The legend cannot simply be
     cloned from the footer - it lives in an element with an id, and two of those in one
     document is a bug waiting to happen - so it is regenerated here from the same source. */
  const src=document.getElementById("aboutInfo");
  const info=src ? src.innerHTML : "";
  const keys='<b>'+esc(t("Keys"))+'</b> - '+keysLegendHtml()+' · '+esc(t("customise in"))
    +' <b><span data-icon="settings"></span> '+esc(t("→ Settings → Keyboard shortcuts"))+'</b>.<br><br>';
  /* WHICH FILE IS LOADED, and the folder it lies in. Only where a host found one - a browser's
     catalog came through Import and lives in this browser, and there is no file to name. */
  const file=eCatalogFile(), inDir=eCatalogIn();
  // A placeholder key, never two halves round a <code>: see the note at eFoundHtml.
  const where=inDir ? t("{FILE} in {FOLDER}")
      .split("{FILE}").join('<code>'+esc(file)+'</code>')
      .split("{FOLDER}").join('<code>'+esc(inDir)+'</code>')
    : '<code>'+esc(file)+'</code>';
  const said=eCatalogBuiltIn() ? t("{FILE} comes with Etiuda.").split("{FILE}").join('<code>'+esc(file)+'</code>') : where+'.';
  const fileLine=file ? '<b>'+esc(t("Catalog file"))+'</b> - '+said+'<br><br>' : "";
  const maker=esc(MAKER[uiLang()]||MAKER.en).split("{STARDUST}")
    .join('<a href="'+STARDUST_URL+'" target="_blank" rel="noopener">Stardust</a>');
  openDialog({
    cls: "about-modal",
    title: "Etiuda",
    lead: '<span class="brand-tile about-tile" aria-hidden="true">'+TILE_MARK+'</span>',
    sub: t("About Etiuda · Version {V} · <span class='nw'>Etiuda Source-Available Licence 1.0</span>, free for personal use · © 2026 Maxim Gwiazda")
           .replace("{V}",E_VERSION)+"<br>"+esc(TRADEMARK[uiLang()]||TRADEMARK.en)+"<br>"+maker,
    body: '<div class="about-body">'+keys+fileLine+info+'</div>',
    actions: '<button type="button" class="btn primary" id="aboutClose">Close</button>',
    wire: ()=>{
      fillProseIcons(modalCard);
      const closeBtn=$("#aboutClose");
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
  openAbout
};
