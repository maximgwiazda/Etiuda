/* THE SELLER'S ADDRESS: ETIUDA_PACK_SELLER_ADDRESS names a private file outside every tree for one packaging command. The build then
 * reads its licence pages from a copy of buildResources in the output folder, each page's address placeholder filled from that file.
 * The tree's own pages carry no placeholder: the seller's line gives no address, so the variable set against them stops the packaging
 * with that reason. Unset or empty, electron-builder.js's config is returned as it is, the same object.
 * tests/seller-address.mjs drives every path here. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const SELLER_ADDRESS_VAR = "ETIUDA_PACK_SELLER_ADDRESS";
/* The copy of buildResources, under the output folder; nothing else is written. */
const STAGE = ".seller-pages";
/* Each page's one placeholder for the address, by the page's file name, and the file's field that fills it. */
const HOLES = Object.freeze({
  "license_en.txt": Object.freeze({ field: "en", hole: "[registered address]" }),
  "license_pl.txt": Object.freeze({ field: "pl", hole: "[adres siedziby]" }),
});
/* One line a keyboard types: letters of any script, digits, spaces and . , / ' & ( ) # : ; -. No bracket, so a filled page can never
   read as a placeholder; no control character, quote mark or dash a page could not carry. */
const LINE = /^[\p{L}\p{N} .,/'&()#:;-]{5,200}$/u; /* plant:seller-shape */

function given(env) { const v = env && env[SELLER_ADDRESS_VAR]; return typeof v === "string" ? v : ""; }

/* The file's two addresses, {en, pl}, or a throw that names no value: JSON {format: 1, en, pl} and nothing else, each one plain line
   with no space at either end. */
function addressRead(text) {
  let d = null;
  try { d = JSON.parse(String(text).replace(/^﻿/, "")); } catch { throw new Error(SELLER_ADDRESS_VAR + " names a file that is not JSON"); }
  if (!d || typeof d !== "object" || Array.isArray(d) || d.format !== 1 || Object.keys(d).sort().join() !== "en,format,pl")
    throw new Error(SELLER_ADDRESS_VAR + " names a file that is not {format: 1, en, pl}");
  for (const k of ["en", "pl"])
    if (typeof d[k] !== "string" || !LINE.test(d[k]) || d[k] !== d[k].trim())
      throw new Error(SELLER_ADDRESS_VAR + " names a file whose " + k + " address is not one plain line of 5 to 200 characters");
  return { en: d.en, pl: d.pl };
}

/* `text` with its one `hole` replaced by `value`; a page that carries the hole other than once is refused, since its wording moved. */
function fill(text, hole, value, name) {
  const n = String(text).split(hole).length - 1;
  if (n !== 1) throw new Error(SELLER_ADDRESS_VAR + ": " + name + " carries " + hole + " " + n + " times, not once"); /* plant:seller-once */
  return String(text).split(hole).join(value);
}

/* No page carrying its placeholder leaves nothing to fill: refused with that reason, not as a page whose wording moved. */
const noHole = dir => SELLER_ADDRESS_VAR + " is set, but no licence page in " + dir + " has an address to fill, since the seller's line gives none: leave it unset";

/* The copy made: buildResources `resDir` of `root` copied whole to <output>/.seller-pages/<its name>, the one folder this replaces, each
   page HOLES names filled from the file the variable names. Returns {dir, pages}. A copy inside the tree's buildResources is refused. */
const within = (outer, inner) => { const rel = path.relative(outer, inner); return !rel || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
function sellerStage(env, root, resDir, output) {
  const from = path.resolve(root, resDir), to = path.resolve(root, output, STAGE, path.basename(from));
  if (within(from, to) || within(to, from)) throw new Error(SELLER_ADDRESS_VAR + ": the copy would land inside " + resDir); /* plant:seller-inside */
  const pages = {};
  for (const name of Object.keys(HOLES)) {
    try { pages[name] = fs.readFileSync(path.join(from, name), "utf8"); } catch { throw new Error(SELLER_ADDRESS_VAR + ": " + resDir + " holds no " + name); }
  }
  if (!Object.keys(HOLES).some(n => pages[n].indexOf(HOLES[n].hole) >= 0)) throw new Error(noHole(resDir)); /* plant:seller-no-hole */
  let text = "";
  try { text = fs.readFileSync(given(env), "utf8"); } catch { throw new Error(SELLER_ADDRESS_VAR + " names no file that can be read"); }
  const address = addressRead(text);
  const filled = {};
  for (const name of Object.keys(HOLES)) filled[name] = fill(pages[name], HOLES[name].hole, address[HOLES[name].field], name);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  for (const name of Object.keys(filled)) fs.writeFileSync(path.join(to, name), filled[name], "utf8");
  return { dir: to, pages: Object.keys(filled) };
}

/* electron-builder.js's config, reading its licence pages from the filled copy where the variable is set; the same object where not. */
function sellerConfig(base, env, root, output) {
  if (!given(env)) return base; /* plant:seller-default */
  const staged = sellerStage(env, root, base.directories.buildResources, output);
  return Object.assign({}, base, { directories: Object.assign({}, base.directories, { buildResources: staged.dir }) });
}

/* Before packing: the one line saying whether the pages carry the address, never the address. */
function sellerStep(env, buildResources) {
  return "Seller address: " + (given(env) ? "filled into " + Object.keys(HOLES).join(", ") + " in " + buildResources : "none named, the licence pages carry their seller's line as written");
}

module.exports = { SELLER_ADDRESS_VAR, STAGE, HOLES, addressRead, fill, sellerStage, sellerConfig, sellerStep, given };
