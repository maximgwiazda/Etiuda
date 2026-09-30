/* WHETHER A BUILD CAN BE SOLD, asked by tools/release.mjs and held by tests/sellable.mjs.
 *
 * The rest of the release sequence proves that a build is what the tree says. None of it asked
 * whether the build can be put in front of a customer, so an installer whose licence page names
 * no seller, or one signed badly, went through every gate green (the code-pass survey of
 * 2026-09-27, findings 29 and 30). This file is the functions that ask, kept apart from
 * tools/release.mjs because that file builds a scratch home and runs gates the moment it is
 * loaded, so nothing in it can be called on its own. Every function here can.
 *
 * A CUSTOMER BUILD AND A PREVIEW ARE TOLD APART BY THE VERSION, which is what the customer sees
 * (the installer's file name, the About line, Add or remove programs), so a preview handed to
 * somebody by mistake says so on its face. A version is a customer's when it is a bare x.y.z with
 * a major of 1 or more; a prerelease part (2.0.0-dev) or a major of 0 (0.1.0, semver's "initial
 * development") is a preview. A preview packages as it always has, and the release prints what
 * would stop it as a customer's. `--customer` asks the customer's questions of any version, which
 * is how the refusal is rehearsed on a preview tree, and it cannot be used to skip them: nothing
 * turns them off for a customer version.
 *
 * What a customer build must be, each a reason it is refused:
 *   - a customer's version, by the rule above;
 *   - a licence page with no bracketed placeholder left in it ([Seller's legal name]);
 *   - signed: the builder configured with a certificate before the build, and after it every
 *     file checked reads Authenticode Valid with a timestamp.
 * The signature is also required of a PREVIEW whenever a certificate is configured, because a
 * signing that was asked for and did not come out Valid is a fault whoever the build is for. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Is this version a customer's? Bare x.y.z, major 1 or more. */
export function customerVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || ''));
  return !!m && Number(m[1]) >= 1;
}

/** Why this version cannot be sold, or nothing. */
export function versionProblems(version) {
  const v = String(version || '');
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(v);
  if (!m) return ['the version ' + JSON.stringify(v) + ' is not x.y.z'];
  if (m[4]) return ['the version ' + v + ' carries a prerelease or build part (' + m[4] + '), which marks a preview'];
  if (Number(m[1]) < 1) return ['the version ' + v + ' has major 0, which marks a preview'];
  return [];
}

/* THE LICENCE PAGES ARE FOUND AS THE BUILDER FINDS THEM, by name in buildResources: license.txt,
   eula.txt and license_<lang>.txt, in any of the three kinds app-builder-lib reads. Every one is
   read, since the installer shows whichever matches its language. */
const PAGE = /^(license|eula)(_[a-z]{2}(_[a-z]{2})?)?\.(txt|rtf|html)$/i;
export function licencePages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => PAGE.test(f)).sort().map(f => join(dir, f));
}

/* A PLACEHOLDER IS A BRACKETED SPAN ON ONE LINE, the shape the licence's drafter used for every
   term left open ([Seller's legal name], [registered address], and in the Polish the same). The
   licence prose has no other square bracket, so no clause is caught by this. */
const HOLE = /\[[^\]\r\n]*\]/g;
export function placeholders(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const found = line.match(HOLE);
    if (found) for (const f of found) out.push({ line: i + 1, text: f });
  });
  return out;
}

/** Why the licence pages in `dir` cannot go to a customer, or nothing. No page at all is a reason:
 *  both products ship one by ruling (board 491), and a check that found no file judged nothing. */
export function licenceProblems(dir) {
  const pages = licencePages(dir);
  if (!pages.length) return ['no licence page in ' + dir + ', so the installer would show none and this check read nothing'];
  const out = [];
  for (const p of pages) {
    const holes = placeholders(readFileSync(p, 'utf8'));
    if (holes.length) out.push(p.replace(/\\/g, '/').split('/').pop() + ' still carries '
      + holes.length + ' placeholder(s): ' + holes.map(h => 'line ' + h.line + ' ' + h.text).join(', '));
  }
  return out;
}

/* THE VARIABLES THAT DECIDE WHETHER A BUILD SIGNS, listed here and nowhere else: the nine that pick a
   route (electron-builder's own certificate links included) and the two passwords a key is opened with. */
export const SIGNING_VARS = ['ETIUDA_CERT', 'ETIUDA_CERT_SHA1', 'ETIUDA_CERT_SUBJECT', 'ETIUDA_SIGNING_ENDPOINT',
  'ETIUDA_SIGNING_ACCOUNT', 'ETIUDA_SIGNING_PROFILE', 'ETIUDA_SIGNING_PUBLISHER', 'CSC_LINK', 'WIN_CSC_LINK'];
export const KEY_PASSWORD_VARS = ['CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD'];
/** `env` less those eleven, so a build a gate makes never signs, asks for a token's PIN or signs in to Azure.
 *  Names match case-insensitively on Windows, where the child reads them that way. */
export function withoutSigning(env = process.env) {
  const drop = new Set(SIGNING_VARS.concat(KEY_PASSWORD_VARS).map(k => k.toUpperCase()));
  const same = process.platform === 'win32' ? k => k.toUpperCase() : k => k;
  const out = {};
  for (const k of Object.keys(env)) if (!drop.has(same(k))) out[k] = env[k];
  return out;
}

