/* WHAT A GATE LISTED (the test architect, 2026-11-16). Loaded into every node process of an area gate through NODE_OPTIONS
   (--import), by tools/gate-run.mjs, when ETIUDA_LISTED_OUT names a file. It writes "loaded" once, and "tests <why>" the first
   time the process lists something a change under tests/ could alter:
     - a folder listing (readdir, opendir, glob, cp) of the repository's root, of tests/ or of a folder under it;
     - git asked about the index or the tree as a whole (ls-files, ls-tree, grep, diff, status, show, log, archive, stash);
     - a program this file cannot see into: a shell, find, grep, rg, ls, xargs, Electron, or node started without this preload.
   Anything else it lists (src/, a scratch folder, the real profile's sentinel) is not written. A gate whose file says "loaded"
   and nothing else, in every process it started, listed nothing under tests/; an area run resumed after a change under tests/
   alone may then carry it (planAreaResume). A file without "loaded" proves nothing, and the gate runs again.
   It prints nothing and changes no answer: every patched call returns what the original returns. */
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import wt from "node:worker_threads";

const OUT = process.env.ETIUDA_LISTED_OUT || "";
const ROOT = process.env.ETIUDA_LISTED_ROOT || "";

if (OUT && ROOT) {
  const append = fs.appendFileSync;
  const say = line => { try { append(OUT, line + "\n", "utf8"); } catch { /* the record is lost, and the gate reruns */ } };
  say("loaded " + process.pid);
  let told = false;
  const tell = why => { if (told) return; told = true; say("tests " + why); };

  const rootAbs = path.resolve(ROOT);
  const norm = p => (process.platform === "win32" ? p.toLowerCase() : p);
  const rootN = norm(rootAbs);
  /* A folder whose listing a change under tests/ could alter: the root itself (it lists tests/ among its entries, and a
     recursive listing walks into it), tests/, or any folder under tests/. */
  const touchesTests = p => {
    let abs;
    try { abs = path.resolve(p instanceof URL || /^file:/.test(String(p)) ? fileURLToPath(p) : String(p)); } catch { return true; }
    const n = norm(abs);
    if (n === rootN) return true;
    const testsN = norm(path.join(rootAbs, "tests"));
    return n === testsN || n.startsWith(testsN + path.sep);
  };
  const watch = (obj, name, pick) => {
    const orig = obj && obj[name];
    if (typeof orig !== "function") return;
    obj[name] = function (...args) {
      try { const why = pick(args); if (why) tell(why); } catch { tell(name + " (unread arguments)"); }
      return orig.apply(this, args);
    };
  };
  const dirArg = name => args => (touchesTests(args[0]) ? name + " " + String(args[0]) : "");
  for (const name of ["readdirSync", "readdir", "opendirSync", "opendir"]) watch(fs, name, dirArg(name));
  for (const name of ["readdir", "opendir"]) watch(fs.promises, name, dirArg("promises." + name));
  /* A glob's pattern is not a folder; any glob counts. */
  for (const name of ["globSync", "glob"]) watch(fs, name, () => name);
  watch(fs.promises, "glob", () => "promises.glob");
  for (const name of ["cpSync", "cp"]) watch(fs, name, dirArg(name));
  watch(fs.promises, "cp", dirArg("promises.cp"));

  const GIT_WHOLE = /^(ls-files|ls-tree|grep|diff|diff-index|diff-tree|status|show|log|archive|stash|whatchanged)$/;
  const BLIND = /^(bash|sh|zsh|dash|cmd|powershell|pwsh|find|grep|egrep|rg|ls|dir|xargs|electron)$/i;
  const base = f => path.basename(String(f || "")).replace(/\.(exe|cmd|bat)$/i, "");
  const fromShell = s => { const m = /^\s*"?([^"\s]+)"?\s*(.*)$/.exec(String(s || "")); return m ? [m[1], m[2].split(/\s+/)] : ["", []]; };
  const judge = (file, args, opts) => {
    const b = base(file);
    if (b === "git") { const sub = (args || []).find(a => !String(a).startsWith("-")); return GIT_WHOLE.test(String(sub || "")) ? "git " + sub : ""; }
    if (BLIND.test(b)) return "started " + b;
    if (file === process.execPath || b === "node") {
      const env = (opts && opts.env) || process.env;
      if (!env.ETIUDA_LISTED_OUT || !String(env.NODE_OPTIONS || "").includes("listed-preload")) return "node started without the preload";
    }
    return "";
  };
  const argsOf = a => (Array.isArray(a[1]) ? [a[1], a[2]] : [[], a[1]]);
  /* A program that is not node is not followed, so it is started without this preload: its NODE_OPTIONS and the record's two
     variables are what they would be without the harness (Electron, Chrome and git have no use for them). */
  const OWN = /\s*--import\s+"?[^"\s]*listed-preload\.mjs"?/;
  const plainEnv = env => {
    const e = Object.assign({}, env || process.env);
    const left = String(e.NODE_OPTIONS || "").replace(OWN, "").trim();
    if (left) e.NODE_OPTIONS = left; else delete e.NODE_OPTIONS;
    delete e.ETIUDA_LISTED_OUT; delete e.ETIUDA_LISTED_ROOT;
    return e;
  };
  const wrap = (name, shellAlways) => {
    const orig = cp[name];
    if (typeof orig !== "function") return;
    cp[name] = function (file, ...rest) {
      const hasArgs = Array.isArray(rest[0]);
      const args = hasArgs ? rest[0] : [];
      const optAt = hasArgs ? 1 : 0;
      const opts = rest[optAt] && typeof rest[optAt] === "object" ? rest[optAt] : null;
      const tail = rest.slice(opts ? optAt + 1 : optAt).filter(x => typeof x === "function");
      const viaShell = shellAlways || !!(opts && opts.shell);
      let isNode = false;
      try {
        const [f, more] = viaShell ? fromShell([file].concat(args).join(" ")) : [file, args];
        isNode = !viaShell && (file === process.execPath || base(file) === "node");
        /* Through a shell, one plain command is judged as itself; a pipe, a list, a redirect, a substitution or a wildcard is a shell
           program this file cannot see into. */
        const line = [file].concat(args).join(" ");
        const why = viaShell ? (/[|&;<>`$()*?\r\n%]/.test(line) ? "a shell program" : judge(f, more, opts)) : judge(f, more, opts);
        if (why) tell(why);
      } catch { tell(name + " (unread arguments)"); }
      if (isNode) return orig.call(this, file, ...rest);
      const plain = Object.assign({}, opts || {}, { env: plainEnv(opts && opts.env) });
      return shellAlways ? orig.call(this, file, plain, ...tail) : orig.call(this, file, args, plain, ...tail);
    };
  };
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync"]) wrap(name, false);
  for (const name of ["exec", "execSync"]) wrap(name, true);
  watch(cp, "fork", a => { const [, opts] = argsOf(a); const env = (opts && opts.env) || process.env;
    return env.ETIUDA_LISTED_OUT && String(env.NODE_OPTIONS || "").includes("listed-preload") ? "" : "forked without the preload"; });
  /* A worker thread's own reads are not followed here; a gate that starts one counts. */
  if (typeof wt.Worker === "function") {
    const W = wt.Worker;
    wt.Worker = class extends W { constructor(...a) { tell("worker thread"); super(...a); } };
  }
  syncBuiltinESMExports();
}
