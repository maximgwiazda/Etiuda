/* No HTML form of Etiuda 2: the page the desk serves is the only form there is, so nothing in this tree loads a catalog as a
 * script beside the page, names that file, or documents a browser build that does (Max, 2026-11-20: "There definitely going
 * to be no html Etiuda ... If there is any mention of HTML file Etiuda, either in catalog files or anywhere else, it needs
 * to be purged."). The desk's own way to hand the page a catalog, window.E_CATALOG set by the preload, is the one place a
 * catalog meets the page and stays.
 *
 *   node tests/no-html-form.mjs
 *
 * Each check scans a set of files, and each has a control: the same scan over a copy with the retired thing put back goes
 * red on that check and on no other. Nothing is written.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const modules = fs.readdirSync(path.join(ROOT, "src", "modules")).filter((f) => f.endsWith(".js")).sort();

const read = () => ({
  template: rd("src", "template.html"),
  built: rd("engine", "etiuda.html"),
  shell: rd("shell", "main.js"),
  reset: rd("shell", "desk-reset.cjs"),
  modules: modules.map((f) => rd("src", "modules", f)).join("\n"),
  readme: rd("README.md"),
  pkg: rd("package.json"),
  convert: rd("tools", "catalog-v2", "convert.mjs"),
  convertReadme: rd("tools", "catalog-v2", "README.md"),
  gatesFor: rd("tools", "gates-for.mjs"),
});

const SIBLING_FILE = "etiuda-catalog.js";
const SCRIPT_BY_ADDRESS = /<script[^>]*\ssrc\s*=/i;

/* The checks, each answering whether the retired thing is gone. */
const CHECKS = [
  ["nh1", "the template and the built page load no script by address, so no file beside the page is ever run",
    (f) => !SCRIPT_BY_ADDRESS.test(f.template) && !SCRIPT_BY_ADDRESS.test(f.built)],
  ["nh2", "the shell names no neighbouring catalog script and strips no sibling tag from the page it serves",
    (f) => !f.shell.includes(SIBLING_FILE) && !/SIBLING_TAGS|CATALOG_SCRIPT/.test(f.shell)],
  ["nh3", "a desk reset owns no etiuda-catalog.js, since no desk ever read or wrote one",
    (f) => !f.reset.includes(SIBLING_FILE)],
  ["nh4", "no module names the neighbouring file or the constant that carried its name, and the built page carries neither",
    (f) => !f.modules.includes(SIBLING_FILE) && !f.modules.includes("E_CATALOG_SCRIPT") && !f.built.includes(SIBLING_FILE) && !f.built.includes("E_CATALOG_SCRIPT")],
  ["nh5", "the page's own header says nothing of a catalog file placed beside it",
    (f) => !/placed beside it|beside this page/.test(f.template) && !/placed beside it|beside this page/.test(f.built) && !f.modules.includes("beside this page")],
  ["nh6", "the README and the package description speak of no single-file build and no sibling script",
    (f) => !/single-file/i.test(f.readme) && !/sibling script/i.test(f.readme) && !f.readme.includes(SIBLING_FILE) && !/single-file/i.test(f.pkg)],
  ["nh7", "the converter writes no script form of a catalog for a page on file://, and its notes describe none",
    (f) => !/--js|args\.js\b/.test(f.convert) && !f.convert.includes(SIBLING_FILE) && !/--js|file:\/\//.test(f.convertReadme)],
  ["nh8", "the gate map counts no root etiuda-catalog.js as a product file",
    (f) => !f.gatesFor.includes('f === "' + SIBLING_FILE + '"')],
];

let checks = 0, failed = 0;
function check(ok, what) {
  checks++;
  if (ok) console.log("  ok   " + what);
  else { failed++; console.log("  FAIL " + what); }
}
const redOf = (f) => CHECKS.filter(([, , test]) => !test(f)).map(([id]) => id);

const now = read();
for (const [id, what, test] of CHECKS) check(test(now), id + " " + what);

/* The controls: each retired thing put back into a copy of the scan's input, the right check red and no other. */
const PLANTS = [
  ["nh1", (f) => ({ ...f, template: f.template + '\n<script src="' + SIBLING_FILE + '"></script>\n' })],
  ["nh2", (f) => ({ ...f, shell: f.shell + "\nconst SIBLING_TAGS = ['<script src=\"" + SIBLING_FILE + "\"></script>'];\n" })],
  ["nh3", (f) => ({ ...f, reset: f.reset + '\nconst OWNED = ["' + SIBLING_FILE + '"];\n' })],
  ["nh4", (f) => ({ ...f, modules: f.modules + '\nconst E_CATALOG_SCRIPT="' + SIBLING_FILE + '";\n' })],
  ["nh5", (f) => ({ ...f, template: f.template + "\n<!-- a catalog file named x placed beside it -->\n" })],
  ["nh6", (f) => ({ ...f, readme: f.readme + "\nThe single-file build that runs in a browser is unchanged.\n" })],
  ["nh7", (f) => ({ ...f, convert: f.convert + "\n// [--js <name.js>]\n" })],
  ["nh8", (f) => ({ ...f, gatesFor: f.gatesFor + '\nconst x = f === "' + SIBLING_FILE + '";\n' })],
];
if (PLANTS_OFF) console.log("  NOT RUN nh9, the plant proofs (ETIUDA_PLANTS=off)");
else {
  const alone = PLANTS.map(([id, plant]) => [id, redOf(plant(now)).join()]);
  const wrong = alone.filter(([id, red]) => red !== id);
  check(wrong.length === 0, "nh9 control: putting each retired thing back turns its own check red and no other: "
    + alone.map(([id, red]) => id + "=>" + (red || "green")).join(" "));
}

console.log("\n#counts checks=" + checks + " failures=" + failed);
process.exit(failed ? 1 : 0);
