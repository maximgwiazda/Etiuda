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
const MOD = n => pathToFileURL(resolve(join(HERE, "..", "src", "modules", n))).href;
const CATALOG_JS = MOD("catalog.js");
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

/* Identity, which is the second thing a route decides. A format 2 card always arrives with an
   id, so the engine's one minting fires for a catalog carried over from a 1.16.7 desk - and
   that desk keyed its stars, hides and card order by a string pack.js derives. The two
   derivations are held side by side here because a desk loses all three if they ever part. */
const mj = await import(MOD("macros-json.js") + "?probe=" + (++probes));
const pk = await import(MOD("pack.js") + "?probe=" + (++probes));
const idless = { c: "t-op", t: "A card with no id of its own", en: "Body." };
const minted = mj.parseMacrosData({ cards: [idless] })[0].id;

check("10 the engine's one minting agrees with what a carried desk keyed its layers by",
  !!minted && minted === pk.catalogCardId(idless), "two derivations, compared");

check("11 control: an id already on the card is kept by both, never minted again",
  mj.parseMacrosData({ cards: [Object.assign({}, idless, { id: "c-kept" })] })[0].id === "c-kept"
  && pk.catalogCardId({ id: "c-kept", c: "t-op", t: "Retitled since" }) === "c-kept",
  "kept on both sides");

check("12 and two cards with one title are two cards, not one",
  (() => {
    const two = mj.parseMacrosData({ cards: [idless, Object.assign({}, idless, { en: "Other body." })] });
    return two.length === 2 && two[0].id !== two[1].id;
  })(), "distinct ids from one title");

/* THE FORMAT PASS (board 834). Every new field, and one unknown field on a card and one in the header,
   put through both routes into the runtime and back out through the writer. The whitelist is the
   reader that dropped them before this, so the proof is the answer of the real modules. */
const V2 = await import(MOD("catalog-v2.js") + "?probe=" + (++probes));
const HEX = c => c.repeat(64);
// Sorted keys, because the order of a JSON object is no part of a catalog.
const canon = v => (v === null || typeof v !== "object") ? JSON.stringify(v)
  : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
function richPayload() {
  const p = payload();
  p.cards = p.cards.filter(c => c.id !== RESERVED_CAT);
  Object.assign(p.cards[0], { retired: true, commits: true, next: [{ to: "c-steps", label: "later" }],
    futureCard: { a: [1, { b: 2 }] } });
  Object.assign(p, { notes: { en: "A note." }, grew: { id: "lamp-shop", rev: 1, sha: "sha256:" + HEX("a") },
    desk: { id: "k-0123456789abcdef", name: "Ala", key: HEX("b"), box: HEX("c") }, futureHeader: { kept: true } });
  return p;
}
const richBoot = await bootRoute(richPayload());
const richFile = await fileRoute(richPayload());
const richNow = richPayload();
const wanted = [richNow.cards[0], richNow.cards[1], richNow.notes, richNow.grew, richNow.desk, richNow.futureHeader]
  .map(canon);
const written = r => {
  // Through JSON first, as the stored copy goes, then out through the writer the export uses.
  const out = V2.catalogToV2(JSON.parse(JSON.stringify(r.cat)));
  return [out.cards[0], out.cards[1], out.notes, out.grew, out.desk, out.futureHeader].map(canon);
};
check("13 a catalog holding every new field and an unknown one on a card and in the header is read by the boot route and written back as it was",
  JSON.stringify(written(richBoot)) === JSON.stringify(wanted),
  "six values compared by canonical form, the card the file holds first");
check("14 and by the picked-file route, which is the whitelist an Import goes through",
  JSON.stringify(written(richFile)) === JSON.stringify(wanted), "the same six");
check("15 and the two routes still end at the same catalog, the new fields included",
  diffPaths(richBoot.cat, richFile.cat, "", []).length === 0 && richBoot.sig === richFile.sig,
  diffPaths(richBoot.cat, richFile.cat, "", []).slice(0, 4).join(" ") || "equal");
