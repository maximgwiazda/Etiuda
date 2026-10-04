/* The shell's HPKE, held to the published vectors of RFC 9180 for the one suite the team key's wrap
 * uses: base mode, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM. Board 834, step 12.
 *
 *     node tests/hpke.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE ORACLE IS THE STANDARD, NOT OUR OWN OUTPUT. Every value in VECTOR is copied from RFC 9180,
 * appendix A.1.1 and A.1.1.1, sequence number 0, as the RFC Editor publishes it at
 * https://www.rfc-editor.org/rfc/rfc9180.txt. A wrap checked only against itself round-trips
 * whatever it does, a wrong label included, and no other implementation could then open it.
 *
 * THE DECLARATIONS ARE SLICED, AS STUDIO WILL SLICE THEM. They are cut out of shell/main.js by the
 * marker list below and evaluated with crypto and Buffer as their only names, so a free name would
 * fail here as it would in Studio, and what is tested is the text a second program runs.
 *
 * EVERY CONTROL IS A REFUSAL OR A MUTATION: a changed byte, info, aad or key must not open, and the
 * same slices with one byte of the HPKE label changed must miss the vector, or 12a to 12e would pass
 * a function that matched nothing in particular.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* The floor: every leg below runs, or the file says it did not complete. */
const EXPECTED = 18;

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const HPKE_DECLS = ["const HPKE_KEM =", "const HPKE_SUITE =", "const SPKI_X25519 =", "function hpkeLabeledExtract(",
  "function hpkeLabeledExpand(", "function hpkeX25519Public(", "function hpkeShared(", "function hpkeSchedule(",
  "function hpkeSeal(", "function hpkeOpen("];

function sliceDecl(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("no " + JSON.stringify(marker) + " in shell/main.js");
  if (src.indexOf(marker, at + 1) >= 0) throw new Error(JSON.stringify(marker) + " is in shell/main.js twice");
  const isFn = marker.startsWith("function");
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
  throw new Error("an unterminated declaration: " + marker);
}
function hpkeFrom(src) {
  const body = HPKE_DECLS.map(m => sliceDecl(src, m)).join("\n");
  return new Function("crypto", "Buffer", body
    + "\nreturn { hpkeLabeledExtract, hpkeShared, hpkeSchedule, hpkeSeal, hpkeOpen };")(crypto, Buffer);
}

const VECTOR = {
  info: "4f6465206f6e2061204772656369616e2055726e",
  pkEm: "37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431",
  skEm: "52c4a758a802cd8b936eceea314432798d5baf2d7e9235dc084ab1b9cfa2f736",
  pkRm: "3948cfe0ad1ddb695d780e59077195da6c56506b027329794ab02bca80815c4d",
  skRm: "4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8",
  enc: "37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431",
  shared_secret: "fe0e18c9f024ce43799ae393c7e8fe8fce9d218875e8227b0187c04e7d2ea1fc",
  key: "4531685d41d65f03dc48f6b8302c05b0",
  base_nonce: "56d890e5accaaf011cff4b7d",
  pt: "4265617574792069732074727574682c20747275746820626561757479",
  aad: "436f756e742d30",
  ct: "f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a",
};
const hex = h => Buffer.from(h, "hex");
const PKCS8_X25519 = hex("302e020100300506032b656e04220420");
const privateOf = raw => crypto.createPrivateKey({ key: Buffer.concat([PKCS8_X25519, raw]), format: "der", type: "pkcs8" });
const rawPublicOf = key => crypto.createPublicKey(key).export({ type: "spki", format: "der" }).subarray(-32);
const flip = (buf, i) => { const b = Buffer.from(buf); b[i] ^= 1; return b; };

