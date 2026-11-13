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
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

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

/* A PLACEHOLDER IS A BRACKETED SPAN ON ONE LINE, the shape the licence's drafter uses for a term
   left open, such as [registered address]. The licence prose has no other square bracket, so no
   clause is caught by this. */
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

/* THE TEST SERVICE BUILD (tools/test-service.cjs) is never sold and never released, preview or customer: refused where its
   variable is set for the release, where a package's asar carries its fields, and where a file of its name lies beside the asar. */
export const TEST_SERVICE_VAR = 'ETIUDA_PACK_TEST_SERVICE';
export const TEST_SERVICE_FILE = 'test-service.json';
export function testServiceProblems({ env, resources } = {}) {
  const out = [];
  if (env && typeof env[TEST_SERVICE_VAR] === 'string' && env[TEST_SERVICE_VAR] !== '')
    out.push(TEST_SERVICE_VAR + ' is set, which makes a test service build, and no test service build is released'); /* plant:sell-ts-var */
  for (const dir of [].concat(resources || [])) {
    if (existsSync(join(dir, TEST_SERVICE_FILE))) out.push(join(dir, TEST_SERVICE_FILE) + ' is in the package, so it is a test service build, which is never released'); /* plant:sell-ts-file */
    const pkg = createRequire(import.meta.url)('./test-service.cjs').asarPackage(join(dir, 'app.asar'));
    if (pkg && pkg.etiudaTestService !== undefined) out.push(join(dir, 'app.asar') + ' carries the test service fields, so it is a test service build, which is never released'); /* plant:sell-ts-asar */
  }
  return out;
}

/* THE VARIABLES THAT DECIDE WHETHER A BUILD SIGNS, listed here and nowhere else: the ten that pick a
   route (electron-builder's own certificate links included) and the two passwords a key is opened with. */
export const SIGNING_VARS = ['ETIUDA_CERT', 'ETIUDA_CERT_SHA1', 'ETIUDA_CERT_SUBJECT', 'ETIUDA_SIGNING_ENDPOINT',
  'ETIUDA_SIGNING_ACCOUNT', 'ETIUDA_SIGNING_PROFILE', 'ETIUDA_SIGNING_PUBLISHER', 'CSC_LINK', 'WIN_CSC_LINK', 'ETIUDA_SIGN'];
export const KEY_PASSWORD_VARS = ['CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD'];
/** `env` less those twelve, so a build a gate makes never signs, asks for a token's PIN or signs in to Azure or SSL.com.
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
  + ', ETIUDA_SIGNING_* or ETIUDA_SIGN is set), so the installer would be unsigned';

/* WHAT WINDOWS SAYS OF A FILE: the Authenticode status, and whether a timestamp countersigns it.
   Without the timestamp a signature dies with its certificate, and a customer's installer would
   read NotTrusted on the day the certificate expires. One PowerShell for every file, each path
   passed in single quotes with a quote doubled, so a folder named with a space or a quote is one
   argument. Off Windows there is nobody to ask: null, and the caller says NOT RUN. */
