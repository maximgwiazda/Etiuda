/* THE CATALOG'S EXTENSION KEY AT UNINSTALL (shell/installer.nsh customUnInstall): electron-builder's APP_UNASSOCIATE takes the
 * class and its OpenWithProgids value and never the .ec key, so the desk's uninstall takes the key itself while it is ours alone,
 * and leaves it where another program has a claim. Node only: no installer is built or run. The block is read out of the script
 * and run here by a small interpreter of the NSIS it uses, against a stand-in registry, case by case; every guard line is planted.
 *     node tests/uninstall-ext.mjs        exit code is the number of failed checks, capped at 63 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const NSH_AT = process.env.UNINSTALL_EXT_NSH || path.join(ROOT, "shell", "installer.nsh");
const NSH = fs.readFileSync(NSH_AT, "utf8").replace(/\r\n/g, "\n");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const EXPECTED = 6;

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the block: from the extension's defines to the end of its ${IfNot} ${isUpdated}, inside customUnInstall's link section */
function blockOf(text) {
  const mac = text.indexOf("\n!macro customUnInstall\n"), end = text.indexOf("\n!macroend", mac);
  const body = mac < 0 ? "" : text.slice(mac, end);
  const at = body.indexOf("!ifndef ETIUDA_EC_EXT"), mark = body.indexOf("# plant:ext-updated", at), from = body.lastIndexOf("\n", mark) + 1;
  if (at < 0 || mark < 0) return null;
  const lines = body.slice(from).split("\n");
  let depth = 0, out = [];
  for (const l of lines) {
    const t = l.trim();
    out.push(t);
    if (/^\$\{(If|IfNot)\}/.test(t)) depth++;
    if (/^\$\{EndIf\}/.test(t)) { depth--; if (depth === 0) break; }
  }
  const guard = body.lastIndexOf("!ifmacrodef unregisterFileAssociations", at) >= 0 && body.indexOf("!endif", from) > from;
  const defs = {};
  for (const m of body.slice(at, from).matchAll(/!define (\w+) "([^"]*)"/g)) defs[m[1]] = m[2];
  return { lines: out, defs, guard };
}

