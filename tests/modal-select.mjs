/* A dialog's and a bubble's words do not select like a page's. The rule lives in the template,
 * and the built page carries the same text. tests/build-fresh.mjs goes red on a deleted rule
 * only by rebuilding and comparing the whole page, so a named read is the cheap tooth.
 *
 *   node tests/modal-select.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 3;
let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
/* Comments out first, then every space, so a comment that names the rule is not the rule
   and a space in the selector does not hide it. */
function bare(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, ""); }
const RULE = ".modal,.bub{user-select:none;-webkit-user-select:none}";
const BACK = bare(".modal :is(input,textarea,select,[contenteditable=\"true\"],.mono,code),.bub :is(input,textarea,.mono,code){user-select:text;-webkit-user-select:text}");
const hasRule = (src) => bare(src).indexOf(RULE) >= 0;
const hasBack = (src) => bare(src).indexOf(BACK) >= 0;
const template = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
const built = fs.readFileSync(path.join(ROOT, "engine", "etiuda.html"), "utf8");
const commented = "/* " + RULE + " */\n.modal,.bub{color:red}";
check(hasRule(template) && hasBack(template),
  "1a the template names .modal,.bub as user-select none, and a field or a path inside one still selects");
check(hasRule(built) && hasBack(built),
  "1b the built page names the same rule, so a hand edit of it is red without a rebuild");
check(!hasRule(commented) && hasRule("\n" + RULE + "\n"),
  "1c a comment that names the rule is not the rule");
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted !== EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