export function readAuthenticode(files) {
  if (process.platform !== 'win32') return null;
  const q = f => "'" + String(f).replace(/'/g, "''") + "'";
  const script = 'foreach ($f in @(' + files.map(q).join(',') + ')) { $s = Get-AuthenticodeSignature -LiteralPath $f; '
    + '[string]$s.Status + [char]9 + [string]([bool]$s.TimeStamperCertificate) + [char]9 + $f + [char]9 + [string]$s.SignerCertificate.Subject }';
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const rows = out.split(/\r?\n/).filter(Boolean).map(l => {
    const [status, ts, file, subject] = l.split('\t');
    return { file, status: status.trim(), timestamped: ts.trim() === 'True', subject: (subject || '').trim() };
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

/* A BUILD SIGNED BY SSL.com'S DEMO CERTIFICATE (tools/esigner.cjs, ETIUDA_SIGN=esigner-demo) is never released, preview or
   customer: refused where the variable is set for the release, and wherever a file read carries the demo certificate's subject. */
const ESIGNER = createRequire(import.meta.url)('./esigner.cjs');
export function demoSigningProblems({ env, readings } = {}) {
  const out = [];
  if (env && ESIGNER.given(env) === 'esigner-demo') out.push(ESIGNER.SIGN_VAR + ' is esigner-demo, which signs with SSL.com\'s demo certificate, and no demo-signed build is released'); /* plant:sell-demo-var */
  for (const r of readings || []) if (ESIGNER.DEMO_SUBJECT.test(r.subject || '')) out.push(String(r.file).replace(/\\/g, '/').split('/').pop() + ' is signed by SSL.com\'s demo certificate, which is never released'); /* plant:sell-demo-subject */
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
  const problems = signatureProblems(readings, required).concat(demoSigningProblems({ readings }));
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

/* WHETHER A CUSTOMER BUILD HAS A GREEN RELEASE PROFILE FOR THIS SAME TREE
   (state/briefs/reform-2026-10-27/test-regimen.md rule 4, amended for decisions 2026-11-05 11:43).
   Whatever reaches a customer (a customer's or a pilot's installer, a tag, a live deploy)
   ships only from a tree whose release profile is green on that same tree, with no red of
   class hold. A test build for Maxim alone needs no release profile, and no tool refuses it. */

export function readReleaseSummaries(runsDir) {
  if (!runsDir || !existsSync(runsDir)) return [];
  const files = readdirSync(runsDir).filter(f => /^(release|nightly)-summary-.*\.json$/.test(f));
  const summaries = [];
  for (const f of files) {
    try {
      const full = join(runsDir, f);
      const text = readFileSync(full, 'utf8');
      const data = JSON.parse(text);
      if (data && (data.kind === 'profile-summary' || data.profile === 'release')) {
        summaries.push({ file: f, path: full, ...data });
      }
    } catch {}
  }
  return summaries.sort((a, b) => String(b.time || b.end || '').localeCompare(String(a.time || a.end || '')));
}

export function customerReleaseProfileVerdict({ root, tree, runsDir, summaries: givenSummaries }) {
  const dir = runsDir || process.env.ETIUDA_RUNS || (root ? resolve(root, '..', 'etiuda-runs') : '');
  const all = givenSummaries || readReleaseSummaries(dir);
  const releaseSummaries = all.filter(s => (s.profile === 'release' || !s.profile) && s.kind === 'profile-summary');

  if (!releaseSummaries.length) {
    return 'no release profile summary found in ' + (dir || 'etiuda-runs') + ' for tree ' + tree
      + '. Run \'node tools/gate-run.mjs release\' on this commit to produce a green release profile summary'
      + ' (test-regimen.md rule 4, decisions 2026-11-05 11:43).';
  }

  const forTree = releaseSummaries.filter(s => s.gitTree === tree);
  if (!forTree.length) {
    const others = [...new Set(releaseSummaries.map(s => s.gitTree).filter(Boolean))];
    return 'no release profile summary for tree ' + tree + ' in ' + (dir || 'etiuda-runs')
      + (others.length ? ' (found summary for tree ' + others.slice(0, 3).join(', ') + ', but a different tree is not the same tree)' : '')
      + '. Run \'node tools/gate-run.mjs release\' on this commit to produce a green release profile summary'
      + ' (test-regimen.md rule 4, decisions 2026-11-05 11:43).';
  }

  const latest = forTree[0];

  /* The regimen\'s test-only inheritance: honours inheritance if gate-run recorded it */
  const inherits = latest.inherits && typeof latest.inherits === 'string' && latest.inherits !== '';
  const profileCount = latest.gates && latest.gates.profile ? latest.gates.profile.length : 0;
  const ranCount = latest.gates && latest.gates.ran ? latest.gates.ran.length : 0;
  /* A summary that lists no profile cannot show it covered the profile. */
  const covers = inherits || (profileCount > 0 && ranCount >= profileCount);

  if (!covers) {
    return 'release profile summary for tree ' + tree + ' does not cover the whole profile: ran '
      + ranCount + ' of ' + profileCount + ' gates without inheritance.'
      + ' Run \'node tools/gate-run.mjs release\' to run the full profile'
      + ' (test-regimen.md rule 4, decisions 2026-11-05 11:43).';
  }

  const holdReds = (latest.reds && Array.isArray(latest.reds.holds) ? latest.reds.holds : [])
    .concat(latest.reds && Array.isArray(latest.reds) ? latest.reds.filter(r => r.class !== 'warn') : [])
    .concat(latest.holds === true && (!latest.reds || !latest.reds.holds) ? [{ gate: 'hold' }] : []);

  if (holdReds.length > 0) {
    const names = holdReds.map(r => r.gate || r.cmd || 'hold').join(', ');
    return 'release profile for tree ' + tree + ' has ' + holdReds.length
      + ' red(s) of class hold: ' + names
      + '. Fix the failures and run \'node tools/gate-run.mjs release\' to achieve a green release profile'
      + ' (test-regimen.md rule 4, decisions 2026-11-05 11:43).';
  }

  return true;
}