/* ---- a small interpreter of the NSIS the block uses, over a stand-in registry ------------------------------------------ */
function tokens(line) {
  const code = line.replace(/\s+#\s*plant:[\w-]+\s*$/, "");
  return (code.match(/"[^"]*"|\S+/g) || []).map(t => t);
}
function run(block, reg, opts) {
  const vars = {}, stack = [];
  let errors = false;
  const val = t => {
    let s = t.startsWith("\"") ? t.slice(1, -1) : t;
    s = s.replace(/\$\{(\w+)\}/g, (m, k) => (k in block.defs ? block.defs[k] : m));
    return s.replace(/\$R\d/g, m => vars[m] || "");
  };
  const hive = h => (h === "SHELL_CONTEXT" ? opts.context : h);
  const keyOf = (h, k) => (hive(h) + "\\" + val(k)).toLowerCase();
  const cond = toks => {
    if (toks.join(" ") === "${Errors}") return errors;
    if (toks.join(" ") === "${isUpdated}") return !!opts.updated;
    const [a, op, b] = toks;
    /* LogicLib's == and != are StrCmp, which ignores case. */
    if (op === "==") return val(a).toLowerCase() === val(b).toLowerCase();
    if (op === "!=") return val(a).toLowerCase() !== val(b).toLowerCase();
    if (op === ">") return Number(val(a)) > Number(val(b));
    throw new Error("a condition this interpreter does not read: " + toks.join(" "));
  };
  /* Parse into a tree: [{kind, ...}] */
  let i = 0;
  const L = block.lines.map(tokens);
  function parse(stop) {
    const out = [];
    while (i < L.length) {
      const t = L[i];
      if (!t.length) { i++; continue; }
      const w = t[0];
      if (stop.includes(w)) return out;
      if (w === "${If}" || w === "${IfNot}") {
        const node = { kind: "if", arms: [], otherwise: null };
        let conds = [{ op: "and", not: w === "${IfNot}", toks: t.slice(1) }];
        i++;
        for (;;) {
          while (L[i] && (L[i][0] === "${AndIf}" || L[i][0] === "${OrIf}")) { conds.push({ op: L[i][0] === "${AndIf}" ? "and" : "or", toks: L[i].slice(1) }); i++; }
          const body = parse(["${ElseIf}", "${Else}", "${EndIf}"]);
          node.arms.push({ conds, body });
          const w2 = L[i][0];
          if (w2 === "${ElseIf}") { conds = [{ op: "and", toks: L[i].slice(1) }]; i++; continue; }
          if (w2 === "${Else}") { i++; node.otherwise = parse(["${EndIf}"]); }
          i++; break;
        }
        out.push(node);
      } else if (w === "${DoWhile}") {
        i++;
        const body = parse(["${Loop}"]);
        i++;
        out.push({ kind: "while", toks: t.slice(1), body });
      } else { out.push({ kind: "cmd", t }); i++; }
    }
    return out;
  }
  const tree = parse([]);
  const EXIT = {};
  const truth = conds => conds.reduce((acc, c, k) => {
    const v = c.not ? !cond(c.toks) : cond(c.toks);
    return k === 0 ? v : c.op === "and" ? acc && v : acc || v;
  }, true);
  function exec(nodes) {
    for (const n of nodes) {
      if (n.kind === "if") {
        const arm = n.arms.find(a => truth(a.conds));
        if (arm) exec(arm.body); else if (n.otherwise) exec(n.otherwise);
      } else if (n.kind === "while") {
        for (let guard = 0; cond(n.toks); guard++) {
          if (guard > (opts.guard || 100)) throw new Error("a loop that does not end");
          try { exec(n.body); } catch (e) { if (e === EXIT) break; throw e; }
        }
      } else {
        const [w, ...a] = n.t;
        if (w === "Push") stack.push(vars[a[0]] || "");
        else if (w === "Pop") vars[a[0]] = stack.pop();
        else if (w === "StrCpy") { const s = val(a[1]); vars[a[0]] = a.length > 3 ? s.slice(Number(a[3])) : s; }
        else if (w === "IntOp") vars[a[0]] = String(Number(val(a[1])) + Number(val(a[3])));
        else if (w === "ClearErrors") errors = false;
        else if (w === "ReadRegStr") { const k = reg[keyOf(a[1], a[2])]; const v = k && k.values[val(a[3])]; vars[a[0]] = v === undefined ? "" : v; if (v === undefined) errors = true; }
        else if (w === "EnumRegValue" && opts.endless && opts.endless.what === val(a[2]).split("\\").pop().toLowerCase()) vars[a[0]] = opts.endless.name;
        else if (w === "EnumRegKey" && opts.endless && opts.endless.what === "subkeys") vars[a[0]] = opts.endless.name;
        else if (w === "EnumRegValue") {
          const k = reg[keyOf(a[1], a[2])], names = k ? Object.keys(k.values) : [], n2 = Number(val(a[3]));
          if (n2 < names.length) vars[a[0]] = names[n2]; else { vars[a[0]] = ""; errors = true; }
        } else if (w === "EnumRegKey") {
          const base = keyOf(a[1], a[2]) + "\\", subs = [...new Set(Object.keys(reg).filter(p => p.startsWith(base)).map(p => p.slice(base.length).split("\\")[0]))];
          const n2 = Number(val(a[3]));
          if (n2 < subs.length) vars[a[0]] = subs[n2]; else { vars[a[0]] = ""; errors = true; }
        } else if (w === "DeleteRegKey") { const k = keyOf(a[0], a[1]); for (const p of Object.keys(reg)) if (p === k || p.startsWith(k + "\\")) delete reg[p]; }
        else if (w === "${ExitDo}") throw EXIT;
        else throw new Error("a command this interpreter does not read: " + n.t.join(" "));
      }
    }
  }
  exec(tree);
  return reg;
}

/* ---- the cases: the stand-in registry as APP_ASSOCIATE leaves it, and each claim another program can make ------------- */
function cases(block) {
  const ext = block.defs.ETIUDA_EC_EXT, cls = (block.defs.ETIUDA_EC_CLASS_KEY || "").slice(17);
  const fresh = (ctx, over) => {
    const r = {};
    const put = (p, values) => { r[(ctx + "\\" + p).toLowerCase()] = { values: Object.assign({}, values) }; };
    put("Software\\Classes\\." + ext, { "": cls });
    put("Software\\Classes\\." + ext + "\\OpenWithProgids", { [cls]: "" });
    if (over) over(put, r);
    return r;
  };
  const gone = (reg, ctx) => !Object.keys(reg).some(p => p === (ctx + "\\software\\classes\\." + ext).toLowerCase());
  const out = {};
  for (const ctx of ["HKCU", "HKLM"]) {
    /* A loop the step guard had to stop reads "hang": in the installer it is a silent uninstall that never ends. */
    const R = (over, opts) => {
      try { return gone(run(block, fresh(ctx, over), Object.assign({ context: ctx }, opts)), ctx); }
      catch (e) { if (/does not end/.test(e.message)) return "hang"; throw e; }
    };
    out[ctx] = {
      unclaimed: R(),
      updated: R(null, { updated: true }),
      otherDefault: R(put => put("Software\\Classes\\." + ext, { "": "Another.Program" })),
      otherProgid: R(put => put("Software\\Classes\\." + ext + "\\OpenWithProgids", { [cls]: "", "Another.Program": "" })),
      otherValue: R(put => put("Software\\Classes\\." + ext, { "": cls, "Content Type": "application/x-other" })),
      otherSubkey: R(put => put("Software\\Classes\\." + ext + "\\ShellNew", { NullFile: "" })),
      userChoiceOther: R(put => { put("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\." + ext + "\\UserChoice", { ProgId: "Another.Program" }); }),
      userChoiceOurs: R(put => { put("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\." + ext + "\\UserChoice", { ProgId: cls }); }),
      /* An enumeration that never raises the error flag (the two value loops answering "" for ever, the subkey loop our own
         subkey for ever), with the interpreter's step guard lifted well past the cap, so it is the cap that ends each one. */
      endlessProgids: R(null, { guard: 10000, endless: { what: "openwithprogids", name: "" } }),
      endlessValues: R(null, { guard: 10000, endless: { what: "." + ext, name: "" } }),
      endlessSubkeys: R(null, { guard: 10000, endless: { what: "subkeys", name: "OpenWithProgids" } }),
    };
    if (ctx === "HKLM") {
      /* The UserChoice is the uninstalling account's, in HKCU, whichever hive the install wrote. */
      out[ctx].userChoiceOther = gone(run(block, Object.assign(fresh(ctx), { ["hkcu\\software\\microsoft\\windows\\currentversion\\explorer\\fileexts\\." + ext + "\\userchoice"]: { values: { ProgId: "Another.Program" } } }), { context: ctx }), ctx);
    }
  }
  return out;
}
const WANT = { unclaimed: true, updated: false, otherDefault: false, otherProgid: false, otherValue: false, otherSubkey: false, userChoiceOther: false, userChoiceOurs: true,
  endlessProgids: false, endlessValues: false, endlessSubkeys: false };
const holds = r => ["HKCU", "HKLM"].every(c => Object.keys(WANT).every(k => r[c][k] === WANT[k]));

try {
  const block = blockOf(NSH);
  check(!!block && block.guard && block.lines.length > 10, "ue1 customUnInstall carries the extension key's block, inside the association guard and its own ${IfNot} ${isUpdated}"
    + (block ? ", " + block.lines.length + " lines" : ": not found in " + path.relative(ROOT, NSH_AT)));
  const cfg = require(path.join(ROOT, "electron-builder.js"));
  const assoc = (cfg.fileAssociations || [])[0] || {};
  check(!!block && block.defs.ETIUDA_EC_EXT === assoc.ext && block.defs.ETIUDA_EC_CLASS_KEY === "Software\\Classes\\" + assoc.name && "Software\\Classes\\".length === 17,
    "ue2 its extension and class are electron-builder.js's association (." + assoc.ext + ", " + assoc.name + "), the class read past 17 characters of Software\\Classes\\");
  const r = block ? cases(block) : null;
  check(!!r && holds(r), "ue3 per-user and all-users: an unclaimed key goes, as with this account's UserChoice naming our class; an update, another default,"
    + " another OpenWithProgids entry, another value, another subkey, another program's UserChoice, or an enumeration that never ends (stopped by"
    + " its 256-entry cap, the step guard lifted) each keep it: " + JSON.stringify(r));
  const I = require(path.join(ROOT, "tools", "test-identity.cjs"));
  const own = I.ownNamesNsh(NSH), tb = blockOf(own.text);
  check(own.left.length === 0 && own.counts.ext === 1 && !!tb && tb.defs.ETIUDA_EC_EXT === I.TEST.desk.ext
    && tb.defs.ETIUDA_EC_CLASS_KEY === "Software\\Classes\\" + I.TEST.desk.catalogClass && holds(cases(tb)),
    "ue4 the test build's copy names its own ." + I.TEST.desk.ext + " and " + I.TEST.desk.catalogClass + " and behaves the same, so the runner's leg measures this block");
  const PLANTS = [
    ["ext-updated", "${IfNot} ${isUpdated} # plant:ext-updated", "${IfNot} ${Errors} # plant:ext-updated"],
    ["ext-default", "${If} $R3 != $R5 # plant:ext-default", "${If} 1 == 0 # plant:ext-default"],
    ["ext-progids", "${AndIf} $R3 != $R5 # plant:ext-progids", "${AndIf} 1 == 0 # plant:ext-progids"],
    ["ext-values", "StrCpy $R5 \"\" # plant:ext-values", "IntOp $R3 0 + 0 # plant:ext-values"],
    ["ext-subkeys", "${ElseIf} $R3 != \"OpenWithProgids\" # plant:ext-subkeys", "${ElseIf} 1 == 0 # plant:ext-subkeys"],
    ["ext-userchoice", "${AndIf} $R3 != $R5 # plant:ext-userchoice", "${AndIf} 1 == 0 # plant:ext-userchoice"],
    ["ext-cap-progids", "${If} $R4 > 255 # plant:ext-cap-progids", "${If} 1 == 0 # plant:ext-cap-progids"],
    ["ext-cap-values", "${If} $R4 > 255 # plant:ext-cap-values", "${If} 1 == 0 # plant:ext-cap-values"],
    ["ext-cap-subkeys", "${If} $R4 > 255 # plant:ext-cap-subkeys", "${If} 1 == 0 # plant:ext-cap-subkeys"],
    ["ext-gone", "DeleteRegKey SHELL_CONTEXT \"Software\\Classes\\.${ETIUDA_EC_EXT}\" # plant:ext-gone", "IntOp $R3 0 + 0 # plant:ext-gone"],
  ];
  if (PLANTS_OFF) { skipped += 2; console.log("  skip ue5, ue6 (ETIUDA_PLANTS=off)"); }
  else {
    const said = PLANTS.map(([tag, from, to]) => {
      if (NSH.split(from).length !== 2) return tag + " anchor missing";
      try { const b = blockOf(NSH.replace(from, to)); return holds(cases(b)) ? tag + " stayed green" : tag + " red"; } catch (e) { return tag + " " + e.message; }
    });
    check(said.every(s => / red$/.test(s)), "ue5 each guard line of the block put in another form turns ue3 red: " + said.join(", "));
    /* ue6: tools/test-identity.cjs with its extension rename taken out, copied beside this run and loaded: the define is left. */
    const tiSrc = fs.readFileSync(path.join(ROOT, "tools", "test-identity.cjs"), "utf8");
    const tiLifted = tiSrc.replace(".replace(EXT_RE, \"$1\" + t.ext)", "");
    const tiAt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-uninstall-ext-")), "test-identity.cjs");
    fs.writeFileSync(tiAt, tiLifted);
    const left = require(tiAt).ownNamesNsh(NSH).left;
    fs.rmSync(path.dirname(tiAt), { recursive: true, force: true });
    check(tiLifted !== tiSrc && left.length === 1 && /!define ETIUDA_EC_EXT "ec"/.test(left[0]),
      "ue6 with the extension rename taken out of tools/test-identity.cjs, the shipped define is left and named, so the test build refuses: " + left.join(" | "));
  }
} catch (e) {
  failed++;
  console.log("  FAIL " + String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
}
console.log("#counts checks=" + asserted + " failed=" + failed + " skipped=" + skipped + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) { console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran"); process.exit(78); }
console.log(failed ? "uninstall-ext: " + failed + " failed" : "uninstall-ext: all " + asserted + " passed");
process.exit(Math.min(failed, 63));