/* IS SIGNING CONFIGURED: true for every route electron-builder signs with and for nothing else, which
   tests/sellable.mjs holds against electron-builder's own code. A .pfx, a store certificate by
   thumbprint or subject (a token's), a sign hook, a certificate link (win.cscLink, then WIN_CSC_LINK,
   then CSC_LINK, an empty one shadowing the next), or Artifact Signing with the four fields its
   schema requires, which then wins over the rest; signExecutable false signs nothing. */
const ARTIFACT_NEEDS = ['endpoint', 'codeSigningAccountName', 'certificateProfileName', 'publisherName'];
export function signingConfigured(win, env = process.env) {
  const w = win || {};
  if (w.signExecutable === false) return false;
  const az = w.azureSignOptions;
  if (az != null) return ARTIFACT_NEEDS.every(k => typeof az[k] === 'string' && az[k] !== '');
  const st = w.signtoolOptions || {};
  const first = (a, b) => (a != null ? a : b);
  return !!(st.certificateFile || st.certificateSha1 || st.certificateSubjectName || st.sign
    || first(w.cscLink, first(env.WIN_CSC_LINK, env.CSC_LINK)));
}
const NO_ROUTE = 'no certificate is configured (none of ETIUDA_CERT, ETIUDA_CERT_SHA1, ETIUDA_CERT_SUBJECT'
  + ' or ETIUDA_SIGNING_* is set), so the installer would be unsigned';

/* WHAT WINDOWS SAYS OF A FILE: the Authenticode status, and whether a timestamp countersigns it.
   Without the timestamp a signature dies with its certificate, and a customer's installer would
   read NotTrusted on the day the certificate expires. One PowerShell for every file, each path
   passed in single quotes with a quote doubled, so a folder named with a space or a quote is one
   argument. Off Windows there is nobody to ask: null, and the caller says NOT RUN. */
export function readAuthenticode(files) {
  if (process.platform !== 'win32') return null;
  const q = f => "'" + String(f).replace(/'/g, "''") + "'";
  const script = 'foreach ($f in @(' + files.map(q).join(',') + ')) { $s = Get-AuthenticodeSignature -LiteralPath $f; '
    + '[string]$s.Status + [char]9 + [string]([bool]$s.TimeStamperCertificate) + [char]9 + $f }';
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const rows = out.split(/\r?\n/).filter(Boolean).map(l => {
    const [status, ts, file] = l.split('\t');
    return { file, status: status.trim(), timestamped: ts.trim() === 'True' };
  });
  /* A path Windows did not answer for is a reading lost, not a pass. */
  if (rows.length !== files.length) throw new Error('Authenticode answered for ' + rows.length + ' of ' + files.length + ' file(s)');
  return rows;
}

/** Why these readings fail when a signature is required, or nothing. When it is not required a
 *  reading is only printed, which is what a preview with no certificate has always done. */
export function signatureProblems(readings, required) {
  if (!required) return [];
  const name = f => String(f).replace(/\\/g, '/').split('/').pop();
  const out = [];
  for (const r of readings) {
    if (r.status !== 'Valid') out.push(name(r.file) + ' reads Authenticode ' + r.status + ', not Valid');
    else if (!r.timestamped) out.push(name(r.file) + ' is signed with no timestamp, so its signature dies with the certificate');
  }
  return out;
}

/* THE SIGNATURE GATE WHOLE, called by tools/release.mjs after the build with the installer it
   made and the program inside it, since a customer meets both: SmartScreen reads the first and
   every later start reads the second. REQUIRED of a customer build and of any build with a
   certificate configured, and then Valid with a timestamp or the gate stops; a preview with no
   certificate is only told what Windows says. Until 2026-09-27 the gate printed the installer's
   status and passed whatever it was, HashMismatch included. The body is here rather than in the
   release so that it can be driven on planted files without packaging anything; `read` is the
   reader, replaceable only so a leg can say what an off-Windows run does. The uninstaller is not
   read: electron-builder signs it with the same options and then seals it inside the installer,
   where nothing reaches it without installing. Returns true or the reason, as a gate does. */
export function signatureVerdict({ setup, program, customer, win, read = readAuthenticode, log = console.log }) {
  const files = [setup, program];
  const missing = files.filter(f => !f || !existsSync(f));
  if (missing.length) return 'nothing to read the signature of: ' + missing.join(', ') + ' is not there';
  const required = !!customer || signingConfigured(win);
  const readings = read(files);
  if (!readings) {
    if (required) return 'NOT RUN: not Windows, so no signature can be read, and this build requires one';
    log('  not Windows, so there is nothing to ask');
    return true;
  }
  for (const r of readings) log('  Authenticode: ' + r.status + (r.timestamped ? ', timestamped' : '') + '  ' + r.file
    + (r.status === 'NotSigned' ? '  (a log line reading "signing with signtool.exe" is the asar integrity edit, not a signature)' : ''));
  if (!required) log('  not required: a preview with no certificate configured');
  const problems = signatureProblems(readings, required);
  return problems.length ? problems.join('; ') : true;
}

/** The questions asked before a build: is this a customer's, and if so what stops it.
 *  `problems` is filled for a preview too, so the release can say what would stop it. */
export function beforeBuild({ version, customer, licenceDir, win }) {
  const asCustomer = !!customer || customerVersion(version);
  const problems = []
    .concat(versionProblems(version))
    .concat(licenceProblems(licenceDir))
    .concat(signingConfigured(win) ? [] : [NO_ROUTE]);
  return { customer: asCustomer, problems };
}
