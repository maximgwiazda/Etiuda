/* Every file shell/main.js requires through path.join(__dirname, ...) is on tools/release.mjs's
   expected list, including a require that waits until the first caller. A planted main that names
   a file the list lacks exits 1 and names that file. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

export function requiresAtLoad(mainSrc) {
  const found = [];
  const re = /require\(\s*path\.join\(\s*__dirname\s*,([\s\S]*?)\)\s*\)/g;
  let m;
  while ((m = re.exec(String(mainSrc)))) {
    const parts = [];
    const argRe = /(['"])([^'"\\]*)\1/g;
    let a;
    while ((a = argRe.exec(m[1]))) parts.push(a[2]);
    if (!parts.length) continue;
    found.push(["shell"].concat(parts).join("/"));
  }
  return found;
}

export function expectedList(releaseSrc) {
  const block = /const expected = \[([\s\S]*?)\];/.exec(String(releaseSrc));
  if (!block) return [];
  return [...block[1].matchAll(/'([^']+)'/g)].map(hit => hit[1]);
}

export function missingFromRelease(mainSrc, releaseSrc) {
  const expected = new Set(expectedList(releaseSrc));
  return requiresAtLoad(mainSrc).filter(rel => !expected.has(rel));
}

if (process.env.SHELL_SHIPPED_PLANT === "1") {
  const missing = missingFromRelease(
    "require(path.join(__dirname, \"not-shipped.cjs\"));\n",
    "const expected = ['shell/main.js'];\n"
  );
  if (missing.length === 1 && missing[0] === "shell/not-shipped.cjs") {
    console.log("SHELL SHIPPED LACKS " + missing[0]);
    process.exit(1);
  }
  console.log("plant did not name the missing file: " + missing.join(", "));
  process.exit(2);
}

const mainSrc = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const releaseSrc = fs.readFileSync(path.join(ROOT, "tools", "release.mjs"), "utf8");
const missing = missingFromRelease(mainSrc, releaseSrc);
const plant = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
  encoding: "utf8",
  env: Object.assign({}, process.env, { SHELL_SHIPPED_PLANT: "1" }),
});
let failed = 0;
function check(cond, line) {
  if (cond) process.stdout.write("  ok   " + line + "\n");
  else { failed++; process.stderr.write("  FAIL " + line + "\n"); }
}
const plantOut = String(plant.stdout || "") + String(plant.stderr || "");
check(plant.status === 1 && plantOut.indexOf("shell/not-shipped.cjs") >= 0,
  "a main that requires shell/not-shipped.cjs exits 1 and names it when the release list lacks it: exit "
  + plant.status + " " + plantOut.trim());
check(missing.length === 0,
  "every file shell/main.js requires at load is in tools/release.mjs expected: " + (missing.join(", ") || "none missing"));
process.stdout.write("shell-shipped: " + (failed ? failed + " failure(s)" : "ok") + "\n");
process.exit(failed ? 1 : 0);
