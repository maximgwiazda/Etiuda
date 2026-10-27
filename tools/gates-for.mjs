/* THE GATES THAT READ A FILE.
 *
 *     node tools/gates-for.mjs <file>...
 *     node tools/gates-for.mjs
 *
 * With files, each path is relative to this tree (or absolute inside it). With none, the files
 * are the change against main: commits on this branch (main...HEAD), the index, the working
 * tree, and untracked files git does not ignore.
 *
 * A gate is a `node <file>` step of a package.json script. For each changed file the tool names
 * every gate whose verdict could change because the gate imports that file, requires it, or
 * reads it as text, directly or through a module it loads. It says how to run the gate and
 * whether the gate's own source calls the window wall (node or window). The last line is JSON.
 *
 * Node builtins only. The root is the parent of the tools/ directory this file lives in, so the
 * same file reads the Studio tree and the engine tree.
 *
 * A file a bash script sources is not followed.
 * A gate's window kind is read from its own source only.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const EXT_OK = new Set([".mjs", ".js", ".cjs", ".json", ".html", ".css", ".txt", ".svg", ".md", ".yml", ".yaml", ".ec", ".nsh"]);

/* GIT-ENV: a caller that exported GIT_DIR would make every query here read that other
 * index. The root argument is the tree, so those three variables are dropped. */
function gitEnv() {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  return env;
}

function git(root, args) {
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: gitEnv(),
  });
}

