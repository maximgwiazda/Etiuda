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
Object.assign(globalThis, icons, stock, polish, contentModel, words, greeting, cardFields, catRoles, env, cardModel, cardBlocks, storage, columns, spell, scoring, affinity, intentText, maintenance, shortcuts);

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
