import { uiLang, translateChrome, uiLangKnown } from "./ui-lang.js";
import { lsSet, lsDel } from "./storage.js";
import { syncShortcutTitles } from "./shortcuts.js";
import { applyCatsToGlobal } from "./cat-set.js";
import { drawIntentRail } from "./rail-list.js";
import { drawPills, drawTabs } from "./tabs.js";
import { syncRoleDrum } from "./role-drum.js";
import { render } from "./render.js";
import { refreshDialogName } from "./dialog.js";
import { syncSettingsMenu } from "./header-menus.js";

// ---- repainting after a language change: it reaches the whole app, so it stays here ----
/* Every localised string is re-read here rather than at construction, so switching language
   repaints the app instead of asking for a reload. Anything built later reads t() itself. */
function applyUiLang(){
  document.documentElement.lang = uiLang();
  /* Re-render what the app builds from strings, then sweep the markup it does not. The order
     matters: syncSettingsMenu writes labels through t(), and the sweep translates whatever was
     authored in HTML. */
  syncSettingsMenu();
  syncShortcutTitles();
  /* Surfaces translated at their CALL SITE (cards, panel, pills, tabs, legend) only
     change when drawn again, and changing language draws nothing by itself. The sweep
     handles what is already in the document; this rebuilds what must say something new. */
  /* applyCatsToGlobal leads: category labels can differ by language now, and every surface
     below reads the resolved CATS rather than the catalog. */
  /* References, never names looked up on window: a top-level function is a property of window
     in a classic script and is not one in a module, so a lookup by string turns quietly false
     and these six surfaces stop repainting with nothing thrown and nothing logged. */
  [applyCatsToGlobal,drawIntentRail,drawPills,drawTabs,syncRoleDrum,render].forEach(f=>{
    try{ f(); }catch(e){}
  });
  translateChrome();
  /* The name beside a dialog's title is CONTENT, so the sweep above rightly leaves it alone -
     and nothing else re-derived it, so an open editor kept naming its card in the language
     you had just left while the title itself changed. Re-read, not translated. */
  try{ refreshDialogName(); }catch(e){}
}
// Changing the interface language repaints the app rather than asking for a reload, and this is
// where that reaches every surface. Setting the language is that repaint, so it lives here too.

/* The string table does not import this back: setting the language IS the repaint, and
   holding the strings is not, so ui-lang.js stays out of the load cycle it would fail. */
function setUiLang(l){
  if(l && l!=="en" && uiLangKnown(l)) lsSet("eUiLang",l); else lsDel("eUiLang");
  applyUiLang();
}

export {
  setUiLang,
  applyUiLang,
};
