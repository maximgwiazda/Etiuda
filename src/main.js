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
Object.assign(globalThis, icons, stock, polish, contentModel, words, greeting, cardFields, catRoles);

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
