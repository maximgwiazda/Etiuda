/* THE SEATS OF A TEAM, AT THE RELAY AND THE DESK: the strict arm of a team whose licence follows Entra (decision 49, option (b)), and
 * the ordinary arm, a current certificate of any licence for every other team's desks and every invitation. node tests/relay-seats.mjs
 * Over relay/worker.mjs on relay/test/stand-ins.cjs, as relay-unit runs it, and shell/relay/channel.cjs over that relay: each timeline
 * leg at the window W of seven days and of one day, the ruling still open; each guard lifted or planted in a copy turns its named leg red,
 * and no product file is written. Node builtins only, no window. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "relay-seats-plants-"));
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 147;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
/* ETIUDA_PLANT_ONLY, a comma list of plant tags or planted names: only those plants run, every other is skipped, so one plant is proved
   alone without the whole sweep. */
const PLANT_ONLY = (process.env.ETIUDA_PLANT_ONLY || "").split(",").map(s => s.trim()).filter(Boolean);
const plantSkipped = tag => PLANTS_OFF || (PLANT_ONLY.length > 0 && PLANT_ONLY.indexOf(typeof tag === "object" ? tag.name : tag) < 0);

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
/* A copy of relay/team.cjs a plant runs the team's objects over, or null for the product's. */
let TEAM_COPY = null;

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
/* A certificate as the licence service signs one (the kit's certFor). */
const certFor = (deskPub, licence, issued, span, o) => K.certFor(deskPub, licence, issued, span, o);
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
  const R = S.relayEnv(Object.assign({ roots: K.ROOTS }, TEAM_COPY ? { team: TEAM_COPY } : {}));
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

  /* O2 and the lead: a current certificate of the grant's licence opens a desk's session and its reads; the lead's with none is refused. */
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
  /* O5: a desk sending no certificate is refused on an Entra team and on an ordinary team; on an ordinary team one sending a current
     certificate opens, and nothing of seats is stored. */
  async function noCertScene() {
    const w = await team({ seats: true });
    const none = await session(w, w.desks.a);
    const o = await team({});
    const plainS = await session(o, o.desks.a);
    const withS = await session(o, o.desks.b, certFor(o.desks.b.pub, o.licence, o.R.clock.now, 7 * DAY));
    const keys = storeOf(o).dump().map(([k]) => k);
    const ok = refused(none, "seat-lapsed") && refused(plainS, "seat-lapsed") && opened(withS) && !keys.some(k => /^(seat|pr:)/.test(k));
    return { ok, detail: brief({ entraNone: said(none), ordinaryNone: said(plainS), ordinaryWithCert: said(withS), seatRows: keys.filter(k => /^(seat|pr:)/.test(k)) }) };
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
  /* O7, the order: a grant carrying seats is refused "fields" by the relay before the seats change, so the service may send one only
     once the relay that reads it is deployed; this relay takes it. "The relay before the change" is a fixture: relay/core.cjs of
     engine abc58e9f, captured once, its sha256 held here. It was read from main's ref until main itself carried the change (engine
     fold 103, 2026-11-16), and a "before" read from a moving ref stopped being one (the test architect). */
  const BEFORE = { file: path.join(ROOT, "tests", "fixtures", "relay-core-before-seats.cjs.txt"), from: "abc58e9f",
    sha256: "a028e4502dae23cd3967d653274351318a5fb55656df588cc8688962c4c7734e" };
  function coreBefore(fixture) {
    const fx = fixture || BEFORE;
    let text; try { text = fs.readFileSync(fx.file, "utf8").replace(/\r\n/g, "\n"); } catch (e) { return null; }
    return sha(text) === fx.sha256 ? text : null;
  }
  /* THE RELAY BEFORE THE ORDINARY ARM (piece C-2): relay/core.cjs of engine main 158d1826, the blob 2e0bd6bd, captured once, so O1, the
     rollback and d8a ask the relay that is out there, never a moving ref. */
  const BEFORE_RULE = { file: path.join(ROOT, "tests", "fixtures", "relay-core-before-seat-rule.cjs.txt"), from: "158d1826",
    sha256: "ce8aaa4fb070928679acd8e7876fffada69fad41d1cce3d8b0b0d776ea03f265" };
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
  const PRODUCT = { core: path.join(ROOT, "relay", "core.cjs"), team: path.join(ROOT, "relay", "team.cjs"), blob: path.join(ROOT, "shell", "relay", "blob.cjs") };
  function coreFrom(text) {
    const dir = copyOf({ "relay/core.cjs": text, "shell/relay/blob.cjs": forwardTo(PRODUCT.blob) });
    return require(path.join(dir, "relay", "core.cjs"));
  }
  async function orderScene() {
    const text = coreBefore();
    if (text === null) return { ok: false, detail: "the fixture is not the bytes captured from " + BEFORE.from + " (" + path.basename(BEFORE.file) + ")" };
    const old = coreFrom(text), lead = keyPair(false);
    if (!Array.isArray(old.GRANT_FIELDS) && old.GRANT_FIELDS !== undefined) return { ok: false, detail: "the earlier core is not readable" };
    const g = grantAt(lead.pub, T0, { licence: hex(16), live: T0 });
    const plainG = grantAt(lead.pub, T0);
    const before = old.grantWhy(g, lead.pub, T0, K.ROOTS), beforePlain = old.grantWhy(plainG, lead.pub, T0, K.ROOTS);
    const now = C.grantWhy(g, lead.pub, T0, K.ROOTS);
    const beforeNamesSeats = /"seats"/.test(text.split("GRANT_FIELDS")[1] || "");
    return { ok: !beforeNamesSeats && before === "fields" && beforePlain === null && now === null,
      detail: brief({ earlierWithSeats: before, earlierWithout: beforePlain, thisRelay: now, earlierNamesSeats: beforeNamesSeats }) };
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
    const again = await session(dw, k, knockCert);
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
  /* A desk's current certificate of a licence no team here names: an ordinary team takes it, a gated one refuses it, so it tells the two
     arms apart where a desk holding none is refused by both. */
  const elsewhere = (w, k) => certFor(k.pub, hex(16), w.R.clock.now, 7 * DAY);
  async function keptScene() {
    const w = await team({});
    const before = await session(w, w.desks.a, certFor(w.desks.a.pub, hex(16), w.R.clock.now, 7 * DAY));
    w.R.clock.now += HOUR;
    const toEntra = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: w.R.clock.now }));
    const asks = await session(w, w.desks.a, elsewhere(w, w.desks.a));
    const stale = await renew(w, grantAt(w.lead.pub, w.R.clock.now - 30 * MIN, undefined, { fields: { until: w.R.clock.now + 31 * DAY } }));
    const stillAsks = await session(w, w.desks.a, elsewhere(w, w.desks.a));
    /* An earlier-issued grant carrying another licence's seats does not take the team's place either. */
    const otherLic = hex(16);
    const staleSeats = await renew(w, grantAt(w.lead.pub, w.R.clock.now - 20 * MIN, { licence: otherLic, live: w.R.clock.now - 20 * MIN }, { fields: { until: w.R.clock.now + 31 * DAY + HOUR } }));
    const ownLic = await session(w, w.desks.a, certFor(w.desks.a.pub, w.licence, w.R.clock.now, 7 * DAY));
    const staleLic = await session(w, w.desks.a, certFor(w.desks.a.pub, otherLic, w.R.clock.now, 7 * DAY));
    w.R.clock.now += HOUR;
    const toPlain = await renew(w, grantAt(w.lead.pub, w.R.clock.now, undefined, { fields: { until: w.R.clock.now + 32 * DAY } }));
    const plainAgain = await session(w, w.desks.a, elsewhere(w, w.desks.a));
    /* The grant the team was made with, replayed after it was gated. */
    const replay = await renew(w, ordinaryFirst(w));
    const stillGated = await session(w, w.desks.a, elsewhere(w, w.desks.a));
    const h = await team({});
    const next = keyPair(false), to = { keyId: next.keyId, pub: next.pub }, t = h.R.clock.now;
    const moved = await call(h.R, "POST", "/relay/v1/t/" + h.rt + "/lead", { json: { to, t, sig: signHex(h.lead, C.leadBytes(h.rt, to.keyId, to.pub, t)),
      grant: grantAt(next.pub, t, { licence: h.licence, live: t }) } });
    const handed = await session(h, h.desks.a, elsewhere(h, h.desks.a));
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
  /* O1: an ordinary team's whole sequence (create, enrol, hello, session, upload, list, fetch, renewal, a desk taken off, a handover),
     its desks holding certificates of another licence on this relay and none on the relay before this change, gives the same answers
     and the same rows, the relay's own random values set aside and a session row's seat beside it; nothing of seats is kept; and the
     relay before this change, given the store this one left, still reads on the desk's session and opens a desk holding none. */
  async function ordinarySequence(core, certs) {
    const kept = {};
    const ADOPT = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead"];
    if (core) for (const k of ADOPT) { kept[k] = C[k]; C[k] = core[k]; }
    try {
      const R = S.relayEnv({ roots: K.ROOTS });
      R.clock.now = T0;
      const keys = ordinarySequence.keys || (ordinarySequence.keys = { lead: keyPair(false), a: keyPair(true), b: keyPair(true), next: keyPair(false), rt: hex(16), pa: "k-" + hex(8), pb: "k-" + hex(8), teamKey: crypto.randomBytes(32),
        licence: hex(16), person: hex(32) });
      const w = { R, rt: keys.rt, lead: keys.lead, rev: 0, desks: { a: Object.assign({}, keys.a, { place: keys.pa }), b: Object.assign({}, keys.b, { place: keys.pb }) } };
      const steps = [];
      const note = (name, r) => steps.push(name + " " + r.status + " " + JSON.stringify(r.json, (k, v) => (typeof v === "string" ? v.replace(/[0-9a-f]{16,}/g, "#") : v)));
      const g0 = ordinarySequence.g0 || (ordinarySequence.g0 = grantAt(keys.lead.pub, T0));
      note("create", await call(R, "POST", "/relay/v1/teams", { json: K.createBody(w.rt, w.lead, T0, b => signHex(w.lead, b), { grant: g0 }) }));
      note("devices", await devicesOf(w, ["a", "b"]));
      const certOf = n => (certs ? certFor(keys[n].pub, keys.licence, T0, 7 * DAY, { person: keys.person }) : undefined);
      const s = await session(w, w.desks.a, certOf("a"));
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
      note("removed", await session(w, w.desks.a, certOf("a")));
      const t = R.clock.now, to = { keyId: keys.next.keyId, pub: keys.next.pub };
      const g2 = ordinarySequence.g2 || (ordinarySequence.g2 = grantAt(keys.next.pub, t));
      note("handover", await call(R, "POST", "/relay/v1/t/" + w.rt + "/lead", { json: { to, t, sig: signHex(w.lead, C.leadBytes(w.rt, to.keyId, to.pub, t)), grant: g2 } }));
      const after = await session(w, w.desks.b, certOf("b"));
      note("after", after);
      const st = storeOf(w), raw = st.dump().map(([k, v]) => [k, JSON.parse(v)]);
      /* Every desk's session row carries the seat its hello's certificate gave, and the lead's none. */
      const seatsOk = !certs || raw.filter(([k]) => /^ses:/.test(k)).every(([, v]) => (v.key === keys.lead.keyId || v.key === keys.next.keyId
        ? v.seat === undefined : !!v.seat && v.seat.licence === keys.licence && v.seat.until === T0 + 7 * DAY));
      const rows = raw.map(([k, v]) => k.replace(/[0-9a-f]{16,}/g, "#") + "=" + JSON.stringify(/^ses:/.test(k) ? Object.assign({}, v, { seat: undefined }) : v,
        (kk, vv) => (typeof vv === "string" ? vv.replace(/[0-9a-f]{16,}/g, "#") : vv))).sort();
      return { steps, rows, seatsOk, R, w, sessions: { a: s.json && s.json.session, b: after.json && after.json.session } };
    } finally { if (core) for (const k of Object.keys(kept)) C[k] = kept[k]; }
  }
  async function ordinaryScene() {
    const text = coreBefore(BEFORE_RULE);
    if (text === null) return { ok: false, detail: "the fixture is not the bytes captured from " + BEFORE_RULE.from };
    const oldCore = coreFrom(text);
    const before = await ordinarySequence(oldCore, false);
    const after = await ordinarySequence(null, true);
    const same = before.steps.join("\n") === after.steps.join("\n") && before.rows.join("\n") === after.rows.join("\n");
    const firstDiff = before.steps.find((s, i) => s !== after.steps[i]) || before.rows.find((s, i) => s !== after.rows[i]) || null;
    const seatRows = after.rows.filter(r => /^(seat|pr:)/.test(r)).length;
    /* The rollback: the relay before this change over this relay's store and bucket, a fresh object, as a redeploy of the old build. */
    const ADOPT = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead"], kept = {};
    let back = null;
    for (const k of ADOPT) { kept[k] = C[k]; C[k] = oldCore[k]; }
    try {
      const R2 = S.relayEnv({ roots: K.ROOTS });
      R2.clock.now = after.R.clock.now + MIN;
      R2.stores.set(after.w.rt, storeOf(after.w));
      for (const [k, v] of after.R.bucket.objects) R2.bucket.objects.set(k, v);
      const w2 = Object.assign({}, after.w, { R: R2 });
      const list = await call(R2, "GET", "/relay/v1/t/" + w2.rt + "/since/0", { token: after.sessions.b });
      const bare = await session(w2, w2.desks.b);
      back = { list: list.status, bareHello: said(bare), opens: list.status === 200 && opened(bare) };
    } finally { for (const k of ADOPT) C[k] = kept[k]; }
    return { ok: same && before.steps.length === 12 && after.seatsOk && seatRows === 0 && !!back && back.opens,
      detail: brief({ steps: after.steps.length, rows: after.rows.length, firstDiff, seatsKept: after.seatsOk, seatRows, rollback: back }) };
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
  await leg("s12a", orderScene, "O7 the order: a grant carrying seats is refused fields by the relay before this change (engine abc58e9f's core, a fixture) and taken by this one, and the earlier relay takes the same grant without seats");
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
  /* The service's signed release lifts the gate: for the gated licence and issued after it, the team is ordinary again (a desk's current
     certificate of any licence opens it, and the lead asks none);
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
    const free = await session(w, w.desks.a, certFor(w.desks.a.pub, hex(16), t1, 7 * DAY));
    const freeLead = await session(w, w.lead);
    const o = await team({});
    const oRelease = await renew(o, grantAt(o.lead.pub, o.R.clock.now + MIN, { licence: o.licence, release: true }));
    const shapes = ["release false", "release with live"].map((_, i) => C.grantWhy(grantAt(w.lead.pub, T0, i ? { licence: w.licence, release: true, live: T0 } : { licence: w.licence, release: false }), w.lead.pub, T0, K.ROOTS));
    const ok = other.status === 200 && refused(otherAsks, "seat-lapsed") && older.status === 200 && refused(olderAsks, "seat-lapsed")
      && release.status === 200 && opened(free) && opened(freeLead) && !storeOf(w).get("seats") && !storeOf(w).get("seatSeen")
      && oRelease.status === 200 && !storeOf(o).dump().some(([k]) => /^seat/.test(k)) && shapes.every(s => s === "shape");
    return { ok, detail: brief({ otherLicence: said(otherAsks), issuedBefore: said(olderAsks), released: said(free) + "/" + said(freeLead), ordinaryTeam: said(oRelease), shapes }) };
  }
  await leg("s15c", releaseScene, "only the service's signed release lifts the gate, for the gated licence and issued after it, the team then ordinary (any licence opens a desk, the lead asks none); a release of another licence or issued before the gate changes nothing, nor one on a team never gated, and a release of any other shape is refused");
  /* Argon's review of the relay, finding 3: the release is kept as a mark, so the seats grant it released, posted again, gates nothing;
     a seats grant issued after the release gates the team again. */
  async function releaseReplayScene() {
    const w = await team({ seats: true }), t1 = T0 + HOUR, t3 = T0 + 3 * HOUR;
    w.R.clock.now = t1;
    const release = await renew(w, grantAt(w.lead.pub, t1, { licence: w.licence, release: true }, { fields: { until: t1 + 31 * DAY } }));
    w.R.clock.now = t1 + HOUR;
    const replay = await renew(w, w.firstGrant);
    const free = await session(w, w.desks.a, certFor(w.desks.a.pub, hex(16), w.R.clock.now, 7 * DAY));
    const kept = storeOf(w).get("seats");
    w.R.clock.now = t3;
    const later = await renew(w, grantAt(w.lead.pub, t3, { licence: w.licence, live: t3 }, { fields: { until: t3 + 32 * DAY } }));
    const gated = await session(w, w.desks.b);
    const ok = release.status === 200 && opened(free) && !kept && later.status === 200 && refused(gated, "seat-lapsed");
    return { ok, detail: brief({ release: said(release), replayed: said(replay), afterReplay: said(free), seatsKept: !!kept, later: said(later), afterLater: said(gated) }) };
  }
  await leg("s15d", releaseReplayScene, "a seats grant issued before the team's release, posted again after it, gates nothing, and one issued after the release gates the team again");
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
     window and M, as a leaver's desk is. On an ordinary team the lead's Studio is asked for nothing, and a member Studio is a desk: its
     member certificate of any licence opens it, and none is refused. */
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
    const certMember = await session(o, o.desks.m, certFor(o.desks.m.pub, hex(16), o.R.clock.now, span));
    const ok = kept.length === 3 && kept.every(opened) && refused(former, "seat-lapsed") && opened(plainLead) && refused(plainMember, "seat-lapsed") && opened(certMember);
    return { ok, detail: brief({ secondComputer: kept.map(said), formerAuthor: said(former), ordinaryLead: said(plainLead), ordinaryMemberNone: said(plainMember),
      ordinaryMemberCert: said(certMember) }) };
  }
  for (const [name, span] of WINDOWS) {
    await leg("s19a " + name, () => studioLeadScene(span), "a lead's own Studio on an Entra team opens with its person's lead-seat certificate for its own key, none or another key's is refused, a former author is refused past its end and M, and a desk taken off, an invitation dropped, the door closed and the team handed over still go");
    await leg("s19b " + name, () => studioFollowScene(span), "a lead's second computer following as a teammate keeps its session while its person proves, a former author's is refused past its end and M, and on an ordinary team the lead's Studio is asked for nothing and a member Studio opens on its member certificate and not without one");
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
  /* (d), A FREED POOLED DESK NAMED IN THE GRANT (Claude alpha's ruling): the lead's renewal carries the keys of the pooled desks the
     service freed, and the relay refuses each outright whatever its certificate or the grace, until a later grant no longer names it.
     And (a)'s measured limit, the test architect's: a removed pooled desk first tried only at night, never refused while the evidence was
     fresh, is honoured to its end and the grace under (a) alone, as expected; where the grant names it, it is refused outright. */
  async function freedScene() {
    const w = await team({ seats: true });
    const a = w.desks.a;
    a.cert = certFor(a.pub, w.licence, T0, DAY, { fields: { pooled: true } });
    const before = await sessionAs(w, "a");
    w.R.clock.now = T0 + HOUR;
    const named = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: w.R.clock.now, freed: [{ key: a.pub, at: w.R.clock.now }] }));
    const current = await sessionAs(w, "a");
    w.R.clock.now = T0 + 2 * HOUR;
    const unnamed = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: w.R.clock.now }));
    const back = await sessionAs(w, "a");
    const kept = storeOf(w).get("seats");
    const ok = opened(before) && named.status === 200 && refused(current, "seat-lapsed") && unnamed.status === 200 && opened(back) && kept && kept.freed === undefined;
    return { ok, detail: brief({ before: said(before), namedCurrentCert: said(current), noLongerNamed: said(back) }) };
  }
  async function nightOnlyScene() {
    const run = async (freed) => {
      const w = await team({ seats: true });
      const a = w.desks.a;
      a.cert = certFor(a.pub, w.licence, T0, DAY, { fields: { pooled: true } });
      const end = T0 + DAY, last = end + 2 * HOUR;
      w.R.clock.now = last;
      prove(w, "c", DAY);
      await sessionAs(w, "c");
      await renew(w, grantAt(w.lead.pub, last, Object.assign({ licence: w.licence, live: last }, freed ? { freed: [{ key: a.pub, at: T0 + HOUR }] } : {})));
      w.R.clock.now = last + C.SEAT_QUIET_MS + MIN;
      const night = await sessionAs(w, "a");
      w.R.clock.now = end + C.POOLED_GRACE_MS - MIN;
      const late = await sessionAs(w, "a");
      w.R.clock.now = end + C.POOLED_GRACE_MS;
      const over = await sessionAs(w, "a");
      return { night, late, over };
    };
    const alone = await run(false), withD = await run(true);
    const ok = opened(alone.night) && opened(alone.late) && refused(alone.over, "seat-lapsed")
      && refused(withD.night, "seat-lapsed") && refused(withD.late, "seat-lapsed") && refused(withD.over, "seat-lapsed");
    return { ok, detail: brief({ underAAlone: [said(alone.night), said(alone.late), said(alone.over)], namedByD: [said(withD.night), said(withD.late), said(withD.over)] }) };
  }
  /* A grant's freed list out of shape is refused at the grant. */
  async function freedShapeScene() {
    const lead = keyPair(false), at = T0, k = keyPair(false).pub, e = key => ({ key, at: T0 - HOUR });
    const bad = { empty: [], notList: e(k), bareKey: [k], notHex: [e("zz")], noAt: [{ key: k }], atAfterIssue: [{ key: k, at: T0 + 1 }],
      extra: [Object.assign(e(k), { x: 1 })], twice: [e(k), { key: k, at: T0 - 2 * HOUR }], tooMany: Array.from({ length: C.FREED_MAX + 1 }, () => e(hex(32))) };
    const got = Object.fromEntries(Object.entries(bad).map(([n, freed]) => [n, C.grantWhy(grantAt(lead.pub, at, { licence: hex(16), live: at, freed }), lead.pub, at, K.ROOTS)]));
    const good = C.grantWhy(grantAt(lead.pub, at, { licence: hex(16), live: at, freed: [e(k)] }), lead.pub, at, K.ROOTS);
    const full = C.grantWhy(grantAt(lead.pub, at, { licence: hex(16), live: at, freed: Array.from({ length: C.FREED_MAX }, () => e(hex(32))) }), lead.pub, at, K.ROOTS);
    return { ok: Object.values(got).every(x => x === "shape") && good === null && full === null && C.FREED_MAX === 1000, detail: brief(Object.assign({}, got, { good, full, max: C.FREED_MAX })) };
  }
  /* The test architect's read of (d): the name holds against a certificate issued before the freeing, never after it, so a desk its
     person comes back to opens under a grant still naming it. */
  async function freedSinceScene() {
    const w = await team({ seats: true });
    const a = w.desks.a, T = T0 + 2 * HOUR;
    w.R.clock.now = T;
    await renew(w, grantAt(w.lead.pub, T, { licence: w.licence, live: T, freed: [{ key: a.pub, at: T }] }));
    w.R.clock.now = T + 2 * HOUR;
    a.cert = certFor(a.pub, w.licence, T - HOUR, DAY, { fields: { pooled: true } });
    const before = await sessionAs(w, "a");
    a.cert = certFor(a.pub, w.licence, T + HOUR, DAY, { fields: { pooled: true } });
    const after = await sessionAs(w, "a");
    const ok = refused(before, "seat-lapsed") && opened(after) && JSON.stringify(storeOf(w).get("seats").freed.map(f => f.at)) === JSON.stringify([T]);
    return { ok, detail: brief({ issuedHourBefore: said(before), issuedHourAfter: said(after) }) };
  }
  await leg("s22d", freedSinceScene, "a desk named as freed at T: a certificate on its key issued at T - 1 h is refused, and one issued at T + 1 h opens under the grant still naming it");
  /* The relay owner's decision on Argon's question (finding 5): a pooled desk the grant newly names as freed loses the sessions it holds
     and their sockets at once, as a removed desk does, and a colleague's stay; a renewal naming it again at the same instant leaves the
     session its person came back to with a certificate issued since. */
  async function freedSessionScene() {
    const w = await team({ seats: true }), a = w.desks.a, T = T0 + 5 * MIN;
    a.cert = certFor(a.pub, w.licence, T0, DAY, { fields: { pooled: true } });
    prove(w, "c", DAY);
    const sa = await sessionAs(w, "a"), sc = await sessionAs(w, "c");
    const token = opened(sa) ? sa.json.session : "";
    const up = await W.fetch(new Request("https://relay.test/relay/v1/t/" + w.rt + "/socket", { method: "GET", headers: { authorization: "Bearer " + token, upgrade: "websocket" } }), w.R.env);
    const sockId = up.headers.get("x-stand-in-socket");
    const ws = [...w.R.hubs.values()].map(h => h.open.find(x => x.id === sockId)).find(Boolean) || null;
    w.R.clock.now = T;
    const named = await renew(w, grantAt(w.lead.pub, T, { licence: w.licence, live: T, freed: [{ key: a.pub, at: T }] }));
    const listA = await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token });
    const listC = await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: opened(sc) ? sc.json.session : "" });
    w.R.clock.now = T + 5 * MIN;
    a.cert = certFor(a.pub, w.licence, w.R.clock.now, DAY, { fields: { pooled: true } });
    const sb = await sessionAs(w, "a");
    w.R.clock.now = T + 10 * MIN;
    const again = await renew(w, grantAt(w.lead.pub, w.R.clock.now, { licence: w.licence, live: w.R.clock.now, freed: [{ key: a.pub, at: T }] }, { fields: { until: T + 31 * DAY } }));
    const listB = await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: opened(sb) ? sb.json.session : "" });
    const shut = !!ws && !!ws.closed && ws.closed.code === 4401;
    const ok = opened(sa) && opened(sc) && named.status === 200 && listA.status === 401 && !!listA.json && listA.json.error === "no-hello"
      && shut && listC.status === 200 && opened(sb) && again.status === 200 && listB.status === 200;
    return { ok, detail: brief({ named: said(named), freedList: said(listA), socket: ws ? ws.closed : "none", colleague: said(listC), cameBack: said(sb), renamed: said(again), cameBackList: said(listB) }) };
  }
  await leg("s22e", freedSessionScene, "a pooled desk newly named as freed loses its session and its socket at once, a colleague's stays, and a renewal naming it again at the same instant leaves the session its person came back to");
  /* The second house on review 1 (Grok, finding 1): a live bearer is judged again at each use by what its hello's certificate said, so a
     run-out the team's evidence now passes by the margin, or a pooled grace the service ends by proving again, stops that bearer as it
     stops a new hello. */
  const listWith = (w, r) => call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: opened(r) ? r.json.session : "" });
  async function liveRunOutScene() {
    const w = await team({ seats: true }), a = w.desks.a;
    a.cert = certFor(a.pub, w.licence, T0, HOUR);
    w.R.clock.now = T0 + 2 * HOUR;
    const sa = await sessionAs(w, "a");
    const before = await listWith(w, sa);
    w.R.clock.now += 5 * MIN;
    prove(w, "c", DAY);
    const sc = await sessionAs(w, "c");
    const after = await listWith(w, sa);
    const ok = opened(sa) && before.status === 200 && opened(sc) && refused(after, "seat-lapsed");
    return { ok, detail: brief({ runOutOpened: said(sa), listedBefore: said(before), colleague: said(sc), listedAfterEvidence: said(after) }) };
  }
  await leg("s23a", liveRunOutScene, "a desk's session opened on a run-out certificate before the margin is refused seat-lapsed on its next use once a colleague proves past the margin");
  async function liveGraceScene() {
    const w = await team({ seats: true }), a = w.desks.a, end = T0 + DAY;
    a.cert = certFor(a.pub, w.licence, T0, DAY, { fields: { pooled: true } });
    w.R.clock.now = end + 2 * HOUR;
    prove(w, "c", DAY);
    await sessionAs(w, "c");
    w.R.clock.now = end + 2 * HOUR + C.SEAT_QUIET_MS + MIN;
    const sa = await sessionAs(w, "a");
    const before = await listWith(w, sa);
    w.R.clock.now += 5 * MIN;
    prove(w, "c", DAY);
    const sc = await sessionAs(w, "c");
    const after = await listWith(w, sa);
    const ok = opened(sa) && before.status === 200 && opened(sc) && refused(after, "seat-lapsed");
    return { ok, detail: brief({ graceOpened: said(sa), listedBefore: said(before), serviceProves: said(sc), listedAfter: said(after) }) };
  }
  await leg("s23b", liveGraceScene, "a pooled desk's session opened in its quiet grace is refused seat-lapsed on its next use once the service proves anyone again");
  /* The same review, finding 2: a pooled desk's certificate runs a day, at most, as the licence service signs it; any other seat's, 30. */
  async function pooledSpanScene() {
    const k = keyPair(false), lic = hex(16);
    const why = (span, pooled) => C.certWhy(certFor(k.pub, lic, T0, span, pooled ? { fields: { pooled: true } } : {}), k.pub, [lic], T0 + MIN, K.ROOTS);
    const w = await team({ seats: true }), a = w.desks.a;
    a.cert = certFor(a.pub, w.licence, T0, 2 * DAY, { fields: { pooled: true } });
    const s = await sessionAs(w, "a");
    const got = { pooledDay: why(DAY, true), pooledDayAndMinute: why(DAY + MIN, true), ordinary30: why(30 * DAY, false) };
    const ok = got.pooledDay === null && got.pooledDayAndMinute === "span" && got.ordinary30 === null && refused(s, "seat-lapsed");
    return { ok, detail: brief(Object.assign(got, { twoDayPooledSession: said(s) })) };
  }
  await leg("s21e", pooledSpanScene, "a pooled certificate over a day is refused as span, and a desk's session on a two-day one is seat-lapsed; a day is taken, and an ordinary certificate's 30 days");
  await leg("s22a", freedScene, "(d) a pooled desk the grant names as freed is refused outright, its certificate current, and opens again once a later grant no longer names it");
  await leg("s22b", nightOnlyScene, "(a)'s measured limit: a removed pooled desk first tried only at night, never refused while the evidence was fresh, is honoured to its end plus 72 hours under (a) alone, as expected; with (d), the grant naming it, it is refused outright, at night, late in the grace and after");
  await leg("s22c", freedShapeScene, "a grant's freed list out of shape (empty, not a list, not keys, a key twice, a bare key, an entry without its instant, one freed after the grant's issue, one with another field, past FREED_MAX, a thousand) is refused shape, and a good one and a full one taken");
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
  await leg("s17a", ordinaryScene, "O1 an ordinary team's whole sequence (create, enrol, session, upload, list, fetch, renewal, lead session, a desk taken off, a handover), its desks holding certificates of another licence here and none on the relay before this change (engine 158d1826's core, a fixture), gives the same answers and rows but for each desk session's seat, keeps nothing of seats, and that relay given this one's store still reads and opens a desk holding none");

  /* ---- THE ORDINARY ARM (piece C-2): every session for a desk's key opens only on a current certificate the service signed for that
     key, of any licence, and ends no later than it. ---- */
  /* A challenge (or the one given), then a hello by `key` carrying `extra` (a seat, an invitation's token); the challenge rides on the answer. */
  async function helloWith(w, key, extra, challenge) {
    const n = challenge || (await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} })).json.challenge;
    const body = Object.assign({ challenge: n, key: key.keyId, pub: key.pub, sig: signHex(key, C.helloBytes(w.rt, n, key.keyId)) }, extra || {});
    return Object.assign(await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: body }), { challenge: n });
  }
  async function knockWith(w, key, cert) {
    const box = key.box || (key.box = hex(32)), ch = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/hello", { json: {} });
    return call(w.R, "POST", "/relay/v1/t/" + w.rt + "/session", { json: { challenge: ch.json.challenge, door: cert, key: key.keyId, pub: key.pub, box,
      sig: signHex(key, C.doorHelloBytes(w.rt, ch.json.challenge, key.keyId, box)) } });
  }
  const doorOf = (w, refs) => call(w.R, "POST", "/relay/v1/t/" + w.rt + "/door", { json: { refs, t: w.R.clock.now, sig: signHex(w.lead, C.doorBytes(w.rt, w.R.clock.now, refs)) } });
  const rowOf = (w, r) => (opened(r) ? storeOf(w).get("ses:" + sha(r.json.session)) : null);
  const seatRowsOf = w => storeOf(w).dump().map(([k]) => k).filter(k => /^(seat|pr:)/.test(k));
  /* Each certificate the ordinary arm must refuse, one by one, and the desk's own current one opening. */
  async function ordinaryRefusedScene() {
    const w = await team({});
    const svc = serviceKey(), now = w.R.clock.now, a = w.desks.a, other = keyPair(true), lic = hex(16);
    const viaSvc = K.delegationFor(now, { fields: { may: ["licence"], key: { id: svc.id, pub: svc.pub } } });
    w.R.env.REVOKED = revokedText([svc.pub]);
    const after = (c, o) => Object.assign(c, o);
    const cases = {
      none: undefined,
      ended: certFor(a.pub, lic, now - 8 * DAY, 7 * DAY),
      atItsEnd: certFor(a.pub, lic, now - 7 * DAY, 7 * DAY),
      endedPooled: certFor(a.pub, lic, now - DAY - HOUR, DAY, { pooled: true }),
      otherDesk: certFor(other.pub, lic, now, 7 * DAY),
      forged: certFor(a.pub, lic, now, 7 * DAY, { forger: { privateKey: other.privateKey } }),
      notLicence: certFor(a.pub, lic, now, 7 * DAY, { via: K.delegationFor(now) }),
      pastSpan: certFor(a.pub, lic, now, 31 * DAY),
      pooledPastDay: certFor(a.pub, lic, now, DAY + MIN, { pooled: true }),
      ahead: certFor(a.pub, lic, now + 6 * MIN, 7 * DAY),
      revokedKey: certFor(a.pub, lic, now, 7 * DAY, { signer: svc, via: viaSvc }),
      deskOnlyUnsigned: after(certFor(a.pub, lic, now, 7 * DAY), { deskOnly: true }),
      pooledUnsigned: after(certFor(a.pub, lic, now, DAY), { pooled: true }),
      deskOnlyNotTrue: certFor(a.pub, lic, now, 7 * DAY, { fields: { deskOnly: "yes" } }),
      deskOnlyFalse: certFor(a.pub, lic, now, 7 * DAY, { fields: { deskOnly: false } }),
      pooledNotTrue: certFor(a.pub, lic, now, DAY, { fields: { pooled: 1 } }),
      notACert: { kind: "etiuda-seat-certificate" },
      text: "seat",
    };
    const got = {};
    for (const [n, c] of Object.entries(cases)) got[n] = await session(w, a, c);
    const good = await session(w, a, certFor(a.pub, lic, now, 7 * DAY));
    const ok = Object.values(got).every(r => refused(r, "seat-lapsed")) && opened(good);
    return { ok, detail: brief(Object.assign({}, ...Object.entries(got).map(([n, r]) => ({ [n]: said(r) })), { good: said(good) })) };
  }
  /* Any licence opens, a desk-only certificate (the desk's own trial) and a pooled one among them, and both marks at once in the service's
     order; a session row keeps the seat and nothing of seats is stored. */
  async function anyLicenceScene() {
    const w = await team({ desks: ["a", "b", "c", "d"] }), now = w.R.clock.now, d = w.desks;
    const certs = { a: certFor(d.a.pub, hex(16), now, 7 * DAY), b: certFor(d.b.pub, hex(16), now, 14 * DAY, { deskOnly: true }),
      c: certFor(d.c.pub, hex(16), now, DAY, { pooled: true }), d: certFor(d.d.pub, hex(16), now, DAY, { pooled: true, deskOnly: true }) };
    const got = {};
    for (const n of Object.keys(certs)) got[n] = await session(w, d[n], certs[n]);
    const read = await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token: opened(got.a) ? got.a.json.session : "" });
    const kept = Object.keys(certs).every(n => { const row = rowOf(w, got[n]); return !!row && !!row.seat && row.seat.licence === certs[n].licence && row.seat.until === certs[n].until && row.seat.pub === d[n].pub; });
    const ok = Object.values(got).every(opened) && read.status === 200 && kept && seatRowsOf(w).length === 0;
    return { ok, detail: brief({ anyLicence: said(got.a), deskOnly: said(got.b), pooled: said(got.c), pooledDeskOnly: said(got.d), since: read.status, seatKept: kept, seatRows: seatRowsOf(w) }) };
  }
  /* The door is untouched: on an ordinary team a stranger's certificate of a licence the door does not name, or a desk-only one of a
     licence it names, still knocks not-enrolled, a current one of its licence still asks; an empty or missing list is still "door"; and an
     enrolled desk knocking is judged by the ordinary arm. */
  async function doorUntouchedScene() {
    const w = await team({}), now = w.R.clock.now, L = w.licence;
    const door = await doorOf(w, [L]);
    const s1 = keyPair(true), s2 = keyPair(true), s3 = keyPair(true);
    const otherLicence = await knockWith(w, s1, certFor(s1.pub, hex(16), now, 7 * DAY));
    const deskOnly = await knockWith(w, s2, certFor(s2.pub, L, now, 7 * DAY, { deskOnly: true }));
    const asks = await knockWith(w, s3, certFor(s3.pub, L, now, 7 * DAY));
    const c = certFor(s3.pub, L, now, 7 * DAY);
    const lists = [[], undefined, null].map(refs => C.certWhy(c, s3.pub, refs, now, K.ROOTS, []));
    const enrolled = await knockWith(w, w.desks.a, certFor(w.desks.a.pub, L, now, 7 * DAY));
    const ok = door.status === 200 && said(otherLicence) === "not-enrolled" && said(deskOnly) === "not-enrolled" && asks.status === 200 && asks.json.invite === true
      && lists.every(x => x === "door") && opened(enrolled) && enrolled.json.invite === undefined && !!(rowOf(w, enrolled) || {}).seat;
    return { ok, detail: brief({ door: said(door), otherLicence: said(otherLicence), deskOnly: said(deskOnly), asks: said(asks), emptyLists: lists, enrolledKnock: said(enrolled) }) };
  }
  /* Mid-session: a session ends at its certificate's end, one answer from that instant (no-hello, so the desk says hello again at once and
     is asked there); a longer certificate leaves the thirty minutes, and the lead's session holds none; and a session the strict arm opened
     on a run-out certificate, the team then released, is ended by the ordinary arm at its next use. */
  async function midSessionScene() {
    const w = await team({}), a = w.desks.a, b = w.desks.b, now = w.R.clock.now;
    a.cert = certFor(a.pub, hex(16), now - 7 * DAY + 10 * MIN, 7 * DAY);
    const s = await sessionAs(w, "a");
    const end = a.cert.until, at = {};
    for (const [n, t] of [["minuteBefore", end - MIN], ["lastMs", end - 1], ["atEnd", end], ["after", end + 1]]) { w.R.clock.now = t; at[n] = said(await listWith(w, s)); }
    const again = await sessionAs(w, "a");
    w.R.clock.now = now;
    const long = await session(w, b, certFor(b.pub, hex(16), now, 7 * DAY));
    const lead = await session(w, w.lead);
    const st = await team({ seats: true }), sa = st.desks.a;
    sa.cert = certFor(sa.pub, st.licence, T0, HOUR);
    st.R.clock.now = T0 + 2 * HOUR;
    const strictS = await sessionAs(st, "a");
    const strictBefore = await listWith(st, strictS);
    st.R.clock.now += MIN;
    const release = await renew(st, grantAt(st.lead.pub, st.R.clock.now, { licence: st.licence, release: true }, { fields: { until: st.R.clock.now + 31 * DAY } }));
    const released = await listWith(st, strictS);
    const ok = opened(s) && s.json.until === end && at.minuteBefore === 200 && at.lastMs === 200 && at.atEnd === "no-hello" && at.after === "no-hello"
      && refused(again, "seat-lapsed") && opened(long) && long.json.until === now + C.SESSION_MS && opened(lead) && lead.json.until === now + C.SESSION_MS
      && !(rowOf(w, lead) || {}).seat && opened(strictS) && strictBefore.status === 200 && release.status === 200 && said(released) === "no-hello";
    return { ok, detail: brief({ cappedAtEnd: opened(s) && s.json.until === end, lists: at, helloAtEnd: said(again), longUntilIsThirtyMin: opened(long) && long.json.until === now + C.SESSION_MS,
      leadUntil: opened(lead) && lead.json.until === now + C.SESSION_MS, strictRunOut: said(strictS), released: said(released) }) };
  }
  /* No hello issues a session for a desk's key without a seat: the enrolled hello, the enrolled knock, the token hello, both resumes of a
     bound invitation, the door's request and its resume, on an ordinary team and an Entra one, each keep the seat of the certificate the
     hello carried and end no later than it; only the lead's on an ordinary team keeps none. */
  async function sessionSeatScene() {
    const rows = {};
    for (const [kind, o] of [["ordinary", {}], ["entra", { seats: true }]]) {
      const w = await team(Object.assign({ desks: ["a", "b", "c"] }, o)), now = w.R.clock.now, L = w.licence, got = {};
      const cert = (k, lic) => certFor(k.pub, lic || (kind === "entra" ? L : hex(16)), now, 7 * DAY);
      const checked = (name, r, c, k) => { const row = rowOf(w, r); got[name] = !!row && !!row.seat && row.seat.pub === k.pub && row.seat.until === c.until && row.until <= c.until ? "seat" : said(r) + (row ? " none" : ""); };
      let c = cert(w.desks.a);
      checked("hello", await session(w, w.desks.a, c), c, w.desks.a);
      await doorOf(w, [L]);
      c = cert(w.desks.b, L);
      checked("knock", await knockWith(w, w.desks.b, c), c, w.desks.b);
      const j = joiner(w, "j"), inv = await inviteOn(w);
      c = cert(j, hex(16));
      checked("token", await helloWith(w, j, { invite: inv.token, inv: inv.inv, seat: c }), c, j);
      w.R.clock.now += 40 * MIN;
      c = certFor(j.pub, hex(16), w.R.clock.now, 7 * DAY);
      checked("resume", await helloWith(w, j, { seat: c }), c, j);
      /* c taken off, invited again after, joins and resumes. */
      await devicesOf(w, ["a", "b"]);
      const inv2 = await inviteOn(w), dc = w.desks.c;
      c = certFor(dc.pub, hex(16), w.R.clock.now, 7 * DAY);
      checked("tokenAfterRemoval", await helloWith(w, dc, { invite: inv2.token, inv: inv2.inv, seat: c }), c, dc);
      checked("resumeAfterRemoval", await helloWith(w, dc, { seat: c }), c, dc);
      const k = keyPair(true);
      c = certFor(k.pub, L, w.R.clock.now, 7 * DAY);
      checked("doorRequest", await knockWith(w, k, c), c, k);
      checked("doorResume", await knockWith(w, k, c), c, k);
      const lead = await session(w, w.lead, kind === "entra" ? certFor(w.lead.pub, L, w.R.clock.now, 7 * DAY) : undefined);
      got.lead = opened(lead) ? (rowOf(w, lead).seat ? "seat" : "none") : said(lead);
      rows[kind] = got;
    }
    const want = n => (n === "lead" ? null : "seat");
    const ok = Object.entries(rows.ordinary).every(([n, v]) => v === (want(n) || "none")) && Object.entries(rows.entra).every(([n, v]) => v === "seat");
    return { ok, detail: brief(rows) };
  }
  /* The lead's key on an ordinary team is not asked, and its session runs its thirty minutes; on an Entra team it is (s1a). */
  async function leadOrdinaryScene() {
    const w = await team({}), st = await team({ seats: true });
    const none = await session(w, w.lead), strictNone = await session(st, st.lead);
    const ok = opened(none) && !(rowOf(w, none) || {}).seat && refused(strictNone, "seat-lapsed");
    return { ok, detail: brief({ ordinaryLeadNone: said(none), entraLeadNone: said(strictNone) }) };
  }
  /* The invitation stage: an unseated token hello is refused, the token unspent, no try counted and the challenge good, so the same
     challenge then opens with a current certificate and spends the token; both resumes ask the seat again; on an Entra team a certificate
     of another licence than the team's opens it, and none is refused. */
  async function inviteStageScene() {
    const w = await team({}), j = joiner(w, "j"), inv = await inviteOn(w), now = w.R.clock.now;
    const ranOut = await helloWith(w, j, { invite: inv.token, inv: inv.inv, seat: certFor(j.pub, hex(16), now - 8 * DAY, 7 * DAY) });
    const row = storeOf(w).get("inv:" + inv.inv) || {}, tries = storeOf(w).list("tf:").length, spentChallenge = storeOf(w).get("chu:" + ranOut.challenge) !== undefined;
    const good = certFor(j.pub, hex(16), now, 7 * DAY);
    const sameChallenge = await helloWith(w, j, { invite: inv.token, inv: inv.inv, seat: good }, ranOut.challenge);
    const spent = (storeOf(w).get("inv:" + inv.inv) || {}).spent === true;
    w.R.clock.now += 40 * MIN;
    const resumeNone = await helloWith(w, j, {});
    const resumeGood = await helloWith(w, j, { seat: good });
    await devicesOf(w, ["a", "b"]);
    const inv2 = await inviteOn(w), c = w.desks.c, cc = certFor(c.pub, hex(16), w.R.clock.now, 7 * DAY);
    const rejoin = await helloWith(w, c, { invite: inv2.token, inv: inv2.inv, seat: cc });
    const rejoinNone = await helloWith(w, c, {}), rejoinGood = await helloWith(w, c, { seat: cc });
    const st = await team({ seats: true }), sj = joiner(st, "j"), sk = joiner(st, "k"), si = await inviteOn(st), si2 = await inviteOn(st);
    const strictOther = await helloWith(st, sj, { invite: si.token, inv: si.inv, seat: certFor(sj.pub, hex(16), st.R.clock.now, 7 * DAY) });
    const strictNone = await helloWith(st, sk, { invite: si2.token, inv: si2.inv });
    const ok = refused(ranOut, "seat-lapsed") && row.spent === false && tries === 0 && !spentChallenge && opened(sameChallenge) && sameChallenge.json.invite === true && spent
      && refused(resumeNone, "seat-lapsed") && opened(resumeGood) && resumeGood.json.invite === true
      && opened(rejoin) && refused(rejoinNone, "seat-lapsed") && opened(rejoinGood) && opened(strictOther) && refused(strictNone, "seat-lapsed")
      && (storeOf(st).get("inv:" + si2.inv) || {}).spent === false;
    return { ok, detail: brief({ ranOut: said(ranOut), tokenSpentAfterRefusal: row.spent, tries, challengeSpent: spentChallenge, sameChallenge: said(sameChallenge), spent,
      resumeNone: said(resumeNone), resumeGood: said(resumeGood), rejoin: said(rejoin), rejoinNone: said(rejoinNone), rejoinGood: said(rejoinGood),
      entraOtherLicence: said(strictOther), entraNone: said(strictNone) }) };
  }
  /* Lapse first: a lapsed ordinary team's desk is told team-lapsed whatever its seat, and so is the lead; a read-only team still opens
     sessions, so its desk then meets the seat. */
  async function lapseFirstScene() {
    const w = await team({ paid: false }), a = w.desks.a;
    w.R.clock.now = w.firstGrant.until + MIN;
    const unseated = await session(w, a), seated = await session(w, a, certFor(a.pub, hex(16), w.R.clock.now, 7 * DAY)), lead = await session(w, w.lead);
    const ro = await team({});
    ro.R.clock.now = ro.firstGrant.until + 31 * DAY;
    const roNone = await session(ro, ro.desks.a), roSeat = await session(ro, ro.desks.a, certFor(ro.desks.a.pub, hex(16), ro.R.clock.now, 7 * DAY));
    const ok = refused(unseated, "team-lapsed") && refused(seated, "team-lapsed") && refused(lead, "team-lapsed") && refused(roNone, "seat-lapsed") && opened(roSeat);
    return { ok, detail: brief({ lapsedUnseated: said(unseated), lapsedSeated: said(seated), lapsedLead: said(lead), readOnlyNone: said(roNone), readOnlySeated: said(roSeat) }) };
  }
  /* A person's store: its session is judged by its store certificate alone; a seat certificate does not open it, and a store session,
     carrying no seat, is never refused for that. */
  async function storeScene() {
    const R = S.relayEnv(Object.assign({ roots: K.ROOTS }, TEAM_COPY ? { team: TEAM_COPY } : {}));
    R.clock.now = T0;
    const code = "ABCDEFGHJKMNPQRS", lead = keyPair(false), rt = hex(16), a = Object.assign(keyPair(true), { place: "k-" + hex(8) });
    const g = { kind: "etiuda-store-grant", format: 1, lead: lead.pub, code, issued: T0, until: T0 + 30 * DAY, paid: true,
      via: K.delegationFor(T0, { fields: { may: ["licence", "relay-grant"] } }) };
    g.sig = { alg: "ed25519", keyId: K.DELEGATE.id, value: "" };
    g.sig.value = signHex(K.DELEGATE, C.grantBytes(g));
    const storeCert = (pub, issued, span) => {
      const c = { kind: "etiuda-store-certificate", format: 1, desk: pub, code, issued, until: issued + span, via: K.delegationFor(issued, { fields: { may: ["licence"] } }) };
      c.sig = { alg: "Ed25519", keyId: K.DELEGATE.id, value: "" };
      c.sig.value = signHex(K.DELEGATE, C.storeCertBytes(c));
      return c;
    };
    const made = await call(R, "POST", "/relay/v1/teams", { json: K.createBody(rt, lead, T0, b => signHex(lead, b), { grant: g }) });
    const keys = [{ id: a.keyId, pub: a.pub, desk: a.place }], aCert = storeCert(a.pub, T0, DAY);
    const enrolled = await call(R, "POST", "/relay/v1/t/" + rt + "/devices", { json: { keys, rev: 1, t: T0, sig: signHex(lead, C.devicesBytes(rt, 1, T0, keys)),
      seat: aCert, by: { pub: a.pub, sig: signHex(a, C.storeDevicesBytes(rt, 1, T0, keys)) } } });
    const w = { R, rt, lead };
    const own = await session(w, a, aCert);
    const seatCert = await session(w, a, certFor(a.pub, hex(16), T0, 7 * DAY));
    const none = await session(w, a);
    R.clock.now = T0 + 20 * MIN;
    const later = await listWith(w, own);
    const ok = made.status === 200 && enrolled.status === 200 && opened(own) && own.json.until === T0 + C.SESSION_MS && !(rowOf(w, own) || {}).seat
      && refused(seatCert, "seat-lapsed") && refused(none, "seat-lapsed") && later.status === 200;
    return { ok, detail: brief({ made: said(made), enrolled: said(enrolled), storeCert: said(own), seatCert: said(seatCert), none: said(none), twentyMinutesOn: said(later) }) };
  }
  await leg("s24a", ordinaryRefusedScene, "the ordinary arm: on a team with no seats a desk with no certificate, an ended one (at its end too, a pooled one included), another desk's, a forged one, one under a delegation that may not sign licences, past its span (30 days, a pooled one a day), issued ahead, signed by a revoked key, a desk-only or pooled mark its signature does not cover, a mark that is not true, or no certificate at all, is each refused seat-lapsed, and its own current one opens");
  await leg("s24b", anyLicenceScene, "on a team with no seats a current certificate of any licence opens, a desk-only one (the desk's own trial), a pooled one and one with both marks among them; each session row keeps its seat, and nothing of seats is stored");
  await leg("s24c", doorUntouchedScene, "the door is untouched: on an ordinary team a stranger's certificate of a licence the door does not name, or a desk-only one of a licence it names, knocks not-enrolled, a current one of its licence asks, an empty or missing list is still door, and an enrolled desk's knock opens on the ordinary arm");
  await leg("s24d", midSessionScene, "mid-session: a desk's session ends at its certificate's end (its until that end, a list a millisecond before it read, at it and after it no-hello, a hello then seat-lapsed); a longer certificate leaves the thirty minutes, the lead's session keeps none; a session the strict arm opened on a run-out certificate is ended no-hello once the team is released");
  await leg("s24e", sessionSeatScene, "no hello issues a session for a desk's key without a seat: the enrolled hello and knock, the token hello, both resumes of a bound invitation and the door's request and resume, on an ordinary and an Entra team, each keep the certificate's seat and end no later than it; the lead's on an ordinary team keeps none");
  await leg("s24f", leadOrdinaryScene, "the lead's key opens with no certificate on an ordinary team, its session keeping no seat, and is refused with none on an Entra team");
  await leg("s24g", inviteStageScene, "the invitation stage on every team: an unseated token hello is refused seat-lapsed, its token unspent, no try counted and its challenge good, which then opens with a current certificate and spends the token; both resumes ask the seat again; on an Entra team another licence's certificate opens it and none is refused");
  await leg("s24h", lapseFirstScene, "lapse first: a lapsed ordinary team's desk is told team-lapsed seated or not, and so is the lead; a read-only team's desk meets the seat, refused with none and open with one");
  /* No folder arm: a working team's lead writing its team file with a channel keeps no team file or move row, and a
     read-only team's lead moving it to a folder is refused team-lapsed, as every write there is. */
  async function folderGoneScene() {
    const w = await team({}), teamKey = crypto.randomBytes(32);
    const leadFile = (counter, extra) => B.seal(Object.assign({ relayTeamId: w.rt, epoch: 1, teamKey, writer: { keyId: w.lead.keyId, privateKey: w.lead.privateKey },
      path: "etiuda-team.json", body: "team " + counter, counter, place: "root", kind: "file" }, extra || {}));
    const ls = await session(w, w.lead), f1 = leadFile(1);
    const working = await putBlob(w, ls.json && ls.json.session, f1, { channel: { kind: "relay" } });
    const rowsAfter = storeOf(w).dump().map(([k]) => k).filter(k => k === "moved" || k === "teamFile");
    w.R.clock.now = w.firstGrant.until + 31 * DAY;
    const lro = await session(w, w.lead);
    const toFolder = await putBlob(w, lro.json && lro.json.session, leadFile(2, { supersedes: f1.id }), { channel: { kind: "folder" } });
    const plainWrite = await putBlob(w, lro.json && lro.json.session, leadFile(3, { supersedes: f1.id }));
    const ok = working.status === 200 && rowsAfter.length === 0 && opened(lro) && refused(toFolder, "team-lapsed") && refused(plainWrite, "team-lapsed");
    return { ok, detail: brief({ working: working.status, keptRows: rowsAfter, readOnlyLead: said(lro), moveToFolder: said(toFolder), plainWrite: said(plainWrite) }) };
  }
  await leg("s24j", folderGoneScene, "the folder arm is gone: a working team's lead file naming a channel keeps no team file or move row, and a read-only team's lead moving its team file to a folder is refused team-lapsed, as its plain write is");
  /* THE MEMBER MARK: a following Studio's certificate for its member key, signed "member" after "pooled" and "desk-only". The relay
     cannot tell that key from a desk's at a hello, so there it is taken as a desk's would be, on both arms, at a key hello and at the
     invitation stage, and the session's seat records the mark; this leg says so, so that a later rule changes it on purpose. */
  async function memberTakenScene() {
    const o = await team({}), st = await team({ seats: true }), got = {};
    const marked = (k, lic, w) => certFor(k.pub, lic, w.R.clock.now, 7 * DAY, { member: true });
    got.ordinaryHello = await session(o, o.desks.a, marked(o.desks.a, hex(16), o));
    got.strictHello = await session(st, st.desks.a, marked(st.desks.a, st.licence, st));
    got.strictOtherLicence = await session(st, st.desks.b, marked(st.desks.b, hex(16), st));
    const oj = joiner(o, "j"), oi = await inviteOn(o), sj = joiner(st, "j"), si = await inviteOn(st);
    got.ordinaryInvite = await helloWith(o, oj, { invite: oi.token, inv: oi.inv, seat: marked(oj, hex(16), o) });
    got.strictInvite = await helloWith(st, sj, { invite: si.token, inv: si.inv, seat: marked(sj, hex(16), st) });
    const kept = [[o, got.ordinaryHello], [st, got.strictHello], [o, got.ordinaryInvite], [st, got.strictInvite]].every(([w, r]) => (rowOf(w, r) || {}).seat && rowOf(w, r).seat.member === true);
    const plainRow = rowOf(o, await session(o, o.desks.b, certFor(o.desks.b.pub, hex(16), o.R.clock.now, 7 * DAY)));
    const ok = opened(got.ordinaryHello) && opened(got.strictHello) && refused(got.strictOtherLicence, "seat-lapsed") && opened(got.ordinaryInvite) && opened(got.strictInvite)
      && kept && !!plainRow && plainRow.seat && plainRow.seat.member === undefined;
    return { ok, detail: brief(Object.assign({}, ...Object.entries(got).map(([n, r]) => ({ [n]: said(r) })), { markKept: kept, unmarkedSeat: plainRow ? Object.keys(plainRow.seat || {}) : null })) };
  }
  /* At the door, where only a desk knocks, a marked certificate is refused: a stranger's new request and an enrolled desk's knock alike,
     on an ordinary and an Entra team, while the same desks' unmarked certificates still ask and open. */
  async function memberDoorScene() {
    const rows = {};
    for (const [kind, o] of [["ordinary", {}], ["entra", { seats: true }]]) {
      const w = await team(o), L = w.licence, now = w.R.clock.now, k = keyPair(true);
      await doorOf(w, [L]);
      const strangerMarked = await knockWith(w, k, certFor(k.pub, L, now, 7 * DAY, { member: true }));
      const enrolledMarked = await knockWith(w, w.desks.a, certFor(w.desks.a.pub, L, now, 7 * DAY, { member: true }));
      const stranger = await knockWith(w, k, certFor(k.pub, L, now, 7 * DAY));
      const enrolled = await knockWith(w, w.desks.a, certFor(w.desks.a.pub, L, now, 7 * DAY));
      rows[kind] = { strangerMarked: said(strangerMarked), enrolledMarked: said(enrolledMarked), stranger: said(stranger), enrolled: said(enrolled),
        ok: said(strangerMarked) === "not-enrolled" && said(enrolledMarked) === "not-enrolled" && stranger.status === 200 && stranger.json.invite === true && opened(enrolled) };
    }
    return { ok: rows.ordinary.ok && rows.entra.ok, detail: brief(rows) };
  }
  /* The mark is inside the signed bytes: a marked certificate stripped of the field, and an unmarked one given it after its signing, are
     refused on both arms; the marked one as signed opens. */
  async function memberBytesScene() {
    const rows = {};
    for (const [kind, o] of [["ordinary", {}], ["entra", { seats: true }]]) {
      const w = await team(o), a = w.desks.a, now = w.R.clock.now;
      const stripped = certFor(a.pub, w.licence, now, 7 * DAY, { member: true });
      delete stripped.member;
      const added = Object.assign(certFor(a.pub, w.licence, now, 7 * DAY), { member: true });
      const r = { stripped: await session(w, a, stripped), added: await session(w, a, added), signed: await session(w, a, certFor(a.pub, w.licence, now, 7 * DAY, { member: true })) };
      rows[kind] = { stripped: said(r.stripped), added: said(r.added), signed: said(r.signed), ok: refused(r.stripped, "seat-lapsed") && refused(r.added, "seat-lapsed") && opened(r.signed) };
    }
    return { ok: rows.ordinary.ok && rows.entra.ok, detail: brief(rows) };
  }
  await leg("s25a", memberTakenScene, "a following Studio's marked certificate is taken at a key hello and at the invitation stage on both arms as a desk's would be (any licence on the ordinary arm, the team's on the strict arm), and the session's seat records the mark, an unmarked one's not");
  await leg("s25b", memberDoorScene, "at the door a marked certificate is refused not-enrolled, a stranger's new request and an enrolled desk's knock alike, on an ordinary and an Entra team, while the same desks' unmarked certificates ask and open");
  await leg("s25c", memberBytesScene, "the member mark is signed: a marked certificate stripped of the field, and an unmarked one given it after its signing, are refused on both arms, and the marked one as signed opens");
  /* A DESK ALWAYS TAKES BACK ITS OWN REQUEST: a stranger's door request up, its certificate then run out, its key's hello opens a session
     that withdraws the request and does nothing else: it lists nothing, reads neither the lead's answer nor a wrap, opens no socket,
     sends no other request, and after the withdrawal the desk can neither knock, ask again, nor resume; one holding a current certificate
     still opens the session as built. On an ordinary and an Entra team. */
  async function withdrawScene() {
    const rows = {};
    for (const [kind, o] of [["ordinary", {}], ["entra", { seats: true }]]) {
      const w = await team(o), L = w.licence, k = keyPair(true), cert = certFor(k.pub, L, w.R.clock.now, HOUR);
      await doorOf(w, [L]);
      const knock = await knockWith(w, k, cert), id = knock.json && knock.json.door;
      const place = "k-" + hex(8), sealKey = crypto.randomBytes(32);
      const ask = B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: sealKey, writer: { keyId: k.keyId, privateKey: k.privateKey },
        path: "desks/" + place + "/join.json", body: JSON.stringify({ ask: 1 }), counter: 1, place: "desk:" + place, kind: "file" });
      const up = await putBlob(w, knock.json && knock.json.session, ask, { pub: k.pub });
      /* The lead answers it, so there is something of the lead's for the request's session to try to read. */
      const ls = await session(w, w.lead, kind === "entra" ? certFor(w.lead.pub, L, w.R.clock.now, 7 * DAY) : undefined);
      const answer = B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: sealKey, id, writer: { keyId: w.lead.keyId, privateKey: w.lead.privateKey },
        path: "answer.json", body: "joined", counter: 1, place: "root", kind: "file" });
      answer.place = "answer:" + id;
      const answered = await putBlob(w, ls.json && ls.json.session, answer);
      w.R.clock.now = cert.until + 2 * HOUR;
      const s = await session(w, k, cert), token = opened(s) ? s.json.session : "", row = rowOf(w, s) || {};
      const tried = {
        since: said(await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/since/0", { token })),
        answer: said(await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/b/" + id, { token })),
        wrap: said(await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/wrap", { token })),
        socket: said(await call(w.R, "GET", "/relay/v1/t/" + w.rt + "/socket", { token })),
        otherRequest: said(await putBlob(w, token, B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: sealKey, writer: { keyId: k.keyId, privateKey: k.privateKey },
          path: "desks/" + place + "/join2.json", body: "again", counter: 2, place: "desk:" + place, kind: "file" }), { pub: k.pub })),
      };
      const del = B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: sealKey, writer: { keyId: k.keyId, privateKey: k.privateKey },
        path: "desks/" + place + "/join.json", body: "", counter: 3, place: "desk:" + place, kind: "delete", supersedes: ask.id });
      const withdrawn = await putBlob(w, token, del);
      const inv = storeOf(w).get("inv:" + id) || {};
      const after = {
        askAgain: said(await putBlob(w, token, B.seal({ relayTeamId: w.rt, epoch: 1, teamKey: sealKey, writer: { keyId: k.keyId, privateKey: k.privateKey },
          path: "desks/" + place + "/join.json", body: "again", counter: 4, place: "desk:" + place, kind: "file" }), { pub: k.pub })),
        knock: said(await knockWith(w, k, cert)),
        resume: said(await session(w, k, cert)),
      };
      const seated = await session(w, k, certFor(k.pub, hex(16), w.R.clock.now, 7 * DAY));
      const r = { knock: said(knock), up: up.status, answered: answered.status, withdrawSession: said(s), marked: row.withdraw === true && !row.seat, tried,
        withdrawn: withdrawn.status, requestGone: storeOf(w).get("blob:" + ask.id) === undefined && inv.withdrawn === true && inv.uploaded === false, after, seated: said(seated) };
      r.ok = knock.status === 200 && up.status === 200 && answered.status === 200 && opened(s) && r.marked
        && Object.values(tried).every(x => x === "seat-lapsed") && withdrawn.status === 200 && r.requestGone
        && after.askAgain === "seat-lapsed" && after.knock === "not-enrolled" && after.resume === "seat-lapsed" && opened(seated) && !(rowOf(w, seated) || {}).withdraw;
      rows[kind] = r;
    }
    return { ok: rows.ordinary.ok && rows.entra.ok, detail: brief(rows) };
  }
  await leg("s26a", withdrawScene, "a desk always takes back its own request: its certificate run out, its key's hello opens a session that withdraws the door request, the request's row then gone, and that session lists, reads the lead's answer or a wrap, opens a socket or sends another request no more than the desk can then knock, ask again or resume; a current certificate's session is opened as built; on an ordinary and an Entra team");
  await leg("s24i", storeScene, "a person's store: a session opens on its store certificate alone, a seat certificate or none is refused, and a store session, carrying no seat, still reads twenty minutes on");

  /* ---- the plants: each guard lifted in a copy of relay/core.cjs turns its named leg red, and the product file is never written ---- */
  const ADOPTED = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead", "certWhy"];
  /* A plant line lifted in a copy of relay/core.cjs, or of relay/team.cjs where the core carries no such line (the team's objects then
     run over the copy, beside the live core). */
  /* `edits`, a planted fault no plant line can lift ({name, edits: [[from, to], ...]}): each `from` found once in relay/core.cjs and
     replaced in the copy, or the plant says so and turns nothing. */
  function plantedText(planted) {
    let text = fs.readFileSync(PRODUCT.core, "utf8");
    for (const [from, to] of planted.edits) {
      if (text.split(from).length !== 2) return null;
      text = text.replace(from, () => to);
    }
    return text;
  }
  async function lifted(tag, fn) {
    const digest = sha(fs.readFileSync(PRODUCT.core)), teamDigest = sha(fs.readFileSync(PRODUCT.team)), kept = {};
    for (const k of ADOPTED) kept[k] = C[k];
    let turned = false, detail = "plant line absent";
    try {
      if (typeof tag === "object") {
        const text = plantedText(tag);
        if (text === null) return { turned: false, back: true, detail: "a planted edit's text is not in relay/core.cjs exactly once" };
        const fresh = coreFrom(text);
        for (const k of ADOPTED) C[k] = fresh[k];
        const r = await safe(fn);
        turned = r.ok !== true;
        return { turned, back: sha(fs.readFileSync(PRODUCT.core)) === digest && sha(fs.readFileSync(PRODUCT.team)) === teamDigest, detail: turned ? "the check lifted" : "the check still held" };
      }
      const lines = fs.readFileSync(PRODUCT.core, "utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0);
      const teamLines = fs.readFileSync(PRODUCT.team, "utf8").split(/\n/);
      const teamAt = at >= 0 ? -1 : teamLines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        const fresh = coreFrom(lines.join("\n"));
        for (const k of ADOPTED) C[k] = fresh[k];
      } else if (teamAt >= 0) {
        teamLines.splice(teamAt, 1);
        const dir = copyOf({ "relay/team.cjs": teamLines.join("\n"), "relay/core.cjs": forwardTo(PRODUCT.core), "shell/relay/blob.cjs": forwardTo(PRODUCT.blob) });
        TEAM_COPY = require(path.join(dir, "relay", "team.cjs"));
      }
      if (at >= 0 || teamAt >= 0) {
        const r = await safe(fn);
        turned = r.ok !== true;
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) { detail = e && e.stack ? e.stack.split("\n")[0] : String(e); }
    finally { for (const k of ADOPTED) C[k] = kept[k]; TEAM_COPY = null; }
    return { turned, back: sha(fs.readFileSync(PRODUCT.core)) === digest && sha(fs.readFileSync(PRODUCT.team)) === teamDigest, detail };
  }
  const W7 = 7 * DAY, W1 = DAY;
  /* The planted faults of the ordinary arm that no plant line lifts. */
  const MARK_LOOP = "for (const m of CERT_MARKS) if (c[m.field] === true) lines.push(m.line);";
  const PLANTED = {
    withdrawAny: { name: "the withdrawal's exemption widened to any resume", edits: [["    exempt = letGo && !seat.ok; /* plant:withdraw-exempt */", "    exempt = !seat.ok;"]] },
    folderBack: { name: "the folder arm restored", edits: [["    const lapsedPut = goes ? null : lapseGate(true);",
      '    const lapsedPut = goes || (lapseState() === "read-only" && !s.inv && !!m && m.writer === team.lead.keyId && m.place === "root" && !!m.channel && m.channel.kind === "folder") ? null : lapseGate(true);']] },
    pooledOutside: { name: "the pooled mark signed as no line", edits: [[MARK_LOOP, MARK_LOOP.replace("=== true)", "=== true && m.field !== \"pooled\")")]] },
    deskOnlyOutside: { name: "the desk-only mark signed as no line", edits: [[MARK_LOOP, MARK_LOOP.replace("=== true)", "=== true && m.field !== \"deskOnly\")")]] },
    doorAnyLicence: { name: "the door given the ordinary arm's any-licence entry", edits: [["const why = certWhy(b.door, b.pub, refs, clock(), roots, revokedNow());",
      "const why = seatCertWhy(b.door, b.pub, clock(), roots, revokedNow());"]] },
    doorDeskOnly: { name: "the door taking a desk-only certificate", edits: [["licence => refs.indexOf(licence) > -1, m => m.strict,", "licence => refs.indexOf(licence) > -1, () => true,"]] },
    memberOutside: { name: "the member mark signed as no line", edits: [[MARK_LOOP, MARK_LOOP.replace("=== true)", "=== true && m.field !== \"member\")")]] },
    leadAsked: { name: "the lead's key asked a seat on an ordinary team", edits: [["      if (plain(store.get(\"seats\"))) seat = seatGate(b.seat, b.pub); /* plant:seat-lead */",
      "      seat = seatGate(b.seat, b.pub);"]] },
    tokenSpentFirst: { name: "the invitation's seat judged after the token is spent", edits: [[
      "    if (!tokenSeat.ok) return tokenSeat;\n",
      "    if (!tokenSeat.ok) { store.atomic(() => { store.put(\"inv:\" + b.inv, Object.assign({}, inv, { spent: true, spentAt: clock() })); noteTry(b.inv, b.key); store.put(\"chu:\" + b.challenge, { at: clock(), inv: b.inv }); }); return tokenSeat; }\n"]] },
  };
  const PLANTS = [
    ["seat-session", "s2a", noCertScene, "a desk's session asks no seat"],
    ["seat-cert", "s3a", wrongCertScene, "a certificate that is not this team's current seat opens"],
    ["seat-ordinary", "s2a", noCertScene, "a team with no seats asks no seat, so a desk with none opens"],
    ["seat-ordinary", "s17a", ordinaryScene, "a team with no seats asks no seat, so its desks' sessions keep none"],
    ["seat-lapsed", "s6 W=7d", () => removedByColleagueScene(W7), "a run-out certificate always opens"],
    ["seat-lapsed", "s7 W=1d", () => removedByGrantScene(W1), "a run-out certificate always opens"],
    ["pooled-grace", "s21a", pooledOutageScene, "a pooled desk has no grace"],
    ["pooled-quiet", "s21b", pooledTakenScene, "the grace runs while the service works"],
    ["pooled-refused-mark", "s21d", pooledNightScene, "a daylight refusal is not kept, so a quiet night reopens the desk"],
    ["pooled-refused-read", "s21d", pooledNightScene, "a kept refusal is never read"],
    ["pooled-refused-prune", "s21d", pooledNightScene, "a kept refusal outlives the grace"],
    ["seat-freed", "s22a", freedScene, "a freed pooled desk is not refused"],
    ["freed-sessions", "s22e", freedSessionScene, "a freed desk's open session lives out its 30 minutes"],
    ["freed-new", "s22e", freedSessionScene, "a renewal naming a desk again ends the session its person came back to"],
    ["freed-sockets", "s22e", freedSessionScene, "a freed desk's socket stays open"],
    ["seats-release-mark", "s15d", releaseReplayScene, "the released grant, posted again, gates the team"],
    ["session-seat", "s23a", liveRunOutScene, "a live bearer is never judged again, so a run-out past the margin still reads"],
    ["session-seat", "s23b", liveGraceScene, "a live bearer is never judged again, so a pooled grace the service ended still reads"],
    ["freed-issued", "s22d", freedSinceScene, "the issue-time comparison dropped, so a certificate issued after the freeing is refused"],
    ["seats-freed-kept", "s22b", nightOnlyScene, "a grant's freed list is not kept"],
    ["grant-freed-shape", "s22c", freedShapeScene, "a freed list out of shape is taken"],
    ["cert-pooled-span", "s21e", pooledSpanScene, "a pooled certificate runs 30 days"],
    [PLANTED.pooledOutside, "s21c", pooledSignedScene, "the pooled mark rides outside the signature"],
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
    /* The ordinary arm's guards. */
    ["seat-ordinary", "s24a", ordinaryRefusedScene, "a team with no seats asks none"],
    ["seat-ordinary-ended", "s24a", ordinaryRefusedScene, "the ordinary arm takes an ended certificate"],
    [PLANTED.deskOnlyOutside, "s24a", ordinaryRefusedScene, "a desk-only mark its signature does not cover is taken"],
    [PLANTED.deskOnlyOutside, "s24b", anyLicenceScene, "a desk-only certificate signed with its line is refused"],
    [PLANTED.doorAnyLicence, "s24c", doorUntouchedScene, "the door takes a certificate of a licence it does not name"],
    [PLANTED.doorDeskOnly, "s24c", doorUntouchedScene, "the door takes a desk-only certificate"],
    ["seat-session-cap", "s24d", midSessionScene, "a desk's session runs its thirty minutes past its certificate"],
    ["seat-ordinary-life", "s24d", midSessionScene, "a session is read at its certificate's end, and a released team's run-out seat reads on"],
    ["session-seat-kept", "s24e", sessionSeatScene, "a session keeps no seat"],
    [PLANTED.leadAsked, "s24f", leadOrdinaryScene, "the lead's key is asked a seat on an ordinary team"],
    ["seat-lead", "s24f", leadOrdinaryScene, "the lead's key is exempt on an Entra team too"],
    [PLANTED.tokenSpentFirst, "s24g", inviteStageScene, "a token hello refused for its seat spends the token, a try and the challenge"],
    ["resume-seat", "s24g", inviteStageScene, "a bound invitation's resume asks no seat"],
    ["lapse-first", "s24h", lapseFirstScene, "a lapsed team's desk is told its seat"],
    [PLANTED.folderBack, "s24j", folderGoneScene, "a read-only team's lead moves its team file to a folder"],
    ["seat-member", "s25a", memberTakenScene, "the mark is dropped from the session's seat"],
    [PLANTED.memberOutside, "s25a", memberTakenScene, "a marked certificate signed with its line is refused"],
    ["door-member", "s25b", memberDoorScene, "the door takes a marked certificate"],
    [PLANTED.memberOutside, "s25c", memberBytesScene, "a certificate given the mark after its signing is taken"],
    ["withdraw-exempt", "s26a", withdrawScene, "a desk whose certificate ran out cannot take back its request"],
    ["withdraw-reads", "s26a", withdrawScene, "a withdrawal's session reads the team"],
    ["withdraw-only", "s26a", withdrawScene, "a withdrawal's session sends another request"],
    [PLANTED.withdrawAny, "s26a", withdrawScene, "the exemption widened to any resume, so a resume that is not a withdrawal opens"],
    [PLANTED.withdrawAny, "s24g", inviteStageScene, "the exemption widened to any resume, so an unseated resume opens"],
    ["store-session", "s24i", storeScene, "a store's session is judged by the seat gate, so its store certificate is refused and a seat certificate opens it"],
  ];
  for (const [tag, id, scene, what] of PLANTS) {
    const line = "p " + id + (typeof tag === "object" ? " planting " + tag.name + " in a copy" : " lifting plant:" + tag) + " turns " + id + " red (" + what + "), and the product file is never written";
    if (plantSkipped(tag)) { skip(line); continue; }
    const base = results[id] && results[id].ok === true;
    const p = await lifted(tag, scene);
    check(base && p.turned && p.back, line + ": " + p.detail + ", sha " + (p.back ? "unchanged" : "CHANGED"));
  }
  /* ---- the desk's half: shell/relay/channel.cjs over the same relay ---- */
  const CH = require(path.join(ROOT, "shell", "relay", "channel.cjs"));
  /* A desk's channel over team `w`, its seat what `seat.cert` holds; each session's body kept, so a leg reads what the desk sent.
     `x.invite` an invitation it holds; `x.state` the mirror of an earlier channel, whose record it takes on; `x.strict` refuses any
     session request carrying a seat, as no relay does. */
  function deskChannel(w, name, seat, mod, x) {
    const d = w.desks[name], opt = x || {}, bodies = [], told = [], ends = [], answers = [];
    const mirror = opt.state || path.join(WORK, "m" + (++copies));
    const ch = (mod || CH).createChannel({
      rt: w.rt, url: "https://relay.test/relay/v1", mirror, stateFile: mirror + ".json", watch: false, pollMs: 1e9,
      pin: () => ({ teamId: "t-" + w.rt.slice(0, 8), rt: w.rt, lead: { keyId: w.lead.keyId, public: w.lead.pub } }),
      me: () => Object.assign({ keyId: d.keyId, public: d.pub, privateKey: d.privateKey, place: "desk:" + d.place }, d.box ? { box: d.box } : {}),
      keyFor: () => null, sealEpoch: () => 1, clock: () => w.R.clock.now, say: () => {},
      invite: opt.invite ? () => opt.invite : undefined,
      onInviteEnd: kind => ends.push(kind),
      request: async (method, url, headers, body) => {
        let sent = null;
        if (/\/session$/.test(url)) { try { sent = JSON.parse(Buffer.from(body).toString("utf8")); } catch { sent = null; } bodies.push(sent); }
        if (sent && opt.strict && sent.seat !== undefined) {
          const refusal = { error: "bad-signature", said: B.REASONS["bad-signature"] };
          answers.push(redact({ status: 403, json: refusal }));
          return { status: 403, header: () => null, bytes: Buffer.from(JSON.stringify(refusal)) };
        }
        const res = await W.fetch(new Request(url, { method, headers, body: method === "GET" ? undefined : body, duplex: "half" }), w.R.env);
        const bytes = Buffer.from(await res.arrayBuffer());
        if (sent) { let json = null; try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; } answers.push(redact({ status: res.status, json })); }
        return { status: res.status, header: n => res.headers.get(n), bytes };
      },
      connect: () => null,
      seat: () => seat.cert || null,
      seatRenew: async () => { seat.renewals = (seat.renewals || 0) + 1; if (seat.hold) await seat.hold(); if (seat.renew) seat.cert = seat.renew(); },
      seatRenewMs: seat.renewMs,
      onSeat: s => told.push(s),
    });
    return { ch, bodies, told, ends, answers, mirror };
  }
  /* The relay's own random values (a challenge, a session, a secret) set aside, as O1 sets them aside. */
  const redact = v => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === "string" ? x.replace(/[0-9a-f]{16,}/g, "#") : x)));
  const cycleOf = async c => { c.ch.start(); await c.ch.idle(); };
  /* A joining desk on no list, and an invitation the lead registered for it. */
  function joiner(w, name) {
    w.desks[name] = Object.assign(keyPair(true), { place: "k-" + hex(8) });
    return w.desks[name];
  }
  async function inviteOn(w) {
    const inv = hex(16), token = hex(32), t = w.R.clock.now, add = [{ id: inv, hash: sha(token) }];
    const r = await call(w.R, "POST", "/relay/v1/t/" + w.rt + "/invites", { json: { add, drop: [], t, sig: signHex(w.lead, C.invitesBytes(w.rt, t, add, [])) } });
    if (r.status !== 200) throw new Error("the invitation was not registered: " + said(r));
    return { inv, token, seal: crypto.randomBytes(32) };
  }
  const tokenHellos = c => c.bodies.filter(b => b && b.invite !== undefined);
  const keyHellos = c => c.bodies.filter(b => b && b.invite === undefined && b.door === undefined);
  const carries = b => (b && b.seat ? "seat" : "none");
  /* The desk sends its certificate from the first hello on every team: on an Entra team its one hello carries it and opens; on an
     ordinary team its first hello carries it and opens; a desk holding none sends none, and the relay refuses it, the shell told. */
  async function deskFirstScene(mod) {
    const w = await team({ seats: true });
    const seat = { cert: prove(w, "a", 7 * DAY) };
    const c = deskChannel(w, "a", seat, mod);
    await cycleOf(c);
    const online = c.ch.online();
    await c.ch.stop();
    const o = await team({});
    const oc = deskChannel(o, "a", { cert: prove(o, "a", 7 * DAY) }, mod);
    await cycleOf(oc);
    const oOnline = oc.ch.online();
    await oc.ch.stop();
    const nc = deskChannel(o, "b", {}, mod);
    await cycleOf(nc);
    const nOnline = nc.ch.online();
    await nc.ch.stop();
    const ok = online && c.bodies.map(carries).join() === "seat" && c.told.length === 0 && oOnline && oc.bodies.length >= 1 && carries(oc.bodies[0]) === "seat"
      && !nOnline && nc.bodies.length >= 1 && nc.bodies.every(b => b && b.seat === undefined) && nc.told.join() === "refused";
    return { ok, detail: brief({ entraSent: c.bodies.map(carries), entraOnline: online, ordinarySent: oc.bodies.map(carries), ordinaryOnline: oOnline,
      noneSent: nc.bodies.map(carries), noneOnline: nOnline, noneTold: nc.told }) };
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
  /* A desk whose current certificate the relay refuses (its service key revoked): it renews once and opens with the new one, sent on
     the challenge the refusal left unspent; a renewal that brings the same certificate is not sent again. */
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
    const ok = online && seat.renewals === 1 && c.bodies.length === 2 && !!c.bodies[1] && !!c.bodies[1].seat && c.bodies[1].seat.via.key.pub === K.DELEGATE.pub
      && c.bodies[0].challenge === c.bodies[1].challenge && !c2.ch.online() && same.renewals === 1 && sentSame === 1;
    return { ok, detail: brief({ online, renewals: seat.renewals, sessions: c.bodies.length, sameChallenge: c.bodies.length === 2 && c.bodies[0].challenge === c.bodies[1].challenge,
      sameRenewalSentAgain: sentSame > 1 }) };
  }
  /* An invitation's hello carries the certificate, on an ordinary team and an Entra team, against the relay as it stands: the joining
     desk's key hello (not enrolled) and its token hello each carry it, the invitation's session opens and the token is marked spent. */
  async function deskInviteScene(mod) {
    const rows = {};
    for (const [kind, o] of [["ordinary", {}], ["entra", { seats: true }]]) {
      const w = await team(o), j = joiner(w, "j"), invite = await inviteOn(w);
      const c = deskChannel(w, "j", { cert: certFor(j.pub, w.licence, w.R.clock.now, 7 * DAY) }, mod, { invite });
      await cycleOf(c);
      rows[kind] = { online: c.ch.online(), enrolled: c.ch.enrolled(), spent: c.ch.program.tokenSpent(invite.inv), key: keyHellos(c).map(carries), token: tokenHellos(c).map(carries) };
      await c.ch.stop();
    }
    const ok = Object.values(rows).every(r => r.online && !r.enrolled && r.spent && r.token.join() === "seat" && r.key.length >= 1 && r.key.every(k => k === "seat"));
    return { ok, detail: brief(rows) };
  }
  /* The relay asking the invitation's hello for a seat: a desk whose certificate it refuses (its service key revoked) renews once and
     sends the invitation's hello again on the same challenge, which opens and only then is the token marked spent; where the renewal
     brings nothing new, the refusal leaves the token unmarked, the invitation not ended and still unspent at the relay, the shell told
     "refused", and the desk signed in again joins on the same invitation, the shell told "open". */
  function revokedSigner(w) {
    const svc = serviceKey();
    w.R.env.REVOKED = revokedText([svc.pub]);
    return { signer: svc, via: K.delegationFor(w.R.clock.now, { fields: { may: ["licence"], key: { id: svc.id, pub: svc.pub } } }) };
  }
  async function deskInviteRefusedScene(mod) {
    const w = await team({}), j = joiner(w, "j"), invite = await inviteOn(w);
    const seat = { cert: certFor(j.pub, w.licence, w.R.clock.now, 7 * DAY, revokedSigner(w)) };
    seat.renew = () => certFor(j.pub, w.licence, w.R.clock.now, 7 * DAY);
    const c = deskChannel(w, "j", seat, mod, { invite });
    await cycleOf(c);
    const t1 = tokenHellos(c), renewed = { online: c.ch.online(), renewals: seat.renewals, token: t1.map(carries), sameChallenge: t1.length === 2 && t1[0].challenge === t1[1].challenge,
      second: t1.length === 2 && !!t1[1].seat && t1[1].seat.via.key.pub === K.DELEGATE.pub, spent: c.ch.program.tokenSpent(invite.inv), told: c.told.slice() };
    await c.ch.stop();
    const w2 = await team({}), j2 = joiner(w2, "j"), invite2 = await inviteOn(w2);
    const stuck = { cert: certFor(j2.pub, w2.licence, w2.R.clock.now, 7 * DAY, revokedSigner(w2)) };
    stuck.renew = () => stuck.cert;
    const c2 = deskChannel(w2, "j", stuck, mod, { invite: invite2 });
    await cycleOf(c2);
    const relayInv = storeOf(w2).get("inv:" + invite2.inv) || {};
    const refusedRow = { online: c2.ch.online(), spent: c2.ch.program.tokenSpent(invite2.inv), ends: c2.ends.slice(), told: c2.told.slice(), relaySpent: relayInv.spent === true };
    await c2.ch.stop();
    w2.R.clock.now += 10 * MIN;
    stuck.cert = certFor(j2.pub, w2.licence, w2.R.clock.now, 7 * DAY);
    await cycleOf(c2);
    const back = { online: c2.ch.online(), spent: c2.ch.program.tokenSpent(invite2.inv), told: c2.told.slice(), ends: c2.ends.slice() };
    await c2.ch.stop();
    const ok = renewed.online && renewed.renewals === 1 && renewed.token.join() === "seat,seat" && renewed.sameChallenge && renewed.second && renewed.spent && renewed.told.length === 0
      && !refusedRow.online && !refusedRow.spent && refusedRow.ends.length === 0 && refusedRow.told.join() === "refused" && !refusedRow.relaySpent
      && back.online && back.spent && back.told.join() === "refused,open" && back.ends.length === 0;
    return { ok, detail: brief({ renewed, refused: refusedRow, signedInAgain: back }) };
  }
  /* The resume of a bound invitation carries the certificate: a desk that took an invitation and started again resumes the invitation's
     session by its key hello, which carries it and opens; where the relay refuses the certificate it carries (its service key revoked),
     it is renewed and the resume sent again on the same challenge, and opens. */
  async function deskResumeScene(mod) {
    const rows = {};
    for (const asked of [false, true]) {
      const w = await team({}), j = joiner(w, "j"), invite = await inviteOn(w);
      const first = deskChannel(w, "j", { cert: certFor(j.pub, w.licence, w.R.clock.now, 7 * DAY) }, mod, { invite });
      await cycleOf(first);
      const took = first.ch.online() && first.ch.program.tokenSpent(invite.inv);
      await first.ch.stop();
      w.R.clock.now += 40 * MIN;
      const seat = asked ? { cert: certFor(j.pub, w.licence, w.R.clock.now, 7 * DAY, revokedSigner(w)) } : { cert: certFor(j.pub, w.licence, w.R.clock.now, 7 * DAY) };
      if (asked) seat.renew = () => certFor(j.pub, w.licence, w.R.clock.now, 7 * DAY);
      const again = deskChannel(w, "j", seat, mod, { invite, state: first.mirror });
      await cycleOf(again);
      const k = keyHellos(again);
      rows[asked ? "asked" : "asIs"] = { took, online: again.ch.online(), enrolled: again.ch.enrolled(), key: k.map(carries), tokenHellos: tokenHellos(again).length,
        sameChallenge: k.length < 2 || k[0].challenge === k[1].challenge, renewals: seat.renewals || 0 };
      await again.ch.stop();
    }
    const a = rows.asIs, s = rows.asked;
    const ok = a.took && a.online && !a.enrolled && a.key.join() === "seat" && a.tokenHellos === 0
      && s.took && s.online && !s.enrolled && s.key.join() === "seat,seat" && s.sameChallenge && s.renewals === 1 && s.tokenHellos === 0;
    return { ok, detail: brief(rows) };
  }
  /* Harmless to every relay out there: on an ordinary team, a key hello, an invitation's hello, a bound resume and a door request by
     desks holding certificates give the same answers and leave the same rows as by the same desks holding none, over the relay before
     the ordinary arm and over the core before seats (both fixtures); over this relay the desks holding certificates open all four; a
     stand-in refusing any hello that carries a seat shows the comparison can see a difference. */
  async function harmlessScene() {
    const keys = { lead: keyPair(false), a: keyPair(true), j: keyPair(true), k: keyPair(true), rt: hex(16), pa: "k-" + hex(8), pj: "k-" + hex(8), pk: "k-" + hex(8),
      box: hex(32), leadBox: hex(32), licence: hex(16), inv: hex(16), token: hex(32), seal: crypto.randomBytes(32) };
    const g0 = grantAt(keys.lead.pub, T0);
    const certs = { a: certFor(keys.a.pub, keys.licence, T0, 7 * DAY), j: certFor(keys.j.pub, keys.licence, T0, 7 * DAY), k: certFor(keys.k.pub, keys.licence, T0, 7 * DAY) };
    async function world(core, withSeat, strict) {
      const ADOPT = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead"], kept = {};
      let built = 0;
      if (core) for (const n of ADOPT) { kept[n] = C[n]; C[n] = core[n]; }
      if (core) C.createCore = (...a) => { built++; return core.createCore(...a); };
      try {
        const R = S.relayEnv({ roots: K.ROOTS });
        R.clock.now = T0;
        const w = { R, rt: keys.rt, lead: keys.lead, rev: 0, licence: keys.licence, desks: {
          a: Object.assign({}, keys.a, { place: keys.pa }), j: Object.assign({}, keys.j, { place: keys.pj }), k: Object.assign({}, keys.k, { place: keys.pk, box: keys.box }) } };
        const made = await call(R, "POST", "/relay/v1/teams", { json: K.createBody(w.rt, w.lead, T0, b => signHex(w.lead, b), { grant: g0 }) });
        const enrolled = await devicesOf(w, ["a"]);
        const add = [{ id: keys.inv, hash: sha(keys.token) }];
        const invited = await call(R, "POST", "/relay/v1/t/" + w.rt + "/invites", { json: { add, drop: [], t: T0, sig: signHex(w.lead, C.invitesBytes(w.rt, T0, add, [])) } });
        const door = await call(R, "POST", "/relay/v1/t/" + w.rt + "/door", { json: { refs: [keys.licence], t: T0, sig: signHex(w.lead, C.doorBytes(w.rt, T0, [keys.licence])) } });
        const seatOf = n => ({ cert: withSeat ? certs[n] : null });
        const x = strict ? { strict: true } : {};
        const out = { setup: [made.status, enrolled.status, invited.status, door.status], opened: {}, answers: {} };
        const run = async (name, n, more) => {
          const c = deskChannel(w, n, seatOf(n), null, Object.assign({}, x, more || {}));
          await cycleOf(c);
          out.opened[name] = c.ch.online();
          out.answers[name] = c.answers;
          await c.ch.stop();
          return c;
        };
        await run("keyHello", "a");
        const inviteHolder = { inv: keys.inv, token: keys.token, seal: keys.seal };
        const took = await run("inviteHello", "j", { invite: inviteHolder });
        R.clock.now += 40 * MIN;
        await run("boundResume", "j", { invite: inviteHolder, state: took.mirror });
        await run("doorRequest", "k", { invite: { door: certs.k, box: keys.leadBox } });
        out.built = built;
        const resumed = out.answers.boundResume.filter(r => r.status === 200 && r.json && r.json.session);
        out.resumed = resumed.length === 1 && resumed[0].json.invite === true;
        out.rows = storeOf(w).dump().map(([k, v]) => redact(k) + "=" + JSON.stringify(redact(v))).sort();
        return out;
      } finally { if (core) for (const n of Object.keys(kept)) C[n] = kept[n]; }
    }
    const before = coreBefore(), beforeRule = coreBefore(BEFORE_RULE);
    if (before === null || beforeRule === null) return { ok: false, detail: "a fixture is not the bytes captured from " + BEFORE.from + " and " + BEFORE_RULE.from };
    const rows = {};
    const same = (p, q) => JSON.stringify([p.setup, p.opened, p.answers, p.rows]) === JSON.stringify([q.setup, q.opened, q.answers, q.rows]);
    for (const [name, core] of [["beforeRule", coreFrom(beforeRule)], ["beforeSeats", coreFrom(before)]]) {
      const none = await world(core, false), held = await world(core, true);
      const firstDiff = Object.keys(none.answers).find(k => JSON.stringify(none.answers[k]) !== JSON.stringify(held.answers[k]))
        || (JSON.stringify(none.rows) !== JSON.stringify(held.rows) ? "rows" : null);
      rows[name] = { setup: held.setup, opened: held.opened, resumed: held.resumed && none.resumed, coreBuilt: held.built, same: same(none, held), firstDiff, rows: held.rows.length };
    }
    const here = await world(null, true);
    rows.thisRelay = { setup: here.setup, opened: here.opened, resumed: here.resumed };
    /* The control: a relay that refused a hello for carrying a seat would answer differently, and the comparison says so. */
    const noneStrict = await world(null, false, true), heldStrict = await world(null, true, true);
    rows.control = { seesTheDifference: !same(noneStrict, heldStrict) };
    const opensAll = r => r.resumed && r.setup.every(s => s === 200) && Object.values(r.opened).length === 4 && Object.values(r.opened).every(Boolean);
    const ok = opensAll(rows.beforeRule) && rows.beforeRule.same && rows.beforeRule.coreBuilt > 0 && opensAll(rows.beforeSeats) && rows.beforeSeats.same
      && rows.beforeSeats.coreBuilt > 0 && opensAll(rows.thisRelay) && rows.control.seesTheDifference;
    return { ok, detail: brief(rows) };
  }
  /* The test architect's case on C-4: a desk holding a run-out certificate asks its renewal before the hello, and where the renewal fails
     (it throws) the hello still goes, the run-out certificate in hand, and the cycle ends: over the core before seats it opens exactly
     as a desk holding none; over this relay it is refused seat-lapsed, the shell told refused once, and the next cycle tries again. A
     renewal that never answers is d10a's, answering late d10b's and the bound's option d10c's. */
  async function deskRenewFailsScene(mod) {
    const failing = (w, name) => ({ cert: certFor(w.desks[name].pub, w.licence, w.R.clock.now - 8 * DAY, 7 * DAY), renew: () => { throw new Error("the service did not answer"); } });
    const w = await team({});
    const seat = failing(w, "a"), c = deskChannel(w, "a", seat, mod);
    await cycleOf(c);
    const here = { online: c.ch.online(), sent: keyHellos(c).map(carries), told: c.told.slice(), renewals: seat.renewals || 0, said: c.answers.map(a => a.json && a.json.error) };
    c.ch.kick();
    await c.ch.idle();
    here.second = keyHellos(c).length;
    here.toldAfter = c.told.slice();
    await c.ch.stop();
    const text = coreBefore();
    if (text === null) return { ok: false, detail: "the fixture is not the bytes captured from " + BEFORE.from };
    const old = coreFrom(text), ADOPT = ["createCore", "judgeCreate", "grantWhy", "grantOk", "judgeLead"], kept = {};
    let there = null;
    for (const k of ADOPT) { kept[k] = C[k]; C[k] = old[k]; }
    try {
      const o = await team({});
      const oseat = failing(o, "a"), oc = deskChannel(o, "a", oseat, mod);
      await cycleOf(oc);
      const nc = deskChannel(o, "b", {}, mod);
      await cycleOf(nc);
      there = { online: oc.ch.online(), sent: keyHellos(oc).map(carries), renewals: oseat.renewals || 0, sameAsNone: JSON.stringify(oc.answers) === JSON.stringify(nc.answers) && nc.ch.online() };
      await oc.ch.stop();
      await nc.ch.stop();
    } finally { for (const k of ADOPT) C[k] = kept[k]; }
    const ok = !here.online && here.sent[0] === "seat" && here.renewals >= 1 && here.said[0] === "seat-lapsed" && here.told.join() === "refused"
      && here.second >= 2 && here.toldAfter.join() === "refused" && there.online && there.sent.join() === "seat" && there.renewals >= 1 && there.sameAsNone;
    return { ok, detail: brief({ thisRelay: here, beforeSeats: there }) };
  }
  /* A renewal that never answers, or answers late: the hello waits for it at most seatRenewMs (here a tenth of a second where the product's is
     thirty), then goes with the certificate in hand and the cycle ends, the channel not stuck; the late answer decides nothing already
     done and is the certificate the next hello reads; one that answers in time is used as it always was; the option is read only as a
     positive whole number. Each scene is held to a guard of its own, so a wait without end is a red leg and not a hung suite. */
  const guarded = (ms, work) => new Promise(done => { const t = setTimeout(() => done({ stuck: true }), ms); work().then(v => { clearTimeout(t); done(v); }, e => { clearTimeout(t); done({ threw: String(e && e.message || e) }); }); });
  const nap = ms => new Promise(r => setTimeout(r, ms));
  const aged = w => certFor(w.desks.a.pub, w.licence, w.R.clock.now - 8 * DAY, 7 * DAY);
  async function deskRenewHangsScene(mod) {
    const w = await team({});
    const old = aged(w), seat = { cert: old, renewMs: 100, hold: () => new Promise(() => {}) }, c = deskChannel(w, "a", seat, mod);
    const t0 = Date.now();
    const cycle = await guarded(5000, async () => { await cycleOf(c); return { done: true }; });
    const took = Date.now() - t0;
    if (!cycle.done) return { ok: false, detail: brief({ stuck: !!cycle.stuck, threw: cycle.threw, hellos: c.bodies.length }) };
    const first = c.bodies[0];
    const here = { online: c.ch.online(), sent: keyHellos(c).map(carries), sentOld: !!first && !!first.seat && first.seat.issued === old.issued, told: c.told.slice(), renewals: seat.renewals || 0, took };
    c.ch.kick();
    const again = await guarded(5000, async () => { await c.ch.idle(); return { done: true }; });
    here.second = keyHellos(c).length;
    here.notStuck = !!again.done;
    if (again.done) await c.ch.stop();
    const ok = !here.online && here.sent[0] === "seat" && here.sentOld && here.told.join() === "refused" && here.renewals >= 1 && took >= 90 && took < 4000 && here.notStuck && here.second >= 2;
    return { ok, detail: brief(here) };
  }
  async function deskRenewLateScene(mod) {
    const w = await team({});
    const old = aged(w), fresh = certFor(w.desks.a.pub, w.licence, w.R.clock.now, 7 * DAY);
    const seat = { cert: old, renewMs: 100, hold: () => nap(500), renew: () => fresh };
    const c = deskChannel(w, "a", seat, mod);
    const first = await guarded(5000, async () => { await cycleOf(c); return { done: true }; });
    if (!first.done) return { ok: false, detail: brief({ stuck: !!first.stuck, threw: first.threw }) };
    const row = { online: c.ch.online(), sentOld: !!c.bodies[0] && !!c.bodies[0].seat && c.bodies[0].seat.issued === old.issued, told: c.told.slice() };
    for (let i = 0; i < 50 && seat.cert !== fresh; i++) await nap(100);
    row.lateTaken = seat.cert === fresh;
    c.ch.kick();
    await c.ch.idle();
    const last = c.bodies[c.bodies.length - 1];
    row.nextOnline = c.ch.online();
    row.nextSentFresh = !!last && !!last.seat && last.seat.issued === fresh.issued;
    row.toldAfter = c.told.slice();
    await c.ch.stop();
    /* A renewal that answers in time, well inside a long bound: used as ever, the one hello carrying the new certificate. */
    const o = await team({});
    const nowSeat = { cert: aged(o), renewMs: 5000, hold: () => nap(30), renew: () => certFor(o.desks.a.pub, o.licence, o.R.clock.now, 7 * DAY) };
    const oc = deskChannel(o, "a", nowSeat, mod);
    const t0 = Date.now();
    const quick = await guarded(5000, async () => { await cycleOf(oc); return { done: true }; });
    const inTime = { done: !!quick.done, online: oc.ch.online(), renewals: nowSeat.renewals || 0, carriesNew: !!oc.bodies[0] && !!oc.bodies[0].seat && oc.bodies[0].seat.issued === o.R.clock.now, took: Date.now() - t0 };
    if (quick.done) await oc.ch.stop();
    const ok = !row.online && row.sentOld && row.told[0] === "refused" && row.lateTaken && row.nextOnline && row.nextSentFresh && row.toldAfter.join() === "refused,open"
      && inTime.done && inTime.online && inTime.renewals === 1 && inTime.carriesNew && inTime.took < 3000;
    return { ok, detail: brief({ late: row, inTime }) };
  }
  /* The option is read only as a positive whole number: the delay the channel asks its timer for, recorded through the global timer
     while a renewal that answers at once is waited on, is the option where it is one and thirty seconds where it is anything else
     (absent, zero, negative, fractional, text, infinite), and the timer is cleared where the renewal answered first. */
  async function deskRenewOptionScene(mod) {
    const rows = {}, realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
    for (const [name, value, want] of [["100", 100, 100], ["absent", undefined, 30000], ["zero", 0, 30000], ["negative", -5, 30000], ["fraction", 1.5, 30000],
      ["text", "100", 30000], ["infinite", Infinity, 30000], ["nan", NaN, 30000]]) {
      const w = await team({}), seat = { cert: aged(w), hold: () => nap(5), renew: () => certFor(w.desks.a.pub, w.licence, w.R.clock.now, 7 * DAY) };
      if (value !== undefined) seat.renewMs = value;
      const asked = [], cleared = [];
      globalThis.setTimeout = (fn, ms, ...rest) => { const t = realSet(fn, ms, ...rest); if (ms === 100 || ms === 30000) asked.push({ ms, t }); return t; };
      globalThis.clearTimeout = t => { cleared.push(t); return realClear(t); };
      let c = null;
      try { c = deskChannel(w, "a", seat, mod); await cycleOf(c); } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
      const mine = asked.filter(a => a.ms === want);
      rows[name] = { asked: asked.map(a => a.ms), clearedOnAnswer: mine.length > 0 && mine.every(a => cleared.indexOf(a.t) >= 0), opened: c.ch.online() };
      await c.ch.stop();
    }
    const ok = Object.values(rows).every(r => r.asked.length > 0 && r.clearedOnAnswer && r.opened) && rows["100"].asked.every(ms => ms === 100)
      && Object.keys(rows).filter(k => k !== "100").every(k => rows[k].asked.every(ms => ms === 30000));
    return { ok, detail: brief(rows) };
  }
  await leg("d4a", () => deskRefusedRenewsScene(), "a desk whose current certificate the relay refuses (its service key revoked) renews once and opens with the new one on the same challenge; a renewal bringing the same certificate is not sent again");
  await leg("d1a", () => deskFirstScene(), "the desk sends its certificate from the first hello on every team: on an Entra team its one hello carries it and opens, on an ordinary team its first hello carries it and opens, and a desk holding none sends none and is refused, the shell told");
  await leg("d2a", () => deskRenewsScene(), "a desk whose certificate has run out renews before its session, once, and the session carries the new certificate and opens");
  await leg("d3a", () => deskToldScene(), "a removed person's desk is refused, the shell is told refused once over two cycles, and open once the desk holds a new certificate");
  await leg("d5a", () => deskInviteScene(), "an invitation's hello carries the certificate on an ordinary and an Entra team against the relay as it stands, opens the invitation's session and marks the token spent");
  await leg("d6a", () => deskInviteRefusedScene(), "the relay asking the invitation's hello for a seat: a refused certificate is renewed and sent again on the same challenge, the token marked only once a session opened; a refusal the renewal cannot mend leaves the token unmarked and unspent and the invitation not ended, the shell told refused, then open when the desk joins on the same invitation");
  await leg("d7a", () => deskResumeScene(), "the resume of a bound invitation carries the certificate and opens, and a certificate the relay refuses is renewed and the resume sent again on the same challenge, and opens");
  await leg("d8a", () => harmlessScene(), "a key hello, an invitation's hello, a bound resume and a door request by desks holding certificates answer and store exactly as by desks holding none, over the relay before the ordinary arm and over the core before seats, and open all four over this relay; a relay refusing the field would be seen");
  await leg("d9a", () => deskRenewFailsScene(), "a desk whose run-out certificate's renewal fails still sends its hello with that certificate and ends its cycle: over the core before seats it opens exactly as a desk holding none; over this relay it is refused seat-lapsed, the shell told refused once, and the next cycle says hello again");
  await leg("d10a", () => deskRenewHangsScene(), "a desk whose renewal never answers waits for it only the bound, then sends its hello with the certificate in hand and ends its cycle, and the next cycle says hello again: the channel is not stuck");
  await leg("d10b", () => deskRenewLateScene(), "a renewal answering after the bound decides nothing already done: the first hello went with the certificate in hand, the late certificate is what the next hello carries and opens with; a renewal answering in time is used, its one hello carrying the new certificate");
  await leg("d10c", () => deskRenewOptionScene(), "the renewal's bound is the option where it is a positive whole number of milliseconds and thirty seconds otherwise, and its timer is cleared where the renewal answered first");
  const PRODUCT_CH = path.join(ROOT, "shell", "relay", "channel.cjs");
  /* `tag` a plant line to lift, or {name, edits: [[from, to]]}, a planted fault whose `from` is found once in the channel. */
  async function liftedChannel(tag, fn) {
    const digest = sha(fs.readFileSync(PRODUCT_CH));
    let turned = false, detail = "plant line absent";
    try {
      const text = fs.readFileSync(PRODUCT_CH, "utf8"), lines = text.split(/\n/);
      let copy = null;
      if (typeof tag === "object") copy = text.split(tag.edits[0][0]).length === 2 ? text.replace(tag.edits[0][0], () => tag.edits[0][1]) : null;
      else {
        const at = lines.findIndex(l => l.indexOf("/* plant:" + tag + " */") >= 0);
        if (at >= 0) { lines.splice(at, 1); copy = lines.join("\n"); }
      }
      if (copy !== null) {
        const dir = copyOf({ "shell/relay/channel.cjs": copy, "shell/relay/blob.cjs": forwardTo(PRODUCT.blob) });
        const r = await safe(() => fn(require(path.join(dir, "shell", "relay", "channel.cjs"))));
        turned = r.ok !== true;
        detail = turned ? "the check lifted" : "the check still held";
      }
    } catch (e) { detail = e && e.stack ? e.stack.split("\n")[0] : String(e); }
    return { turned, back: sha(fs.readFileSync(PRODUCT_CH)) === digest, detail };
  }
  for (const [tag, id, scene, what] of [
    ["seat-first", "d1a", deskFirstScene, "the first hello goes without the certificate in hand, and the desk learns by refusal"],
    ["seat-first", "d7a", deskResumeScene, "the resume of a bound invitation goes without the certificate"],
    ["seat-retry", "d4a", deskRefusedRenewsScene, "a refused certificate is never renewed and sent again"],
    ["seat-retry", "d6a", deskInviteRefusedScene, "an invitation's hello refused for its seat is never sent again"],
    ["seat-renew-first", "d2a", deskRenewsScene, "a run-out certificate is sent unrenewed"],
    ["seat-told", "d3a", deskToldScene, "the shell is never told"],
    ["seat-renew-refused", "d4a", deskRefusedRenewsScene, "a refused current certificate is never renewed"],
    ["invite-seat", "d5a", deskInviteScene, "the invitation's hello goes without the certificate"],
    ["token-kept", "d6a", deskInviteRefusedScene, "an invitation's hello refused for its seat marks the token used"],
    ["seat-bound", "d10a", deskRenewHangsScene, "the hello waits without end for a renewal that never answers"],
    ["seat-bound", "d10b", deskRenewLateScene, "the hello waits for a late renewal and goes with its certificate, not the one in hand"],
    [{ name: "a failed renewal let out of seatNow", edits: [["} catch { /* the certificate in hand goes */ }", "} finally { /* planted: a failure is not caught */ }"]] },
      "d9a", deskRenewFailsScene, "the renewal's failure stops the hello"],
  ]) {
    const line = "p " + id + (typeof tag === "object" ? " planting " + tag.name : " lifting plant:" + tag) + " in a copy of shell/relay/channel.cjs turns " + id + " red (" + what + "), and the product file is never written";
    if (plantSkipped(tag)) { skip(line); continue; }
    const p = await liftedChannel(tag, scene);
    check(results[id] && results[id].ok === true && p.turned && p.back, line + ": " + p.detail + ", sha " + (p.back ? "unchanged" : "CHANGED"));
  }
  /* s12b ("main's core does not name seats") is retired with the fixture: its alarm, that the relay and the service might be
     deployed in the wrong order, is now the landing plan's deploy order and the deploy's own legs. O1 leans on main's core still. */
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