function trackedFiles(root) {
  const norm = p => p.split(path.sep).join("/");
  const out = git(root, ["ls-files", "-co", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  const set = new Set(out.map(norm));
  /* A staged deletion is gone from the index. If main still has the path, it counts,
   * so the gates that import the removed module are still named. */
  let mainOk = false;
  try { git(root, ["rev-parse", "--verify", "--quiet", "main"]); mainOk = true; }
  catch (e) { mainOk = false; }
  if (!mainOk) return set;
  let deleted = "", mainList = "";
  try { deleted = git(root, ["diff", "--name-only", "--diff-filter=D", "-z", "--cached"]); }
  catch (e) { deleted = ""; }
  try { mainList = git(root, ["ls-tree", "-r", "--name-only", "-z", "main"]); }
  catch (e) { mainList = ""; }
  const mainSet = new Set(mainList.split("\0").filter(Boolean).map(norm));
  for (const p of deleted.split("\0")) {
    const rel = norm(p);
    if (rel && mainSet.has(rel)) set.add(rel);
  }
  return set;
}

export function changedFiles(root, base = "main...HEAD") {
  const have = name => {
    try { git(root, ["rev-parse", "--verify", "--quiet", name]); return true; }
    catch (e) { return false; }
  };
  const lines = [];
  const b = base.includes("...") ? base.split("...")[0] : base;
  if (have(b)) {
    const diffArg = base.includes("...") ? base : `${base}...HEAD`;
    try { lines.push(git(root, ["diff", "--name-only", "-z", diffArg])); } catch (e) {}
    try { lines.push(git(root, ["diff", "--name-only", "-z", b, "HEAD"])); } catch (e) {}
  }
  try { lines.push(git(root, ["diff", "--name-only", "-z", "HEAD"])); } catch (e) {}
  try { lines.push(git(root, ["diff", "--name-only", "-z", "--cached"])); } catch (e) {}
  try { lines.push(git(root, ["ls-files", "--others", "--exclude-standard", "-z"])); } catch (e) {}
  const set = new Set();
  for (const block of lines) for (const p of block.split("\0")) if (p) set.add(p.split(path.sep).join("/"));
  return [...set].sort();
}

export function isRelayCode(file) {
  const f = file.replace(/\\/g, "/");
  return f.startsWith("relay/") || f.startsWith("shell/relay/") || f === "shell/main.js";
}

export const SHARED = [
  "package.json",
  "package-lock.json",
  "electron-builder.js",
  "tools/build.mjs",
  "relay/wrangler.toml",
  "tests/engine.js",
  "tests/relay-lab.mjs",
  "tools/gate-run.mjs",
  "tools/gates-for.mjs",
  "tools/engine-pin",
];

export function isSharedCode(file) {
  const f = file.replace(/\\/g, "/");
  if (SHARED.includes(f)) return true;
  if (f === "wrangler.toml" || f.endsWith("/wrangler.toml") || f.endsWith(".toml")) return true;
  if (f.startsWith("tools/build") || f.startsWith("tools/package")) return true;
  return false;
}

export function isProductFile(file) {
  const f = file.replace(/\\/g, "/");
  return f.startsWith("src/") || f.startsWith("shell/") || f.startsWith("relay/") || f.startsWith("engine/") || f === "Etiuda.html" || f === "etiuda-catalog.js";
}

export function relOf(root, abs) {
  if (typeof abs !== "string" || !abs) return null;
  let r;
  try { r = path.resolve(abs); } catch (e) { return null; }
  const rel = path.relative(root, r).split(path.sep).join("/");
  if (!rel || rel.startsWith("../") || rel === ".." || path.isAbsolute(rel)) return null;
  if (rel === "node_modules" || rel.startsWith("node_modules/") || rel.includes("/node_modules/")) return null;
  return rel;
}

function inside(root, abs) {
  const rel = relOf(root, abs);
  return rel === null ? null : { abs: path.resolve(abs), rel };
}

/* Comments become spaces. String and template literals become "\uE000n\uE001". Regex literals
 * stay, so a slash in a regex is not a division and not a string. */
function lex(src) {
  const strings = [];
  let out = "";
  let i = 0;
  const n = src.length;
  let prev = "";
  const regexOk = () => prev === "" || /[({\[,=:[!&|?{};+\-*%<>~^]$/.test(prev)
    || /\b(return|typeof|case|of|in|do|else|void|delete|new|throw|yield|await)$/.test(prev);
  const pushStr = s => {
    const id = strings.length;
    strings.push(s);
    out += '"\uE000' + id + '\uE001"';
    prev = "x";
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; out += " "; prev = ""; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(n, i + 2); out += " "; prev = ""; continue;
    }
    if (c === "'" || c === '"') {
      const q = c; let s = ""; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { s += src[i + 1] === "n" ? "\n" : src[i + 1] || ""; i += 2; continue; }
        s += src[i++];
      }
      i++; pushStr(s); continue;
    }
    if (c === "`") {
      let s = ""; i++;
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") { s += src[i + 1] || ""; i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { s += "${"; i += 2; continue; }
        s += src[i++];
      }
      i++; pushStr(s); continue;
    }
    if (c === "/" && regexOk()) {
      out += c; i++; prev = c;
      let cls = false;
      while (i < n) {
        const ch = src[i];
        out += ch;
        if (ch === "\\") { if (i + 1 < n) { out += src[i + 1]; i += 2; continue; } }
        if (ch === "[") cls = true; else if (ch === "]") cls = false;
        else if (ch === "/" && !cls) { i++; break; }
        else if (ch === "\n") break;
        i++;
      }
      while (/[a-z]/i.test(src[i] || "")) { out += src[i++]; }
      prev = "x"; continue;
    }
    out += c;
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) {
      let w = c; i++;
      while (i < n && /[\w$]/.test(src[i])) w += src[i++];
      out += w.slice(1); prev = w; continue;
    }
    prev = c; i++;
  }
  return { masked: out, strings };
}

function depthSplit(text, sep) {
  const parts = [];
  let depth = 0, cur = "", i = 0, quote = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (text.slice(i).startsWith('"\uE000')) {
        const end = text.indexOf('\uE001"', i);
        if (end > -1) { cur += text.slice(i, end + '\uE001"'.length); i = end + '\uE001"'.length; continue; }
      }
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(cur); cur = ""; i += sep.length; continue;
    }
    cur += c; i++;
  }
  parts.push(cur);
  return parts;
}

function matching(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text.startsWith('"\uE000', i)) {
      const end = text.indexOf('\uE001"', i);
      if (end > -1) { i = end + 1; continue; }
    }
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function eachHead(masked, headRe, fn) {
  headRe.lastIndex = 0;
  let m;
  while ((m = headRe.exec(masked))) {
    const paren = m.index + m[0].length - 1;
    if (masked[paren] !== "(") continue;
    const end = matching(masked, paren, "(", ")");
    if (end < 0) continue;
    fn(masked.slice(paren + 1, end), m.index, end);
    headRe.lastIndex = end + 1;
  }
}

function strLit(expr, strings) {
  const m = /^\s*"\uE000(\d+)\uE001"\s*$/.exec(expr);
  return m ? strings[+m[1]] : null;
}

function fileUrlToPath(u) {
  let p = decodeURIComponent(u.pathname);
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return p;
}

/* TRACKED-MISSING: set by analyzeTree. A path in this set counts when the file is gone. */
let knownNow = new Set();
let knownRoot = null;

function knownFile(p) {
  if (!knownRoot) return false;
  const rel = relOf(knownRoot, p);
  return !!(rel && knownNow.has(rel));
}

function resolveExisting(abs) {
  const tryOne = p => {
    try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch (e) { /* skip */ }
    if (knownFile(p)) return p;
    return null;
  };
  const direct = tryOne(abs);
  if (direct) return direct;
  for (const e of [".mjs", ".js", ".cjs", ".json"]) {
    const hit = tryOne(abs + e);
    if (hit) return hit;
  }
  for (const e of ["/index.mjs", "/index.js", "/index.cjs"]) {
    const hit = tryOne(abs + e);
    if (hit) return hit;
  }
  try { if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs; } catch (e) { /* skip */ }
  if (knownRoot) {
    const rel = relOf(knownRoot, abs);
    if (rel) {
      const prefix = rel.endsWith("/") ? rel : rel + "/";
      for (const t of knownNow) if (t.startsWith(prefix)) return abs;
    }
  }
  return null;
}

function resolveSpec(fromFile, spec, root) {
  if (!spec || spec.startsWith("node:") || spec.startsWith("data:")) return null;
  if (spec.startsWith("file:")) {
    try { return resolveExisting(fileUrlToPath(new URL(spec))); } catch (e) { return null; }
  }
  let abs;
  if (path.isAbsolute(spec)) abs = spec;
  else if (spec.startsWith(".")) abs = path.resolve(path.dirname(fromFile), spec);
  else {
    const under = path.resolve(root, spec);
    if (resolveExisting(under)) abs = under;
    else return null;
  }
  const hit = resolveExisting(abs);
  if (!hit) return null;
  if (!relOf(root, hit)) return null;
  return hit;
}

function splitTernary(expr) {
  let depth = 0, q = -1;
  for (let i = 0; i < expr.length; i++) {
    if (expr.startsWith('"\uE000', i)) {
      const end = expr.indexOf('\uE001"', i);
      if (end > -1) { i = end + 1; continue; }
    }
    const c = expr[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (c === "?" && depth === 0 && expr[i + 1] !== "." && expr[i + 1] !== "?") { q = i; break; }
  }
  if (q < 0) return null;
  depth = 0;
  for (let i = q + 1; i < expr.length; i++) {
    if (expr.startsWith('"\uE000', i)) {
      const end = expr.indexOf('\uE001"', i);
      if (end > -1) { i = end + 1; continue; }
    }
    const c = expr[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (c === "?" && depth === 0 && expr[i + 1] !== "." && expr[i + 1] !== "?") return null;
    else if (c === ":" && depth === 0 && expr[i + 1] !== ":") {
      return { cond: expr.slice(0, q).trim(), a: expr.slice(q + 1, i).trim(), b: expr.slice(i + 1).trim() };
    }
  }
  return null;
}

/* A template whose ${...} parts are names already folded (`${ROOT}/kplant/fx3/tpl.json`). */
function foldTemplate(raw, env) {
  if (!raw.includes("${")) return raw;
  let out = "", i = 0, any = false;
  while (i < raw.length) {
    const at = raw.indexOf("${", i);
    if (at < 0) { out += raw.slice(i); break; }
    out += raw.slice(i, at);
    let depth = 1, j = at + 2;
    while (j < raw.length && depth > 0) {
      const c = raw[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth > 0) j++;
    }
    if (depth !== 0) return null;
    const name = raw.slice(at + 2, j).trim();
    const v = env.has(name) ? env.get(name) : undefined;
    if (typeof v !== "string") return null;
    out += v;
    any = true;
    i = j + 1;
  }
  return any ? out : raw;
}

function evalExpr(expr, env, strings, fileAbs) {
  expr = String(expr || "").trim();
  if (!expr) return undefined;
  if (env.has(expr)) return env.get(expr);
  const lit = strLit(expr, strings);
  if (lit !== null) {
    if (lit.includes("${")) {
      const folded = foldTemplate(lit, env);
      if (typeof folded === "string") return folded;
    }
    return lit;
  }
  if (expr === "import.meta.dirname" || expr === "__dirname") return path.dirname(fileAbs);
  if (expr === "import.meta.filename" || expr === "__filename") return fileAbs;
  if (expr === "import.meta.url") return pathToFileURL(fileAbs).href;
  if (expr === "process.execPath") return process.execPath;

  const hrefAt = expr.lastIndexOf(".href");
  if (hrefAt > 0 && !expr.slice(hrefAt + 5).trim()) {
    const inner = evalExpr(expr.slice(0, hrefAt), env, strings, fileAbs);
    if (typeof inner === "string") {
      try { return pathToFileURL(inner).href; } catch (e) { return inner; }
    }
  }
  const pathAt = expr.lastIndexOf(".pathname");
  if (pathAt > 0) {
    const inner = evalExpr(expr.slice(0, pathAt), env, strings, fileAbs);
    if (typeof inner === "string") return inner;
  }

  const tern = splitTernary(expr);
  if (tern) {
    const bv = evalExpr(tern.b, env, strings, fileAbs);
    if (/process\.env\b/.test(tern.cond) && typeof bv === "string") return bv;
    const av = evalExpr(tern.a, env, strings, fileAbs);
    if (typeof av === "string" && av === bv) return av;
    return undefined;
  }

  const plus = depthSplit(expr, "+").map(s => s.trim()).filter(Boolean);
  if (plus.length > 1 && plus.every(p => p !== expr.trim())) {
    const vals = plus.map(p => evalExpr(p, env, strings, fileAbs));
    if (vals.every(v => typeof v === "string")) return vals.join("");
    return undefined;
  }

  if (/^new\s+URL\s*\(/.test(expr)) {
    const open = expr.indexOf("(");
    const close = matching(expr, open, "(", ")");
    if (close < 0) return undefined;
    const args = depthSplit(expr.slice(open + 1, close), ",").map(s => s.trim());
    const spec = evalExpr(args[0], env, strings, fileAbs);
    if (typeof spec !== "string") return undefined;
    const base = args[1] ? evalExpr(args[1], env, strings, fileAbs) : pathToFileURL(fileAbs).href;
    try { return fileUrlToPath(new URL(spec, typeof base === "string" ? base : pathToFileURL(fileAbs).href)); }
    catch (e) { return undefined; }
  }

  const call = /^([A-Za-z_$][\w$.]*)\s*\(/.exec(expr);
  if (call && matching(expr, call[0].length - 1, "(", ")") === expr.length - 1) {
    const open = call[0].length - 1;
    const args = depthSplit(expr.slice(open + 1, expr.length - 1), ",").map(s => s.trim()).filter(s => s !== "");
    const vals = args.map(a => evalExpr(a, env, strings, fileAbs));
    return applyFn(call[1], vals, env, fileAbs);
  }
  return undefined;
}

function applyFn(name, args, env, fileAbs) {
  const base = name.split(".").pop();
  const pathFn = name === "path.join" || name === "path.resolve" || name === "path.normalize"
    || name === "path.posix.join" || name === "path.win32.join" || name.endsWith(".join") && name.startsWith("path")
    || env.get("__pathFns") && env.get("__pathFns").has(base) && !name.includes(".");
  if (name === "path.dirname" || (env.get("__pathFns") && env.get("__pathFns").has("dirname") && name === "dirname")) {
    return typeof args[0] === "string" ? path.dirname(args[0]) : undefined;
  }
  if (name === "fileURLToPath" || name === "url.fileURLToPath" || name.endsWith(".fileURLToPath")) {
    const a = args[0];
    if (typeof a !== "string") return undefined;
    if (a.startsWith("file:")) { try { return fileUrlToPath(new URL(a)); } catch (e) { return undefined; } }
    return a;
  }
  if (name === "pathToFileURL" || name.endsWith(".pathToFileURL")) {
    return typeof args[0] === "string" ? args[0] : undefined;
  }
  if (pathFn || name === "join" && env.get("__pathFns") && env.get("__pathFns").has("join")
      || name === "resolve" && env.get("__pathFns") && env.get("__pathFns").has("resolve")) {
    if (args.some(a => typeof a !== "string")) return undefined;
    if (name === "path.resolve" || name === "resolve" && env.get("__pathFns") && env.get("__pathFns").has("resolve") && name === "resolve")
      return path.resolve(...args);
    return path.join(...args);
  }
  if (name === "path.resolve") return args.every(a => typeof a === "string") ? path.resolve(...args) : undefined;
  /* arg("--entry", fallback) is the chain's value: the scripts run these gates with no flag,
   * so the fallback is the file esbuild then reads. */
  if (name === "arg") return typeof args[1] === "string" ? args[1] : undefined;
  return undefined;
}

const envCache = new Map();

function foldEnv(masked, strings, fileAbs, root, stack) {
  const key = path.resolve(fileAbs);
  if (envCache.has(key)) return envCache.get(key);
  const env = new Map();
  envCache.set(key, env);
  stack = stack || new Set();
  stack.add(key);
  env.set("__dirname", path.dirname(fileAbs));
  env.set("__filename", fileAbs);
  const pathFns = new Set();
  const modIsPath = id => {
    const s = strings[id];
    return s === "path" || s === "node:path" || s === "node:url" || s === "url";
  };
  const imp = /import\s+([A-Za-z_$][\w$]*)\s+from\s*"\uE000(\d+)\uE001"/g;
  let m;
  while ((m = imp.exec(masked))) {
    const s = strings[+m[2]];
    if (s === "path" || s === "node:path") env.set(m[1], "path");
  }
  const named = /import\s*\{([^}]+)\}\s*from\s*"\uE000(\d+)\uE001"/g;
  while ((m = named.exec(masked))) {
    if (!modIsPath(+m[2])) continue;
    if (strings[+m[2]] === "url" || strings[+m[2]] === "node:url") {
      for (const part of m[1].split(",")) {
        const as = part.trim();
        const name = (as.split(/\s+as\s+/).pop() || "").trim();
        if (name === "fileURLToPath" || name === "pathToFileURL") env.set("__url_" + name, true);
      }
      continue;
    }
    for (const part of m[1].split(",")) {
      const as = part.trim();
      const name = (as.split(/\s+as\s+/).pop() || "").trim();
      if (name) pathFns.add(name);
    }
  }
  const req = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*"\uE000(\d+)\uE001"\s*\)/g;
  while ((m = req.exec(masked))) {
    const s = strings[+m[2]];
    if (s === "path" || s === "node:path") env.set(m[1], "path");
  }
  const reqNamed = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*"\uE000(\d+)\uE001"\s*\)/g;
  while ((m = reqNamed.exec(masked))) {
    if (strings[+m[2]] !== "path" && strings[+m[2]] !== "node:path") continue;
    for (const part of m[1].split(",")) {
      const name = (part.trim().split(/\s*:\s*/).pop() || "").trim();
      if (name) pathFns.add(name);
    }
  }
  env.set("__pathFns", pathFns);

  const assignRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  const found = [];
  while ((m = assignRe.exec(masked))) {
    if (masked[m.index + m[0].length] === "{") continue;
    const start = m.index + m[0].length;
    let i = start, depth = 0;
    while (i < masked.length) {
      if (masked.startsWith('"\uE000', i)) {
        const end = masked.indexOf('\uE001"', i);
        if (end > -1) { i = end + 2; continue; }
      }
      const c = masked[i];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
      else if ((c === ";" || c === "\n") && depth === 0) break;
      i++;
    }
    found.push([m[1], masked.slice(start, i).trim()]);
  }
  for (let pass = 0; pass < 8; pass++) {
    let grew = false;
    for (const [name, rhs] of found) {
      if (env.has(name)) continue;
      const v = evalExpr(rhs, env, strings, fileAbs);
      if (typeof v === "string") { env.set(name, v); grew = true; }
    }
    if (!grew) break;
  }
  /* A named import of a string constant: `import { ROOT } from "./x.mjs"`. The binding is the
   * value that module computed, so path.join(ROOT, "tools", "engine-pin") names that file. */
  const namedImp = /import\s*\{([^}]+)\}\s*from\s*"\uE000(\d+)\uE001"/g;
  let im;
  while ((im = namedImp.exec(masked))) {
    const spec = strings[+im[2]];
    if (!spec || spec.startsWith("node:")) continue;
    const hit = resolveSpec(fileAbs, spec, root);
    if (!hit || !isJs(hit)) continue;
    const dep = path.resolve(hit);
    if (stack.has(dep)) continue;
    let text2;
    try { text2 = fs.readFileSync(dep, "utf8"); } catch (e) { continue; }
    const lexed = lex(text2);
    const their = foldEnv(lexed.masked, lexed.strings, dep, root, stack);
    for (const part of im[1].split(",")) {
      const bits = part.trim().split(/\s+as\s+/);
      if (!bits[0]) continue;
      const remote = bits[0].trim();
      const local = (bits.length > 1 ? bits[1] : bits[0]).trim();
      if (!local || env.has(local)) continue;
      const v = their.get(remote);
      if (typeof v === "string") env.set(local, v);
    }
  }
  /* `const nodeRequire = createRequire(...)` then nodeRequire("./x.js") is a load. */
  const requireFns = new Set();
  const crBind = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createRequire\s*\(/g;
  while ((m = crBind.exec(masked))) requireFns.add(m[1]);
  env.set("__requireFns", requireFns);
  /* `const E = require("./engine.js")` then E.ROOT, and `{ ROOT } = require(...)`. The
   * required module's string exports are the values, so path.join(E.ROOT, "shell") names
   * that directory. */
  const bindCjs = (local, spec, prop) => {
    if (!spec || spec.startsWith("node:") || spec === "fs" || spec === "path") return;
    const hit = resolveSpec(fileAbs, spec, root);
    if (!hit || !isJs(hit)) return;
    const ex = cjsStringExports(hit, root, stack);
    if (prop) {
      if (ex.has(prop.remote) && !env.has(local)) env.set(local, ex.get(prop.remote));
      return;
    }
    for (const [k, v] of ex) {
      const key = local + "." + k;
      if (!env.has(key)) env.set(key, v);
    }
  };
  const cjsNs = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*"\uE000(\d+)\uE001"\s*\)/g;
  while ((m = cjsNs.exec(masked))) bindCjs(m[1], strings[+m[2]], null);
  const cjsDes = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*"\uE000(\d+)\uE001"\s*\)/g;
  while ((m = cjsDes.exec(masked))) {
    const spec = strings[+m[2]];
    for (const part of m[1].split(",")) {
      const bits = part.trim().split(/\s*:\s*/);
      if (!bits[0]) continue;
      const remote = bits[0].trim();
      const local = (bits[bits.length - 1] || "").trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(remote) || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
      bindCjs(local, spec, { remote });
    }
  }
  /* Assignments that join an export (path.join(E.ROOT, "tests", "test.js")) can fold only
   * after that export is in the env. */
  for (let pass = 0; pass < 8; pass++) {
    let grew = false;
    for (const [name, rhs] of found) {
      if (env.has(name)) continue;
      const v = evalExpr(rhs, env, strings, fileAbs);
      if (typeof v === "string") { env.set(name, v); grew = true; }
    }
    if (!grew) break;
  }
  env.set("__root", root);
  return env;
}

