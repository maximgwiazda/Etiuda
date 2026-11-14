/* THE eSIGNER ROUTE: ETIUDA_SIGN=esigner signs each file electron-builder hands its hook through SSL.com's CodeSignTool, with
 * the four values read from the Windows keyring, and then reads the file's Authenticode signature back: signed by the
 * certificate the account holds, timestamped, or the build stops. ETIUDA_SIGN=esigner-demo does the same against SSL.com's
 * sandbox with its published demo account (tests/esigner-demo.json), whose signature no release takes (tools/sellable.mjs).
 * Unset or empty, the route gives no block and electron-builder.js's is the one it always was. CodeSignTool is fetched by
 * hand into a tools-external folder above the tree and pinned by hash below; nothing is downloaded at build time. */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");

const SIGN_VAR = "ETIUDA_SIGN";
const MODES = ["esigner", "esigner-demo"];
const KEYRING_SERVICE = "etiuda-esigner";
const KEYS = ["username", "password", "credential-id", "totp-secret"];
const TOOL = { folder: "codesigntool-1.3.3", jar: "jar/code_sign_tool-1.3.3.jar", java: "jdk-11.0.2/bin/java.exe",
  sha256: { "jar/code_sign_tool-1.3.3.jar": "caa356347aa64ba04666545d548dad87211c9aa960f16db8797a880a67ba91d1",
    "jdk-11.0.2/bin/java.exe": "bb8df03053f4f60ff36ec9df61eadc75bcd551cf94210d96896129b1ab6239a0" } };
/* The demo certificate's subject carries this unit; tools/sellable.mjs refuses any signature that does. */
const DEMO_SUBJECT = /(^|[,\n]\s*)OU=Cloud Signing Demo\s*($|[,\n])/;

function given(env) { const v = env && env[SIGN_VAR]; return typeof v === "string" ? v : ""; }
function mode(env) {
  const v = given(env);
  if (v && MODES.indexOf(v) < 0) throw new Error("signing: " + SIGN_VAR + " is " + JSON.stringify(v) + "; it takes " + MODES.join(" or "));
  return v;
}

/* Effects, each one replaceable by a leg (tests/sellable.mjs) so the hook can be driven with nothing started or reached. */
const io = {
  /* Raw reads of generic credentials by target name: [UserName, base64 of the blob] or null. */
  readCredentials(targets) {
    const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
    const script = "$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'\n"
      + "using System; using System.Runtime.InteropServices;\n"
      + "public static class EtiudaCred {\n"
      + " [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct C { public int Flags; public int Type; public string TargetName;"
      + " public string Comment; public uint WrittenLow; public uint WrittenHigh; public int BlobSize; public IntPtr Blob; public int Persist; public int AttributeCount;"
      + " public IntPtr Attributes; public string TargetAlias; public string UserName; }\n"
      + " [DllImport(\"advapi32.dll\", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredReadW(string t, int type, int f, out IntPtr c);\n"
      + " [DllImport(\"advapi32.dll\")] static extern void CredFree(IntPtr c);\n"
      + " public static string Read(string t) { IntPtr p; if (!CredReadW(t, 1, 0, out p)) return \"\"; try { C c = (C)Marshal.PtrToStructure(p, typeof(C));"
      + " byte[] b = new byte[c.BlobSize]; if (c.BlobSize > 0) Marshal.Copy(c.Blob, b, 0, c.BlobSize);"
      + " return \"|\" + Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(c.UserName ?? \"\")) + \"|\" + Convert.ToBase64String(b); } finally { CredFree(p); } }\n"
      + "}\n'@\n"
      + "foreach ($t in @(" + targets.map(lit).join(",") + ")) { [EtiudaCred]::Read($t) }";
    let out;
    /* A failed run's error carries its stdout, which may hold a value: only its first stderr line goes on. */
    try {
      out = child.execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8", windowsHide: true, timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { throw new Error("signing: the keyring could not be read: " + String(e.stderr || e.message || "").split(/\r?\n/)[0]); }
    const rows = out.split(/\r?\n/).slice(0, targets.length);
    return targets.map((t, i) => {
      const m = /^\|([^|]*)\|(.*)$/.exec(rows[i] || "");
      return m ? [Buffer.from(m[1], "base64").toString("utf16le"), m[2]] : null;
    });
  },
  /* The end certificate among the chain files get_certs wrote: its SHA-1 thumbprint and subject. */
  leaf(dir) {
    const c = fs.readdirSync(dir).map(f => new crypto.X509Certificate(fs.readFileSync(path.join(dir, f)))).find(x => !x.ca);
    return c ? { thumbprint: c.fingerprint.replace(/:/g, "").toUpperCase(), subject: c.subject } : null;
  },
  run(file, args, opts) { return child.spawnSync(file, args, Object.assign({ encoding: "utf8", windowsHide: true, timeout: 300000 }, opts)); },
  /* What Windows says of one signed file. */
  readSignature(file) {
    const q = "'" + String(file).replace(/'/g, "''") + "'";
    const script = "$s = Get-AuthenticodeSignature -LiteralPath " + q + "; [string]$s.Status + [char]9 + [string]([bool]$s.TimeStamperCertificate)"
      + " + [char]9 + [string]$s.SignerCertificate.Thumbprint + [char]9 + [string]$s.SignerCertificate.Subject";
    const out = child.execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true, timeout: 120000 }).trim();
    const [status, ts, thumbprint, subject] = out.split("\t");
    return { status: (status || "").trim(), timestamped: (ts || "").trim() === "True", thumbprint: (thumbprint || "").trim().toUpperCase(), subject: (subject || "").trim() };
  },
  /* The user's temporary folder, where each call's argument folder lives. */
  tmp() { return os.tmpdir(); },
  now() { return Date.now(); },
  log(line) { console.log(line); },
};