check("16 a change to the new fields alone is a different catalog to the offer dialog, as a reworded card is",
  richBoot.sig !== boot.sig, "signature of the rich payload against the plain one");
const richBent = richPayload(); richBent.cards[0].next = [{ to: "c-steps" }, { to: "c-steps" }];
let refused = "";
try { await fileRoute(richBent); } catch (e) { refused = String(e.message); }
check("17 a chain naming a card twice is refused at the door, naming the card",
  refused.startsWith("card c-warm: next[1] names c-steps a second time"), refused.slice(0, 70) || "accepted");
check("18 control: the plain payload carries none of the new keys through either route, on the header or on a card",
  ["notes", "grew", "desk", "ext"].every(k => !(k in boot.cat) && !(k in file.cat))
  && boot.cat.cards.every(c => !["retired", "commits", "next", "ext"].some(k => k in c)),
  "none of notes, grew, desk, ext; no card holds retired, commits, next or ext");

/* THE ROUTE OUT, driven for real. exportCatalog() runs end to end in bare node: the document is a
   stand-in that answers every question with another stand-in, the hooks are empty, and the save
   dialog is a function handing back a writer that keeps the text. What is asserted is the file
   that would have been written, from a catalog loaded by the real reader and stored as the desk
   stores it. This is where currentCatalog() is CALLED; its fields are otherwise read as text. */
{
  const fake = () => new Proxy(function () {}, {
    get: (t, k) => k === Symbol.toPrimitive ? () => "" : (k === "length" ? 0
      : (["contains", "matches", "hasAttribute"].includes(k) ? () => false : fake())),
    apply: () => fake(), set: () => true, has: () => true });
  let written = null;
  globalThis.window = { innerWidth: 1280, innerHeight: 800,
    showSaveFilePicker: async () => ({ name: "out.ec", createWritable: async () => ({
      write: async t => { written = t; }, close: async () => {} }) }) };
  globalThis.innerHeight = 800;
  globalThis.getComputedStyle = () => fake();
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.document = new Proxy({}, { get: (t, k) => (k === "readyState" ? "complete" : fake()), set: () => true });
  const HK = await import(MOD("hooks.js"));
  ["rebuildCards", "render", "syncIntentOrder", "drawIntentRail", "syncFavouritesMeta", "syncSampleMark",
   "drawPillsCore", "drawTabsCore"].forEach(k => { HK.hooks[k] = () => {}; });
  const CT = await import(MOD("catalog.js"));
  const ST = await import(MOD("storage.js"));
  const PK = await import(MOD("pack.js"));
  const AP = await import(MOD("app-state.js"));
  const DM = await import(MOD("dom.js")); DM.grabDom();
  const CF = await import(MOD("catalog-file.js"));
  const V2R = await import(MOD("catalog-v2.js"));

  /* A file loaded as the desk loads one, kept as the desk keeps it, applied, and exported. */
  async function exportOf(doc, removed) {
    const cat = CT.parseCatalogFile(JSON.stringify(doc));
    ST.lsSet(CT.E_CATALOG_STORE, JSON.stringify(cat), true);
    CT.eApplyCatalog(cat);
    PK.resetPack();
    PK.pack.baseCards = JSON.parse(JSON.stringify(cat.cards));
    if (removed) PK.pack.removed = removed.slice();
    AP.setCards(cat.cards.slice());
    written = null;
    await CF.exportCatalog();
    return written === null ? null : JSON.parse(written);
  }
  const doc = () => ({
    format: 2, kind: "etiuda-catalog", id: "lamp-shop", rev: 4, langs: [{ code: "en", label: "EN" }],
    tags: [{ id: "t-op", kind: "shelf", label: { en: "Openers" } }],
    cards: [
      { id: "c-a", shelf: "t-op", bodyShape: "plain", title: { en: "A" }, body: { en: "A body." } },
      { id: "c-b", shelf: "t-op", bodyShape: "plain", title: { en: "B" }, body: { en: "B body." } },
      { id: "c-c", shelf: "t-op", bodyShape: "plain", title: { en: "C" }, body: { en: "C body." } }]
  });
  const rich = () => {
    const d = doc();
    Object.assign(d.cards[0], { commits: true, retired: true, next: [{ to: "c-b" }, { to: "c-c", label: "x" }],
      futureCard: { a: [1, { b: 2 }] } });
    Object.assign(d, { notes: { en: "A note." }, grew: { id: "lamp-shop", rev: 3, sha: "sha256:" + HEX("a") },
      desk: { id: "k-0123456789abcdef", name: "Ala", key: HEX("b"), box: HEX("c") }, futureHeader: { kept: true } });
    return d;
  };
  const sent = await exportOf(rich());
  check("19 the export of a catalog holding every new field carries the card's fields, the notes and the unknown header field as they came",
    !!sent && canon([sent.cards[0], sent.notes, sent.futureHeader])
      === canon([rich().cards[0], rich().notes, rich().futureHeader]),
    sent ? "card, notes and the unknown field compared by canonical form" : "nothing was written");
  check("20 and it is a NEW catalog: a new id, the first edition, and neither grew nor desk, which describe the file it came from",
    !!sent && sent.id !== "lamp-shop" && sent.rev === 1 && !("grew" in sent) && !("desk" in sent),
    sent ? "id " + (sent.id === "lamp-shop" ? "kept" : "new") + ", rev " + sent.rev + ", grew " + ("grew" in sent) + ", desk " + ("desk" in sent) : "nothing");
  check("21 and it reads back clean, the writer and the validator being one contract",
    !!sent && V2R.v2Problems(sent).length === 0,
    sent ? V2R.v2Problems(sent).slice(0, 2).join(" | ") || "no problems" : "nothing");
  const trimmed = await exportOf(rich(), ["c-b"]);
  check("22 a card removed at this desk takes its link with it, so the file still reads clean",
    !!trimmed && canon(trimmed.cards[0].next) === canon([{ to: "c-c", label: "x" }]) && V2R.v2Problems(trimmed).length === 0,
    trimmed ? "next is " + JSON.stringify(trimmed.cards[0].next) : "nothing");
  const bare = await exportOf(doc());
  const NEW = ["notes", "grew", "desk", "ext", "futureHeader"], CARDNEW = ["retired", "commits", "next", "ext", "futureCard"];
  check("23 control: a catalog holding none of them exports none of them, on the header or on a card",
    !!bare && NEW.every(k => !(k in bare)) && bare.cards.every(c => CARDNEW.every(k => !(k in c))),
    bare ? "header keys: " + Object.keys(bare).join(",") : "nothing");
  check("24 and every card of it keeps the keys it always had, in the order it always had them",
    !!bare && bare.cards.every(c => Object.keys(c).join(",") === "id,shelf,title,body,bodyShape"),
    bare ? Object.keys(bare.cards[0]).join(",") : "nothing");
  /* A RETIRED CARD CARRIED ASLEEP (C07, choice 4a). Three editions put down one after another over one
     layer, through the real carry and the real rebuild: the card starred, edited and copied five times,
     then retired, then back. What the list holds, what the layer keeps and what an export writes. */
  const FV = await import(MOD("favourites.js"));
  const CC = await import(MOD("card-carry.js"));
  const RB = await import(MOD("rebuild.js"));
  const CMD = await import(MOD("card-model.js"));
  HK.hooks.syncFavouritesMeta = FV.syncFavouritesMeta;
  const edition = (retire, drop) => {
    const d = doc();
    (retire || []).forEach(id => { d.cards.find(c => c.id === id).retired = true; });
    d.cards = d.cards.filter(c => (drop || []).indexOf(c.id) < 0);
    return d;
  };
  const land = d => {
    const cat = CT.parseCatalogFile(JSON.stringify(d));
    CC.carryCardLayer(cat);
    ST.lsSet(CT.E_CATALOG_STORE, JSON.stringify(cat), true);
    CT.eApplyCatalog(cat);
    PK.pack.baseCards = null;   // as takeCatalog leaves it: BASE_M comes from the stock route
    RB.rebuildCards();
  };
  const fresh = () => {
    PK.resetPack(); land(edition());
    Object.assign(PK.pack, { favourites: ["c-b", "c-c"], overrides: { "c-b": { en: "my edit" } }, useCounts: { "c-b": 5, "c-c": 2 } });
    RB.rebuildCards();
  };
  const listed = () => AP.cards.map(c => c.id).join(",");
  const layer = () => JSON.stringify([PK.pack.favourites, PK.pack.overrides, PK.pack.useCounts, PK.pack.custom.length]);
  const LAYER = JSON.stringify([["c-b", "c-c"], { "c-b": { en: "my edit" } }, { "c-b": 5, "c-c": 2 }, 0]);
  const bodyOf = id => ((AP.cards.find(c => c.id === id) || {}).en);
  fresh();
  const before = listed() + "|" + bodyOf("c-b");
  land(edition(["c-b"]));
  check("25 an edition that retires a card leaves it in no list and out of every lookup by id",
    before === "c-a,c-b,c-c|my edit" && listed() === "c-a,c-c" && CMD.findCard("c-b") === null,
    "list before " + before + ", after " + listed() + ", findCard " + String(CMD.findCard("c-b")));
  check("26 and its star, its edit and its count are exactly as they were, with no own card made for the edit",
    layer() === LAYER, layer());
  land(edition());
  check("27 the edition after it, with the flag gone, returns the card whole: listed, starred, edited, counted five times",
    listed() === "c-a,c-b,c-c" && bodyOf("c-b") === "my edit" && layer() === LAYER && PK.pack.useCounts["c-b"] === 5,
    listed() + " | " + bodyOf("c-b") + " | " + layer());
  fresh(); land(edition(["c-b"]));
  const asleep = await (async () => { written = null; await CF.exportCatalog(); return written === null ? null : JSON.parse(written); })();
  check("28 a desk's export carries the retired card, flagged, with the desk's edit, where the edition had it",
    !!asleep && asleep.cards.map(c => c.id).join(",") === "c-a,c-b,c-c" && asleep.cards[1].retired === true
    && asleep.cards[1].body.en === "my edit" && !("retired" in asleep.cards[0]) && V2R.v2Problems(asleep).length === 0,
    asleep ? asleep.cards.map(c => c.id + (c.retired ? "*" : "")).join(",") : "nothing");
  fresh(); land(edition(["c-a", "c-c"]));
  const ends = await (async () => { written = null; await CF.exportCatalog(); return written === null ? null : JSON.parse(written); })();
  check("29 and a card retired at the head or the foot of the edition is written at the head or the foot",
    !!ends && ends.cards.map(c => c.id + (c.retired ? "*" : "")).join(",") === "c-a*,c-b,c-c*",
    ends ? ends.cards.map(c => c.id + (c.retired ? "*" : "")).join(",") : "nothing");
  fresh(); PK.pack.removed = ["c-b"]; land(edition(["c-b"]));
  const gone = await (async () => { written = null; await CF.exportCatalog(); return written === null ? null : JSON.parse(written); })();
  check("30 a card this desk had removed, which the edition then retires, stays removed: out of the export as it was",
    !!gone && gone.cards.map(c => c.id).join(",") === "c-a,c-c",
    gone ? gone.cards.map(c => c.id).join(",") : "nothing");
  fresh(); land(edition([], ["c-c"]));
  check("31 control: an edition that drops the card instead, unedited, takes its star and its count, as it always did",
    listed() === "c-a,c-b" && PK.pack.favourites.join(",") === "c-b" && !("c-c" in PK.pack.useCounts),
    listed() + " | " + PK.pack.favourites.join(",") + " | " + JSON.stringify(PK.pack.useCounts));
  fresh();
  const plain = await (async () => { written = null; await CF.exportCatalog(); return written === null ? null : JSON.parse(written); })();
  check("32 control: with nothing retired the export is the cards the list holds, in its order, none flagged",
    !!plain && plain.cards.map(c => c.id).join(",") === "c-a,c-b,c-c" && plain.cards.every(c => !("retired" in c)),
    plain ? plain.cards.map(c => c.id).join(",") : "nothing");
  /* ITS PLACE IN THE AGENT'S OWN ORDER waits for it too: the order c, b, a through a retirement of b and the
     edition that restores it. A retired card holds a place in the order and no row in the list. */
  const OC = await import(MOD("card-order.js"));
  const orderNow = () => { OC.ensureCardOrder(); return PK.pack.cardOrder.join(","); };
  const arrange = () => { fresh(); PK.pack.cardOrder = ["c-c", "c-b", "c-a"]; OC.cardOrderTouched(); };
  arrange(); land(edition(["c-b"]));
  const asleepOrder = orderNow();
  land(edition());
  const backOrder = orderNow();
  check("33 an agent's order c, b, a keeps the retired card's place, and the edition that restores it finds it between c and a",
    asleepOrder === "c-c,c-b,c-a" && backOrder === "c-c,c-b,c-a", "while asleep " + asleepOrder + ", restored " + backOrder);
  arrange(); land(edition(["c-b"]));
  const arranged = await (async () => { written = null; await CF.exportCatalog(); return written === null ? null : JSON.parse(written); })();
  check("34 and an export of the arranged catalog writes it there, flagged, between c and a",
    !!arranged && arranged.cards.map(c => c.id + (c.retired ? "*" : "")).join(",") === "c-c,c-b*,c-a",
    arranged ? arranged.cards.map(c => c.id + (c.retired ? "*" : "")).join(",") : "nothing");
  fresh();
  const base0 = OC.cardOrderIsBase();
  land(edition(["c-b"])); const base1 = OC.cardOrderIsBase();
  land(edition()); const base2 = OC.cardOrderIsBase();
  check("35 control: an agent who never arranged still reads the order as the catalog's through the retire and the restore",
    base0 && base1 && base2, [base0, base1, base2].join(", "));
  arrange(); land(edition(["c-b"]));
  const arrangedBase = OC.cardOrderIsBase();
  check("36 control: an agent who did arrange does not, so 35 is not an answer that is always true",
    arrangedBase === false, String(arrangedBase));
  fresh(); PK.pack.hidden = ["c-b"]; land(edition(["c-b"]));
  const hidden = await (async () => { written = null; await CF.exportCatalog(); return written === null ? null : JSON.parse(written); })();
  check("37 a retired card the agent had hidden is still carried, flagged, and its hide is still held",
    !!hidden && hidden.cards.map(c => c.id + (c.retired ? "*" : "")).join(",") === "c-a,c-b*,c-c" && PK.pack.hidden.join(",") === "c-b",
    hidden ? hidden.cards.map(c => c.id + (c.retired ? "*" : "")).join(",") + " | " + PK.pack.hidden.join(",") : "nothing");
  HK.hooks.syncFavouritesMeta = () => {};
  // The toast's own timer fires after the check, against the stand-in, and is let run its course.
  await new Promise(r => setTimeout(r, 2000));
  delete globalThis.document; delete globalThis.window; delete globalThis.innerHeight; delete globalThis.getComputedStyle;
}

console.log("  " + pass + "/" + (pass + fail) + " checks passed" + (fail ? "  - " + fail + " FAILED" : ""));
/* CAPPED AT 63, ballot 4 of the fourth meeting (2026-09-23): an exit code is read modulo 256 by
   bash and by Linux, so a count used as one read 256 failures as success. 63 keeps a small count
   readable and stays below 78, which is NO VERDICT here. */
process.exitCode = Math.min(fail, 63);
