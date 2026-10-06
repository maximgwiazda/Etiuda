/* The catalog-signature legs, and the ring that binds a key to a catalog. Boards 614 and 605.

     node tests/catalog-sig.js

   Signs the shipped sample, verifies through the engine's own function, and prints one line
   per claim. THE RING IS ALWAYS BUILT BY THE ENGINE'S OWN READER out of a ring document, never
   by hand: a leg that hand-built the lookup would pass while the file format was unreadable.
   Exit code is the number of failed legs. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const E = require("./engine.js");

let fails = 0, n = 0;
const ok = (good, what) => {
  n++;
  console.log((good ? "  ok   " : "  FAIL ") + what);
  if (!good) fails++;
};

function extractDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("extractDecl: marker not found in engine: " + marker);
  const isFn = /^function\b/.test(marker);
  let par = 0, brk = 0, brc = 0, sawBrace = false;
  for (let i = at; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(") par++; else if (ch === ")") par--;
    else if (ch === "[") brk++; else if (ch === "]") brk--;
    else if (ch === "{") { brc++; sawBrace = true; }
    else if (ch === "}") {
      brc--;
      if (isFn && sawBrace && !par && !brk && !brc) return src.slice(at, i + 1);
    } else if (ch === ";" && !par && !brk && !brc && !isFn) return src.slice(at, i + 1);
  }
  throw new Error("extractDecl: unterminated declaration: " + marker);
}

function v2Fns() {
  const src = E.sourceDoc().text;
  const decls = [
    "const V2_FORMAT=", "const DEFAULT_LANGS=",
    "function v2Str(", "function v2Codes(", "function isV2(",
    "function v2Canonical(", "function v2ContentHash(",
    "const V2_SIG_NONE=", "const V2_SIG_ALG=",
    "const V2_HARNESS_TEST_KEYID=", "const V2_HARNESS_TEST_PUB=", "const V2_RING_FORMAT=",
    "const V2_KNOWN_KEYS=",
    "function v2SigFold(", "function v2SignedBytes(", "function v2HexBytes(", "function v2SigState(",
    "function v2RingRead(", "const V2_TEAM_FORMAT=", "function v2TeamRead(", "function v2TeamSigState(",
    "const V2_SEALED_KIND=", "function v2SealedRead(",
    "const V2_ID_RE=", "const V2_SHAPES=", "const V2_MARKER_RE=", "function v2IsBracketLine(",
    "const V2_GREET_PARTS=", "function v2BodyProblems(", "const V2_LANG_RE=", "function v2LangProblems(",
    "const V2_SHA_RE=", "function v2Missing(", "function v2FlagProblem(", "function v2NextProblems(",
    "function v2HeaderProblems(", "function v2Problems(",
    "const V2_CARD_NAMED=", "const V2_HEAD_NAMED=", "function v2Copy(", "function v2Put(",
    "function v2Extra(", "function v2Restore(",
    "const CARD_KEY=", "const REQ_KEY=", "const V2_RUNTIME_FIELD=", "function v2ColKey(",
    "const CAT_LABEL_KEY=", "function v2CatKey(",
    'const CARD_FLAGS=["firstOnly"',
    "function v2Mark(", "function v2Unmark(", "function v2AltLabel(", "function v2PartText(",
    "function catalogToV2(",
    "function catalogFromV2(",
  ].map(m => extractDecl(src, m)).join("\n");
  return new Function(decls + "\nreturn {v2Problems,v2SignedBytes,v2SigState,catalogFromV2,"
    + "v2RingRead,V2_RING_FORMAT,V2_RING_KIND,V2_RING_FILE,V2_HARNESS_TEST_KEYID,"
    + "v2TeamRead,v2TeamSigState,V2_TEAM_FORMAT,V2_TEAM_KIND,V2_TEAM_FILE,v2SealedRead,V2_SEALED_KIND,"
    + "V2_HARNESS_TEST_PUB,"
    + "V2_KNOWN_KEYS,V2_SIG_ALG,V2_SIG_VALID,V2_SIG_INVALID,V2_SIG_NONE,V2_SIG_UNKNOWN};")();
}

/* The shell's sealed envelope, sliced as tests/hpke.mjs slices it, so 88f seals with the code a desk runs. */
const SEAL_DECLS = ["const SEALED_KIND =", "const SEALED_TEAM_RE =", "function sealedAad(", "function sealCatalog(",
  "function openSealed("];