/* python-keyring's Windows rule, which tools/esigner-keep.py writes by: a name sits under the service's own target while it
   was the last stored there, and under "<name>@<service>" otherwise. */
function fromKeyring(service = KEYRING_SERVICE) {
  const targets = [service].concat(KEYS.map(k => k + "@" + service));
  const read = io.readCredentials(targets);
  const own = read[0], out = {}, missing = [];
  KEYS.forEach((k, i) => {
    const hit = own && own[0] === k ? own : read[i + 1];
    const value = hit ? Buffer.from(hit[1], "base64").toString("utf16le") : "";
    if (value) out[k] = value; else missing.push(k);
  });
  if (missing.length) throw new Error("signing: the keyring's " + service + " holds no " + missing.join(", ")
    + "; store them with the office's esigner-keep command");
  return out;
}

/* The demo account, published by SSL.com for its sandbox. */
function demoValues() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "esigner-demo.json"), "utf8"));
  return { values: { username: d.username, password: d.password, "credential-id": d.credentialId, "totp-secret": d.totpSecret },
    properties: d.properties };
}

/* CodeSignTool in a tools-external folder at or above `root`, its pinned files matching their hashes. */
function findTool(root) {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const at = path.join(dir, "tools-external", TOOL.folder);
    if (fs.existsSync(at)) {
      for (const [rel, want] of Object.entries(TOOL.sha256)) {
        const file = path.join(at, rel);
        const got = fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "missing";
        if (got !== want) throw new Error("signing: " + file + " is not the pinned CodeSignTool file (sha256 " + got + ")");
      }
      return at;
    }
    if (path.dirname(dir) === dir) throw new Error("signing: no tools-external/" + TOOL.folder + " at or above " + root);
  }
}

/* Picocli's argument file: each value quoted, a backslash and a quote escaped, since # opens a comment outside quotes. */
function argFileText(pairs) {
  return pairs.map(([flag, value]) => {
    if (/[\x00-\x1f]/.test(value)) throw new Error("signing: the " + flag.slice(1) + " value holds a control character");
    return flag + "\n\"" + value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"\n";
  }).join("");
}

function scrub(text, values) {
  let t = String(text || "");
  for (const v of values) if (v) t = t.split(v).join("[hidden]");
  return t;
}

/* A packaging command killed mid-call skips the call's clean-up and leaves its argument folder, values in it. Each session
   first removes this tool's own folders, by their exact prefix, older than any call can run (its timeout is 5 minutes);
   a younger one may be another build's call in flight. Links are left alone. */
const ARGS_PREFIX = "etiuda-esigner-";
const STALE_MS = 10 * 60 * 1000;
function sweepStale() {
  const root = io.tmp(), now = Date.now();
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith(ARGS_PREFIX)) continue;
    const at = path.join(root, name);
    let st;
    try { st = fs.lstatSync(at); } catch { continue; }
    if (st.isDirectory() && !st.isSymbolicLink() && now - st.mtimeMs > STALE_MS) fs.rmSync(at, { recursive: true, force: true });
  }
}

/* One session per packaging command: the values, the tool, a working folder for its configuration and log, and the
   account's own certificate, which every signed file must carry. */
