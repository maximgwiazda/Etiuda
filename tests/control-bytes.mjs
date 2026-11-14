/* NO CONTROL BYTE HIDES IN A SOURCE FILE (the test architect, 2026-11-14). A byte 0x00 to 0x08, 0x0B, 0x0C or 0x0E to 0x1F in a
 * .js, .mjs or .cjs file prints as nothing in a terminal, so a reader meets the line as written and it means something else: a
 * regex's `\b` that became a literal 0x08 made a leg skip every run and pass every read (Studio K3, found 2026-11-14). Such a byte
 * arrives through a string's escapes being turned into the bytes they name on the way into a file. Every tracked source file is read
 * as bytes; one of those bytes is red, named by path, line and column with its value. Tab, line feed and carriage return are text.
 * A character the file means is written as its escape (`\u0001`), which is the same to the code and visible to a reader.
 *
 *   cb1  the plant: a file holding one 0x08 is found, at its line and column
 *   cb2  the control: a file of text, tabs and both line ends is clean
 *   cb3  every tracked .js, .mjs and .cjs file of this tree is clean
 *
 * Node only; no window, no network. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = 3;
const SOURCE = /\.(?:js|mjs|cjs)$/i;
let asserted = 0, failed = 0;
function check(cond, line) {
  asserted++;
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stdout.write("  FAIL " + line + "\n"); }
}

/** The control bytes in `buf`: [{line, col, byte}], line and column counted from 1. */
export function controlBytes(buf) {
  const out = [];
  let line = 1, col = 1;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x0a) { line++; col = 1; continue; }
    if ((b <= 0x08 || b === 0x0b || b === 0x0c || (b >= 0x0e && b <= 0x1f))) out.push({ line, col, byte: b });
    col++;
  }
  return out;
}
const said = (rel, f) => rel + ":" + f.line + ":" + f.col + " 0x" + f.byte.toString(16).padStart(2, "0");

/* The tree's tracked source files, by git; a tree with no git walks its own folders, node_modules and dot folders left out. */
function sources() {
  try {
    const out = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return out.split("\0").filter(f => f && SOURCE.test(f));
  } catch {
    const found = [];
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const r = rel ? rel + "/" + e.name : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r);
        else if (e.isFile() && SOURCE.test(e.name)) found.push(r);
      }
    };
    walk(ROOT, "");
    return found;
  }
}

const lab = fs.mkdtempSync(path.join(os.tmpdir(), "control-bytes-"));
try {
  /* cb1 */
  const planted = path.join(lab, "planted.mjs");
  fs.writeFileSync(planted, Buffer.concat([Buffer.from("const a = 1;\nconst re = /word"), Buffer.from([0x08]), Buffer.from("/;\n")]));
  const p = controlBytes(fs.readFileSync(planted));
  check(p.length === 1 && p[0].line === 2 && p[0].col === 17 && p[0].byte === 0x08,
    "cb1 a file holding one 0x08 is found at its line and column: " + (p.map(f => said("planted.mjs", f)).join(", ") || "nothing found"));
  /* cb2 */
  const plain = path.join(lab, "plain.mjs");
  fs.writeFileSync(plain, "const a = 1;\r\n\tconst b = \"\\u0001\";\n// end\n");
  const c = controlBytes(fs.readFileSync(plain));
  check(c.length === 0, "cb2 text, a tab, both line ends and a written escape are clean: " + (c.map(f => said("plain.mjs", f)).join(", ") || "none"));
  /* cb3 */
  const files = sources();
  const hits = [], unread = [];
  for (const rel of files) {
    let buf = null;
    /* A listed file that will not read (one deleted in a worktree not yet committed) is passed over, and the line says how many. */
    try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch { unread.push(rel); continue; }
    for (const f of controlBytes(buf)) hits.push(said(rel, f));
  }
  check(files.length > 0 && hits.length === 0, "cb3 " + files.length + " tracked .js, .mjs and .cjs files hold no control byte"
    + (hits.length ? ": " + hits.slice(0, 12).join(", ") + (hits.length > 12 ? " and " + (hits.length - 12) + " more" : "") : "")
    + (unread.length ? "; " + unread.length + " listed file(s) not readable, passed over: " + unread.slice(0, 4).join(", ") : ""));
} finally {
  try { fs.rmSync(lab, { recursive: true, force: true }); } catch { /* the leg's own lab, in the temporary folder */ }
}

process.stdout.write("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED + "\n");
if (asserted !== EXPECTED) { process.stdout.write("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + "\n"); process.exit(78); }
process.stdout.write("control-bytes " + asserted + " check(s), " + failed + " failure(s)\n");
process.exit(failed ? 1 : 0);
