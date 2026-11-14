/* THE SEATS OF A TEAM WHOSE LICENCE FOLLOWS ENTRA, AT THE RELAY AND THE DESK (decision 49, option (b)). node tests/relay-seats.mjs
 * Over relay/worker.mjs on relay/test/stand-ins.cjs, as relay-unit runs it, and shell/relay/channel.cjs over that relay: each timeline
 * leg at the window W of seven days and of one day, the ruling still open; each guard lifted in a copy turns its named leg red, and no
 * product file is written. Node builtins only, no window. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "relay-seats-plants-"));
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 73;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  SKIP  " + line); }

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/* The certificate span on an Entra licence: seven days until it is ruled, and one day beside it, so the ruling is one line. */
const WINDOWS = [["W=7d", 7 * DAY], ["W=1d", DAY]];
const T0 = Date.UTC(2026, 10, 16, 9);
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const hex = n => crypto.randomBytes(n).toString("hex");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
function keyPair(branch) {
  const p = crypto.generateKeyPairSync("ed25519");
  const pub = p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex");
  return { keyId: branch ? "k-" + sha(Buffer.from(pub, "hex")).slice(0, 16) : pub, pub, privateKey: p.privateKey };
}
const signHex = (key, bytes) => crypto.sign(null, bytes, key.privateKey).toString("hex");

let B = null, C = null, S = null, K = null, W = null;

async function call(R, method, p, o) {
  const opts = o || {};
  const headers = {};
  if (opts.token) headers.authorization = "Bearer " + opts.token;
  const init = { method, headers };
  if (opts.json !== undefined && method !== "GET") { init.body = JSON.stringify(opts.json); init.duplex = "half"; }
  const res = await W.fetch(new Request("https://relay.test" + p, init), R.env);
  const bytes = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
  return { status: res.status, json, lapse: res.headers.get("etiuda-lapse") };
}
const said = r => (r && r.json && r.json.error) || (r && r.status);
const refused = (r, reason) => !!r && r.status === 403 && !!r.json && r.json.error === reason && r.json.said === B.REASONS[reason]
  && Object.keys(r.json).sort().join() === "error,said";
const opened = r => !!r && r.status === 200 && !!r.json && /^[0-9a-f]{64}$/.test(String(r.json.session));

/* A grant around `at`: issued then, running 30 days, paid, its seats where given. */
function grantAt(leadPub, at, seats, o) {
  const fields = Object.assign({ issued: at, until: at + 30 * DAY }, seats === undefined ? {} : { seats }, (o && o.fields) || {});
  return K.grantFor(leadPub, at, Object.assign({}, o || {}, { fields }));
}
/* A certificate as the licence service signs one, issued at `issued` and running `span`, under a delegation that may sign licences. */
function certFor(deskPub, licence, issued, span, o) {
  const opts = o || {};
  const signer = opts.signer || K.DELEGATE;
  const via = opts.via || K.delegationFor(issued, { fields: { may: ["licence"], key: { id: signer.id, pub: signer.pub } } });
  const c = Object.assign({ kind: "etiuda-seat-certificate", format: 1, licence, desk: deskPub, person: opts.person || hex(32),
    code: "ABCDEFGHJKMNPQRS", issued, until: issued + span, via }, opts.fields || {});
  c.sig = { alg: "Ed25519", keyId: signer.id, value: "" };
  c.sig.value = signHex(opts.forger || signer, C.certBytes(c));
  return c;
}
/* A service key of the test's own, delegated by the test root, so a list can revoke it and leave K.DELEGATE standing. */
function serviceKey() {
  const k = keyPair(false);
  return { id: "svc-" + k.pub.slice(0, 12), pub: k.pub, privateKey: k.privateKey };
}
function revokedText(keys) {
  const sorted = keys.slice().sort();
  const doc = { kind: "etiuda-revocations", format: 1, serial: 1, keys: sorted, sig: { alg: "ed25519", keyId: K.ROOT.id, value: "" } };
  doc.sig.value = crypto.sign(null, C.revocationBytes(doc), K.ROOT.privateKey).toString("hex");
  return JSON.stringify(doc);
}

/* A team: its lead, and desks enrolled, by name. `seats` the first grant's seats, or none for an ordinary team. */
async function team(o) {
  const opts = o || {};
  const R = S.relayEnv({ roots: K.ROOTS });
  R.clock.now = opts.at || T0;
  const w = { R, rt: hex(16), lead: keyPair(false), rev: 0, desks: {}, licence: opts.licence || hex(16) };
  const seats = opts.seats === undefined ? undefined : opts.seats === true ? { licence: w.licence, live: R.clock.now } : opts.seats;
  const grant = grantAt(w.lead.pub, R.clock.now, seats, opts.paid === false ? { fields: { paid: false } } : undefined);
  w.firstGrant = grant;
  w.made = await call(R, "POST", "/relay/v1/teams", { json: K.createBody(w.rt, w.lead, R.clock.now, b => signHex(w.lead, b), { grant }) });
  const names = opts.desks || ["a", "b", "c"];
  for (const n of names) w.desks[n] = Object.assign(keyPair(true), { place: "k-" + hex(8) });
  w.enrolled = names.length ? await devicesOf(w, names) : { status: 200 };
  if (w.made.status !== 200 || w.enrolled.status !== 200) throw new Error("the team was not made: " + said(w.made) + " " + said(w.enrolled));
  return w;
}
function devicesOf(w, names) {
  const keys = names.map(n => ({ id: w.desks[n].keyId, pub: w.desks[n].pub, desk: w.desks[n].place }));
  const rev = w.rev + 1, t = w.R.clock.now;
  return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/devices", { json: { keys, rev, t, sig: signHex(w.lead, C.devicesBytes(w.rt, rev, t, keys)) } })
    .then(r => { if (r.status === 200) w.rev = rev; return r; });
}
/* A desk's session: a challenge, then the key's hello, carrying `seat` where given. */
async function session(w, key, seat) {
  const ch = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
  const n = ch.json && ch.json.challenge;
  const body = { challenge: n, key: key.keyId, pub: key.pub, sig: signHex(key, C.helloBytes(w.rt, n, key.keyId)) };
  if (seat !== undefined) body.seat = seat;
  return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: body });
}
const renew = (w, grant) => call(w.R, "POST", "/relay/v1/t/" + w.rt + "/grant", { json: { grant } });
/* A desk "proving": the licence service gives it a certificate issued now, running `span`. */
function prove(w, name, span) {
  const d = w.desks[name];
  d.cert = certFor(d.pub, w.licence, w.R.clock.now, span);
  return d.cert;
}
const sessionAs = (w, name) => session(w, w.desks[name], w.desks[name].cert);
const storeOf = w => w.R.stores.get(w.rt);
/* A scene that throws is that leg red, and the run goes on. */
const safe = async fn => { try { return await fn(); } catch (e) { return { ok: false, detail: "threw " + (e && e.message ? e.message : e) }; } };
const brief = o => JSON.stringify(o);