function session(kind, root, output) {
  sweepStale();
  const tool = findTool(root);
  const demo = kind === "esigner-demo" ? demoValues() : null;
  const values = demo ? demo.values : fromKeyring();
  const work = path.resolve(output, ".esigner");
  fs.mkdirSync(path.join(work, "conf"), { recursive: true });
  /* EACH BUILD'S RECORD BEGINS EMPTY: one an earlier build left in this output folder is set aside beside it under the time,
     never deleted, so a release reads only this build's certificate (tools/sellable.mjs ourPublisher). */
  const record = path.join(work, "signings.jsonl"), stamp = new Date(io.now()).toISOString().replace(/[:.]/g, "-");
  for (let i = 0, to; fs.existsSync(record); i++) if (!fs.existsSync(to = path.join(work, "signings-" + stamp + (i ? "-" + i : "") + ".jsonl"))) fs.renameSync(record, to); /* plant:esigner-fresh-record */
  const props = demo ? Object.entries(demo.properties).map(([k, v]) => k + "=" + v).join("\n") + "\n"
    : fs.readFileSync(path.join(tool, "conf", "code_sign_tool.properties"), "utf8");
  fs.writeFileSync(path.join(work, "conf", "code_sign_tool.properties"), props);
  const s = { kind, tool, work, values, signed: 0 };
  const certs = fs.mkdtempSync(path.join(work, "certs-"));
  call(s, "get_certs", [["-credential_id", values["credential-id"]]], ["-output_dir_path=" + certs]);
  const leaf = io.leaf(certs);
  if (!leaf) throw new Error("signing: the account's certificate chain in " + certs + " holds no end certificate");
  s.thumbprint = leaf.thumbprint;
  s.subject = leaf.subject;
  if (DEMO_SUBJECT.test(s.subject) !== !!demo) throw new Error("signing: " + SIGN_VAR + "=" + kind + " and the account's certificate is "
    + (demo ? "not the demo one: " : "the demo one: ") + s.subject.replace(/\n/g, ", "));
  return s;
}

/* One CodeSignTool command, the account's values in an argument file that lives only for the call, never on the command line
   or in an environment. Java reads the Windows root store: the bundled runtime's own lacks the root SSL.com's hosts use. */
function call(s, command, extra, plain) {
  const v = s.values;
  const pairs = [["-username", v.username], ["-password", v.password]].concat(command === "sign" ? [["-totp_secret", v["totp-secret"]]] : [], extra);
  const dir = fs.mkdtempSync(path.join(io.tmp(), ARGS_PREFIX));
  const argFile = path.join(dir, "args");
  let r;
  try {
    fs.writeFileSync(argFile, argFileText(pairs), { mode: 0o600 });
    r = io.run(path.join(s.tool, TOOL.java), ["-Djavax.net.ssl.trustStoreType=Windows-ROOT", "-jar", path.join(s.tool, TOOL.jar),
      command, "@" + argFile].concat(plain), { cwd: s.work, env: Object.assign({}, process.env, { CODE_SIGN_TOOL_PATH: s.work }) });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  if (!r || r.status !== 0) throw new Error("signing: CodeSignTool " + command + " exited " + (r && r.status) + ": "
    + scrub(((r && r.stdout) || "") + ((r && r.stderr) || "") + ((r && r.error && r.error.message) || ""), Object.values(v)).trim().slice(0, 600));
  return r;
}

/* The hook electron-builder calls once a file (signingHashAlgorithms sha256 alone). Signed into a fresh folder, copied over the
   file, and read back from where it now stands: the tool's exit code is not taken as the answer. */
function signer(kind, root, output) {
  let opened = null;
  return async function esignerSign(configuration) {
    const file = configuration.path;
    const s = opened || (opened = session(kind, root, output));
    const out = fs.mkdtempSync(path.join(s.work, "signed-"));
    const started = io.now();
    call(s, "sign", [["-credential_id", s.values["credential-id"]]], ["-input_file_path=" + file, "-output_dir_path=" + out]);
    const ms = io.now() - started;
    const made = path.join(out, path.basename(file));
    if (!fs.existsSync(made)) throw new Error("signing: CodeSignTool reported success and wrote no " + made);
    fs.copyFileSync(made, file);
    const r = io.readSignature(file);
    const fine = kind === "esigner" ? ["Valid"] : ["Valid", "UnknownError"];
    const wrong = [fine.indexOf(r.status) < 0 && "reads Authenticode " + r.status, !r.timestamped && "has no timestamp",
      r.thumbprint !== s.thumbprint && "is signed by " + (r.thumbprint || "nothing") + ", not the account's " + s.thumbprint].filter(Boolean);
    if (wrong.length) throw new Error("signing: " + file + " " + wrong.join(", and "));
    s.signed++;
    fs.appendFileSync(path.join(s.work, "signings.jsonl"), JSON.stringify({ file: path.basename(file), ms, status: r.status, thumbprint: r.thumbprint }) + "\n");
    io.log("  eSigner" + (kind === "esigner-demo" ? " (sandbox)" : "") + ": " + path.basename(file) + " signed in " + ms + " ms, read back "
      + r.status + " and timestamped, signing " + s.signed + " of this build");
  };
}

/* electron-builder.js's block for the route, or null where the variable is unset. */
function esignerSigning(env, root, output) {
  const kind = mode(env);
  if (!kind) return null; /* plant:esigner-default */
  return { signtoolOptions: { sign: signer(kind, root, output), signingHashAlgorithms: ["sha256"] } };
}

module.exports = { SIGN_VAR, MODES, KEYRING_SERVICE, KEYS, TOOL, DEMO_SUBJECT, io, given, mode, fromKeyring, findTool, argFileText,
  esignerSigning };
