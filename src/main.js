/* The module tree's entry, and the bridge to what is not extracted yet.
   src/monolith.js is still one classic script sharing the artifact's global scope, and it binds
   these names by name. A top-level function or const in a classic script is already a property
   of the global object, so handing them over this way gives the monolith the binding kind those
   names had. A line goes with every module; the file goes when the monolith does. */
import * as icons from "./modules/icons.js";
import * as stock from "./modules/stock.js";
import * as polish from "./modules/polish.js";
import * as contentModel from "./modules/content-model.js";
import * as words from "./modules/words.js";
import * as greeting from "./modules/greeting.js";
import * as cardFields from "./modules/card-fields.js";
import * as catRoles from "./modules/cat-roles.js";
import * as env from "./modules/env.js";
import * as cardModel from "./modules/card-model.js";
import * as cardBlocks from "./modules/card-blocks.js";
import * as storage from "./modules/storage.js";
import * as columns from "./modules/columns.js";
import * as spell from "./modules/spell.js";
import * as scoring from "./modules/scoring.js";
import * as affinity from "./modules/affinity.js";
import * as intentText from "./modules/intent-text.js";
import * as maintenance from "./modules/maintenance.js";
import * as shortcuts from "./modules/shortcuts.js";
import * as cardOrder from "./modules/card-order.js";
import * as catalog from "./modules/catalog.js";
import * as collapse from "./modules/collapse.js";
import * as tour from "./modules/tour.js";
import * as editors from "./modules/editors.js";
import * as catalogFile from "./modules/catalog-file.js";
import * as langTabs from "./modules/lang-tabs.js";
import * as cardEditor from "./modules/card-editor.js";
import * as macrosJson from "./modules/macros-json.js";
import * as tabs from "./modules/tabs.js";
import * as motion from "./modules/motion.js";
import * as manage from "./modules/manage.js";
import * as settings from "./modules/settings.js";
import * as cardSearch from "./modules/card-search.js";
import * as listPointer from "./modules/list-pointer.js";
import * as facts from "./modules/facts.js";
import * as uiLang from "./modules/ui-lang.js";
import * as railList from "./modules/rail-list.js";
import * as personalPack from "./modules/pack.js";
import * as shed from "./modules/shed.js";
import * as favourites from "./modules/favourites.js";
import * as railPanel from "./modules/rail-panel.js";
import * as paint from "./modules/paint.js";
import * as dialog from "./modules/dialog.js";
import * as headerMenus from "./modules/header-menus.js";
import * as cardScore from "./modules/card-score.js";
import * as searchBox from "./modules/search-box.js";
import * as keydown from "./modules/keydown.js";
import * as catalogOffer from "./modules/catalog-offer.js";
import * as pops from "./modules/pops.js";
import * as recency from "./modules/recency.js";
import * as onOpen from "./modules/on-open.js";
import * as localMemory from "./modules/local-memory.js";
import * as shortcutsList from "./modules/shortcuts-list.js";
import * as pillState from "./modules/pill-state.js";
Object.assign(globalThis, icons, stock, polish, contentModel, words, greeting, cardFields, catRoles, env, cardModel, cardBlocks, storage, columns, spell, scoring, affinity, intentText, maintenance, shortcuts, cardOrder, catalog, collapse, tour, editors, catalogFile, langTabs, cardEditor, macrosJson, tabs, motion, manage, settings, cardSearch, listPointer, facts, uiLang, railList, personalPack, shed, favourites, railPanel, paint, dialog, headerMenus, cardScore, searchBox, keydown, catalogOffer, pops, recency, onOpen, localMemory, shortcutsList, pillState);

/* These are replaced wholesale rather than filled in place, so the monolith has to read the
   binding rather than the copy taken above, before any catalog existed. A name mutated in place
   needs no line here; a name its own module assigns to does. */
Object.defineProperty(globalThis, "CAT_ICONS_CATALOG", { get: () => icons.CAT_ICONS_CATALOG });
Object.defineProperty(globalThis, "CAT_COLORS_CATALOG", { get: () => icons.CAT_COLORS_CATALOG });
Object.defineProperty(globalThis, "CAT_LABELS_PL", { get: () => icons.CAT_LABELS_PL });
Object.defineProperty(globalThis, "FACTS", { get: () => stock.FACTS });
Object.defineProperty(globalThis, "WHO_BASE", { get: () => stock.WHO_BASE });
Object.defineProperty(globalThis, "CATALOG_ROLES", { get: () => catRoles.CATALOG_ROLES });
Object.defineProperty(globalThis, "ALWAYS_CATS", { get: () => catRoles.ALWAYS_CATS });
Object.defineProperty(globalThis, "colLastN", { get: () => columns.colLastN });
Object.defineProperty(globalThis, "colAvailW", { get: () => columns.colAvailW });
Object.defineProperty(globalThis, "eSpellFix", { get: () => spell.eSpellFix });
Object.defineProperty(globalThis, "scReady", { get: () => shortcuts.scReady });
Object.defineProperty(globalThis, "scMap", { get: () => shortcuts.scMap });
Object.defineProperty(globalThis, "scMap2", { get: () => shortcuts.scMap2 });
Object.defineProperty(globalThis, "scCaptureId", { get: () => shortcutsList.scCaptureId });
Object.defineProperty(globalThis, "scCaptureSlot", { get: () => shortcutsList.scCaptureSlot });
Object.defineProperty(globalThis, "scRepaint", { get: () => shortcutsList.scRepaint });
Object.defineProperty(globalThis, "E_CATALOG_NAME", { get: () => catalog.E_CATALOG_NAME });
Object.defineProperty(globalThis, "E_CATALOG_VERSION", { get: () => catalog.E_CATALOG_VERSION });
Object.defineProperty(globalThis, "tabs", { get: () => tabs.tabs });
Object.defineProperty(globalThis, "tabSaveTimer", { get: () => tabs.tabSaveTimer });
Object.defineProperty(globalThis, "tabInsertAnimating", { get: () => tabs.tabInsertAnimating });
Object.defineProperty(globalThis, "cardDrag", { get: () => listPointer.cardDrag });
Object.defineProperty(globalThis, "pack", { get: () => personalPack.pack });
Object.defineProperty(globalThis, "BASE_M", { get: () => personalPack.BASE_M });
Object.defineProperty(globalThis, "shedHeld", { get: () => shed.shedHeld });
Object.defineProperty(globalThis, "eShedNat", { get: () => shed.eShedNat });
Object.defineProperty(globalThis, "RAIL_DOCK_MIN", { get: () => railPanel.RAIL_DOCK_MIN });