function shellSeal() {
  const src = fs.readFileSync(path.join(__dirname, "..", "shell", "main.js"), "utf8");
  return new Function("crypto", "Buffer", SEAL_DECLS.map(m => extractDecl(src, m)).join("\n")
    + "\nreturn { sealCatalog, openSealed };")(crypto, Buffer);
}

function pubHex(publicKey) {
  return publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
}
function reverseKeys(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(reverseKeys);
  const out = {};
  Object.keys(v).reverse().forEach(k => { out[k] = reverseKeys(v[k]); });
  return out;
}
function attachSig(v2, cat, alg, keyId, privateKey) {
  const out = JSON.parse(JSON.stringify(cat));
  out.sig = { alg: alg, keyId: keyId };
  const data = Buffer.from(v2.v2SignedBytes(out));
  out.sig.value = crypto.sign(null, data, privateKey).toString("hex");
  return out;
}
function opens(v2, cat) {
  const problems = v2.v2Problems(cat);
  if (problems.length) return { ok: false, why: problems[0] };
  try {
    const loaded = v2.catalogFromV2(cat);
    if (!loaded || !Array.isArray(loaded.cards) || !loaded.cards.length)
      return { ok: false, why: "no cards" };
    return { ok: true, why: "" };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

async function main() {
  const v2 = v2Fns();
  const samplePath = path.join(__dirname, "..", "shell", "sample-catalog.ec");
  const fixture = JSON.parse(fs.readFileSync(samplePath, "utf8"));
  const pair = crypto.generateKeyPairSync("ed25519");
  const other = crypto.generateKeyPairSync("ed25519");
  const keyId = "harness-a", secondId = "harness-b", elsewhere = "harness-other-catalog";
  const entry = (catalog, id, key, note) => {
    const e = { catalog: catalog, keyId: id, alg: v2.V2_SIG_ALG, public: pubHex(key) };
    if (note) e.note = note;
    return e;
  };
  const ringDoc = { format: v2.V2_RING_FORMAT, kind: v2.V2_RING_KIND, keys: [
    entry(fixture.id, keyId, pair.publicKey),
    entry(fixture.id, secondId, other.publicKey, "the superseded key, while its editions are in use"),
  ] };
  const read = v2.v2RingRead(JSON.stringify(ringDoc));
  const keys = read.ring;
  const signed = attachSig(v2, fixture, v2.V2_SIG_ALG, keyId, pair.privateKey);

  const st1 = await v2.v2SigState(signed, keys);
  ok(st1 === v2.V2_SIG_VALID,
     "8s sign a fixture and verify: " + st1);

  const bent = JSON.parse(JSON.stringify(signed));
  const name = String(bent.name || "x");
  bent.name = String.fromCharCode(name.charCodeAt(0) ^ 1) + name.slice(1);
  const st2 = await v2.v2SigState(bent, keys);
  const opened2 = opens(v2, bent);
  ok(st2 === v2.V2_SIG_INVALID && opened2.ok,
     "8t flip one byte of the content: " + st2
     + (opened2.ok ? " opened" : " " + opened2.why));

  const flipped = JSON.parse(JSON.stringify(signed));
  const raw = Buffer.from(flipped.sig.value, "hex");
  raw[0] ^= 1;
  flipped.sig.value = raw.toString("hex");
  const st3 = await v2.v2SigState(flipped, keys);
  const opened3 = opens(v2, flipped);
  ok(st3 === v2.V2_SIG_INVALID && opened3.ok,
     "8u flip one byte of the signature: " + st3
     + (opened3.ok ? " opened" : " " + opened3.why));

  const algOnly = JSON.parse(JSON.stringify(signed));
  algOnly.sig.alg = "RSA";
  const st4 = await v2.v2SigState(algOnly, keys);
  const opened4 = opens(v2, algOnly);
  ok(st4 === v2.V2_SIG_INVALID && opened4.ok,
     "8v change the algorithm name alone: " + st4
     + (opened4.ok ? " opened" : " " + opened4.why));

  const again = JSON.parse(JSON.stringify(reverseKeys(signed)));
  const st5 = await v2.v2SigState(again, keys);
  ok(st5 === v2.V2_SIG_VALID,
     "8w re-serialise the document: " + st5);

  const unsigned = JSON.parse(JSON.stringify(signed));
  delete unsigned.sig;
  const opened = opens(v2, unsigned);
  const st6 = await v2.v2SigState(unsigned, keys);
  ok(opened.ok && st6 === v2.V2_SIG_NONE,
     "8x remove the signature, catalog still opens with a warning: "
     + (opened.ok ? "opened" : opened.why) + " " + st6);

  const foreign = attachSig(v2, fixture, v2.V2_SIG_ALG, "stranger", other.privateKey);
  const st7 = await v2.v2SigState(foreign, v2.V2_KNOWN_KEYS);
  const opened7 = opens(v2, foreign);
  ok(st7 === v2.V2_SIG_UNKNOWN && opened7.ok,
     "8y a key this program does not carry: " + st7
     + (opened7.ok ? " opened" : " " + opened7.why));

  /* ---- the ring, board 605. Each leg names the case that fails without it. ------------------ */

  /* Without a reader at all there is no ring and every real key is unknown. */
  ok(read.problems.length === 0 && Object.keys(read.ring[fixture.id] || {}).length === 2,
     "605a a ring document of two entries reads with no problem and binds two keys to "
     + fixture.id + ": " + JSON.stringify(read.problems));

  /* WITHOUT THE BINDING THIS IS VALID, which is the machine-wide bag. The same key, the same
     signature, a catalog the ring does not list it for. */
  const otherCat = JSON.parse(JSON.stringify(fixture));
  otherCat.id = elsewhere;
  const signedElsewhere = attachSig(v2, otherCat, v2.V2_SIG_ALG, keyId, pair.privateKey);
  const st8 = await v2.v2SigState(signedElsewhere, keys);
  const opened8 = opens(v2, signedElsewhere);
  ok(st8 === v2.V2_SIG_UNKNOWN && opened8.ok,
     "605b the same key, listed for " + fixture.id + ", on catalog " + elsewhere + ": " + st8
     + (opened8.ok ? " opened" : " " + opened8.why));

  /* THE CONTROL FOR 605b: unknown must name the binding and not the key or the signature, so
     the same document is read against a ring that does list that key for that catalog. */
  const wider = v2.v2RingRead(JSON.stringify({ format: v2.V2_RING_FORMAT, kind: v2.V2_RING_KIND,
    keys: ringDoc.keys.concat([entry(elsewhere, keyId, pair.publicKey)]) }));
  const st9 = await v2.v2SigState(signedElsewhere, wider.ring);
  ok(st9 === v2.V2_SIG_VALID,
     "605B and with that catalog listed for the same key the same document is valid, so unknown"
     + " named the binding: " + st9);

  /* Without more than one key per catalog a rotation would strand every edition the old key
     signed the moment the new key was listed. */
  const bySecond = attachSig(v2, fixture, v2.V2_SIG_ALG, secondId, other.privateKey);
  const stA = await v2.v2SigState(signed, keys), stB = await v2.v2SigState(bySecond, keys);
  ok(stA === v2.V2_SIG_VALID && stB === v2.V2_SIG_VALID,
     "605c two keys listed for one catalog and both editions verify: " + stA + " and " + stB);

  /* A RING ENTRY CANNOT PROMOTE. The id is inside the signed bytes, so renaming a document into
     a binding the ring does hold breaks the signature rather than borrowing the trust. */
  const renamed = JSON.parse(JSON.stringify(signedElsewhere));
  renamed.id = fixture.id;
  const stC = await v2.v2SigState(renamed, keys);
  ok(stC === v2.V2_SIG_INVALID,
     "605d a document renamed into a binding the ring holds is invalid, never valid: " + stC);

  /* The compiled-in key is bound too, or it would be a key trusted for every catalog. */
  const asHarness = JSON.parse(JSON.stringify(fixture));
  asHarness.sig = { alg: v2.V2_SIG_ALG, keyId: v2.V2_HARNESS_TEST_KEYID, value: "00".repeat(64) };
  const stD = await v2.v2SigState(asHarness, v2.V2_KNOWN_KEYS);
  const bound = v2.v2RingRead(JSON.stringify({ format: v2.V2_RING_FORMAT, kind: v2.V2_RING_KIND,
    keys: [entry(fixture.id, v2.V2_HARNESS_TEST_KEYID, pair.publicKey)] }));
  const stE = await v2.v2SigState(asHarness, bound.ring);
  ok(stD === v2.V2_SIG_UNKNOWN && stE === v2.V2_SIG_INVALID,
     "605e the built-in harness key is not trusted for another catalog: " + stD
     + ", and listed for it the same document is " + stE);

  /* An absent or unreadable ring must be exactly today's behaviour: a catalog still opens, an
     unsigned one reads none and a signed one reads unknown. A refusal here shuts a desk. */
  const absent = [null, "", "{not json", "[]", JSON.stringify({ format: 9, kind: "elsewhere" }),
                  JSON.stringify({ format: v2.V2_RING_FORMAT, kind: v2.V2_RING_KIND })];
  const states = [];
  for (const what of absent) {
    const r = v2.v2RingRead(what);
    states.push(await v2.v2SigState(signed, r.ring));
    states.push(await v2.v2SigState(unsigned, r.ring));
  }
  const wanted = absent.length * 2;
  const asToday = states.filter((s, i) => s === (i % 2 ? v2.V2_SIG_NONE : v2.V2_SIG_UNKNOWN)).length;
  ok(asToday === wanted && opens(v2, signed).ok,
     "605f " + absent.length + " absent, empty or malformed rings and every reading is today's:"
     + " " + asToday + " of " + wanted + " unknown signed and none unsigned");

  /* An entry that cannot be used is dropped and said, and its neighbours still stand: a reader
     that threw on one bad line would lose the keys beneath it. */
  const bent2 = v2.v2RingRead(JSON.stringify({ format: v2.V2_RING_FORMAT, kind: v2.V2_RING_KIND,
    keys: [null, {}, entry(fixture.id, keyId, pair.publicKey, "good"),
           { catalog: fixture.id, keyId: secondId, alg: "RSA", public: pubHex(other.publicKey) },
           { catalog: fixture.id, keyId: "UPPER", alg: v2.V2_SIG_ALG, public: pubHex(other.publicKey) },
           { catalog: fixture.id, keyId: "harness-c", alg: v2.V2_SIG_ALG, public: "not hex" }] }));
  const stF = await v2.v2SigState(signed, bent2.ring);
  ok(bent2.problems.length === 5 && stF === v2.V2_SIG_VALID,
     "605g five unusable entries are dropped with a line each and the good one still verifies: "
     + bent2.problems.length + " problem(s), " + stF);

  /* A ring file ADDS. It must not quietly take away what is compiled in, or a desk would lose
     the built-in trust the moment its administrator placed a file of their own. */
  const builtIn = r => ((r.ring || {})[v2.V2_HARNESS_TEST_KEYID] || {})[v2.V2_HARNESS_TEST_KEYID];
  ok(builtIn(read) === v2.V2_HARNESS_TEST_PUB && builtIn(v2.v2RingRead(null)) === v2.V2_HARNESS_TEST_PUB,
     "605h a ring file adds to what is compiled in and takes nothing away: the built-in"
     + " binding survives a read of " + ringDoc.keys.length + " entries");

  /* ---- the team file, board 834 step 8. Studio writes it; this is the reader the desk holds. -- */

  const deskOf = (seed, name) => {
    const key = crypto.createHash("sha256").update("desk " + seed).digest("hex");
    const d = { id: "k-" + crypto.createHash("sha256").update(Buffer.from(key, "hex")).digest("hex").slice(0, 16),
                key: key, box: crypto.createHash("sha256").update("box " + seed).digest("hex") };
    if (name) d.name = name;
    return d;
  };
  const teamDoc = { format: v2.V2_TEAM_FORMAT, kind: v2.V2_TEAM_KIND, id: "t-" + "0123456789abcdef",
    catalogs: [fixture.id], lead: { keyId: keyId, public: pubHex(pair.publicKey) },
    sealed: false, exportsSealed: false, epoch: 1,
    roster: [{ desk: deskOf(1, "Ala") }, { desk: deskOf(2), name: "Front desk" }], later: { kept: true } };
  const teamSigned = attachSig(v2, teamDoc, v2.V2_SIG_ALG, keyId, pair.privateKey);
  const t1 = v2.v2TeamRead(JSON.stringify(teamSigned));
  const tState = t1.team ? await v2.v2TeamSigState(t1.team) : "no team";
  ok(t1.problems.length === 0 && t1.team && t1.team.roster.length === 2 && t1.team.roster[1].name === "Front desk"
     && t1.team.later && t1.team.later.kept === true && tState === v2.V2_SIG_VALID && v2.V2_TEAM_FILE === "etiuda-team.json",
     "88a a team file signed by the lead reads whole, its roster, its names and a field this build does not name kept, and"
     + " verifies under the lead key it names: " + JSON.stringify(t1.problems) + ", " + tState);

  const teamBent = JSON.parse(JSON.stringify(teamSigned));
  teamBent.roster[1].name = "Back desk";
  const teamOther = attachSig(v2, teamDoc, v2.V2_SIG_ALG, keyId, other.privateKey);
  const teamRenamed = JSON.parse(JSON.stringify(teamSigned));
  teamRenamed.lead.keyId = secondId;
  const tStates = [];
  for (const d of [teamBent, teamOther, teamRenamed]) tStates.push(await v2.v2TeamSigState(v2.v2TeamRead(d).team));
  ok(tStates.join() === [v2.V2_SIG_INVALID, v2.V2_SIG_INVALID, v2.V2_SIG_UNKNOWN].join(),
     "88b THE CONTROL: a name in the roster changed and the file signed by another key read invalid, and a lead key id"
     + " the signature does not carry reads unknown: " + tStates.join(", "));

  const teamAbsent = [null, "", "{not json", "[]", JSON.stringify({ format: 9, kind: v2.V2_TEAM_KIND }),
                      JSON.stringify({ format: v2.V2_TEAM_FORMAT, kind: v2.V2_RING_KIND })];
  const tNull = teamAbsent.map(x => v2.v2TeamRead(x));
  ok(tNull.every(r => r.team === null) && tNull.filter(r => r.problems.length === 1).length === teamAbsent.length - 2,
     "88c " + teamAbsent.length + " absent, empty or foreign files read as no team without a throw, and each but the"
     + " two absent says one line: " + tNull.map(r => r.problems.length).join(","));

  const teamBroken = Object.assign({}, teamDoc, { lead: { keyId: keyId }, epoch: 0, sealed: "no", roster: {} });
  const t4 = v2.v2TeamRead(teamBroken);
  ok(t4.team === null && t4.problems.length === 4,
     "88d a team file with no lead key, epoch 0, sealed not true or false and a roster that is not a list is no team,"
     + " with a line for each: " + JSON.stringify(t4.problems));

  const teamEntries = Object.assign({}, teamDoc, { catalogs: [fixture.id, "UPPER", fixture.id],
    roster: [null, { desk: { id: "k-123", key: "00", box: "00" } }, { desk: deskOf(1, "Ala") },
             { desk: deskOf(3), name: 7 }, { desk: deskOf(1), name: "the same desk again" }] });
  const t5 = v2.v2TeamRead(teamEntries);
  ok(t5.team && t5.team.roster.length === 1 && t5.team.roster[0].desk.name === "Ala" && t5.team.catalogs.join() === fixture.id
     && t5.problems.length === 5,
     "88e unusable entries are dropped with a line each and their neighbours stand: a bad catalog id, four bad desks or"
     + " a desk twice, the first standing (" + t5.problems.length + " lines, " + (t5.team ? t5.team.roster.length : 0) + " desk)");

  /* ---- the sealed envelope, board 834 step 12. The shell seals and opens it; the engine reads its shape. -- */

  const S = shellSeal(), teamKey = crypto.randomBytes(32);
  const signedText = JSON.stringify(signed, null, 2) + "\n";
  const sealedDoc = S.sealCatalog(teamKey, teamDoc.id, 1, signedText);
  const s1 = v2.v2SealedRead(JSON.stringify(sealedDoc));
  const inside = s1.sealed ? S.openSealed(teamKey, s1.sealed) : null;
  const sState = inside ? await v2.v2SigState(JSON.parse(inside), keys) : "nothing opened";
  ok(s1.problems.length === 0 && !!s1.sealed && s1.sealed.kind === v2.V2_SEALED_KIND && inside !== null
     && Buffer.from(inside, "utf8").equals(Buffer.from(signedText, "utf8")) && sState === v2.V2_SIG_VALID,
     "88f a signed catalog sealed by the shell reads as an envelope with no problem, opens to the same "
     + Buffer.byteLength(signedText) + " bytes, and its signature still verifies: " + JSON.stringify(s1.problems) + ", " + sState);

  const sBroken = v2.v2SealedRead(Object.assign({}, sealedDoc,
    { team: "t-XYZ", epoch: 0, nonce: sealedDoc.nonce.slice(2), ct: "zz" }));
  const sShort = v2.v2SealedRead(Object.assign({}, sealedDoc, { ct: "00".repeat(15) }));
  const named = r => r.problems.map(p => p.split(":")[0]).join();
  ok(sBroken.sealed === null && named(sBroken) === "sealed team,sealed epoch,sealed nonce,sealed ct"
     && sShort.sealed === null && named(sShort) === "sealed ct",
     "88g THE CONTROL: a bad team, epoch, nonce and ct are no envelope with a line naming each, and a ct shorter than its"
     + " tag is one line: " + named(sBroken) + "; " + named(sShort));

  const sAbsent = [null, "", "{not json", "[]", JSON.stringify(teamSigned), JSON.stringify(signed)];
  const sNull = sAbsent.map(x => v2.v2SealedRead(x));
  ok(sNull.every(r => r.sealed === null) && sNull.filter(r => r.problems.length === 1).length === sAbsent.length - 2,
     "88h " + sAbsent.length + " absent, empty or foreign files, a team file and a plain catalog among them, read as no"
     + " envelope without a throw, and each but the two absent says one line: " + sNull.map(r => r.problems.length).join(","));

  /* ---- the wraps in the team file, board 834 step 12 S3: the shapes the reader keeps, not the crypto -- */

  const hexOf = (seed, n) => crypto.createHash("sha512").update(seed).digest("hex").slice(0, n);
  const wrapOf = seed => ({ epoch: 1, enc: hexOf("enc " + seed, 64), ct: hexOf("ct " + seed, 96) });
  const recovery = { epoch: 1, kdf: "scrypt", N: 32768, r: 8, p: 1, cipher: "aes-256-gcm",
    salt: hexOf("salt", 32), iv: hexOf("iv", 24), ct: hexOf("recovery", 96) };
  const wrappedDoc = Object.assign({}, teamDoc, { sealed: true, recovery: recovery,
    roster: [{ desk: deskOf(1, "Ala"), wrap: wrapOf(1) }, { desk: deskOf(2), name: "Front desk", wrap: wrapOf(2) }] });
  const wrappedSigned = attachSig(v2, wrappedDoc, v2.V2_SIG_ALG, keyId, pair.privateKey);
  const t6 = v2.v2TeamRead(JSON.stringify(wrappedSigned));
  const t6State = t6.team ? await v2.v2TeamSigState(t6.team) : "no team";
  ok(t6.team && t6.problems.length === 0 && t6.team.roster.length === 2
     && JSON.stringify(t6.team.roster.map(e => e.wrap)) === JSON.stringify([wrapOf(1), wrapOf(2)])
     && JSON.stringify(t6.team.recovery) === JSON.stringify(recovery) && t6State === v2.V2_SIG_VALID,
     "88i a sealed team file whose desks carry their wraps and whose lead keeps a recovery copy reads whole, both kept as"
     + " written, and verifies: " + JSON.stringify(t6.problems) + ", " + t6State);

  const badWraps = [Object.assign(wrapOf(3), { enc: hexOf("short", 63) }), Object.assign(wrapOf(4), { ct: hexOf("short", 94) }),
    Object.assign(wrapOf(5), { epoch: 2 }), "a wrap", null];
  const t7 = v2.v2TeamRead(Object.assign({}, wrappedDoc,
    { roster: badWraps.map((w, i) => ({ desk: deskOf(10 + i), wrap: w })).concat([{ desk: deskOf(20), wrap: wrapOf(20) }]) }));
  ok(t7.team && t7.team.roster.length === 6 && t7.team.roster.filter(e => "wrap" in e).length === 1
     && t7.team.roster[5].wrap.enc === wrapOf(20).enc && t7.problems.length === badWraps.length
     && t7.problems.every(p => /wrap/.test(p)),
     "88j THE CONTROL: a wrap with a short enc or ct, of another epoch, or not an object is dropped with a line and its desk"
     + " stands, and the good neighbour keeps its own (" + t7.problems.length + " lines, "
     + (t7.team ? t7.team.roster.filter(e => "wrap" in e).length : 0) + " wrap kept)");

  const badRecoveries = [{ kdf: "pbkdf2" }, { epoch: 2 }, { N: 0 }, { cipher: "aes-128-gcm" }, { salt: hexOf("s", 30) },
    { iv: hexOf("i", 22) }, { ct: hexOf("c", 64) }].map(over => Object.assign({}, recovery, over)).concat(["a recovery"]);
  const t8 = badRecoveries.map(rc => v2.v2TeamRead(Object.assign({}, wrappedDoc, { recovery: rc })));
  ok(t8.every(r => r.team && !("recovery" in r.team) && r.team.roster.length === 2 && r.problems.length === 1
     && /recovery/.test(r.problems[0])),
     "88k THE CONTROL: a recovery copy of another kdf, epoch, cost, cipher, salt, iv or ct length, or not an object, is"
     + " dropped with one line and the team stands: " + t8.map(r => r.problems.length).join(","));

  console.log(fails ? "RESULT: FAIL, " + fails + " of " + n + " failed"
                    : "RESULT: OK, " + n + " checks");
  /* CAPPED AT 63, ballot 4 of the fourth meeting (2026-09-23): an exit code is read modulo 256 by
     bash and by Linux, so a count used as one read 256 failures as success. 63 keeps a small count
     readable and stays below 78, which is NO VERDICT here. */
  process.exit(Math.min(fails, 63));
}

main().catch(e => {
  console.error("  FAIL harness: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
