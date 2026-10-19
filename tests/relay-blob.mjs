/* The relay's blob rules, shell/relay/blob.cjs, held to relay/test/target-contract.md: the bytes and each size step's
 * edge, a blob that does not open once moved, the upload signature apart from the desk file's, the counter and rev
 * floors, every bad path, the writer's place, the limits, the reasons word for word, and no throw on hostile input.
 *
 *     node tests/relay-blob.mjs        exit code is the number of failed checks, capped at 63; 78 where it did not complete
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 63;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const hex = n => crypto.randomBytes(n).toString("hex");
function keyPair(keyId) {
  const p = crypto.generateKeyPairSync("ed25519");
  return { keyId, public: p.publicKey.export({ type: "spki", format: "der" }).subarray(SPKI.length).toString("hex"),
    privateKey: p.privateKey };
}
const pubKey = h => crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(h, "hex")]), format: "der", type: "spki" });
const flip = (buf, i) => { const b = Buffer.from(buf); b[i] ^= 1; return b; };
const throwsOf = fn => { try { fn(); return false; } catch { return true; } };

function liftBlob(tag, fn) {
  const src = path.join(ROOT, "shell", "relay", "blob.cjs");
  const beforeBytes = fs.readFileSync(src);
  const digest = crypto.createHash("sha256").update(beforeBytes).digest("hex");
  let turned = false, detail = "plant line absent";
  try {
    const lines = beforeBytes.toString("utf8").split(/\n/);
    const at = lines.findIndex(l => l.indexOf(tag) >= 0);
    if (at >= 0) {
      lines.splice(at, 1);
      fs.writeFileSync(src, lines.join("\n"));
      const resolved = require.resolve(src);
      delete require.cache[resolved];
      turned = fn(require(src));
      detail = turned ? "the check lifted" : "the check still held";
    }
  } catch (e) {
    detail = e && e.stack ? e.stack : String(e);
  } finally {
    fs.writeFileSync(src, beforeBytes);
    try { delete require.cache[require.resolve(src)]; require(src); } catch { /* the copy this suite holds is untouched */ }
  }
  return { turned, back: crypto.createHash("sha256").update(fs.readFileSync(src)).digest("hex") === digest, detail };
}

