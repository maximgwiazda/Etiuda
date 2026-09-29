/* WHAT A PACKAGED PROGRAM'S FUSES SAY, against what electron-builder.js asks for.
 *
 *     node tools/fuses.mjs <path to Etiuda.exe>
 *
 * tests/test.js [2f/5] holds the ask, and this reads the answer back out of the binary, so a
 * program whose wire disagrees is refused by tools/package.mjs rather than shipped: one whose
 * fuses were never flipped installs and runs exactly like one whose fuses were. Exit 0 when
 * every fuse asked for is as asked, 1 with one line per difference, 2 when the file cannot be
 * read or carries no wire. */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** The fuses electron-builder.js asks for, by electron-builder's own names. */
export function wantedFuses() {
  return Object.assign({}, require("../electron-builder.js").electronFuses || {});
}

/** One line per fuse in `want` that the binary at `exe` does not carry as asked; [] when all do.
 *  Throws where the file carries no fuse wire at all. */
export async function fuseProblems(exe, want) {
  const { getCurrentFuseWire, FuseV1Options } = require("@electron/fuses");
  const wire = await getCurrentFuseWire(exe);
  const out = [];
  for (const [name, on] of Object.entries(want)) {
    const at = FuseV1Options[name.charAt(0).toUpperCase() + name.slice(1)];
    if (at === undefined) { out.push(name + " is not a fuse @electron/fuses knows"); continue; }
    const is = wire[at] === 49 ? true : wire[at] === 48 ? false : null;
    if (is !== on) out.push(name + " is " + (is === null ? "not in the wire" : is ? "on" : "off")
      + " where electron-builder.js asks for it " + (on ? "on" : "off"));
  }
  return out;
}

/** The packaging step's question of the program it has just written into `dist`. A program that
 *  is not there or cannot be read, and an ask of no fuses, are reasons to refuse and never a pass. */
export async function packagedFuseProblems(dist, want) {
  const ask = want || wantedFuses();
  if (!Object.keys(ask).length) return ["electron-builder.js asks for no fuse, so there is nothing to read the program against"];
  const exe = join(dist, "win-unpacked", "Etiuda.exe");
  if (!existsSync(exe)) return [exe + " is not there, so no fuse was read from it"];
  try { return await fuseProblems(exe, ask); }
  catch (e) { return [exe + ": " + ((e && e.message) || e)]; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const exe = process.argv[2];
  const want = wantedFuses();
  (Object.keys(want).length ? fuseProblems(exe, want) : Promise.resolve(["electron-builder.js asks for no fuse"])).then(bad => {
    for (const line of bad) console.error("fuses: " + exe + ": " + line);
    if (!bad.length) console.log("fuses: " + exe + " carries all " + Object.keys(want).length + " as asked");
    process.exit(bad.length ? 1 : 0);
  }, e => { console.error("fuses: " + exe + ": " + ((e && e.message) || e)); process.exit(2); });
}
