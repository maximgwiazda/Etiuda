/* The module tree's entry, and the bridge to what is not extracted yet.
   src/monolith.js is still one classic script sharing the artifact's global scope, and it binds
   these names by name. A top-level function or const in a classic script is already a property
   of the global object, so handing them over this way gives the monolith the binding kind those
   names had. A line goes with every module; the file goes when the monolith does. */
import * as icons from "./modules/icons.js";
import * as stock from "./modules/stock.js";
import * as polish from "./modules/polish.js";
import * as contentModel from "./modules/content-model.js";
Object.assign(globalThis, icons, stock, polish, contentModel);

/* Five names are replaced wholesale when a catalog is adopted, so the monolith has to read the
   binding rather than the copy taken above, before any catalog existed. */
Object.defineProperty(globalThis, "CAT_ICONS_CATALOG", { get: () => icons.CAT_ICONS_CATALOG });
Object.defineProperty(globalThis, "CAT_COLORS_CATALOG", { get: () => icons.CAT_COLORS_CATALOG });
Object.defineProperty(globalThis, "CAT_LABELS_PL", { get: () => icons.CAT_LABELS_PL });
Object.defineProperty(globalThis, "FACTS", { get: () => stock.FACTS });
Object.defineProperty(globalThis, "WHO_BASE", { get: () => stock.WHO_BASE });
