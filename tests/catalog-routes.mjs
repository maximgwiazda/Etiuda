/* The routes a catalog takes into the runtime, driven rather than read.
 *
 *   node tests/catalog-routes.mjs
 *
 * WHY A SECOND FILE. tests/test.js reads the engine AS TEXT, so what it can prove about the
 * importer is that a field named in the exporter is named in the whitelist too. It cannot say
 * which catalogs actually reach that whitelist, and one did not: the sibling file at boot went
 * through catalogFromV2 alone, so the same catalog kept a reserved category key and a retired
 * hue by sitting beside Etiuda and lost them by being imported. A parity claim needs both
 * routes run over one payload and the answers compared.
 *
 * HOW IT RUNS. The modules load through node's own loader, unbundled, the way the cycle gate's
 * bite test loads them - no DOM, no browser. eCatalog() reads the sibling once and remembers,
 * which is the point of it, so each payload gets a module graph of its own through a query
 * string on the import specifier.
 *
 * THE PAYLOAD IS INVENTED. A catalog is somebody's content, so nothing here is trimmed from a
 * real one, and no check prints a value: a path is structure and a count is arithmetic.
 *
 * Exit code is the number of failed checks.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_JS = pathToFileURL(resolve(join(HERE, "..", "src", "modules", "catalog.js"))).href;
const NL = String.fromCharCode(10);

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log("  " + (ok ? "ok  " : "FAIL") + " " + name + (detail ? "  [" + detail + "]" : ""));
};

/* The reserved key the importer refuses by name, and a hue the engine stopped dealing. Both are
   the engine's own rules, held here as literals so that changing one reddens this file too. */
const RESERVED_CAT = "fav";
const RETIRED_HUE = 5;
const OFFERED_HUE = 3;

/* A small shop, invented from nothing. One shelf claims the reserved key and one carries the
   retired hue; everything else is here so that a refusal can be told from a refused catalog. */
function payload() {
  return {
    format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 1,
    name: "Lamp Shop", date: "2026-01-09",
    langs: [{ code: "en", label: "EN" }],
    tags: [
      { id: "t-op", kind: "shelf", label: { en: "Openers" }, icon: "card", hue: OFFERED_HUE },
      { id: "t-rt", kind: "shelf", label: { en: "Returns" }, hue: RETIRED_HUE },
      { id: RESERVED_CAT, kind: "shelf", label: { en: "Kept" } },
      { id: "t-a-refund", kind: "request", clause: { en: "a refund" },
        action: { en: "raised the refund" }, topic: { en: "the refund" } },
    ],
    cards: [
      { id: "c-warm", shelf: "t-op", bodyShape: "plain",
        title: { en: "Warm opening" }, body: { en: "Good day." } },
      { id: "c-steps", shelf: "t-rt", bodyShape: "steps", requests: ["t-a-refund"],
        title: { en: "Refund steps" }, body: { en: "[step]" + NL + "Ask." + NL + NL + "[step]" + NL + "Raise." } },
      { id: "c-kept", shelf: RESERVED_CAT, bodyShape: "plain",
        title: { en: "A kept card" }, body: { en: "Kept." } },
    ],
    role: ["  customer  "],
    facts: "Free returns.",
  };
}

/* A module graph of its own per payload, because the sibling is read once and remembered.
   window must exist before the first call, since that is the global a catalog file writes. */
let probes = 0;
async function bootRoute(data) {
  globalThis.window = { E_CATALOG: data };
  const m = await import(CATALOG_JS + "?probe=" + (++probes));
  const out = m.eCatalog();
  const sig = out ? m.eCatalogSignature(out) : "";
  delete globalThis.window;
  return { cat: out, sig };
}
async function fileRoute(data) {
  const m = await import(CATALOG_JS + "?probe=" + (++probes));
  const out = m.parseCatalogFile("window.E_CATALOG = " + JSON.stringify(data) + ";");
  return { cat: out, sig: m.eCatalogSignature(out) };
}