async function main() {
  try {
    B = require(path.join(ROOT, "shell", "relay", "blob.cjs"));
    C = require(path.join(ROOT, "relay", "core.cjs"));
    S = require(path.join(ROOT, "relay", "test", "stand-ins.cjs"));
    K = require(path.join(ROOT, "relay", "test", "grant-kit.cjs"));
    const WORKER = await import(pathToFileURL(path.join(ROOT, "relay", "worker.mjs")).href);
    W = WORKER.routeWith(K.ROOTS, env => env.NOW());
  } catch (e) { check(false, "0a the relay's modules load - " + e.message); return; }
  const M = C.SEAT_MARGIN_MS;
  check(M === HOUR && Number.isSafeInteger(C.CERT_SPAN_MS) && WINDOWS.every(([, w]) => w <= C.CERT_SPAN_MS),
    "0b the margin M is one hour, named once as SEAT_MARGIN_MS, and each window this file runs fits a certificate's span: M " + M / MIN + " min");

  /* ---- the scenes. Each answers { ok, detail }. ---- */

  /* O2 and the lead: a current certificate of the grant's licence opens a desk's session and its reads; the lead needs none. */
  async function opensScene(span) {
    const w = await team({ seats: true });
    const c = prove(w, "a", span);
    const s = await sessionAs(w, "a");
    const read = opened(s) ? await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: s.json.session }) : { status: 0 };
    const lead = await session(w, w.lead);
    const seen = storeOf(w).get("seatSeen");
    const ok = opened(s) && read.status === 200 && refused(lead, "seat-lapsed") && !!seen && seen.issued === c.issued && seen.licence === w.licence;
    return { ok, detail: brief({ desk: said(s), since: read.status, leadWithoutCertificate: said(lead), seen: !!seen }) };
  }
  /* O5: on an Entra team a desk sending no certificate is refused; on an ordinary team one sending a certificate is answered and
     stored exactly as one sending none, and nothing of seats is stored. */
  async function noCertScene() {
    const w = await team({ seats: true });
    const none = await session(w, w.desks.a);
    const o1 = await team({}), o2 = await team({});
    const plainS = await session(o1, o1.desks.a);
    const withS = await session(o2, o2.desks.a, certFor(o2.desks.a.pub, o2.licence, o2.R.clock.now, 7 * DAY));
    const keys = x => storeOf(x).dump().map(([k]) => k.replace(/[0-9a-f]{16,}/g, "#")).join(",");
    const ok = refused(none, "seat-lapsed") && opened(plainS) && opened(withS) && keys(o1) === keys(o2)
      && !keys(o2).includes("seat") && Object.keys(withS.json).sort().join() === Object.keys(plainS.json).sort().join();
    return { ok, detail: brief({ entraNone: said(none), ordinary: said(plainS), ordinaryWithCert: said(withS), sameKeys: keys(o1) === keys(o2) }) };
  }
  /* O6: a certificate that is not this team's current seat is refused, each alike. */
  async function wrongCertScene() {
    const w = await team({ seats: true });
    const svc = serviceKey(), now = w.R.clock.now, a = w.desks.a, other = keyPair(true);
    const viaSvc = K.delegationFor(now, { fields: { may: ["licence"], key: { id: svc.id, pub: svc.pub } } });
    w.R.env.REVOKED = revokedText([svc.pub]);
    const cases = {
      otherLicence: certFor(a.pub, hex(16), now, 7 * DAY),
      otherDesk: certFor(other.pub, w.licence, now, 7 * DAY),
      forged: certFor(a.pub, w.licence, now, 7 * DAY, { forger: { privateKey: other.privateKey } }),
      revokedKey: certFor(a.pub, w.licence, now, 7 * DAY, { signer: svc, via: viaSvc }),
      notLicence: certFor(a.pub, w.licence, now, 7 * DAY, { via: K.delegationFor(now) }),
      pastSpan: certFor(a.pub, w.licence, now, 31 * DAY),
      ahead: certFor(a.pub, w.licence, now + 6 * MIN, 7 * DAY),
      notACert: { kind: "etiuda-seat-certificate" },
      text: "seat",
    };
    const got = {};
    for (const [n, c] of Object.entries(cases)) got[n] = await session(w, a, c);
    const good = await session(w, a, certFor(a.pub, w.licence, now, 7 * DAY));
    const ok = Object.values(got).every(r => refused(r, "seat-lapsed")) && opened(good);
    return { ok, detail: brief(Object.assign({}, ...Object.entries(got).map(([n, r]) => ({ [n]: said(r) })), { good: said(good) })) };
  }
  /* O3, the licence service down for everyone: no grant and no certificate after T0; every desk's certificate runs out and every
     desk still opens, at the margin and days past it. */
  async function serviceDownScene(span) {
    const w = await team({ seats: true });
    for (const n of ["a", "b", "c"]) prove(w, n, span);
    for (const n of ["a", "b", "c"]) await sessionAs(w, n);
    const at = [span + M + MIN, span + 3 * DAY, span + 9 * DAY];
    const rows = [];
    for (const dt of at) { w.R.clock.now = T0 + dt; for (const n of ["a", "b", "c"]) rows.push(await sessionAs(w, n)); }
    return { ok: rows.every(opened), detail: brief({ sessions: rows.length, opened: rows.filter(opened).length }) };
  }
  /* The outage, Microsoft down for everyone: the service answers and the lead's Studio renews the grant twice a day, but no proof
     succeeds, so each grant's live stays where proofs stopped; nobody is cut. */
  async function microsoftDownScene(span) {
    const w = await team({ seats: true });
    for (const n of ["a", "b", "c"]) prove(w, n, span);
    const stopped = w.R.clock.now, rows = [], renewals = [];
    for (let t = 12 * HOUR; t <= span + 3 * DAY; t += 12 * HOUR) {
      w.R.clock.now = T0 + t;
      renewals.push((await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: stopped }))).status);
      if (t > span + M) for (const n of ["a", "b", "c"]) rows.push(await sessionAs(w, n));
    }
    const ok = renewals.every(s => s === 200) && rows.length > 0 && rows.every(opened);
    return { ok, detail: brief({ renewals: renewals.length, sessions: rows.length, opened: rows.filter(opened).length }) };
  }
  /* O4, removal seen through colleagues: a is removed at once and never proves again; b and c prove daily. a opens until a colleague's
     certificate issued at least M past a's end has been taken at a session, and is refused from then; b and c are never refused. */
  async function removedByColleagueScene(span) {
    const w = await team({ seats: true });
    for (const n of ["a", "b", "c"]) prove(w, n, span);
    const aEnd = w.desks.a.cert.until, colleagues = [];
    let beforeMargin = null, afterMargin = null;
    for (let t = DAY; t < span; t += DAY) {
      w.R.clock.now = T0 + t;
      for (const n of ["b", "c"]) { prove(w, n, span); colleagues.push(await sessionAs(w, n)); }
    }
    w.R.clock.now = aEnd + M - MIN;
    prove(w, "b", span);
    colleagues.push(await sessionAs(w, "b"));
    beforeMargin = await sessionAs(w, "a");
    w.R.clock.now = aEnd + M;
    prove(w, "c", span);
    colleagues.push(await sessionAs(w, "c"));
    afterMargin = await sessionAs(w, "a");
    w.R.clock.now += 30 * MIN;
    const later = await sessionAs(w, "a");
    const ok = opened(beforeMargin) && refused(afterMargin, "seat-lapsed") && refused(later, "seat-lapsed") && colleagues.every(opened);
    return { ok, detail: brief({ beforeMargin: said(beforeMargin), atMargin: said(afterMargin), later: said(later), colleaguesOpened: colleagues.filter(opened).length + "/" + colleagues.length }) };
  }
  /* O4, removal seen through the grant: a team whose colleagues have not met the relay since, and whose lead's Studio renews the grant
     with the licence's live; a is refused once that live is M past a's end, and not before. */
  async function removedByGrantScene(span) {
    const w = await team({ seats: true });
    prove(w, "a", span);
    const aEnd = w.desks.a.cert.until;
    w.R.clock.now = aEnd + 2 * HOUR;
    const r1 = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: aEnd + M - MIN }));
    const before = await sessionAs(w, "a");
    w.R.clock.now += MIN;
    const r2 = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: aEnd + M }));
    const after = await sessionAs(w, "a");
    const ok = r1.status === 200 && r2.status === 200 && opened(before) && refused(after, "seat-lapsed");
    return { ok, detail: brief({ liveBelowMargin: said(before), liveAtMargin: said(after) }) };
  }
  /* One person's renewal failing (a password reset, a Conditional Access rule) while colleagues' succeed: the relay sees what it sees
     of a removal, so a is refused after its end and the margin; and the moment a's desk holds a new certificate it opens again. */
  async function oneFailsScene(span) {
    const w = await team({ seats: true });
    for (const n of ["a", "b"]) prove(w, n, span);
    w.R.clock.now = w.desks.a.cert.until + M;
    prove(w, "b", span);
    const b = await sessionAs(w, "b");
    const stuck = await sessionAs(w, "a");
    w.R.clock.now += 5 * MIN;
    prove(w, "a", span);
    const back = await sessionAs(w, "a");
    const ok = opened(b) && refused(stuck, "seat-lapsed") && opened(back);
    return { ok, detail: brief({ colleague: said(b), failing: said(stuck), signedInAgain: said(back) }) };
  }
  /* (2) A team of one desk. Its own renewal is the only proof it could show, so with the lead's Studio closed nothing advances the
     evidence and the desk keeps opening (nobody but the lead publishes, so it receives nothing new meanwhile); with the lead's Studio
     running, its grants carry the licence's live and the removed desk is refused within the margin. */
  async function teamOfOneScene(span) {
    const closed = await team({ seats: true, desks: ["a"] });
    prove(closed, "a", span);
    const closedRows = [];
    for (const dt of [span + M + MIN, span + 2 * DAY, span + 6 * DAY]) { closed.R.clock.now = T0 + dt; closedRows.push(await sessionAs(closed, "a")); }
    const running = await team({ seats: true, desks: ["a"] });
    prove(running, "a", span);
    const end = running.desks.a.cert.until;
    let cutAt = null;
    for (let t = 12 * HOUR; t <= span + 2 * DAY; t += 12 * HOUR) {
      running.R.clock.now = T0 + t;
      await renew(running, grantAt(running.lead.pub, running.R.clock.now, { licence: running.licence, live: running.R.clock.now - 10 * MIN }));
      if (cutAt === null && refused(await sessionAs(running, "a"), "seat-lapsed")) cutAt = running.R.clock.now;
    }
    const ok = closedRows.every(opened) && cutAt !== null && cutAt > end && cutAt - end <= 12 * HOUR + M;
    return { ok, detail: brief({ studioClosedOpened: closedRows.filter(opened).length + "/" + closedRows.length,
      studioRunningCutHoursAfterEnd: cutAt === null ? null : (cutAt - end) / HOUR }) };
  }
  /* (2) A team whose lead's Studio is closed for a week: no grant at all for eight days. b and c prove daily and are never refused; a,
     removed at T0, is refused once a colleague's newer certificate has been taken past a's end and the margin. */
  async function studioClosedScene(span) {
    const w = await team({ seats: true });
    for (const n of ["a", "b", "c"]) prove(w, n, span);
    const aEnd = w.desks.a.cert.until, colleagues = [];
    let cutAt = null;
    for (let t = 2 * HOUR; t <= 8 * DAY; t += 2 * HOUR) {
      w.R.clock.now = T0 + t;
      if (t % DAY === 2 * HOUR) for (const n of ["b", "c"]) prove(w, n, span);
      for (const n of ["b", "c"]) colleagues.push(await sessionAs(w, n));
      if (cutAt === null && refused(await sessionAs(w, "a"), "seat-lapsed")) cutAt = w.R.clock.now;
    }
    const ok = colleagues.every(opened) && cutAt !== null && cutAt >= aEnd + M && cutAt - aEnd <= DAY + M;
    return { ok, detail: brief({ colleaguesOpened: colleagues.filter(opened).length + "/" + colleagues.length,
      removedCutHoursAfterEnd: cutAt === null ? null : (cutAt - aEnd) / HOUR }) };
  }
  /* (2) A company whose own Entra breaks every renewal on the same day: nobody proves, so no certificate is issued and the lead's
     grants carry a live that stands still; three days past every end, nobody is cut. When it is fixed and one person proves, the
     others' run-out certificates are refused until each desk renews (the desk renews before its session), and then they open. */
  async function companyBrokenScene(span) {
    const w = await team({ seats: true });
    for (const n of ["a", "b", "c"]) prove(w, n, span);
    const broke = w.R.clock.now + HOUR, during = [];
    for (let t = 12 * HOUR; t <= span + 3 * DAY; t += 12 * HOUR) {
      w.R.clock.now = T0 + t;
      await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: broke }));
      if (t > span + M) for (const n of ["a", "b", "c"]) during.push(await sessionAs(w, n));
    }
    w.R.clock.now += HOUR;
    prove(w, "a", span);
    const first = await sessionAs(w, "a");
    const waiting = await sessionAs(w, "b");
    prove(w, "b", span);
    const renewed = await sessionAs(w, "b");
    const ok = during.length > 0 && during.every(opened) && opened(first) && refused(waiting, "seat-lapsed") && opened(renewed);
    return { ok, detail: brief({ duringOpened: during.filter(opened).length + "/" + during.length, firstFixed: said(first),
      othersBeforeRenewing: said(waiting), othersAfterRenewing: said(renewed) }) };
  }
  /* O7, the order: a grant carrying seats is refused "fields" by the relay on main before this change, so the service may send one
     only once the relay that reads it is deployed; this relay takes it. Main's core is read from git, and a tree without main says so. */
  function mainCore() {
    for (const ref of ["origin/main", "main"]) {
      const r = spawnSync("git", ["show", ref + ":relay/core.cjs"], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (r.status === 0 && r.stdout && r.stdout.indexOf("GRANT_FIELDS") > 0) return r.stdout;
    }
    return null;
  }
  const forwardTo = file => "module.exports = require(" + JSON.stringify(file) + ");\n";
  let copies = 0;
  function copyOf(files) {
    const dir = path.join(WORK, "p" + (++copies));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
  }
  const PRODUCT = { core: path.join(ROOT, "relay", "core.cjs"), blob: path.join(ROOT, "shell", "relay", "blob.cjs") };
  function coreFrom(text) {
    const dir = copyOf({ "relay/core.cjs": text, "shell/relay/blob.cjs": forwardTo(PRODUCT.blob) });
    return require(path.join(dir, "relay", "core.cjs"));
  }
  async function orderScene() {
    const text = mainCore();
    if (text === null) return { skip: true, detail: "no main in this tree" };
    const old = coreFrom(text), lead = keyPair(false);
    if (old.GRANT_FIELDS !== undefined && !Array.isArray(old.GRANT_FIELDS)) return { ok: false, detail: "main's core is not readable" };
    const g = grantAt(lead.pub, T0, { licence: hex(16), live: T0 });
    const plainG = grantAt(lead.pub, T0);
    const before = old.grantWhy(g, lead.pub, T0, K.ROOTS), beforePlain = old.grantWhy(plainG, lead.pub, T0, K.ROOTS);
    const now = C.grantWhy(g, lead.pub, T0, K.ROOTS);
    const mainHasSeats = /"seats"/.test(text.split("GRANT_FIELDS")[1] || "");
    return { ok: before === "fields" && beforePlain === null && now === null, mainHasSeats,
      detail: brief({ mainWithSeats: before, mainWithout: beforePlain, thisRelay: now }) };
  }
  /* O8, night decision 6 on an Entra team: what takes access away never waits on a seat. The lead removes a desk whose seat has lapsed,
     and that desk is then told removed; on a read-only team the lead still removes a desk; and a desk whose door request is up takes it
     back after its certificate ran out past the evidence. */
  async function letGoScene(span) {
    const w = await team({ seats: true });
    for (const n of ["a", "b"]) prove(w, n, span);
    w.R.clock.now = w.desks.a.cert.until + M;
    prove(w, "b", span);
    await sessionAs(w, "b");
    const lapsedSeat = await sessionAs(w, "a");
    const removedA = await devicesOf(w, ["b", "c"]);
    const toldRemoved = await sessionAs(w, "a");
    const ro = await team({ seats: true, paid: false });
    ro.R.clock.now = T0 + 31 * DAY;
    const lapse = await session(ro, ro.lead, certFor(ro.lead.pub, ro.licence, T0, span));
    const roRemoved = await devicesOf(ro, ["a"]);
    /* A door request up, then taken back after its certificate ran out with evidence past it. */
    const dw = await team({ seats: true, desks: ["b"] });
    dw.door = await call(dw.R, "POST", "/relay/v1/t/" + dw.rt + "/door", { json: { refs: [dw.licence], t: dw.R.clock.now,
      sig: signHex(dw.lead, C.doorBytes(dw.rt, dw.R.clock.now, [dw.licence])) } });
    const k = keyPair(true), box = hex(32), knockCert = certFor(k.pub, dw.licence, dw.R.clock.now, span);
    const ch = await call(dw.R, "POST", "/relay/v1/t/" + dw.rt + "/hello", { json: {} });
    const knock = await call(dw.R, "POST", "/relay/v1/t/" + dw.rt + "/session", { json: { challenge: ch.json.challenge, door: knockCert,
      key: k.keyId, pub: k.pub, box, sig: signHex(k, C.doorHelloBytes(dw.rt, ch.json.challenge, k.keyId, box)) } });
    const place = "k-" + hex(8), sealKey = crypto.randomBytes(32);
    const ask = B.seal({ relayTeamId: dw.rt, epoch: 1, teamKey: sealKey, writer: { keyId: k.keyId, privateKey: k.privateKey },
      path: "desks/" + place + "/join.json", body: JSON.stringify({ ask: 1 }), counter: 1, place: "desk:" + place, kind: "file" });
    const up = await putBlob(dw, knock.json && knock.json.session, ask, { pub: k.pub });
    dw.R.clock.now = knockCert.until + M + HOUR;
    prove(dw, "b", span);
    await sessionAs(dw, "b");
    const again = await session(dw, k);
    const del = B.seal({ relayTeamId: dw.rt, epoch: 1, teamKey: sealKey, writer: { keyId: k.keyId, privateKey: k.privateKey },
      path: "desks/" + place + "/join.json", body: "", counter: 2, place: "desk:" + place, kind: "delete", supersedes: ask.id });
    const taken = await putBlob(dw, again.json && again.json.session, del);
    const ok = refused(lapsedSeat, "seat-lapsed") && removedA.status === 200 && refused(toldRemoved, "removed")
      && refused(lapse, "team-lapsed") && roRemoved.status === 200 && dw.door.status === 200 && knock.status === 200 && up.status === 200
      && opened(again) && taken.status === 200;
    return { ok, detail: brief({ seatLapsed: said(lapsedSeat), leadRemoves: said(removedA), thenTold: said(toldRemoved),
      lapsedTeam: said(lapse), lapsedRemoves: said(roRemoved), doorUp: said(up), withdrawSession: said(again), withdrawn: said(taken) }) };
  }
  function putBlob(w, token, blob, extra) {
    const meta = Object.assign({ v: 1, id: blob.id, supersedes: blob.supersedes, epoch: blob.epoch, writer: blob.writerKeyId,
      counter: blob.counter, del: blob.deletion, sig: blob.signature, nonce: blob.nonce, place: blob.place }, extra || {});
    const headers = { authorization: "Bearer " + token, "etiuda-blob": Buffer.from(JSON.stringify(meta), "utf8").toString("base64url") };
    return W.fetch(new Request("https://relay.test/relay/v1/t/" + w.rt + "/b/" + blob.id, { method: "PUT", headers, body: blob.ciphertext, duplex: "half" }), w.R.env)
      .then(async res => { const t = Buffer.from(await res.arrayBuffer()).toString("utf8"); let json = null; try { json = JSON.parse(t); } catch { json = null; } return { status: res.status, json }; });
  }
  /* A grant's seats out of shape is refused at a create and at a renewal, before any team takes it. */
  async function shapeScene() {
    const lead = keyPair(false), at = T0;
    const bad = {
      liveAfterIssue: { licence: hex(16), live: at + 1 },
      liveNegative: { licence: hex(16), live: -1 },
      liveNotInteger: { licence: hex(16), live: at + 0.5 },
      licenceShort: { licence: hex(8), live: at },
      licenceUpper: { licence: hex(16).toUpperCase(), live: at },
      extraField: { licence: hex(16), live: at, people: [] },
      missingLive: { licence: hex(16) },
      notObject: "seats",
      list: [hex(16), at],
    };
    const got = {};
    for (const [n, seats] of Object.entries(bad)) {
      const g = grantAt(lead.pub, at, seats);
      got[n] = C.grantWhy(g, lead.pub, at, K.ROOTS);
    }
    const R = S.relayEnv({ roots: K.ROOTS });
    R.clock.now = at;
    const rt = hex(16);
    const create = await call(R, "POST", "/relay/v1/teams", { json: K.createBody(rt, lead, at, b => signHex(lead, b), { grant: grantAt(lead.pub, at, bad.liveAfterIssue) }) });
    const w = await team({});
    const ren = await renew(w, grantAt(w.lead.pub, w.R.clock.now, bad.extraField));
    const good = C.grantWhy(grantAt(lead.pub, at, { licence: hex(16), live: at }), lead.pub, at, K.ROOTS);
    const zero = C.grantWhy(grantAt(lead.pub, at, { licence: hex(16), live: 0 }), lead.pub, at, K.ROOTS);
    const ok = Object.values(got).every(x => x === "shape") && create.status === 403 && said(create) === "bad-grant"
      && said(ren) === "bad-grant" && good === null && zero === null && !storeOf(w).get("seats");
    return { ok, detail: brief(Object.assign({}, got, { create: said(create), renew: said(ren), good, liveZero: zero })) };
  }
  /* Which grant makes a team an Entra team: the newest issued. An ordinary team renewed with seats asks for certificates; a later grant
     without seats makes it ordinary; an earlier-issued grant without seats changes nothing; a handover with seats makes it Entra. */
  /* The first grant an ordinary team was made with, as its lead's Studio still holds it. */
  const ordinaryFirst = w => w.firstGrant;
  async function keptScene() {
    const w = await team({});
    const before = await session(w, w.desks.a);
    w.R.clock.now += HOUR;
    const toEntra = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: w.R.clock.now }));
    const asks = await session(w, w.desks.a);
    const stale = await renew(w, grantAt(w.lead.pub, w.R.clock.now - 30 * MIN, undefined, { fields: { until: w.R.clock.now + 31 * DAY } }));
    const stillAsks = await session(w, w.desks.a);
    /* An earlier-issued grant carrying another licence's seats does not take the team's place either. */
    const otherLic = hex(16);
    const staleSeats = await renew(w, grantAt(w.lead.pub, w.R.clock.now - 20 * MIN, { licence: otherLic, live: w.R.clock.now - 20 * MIN }, { fields: { until: w.R.clock.now + 31 * DAY + HOUR } }));
    const ownLic = await session(w, w.desks.a, certFor(w.desks.a.pub, w.licence, w.R.clock.now, 7 * DAY));
    const staleLic = await session(w, w.desks.a, certFor(w.desks.a.pub, otherLic, w.R.clock.now, 7 * DAY));
    w.R.clock.now += HOUR;
    const toPlain = await renew(w, grantAt(w.lead.pub, w.R.clock.now, undefined, { fields: { until: w.R.clock.now + 32 * DAY } }));
    const plainAgain = await session(w, w.desks.a);
    /* The grant the team was made with, replayed after it was gated. */
    const replay = await renew(w, ordinaryFirst(w));
    const stillGated = await session(w, w.desks.a);
    const h = await team({});
    const next = keyPair(false), to = { keyId: next.keyId, pub: next.pub }, t = h.R.clock.now;
    const moved = await call(h.R, "POST", "/relay/v1/t/" + h.rt + "/lead", { json: { to, t, sig: signHex(h.lead, C.leadBytes(h.rt, to.keyId, to.pub, t)),
      grant: grantAt(next.pub, t, { licence: h.licence, live: t }) } });
    const handed = await session(h, h.desks.a);
    const ok = opened(before) && toEntra.status === 200 && refused(asks, "seat-lapsed") && stale.status === 200 && refused(stillAsks, "seat-lapsed")
      && staleSeats.status === 200 && opened(ownLic) && refused(staleLic, "seat-lapsed") && toPlain.status === 200 && refused(plainAgain, "seat-lapsed") && !!storeOf(w).get("seats") && replay.status === 200 && refused(stillGated, "seat-lapsed") && moved.status === 200 && refused(handed, "seat-lapsed");
    return { ok, detail: brief({ ordinary: said(before), renewedWithSeats: said(asks), earlierWithout: said(stale) + "/" + said(stillAsks),
      earlierOtherLicence: said(ownLic) + "/" + said(staleLic), laterWithout: said(toPlain) + "/" + said(plainAgain), replayedFirst: said(replay) + "/" + said(stillGated), handoverWithSeats: said(moved) + "/" + said(handed) }) };
  }
  /* An enrolled desk knocking at the door is a desk session: a current certificate of another of the door's licences than the seats'
     is refused seat-lapsed, one of the seats' licence opens. */
  async function doorKnockScene() {
    const w = await team({ seats: true });
    const other = hex(16), t = w.R.clock.now;
    const door = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/door", { json: { refs: [w.licence, other], t, sig: signHex(w.lead, C.doorBytes(w.rt, t, [w.licence, other])) } });
    const knock = async c => {
      const a = w.desks.a, box = hex(32), ch = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
      return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: ch.json.challenge, door: c, key: a.keyId, pub: a.pub, box,
        sig: signHex(a, C.doorHelloBytes(w.rt, ch.json.challenge, a.keyId, box)) } });
    };
    const wrong = await knock(certFor(w.desks.a.pub, other, t, 7 * DAY));
    const right = await knock(certFor(w.desks.a.pub, w.licence, t, 7 * DAY));
    const ok = door.status === 200 && refused(wrong, "seat-lapsed") && opened(right) && right.json.invite === undefined;
    return { ok, detail: brief({ door: said(door), otherLicence: said(wrong), seatsLicence: said(right) }) };
  }
  /* O1: an ordinary team's whole sequence (create, enrol, hello, session, upload, list, fetch, renewal, a desk taken off, a handover)
     gives the same answers and stores the same rows on this relay as on main's, the relay's own random values set aside. */
  async function ordinarySequence(core) {
    const kept = {};
    const ADOPT = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead"];
    if (core) for (const k of ADOPT) { kept[k] = C[k]; C[k] = core[k]; }
    try {
      const R = S.relayEnv({ roots: K.ROOTS });
      R.clock.now = T0;
      const keys = ordinarySequence.keys || (ordinarySequence.keys = { lead: keyPair(false), a: keyPair(true), b: keyPair(true), next: keyPair(false), rt: hex(16), pa: "k-" + hex(8), pb: "k-" + hex(8), teamKey: crypto.randomBytes(32) });
      const w = { R, rt: keys.rt, lead: keys.lead, rev: 0, desks: { a: Object.assign({}, keys.a, { place: keys.pa }), b: Object.assign({}, keys.b, { place: keys.pb }) } };
      const steps = [];
      const note = (name, r) => steps.push(name + " " + r.status + " " + JSON.stringify(r.json, (k, v) => (typeof v === "string" ? v.replace(/[0-9a-f]{16,}/g, "#") : v)));
      const g0 = ordinarySequence.g0 || (ordinarySequence.g0 = grantAt(keys.lead.pub, T0));
      note("create", await call(R, "POST", "/relay/v1/teams", { json: K.createBody(w.rt, w.lead, T0, b => signHex(w.lead, b), { grant: g0 }) }));
      note("devices", await devicesOf(w, ["a", "b"]));
      const s = await session(w, w.desks.a);
      note("session", s);
      const blob = ordinarySequence.blob || (ordinarySequence.blob = B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: keys.teamKey,
        writer: { keyId: keys.a.keyId, privateKey: keys.a.privateKey }, path: "a.ec", body: "body", counter: 1, place: "desk:" + keys.pa, kind: "file" }));
      note("put", await putBlob(w, s.json.session, blob));
      note("since", await call(R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: s.json.session }));
      note("blob", await call(R, "GET", "/relay/v1/t/" + w.rt + "/b/" + blob.id, { token: s.json.session }));
      R.clock.now += DAY;
      const g1 = ordinarySequence.g1 || (ordinarySequence.g1 = grantAt(keys.lead.pub, T0 + DAY));
      note("renew", await renew(w, g1));
      note("lead-session", await session(w, w.lead));
      note("remove", await devicesOf(w, ["b"]));
      note("removed", await session(w, w.desks.a));
      const t = R.clock.now, to = { keyId: keys.next.keyId, pub: keys.next.pub };
      const g2 = ordinarySequence.g2 || (ordinarySequence.g2 = grantAt(keys.next.pub, t));
      note("handover", await call(R, "POST", "/relay/v1/t/" + w.rt + "/lead", { json: { to, t, sig: signHex(w.lead, C.leadBytes(w.rt, to.keyId, to.pub, t)), grant: g2 } }));
      note("after", await session(w, w.desks.b));
      const rows = storeOf(w).dump().map(([k, v]) => k.replace(/[0-9a-f]{16,}/g, "#") + "=" + JSON.stringify(v, (kk, vv) => (typeof vv === "string" ? vv.replace(/[0-9a-f]{16,}/g, "#") : vv))).sort();
      return { steps, rows };
    } finally { if (core) for (const k of Object.keys(kept)) C[k] = kept[k]; }
  }
  async function ordinaryScene() {
    const text = mainCore();
    if (text === null) return { skip: true, detail: "no main in this tree" };
    const before = await ordinarySequence(coreFrom(text));
    const after = await ordinarySequence(null);
    const same = before.steps.join("\n") === after.steps.join("\n") && before.rows.join("\n") === after.rows.join("\n");
    const firstDiff = before.steps.find((s, i) => s !== after.steps[i]) || before.rows.find((s, i) => s !== after.rows[i]) || null;
    return { ok: same && before.steps.length === 12 && after.rows.every(r => !/^seat/.test(r)), detail: brief({ steps: after.steps.length, rows: after.rows.length, firstDiff }) };
  }

  /* ---- the legs ---- */
  const results = {};
  const leg = async (id, scene, line) => {
    const r = await safe(scene);
    results[id] = r;
    if (r.skip) { skip(id + " " + line + ": " + r.detail); return r; }
    check(r.ok === true, id + " " + line + ": " + r.detail);
    return r;
  };
  await leg("s1a", () => opensScene(7 * DAY), "a desk with a current certificate of the grant's licence opens a session and reads on an Entra team, its issue kept as evidence; the lead's session with none is refused");
  await leg("s2a", noCertScene, "O5 a desk sending no certificate is refused seat-lapsed on an Entra team; on an ordinary team a desk sending one is answered and stored exactly as one sending none, and nothing of seats is stored");
  await leg("s3a", wrongCertScene, "O6 a certificate of another licence, of another desk's key, forged, signed by a revoked service key, under a delegation that may not sign licences, past 30 days, issued ahead of the clock, or no certificate at all, is each refused seat-lapsed, and the desk's own opens");
  for (const [name, span] of WINDOWS) {
    await leg("s4 " + name, () => serviceDownScene(span), "O3 the licence service down for everyone: every certificate runs out, no grant comes, and every desk still opens at the margin and three and nine days past it");
    await leg("s5 " + name, () => microsoftDownScene(span), "the outage of Microsoft for everyone: the lead's Studio renews the grant twice a day with a live that stands still, and every desk still opens three days past its end");
    await leg("s6 " + name, () => removedByColleagueScene(span), "O4 a removed person's desk opens until a colleague's certificate issued M past its end is taken, a minute before that it opens, from then it is refused seat-lapsed, and the colleagues are never refused");
    await leg("s7 " + name, () => removedByGrantScene(span), "O4 a removed person's desk is refused once a renewed grant's live is M past its end, and opens while it is a minute short");
    await leg("s8 " + name, () => oneFailsScene(span), "one person's renewal failing while a colleague's succeeds: refused seat-lapsed past its end and the margin, and open again the moment its desk holds a new certificate");
    await leg("s9 " + name, () => teamOfOneScene(span), "case (2) a team of one desk: with the lead's Studio closed nothing advances the evidence and the desk keeps opening; with it running, a removed desk is cut within the grant's twelve hours and the margin after its end");
    await leg("s10 " + name, () => studioClosedScene(span), "case (2) a team whose lead's Studio is closed for eight days: colleagues proving daily are never refused, and the removed desk is cut within a day and the margin of its end by their evidence alone");
    await leg("s11 " + name, () => companyBrokenScene(span), "case (2) a company whose own Entra breaks every renewal on one day: nobody is cut three days past every end; once one person proves, the others' run-out certificates are refused until each desk renews, and then open");
    await leg("s13 " + name, () => letGoScene(span), "O8 night decision 6: the lead removes a desk whose seat lapsed and it is then told removed, a lapsed team's lead still removes a desk, and a door request is taken back after its certificate ran out past the evidence");
  }
  const order = await leg("s12a", orderScene, "O7 the order: a grant carrying seats is refused fields by main's relay before this change and taken by this one, and main's takes the same grant without seats");
  await leg("s14a", shapeScene, "a grant's seats out of shape (live after the issue, negative or fractional, a licence not 32 lowercase hex, an extra or missing field, not an object) is refused shape, and at a create or a renewal bad-grant, before any team keeps it");
  await leg("s15a", keptScene, "a team once gated stays gated: an ordinary team renewed with seats asks for certificates, and a grant without seats, issued earlier, issued later (the removed lead's trial) or the team's first replayed, leaves it gated; an earlier-issued grant of another licence changes nothing; a handover with seats gates a team");
  /* The grant's live never falls while the licence stays: a removed desk cut by one grant's live stays cut when a newer grant names an
     earlier live (the service reads live from the seats it still holds, and a freed seat's proof drops out). */
  async function liveKeptScene() {
    const w = await team({ seats: true });
    prove(w, "a", DAY);
    const aEnd = w.desks.a.cert.until;
    w.R.clock.now = aEnd + 2 * HOUR;
    await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: aEnd + M }));
    const cut = await sessionAs(w, "a");
    w.R.clock.now += HOUR;
    const lower = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: T0 }));
    const still = await sessionAs(w, "a");
    const kept = storeOf(w).get("seats");
    const ok = refused(cut, "seat-lapsed") && lower.status === 200 && refused(still, "seat-lapsed") && !!kept && kept.live === aEnd + M;
    return { ok, detail: brief({ cut: said(cut), newerGrantEarlierLive: said(lower), still: said(still), keptLiveHoursAfterEnd: kept ? (kept.live - aEnd) / HOUR : null }) };
  }
  await leg("s15b", liveKeptScene, "a grant's live never falls while the licence stays: a desk cut by one grant stays cut when a newer grant names an earlier live");
  /* The service's signed release lifts the gate: for the gated licence and issued after it, the team is ordinary again and asks nothing;
     a release of another licence, one issued before the gate, and one on a team never gated change nothing and store nothing. */
  async function releaseScene() {
    const w = await team({ seats: true });
    const t1 = w.R.clock.now + HOUR;
    w.R.clock.now = t1;
    const other = await renew(w, grantAt(w.lead.pub, t1, { licence: hex(16), release: true }));
    const otherAsks = await session(w, w.desks.a);
    const older = await renew(w, grantAt(w.lead.pub, T0 - HOUR, { licence: w.licence, release: true }, { fields: { until: t1 + 31 * DAY } }));
    const olderAsks = await session(w, w.desks.a);
    const release = await renew(w, grantAt(w.lead.pub, t1, { licence: w.licence, release: true }, { fields: { until: t1 + 32 * DAY } }));
    const free = await session(w, w.desks.a);
    const freeLead = await session(w, w.lead);
    const o = await team({});
    const oRelease = await renew(o, grantAt(o.lead.pub, o.R.clock.now + MIN, { licence: o.licence, release: true }));
    const shapes = ["release false", "release with live"].map((_, i) => C.grantWhy(grantAt(w.lead.pub, T0, i ? { licence: w.licence, release: true, live: T0 } : { licence: w.licence, release: false }), w.lead.pub, T0, K.ROOTS));
    const ok = other.status === 200 && refused(otherAsks, "seat-lapsed") && older.status === 200 && refused(olderAsks, "seat-lapsed")
      && release.status === 200 && opened(free) && opened(freeLead) && !storeOf(w).get("seats") && !storeOf(w).get("seatSeen")
      && oRelease.status === 200 && !storeOf(o).dump().some(([k]) => /^seat/.test(k)) && shapes.every(s => s === "shape");
    return { ok, detail: brief({ otherLicence: said(otherAsks), issuedBefore: said(olderAsks), released: said(free) + "/" + said(freeLead), ordinaryTeam: said(oRelease), shapes }) };
  }
  await leg("s15c", releaseScene, "only the service's signed release lifts the gate, for the gated licence and issued after it; a release of another licence or issued before the gate changes nothing, nor one on a team never gated, and a release of any other shape is refused");
  await leg("s16a", doorKnockScene, "an enrolled desk knocking at the door with a current certificate of another of the door's licences than the seats' is refused seat-lapsed, and of the seats' licence opens as a desk");
  /* A STUDIO IS JUDGED AS A DESK IS, BY ITS PERSON (Claude alpha's ruling of 20:47 on C1): on an Entra team the lead's own Studio and a
     Studio following it as a teammate each present the certificate of their person's lead seat, named for that Studio's own key. */
  async function studioLeadScene(span) {
    const w = await team({ seats: true });
    const t = w.R.clock.now, other = keyPair(false);
    const none = await session(w, w.lead);
    const own = await session(w, w.lead, certFor(w.lead.pub, w.licence, t, span));
    const otherKey = await session(w, w.lead, certFor(other.pub, w.licence, t, span));
    /* The author loses the role at once and never proves again; colleagues do. Past its end and M the lead's session is refused, and what
       takes access away still goes: a desk taken off, an invitation dropped, the door closed, the team handed over. */
    const inv = hex(16);
    const addRow = [{ id: inv, hash: sha(hex(32)) }];
    const added = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/invites", { json: { add: addRow, drop: [], t, sig: signHex(w.lead, C.invitesBytes(w.rt, t, addRow, [])) } });
    w.R.clock.now = t + span + M;
    prove(w, "b", span);
    await sessionAs(w, "b");
    const former = await session(w, w.lead, certFor(w.lead.pub, w.licence, t, span));
    const t2 = w.R.clock.now;
    const removed = await devicesOf(w, ["b", "c"]);
    const dropped = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/invites", { json: { add: [], drop: [inv], t: t2, sig: signHex(w.lead, C.invitesBytes(w.rt, t2, [], [inv])) } });
    const closed = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/door", { json: { refs: [], t: t2, sig: signHex(w.lead, C.doorBytes(w.rt, t2, [])) } });
    const next = keyPair(false), to = { keyId: next.keyId, pub: next.pub };
    const handed = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/lead", { json: { to, t: t2, sig: signHex(w.lead, C.leadBytes(w.rt, to.keyId, to.pub, t2)),
      grant: grantAt(next.pub, t2, { licence: w.licence, live: t2 }) } });
    const newLead = await session(w, next, certFor(next.pub, w.licence, t2, span));
    const ok = refused(none, "seat-lapsed") && opened(own) && refused(otherKey, "seat-lapsed") && added.status === 200 && refused(former, "seat-lapsed")
      && removed.status === 200 && dropped.status === 200 && closed.status === 200 && handed.status === 200 && opened(newLead);
    return { ok, detail: brief({ none: said(none), ownSeat: said(own), anotherKeysSeat: said(otherKey), formerAuthor: said(former), removes: said(removed),
      drops: said(dropped), closesDoor: said(closed), handsOver: said(handed), newLead: said(newLead) }) };
  }
  /* A lead's second computer following its own team as a teammate (its member key enrolled as a desk) keeps its session for days while
     its person proves, each renewal a new certificate for that member key; once the person's role is gone it is refused within the
     window and M, as a leaver's desk is. On an ordinary team neither Studio is asked for anything. */
  async function studioFollowScene(span) {
    const w = await team({ seats: true, desks: ["a", "m"] });
    const kept = [];
    prove(w, "a", span);
    prove(w, "m", span);
    for (let d = 1; d <= 3; d++) {
      w.R.clock.now = T0 + d * span;
      prove(w, "a", span);
      prove(w, "m", span);
      kept.push(await sessionAs(w, "m"));
    }
    const lost = w.desks.m.cert.until;
    w.R.clock.now = lost + M;
    prove(w, "a", span);
    await sessionAs(w, "a");
    const former = await sessionAs(w, "m");
    const o = await team({ desks: ["m"] });
    const plainLead = await session(o, o.lead), plainMember = await session(o, o.desks.m);
    const ok = kept.length === 3 && kept.every(opened) && refused(former, "seat-lapsed") && opened(plainLead) && opened(plainMember);
    return { ok, detail: brief({ secondComputer: kept.map(said), formerAuthor: said(former), ordinaryLead: said(plainLead), ordinaryMember: said(plainMember) }) };
  }
  for (const [name, span] of WINDOWS) {
    await leg("s19a " + name, () => studioLeadScene(span), "a lead's own Studio on an Entra team opens with its person's lead-seat certificate for its own key, none or another key's is refused, a former author is refused past its end and M, and a desk taken off, an invitation dropped, the door closed and the team handed over still go");
    await leg("s19b " + name, () => studioFollowScene(span), "a lead's second computer following as a teammate keeps its session while its person proves, a former author's is refused past its end and M, and on an ordinary team neither Studio is asked for anything");
  }
  /* A POOLED DESK'S GRACE (Claude alpha's ruling of 2026-11-14 01:07): its certificate runs a day, signed "pooled". A colleague proved past
     its end and the margin, and then the service went quiet for everyone: the pooled desk is refused while that evidence is fresh, opens
     once it is SEAT_QUIET_MS old, and keeps opening to POOLED_GRACE_MS past its end, then is refused; an ordinary desk in the same state
     has no grace. */
  async function pooledOutageScene() {
    const w = await team({ seats: true });
    const a = w.desks.a, b = w.desks.b;
    a.cert = certFor(a.pub, w.licence, T0, DAY, { fields: { pooled: true } });
    b.cert = certFor(b.pub, w.licence, T0, DAY);
    const end = T0 + DAY, last = end + 2 * HOUR;
    w.R.clock.now = last;
    prove(w, "c", DAY);
    const colleague = await sessionAs(w, "c");
    w.R.clock.now = last + HOUR;
    /* Only the ordinary desk is tried while the evidence is fresh: a pooled desk refused then keeps that refusal (s21d). */
    const fresh = [await sessionAs(w, "b")];
    w.R.clock.now = last + C.SEAT_QUIET_MS + MIN;
    const quiet = [await sessionAs(w, "a"), await sessionAs(w, "b")];
    w.R.clock.now = end + C.POOLED_GRACE_MS - MIN;
    const late = await sessionAs(w, "a");
    w.R.clock.now = end + C.POOLED_GRACE_MS;
    const past = await sessionAs(w, "a");
    const ok = C.POOLED_GRACE_MS === 72 * HOUR && opened(colleague) && refused(fresh[0], "seat-lapsed")
      && opened(quiet[0]) && refused(quiet[1], "seat-lapsed") && opened(late) && refused(past, "seat-lapsed");
    return { ok, detail: brief({ evidenceFresh: fresh.map(said), serviceQuiet: quiet.map(said), graceLastMinute: said(late), graceOver: said(past) }) };
  }
  /* A pooled desk taken over while the service works (its person signed in on another pooled machine, which took the place): colleagues
     prove every two hours, so the evidence is never quiet, and the desk is refused from its end and the margin, all through the grace. */
  async function pooledTakenScene() {
    const w = await team({ seats: true });
    const a = w.desks.a;
    a.cert = certFor(a.pub, w.licence, T0, DAY, { fields: { pooled: true } });
    const end = T0 + DAY, rows = [];
    for (let t2 = T0 + 2 * HOUR; t2 <= end + C.POOLED_GRACE_MS; t2 += 2 * HOUR) {
      w.R.clock.now = t2;
      prove(w, "c", DAY);
      await sessionAs(w, "c");
      if (t2 >= end + SEAT_M() ) rows.push(await sessionAs(w, "a"));
    }
    const ok = rows.length > 30 && rows.every(r => refused(r, "seat-lapsed"));
    return { ok, detail: brief({ sessionsAfterEnd: rows.length, refused: rows.filter(r => refused(r, "seat-lapsed")).length }) };
  }
  const SEAT_M = () => C.SEAT_MARGIN_MS;
  /* The test architect's case: a removed pooled desk refused by day, then a quiet night of seven hours, nobody on the team proving. A
     refusal sticks: that certificate is never honoured by the grace again; the desk's next certificate, from a later logon, opens. */
  async function pooledNightScene() {
    const w = await team({ seats: true });
    const a = w.desks.a;
    a.cert = certFor(a.pub, w.licence, T0, DAY, { fields: { pooled: true } });
    const end = T0 + DAY;
    let day = null, last = 0;
    for (let t2 = T0 + 2 * HOUR; t2 <= end + 10 * HOUR; t2 += 2 * HOUR) {
      w.R.clock.now = last = t2;
      prove(w, "c", DAY);
      await sessionAs(w, "c");
      if (t2 >= end + SEAT_M()) day = await sessionAs(w, "a");
    }
    w.R.clock.now = last + 7 * HOUR;
    const night = await sessionAs(w, "a");
    w.R.clock.now += HOUR;
    const nightLater = await sessionAs(w, "a");
    const kept = storeOf(w).list("pr:").length;
    a.cert = certFor(a.pub, w.licence, w.R.clock.now, DAY, { fields: { pooled: true } });
    const nextLogon = await sessionAs(w, "a");
    /* Past the grace's end the kept refusal goes at the next prune (a colleague's list). */
    w.R.clock.now = end + C.POOLED_GRACE_MS + MIN;
    prove(w, "c", DAY);
    const cs = await sessionAs(w, "c");
    await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: cs.json && cs.json.session });
    const left = storeOf(w).list("pr:").length;
    const ok = refused(day, "seat-lapsed") && refused(night, "seat-lapsed") && refused(nightLater, "seat-lapsed") && kept === 1 && opened(nextLogon) && left === 0;
    return { ok, detail: brief({ byDay: said(day), quietNight7h: said(night), quietNight8h: said(nightLater), kept, nextLogon: said(nextLogon), keptAfterGrace: left }) };
  }
  /* The pooled mark is signed: a certificate carrying it that its signature does not cover is refused, current or run out, and a signed
     pooled certificate is taken at the door as any is. */
  async function pooledSignedScene() {
    const w = await team({ seats: true });
    const a = w.desks.a, now = w.R.clock.now;
    const forged = certFor(a.pub, w.licence, now, DAY);
    forged.pooled = true;
    const forgedNow = await session(w, a, forged);
    const k = keyPair(true), box = hex(32);
    const door = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/door", { json: { refs: [w.licence], t: now, sig: signHex(w.lead, C.doorBytes(w.rt, now, [w.licence])) } });
    const ch = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
    const knock = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: ch.json.challenge, door: certFor(k.pub, w.licence, now, DAY, { fields: { pooled: true } }),
      key: k.keyId, pub: k.pub, box, sig: signHex(k, C.doorHelloBytes(w.rt, ch.json.challenge, k.keyId, box)) } });
    const signed = await session(w, a, certFor(a.pub, w.licence, now, DAY, { fields: { pooled: true } }));
    const other = certFor(a.pub, w.licence, now, DAY, { fields: { pooled: "yes" } });
    const odd = await session(w, a, other);
    const ok = refused(forgedNow, "seat-lapsed") && door.status === 200 && knock.status === 200 && opened(signed) && refused(odd, "seat-lapsed");
    return { ok, detail: brief({ forgedMark: said(forgedNow), doorKnock: said(knock), signed: said(signed), markNotTrue: said(odd) }) };
  }
  await leg("s21a", pooledOutageScene, "a pooled desk first tried after its service went quiet, a colleague having proved past its end, opens once that evidence is SEAT_QUIET_MS old and to POOLED_GRACE_MS (72 hours) past its end, then is refused; an ordinary desk in the same state has no grace, fresh or quiet");
  await leg("s21b", pooledTakenScene, "a pooled desk taken over while the service works, colleagues proving every two hours, is refused from its end and the margin all through the grace");
  await leg("s21d", pooledNightScene, "a removed pooled desk refused by day stays refused through a quiet night of seven hours and more, its certificate never honoured by the grace again (one refusal kept, by key and end), its next certificate from a later logon opens, and the kept refusal goes at the first prune past the grace's end");
  await leg("s21c", pooledSignedScene, "the pooled mark is signed: one its signature does not cover, or not true, is refused, and a signed pooled certificate opens and knocks at the door");
  /* The door still refuses an ended certificate of a stranger: only a desk session leaves the end to seatGate. */
  async function doorEndedScene() {
    const w = await team({ seats: true });
    const t = w.R.clock.now;
    const door = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/door", { json: { refs: [w.licence], t, sig: signHex(w.lead, C.doorBytes(w.rt, t, [w.licence])) } });
    const knock = async c => {
      const k = keyPair(true), box = hex(32), ch = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
      return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: ch.json.challenge, door: c(k), key: k.keyId, pub: k.pub, box,
        sig: signHex(k, C.doorHelloBytes(w.rt, ch.json.challenge, k.keyId, box)) } });
    };
    const ended = await knock(k => certFor(k.pub, w.licence, t - 2 * DAY, DAY));
    const current = await knock(k => certFor(k.pub, w.licence, t, DAY));
    return { ok: door.status === 200 && said(ended) === "not-enrolled" && current.status === 200 && current.json.invite === true, detail: brief({ ended: said(ended), current: said(current) }) };
  }
  await leg("s18a", doorEndedScene, "a stranger's ended certificate is still refused at the door not-enrolled, and a current one knocks");
  await leg("s17a", ordinaryScene, "O1 an ordinary team's whole sequence (create, enrol, session, upload, list, fetch, renewal, lead session, a desk taken off, a handover) gives the same answers and stores the same rows on this relay as on main's, random values set aside");

  /* ---- the plants: each guard lifted in a copy of relay/core.cjs turns its named leg red, and the product file is never written ---- */
  const ADOPTED = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead", "certWhy"];
  async function lifted(tag, fn) {
    const digest = sha(fs.readFileSync(PRODUCT.core)), kept = {};
    for (const k of ADOPTED) kept[k] = C[k];
    let turned = false, detail = "plant line absent";
    try {
      const lines = fs.readFileSync(PRODUCT.core, "utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const fresh = coreFrom(lines.join("\n"));
        for (const k of ADOPTED) C[k] = fresh[k];
        const r = await safe(fn);
        turned = r.ok !== true;
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) { detail = e && e.stack ? e.stack.split("\n")[0] : String(e); }
    finally { for (const k of ADOPTED) C[k] = kept[k]; }
    return { turned, back: sha(fs.readFileSync(PRODUCT.core)) === digest, detail };
  }
  const W7 = 7 * DAY, W1 = DAY;
  const PLANTS = [
    ["seat-session", "s2a", noCertScene, "a desk's session asks no seat"],
    ["seat-cert", "s3a", wrongCertScene, "a certificate that is not this team's current seat opens"],
    ["seat-ordinary", "s2a", noCertScene, "an ordinary team is judged as an Entra team"],
    ["seat-ordinary", "s17a", ordinaryScene, "an ordinary team asks a seat, so its sequence differs from main's"],
    ["seat-lapsed", "s6 W=7d", () => removedByColleagueScene(W7), "a run-out certificate always opens"],
    ["seat-lapsed", "s7 W=1d", () => removedByGrantScene(W1), "a run-out certificate always opens"],
    ["pooled-grace", "s21a", pooledOutageScene, "a pooled desk has no grace"],
    ["pooled-quiet", "s21b", pooledTakenScene, "the grace runs while the service works"],
    ["pooled-refused-mark", "s21d", pooledNightScene, "a daylight refusal is not kept, so a quiet night reopens the desk"],
    ["pooled-refused-read", "s21d", pooledNightScene, "a kept refusal is never read"],
    ["pooled-refused-prune", "s21d", pooledNightScene, "a kept refusal outlives the grace"],
    ["cert-pooled-bytes", "s21c", pooledSignedScene, "the pooled mark rides outside the signature"],
    ["seat-seen", "s10 W=7d", () => studioClosedScene(W7), "no certificate taken at a session is kept as evidence"],
    ["seat-evidence-seen", "s10 W=1d", () => studioClosedScene(W1), "the evidence reads the grant's live alone"],
    ["seat-door", "s16a", doorKnockScene, "an enrolled desk at the door asks no seat"],
    ["seat-lead", "s19a W=7d", () => studioLeadScene(W7), "the lead's session asks no seat"],
    ["seat-lead", "s19a W=1d", () => studioLeadScene(W1), "the lead's session asks no seat"],
    ["seats-create", "s1a", () => opensScene(W7), "a create's seats are not kept"],
    ["seats-renew", "s15a", keptScene, "a renewal's seats are not kept"],
    ["seats-lead", "s15a", keptScene, "a handover's seats are not kept"],
    ["seats-held", "s15a", keptScene, "a later grant without seats lifts the gate"],
    ["seats-release", "s15c", releaseScene, "the service's release lifts nothing"],
    ["seats-older", "s15a", keptScene, "an earlier-issued grant takes the team's seats"],
    ["seats-live-kept", "s15b", liveKeptScene, "a newer grant's earlier live lowers the evidence"],
    ["grant-seats", "s14a", shapeScene, "seats out of shape are taken"],
    ["cert-ended", "s18a", doorEndedScene, "the door takes an ended certificate"],
  ];
  for (const [tag, id, scene, what] of PLANTS) {
    const line = "p " + id + " lifting plant:" + tag + " turns " + id + " red (" + what + "), and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    const base = results[id] && results[id].ok === true;
    const p = await lifted(tag, scene);
    check(base && p.turned && p.back, line + ": " + p.detail + ", sha " + (p.back ? "unchanged" : "CHANGED"));
  }
  /* ---- the desk's half: shell/relay/channel.cjs over the same relay ---- */
  const CH = require(path.join(ROOT, "shell", "relay", "channel.cjs"));
  /* A desk's channel over team `w`, its seat what `seat.cert` holds; each session's body kept, so a leg reads what the desk sent. */
  function deskChannel(w, name, seat, mod) {
    const d = w.desks[name], bodies = [], told = [];
    const mirror = path.join(WORK, "m" + (++copies));
    const ch = (mod || CH).createChannel({
      rt: w.rt, url: "https://relay.test/relay/v1", mirror, stateFile: mirror + ".json", watch: false, pollMs: 1e9,
      pin: () => ({ teamId: "t-" + w.rt.slice(0, 8), rt: w.rt, lead: { keyId: w.lead.keyId, public: w.lead.pub } }),
      me: () => ({ keyId: d.keyId, public: d.pub, privateKey: d.privateKey, place: "desk:" + d.place }),
      keyFor: () => null, sealEpoch: () => 1, clock: () => w.R.clock.now, say: () => {},
      request: async (method, url, headers, body) => {
        if (/\/session$/.test(url)) { try { bodies.push(JSON.parse(Buffer.from(body).toString("utf8"))); } catch { bodies.push(null); } }
        const res = await W.fetch(new Request(url, { method, headers, body: method === "GET" ? undefined : body, duplex: "half" }), w.R.env);
        return { status: res.status, header: n => res.headers.get(n), bytes: Buffer.from(await res.arrayBuffer()) };
      },
      connect: () => null,
      seat: () => seat.cert || null,
      seatRenew: async () => { seat.renewals = (seat.renewals || 0) + 1; if (seat.renew) seat.cert = seat.renew(); },
      onSeat: s => told.push(s),
    });
    return { ch, bodies, told };
  }
  const cycleOf = async c => { c.ch.start(); await c.ch.idle(); };
  /* The desk learns the team asks: its first hello carries nothing, the refusal leaves the challenge unspent, and the same challenge
     with its certificate opens; on an ordinary team no session ever carries one. */
  async function deskLearnsScene(mod) {
    const w = await team({ seats: true });
    const seat = { cert: prove(w, "a", 7 * DAY) };
    const c = deskChannel(w, "a", seat, mod);
    await cycleOf(c);
    const online = c.ch.online();
    await c.ch.stop();
    const o = await team({});
    const os = { cert: prove(o, "a", 7 * DAY) };
    const oc = deskChannel(o, "a", os, mod);
    await cycleOf(oc);
    const oOnline = oc.ch.online();
    await oc.ch.stop();
    const sent = c.bodies.map(b => (b && b.seat ? "seat" : "none"));
    const ok = online && sent.join() === "none,seat" && c.bodies[0].challenge === c.bodies[1].challenge && oOnline
      && oc.bodies.length >= 1 && oc.bodies.every(b => b && b.seat === undefined) && c.told.length === 0;
    return { ok, detail: brief({ entraSent: sent, entraOnline: online, ordinarySent: oc.bodies.map(b => (b && b.seat ? "seat" : "none")), ordinaryOnline: oOnline }) };
  }
  /* The desk renews before a session with a run-out certificate: the renewal is asked once, and the session carries the new one. */
  async function deskRenewsScene(mod) {
    const w = await team({ seats: true });
    const seat = { cert: prove(w, "a", DAY) };
    prove(w, "b", DAY);
    w.R.clock.now = seat.cert.until + M;
    prove(w, "b", DAY);
    await sessionAs(w, "b");
    seat.renew = () => certFor(w.desks.a.pub, w.licence, w.R.clock.now, DAY);
    const c = deskChannel(w, "a", seat, mod);
    await cycleOf(c);
    const online = c.ch.online();
    await c.ch.stop();
    const last = c.bodies[c.bodies.length - 1];
    const ok = online && seat.renewals === 1 && !!last && !!last.seat && last.seat.issued === w.R.clock.now;
    return { ok, detail: brief({ online, renewals: seat.renewals, sentIssuedNow: !!last && !!last.seat && last.seat.issued === w.R.clock.now }) };
  }
  /* A removed person's desk: the renewal brings nothing, the relay refuses, and the shell is told once, "refused"; a later cycle says
     nothing more; the desk signed in again opens, and the shell is told "open". */
  async function deskToldScene(mod) {
    const w = await team({ seats: true });
    const seat = { cert: prove(w, "a", DAY) };
    w.R.clock.now = seat.cert.until + M;
    prove(w, "b", DAY);
    await sessionAs(w, "b");
    const c = deskChannel(w, "a", seat, mod);
    await cycleOf(c);
    const refusedOnline = c.ch.online();
    c.ch.kick();
    await c.ch.idle();
    const toldBefore = c.told.slice();
    await c.ch.stop();
    w.R.clock.now += 10 * MIN;
    seat.cert = certFor(w.desks.a.pub, w.licence, w.R.clock.now, DAY);
    await cycleOf(c);
    const back = c.ch.online();
    await c.ch.stop();
    const ok = !refusedOnline && toldBefore.join() === "refused" && back && c.told.join() === "refused,open";
    return { ok, detail: brief({ refusedOnline, toldWhileRefused: toldBefore, signedInAgain: back, told: c.told }) };
  }
  /* A desk whose current certificate the relay refuses (its service key revoked): it renews once and opens with the new one; a renewal
     that brings the same certificate is not sent again. */
  async function deskRefusedRenewsScene(mod) {
    const w = await team({ seats: true });
    const svc = serviceKey(), now = w.R.clock.now, a = w.desks.a;
    const viaSvc = K.delegationFor(now, { fields: { may: ["licence"], key: { id: svc.id, pub: svc.pub } } });
    w.R.env.REVOKED = revokedText([svc.pub]);
    const seat = { cert: certFor(a.pub, w.licence, now, DAY, { signer: svc, via: viaSvc }) };
    seat.renew = () => certFor(a.pub, w.licence, w.R.clock.now, DAY);
    const c = deskChannel(w, "a", seat, mod);
    await cycleOf(c);
    const online = c.ch.online();
    await c.ch.stop();
    const same = { cert: certFor(a.pub, w.licence, now, DAY, { signer: svc, via: viaSvc }) };
    same.renew = () => same.cert;
    const c2 = deskChannel(w, "a", same, mod);
    await cycleOf(c2);
    const sentSame = c2.bodies.filter(b => b && b.seat).length;
    await c2.ch.stop();
    const ok = online && seat.renewals === 1 && c.bodies.length === 3 && !!c.bodies[2].seat && c.bodies[2].seat.via.key.pub === K.DELEGATE.pub
      && !c2.ch.online() && same.renewals === 1 && sentSame === 1;
    return { ok, detail: brief({ online, renewals: seat.renewals, sessions: c.bodies.length, sameRenewalSentAgain: sentSame > 1 }) };
  }
  await leg("d4a", () => deskRefusedRenewsScene(), "a desk whose current certificate the relay refuses (its service key revoked) renews once and opens with the new one; a renewal bringing the same certificate is not sent again");
  await leg("d1a", () => deskLearnsScene(), "the desk on an Entra team sends its certificate once the relay refuses a session without one, on the same challenge, and opens; on an ordinary team no session ever carries one");
  await leg("d2a", () => deskRenewsScene(), "a desk whose certificate has run out renews before its session, once, and the session carries the new certificate and opens");
  await leg("d3a", () => deskToldScene(), "a removed person's desk is refused, the shell is told refused once over two cycles, and open once the desk holds a new certificate");
  const PRODUCT_CH = path.join(ROOT, "shell", "relay", "channel.cjs");
  async function liftedChannel(tag, fn) {
    const digest = sha(fs.readFileSync(PRODUCT_CH));
    let turned = false, detail = "plant line absent";
    try {
      const lines = fs.readFileSync(PRODUCT_CH, "utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const dir = copyOf({ "shell/relay/channel.cjs": lines.join("\n"), "shell/relay/blob.cjs": forwardTo(PRODUCT.blob) });
        const r = await safe(() => fn(require(path.join(dir, "shell", "relay", "channel.cjs"))));
        turned = r.ok !== true;
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) { detail = e && e.stack ? e.stack.split("\n")[0] : String(e); }
    return { turned, back: sha(fs.readFileSync(PRODUCT_CH)) === digest, detail };
  }
  for (const [tag, id, scene, what] of [
    ["seat-learn", "d1a", deskLearnsScene, "the desk never sends its certificate"],
    ["seat-renew-first", "d2a", deskRenewsScene, "a run-out certificate is sent unrenewed"],
    ["seat-told", "d3a", deskToldScene, "the shell is never told"],
    ["seat-renew-refused", "d4a", deskRefusedRenewsScene, "a refused current certificate is never renewed"],
  ]) {
    const line = "p " + id + " lifting plant:" + tag + " in a copy of shell/relay/channel.cjs turns " + id + " red (" + what + "), and the product file is never written";
    if (PLANTS_OFF) { skip(line); continue; }
    const p = await liftedChannel(tag, scene);
    check(results[id] && results[id].ok === true && p.turned && p.back, line + ": " + p.detail + ", sha " + (p.back ? "unchanged" : "CHANGED"));
  }
  /* O1 and O7 lean on main's core; their own control is that a seats grant changes their answer on this relay. */
  if (order && order.mainHasSeats) check(false, "s12b main's core already names seats, so O7 cannot show the order: merge order changed");
  else check(true, "s12b main's core does not name seats, so O7 shows the order it claims" + (order && order.skip ? " (main not readable here)" : ""));
}

try { await main(); }
catch (e) { check(false, "harness: " + (e && e.stack ? e.stack : e)); }
try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* a temp folder */ }
console.log("#counts checks=" + asserted + " skipped=" + skipped + " failed=" + failed + " expected=" + EXPECTED);
if (asserted + skipped < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + (asserted + skipped) + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
process.exit(Math.min(failed, 63));
