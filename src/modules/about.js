import { dismissModal, openDialog } from "./dialog.js";
import { E_VERSION } from "./env.js";
import { fillProseIcons } from "./icons.js";
import { keysLegendHtml } from "./shortcuts.js";
import { t } from "./ui-lang.js";
import { esc } from "./esc.js";

/* The brand mark for anywhere that is not the header's own markup - the header keeps
   its copy inline so the tile paints on first parse. If the mark is ever redrawn, both
   change together or the About box quietly ships the old one. */
const TILE_MARK='<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><g transform="translate(-7.441 -7.441) scale(1.0581)"><path fill="currentColor" d="M190.65 89.21L191.65 89.01Q203.00 94.28 203.00 106.44L203.00 106.44Q203.00 112.91 200.21 118.54Q197.42 124.17 193.19 127.20Q188.96 130.24 183.03 131.64Q177.10 133.03 163.96 135.32L163.96 135.32Q175.81 140.40 175.81 152.85L175.81 152.85Q175.81 165.10 166.20 175.86Q156.59 186.62 139.11 193.69Q121.63 200.76 102.70 200.76L102.70 200.76Q92.44 200.76 83.53 198.47Q74.61 196.18 67.44 190.90Q60.27 185.62 56.64 178.10Q53.00 170.58 53.00 161.12L53.00 161.12Q53.00 131.54 94.33 118.19L94.33 118.19Q86.37 117.29 80.89 111.42Q75.41 105.54 75.41 96.58L75.41 96.58Q75.41 88.91 79.29 82.63Q83.18 76.36 91.94 69.48Q100.71 62.61 108.68 58.93Q116.65 55.24 127.00 55.24L127.00 55.24Q139.06 55.24 149.41 60.42L149.41 60.42L150.01 61.72Q149.22 63.51 147.62 73.12Q146.03 82.73 145.93 86.02L145.93 86.02L145.13 86.91L140.65 86.91L139.85 86.02L139.45 74.66Q131.49 66.50 119.83 66.50L119.83 66.50Q109.47 66.50 102.40 72.77Q95.33 79.05 95.33 88.91L95.33 88.91Q95.33 95.48 98.57 100.56Q101.80 105.64 106.83 108.03Q111.86 110.42 117.24 110.42L117.24 110.42Q119.24 110.42 122.32 109.92L122.32 109.92L123.12 110.72Q120.93 118.79 120.73 121.97L120.73 121.97Q117.44 121.38 114.35 121.38L114.35 121.38Q104.99 121.38 96.03 125.16Q87.06 128.95 82.08 137.16Q77.10 145.38 77.10 155.44L77.10 155.44Q77.10 165.60 81.93 173.42Q86.76 181.24 95.48 185.47Q104.20 189.70 116.35 189.70L116.35 189.70Q125.21 189.70 132.43 187.46Q139.65 185.22 145.28 180.84Q150.91 176.46 154.20 170.43Q157.48 164.40 157.48 157.53L157.48 157.53Q157.48 152.35 155.24 147.97Q153.00 143.59 148.82 141.55Q144.63 139.50 140.75 139.50L140.75 139.50Q137.76 139.50 134.47 140.75Q131.19 141.99 129.29 144.63Q127.40 147.27 126.75 149.12Q126.11 150.96 125.11 155.44L125.11 155.44L124.22 156.34L120.73 156.34L120.03 155.44L122.22 134.23Q128.80 127.85 136.32 125.46Q143.84 123.07 158.98 121.08L158.98 121.08Q173.12 119.28 180.49 117.59Q187.86 115.90 191.50 112.16Q195.13 108.43 195.13 103.65L195.13 103.65Q195.13 96.18 188.06 93.79L188.06 93.79L188.06 92.49L190.65 89.21Z"/></g></svg>';
// About Etiuda: elegant in-page modal with tool name + footer help/credits.
function openAbout(){
  /* Built from #aboutInfo plus a freshly rendered shortcut list. The legend cannot simply be
     cloned from the footer - it lives in an element with an id, and two of those in one
     document is a bug waiting to happen - so it is regenerated here from the same source. */
  const src=document.getElementById("aboutInfo");
  const info=src ? src.innerHTML : "";
  const keys='<b>'+esc(t("Keys"))+'</b> - '+keysLegendHtml()+' · '+esc(t("customise in"))
    +' <b><span data-icon="settings"></span> '+esc(t("→ Settings → Keyboard shortcuts"))+'</b>.<br><br>';
  openDialog({
    cls: "about-modal",
    title: "Etiuda",
    lead: '<span class="brand-tile about-tile" aria-hidden="true">'+TILE_MARK+'</span>',
    sub: t("About Etiuda · Version {V} · <span class='nw'>Etiuda Source-Available Licence 1.0</span>, free for personal use · © 2026 Maxim Gwiazda")
           .replace("{V}",E_VERSION),
    body: '<div class="about-body">'+keys+info+'</div>',
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
