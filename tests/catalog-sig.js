/* The seven catalog-signature legs. Board 614.

     node tests/catalog-sig.js

   Signs the shipped sample, verifies through the engine's own function, and prints one line
   per claim. Exit code is the number of failed legs. */
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
    "const V2_HARNESS_TEST_KEYID=", "const V2_HARNESS_TEST_PUB=", "const V2_KNOWN_KEYS=",
    "function v2SigFold(", "function v2SignedBytes(", "function v2HexBytes(", "function v2SigState(",
    "const V2_ID_RE=", "const V2_SHAPES=", "const V2_MARKER_RE=", "function v2IsBracketLine(",
    "const V2_GREET_PARTS=", "function v2BodyProblems(", "function v2LangProblems(",
    "function v2Problems(",
    "const CARD_KEY=", "const REQ_KEY=", 'const CARD_FLAGS=["firstOnly"',
    "function v2Mark(", "function v2Unmark(", "function v2AltLabel(", "function v2PartText(",
    "function catalogToV2(",
    "function catalogFromV2(",
  ].map(m => extractDecl(src, m)).join("\n");
  return new Function(decls + "\nreturn {v2Problems,v2SignedBytes,v2SigState,catalogFromV2,"
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
  const keyId = "harness-a";
  const keys = {};
  keys[keyId] = pubHex(pair.publicKey);
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

  console.log(fails ? "RESULT: FAIL, " + fails + " of " + n + " failed"
                    : "RESULT: OK, " + n + " checks");
  process.exit(fails);
}

main().catch(e => {
  console.error("  FAIL harness: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