function main() {
  let B = null;
  try { B = require(path.join(ROOT, "shell", "relay", "blob.cjs")); }
  catch (e) { check(false, "0a shell/relay/blob.cjs loads - " + e.message); return; }

  const RT = hex(16), RT2 = hex(16);
  const KEY1 = crypto.randomBytes(32), KEY2 = crypto.randomBytes(32);
  const deskId = "k-" + hex(8), otherId = "k-" + hex(8);
  const lead = keyPair("lead-" + hex(4)), desk = keyPair(deskId), other = keyPair(otherId), stranger = keyPair("k-" + hex(8));
  const trust = { lead: { keyId: lead.keyId, public: lead.public },
    desks: [{ deskId, keyId: deskId, public: desk.public }, { deskId: otherId, keyId: otherId, public: other.public }] };
  const own = name => "desks/" + deskId + "/" + name;

  const seen = [];
  const note = r => { if (r && r.ok === false) seen.push(r); return r; };
  const sealAs = (writer, p, counter, extra) => B.seal(Object.assign({ relayTeamId: RT, epoch: 1, teamKey: KEY1, writer,
    path: p, body: "body " + counter, counter, kind: "file" }, extra || {}));
  const take = (blob, extra) => note(B.openBlob(Object.assign({ blob, relayTeamId: RT, epoch: 1, teamKey: KEY1, trust,
    counters: {} }, extra || {})));
  const refused = (r, reason) => !!r && r.ok === false && r.reason === reason && r.said === B.REASONS[reason]
    && r.served === false && r.path === undefined && r.body === undefined && r.counters === undefined;

  /* ---- 1: the bytes ---- */
  const ID = hex(16), SUP = hex(16);
  const fields = { relayTeamId: RT, epoch: 3, id: ID, supersedes: null, writerKeyId: deskId, counter: 7 };
  const wantAad = "etiuda-relay-blob\n" + RT + "\n3\n" + ID + "\n-\n" + deskId + "\n7\n";
  const aad = B.aadOf(fields), aadSup = B.aadOf(Object.assign({}, fields, { supersedes: SUP }));
  check(!!aad && aad.toString("utf8") === wantAad && !!aadSup && aadSup.toString("utf8") === wantAad.replace("\n-\n", "\n" + SUP + "\n"),
    "1a the associated data is the contract's seven lines, label, team, epoch, id, supersedes or -, writer, counter, each closed by a newline");
  const uncarried = [{ writerKeyId: "k-A" }, { writerKeyId: "k-a\nb" }, { epoch: 0 }, { counter: "7" }, { id: ID.toUpperCase() },
    { relayTeamId: RT.slice(2) }, { supersedes: "-" }, { epoch: 1.5 }].filter(x => B.aadOf(Object.assign({}, fields, x)) === null).length;
  check(uncarried === 8, "1b no associated data for a field it cannot carry: a capital or a newline in the writer, epoch 0, a counter"
    + " as text, a capital id, a short team, a supersedes of -, a fractional epoch: " + uncarried + " of 8");

  const framed = B.frame({ kind: "file", path: "guide.ec", body: "first edition" });
  const json = '{"kind":"file","path":"guide.ec","body":"first edition"}';
  check(framed.length === 4096 && framed.readUInt32BE(0) === json.length && framed.subarray(4, 4 + json.length).toString("utf8") === json
    && framed.subarray(4 + json.length).every(b => b === 0),
    "1c the frame is a big-endian u32 length, the JSON kind, path and body in that order, and zeros to the 4096 step");

  const s1 = sealAs(desk, own("in-use.ec"), 1, { body: "a" }), s2 = sealAs(desk, own("in-use.ec"), 2, { body: "abcdefghijklmnop" });
  const flat = JSON.stringify(Object.assign({}, s1, { ciphertext: s1.ciphertext.toString("latin1") }));
  check(s1.ciphertext.length === 4112 && s2.ciphertext.length === 4112 && s1.id !== s2.id && /^[0-9a-f]{32}$/.test(s1.id)
    && s1.nonce !== s2.nonce && /^[0-9a-f]{24}$/.test(s1.nonce) && /^[0-9a-f]{128}$/.test(s1.signature) && s1.deletion === false
    && s1.path === undefined && s1.body === undefined && flat.indexOf("in-use") < 0,
    "1d a sealed blob: two small bodies both 4112 bytes, a fresh 32-hex id and 12-byte nonce each, and no path or body in the clear");

  const upMsg = Buffer.concat([Buffer.from("etiuda-relay-upload\n", "utf8"), B.aadOf({ relayTeamId: RT, epoch: 1, id: s1.id,
    supersedes: null, writerKeyId: deskId, counter: 1 }), s1.ciphertext]);
  check(B.UPLOAD_PREFIX === "etiuda-relay-upload\n" && crypto.verify(null, upMsg, pubKey(desk.public), Buffer.from(s1.signature, "hex")),
    "1e the upload signature is Ed25519 over etiuda-relay-upload and a newline, the associated data, then the ciphertext itself");

  /* Each step's edge: a JSON that fills the step exactly, and one byte more, which takes the next. */
  const base = JSON.stringify({ kind: "file", path: "edge.ec", body: "" }).length;
  const edges = [];
  let edgeOk = true, top = null;
  for (let step = 4096; step <= 32 * 1024 * 1024; step *= 2) {
    for (const extra of [0, 1]) {
      const body = "e".repeat(step - 4 - base + extra);
      const blob = sealAs(lead, "edge.ec", 1, { body });
      const want = (extra ? 2 * step : step) + 16;
      if (step === 32 * 1024 * 1024 && extra) { top = blob; continue; }
      const r = take(blob);
      const fits = blob.ciphertext.length === want && r.ok === true && r.body === body;
      if (!fits) edgeOk = false;
      edges.push(step / 1024 + "K" + (extra ? "+1" : "") + (fits ? "" : " WRONG " + blob.ciphertext.length));
    }
  }
  check(edgeOk && edges.length === 27, "1f a round trip at each size step's edge, 4K to 32M, the frame filling its step and one byte"
    + " over it, each opening to its body: " + edges.length + " round trips" + (edgeOk ? "" : ": " + edges.join(", ")));
  const topTake = top ? take(top) : null;
  check(!!top && top.ciphertext.length === 64 * 1024 * 1024 + 16 && refused(B.checkBlobSize(top.ciphertext.length), "blob-size")
    && refused(topTake, "blob-size"),
    "1g one byte over the 32M step pads to 64M, over the 50M cap, refused as blob-size before it is opened");

  const padded = (fill, len, tail) => {
    const bytes = Buffer.isBuffer(fill) ? fill : Buffer.from(fill, "utf8");
    const b = Buffer.alloc(B.padStep(4 + bytes.length) + (tail || 0));
    b.writeUInt32BE(len === undefined ? bytes.length : len, 0); bytes.copy(b, 4); return b; };
  const good = '{"kind":"file","path":"a.ec","body":"x"}';
  const nonZero = padded(good); nonZero[4095] = 1;
  const firstPad = padded(good); firstPad[4 + Buffer.byteLength(good)] = 1;
  const badFrames = [nonZero, firstPad, padded("null"), padded("5"), padded(good, 5000), padded(good, undefined, 4096), padded(good.slice(0, -1)),
    padded('{"kind":"file","path":"a.ec","body":"x","x":1}'), padded('{"kind":"move","path":"a.ec","body":"x"}'),
    padded('{"kind":"delete","path":"a.ec","body":"x"}'), padded('{"kind":"file","path":1,"body":""}'),
    padded(Buffer.concat([Buffer.from('{"kind":"file","path":"a'), Buffer.from([0xff]), Buffer.from('.ec","body":""}')])),
    padded(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(good)])), Buffer.alloc(3)];
  const unread = badFrames.filter(b => { try { return B.unframe(b) === null; } catch { return false; } }).length;
  check(B.unframe(padded(good)) !== null && unread === badFrames.length, "1h a frame is read only whole, never throwing: a non-zero pad"
    + " byte, the last or the first, a JSON of null or 5, a length past the plaintext, a plaintext past its least step, a cut JSON, an extra key, another kind, a delete with a body, a path"
    + " not text, bytes not UTF-8, a byte order mark, three bytes: " + unread + " of " + badFrames.length + " unread, and the good one read");

  const sealThrows = [{ teamKey: KEY1.subarray(0, 31) }, { kind: "move" }, { path: 7 }, { writer: { keyId: "Lead", privateKey: lead.privateKey } },
    { epoch: 0 }, { place: "desk:" }, { body: Buffer.from("x") }, { writer: { keyId: lead.keyId, privateKey: "00" } },
    { writer: { keyId: lead.keyId, privateKey: crypto.generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey } },
    { writer: { keyId: lead.keyId, privateKey: crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey } }]
    .filter(x => throwsOf(() => sealAs(lead, "guide.ec", 1, x))).length;
  const pkcs8 = sealAs({ keyId: lead.keyId, privateKey: lead.privateKey.export({ type: "pkcs8", format: "der" }).toString("hex") }, "guide.ec", 1);
  check(sealThrows === 10 && take(pkcs8).ok === true, "1i seal throws on its own caller's fault, a 31-byte key, kind move, a path not"
    + " text, a capital in the key id, epoch 0, a bare desk place, a body as bytes, a key that is no key, an RSA key, a P-256 key: "
    + sealThrows + " of 10, and takes a PKCS8 key as hex");

  /* ---- 2: a blob moved does not open ---- */
  const kept = take(sealAs(lead, "guide.ec", 1, { body: "first edition" }));
  check(kept.ok === true && kept.kind === "file" && kept.path === "guide.ec" && kept.body === "first edition" && kept.role === "lead"
    && kept.counters && kept.counters["c\n" + lead.keyId + "\n1"] === 1,
    "2a the unmoved blob opens to its body at its path, and its counter is the floor to keep");
  const moved = (change, extra) => { const b = sealAs(lead, "guide.ec", 2, Object.assign({ body: "moved" }, extra || {})); change(b); return b; };
  check(refused(take(moved(b => { b.id = hex(16); })), "bad-signature"), "2b a blob moved to another id does not open");
  const teamMoved = moved(b => { b.relayTeamId = RT2; });
  const fetched = moved(b => { delete b.relayTeamId; }, { body: "fetched" });
  check(refused(take(teamMoved, { relayTeamId: RT2 }), "bad-signature") && refused(take(moved(() => {}), { relayTeamId: RT2 }), "bad-signature")
    && refused(take(teamMoved), "bad-signature") && take(fetched).ok === true,
    "2c a blob moved to another team does not open there, its team field rewritten or not, under the same key, nor at home with"
    + " its team field rewritten, and one handed without its team field opens as the pinned team's");
  check(refused(take(moved(b => { b.epoch = 2; }), { epoch: 2 }), "bad-signature"),
    "2d a blob moved to another epoch does not open, judged under that epoch's team file and the same key");
  check(refused(take(moved(b => { b.counter = 9; })), "bad-signature"), "2e a blob moved to another counter does not open");
  const supAdded = moved(b => { b.supersedes = SUP; }), supGone = moved(b => { b.supersedes = null; }, { supersedes: SUP });
  const supNew = moved(b => { b.supersedes = hex(16); }, { supersedes: SUP });
  check(refused(take(supAdded), "bad-signature") && refused(take(supGone), "bad-signature") && refused(take(supNew), "bad-signature"),
    "2f a supersedes added, removed or rewritten does not open");
  const g = sealAs(lead, "guide.ec", 2);
  const tamper = [Object.assign({}, g, { ciphertext: flip(g.ciphertext, 10) }), Object.assign({}, g, { ciphertext: flip(g.ciphertext, g.ciphertext.length - 1) }),
    Object.assign({}, g, { nonce: hex(12) }), Object.assign({}, g, { ciphertext: sealAs(lead, "guide.ec", 2).ciphertext })];
  check(tamper.every(b => refused(take(b), "bad-signature")) && take(g).ok === true,
    "2g a flipped ciphertext byte, a flipped tag byte, another nonce, another blob's ciphertext: none opens, and the blob itself does");
  const e2 = sealAs(desk, own("in-use.ec"), 1, { epoch: 2, teamKey: KEY2, body: "second epoch" });
  const e2Here = take(e2), e2There = take(e2, { epoch: 2, teamKey: KEY2 });
  check(refused(e2Here, "epoch") && e2There.ok === true && e2There.body === "second epoch",
    "2h a genuine blob of epoch 2 is refused as epoch under the epoch 1 team file, and opens under its own");
  const del = take(sealAs(desk, own("join.json"), 1, { kind: "delete", body: "ignored" }));
  check(del.ok === true && del.kind === "delete" && del.deleted === true && del.path === own("join.json") && del.body === undefined,
    "2i a deletion opens as a deletion of its path, with no body");

  /* ---- 3: the upload signature, and trust that is only the caller's ---- */
  const a3 = B.aadOf({ relayTeamId: RT, epoch: 1, id: ID, supersedes: null, writerKeyId: deskId, counter: 1 });
  const ct3 = crypto.randomBytes(4112);
  const sig3 = B.signUpload(desk.privateKey, a3, ct3);
  const sly = new Proxy({}, { getPrototypeOf() { throw new Error("x"); } });
  check(B.verifyUpload(desk.public, a3, ct3, sig3) === true && B.verifyUpload(other.public, a3, ct3, sig3) === false
    && B.verifyUpload(desk.public, flip(a3, 20), ct3, sig3) === false && B.verifyUpload(desk.public, a3, ct3, "") === false
    && B.verifyUpload(desk.public, a3, ct3, sig3.toUpperCase()) === false && B.verifyUpload(desk.public, a3, ct3, sig3 + "z") === false
    && B.verifyUpload(desk.public, sly, ct3, sig3) === false && B.verifyUpload(desk.public, a3, sly, sig3) === false,
    "3a an upload signature holds under its key and not under another, nor over a changed associated data, nor empty, in"
    + " capitals or with a trailing z, nor over associated data or a ciphertext whose prototype read throws");

  const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  const branch = (SRC.match(/^const BRANCH_PREFIX = "([a-z-]+)\\n";/m) || [])[1];
  const BRANCH = branch ? branch + "\n" : "";
  const asDesk = crypto.verify(null, Buffer.concat([Buffer.from(BRANCH, "utf8"), a3, ct3]), pubKey(desk.public), Buffer.from(sig3, "hex"));
  check(BRANCH === "etiuda-desk-branch\n" && asDesk === false,
    "3b an upload signature does not verify as a desk-file signature under the engine's BRANCH_PREFIX, read from shell/main.js");
  const deskDoc = Buffer.from('{"format":1,"kind":"etiuda-in-use","desk":"' + deskId + '"}', "utf8");
  const deskSig = crypto.sign(null, Buffer.concat([Buffer.from(BRANCH, "utf8"), deskDoc]), desk.privateKey).toString("hex");
  const deskHolds = crypto.verify(null, Buffer.concat([Buffer.from(BRANCH, "utf8"), deskDoc]), pubKey(desk.public), Buffer.from(deskSig, "hex"));
  check(deskHolds && B.verifyUpload(desk.public, Buffer.alloc(0), deskDoc, deskSig) === false,
    "3c a desk-file signature does not verify as an upload signature, and does hold as a desk file");
  const prefixes = [...new Set([...SRC.matchAll(/"(etiuda-[a-z-]+)\\n"/g)].map(m => m[1] + "\n"))];
  const clash = prefixes.concat([B.AAD_LABEL + "\n"]).filter(p => p !== B.UPLOAD_PREFIX
    ? p.startsWith(B.UPLOAD_PREFIX) || B.UPLOAD_PREFIX.startsWith(p) : true);
  check(prefixes.length >= 7 && prefixes.indexOf(BRANCH) >= 0 && clash.length === 0,
    "3d the upload prefix is no prefix of the engine's " + prefixes.length + " signed prefixes or the blob label, nor any of them of it"
    + (clash.length ? ": " + clash.map(JSON.stringify).join(", ") : ""));

  const forged = B.seal({ relayTeamId: RT, epoch: 1, teamKey: KEY1, writer: { keyId: deskId, privateKey: stranger.privateKey },
    path: own("in-use.ec"), body: "forged", counter: 1 });
  forged.publicKey = stranger.public;
  const strangerOwn = sealAs(stranger, "desks/" + stranger.keyId + "/join.json", 1);
  strangerOwn.publicKey = stranger.public;
  const twice = { lead: trust.lead, desks: trust.desks.concat([{ deskId: "k-" + hex(8), keyId: deskId, public: desk.public }]) };
  const badLead = { lead: { keyId: lead.keyId, public: "zz" + lead.public.slice(2) }, desks: trust.desks };
  const capsLead = { lead: { keyId: lead.keyId, public: lead.public.toUpperCase() }, desks: trust.desks };
  const longLead = { lead: { keyId: lead.keyId, public: lead.public + "z" }, desks: trust.desks };
  check(refused(take(forged), "bad-signature") && refused(take(strangerOwn), "not-roster")
    && refused(take(sealAs(desk, own("join.json"), 1), { trust: twice }), "not-roster")
    && refused(take(sealAs(lead, "guide.ec", 1), { trust: badLead }), "not-roster")
    && refused(take(sealAs(lead, "guide.ec", 1), { trust: capsLead }), "not-roster")
    && refused(take(sealAs(lead, "guide.ec", 1), { trust: longLead }), "not-roster"),
    "3e trust is the caller's: a desk's id signed by a stranger carrying its own key is bad-signature, a stranger's own id is"
    + " not-roster, and so is a key id the trust holds twice or under a public that is no key, in capitals or with a trailing z");

  /* ---- 4: the counter and rev floors ---- */
  let counters = {};
  const step = (blob, extra) => { const r = take(blob, Object.assign({ counters }, extra || {})); if (r.ok) counters = r.counters; return r; };
  const c1 = step(sealAs(desk, own("in-use.ec"), 1)), c1again = step(sealAs(desk, own("in-use.ec"), 1));
  const c3 = step(sealAs(desk, own("in-use.ec"), 3)), c2late = step(sealAs(desk, own("in-use.ec"), 2));
  const otherC1 = step(sealAs(other, "desks/" + otherId + "/in-use.ec", 1));
  const epoch2C1 = step(sealAs(desk, own("in-use.ec"), 1, { epoch: 2, teamKey: KEY2 }), { epoch: 2, teamKey: KEY2 });
  check(c1.ok && refused(c1again, "replay-counter") && c3.ok && refused(c2late, "replay-counter") && otherC1.ok && epoch2C1.ok,
    "4a a counter at or below its writer's floor is refused, above it kept, the floor one per writer and epoch, a new epoch from 1");
  const before = JSON.stringify(counters);
  const badAt5 = take(sealAs(desk, "../outside.ec", 5), { counters });
  const at5 = take(sealAs(desk, own("in-use.ec"), 5), { counters });
  check(refused(badAt5, "bad-path") && at5.ok === true && JSON.stringify(counters) === before,
    "4b a refusal raises nothing: a bad path at counter 5 leaves 5 to the next file, and the caller's map is never written");
  const saved = JSON.parse(JSON.stringify(counters));
  check(refused(take(sealAs(desk, own("in-use.ec"), 3), { counters: saved }), "replay-counter")
    && take(sealAs(desk, own("in-use.ec"), 4), { counters: saved }).ok === true,
    "4c the floor kept as JSON across a restart still refuses the replay and keeps the next");
  counters = {};
  const d1 = step(sealAs(desk, own("join.json"), 1)), d2 = sealAs(desk, own("join.json"), 2, { kind: "delete" });
  const d2r = step(d2), d3 = step(sealAs(desk, own("join.json"), 3)), d2again = step(d2);
  check(d1.ok && d2r.ok && d2r.deleted === true && d3.ok && refused(d2again, "replay-counter"),
    "4d a deletion keeps the same floor: replayed after a later write, it is refused");
  const ck = "c\n" + deskId + "\n1";
  const corrupt = ["x", -1, 1.5, null, {}, NaN].filter(v => refused(take(sealAs(desk, own("in-use.ec"), 9), { counters: { [ck]: v } }), "replay-counter")).length;
  const proto = JSON.parse('{"__proto__":{"c\\n' + deskId + '\\n1":99},"c\\nk-zz\\n1":"x"}');
  const protoTake = take(sealAs(desk, own("in-use.ec"), 1), { counters: proto });
  const t0 = { teamId: "t-" + hex(8), leadKeyId: lead.keyId, epoch: 1, rev: 1 };
  const rk0 = "r\n" + t0.teamId + "\n" + t0.leadKeyId + "\n1";
  const given = { [ck]: 5 };
  const same = m => JSON.stringify(m) === JSON.stringify(given);
  const floorEdges = [
    take(sealAs(desk, own("in-use.ec"), 1), { counters: { [ck]: 0 } }).ok === true,
    B.revLoad({ [rk0]: 0 }, t0).ok === true, B.revCurrent({ [rk0]: 0 }, t0).ok === true,
    B.raiseCounter({ [ck]: 5 }, deskId, 1, 3)[ck] === 5, B.raiseCounter({ [ck]: "x" }, deskId, 1, 9)[ck] === "x",
    same(B.raiseCounter(given, deskId, 1, 1.5)), same(B.raiseCounter(given, "K-A", 1, 9)), same(B.raiseCounter(given, deskId, 0, 9)),
    ...[[deskId, 1, 1.5], [deskId, 1, "7"], [deskId, 1, Infinity], ["K-A", 1, 1], [deskId, 0, 1]]
      .map(([w, e, c]) => refused(note(B.counterFresh({}, w, e, c)), "replay-counter"))];
  const edgesHeld = floorEdges.filter(Boolean).length;
  check(corrupt === 6 && refused(take(sealAs(desk, own("in-use.ec"), 9), { counters: "x" }), "replay-counter")
    && protoTake.ok === true && !Object.prototype.hasOwnProperty.call(protoTake.counters, "__proto__") && edgesHeld === floorEdges.length,
    "4e a floor that is not a count fails closed (" + corrupt + " of 6), a map that is not a map too, and a key named __proto__ is no"
    + " floor; at the edges a floor of 0 takes counter 1 and rev 1, a raise never lowers a floor nor overwrites a corrupt one, and a"
    + " counter, writer or epoch that is no count or id raises nothing and is replay-counter: " + edgesHeld + " of " + floorEdges.length);
  const team = { teamId: "t-" + hex(8), leadKeyId: lead.keyId, epoch: 1 };
  let revs = {};
  const load = rev => { const r = note(B.revLoad(revs, Object.assign({}, team, rev))); if (r.ok) revs = r.revs; return r; };
  const r2 = load({ rev: 2 }), r2again = load({ rev: 2 }), r1 = load({ rev: 1 }), r3 = load({ rev: 3 });
  const rEpoch = load({ rev: 1, epoch: 2 }), rLead = load({ rev: 1, leadKeyId: "lead-" + hex(4) });
  const rSaved = note(B.revLoad(JSON.parse(JSON.stringify(revs)), Object.assign({}, team, { rev: 3 })));
  check(r2.ok && refused(r2again, "replay-rev") && refused(r1, "replay-rev") && r3.ok && rEpoch.ok && rLead.ok && refused(rSaved, "replay-rev"),
    "4f a team file at or below its rev floor is refused on load, the floor one per team, lead key and epoch, kept as JSON");
  check(B.revCurrent(revs, Object.assign({}, team, { rev: 3 })).ok === true && B.revCurrent(revs, Object.assign({}, team, { rev: 4 })).ok === true
    && refused(note(B.revCurrent(revs, Object.assign({}, team, { rev: 2 }))), "replay-rev"),
    "4g a blob is judged under the team file at its floor or above, and one below it is replay-rev");

  const omitted = [refused(take(sealAs(desk, own("in-use.ec"), 1), { counters: undefined }), "replay-counter"),
    refused(take(sealAs(desk, own("in-use.ec"), 1), { counters: null }), "replay-counter"),
    ...[undefined, null].map(m => refused(note(B.counterFresh(m, deskId, 1, 1)), "replay-counter")),
    ...[undefined, null].map(m => refused(note(B.revLoad(m, t0)), "replay-rev")),
    ...[undefined, null].map(m => refused(note(B.revCurrent(m, t0)), "replay-rev"))].filter(Boolean).length;
  check(omitted === 8 && B.counterFresh({}, deskId, 1, 1).ok === true && B.revLoad({}, t0).ok === true,
    "4h an omitted floor map fails closed: a blob opened without its counters, or with null, is replay-counter, and counterFresh,"
    + " revLoad and revCurrent without a map refuse; a first run passes {} and is taken: " + omitted + " of 8");

  /* An older epoch than one already kept for the same team and lead key is replay-rev, whatever its rev. The same-epoch
     floor, a higher epoch starting at rev 1, and another lead's epoch 1 are unchanged. */
  {
    const base = { teamId: "t-" + hex(8), leadKeyId: lead.keyId };
    let kept = {};
    const first = note(B.revLoad(kept, Object.assign({ epoch: 1, rev: 1 }, base)));
    kept = first.ok ? first.revs : kept;
    const newer = note(B.revLoad(kept, Object.assign({ epoch: 2, rev: 1 }, base)));
    kept = newer.ok ? newer.revs : kept;
    const before = JSON.stringify(kept);
    const back = note(B.revLoad(kept, Object.assign({ epoch: 1, rev: 2 }, base)));
    check(first.ok === true && newer.ok === true && refused(back, "replay-rev") && !back.revs && JSON.stringify(kept) === before,
      "4m a team file of an older epoch than one already loaded is replay-rev whatever its rev, and that load raises nothing: "
      + [first.ok, newer.ok, back.reason || back.ok].join(" ") + ", map " + (JSON.stringify(kept) === before ? "unchanged" : "raised"));
    const atFloor = B.revCurrent(kept, Object.assign({ epoch: 2, rev: 1 }, base));
    const above = B.revCurrent(kept, Object.assign({ epoch: 2, rev: 4 }, base));
    const higher = note(B.revLoad(kept, Object.assign({ epoch: 3, rev: 1 }, base)));
    const highRevs = higher.ok ? higher.revs : kept;
    const same = note(B.revLoad(highRevs, Object.assign({ epoch: 3, rev: 1 }, base)));
    const otherLead = note(B.revLoad(highRevs, { teamId: base.teamId, leadKeyId: "lead-" + hex(4), epoch: 1, rev: 1 }));
    check(higher.ok === true && refused(same, "replay-rev") && atFloor.ok === true && above.ok === true && otherLead.ok === true,
      "4n the same-epoch floor stays, a higher epoch still starts at rev 1, the floor still judges a blob, and another lead's"
      + " epoch 1 is its own: higher " + higher.ok + ", same " + (same.reason || same.ok) + ", at floor " + atFloor.ok
      + ", above " + above.ok + ", other lead " + otherLead.ok);
    const olderNow = note(B.revCurrent(highRevs, Object.assign({ epoch: 1, rev: 9 }, base)));
    const olderLoad = note(B.revLoad(highRevs, Object.assign({ epoch: 1, rev: 9 }, base)));
    check(olderNow.ok === true && refused(olderLoad, "replay-rev") && !olderLoad.revs,
      "4p an older epoch is not loaded, and a blob is still judged under that epoch at its own floor: judged "
      + (olderNow.reason || olderNow.ok) + ", load " + (olderLoad.reason || olderLoad.ok));
  }

  /* plant:epoch-above. Deleting that line, leaving the file valid script, lets an older epoch load again. The same-epoch
     floor still refuses. */
  {
    const src = path.join(ROOT, "shell", "relay", "blob.cjs");
    const before = fs.readFileSync(src);
    const digest = crypto.createHash("sha256").update(before).digest("hex");
    let turned = false, detail = "plant line absent";
    try {
      const lines = before.toString("utf8").split(/\n/);
      const at = lines.findIndex(l => l.indexOf("plant:epoch-above") >= 0);
      if (at >= 0) {
        lines.splice(at, 1);
        fs.writeFileSync(src, lines.join("\n"));
        const resolved = require.resolve(src);
        delete require.cache[resolved];
        const lifted = require(src);
        const base = { teamId: "t-" + hex(8), leadKeyId: lead.keyId };
        const first = lifted.revLoad({}, Object.assign({ epoch: 2, rev: 1 }, base));
        const back = first.ok ? lifted.revLoad(first.revs, Object.assign({ epoch: 1, rev: 4 }, base)) : first;
        const same = first.ok ? lifted.revLoad(first.revs, Object.assign({ epoch: 2, rev: 1 }, base)) : first;
        turned = first.ok === true && back.ok === true && same.ok === false && same.reason === "replay-rev";
        detail = "epoch 2 " + first.ok + ", older epoch " + (back.ok === true ? "taken" : (back.reason || back.ok))
          + ", same epoch " + (same.reason || same.ok);
      }
    } catch (e) {
      detail = e && e.message ? e.message : String(e);
    } finally {
      fs.writeFileSync(src, before);
      try {
        const resolved = require.resolve(src);
        delete require.cache[resolved];
        require(src);
      } catch { /* the copy this suite holds is untouched */ }
    }
    const restored = crypto.createHash("sha256").update(fs.readFileSync(src)).digest("hex") === digest;
    check(turned && restored,
      "4q lifting plant:epoch-above lets an older epoch load again, the same-epoch floor still refuses, and the file is put back: "
      + detail + ", sha " + (restored ? "restored" : "differs"));
  }

  /* ---- 5: every bad path, refused before anything is written ---- */
  /* Each rule's id opens its own line, so tests/leg-ids.js reads it. */
  const RULES = [[
    "5a a .. segment", ["../outside.ec", "notes/../../outside.ec", "notes/..", ".."]], [
    "5b a drive", ["C:/outside.ec", "c:outside.ec", "Z:"]], [
    "5c a colon anywhere else, a stream", ["notes.ec:hidden", "notes/a:b.ec", "x:"]], [
    "5d a leading /", ["/outside.ec", "//host/share/outside.ec"]], [
    "5e a leading backslash", ["\\outside.ec", "\\\\host\\share\\outside.ec"]], [
    "5f any backslash", ["..\\outside.ec", "sub\\..\\..\\x", "notes\\x.ec"]], [
    "5g an empty segment or no file at all", ["a//b.ec", "notes/", "", ".", "./.", "./"]], [
    "5h a control or Windows-forbidden character", ["a\u0000b.ec", "a\nb.ec", "a\u001fb.ec", "a<b", "a>b", "a\"b", "a|b", "a?b", "a*b"]], [
    "5i a segment ending in a dot or a space, or a device name", ["desks./" + deskId + "/in-use.ec", "notes /x.ec", "guide.ec.",
      "nul", "con.ec", "notes/COM1", "lpt9.json"]],
  ];
  let n5 = 10, pc = {};
  for (const [label, paths] of RULES) {
    const direct = paths.filter(p => refused(B.checkPath(p), "bad-path")).length;
    const sealed = paths.filter(p => refused(take(sealAs(lead, p, n5), { counters: pc }), "bad-path")).length;
    const next = take(sealAs(lead, "notes.ec", n5), { counters: pc });
    if (next.ok) pc = next.counters;
    check(direct === paths.length && sealed === paths.length && next.ok === true,
      label + " is bad-path, alone and sealed in a genuine blob, and the next file at the same counter is kept: "
      + direct + " and " + sealed + " of " + paths.length);
    n5++;
  }
  const notText = [null, undefined, 7, {}, ["guide.ec"], Buffer.from("guide.ec")].filter(p => refused(B.checkPath(p), "bad-path")).length;
  check(notText === 6, "5j a path that is not text is bad-path: " + notText + " of 6");
  const plain = [["guide.ec", "guide.ec"], ["catalog-asks/" + deskId + ".json", "catalog-asks/" + deskId + ".json"], ["./guide.ec", "guide.ec"],
    ["notes/./deep/x.ec", "notes/deep/x.ec"], ["Przewodnik zespo\u0142u.ec", "Przewodnik zespo\u0142u.ec"], [".notes", ".notes"]];
  const plainOk = plain.filter(([p, at]) => { const r = B.checkPath(p); return r.ok === true && r.path === at; }).length;
  check(plainOk === plain.length, "5k an ordinary path is kept, a . segment dropped and its case and letters kept: " + plainOk + " of " + plain.length);

  /* ---- 6: the writer's place ---- */
  const leadIn = ["guide.ec", "etiuda-team.json", "catalog-asks/" + deskId + ".json",
    "de\u017fks/" + deskId + "/in-use.ec"].filter(p => take(sealAs(lead, p, 1)).ok).length;
  const leadOut = [own("notes.ec"), "Desks/" + deskId + "/in-use.ec", "./desks/" + deskId + "/in-use.ec", "DESKS/x.ec",
    "desks"].filter(p => refused(take(sealAs(lead, p, 1)), "outside-place")).length;
  check(leadIn === 4 && leadOut === 5, "6a the lead writes anywhere but desks/, which is desks/ in any case, after a . segment,"
    + " or as a bare name, and a long s is a different folder: " + leadIn + " of 4 in, " + leadOut + " of 5 outside-place");
  const lands = [[own("join.json"), own("join.json")], ["Desks/" + deskId + "/in-use.ec", own("in-use.ec")],
    ["./desks/" + deskId.toUpperCase() + "/x.ec", own("x.ec")]].filter(([p, at]) => { const r = take(sealAs(desk, p, 1)); return r.ok && r.path === at; }).length;
  const deskOut = ["guide.ec", "desks/" + otherId + "/join.json", "desks/" + deskId + "x/join.json", "desks/" + deskId]
    .filter(p => refused(take(sealAs(desk, p, 1)), "outside-place")).length;
  const roleOut = [B.placeOf(own("a.ec"), { role: "guest", deskId }, "file"), B.placeOf("desks/bad id/a.ec", { role: "desk", deskId: "BAD ID" }, "file")]
    .filter(r => refused(note(r), "outside-place")).length;
  check(lands === 3 && deskOut === 4 && roleOut === 2, "6b a desk writes under desks/<its id>/ alone, landing under its id as the roster"
    + " spells it: " + lands + " of 3 landed, and the root, another desk, a longer id and the bare folder " + deskOut + " of 4"
    + " outside-place, as is a role of another kind and a desk id that is no id: " + roleOut + " of 2");
  check(refused(take(sealAs(other, own("join.json"), 1, { kind: "delete" })), "forged-delete")
    && refused(take(sealAs(lead, own("join.json"), 1, { kind: "delete" })), "forged-delete")
    && refused(take(sealAs(desk, "guide.ec", 1, { kind: "delete" })), "forged-delete"),
    "6c a deletion outside its writer's place, by another desk, by the lead or of the lead's file, is forged-delete");

  /* ---- 7: the limits ---- */
  check(B.BLOB_MAX === 50 * 1024 * 1024 && B.TEAM_MAX === 1024 * 1024 * 1024 && B.RATE_MAX === 60 && B.RATE_WINDOW_MS === 60000,
    "7a the limits are the contract's: 50 MiB a blob, 1 GiB a team, 60 uploads in a sliding 60 000 ms");
  const sizesBad = [B.BLOB_MAX + 1, -1, 1.5, NaN, "1"].filter(v => refused(note(B.checkBlobSize(v)), "blob-size")).length;
  const atCap = take(Object.assign({}, sealAs(desk, own("in-use.ec"), 1), { ciphertext: Buffer.alloc(B.BLOB_MAX) }));
  check(B.checkBlobSize(B.BLOB_MAX).ok === true && B.checkBlobSize(0).ok === true && sizesBad === 5 && refused(atCap, "bad-signature"),
    "7b a blob of 50 MiB passes, and so does 0, and one byte more is blob-size, as is a size that is no size: " + sizesBad + " of 5;"
    + " a ciphertext of exactly 50 MiB is opened as far as its shape and is bad-signature, not blob-size");
  const teamOk = B.checkTeamSize(10, 5, 15), teamDefault = B.checkTeamSize(0, B.TEAM_MAX);
  const teamBad = [[10, 6, 15], [1, B.TEAM_MAX, undefined], [-1, 1, 15], [1, NaN, 15]].filter(a => refused(note(B.checkTeamSize(...a)), "team-size")).length;
  check(teamOk.ok && teamOk.used === 15 && teamDefault.ok && teamBad === 4, "7c the team cap is reached and not passed: at the cap passes,"
    + " one byte over and a count that is no count are team-size: " + teamBad + " of 4");
  const now = 1000000;
  const sixty = Array.from({ length: 60 }, (_, i) => now - 59999 + i * 1000);
  const r61 = note(B.checkRate(sixty, now)), r60 = B.checkRate(sixty.slice(1), now);
  const edge = B.checkRate([now - 60000].concat(sixty.slice(1)), now), slid = B.checkRate(sixty, now + 60000);
  const noClock = [NaN, Infinity].flatMap(c => [sixty, []].map(s => refused(note(B.checkRate(s, c)), "rate"))).filter(Boolean).length;
  check(refused(r61, "rate") && r60.ok && r60.stamps.length === 60 && r60.stamps[59] === now && edge.ok && slid.ok && noClock === 4,
    "7d the 61st upload in the window is rate, the 60th passes, a stamp 60 000 ms old has left the window, and a clock of NaN or"
    + " Infinity is rate with sixty stamps or none: " + noClock + " of 4");

  /* ---- 8: the reasons, word for word ---- */
  const contract = fs.readFileSync(path.join(ROOT, "relay", "test", "target-contract.md"), "utf8").replace(/\r\n/g, "\n");
  const section = (contract.split(/\n## /).find(s => s.startsWith("Reasons\n")) || "");
  const rows = [...section.matchAll(/^\| `([a-z-]+)` \| (.+?) \|$/gm)].map(m => [m[1], m[2]]);
  const mine = Object.entries(B.REASONS);
  check(rows.length >= 24 && JSON.stringify(rows) === JSON.stringify(mine) && Object.isFrozen(B.REASONS),
    "8a the reasons and their sentences are the contract's Reasons table word for word and in its order: " + mine.length
    + " against " + rows.length + " rows");
  const shapes = seen.filter(r => Object.keys(r).sort().join() === "ok,reason,said,served" && r.said === B.REASONS[r.reason]
    && !/[!\u2013\u2014]/.test(r.said)).length;
  check(seen.length >= 60 && shapes === seen.length && throwsOf(() => B.refusal("nonsense")),
    "8b every refusal this file met is { ok, reason, said, served } with the contract's sentence: " + shapes + " of " + seen.length);

  /* ---- 9: hostile input never throws ---- */
  const genuine = sealAs(desk, own("in-use.ec"), 1);
  const boom = new Proxy({}, { get() { throw new Error("boom"); } });
  const ctx = x => Object.assign({ blob: genuine, relayTeamId: RT, epoch: 1, teamKey: KEY1, trust, counters: {} }, x);
  const hostileInputs = [undefined, null, 7, "blob", [], ctx({ blob: null }), ctx({ blob: "x" }), ctx({ blob: { ciphertext: "text" } }),
    ctx({ blob: boom }), boom, ctx({ blob: Object.defineProperty({}, "ciphertext", { get() { throw new Error("boom"); } }) }),
    ctx({ trust: null }), ctx({ trust: "lead" }), ctx({ trust: { desks: {} } }), ctx({ trust: { lead: null, desks: [null, 7, "k"] } }),
    ctx({ teamKey: "key" }), ctx({ teamKey: KEY1.subarray(0, 16) }), ctx({ epoch: "1" }), ctx({ relayTeamId: 7 }), ctx({ counters: "x" })];
  let quiet = 0;
  for (const x of hostileInputs) {
    let r = null;
    try { r = B.openBlob(x); } catch { r = null; }
    if (r && r.ok === false && B.REASONS[r.reason] === r.said) quiet++;
  }
  const viewed = B.openBlob(ctx({ blob: Object.assign({}, genuine, { ciphertext: new Uint8Array(genuine.ciphertext) }) }));
  if (viewed.ok === true) quiet++;
  check(quiet === hostileInputs.length + 1, "9a openBlob answers every hostile input with a refusal and never throws, a throwing getter"
    + " and a proxy included, and opens a ciphertext handed as a Uint8Array: " + quiet + " of " + (hostileInputs.length + 1));

  const odd = [undefined, null, 0, -1, NaN, Infinity, 2 ** 53, "", "x", "\u0000", [], {}, [1, 2], { length: 3 }, Buffer.alloc(0),
    JSON.parse('{"__proto__":{"x":1}}'), true];
  const calls = [v => B.checkPath(v), v => B.placeOf(v, { role: "lead" }, "file"), v => B.placeOf("guide.ec", v, v),
    v => B.writerOf(v, lead.keyId), v => B.writerOf(trust, v), v => B.counterFresh(v, deskId, 1, 1), v => B.counterFresh({}, v, v, v),
    v => B.raiseCounter(v, deskId, 1, 1), v => B.revLoad(v, v), v => B.revCurrent(revs, v), v => B.checkBlobSize(v),
    v => B.checkTeamSize(v, v, v), v => B.checkRate(v, v), v => B.verifyUpload(v, v, v, v), v => B.unframe(v), v => B.aadOf(v),
    v => B.verifyUpload(desk.public, a3, ct3, v)];
  let threw = 0, tried = 0;
  for (const fn of calls) for (const v of odd) { tried++; if (throwsOf(() => fn(v))) threw++; }
  check(threw === 0 && tried === calls.length * odd.length, "9b no exported check throws on a hostile value: " + tried + " calls over "
    + calls.length + " functions and " + odd.length + " values, " + threw + " threw");

  /* A fixed fuzz: each field of a genuine blob replaced by each odd value, and its bytes flipped at 64 places. */
  let fuzzed = 0, fuzzRefused = 0;
  for (const field of ["id", "epoch", "supersedes", "writerKeyId", "counter", "nonce", "signature", "ciphertext"]) {
    for (const v of odd) {
      if (field === "supersedes" && (v === undefined || v === null)) continue;
      fuzzed++;
      let r = null;
      try { r = B.openBlob({ blob: Object.assign({}, genuine, { [field]: v }), relayTeamId: RT, epoch: 1, teamKey: KEY1, trust, counters: {} }); }
      catch { r = null; }
      if (r && r.ok === false && B.REASONS[r.reason] === r.said) fuzzRefused++;
    }
  }
  for (let i = 0; i < 64; i++) {
    fuzzed++;
    const at = Math.floor((i * 2654435761) % genuine.ciphertext.length);
    let r = null;
    try { r = B.openBlob({ blob: Object.assign({}, genuine, { ciphertext: flip(genuine.ciphertext, at) }), relayTeamId: RT, epoch: 1,
      teamKey: KEY1, trust, counters: {} }); } catch { r = null; }
    if (r && r.ok === false && r.reason === "bad-signature") fuzzRefused++;
  }
  check(fuzzRefused === fuzzed && fuzzed >= 190, "9c a genuine blob with any one field made hostile, or one byte flipped at 64 places,"
    + " is refused without a throw: " + fuzzRefused + " of " + fuzzed);

  /* Protocol section 3 checks the shape first: a malformed blob is bad-signature whatever later check it would also fail. */
  const offTrust = () => sealAs(stranger, "desks/" + stranger.keyId + "/join.json", 1);
  const replayed = { counters: { [ck]: 5 } };
  const malformed = [
    [Object.assign(offTrust(), { nonce: "zz" })],
    [Object.assign(sealAs(desk, own("in-use.ec"), 1), { nonce: "zz" }), replayed],
    [Object.assign(sealAs(desk, own("in-use.ec"), 1, { epoch: 2, teamKey: KEY2 }), { nonce: "zz" })],
    [Object.assign(sealAs(desk, own("in-use.ec"), 1), { writerKeyId: "K-A" })],
    [Object.assign(offTrust(), { ciphertext: crypto.randomBytes(5000) })],
    [Object.assign(sealAs(desk, own("in-use.ec"), 1), { ciphertext: crypto.randomBytes(5000) }), replayed],
    [Object.assign(offTrust(), { signature: "x" })]];
  const shapeFirst = malformed.filter(([b, x]) => refused(take(b, x), "bad-signature")).length;
  check(shapeFirst === malformed.length, "9d a malformed blob is bad-signature before any later check: nonce zz off the trust, on a"
    + " replayed counter and under epoch 2, writer K-A, a 5000-byte ciphertext off the trust and on a replayed counter, signature x"
    + " off the trust: " + shapeFirst + " of " + malformed.length);

  /* ---- 10: a desk id the program can write. isId still accepts a reserved device name; isDeskId and writerOf do not. ---- */
  const reserved = ["con", "nul", "prn", "aux", "com1", "lpt9"];
  const heldBack = reserved.filter(id => B.isId(id) === true && B.isDeskId(id) === false);
  const ordinary = "k-" + hex(8);
  const conKey = keyPair("k-" + hex(8)), nulKey = keyPair("k-" + hex(8)), ordinaryKey = keyPair(ordinary);
  const deskTrust = (id, key) => ({ desks: [{ deskId: id, keyId: key.keyId, public: key.public }] });
  const conW = B.writerOf(deskTrust("con", conKey), conKey.keyId);
  const nulW = B.writerOf(deskTrust("nul", nulKey), nulKey.keyId);
  const ordinaryW = B.writerOf(deskTrust(ordinary, ordinaryKey), ordinaryKey.keyId);
  check(heldBack.length === reserved.length && B.isDeskId(ordinary) === true && conW === null && nulW === null
    && !!ordinaryW && ordinaryW.role === "desk" && ordinaryW.deskId === ordinary,
    "10a a reserved device name is not a desk id: isId accepts con, nul, prn, aux, com1 and lpt9, isDeskId refuses them, writerOf"
    + " resolves none of con or nul, and an ordinary desk id still resolves: refused " + heldBack.length + " of " + reserved.length
    + ", con " + (conW ? "resolved" : "refused") + ", nul " + (nulW ? "resolved" : "refused")
    + ", ordinary " + (ordinaryW ? ordinaryW.deskId : "refused"));
  const planted = liftBlob("plant:desk-id", mod => {
    const k = keyPair("k-" + hex(8));
    const w = mod.writerOf(deskTrust("con", k), k.keyId);
    return mod.isId("con") === true && mod.isDeskId("con") === true && !!w && w.deskId === "con";
  });
  check(planted.turned && planted.back, "10b lifting plant:desk-id lets writerOf resolve a desk id of con, and the file is put back: "
    + planted.detail + ", sha " + (planted.back ? "restored" : "differs"));

  /* ---- 11: a signature verifies only under a prefix of this protocol. The team file's scheme carries none. ---- */
  const signer = keyPair("k-" + hex(8));
  const payload = Buffer.from("{\"kind\":\"note\"}", "utf8");
  const headPref = "etiuda-relay-head\n", branchPref = "etiuda-desk-branch\n", teamPref = "", oddPrefix = "etiuda-not-a-prefix\n";
  const signOver = (pref) => crypto.sign(null, pref ? Buffer.concat([Buffer.from(pref, "utf8"), payload]) : payload, signer.privateKey).toString("hex");
  const sigHead = signOver(headPref), sigBranch = signOver(branchPref), sigTeam = signOver(teamPref), sigOdd = signOver(oddPrefix);
  const verdict = (pref, sig) => B.verifySigned(signer.public, pref, payload, sig) === true;
  check(verdict(headPref, sigHead) && !verdict(branchPref, sigHead) && !verdict(teamPref, sigHead)
    && verdict(branchPref, sigBranch) && !verdict(headPref, sigBranch)
    && verdict(teamPref, sigTeam) && !verdict(headPref, sigTeam)
    && !verdict(oddPrefix, sigOdd) && B.verifySig === undefined,
    "11a a signature verifies only under its own prefix from the protocol's list: the head prefix verifies the head and not the branch"
    + " or the team, the branch prefix verifies the branch and not the head, the empty prefix verifies the team file's bytes and not the head,"
    + " a prefix outside the list verifies nothing, and verifySig is not exported");
  const signedPlant = liftBlob("plant:signed-prefix", mod => mod.verifySigned(signer.public, oddPrefix, payload, sigOdd) === true);
  check(signedPlant.turned && signedPlant.back, "11b lifting plant:signed-prefix verifies a prefix outside the list, and the file is put back: "
    + signedPlant.detail + ", sha " + (signedPlant.back ? "restored" : "differs"));
}

try { main(); }
catch (e) { check(false, "harness: " + (e && e.stack ? e.stack : e)); }
console.log("#counts checks=" + asserted + " failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log(failed ? "  RESULT: FAIL " + failed + " of " + asserted : "  RESULT: ok " + asserted + " check(s)");
/* CAPPED AT 63, as every driver here: an exit code is read modulo 256. */
process.exit(Math.min(failed, 63));