/* Paths only, never values: the two sides are a catalog's own words. Missing and present are
   two different paths, so a field one route keeps and the other drops is named either way. */
function diffPaths(a, b, path, out) {
  const ta = Array.isArray(a) ? "array" : (a === null ? "null" : typeof a);
  const tb = Array.isArray(b) ? "array" : (b === null ? "null" : typeof b);
  if (ta !== tb) { out.push(path || "(root)"); return out; }
  if (ta === "array") {
    if (a.length !== b.length) out.push(path + ".length");
    for (let i = 0; i < Math.max(a.length, b.length); i++) diffPaths(a[i], b[i], path + "[" + i + "]", out);
    return out;
  }
  if (ta === "object") {
    const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].sort();
    for (const k of keys) {
      if (!(k in (a || {})) || !(k in (b || {}))) { out.push((path ? path + "." : "") + k); continue; }
      diffPaths(a[k], b[k], (path ? path + "." : "") + k, out);
    }
    return out;
  }
  if (String(a) !== String(b)) out.push(path || "(root)");
  return out;
}

const boot = await bootRoute(payload());
const file = await fileRoute(payload());

console.log("catalog routes: the sibling at boot against a picked file, one invented payload");

check("1 the boot route hands back a catalog, every card of it",
  !!boot.cat && (boot.cat.cards || []).length === payload().cards.length,
  "cards " + ((boot.cat && boot.cat.cards) || []).length + " of " + payload().cards.length
  + "; what a reserved key costs is the key, never a card");

check("2 and refuses the reserved category key by name, as a picked file is refused",
  !!boot.cat && !Object.prototype.hasOwnProperty.call(boot.cat.categories || {}, RESERVED_CAT),
  RESERVED_CAT + " in categories: " + (!!boot.cat && RESERVED_CAT in (boot.cat.categories || {})));

check("3 control: the shelves that are not reserved come through, so 2 is not a refused catalog",
  !!boot.cat && Object.keys(boot.cat.categories || {}).sort().join(",") === "t-op,t-rt",
  Object.keys((boot.cat || {}).categories || {}).sort().join(","));

check("4 a hue the engine no longer deals is dropped, and an offered one is kept",
  !!boot.cat && (boot.cat.colors || {})["t-rt"] === undefined
  && (boot.cat.colors || {})["t-op"] === OFFERED_HUE,
  "colors has " + Object.keys((boot.cat || {}).colors || {}).sort().join(","));

check("5 a role entry arrives trimmed, the way the importer trims it",
  !!boot.cat && JSON.stringify(boot.cat.who || []) === JSON.stringify(["customer"]),
  "who[0] length " + String(((boot.cat || {}).who || [""])[0]).length);

const d = diffPaths(boot.cat, file.cat, "", []);
check("6 THE POINT: the two routes end at the same catalog, field for field",
  d.length === 0, d.slice(0, 6).join(" ") || "no differing path");

check("7 and at the same signature, which is what the offer dialog compares",
  !!boot.sig && boot.sig === file.sig, boot.sig === file.sig ? "equal" : "differ");

/* The canary. A comparison that cannot report a difference reports nothing when it is green,
   so one payload is bent on one side only and check 6's walker must name the path. */
const bentData = payload();
bentData.tags[0].label.en = bentData.tags[0].label.en + " x";
const bent = await fileRoute(bentData);
const dd = diffPaths(boot.cat, bent.cat, "", []);
check("8 canary: a shelf label changed on one side is named as a path",
  dd.some(p => p === "categories.t-op"), dd.slice(0, 6).join(" ") || "nothing named");
check("9 canary: and the signature parts too, or an edited sibling is never offered",
  boot.sig !== bent.sig, boot.sig === bent.sig ? "equal" : "differ");

console.log("  " + pass + "/" + (pass + fail) + " checks passed" + (fail ? "  - " + fail + " FAILED" : ""));
process.exitCode = fail;
