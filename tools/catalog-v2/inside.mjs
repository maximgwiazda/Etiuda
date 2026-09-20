/* Is a destination inside a folder? One answer, because the converter's own copy of it was
   wrong in both directions at once and the runner is where that showed.
 *
 * WHAT WENT WRONG, board item 427. convert.mjs asked `relative(REPO, dest)` and read anything
 * not opening with ".." as inside the repository. Two holes in that one line:
 *
 *   - ANOTHER ROOT IS NOT INSIDE. On Windows `path.relative` between two drive letters cannot
 *     express the step and returns the destination ABSOLUTE - "Z:\\scratch\\shop.ec" - which
 *     does not open with "..", so the guard fired on a path that was not merely outside the
 *     tree but on another disk. On the windows-latest runner os.tmpdir() is on another drive
 *     than the checkout, so every leg of the converter that wrote to a scratch folder was
 *     refused with "refusing to write inside this repository", and the suite's `&&` chain
 *     stopped there: eight legs red and no RESULT line in the log at all.
 *   - A NAME THAT BEGINS WITH TWO DOTS IS NOT A STEP UP. `<repo>/..catalog.ec` relativises to
 *     "..catalog.ec", which opens with ".." and was therefore read as outside: measured on
 *     2026-09-20 at f4c9171, that command exited 0 and wrote a catalog INSIDE the public tree.
 *
 * The form below is the one tests/engine.js and tools/gate-run.mjs already use, with the
 * ".." test anchored to a whole segment. `flavour` is path.win32 or path.posix, so the cases
 * for either platform can be asked on either platform; unset it is this machine's own.
 */
import path from "node:path";

export function inside(parent, child, flavour) {
  const p = flavour || path;
  const rel = p.relative(p.resolve(String(parent)), p.resolve(String(child)));
  if (rel === "") return true;                 /* the folder itself */
  if (p.isAbsolute(rel)) return false;         /* another drive, or a UNC share: another root */
  return rel.split(p.sep)[0] !== "..";         /* a whole segment, so "..x" is a name and stays in */
}