/* String values on module.exports, so a binding E.ROOT is the directory the tests join against. */
function cjsStringExports(abs, root, stack) {
  const dep = path.resolve(abs);
  const out = new Map();
  if (stack.has(dep)) return out;
  let text;
  try { text = fs.readFileSync(dep, "utf8"); } catch (e) { return out; }
  const lexed = lex(text);
  const their = foldEnv(lexed.masked, lexed.strings, dep, root, stack);
  const take = (key, expr) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(key) || out.has(key)) return;
    let v = their.get(expr);
    if (typeof v !== "string") v = evalExpr(expr, their, lexed.strings, dep);
    if (typeof v === "string") out.set(key, v);
  };
  const masked = lexed.masked;
  const re = /module\s*\.\s*exports\s*=\s*\{/g;
  let m;
  while ((m = re.exec(masked))) {
    const open = m.index + m[0].length - 1;
    const end = matching(masked, open, "{", "}");
    if (end < 0) continue;
    for (const part of depthSplit(masked.slice(open + 1, end), ",")) {
      const t = part.trim();
      if (!t || t.startsWith("...")) continue;
      let depth = 0, colon = -1, i = 0;
      while (i < t.length) {
        if (t.startsWith('"\uE000', i)) {
          const e = t.indexOf('\uE001"', i);
          if (e > -1) { i = e + 2; continue; }
        }
        const c = t[i];
        if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
        else if (c === ":" && depth === 0) { colon = i; break; }
        i++;
      }
      if (colon < 0) take(t, t);
      else take(t.slice(0, colon).trim(), t.slice(colon + 1).trim());
    }
  }
  return out;
}

