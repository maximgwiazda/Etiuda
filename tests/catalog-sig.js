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
    "function v2RingRead(",
    "const V2_ID_RE=", "const V2_SHAPES=", "const V2_MARKER_RE=", "function v2IsBracketLine(",
    "const V2_GREET_PARTS=", "function v2BodyProblems(", "function v2LangProblems(",
    "function v2Problems(",
    "const CARD_KEY=", "const REQ_KEY=", 'const CARD_FLAGS=["firstOnly"',
    "function v2Mark(", "function v2Unmark(", "function v2AltLabel(", "function v2PartText(",
    "function catalogToV2(",
    "function catalogFromV2(",
  ].map(m => extractDecl(src, m)).join("\n");
  return new Function(decls + "\nreturn {v2Problems,v2SignedBytes,v2SigState,catalogFromV2,"
    + "v2RingRead,V2_RING_FORMAT,V2_RING_KIND,V2_RING_FILE,V2_HARNESS_TEST_KEYID,"
    + "V2_HARNESS_TEST_PUB,"
    + "V2_KNOWN_KEYS,V2_SIG_ALG,V2_SIG_VALID,V2_SIG_INVALID,V2_SIG_NONE,V2_SIG_UNKNOWN};")();
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

  console.log(fails ? "RESULT: FAIL, " + fails + " of " + n + " failed"
                    : "RESULT: OK, " + n + " checks");
  process.exit(fails);
}

main().catch(e => {
  console.error("  FAIL harness: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