function main() {
  const SRC = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
  let H = null;
  try { H = hpkeFrom(SRC); } catch (e) { check(false, "12a the HPKE declarations slice and evaluate - " + e.message); }
  if (H) check(true, "12a the " + HPKE_DECLS.length + " HPKE declarations slice out of shell/main.js and evaluate with crypto and Buffer alone");
  if (!H) return;

  const v = Object.fromEntries(Object.entries(VECTOR).map(([k, h]) => [k, hex(h)]));
  const skE = privateOf(v.skEm), skR = privateOf(v.skRm);
  check(rawPublicOf(skE).equals(v.pkEm) && rawPublicOf(skR).equals(v.pkRm),
    "12b the vector's private keys load as KeyObjects whose public halves are its pkEm and pkRm");

  const dh = crypto.diffieHellman({ privateKey: skE, publicKey: crypto.createPublicKey(skR) });
  const shared = H.hpkeShared(dh, v.enc, v.pkRm);
  check(shared.equals(v.shared_secret), "12c the KEM's shared_secret is the vector's: " + shared.toString("hex").slice(0, 16) + "...");

  const ks = H.hpkeSchedule(v.shared_secret, v.info);
  check(ks.key.equals(v.key) && ks.nonce.equals(v.base_nonce),
    "12d the key schedule gives the vector's key and base_nonce: " + ks.key.toString("hex") + ", " + ks.nonce.toString("hex"));

  const sealed = H.hpkeSeal(v.pkRm, v.info, v.aad, v.pt, skE);
  check(sealed.enc.equals(v.enc) && sealed.ct.equals(v.ct),
    "12e sealing the vector's pt to pkRm with its ephemeral key gives its enc and its sequence 0 ct, byte for byte ("
    + sealed.ct.length + " bytes)");

  const opened = H.hpkeOpen(skR, v.enc, v.info, v.aad, v.ct);
  check(!!opened && opened.equals(v.pt), "12f opening the vector's enc and ct with skRm gives its pt");

  const team = crypto.randomBytes(32), info = Buffer.from("info"), aad = Buffer.from("aad");
  const a = H.hpkeSeal(v.pkRm, info, aad, team), b = H.hpkeSeal(v.pkRm, info, aad, team);
  const backA = H.hpkeOpen(skR, a.enc, info, aad, a.ct), backB = H.hpkeOpen(skR, b.enc, info, aad, b.ct);
  check(!a.enc.equals(b.enc) && !a.ct.equals(b.ct) && !!backA && backA.equals(team) && !!backB && backB.equals(team),
    "12g with no ephemeral key given, two seals of one 32-byte key differ in enc and ct and both open to it");

  const nulls = [
    ["a ct byte flipped", H.hpkeOpen(skR, v.enc, v.info, v.aad, flip(v.ct, 0))],
    ["a tag byte flipped", H.hpkeOpen(skR, v.enc, v.info, v.aad, flip(v.ct, v.ct.length - 1))],
    ["an enc byte flipped", H.hpkeOpen(skR, flip(v.enc, 5), v.info, v.aad, v.ct)],
    ["an info byte flipped", H.hpkeOpen(skR, v.enc, flip(v.info, 0), v.aad, v.ct)],
    ["an aad byte flipped", H.hpkeOpen(skR, v.enc, v.info, flip(v.aad, 6), v.ct)],
    ["the ct cut by a byte", H.hpkeOpen(skR, v.enc, v.info, v.aad, v.ct.subarray(0, v.ct.length - 1))],
  ];
  nulls.forEach(([what, got], i) => check(got === null, "12h" + (i + 1) + " " + what + " does not open: " + (got === null ? "null" : "it opened")));

  const other = crypto.generateKeyPairSync("x25519").privateKey;
  check(H.hpkeOpen(other, v.enc, v.info, v.aad, v.ct) === null, "12i another desk's private key does not open it");
  check(H.hpkeOpen(v.skRm, v.enc, v.info, v.aad, v.ct) === null,
    "12j a private key handed over as bytes rather than a KeyObject is refused, though the bytes are the right ones");

  let threw = "";
  try { H.hpkeSeal(Buffer.alloc(32), info, aad, team); } catch (e) { threw = e.message; }
  check(threw !== "" && H.hpkeOpen(skR, Buffer.alloc(32), v.info, v.aad, v.ct) === null,
    "12k a low-order public key of 32 zero bytes is refused both ways: sealing throws (" + (threw || "it did not throw")
    + ") and opening is null");
  /* Node's own X25519 already refuses that key, so the shell's check is held where it stands, on a zero output. */
  let zero = "";
  try { H.hpkeShared(Buffer.alloc(32), v.enc, v.pkRm); } catch (e) { zero = e.message; }
  check(/low-order/.test(zero), "12K an all-zero X25519 output is refused by the shell's own check: " + (zero || "it was taken"));

  /* THE MUTATION: one byte of the label every Extract and Expand carries. */
  const label = '"HPKE-v1"', count = SRC.split(label).length - 1;
  let M = null;
  try { M = hpkeFrom(SRC.split(label).join('"HPKE-v2"')); } catch { M = null; }
  const mutated = M ? M.hpkeSeal(v.pkRm, v.info, v.aad, v.pt, skE) : null;
  check(count === 2 && !!mutated && !mutated.ct.equals(v.ct) && M.hpkeOpen(skR, v.enc, v.info, v.aad, v.ct) === null,
    "12L with the label changed by one byte at its " + count + " sites, the same slices miss the vector's ct and refuse to open it");
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