function isJs(abs) {
  return /\.(mjs|js|cjs)$/.test(abs);
}

function analyze(abs, root, tracked) {
  let text;
  try { text = fs.readFileSync(abs, "utf8"); }
  catch (e) { return { loads: [], reads: [], dirs: [], globs: [], wantsGlob: false, edges: [] }; }
  if (!isJs(abs)) return { loads: [], reads: [], dirs: [], globs: [], wantsGlob: false, edges: [] };
  const { masked, strings } = lex(text);
  const env = foldEnv(masked, strings, abs, root);
  const loads = new Set();
  const reads = new Set();
  const dirs = new Set();
  const edges = [];
  const notePin = (rel) => {
    /* PIN-READ: a reach into engine/pinned/ is a read of the pin and the module list. */
    if (rel !== "engine/pinned" && !rel.startsWith("engine/pinned/")) return;
    for (const extra of ["tools/engine-pin", "tools/engine-modules.txt"]) {
      if (!tracked.has(extra)) continue;
      reads.add(extra);
      edges.push({ rel: extra });
    }
  };
  const noteFile = (hit, kind) => {
    const loc = inside(root, hit);
    if (!loc) return;
    notePin(loc.rel);
    let st = null;
    try { st = fs.statSync(loc.abs); } catch (e) { st = null; }
    if (st && st.isDirectory()) {
      const prefix = loc.rel.endsWith("/") ? loc.rel : loc.rel + "/";
      if ([...tracked].some(t => t.startsWith(prefix))) {
        dirs.add(prefix);
        edges.push({ dir: prefix });
      }
      return;
    }
    if (!st) {
      if (tracked.has(loc.rel)) {
        if (kind === "load" && isJs(loc.abs)) loads.add(loc.abs);
        else reads.add(loc.rel);
        edges.push({ rel: loc.rel });
      }
      const prefix = (loc.rel.endsWith("/") ? loc.rel : loc.rel + "/");
      if ([...tracked].some(t => t.startsWith(prefix))) {
        dirs.add(prefix);
        edges.push({ dir: prefix });
      }
      return;
    }
    if (!tracked.has(loc.rel)) return;
    if (kind === "load" && isJs(loc.abs)) loads.add(loc.abs);
    else reads.add(loc.rel);
    edges.push({ rel: loc.rel });
  };
  const noteSpec = (spec, kind) => {
    const hit = resolveSpec(abs, spec, root);
    if (hit) noteFile(hit, kind);
  };

  const fromRe = /\bfrom\s*"\uE000(\d+)\uE001"/g;
  let m;
  while ((m = fromRe.exec(masked))) noteSpec(strings[+m[1]], "load");
  const sideRe = /\bimport\s*"\uE000(\d+)\uE001"/g;
  while ((m = sideRe.exec(masked))) noteSpec(strings[+m[1]], "load");
  eachHead(masked, /\brequire\s*\(/g, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(parts[0], env, strings, abs);
    if (typeof v === "string") noteSpec(v, "load");
  });
  eachHead(masked, /\bimport\s*\(/g, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(parts[0], env, strings, abs);
    if (typeof v === "string") noteSpec(v, "load");
  });
  eachHead(masked, /\bcreateRequire\s*\([^)]*\)\s*\(/g, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(parts[0], env, strings, abs);
    if (typeof v === "string") noteSpec(v, "load");
  });
  eachHead(masked, /\brequire\s*\.\s*resolve\s*\(/g, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(parts[0], env, strings, abs);
    if (typeof v === "string") noteSpec(v, "load");
  });
  for (const name of env.get("__requireFns") || []) {
    eachHead(masked, new RegExp("\\b" + name + "\\s*\\(", "g"), args => {
      const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
      const v = evalExpr(parts[0], env, strings, abs);
      if (typeof v === "string") noteSpec(v, "load");
    });
  }

  const readHeads = /\b(?:readFileSync|readFile|createReadStream|openSync)\s*\(/g;
  eachHead(masked, readHeads, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(parts[0], env, strings, abs);
    if (typeof v === "string") noteFile(v, "read");
  });
  const dirHeads = /\b(?:readdirSync|readdir|cpSync)\s*\(/g;
  eachHead(masked, dirHeads, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(parts[0], env, strings, abs);
    if (typeof v === "string") noteFile(v, "read");
  });
  eachHead(masked, /\.cp\s*\(/g, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(parts[0], env, strings, abs);
    if (typeof v === "string") noteFile(v, "read");
  });

  /* A path.join / path.resolve / new URL anywhere, static, is a file this source names. */
  const pathHeads = /\b(?:path\.(?:posix\.|win32\.)?join|path\.resolve|[A-Za-z_$][\w$]*\.join|[A-Za-z_$][\w$]*\.resolve|join|resolve)\s*\(/g;
  let pm;
  while ((pm = pathHeads.exec(masked))) {
    const index = pm.index;
    const paren = index + pm[0].length - 1;
    if (masked[paren] !== "(") continue;
    const end = matching(masked, paren, "(", ")");
    if (end < 0) continue;
    const args = masked.slice(paren + 1, end);
    pathHeads.lastIndex = index + 1;
    const head = masked.slice(Math.max(0, index - 30), index);
    if (!/path\s*\.\s*(?:posix\s*\.\s*|win32\s*\.\s*)?(?:join|resolve)\s*$/.test(masked.slice(index, index + 40))
        && !/\bpath\s*$/.test(head) && !env.get("__pathFns")) {
      /* bare join( only counts when imported from path; checked below via apply */
    }
    const callText = masked.slice(index, masked.indexOf("(", index) + 1);
    const name = callText.replace(/\s*\($/, "").trim();
    if (!(name.startsWith("path.") || (env.get("__pathFns") && env.get("__pathFns").has(name.split(".").pop()) && !name.includes(".")))) continue;
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    const v = evalExpr(name + "(" + parts.join(",") + ")", env, strings, abs);
    if (typeof v === "string") noteFile(v, "read");
    else {
      const prefix = [];
      for (const p of parts) {
        const ev = evalExpr(p, env, strings, abs);
        if (typeof ev !== "string") break;
        prefix.push(ev);
      }
      if (prefix.length && prefix.length < parts.length) {
        const pre = path.resolve(...(name.includes("resolve") ? prefix : [prefix[0].startsWith(root) || path.isAbsolute(prefix[0]) ? prefix[0] : path.dirname(abs), ...prefix.slice(path.isAbsolute(prefix[0]) ? 1 : 0)]));
        /* rebuild simply */
      }
      if (prefix.length && prefix.length < parts.length) {
        let pre;
        try { pre = name.includes("resolve") ? path.resolve(...prefix) : path.join(...prefix); }
        catch (e) { pre = null; }
        if (pre && pre !== root && relOf(root, pre) && relOf(root, pre) !== "") noteFile(pre, "read");
      }
    }
  }
  eachHead(masked, /\bnew\s+URL\s*\(/g, (args) => {
    const v = evalExpr("new URL(" + args + ")", env, strings, abs);
    if (typeof v === "string") noteFile(v, "read");
  });

  /* Quoted paths a gate names as text. A bare "." or ".." is a string-method argument, not a
   * directory the gate reads; only a path that resolves to a tracked file is recorded here.
   * A directory is recorded when a readdir, cp, or a fully built path.join names it. */
  for (const s of strings) {
    if (!s || s.length > 180 || /\s/.test(s) || s.includes("://") || s.startsWith("!")) continue;
    if (/^(?:\.\.?\/?)+$/.test(s)) continue;
    const looks = s.startsWith(".") || s.includes("/") || s.includes("\\") || EXT_OK.has(path.extname(s));
    if (!looks) continue;
    const hit = resolveSpec(abs, s, root);
    if (!hit) continue;
    let st = null;
    try { st = fs.statSync(hit); } catch (e) { st = null; }
    if (st && !st.isFile()) continue;
    if (!st) {
      const rel = relOf(root, hit);
      if (!rel || !tracked.has(rel)) continue;
    }
    noteFile(hit, "read");
  }

  /* Local wrappers: const read = (...p) => fs.readFileSync(path.join(ROOT, ...p)) and
   * const listed = (d) => fs.readdirSync(path.join(ROOT, d)). Calls with string arguments name files. */
  bindWrappers(masked, strings, env, abs, root, noteFile);

  /* Node children: spawn(process.execPath, ["tools/x.mjs", ...]) loads that file.
   * execSync("node tests/child.mjs") is the same load, written as one command string. */
  eachHead(masked, /\b(?:spawnSync|spawn|execFileSync|execFile|fork|execSync|exec)\s*\(/g, args => {
    const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const cmd = evalExpr(parts[0], env, strings, abs);
    if (typeof cmd === "string") {
      const sm = /^(?:node|node\.exe)\s+(\S+)/.exec(cmd.trim());
      if (sm && /\.(mjs|js|cjs)$/.test(sm[1])) noteSpec(sm[1], "load");
    }
    const isNode = cmd === process.execPath || cmd === "node" || cmd === "node.exe" || parts[0] === "process.execPath";
    if (!isNode || !parts[1]) return;
    const second = parts[1].trim();
    if (second.startsWith("[")) {
      const end = matching(second, 0, "[", "]");
      const inner = end > 0 ? second.slice(1, end) : second.slice(1);
      for (const el of depthSplit(inner, ",").map(s => s.trim()).filter(Boolean)) {
        const v = evalExpr(el, env, strings, abs);
        if (typeof v === "string" && /\.(mjs|js|cjs)$/.test(v)) noteSpec(v, "load");
      }
    } else {
      const v = evalExpr(second, env, strings, abs);
      if (typeof v === "string" && /\.(mjs|js|cjs)$/.test(v)) noteSpec(v, "load");
    }
  });

  const wantsGlob = /\breaddir(?:Sync)?\s*\(/.test(masked) && (/\\\*\\\*/.test(masked) || strings.some(s => s.endsWith("/**")));
  const globs = strings.filter(s => /^!?[\w./-]+\/\*\*$/.test(s)).map(s => s.replace(/^!/, "").replace(/\*\*$/, ""));

  /* Arrays walked with path.join(ROOT, element): ["ui","src","shell"].flatMap(d => walk(path.join(ROOT, d))) */
  walkArrays(masked, strings, env, abs, root, noteFile);
  bindNodeArgv(masked, strings, env, abs, noteSpec);
  bindDynImports(masked, strings, env, abs, root, noteSpec);
  /* esbuild.build({ entryPoints: [entry] }) and importGraph({ entry }) read the module graph
   * of that entry. The chain passes no --entry, so the fallback const is the graph. */
  if (/esbuild\s*\.\s*build|importGraph\s*\(/.test(masked)) {
    const noteEntry = expr => {
      const v = evalExpr(expr, env, strings, abs);
      if (typeof v === "string" && /\.(mjs|js|cjs)$/.test(v)) noteSpec(v, "load");
    };
    const ep = /\bentryPoints\s*:\s*\[/g;
    let em;
    while ((em = ep.exec(masked))) {
      const open = em.index + em[0].length - 1;
      const end = matching(masked, open, "[", "]");
      if (end < 0) continue;
      for (const el of depthSplit(masked.slice(open + 1, end), ",")) noteEntry(el.trim());
    }
    const ig = /\bimportGraph\s*\(\s*\{/g;
    while ((em = ig.exec(masked))) {
      const open = masked.indexOf("{", em.index);
      const end = matching(masked, open, "{", "}");
      if (end < 0) continue;
      for (const prop of depthSplit(masked.slice(open + 1, end), ",")) {
        const t = prop.trim();
        if (t === "entry") noteEntry("entry");
        else if (t.startsWith("entry") && t.includes(":")) noteEntry(t.slice(t.indexOf(":") + 1));
      }
    }
  }

  return { loads: [...loads], reads: [...reads], dirs: [...dirs], globs, wantsGlob, edges };
}

function bindWrappers(masked, strings, env, fileAbs, root, noteFile) {
  const decls = [];
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
  let m;
  while ((m = re.exec(masked))) {
    const name = m[1];
    const params = (m[2] !== undefined ? m[2] : m[3] || "").trim();
    let bodyStart = m.index + m[0].length;
    while (bodyStart < masked.length && /\s/.test(masked[bodyStart])) bodyStart++;
    let body = "";
    if (masked[bodyStart] === "{") {
      const end = matching(masked, bodyStart, "{", "}");
      if (end < 0) continue;
      body = masked.slice(bodyStart, end + 1);
    } else {
      let i = bodyStart, depth = 0;
      while (i < masked.length) {
        const c = masked[i];
        if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
        else if ((c === ";" || c === "\n") && depth === 0) break;
        i++;
      }
      body = masked.slice(bodyStart, i);
    }
    decls.push({ name, params, body, at: m.index, end: bodyStart + body.length });
  }
  const fnRe = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  while ((m = fnRe.exec(masked))) {
    const brace = m.index + m[0].length - 1;
    const end = matching(masked, brace, "{", "}");
    if (end < 0) continue;
    decls.push({ name: m[1], params: m[2], body: masked.slice(brace, end + 1), at: m.index, end });
  }
  for (const d of decls) {
    const reads = /\b(?:readFileSync|readFile|readdirSync|readdir|cpSync|createReadStream)\b/.test(d.body);
    if (!reads) continue;
    const rest = d.params.trim().startsWith("...");
    const paramNames = d.params.split(",").map(s => s.trim().replace(/^\.\.\./, "").split("=")[0].trim()).filter(Boolean);
    const rootName = [...env.keys()].find(k => {
      if (k.startsWith("__")) return false;
      const v = env.get(k);
      return typeof v === "string" && path.resolve(v) === path.resolve(root);
    }) || "ROOT";
    const uses = d.body.includes("path.join(" + rootName) || d.body.includes("path.resolve(" + rootName)
      || d.body.includes("join(" + rootName);
    const joinsParam = paramNames.some(p => d.body.includes("path.join(" + p) || d.body.includes("path.resolve(" + p));
    if (!uses && !joinsParam) continue;
    eachHead(masked, new RegExp("\\b" + d.name + "\\s*\\(", "g"), (args, index) => {
      if (index >= d.at && index < d.end) return;
      const argsList = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
      const vals = argsList.map(a => evalExpr(a, env, strings, fileAbs));
      if (rest) {
        if (vals.length && vals.every(v => typeof v === "string")) {
          noteFile(path.join(root, ...vals), "read");
        } else {
          const lead = [];
          for (const v of vals) { if (typeof v !== "string") break; lead.push(v); }
          if (lead.length && lead.length < vals.length) noteFile(path.join(root, ...lead), "read");
        }
        return;
      }
      const segs = [root];
      let dynamic = false;
      for (let i = 0; i < paramNames.length && i < vals.length; i++) {
        if (typeof vals[i] === "string") segs.push(vals[i]);
        else { dynamic = true; break; }
      }
      if (!dynamic && segs.length > 1) noteFile(path.join(...segs), "read");
      else if (dynamic && segs.length > 1) noteFile(path.join(...segs), "read");
      /* path.join(param, "ui", "lang.js") with the call handing the directory. */
      for (let i = 0; i < paramNames.length && i < vals.length; i++) {
        if (typeof vals[i] !== "string") continue;
        const pre = paramNames[i];
        const joinRe = new RegExp("path\\.join\\(\\s*" + pre + "\\s*,([\\s\\S]{0,200}?)\\)", "g");
        let jm;
        while ((jm = joinRe.exec(d.body))) {
          const bits = depthSplit(jm[1], ",").map(s => s.trim()).filter(Boolean);
          const lits = [];
          for (const b of bits) {
            const ev = evalExpr(b, env, strings, fileAbs);
            if (typeof ev !== "string") break;
            lits.push(ev);
          }
          if (lits.length) noteFile(path.join(vals[i], ...lits), "read");
        }
      }
    });
  }
}

/* run(["tools/adapt.mjs", ...]) where run passes its array to node. The string names a
 * module the child loads, so the modules that child imports count. */
function bindNodeArgv(masked, strings, env, fileAbs, noteSpec) {
  const decls = [];
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
  let m;
  while ((m = re.exec(masked))) {
    const name = m[1];
    const params = (m[2] !== undefined ? m[2] : m[3] || "").trim();
    let bodyStart = m.index + m[0].length;
    while (bodyStart < masked.length && /\s/.test(masked[bodyStart])) bodyStart++;
    let body = "";
    if (masked[bodyStart] === "{") {
      const end = matching(masked, bodyStart, "{", "}");
      if (end < 0) continue;
      body = masked.slice(bodyStart, end + 1);
    } else {
      let i = bodyStart, depth = 0;
      while (i < masked.length) {
        const c = masked[i];
        if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
        else if ((c === ";" || c === "\n") && depth === 0) break;
        i++;
      }
      body = masked.slice(bodyStart, i);
    }
    decls.push({ name, params, body, at: m.index, end: bodyStart + body.length });
  }
  const fnRe = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  while ((m = fnRe.exec(masked))) {
    const brace = m.index + m[0].length - 1;
    const end = matching(masked, brace, "{", "}");
    if (end < 0) continue;
    decls.push({ name: m[1], params: m[2], body: masked.slice(brace, end + 1), at: m.index, end });
  }
  for (const d of decls) {
    const paramNames = d.params.split(",").map(s => s.trim().replace(/^\.\.\./, "").split("=")[0].trim()).filter(Boolean);
    let argvParam = null;
    const spawnRe = /\b(?:spawnSync|spawn|execFileSync|execFile|fork)\s*\(/g;
    eachHead(d.body, spawnRe, args => {
      const parts = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) return;
      const cmd = parts[0];
      const cmdVal = evalExpr(cmd, env, strings, fileAbs);
      const node = cmd === "process.execPath" || cmdVal === process.execPath || cmdVal === "node" || cmdVal === "node.exe";
      if (!node) return;
      const second = parts[1].trim();
      const bare = second.replace(/^\.\.\./, "");
      if (paramNames.includes(bare)) argvParam = bare;
      else {
        for (const p of paramNames) {
          if (!/^[A-Za-z_$][\w$]*$/.test(p)) continue;
          if (new RegExp("\\b" + p + "\\b").test(second)) { argvParam = p; break; }
        }
      }
    });
    if (!argvParam) continue;
    const idx = paramNames.indexOf(argvParam);
    eachHead(masked, new RegExp("\\b" + d.name + "\\s*\\(", "g"), (args, index) => {
      if (index >= d.at && index < d.end) return;
      const argsList = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
      const slot = argsList[idx];
      if (!slot) return;
      let chunks;
      const open = slot.indexOf("[");
      if (open >= 0) {
        const end = matching(slot, open, "[", "]");
        chunks = depthSplit(end > 0 ? slot.slice(open + 1, end) : slot.slice(open + 1), ",");
      } else chunks = [slot];
      for (const el of chunks.map(s => s.trim()).filter(Boolean)) {
        const v = evalExpr(el, env, strings, fileAbs);
        if (typeof v === "string" && /\.(mjs|js|cjs)$/.test(v)) noteSpec(v, "load");
      }
    });
  }
}

const dynCache = new Map();

function declsOf(masked) {
  const decls = [];
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
  let m;
  while ((m = re.exec(masked))) {
    const params = (m[2] !== undefined ? m[2] : m[3] || "").trim();
    let bodyStart = m.index + m[0].length;
    while (bodyStart < masked.length && /\s/.test(masked[bodyStart])) bodyStart++;
    let body = "", end = bodyStart;
    if (masked[bodyStart] === "{") {
      end = matching(masked, bodyStart, "{", "}");
      if (end < 0) continue;
      body = masked.slice(bodyStart, end + 1);
    }
    decls.push({ name: m[1], params, body });
  }
  const fnRe = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  while ((m = fnRe.exec(masked))) {
    const brace = m.index + m[0].length - 1;
    const end = matching(masked, brace, "{", "}");
    if (end < 0) continue;
    decls.push({ name: m[1], params: m[2], body: masked.slice(brace, end + 1) });
  }
  return decls;
}

/* A function that import()s or require()s one of its parameters, including one hop
 * through another function in the same file (beforeBuild passes licenceModule to
 * packagedVendorKey, which imports it). */
function dynParams(abs) {
  const key = path.resolve(abs);
  if (dynCache.has(key)) return dynCache.get(key);
  const out = new Map();
  dynCache.set(key, out);
  let text;
  try { text = fs.readFileSync(key, "utf8"); } catch (e) { return out; }
  const { masked } = lex(text);
  const decls = declsOf(masked);
  for (const d of decls) {
    const params = d.params.match(/[A-Za-z_$][\w$]*/g) || [];
    out.set(d.name, { params, dyn: new Set(), body: d.body });
  }
  for (const info of out.values()) {
    for (const p of info.params) {
      if (new RegExp("\\b(?:import|require)\\s*\\([\\s\\S]{0,160}\\b" + p + "\\b").test(info.body)) info.dyn.add(p);
    }
  }
  for (let hop = 0; hop < 3; hop++) {
    let grew = false;
    for (const info of out.values()) {
      for (const [callee, cinfo] of out) {
        if (!cinfo.dyn.size) continue;
        const re = new RegExp("\\b" + callee + "\\s*\\(\\s*([A-Za-z_$][\\w$]*)", "g");
        let m;
        while ((m = re.exec(info.body))) {
          if (cinfo.dyn.has(cinfo.params[0]) && info.params.includes(m[1]) && !info.dyn.has(m[1])) {
            info.dyn.add(m[1]); grew = true;
          }
        }
      }
    }
    if (!grew) break;
  }
  return out;
}

function bindDynImports(masked, strings, env, fileAbs, root, noteSpec) {
  const locals = new Map();
  const named = /import\s*\{([^}]+)\}\s*from\s*"\uE000(\d+)\uE001"/g;
  let m;
  while ((m = named.exec(masked))) {
    const spec = strings[+m[2]];
    const hit = resolveSpec(fileAbs, spec, root);
    if (!hit) continue;
    for (const part of m[1].split(",")) {
      const bits = part.trim().split(/\s+as\s+/);
      if (!bits[0]) continue;
      const remote = bits[0].trim();
      const local = (bits.length > 1 ? bits[1] : bits[0]).trim();
      locals.set(local, { abs: hit, remote });
    }
  }
  /* A function in this file counts too. */
  for (const name of dynParams(fileAbs).keys()) locals.set(name, { abs: fileAbs, remote: name });
  const noteArg = (expr, dynName) => {
    if (!dynName) return;
    const v = evalExpr(expr, env, strings, fileAbs);
    if (typeof v === "string" && /\.(mjs|js|cjs)$/.test(v)) noteSpec(v, "load");
  };
  for (const [local, dest] of locals) {
    const info = dynParams(dest.abs).get(dest.remote);
    if (!info || !info.dyn.size) continue;
    eachHead(masked, new RegExp("\\b" + local + "\\s*\\(", "g"), args => {
      const argsList = depthSplit(args, ",").map(s => s.trim()).filter(Boolean);
      argsList.forEach((slot, i) => {
        const open = slot.indexOf("{");
        if (open >= 0 && info.dyn.size) {
          const end = matching(slot, open, "{", "}");
          const inner = end > 0 ? slot.slice(open + 1, end) : slot.slice(open + 1);
          for (const prop of depthSplit(inner, ",").map(s => s.trim()).filter(Boolean)) {
            const colon = prop.indexOf(":");
            const key = (colon < 0 ? prop : prop.slice(0, colon)).trim();
            const expr = colon < 0 ? prop : prop.slice(colon + 1).trim();
            if (info.dyn.has(key)) noteArg(expr, key);
          }
          return;
        }
        const pname = info.params[i];
        if (pname && info.dyn.has(pname)) noteArg(slot, pname);
      });
    });
  }
}

function walkArrays(masked, strings, env, fileAbs, root, noteFile) {
  const arrays = [];
  for (let i = 0; i < masked.length; i++) {
    if (masked.startsWith('"\uE000', i)) {
      const end = masked.indexOf('\uE001"', i);
      if (end > -1) { i = end + 1; continue; }
    }
    if (masked[i] !== "[") continue;
    const end = matching(masked, i, "[", "]");
    if (end < 0 || end - i > 800) continue;
    const inner = masked.slice(i + 1, end);
    const after = masked.slice(end + 1, end + 40);
    const before = masked.slice(Math.max(0, i - 40), i);
    const walked = /\.(?:flatMap|map|forEach|filter)\s*\(/.test(after) || /\bof\s*$/.test(before);
    if (!walked) continue;
    const els = depthSplit(inner, ",").map(s => s.trim()).filter(Boolean);
    const vals = [];
    let ok = true;
    for (const el of els) {
      const v = evalExpr(el, env, strings, fileAbs);
      if (typeof v !== "string") { ok = false; break; }
      vals.push(v);
    }
    if (ok && vals.length) arrays.push(vals);
  }
  if (!arrays.length) return;
  if (!/\b(?:readdirSync|readdir|readFileSync|readFile|cpSync|walk)\b/.test(masked)) return;
  for (const vals of arrays) {
    for (const v of vals) {
      const hit = path.isAbsolute(v) ? v : path.resolve(root, v);
      noteFile(hit, "read");
    }
  }
}

/* WINDOW-APP: a window gate launches the app, so the app's files count as its reads.
 * Studio: package.json main and what that file loads, plus ui/ and the pin files.
 * Engine: the same main, plus the shell, the page, and the modules. */
function coverApp(root, tracked, gateRel, files, dirs, refer, get) {
  const addRead = (rel, reader) => {
    if (!rel || !tracked.has(rel)) return;
    files.add(rel);
    if (!refer.has(rel)) refer.set(rel, new Set());
    refer.get(rel).add(reader);
  };
  const addDir = (d, reader) => {
    const norm = d.endsWith("/") ? d : d + "/";
    dirs.add(norm);
    const key = "dir:" + norm;
    if (!refer.has(key)) refer.set(key, new Set());
    refer.get(key).add(reader);
    for (const t of tracked) if (t.startsWith(norm)) files.add(t);
  };
  const studio = [...tracked].some(t => t.startsWith("ui/"));
  let mainRel = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (typeof pkg.main === "string" && pkg.main) mainRel = pkg.main.split("\\").join("/");
  } catch (e) { mainRel = null; }
  if (mainRel) {
    const seen = new Set();
    const queue = [path.resolve(root, mainRel)];
    while (queue.length) {
      const cur = queue.pop();
      let key;
      try { key = path.resolve(cur); } catch (e) { continue; }
      if (seen.has(key)) continue;
      seen.add(key);
      const rel = relOf(root, key);
      if (rel) addRead(rel, gateRel);
      let info;
      try { info = get(key); } catch (e) { continue; }
      for (const load of info.loads) queue.push(load);
      /* LAZY-APP: shell/main.js reaches src/studio.mjs through lazy(file), which joins ROOT, "src"
       * and the argument. That is a directory on this file, not a load, so the reads and the
       * directories count as well as the modules it imports. */
      for (const r of info.reads) addRead(r, gateRel);
      for (const d of info.dirs) addDir(d, gateRel);
    }
  }
  if (studio) {
    addDir("ui/", gateRel);
    addRead("tools/engine-pin", gateRel);
    addRead("tools/engine-modules.txt", gateRel);
  } else {
    addDir("shell/", gateRel);
    addDir("engine/", gateRel);
    addDir("src/modules/", gateRel);
    addRead("package.json", gateRel);
    addRead("electron-builder.js", gateRel);
  }
}

function windowKind(abs) {
  let text;
  try { text = fs.readFileSync(abs, "utf8"); }
  catch (e) { return "node"; }
  const { masked } = lex(text);
  const names = ["open" + "Studio", "run" + "Studio", "wall" + "OrThrow", "window" + "Wall", "shell" + "Launch"];
  for (const name of names) {
    const re = new RegExp("(?<!function\\s)\\b" + name + "\\s*\\((?!\\?)", "g");
    if (re.test(masked)) {
      if (name === "shell" + "Launch" && new RegExp("\\b" + name + "Refusal\\s*\\(").test(masked)
          && !new RegExp("(?<!Refusal)\\b" + name + "\\s*\\(").test(masked)) continue;
      return "window";
    }
  }
  return "node";
}

function discover(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const scripts = pkg.scripts || {};
  const byRel = new Map();
  for (const name of Object.keys(scripts)) {
    const cmd = String(scripts[name] || "");
    for (const part of cmd.split("&&")) {
      const m = /^\s*node\s+(\S+)(.*)$/.exec(part.trim());
      if (!m) continue;
      const rel = m[1].replace(/\\/g, "/");
      const abs = path.resolve(root, rel);
      if (!fs.existsSync(abs)) continue;
      let st;
      try { st = fs.statSync(abs); } catch (e) { continue; }
      if (!st.isFile()) continue;
      const command = ("node " + rel + (m[2] || "")).trim();
      const via = name === "test" ? "npm test" : "npm run " + name;
      if (!byRel.has(rel)) byRel.set(rel, { rel, abs, kind: windowKind(abs), vias: [], commands: [] });
      const g = byRel.get(rel);
      if (!g.vias.includes(via)) g.vias.push(via);
      if (!g.commands.includes(command)) g.commands.push(command);
    }
  }
  return [...byRel.values()].sort((a, b) => a.rel < b.rel ? -1 : 1);
}

function commandOf(g) {
  const test = g.commands.find(c => g.vias.includes("npm test") && g.commands.length);
  const prefer = g.vias.includes("npm test") ? g.commands[g.vias.indexOf("npm test")] : null;
  return prefer || g.commands[0];
}

export function analyzeTree(root) {
  const tracked = trackedFiles(root);
  knownNow = tracked;
  knownRoot = root;
  const cache = new Map();
  const get = abs => {
    const key = path.resolve(abs);
    if (!cache.has(key)) cache.set(key, analyze(key, root, tracked));
    return cache.get(key);
  };
  const gates = [];
  for (const g of discover(root)) {
    const files = new Set([g.rel]);
    const dirs = new Set();
    const refer = new Map();
    const seen = new Set();
    const queue = [g.abs];
    let wantsGlob = false;
    const globs = new Set();
    while (queue.length) {
      const abs = queue.pop();
      const key = path.resolve(abs);
      if (seen.has(key)) continue;
      seen.add(key);
      const info = get(key);
      const reader = relOf(root, key);
      if (info.wantsGlob) wantsGlob = true;
      for (const gl of info.globs) globs.add(gl);
      for (const load of info.loads) {
        const r = relOf(root, load);
        if (r && reader) {
          if (!refer.has(r)) refer.set(r, new Set());
          refer.get(r).add(reader);
        }
        queue.push(load);
      }
      for (const r of info.reads) {
        files.add(r);
        if (reader) {
          if (!refer.has(r)) refer.set(r, new Set());
          refer.get(r).add(reader);
        }
      }
      for (const d of info.dirs) {
        dirs.add(d);
        if (reader) {
          if (!refer.has("dir:" + d)) refer.set("dir:" + d, new Set());
          refer.get("dir:" + d).add(reader);
        }
      }
    }
    if (wantsGlob) {
      for (const gl of globs) {
        const prefix = gl.endsWith("/") ? gl : gl;
        const dir = prefix.endsWith("/") ? prefix : prefix;
        if (!dir) continue;
        const norm = dir.replace(/\/$/, "") + "/";
        dirs.add(norm);
        const reader = g.rel;
        if (!refer.has("dir:" + norm)) refer.set("dir:" + norm, new Set());
        refer.get("dir:" + norm).add(reader);
      }
    }
    for (const d of dirs) {
      for (const t of tracked) if (t.startsWith(d)) files.add(t);
    }
    if (g.kind === "window") coverApp(root, tracked, g.rel, files, dirs, refer, get);
    gates.push({
      rel: g.rel,
      kind: g.kind,
      vias: g.vias,
      command: commandOf(g),
      files, dirs, refer,
    });
  }
  return { root, tracked, gates };
}

function chainFor(gate, file) {
  const target = file.split(path.sep).join("/");
  if (target === gate.rel) return [gate.rel];
  const startReaders = new Set(gate.refer.get(target) || []);
  for (const d of gate.dirs) {
    if (target.startsWith(d)) for (const r of gate.refer.get("dir:" + d) || []) startReaders.add(r);
  }
  if (gate.files.has(target) && startReaders.size === 0 && target !== gate.rel) {
    /* reached, reader unknown: the gate loaded a module that named it */
  }
  const q = [];
  const prev = new Map();
  for (const r of startReaders) {
    q.push(r);
    prev.set(r, target);
  }
  const seen = new Set([target]);
  while (q.length) {
    const cur = q.shift();
    if (cur === gate.rel) {
      const chain = [gate.rel];
      let at = gate.rel;
      const guard = new Set();
      while (prev.has(at) && !guard.has(at)) {
        guard.add(at);
        at = prev.get(at);
        chain.push(at);
      }
      return chain.reverse();
    }
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const nxt of gate.refer.get(cur) || []) {
      if (!prev.has(nxt)) prev.set(nxt, cur);
      q.push(nxt);
    }
  }
  if (gate.files.has(target) || [...gate.dirs].some(d => target.startsWith(d))) return [target, gate.rel];
  return null;
}

function covers(gate, file) {
  const rel = file.split(path.sep).join("/");
  if (gate.files.has(rel)) return true;
  for (const d of gate.dirs) if (rel.startsWith(d)) return true;
  return false;
}

export function gatesFor(root, files) {
  const tree = analyzeTree(root);
  const rows = [];
  for (const g of tree.gates) {
    const chains = [];
    for (const f of files) {
      const rel = path.isAbsolute(f) ? (relOf(root, f) || f) : f.split(path.sep).join("/");
      if (!covers(g, rel)) continue;
      chains.push({ file: rel, chain: chainFor(g, rel) });
    }
    if (!chains.length) continue;
    rows.push({ gate: g.rel, kind: g.kind, via: g.vias, command: g.command, chains });
  }
  return rows;
}

function printRows(files, rows) {
  if (!files.length) {
    process.stdout.write("no change against main\n");
  }
  for (const f of files) {
    const rel = f.split(path.sep).join("/");
    const hit = rows.filter(r => r.chains.some(c => c.file === rel || c.file.endsWith(rel)));
    if (!hit.length) process.stdout.write(rel + "\n  no gate reads it\n");
  }
  for (const r of rows) {
    process.stdout.write(r.gate + "  " + r.kind + "  " + r.via.join(", ") + "\n");
    process.stdout.write("  command: " + r.command + "\n");
    for (const c of r.chains) process.stdout.write("  chain: " + c.chain.join(" -> ") + "\n");
  }
  process.stdout.write("#gates " + rows.length + "\n");
  process.stdout.write(JSON.stringify({ files, gates: rows }) + "\n");
}

function main() {
  const root = path.resolve(path.dirname(SELF), "..");
  const args = process.argv.slice(2);
  let files;
  if (!args.length) files = changedFiles(root);
  else {
    files = args.map(a => {
      if (path.isAbsolute(a)) {
        const rel = relOf(root, a);
        if (!rel) { process.stderr.write("not in this tree: " + a + "\n"); process.exitCode = 2; return null; }
        return rel;
      }
      return a.split(path.sep).join("/");
    }).filter(Boolean);
  }
  if (process.exitCode) return;
  const rows = gatesFor(root, files);
  printRows(files, rows);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(SELF).toLowerCase();
if (invoked) main();