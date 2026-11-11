/* The update offer (board 991): the version note the desk reads from etiuda.dev, judged by the shell, and what the page
 * shows of it. Bare node, no window and no network.
 *
 *     node tests/update-offer.mjs        exit code is the number of failed checks, capped at 63
 *
 * THE SHELL'S HALF IS SLICED, as tests/join-policy.mjs slices the policy door: the version note's section of shell/main.js,
 * from its heading to the next section, evaluated with every name it reaches handed in here. The root key is passed in
 * where the reader reads it, by replacing the one constant in the sliced text with a stand-in key this file makes; the
 * shipped constant is held to relay/core.cjs's ROOT_PUB, and a note under the stand-in is refused under it. The fetch is a
 * stand-in answering from memory, so nothing leaves this machine.
 *
 * THE PAGE'S HALF is src/modules/update-offer.js imported over a stand-in window, its storage in memory: the dot, the
 * Menu's row, Settings' About lines, and Later's week.
 *
 * EVERY GUARD IS SHOWN RED (u-plants): the line carrying its plant tag is cut from the sliced text, or put in another form,
 * and the same case is read again in memory; nothing on disk is touched. Skipped under ETIUDA_PLANTS=off.
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = fs.readFileSync(path.join(ROOT, "shell", "main.js"), "utf8");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
const PLANTS = 11;
/* The floor: every check below runs, or the file says it did not complete. */
const EXPECTED = 54 + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

/* ---- the shell's section, sliced ------------------------------------------------------------------------------------ */
/* From the link rule, which the release page leaves by, to the end of the version note's section. */
const FROM = "/* A WEB ADDRESS LEAVES ONLY FOR A CLICK ON IT.";
const HEAD = "/* ---- the version note (board 991)";
const TAIL = "\n/* THE HARNESS'S OWN WINDOW";
function section(src) {
  const from = src.indexOf(FROM), at = src.indexOf(HEAD), end = src.indexOf(TAIL, at);
  if (from < 0 || at < from || src.indexOf(HEAD, at + 1) >= 0 || src.indexOf(FROM, from + 1) >= 0 || end < 0)
    throw new Error("the link rule and the version note's section are not in shell/main.js once, in that order");
  return src.slice(from, end);
}
const SPKI = (() => {
  const m = /const SPKI_ED25519 = Buffer\.from\("([0-9a-f]+)", "hex"\);/.exec(MAIN);
  if (!m) throw new Error("no SPKI_ED25519 in shell/main.js");
  return Buffer.from(m[1], "hex");
})();
const SHIPPED_ROOT = (() => {
  const m = /const NOTE_ROOT = "([0-9a-f]{64})";/.exec(section(MAIN));
  return m ? m[1] : "";
})();

const pubHex = k => k.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
const root = crypto.generateKeyPairSync("ed25519"), other = crypto.generateKeyPairSync("ed25519");
const ROOT_HEX = pubHex(root.publicKey);

/* One shell: the section evaluated over a user-data folder of its own, the engine's release, a window that hears what the
   shell sends, and stand-ins for ipcMain, the frame check and the browser. */
function shellOf(o) {
  const opt = o || {};
  let text = opt.text || section(MAIN);
  if (opt.root !== false) {
    const from = 'const NOTE_ROOT = "' + SHIPPED_ROOT + '";';
    if (text.split(from).length !== 2) throw new Error("NOTE_ROOT is not in the section once");
    text = text.replace(from, 'const NOTE_ROOT = "' + (opt.rootHex || ROOT_HEX) + '";');
  }
  const ud = opt.ud || fs.mkdtempSync(path.join(LAB, "ud-"));
  const sent = [], opened = [], on = {}, handle = {};
  const env = {
    Buffer, crypto, URL, AbortController, clearTimeout, fs, path, console: { error: () => {}, log: () => {} },
    setTimeout: opt.setTimeout || setTimeout,
    SPKI_ED25519: SPKI,
    app: { getPath: () => ud },
    engineVersion: () => (opt.running === undefined ? "2.0.0" : opt.running),
    writeReplacing: (f, t) => fs.writeFileSync(f, t, "utf8"),
    theWindow: { isDestroyed: () => false, webContents: { send: (ch, v) => sent.push([ch, v]) } },
    PLACED_ASIDE: !!opt.aside,
    harnessLaunch: () => !!opt.harness,
    updateLookOff: () => !!opt.policyOff,
    net: opt.net === undefined ? { fetch: () => { throw new Error("no network in a leg"); } } : opt.net,
    ipcMain: { on: (ch, fn) => { on[ch] = fn; }, handle: (ch, fn) => { handle[ch] = fn; } },
    fromEngine: e => !!(e && e.engine),
    shell: { openExternal: async u => { opened.push(u); } },
  };
  const names = Object.keys(env);
  const api = new Function(...names, text + "\nreturn { readNote, keepNote, versionAbove, fetchNote, noteBytes, keptNote, updateState, lookForNote, armNoteLook, NOTE_URL, NOTE_MAX, NOTE_FIRST_MS, NOTE_FILE };")(
    ...names.map(n => env[n]));
  return Object.assign(api, { ud, sent, opened, on, handle });
}

/* A note as the signing command would make it, signed by `key`; `body` reshapes the served JSON after signing. */
function note(fields, key, body) {
  const n = Object.assign({ kind: "etiuda-update-note", format: 1, app: "desk", serial: 5, version: "2.0.1", released: "2026-12-01",
    url: "https://etiuda.dev/desk/2.0.1/" }, fields || {});
  const bytes = Buffer.from(["etiuda-update-note", String(n.format), n.app, String(n.serial), n.version, n.released, n.url].join("\n"), "utf8");
  n.sig = { alg: "ed25519", keyId: "etiuda-root", value: crypto.sign(null, bytes, (key || root).privateKey).toString("hex") };
  return body ? body(n) : JSON.stringify(n);
}
/* A fetch from memory: `answer(url, init)` gives {status, body, length?, stream?}, and every call is kept. */
function fetchOf(answer) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const a = await answer(url, init);
    const bytes = Buffer.from(a.body == null ? "" : a.body);
    if (a.stream) {
      const rs = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 256) c.enqueue(new Uint8Array(bytes.subarray(i, i + 256))); c.close(); } });
      return new Response(rs, { status: a.status || 200 });
    }
    return new Response(bytes, { status: a.status || 200 });
  };
  f.calls = calls;
  return f;
}
const serve = text => fetchOf(() => ({ status: 200, body: text }));

const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "etiuda-update-offer-"));
const MOD = n => pathToFileURL(path.join(ROOT, "src", "modules", n)).href;
/* The shell's own timers are unref'd, so the leg holds the process open while it waits on them. */
const keepAlive = setInterval(() => {}, 60000);

try {
  /* ---- u1: the key, the route and the shape ------------------------------------------------------------------------ */
  const relayRoot = (/const ROOT_PUB = "([0-9a-f]{64})";/.exec(fs.readFileSync(path.join(ROOT, "relay", "core.cjs"), "utf8")) || [])[1];
  check(!!SHIPPED_ROOT && SHIPPED_ROOT === relayRoot, "u1a the shell's root key is relay/core.cjs's ROOT_PUB (" + SHIPPED_ROOT.slice(0, 12) + ")");
  const S0 = shellOf();
  check(S0.NOTE_URL === "https://etiuda.dev/licence/v1/note/desk" && S0.NOTE_MAX === 1024,
    "u1b the desk asks the production route, " + S0.NOTE_URL + ", and reads at most " + S0.NOTE_MAX + " bytes");
  const real = shellOf({ root: false });
  check(real.readNote(note()).why === "signature" && S0.readNote(note()).note,
    "u1c a note under the stand-in key holds where the stand-in is passed in, and is refused under the shipped root key");

  /* ---- u2: the reader, one refusal per bound ----------------------------------------------------------------------- */
  const why = t => { const r = S0.readNote(t); return r.note ? "held" : r.why; };
  check(why(note()) === "held" && why(Buffer.from(note())) === "held", "u2a a note signed by the root, as a string or as bytes, holds");
  check(why(note({}, other)) === "signature", "u2b a note signed by another key is refused: " + why(note({}, other)));
  check(why(note({ app: "studio" })) === "app", "u2c Studio's note is refused by the desk: " + why(note({ app: "studio" })));
  const urls = ["http://etiuda.dev/desk/2.0.1/", "https://etiuda.dev.example/x", "https://example.com/desk", "https://etiuda.dev:8443/desk",
    "https://etiuda.dev/desk?x=1", "https://etiuda.dev/desk#x", "https://etiuda.dev/../x", "https://etiuda.dev/", "https://user@etiuda.dev/x",
    "https://etiuda.dev/a%2Fb"];
  const urlWhy = urls.map(u => why(note({ url: u })));
  check(urlWhy.every(w => w === "url"), "u2d an address not https on etiuda.dev, with a port, user, query, fragment, dot or percent segment, or none, is refused: " + urlWhy.join(" "));
  const big = note({}, root, n => JSON.stringify(n) + " ".repeat(1100));
  check(Buffer.byteLength(big) > 1024 && why(big) === "size", "u2e a note over 1024 bytes, otherwise whole and signed, is refused: " + why(big));
  const bad = [["{", "json"], ["[]", "json"], ["null", "json"], [note({}, root, n => JSON.stringify(Object.assign(n, { extra: 1 }))), "fields"],
    [note({}, root, n => { delete n.released; return JSON.stringify(n); }), "fields"], [note({ kind: "etiuda-relay-grant" }), "kind"],
    [note({ format: 2 }), "format"], [note({ serial: 0 }), "serial"], [note({ serial: 1.5 }), "serial"], [note({ version: "2.0.1-beta" }), "version"],
    [note({ version: "02.0.1" }), "version"], [note({ released: "2026-02-30" }), "released"], [note({ released: "2019-12-01" }), "released"],
    [note({}, root, n => JSON.stringify(n).replace("2.0.1/", "2.0.1/" + String.fromCharCode(0xe9))), "bytes"],
    [note({}, root, n => { n.sig.alg = "rsa"; return JSON.stringify(n); }), "sig"],
    [note({}, root, n => { n.sig.value = n.sig.value.toUpperCase(); return JSON.stringify(n); }), "sig"],
    [note({}, root, n => JSON.stringify(Object.assign(n, { version: "2.0.2" }))), "signature"]];
  const badGot = bad.map(([t, w]) => why(t) === w ? "" : w + "->" + why(t)).filter(Boolean);
  check(badGot.length === 0, "u2f malformed, unknown-field, missing-field, wrong-kind, out-of-bound and changed-after-signing notes are each refused by their check"
    + (badGot.length ? ": " + badGot.join(", ") : ""));
  const kept0 = S0.readNote(note({ serial: 5 })).note;
  check(S0.keepNote(S0.readNote(note({ serial: 4, version: "2.0.2" })).note, kept0) === "refused"
    && S0.keepNote(S0.readNote(note({ serial: 5, version: "2.0.2" })).note, kept0) === "refused"
    && S0.keepNote(S0.readNote(note({ serial: 5 })).note, kept0) === "same"
    && S0.keepNote(S0.readNote(note({ serial: 6, version: "2.0.2" })).note, kept0) === "taken"
    && S0.keepNote(kept0, null) === "taken",
    "u2g against a kept serial 5: a lower serial and the same serial with other bytes are refused, the same bytes are the same, a higher serial is taken");
  check(S0.versionAbove("2.0.1", "2.0.0") && S0.versionAbove("2.10.0", "2.9.9") && !S0.versionAbove("2.0.1", "2.0.1")
    && !S0.versionAbove("2.0.0", "2.0.1") && !S0.versionAbove("2.0.1", ""), "u2h releases compare as three numbers, an equal one is not above");

  /* ---- u3: the bounded GET ----------------------------------------------------------------------------------------- */
  const f1 = serve(note());
  const got1 = await S0.fetchNote(f1, S0.NOTE_URL);
  const init = f1.calls[0] && f1.calls[0].init;
  check(f1.calls.length === 1 && f1.calls[0].url === S0.NOTE_URL && init.method === "GET" && init.redirect === "error"
    && init.cache === "no-store" && init.credentials === "omit" && init.body === undefined && init.headers === undefined && !!init.signal
    && Buffer.isBuffer(got1) && got1.toString() === note(),
    "u3a one GET to the route, no body and no header of its own, no redirect followed, nothing cached, no cookie, an abort signal, and the bytes as served");
  const refusedAt = [];
  for (const u of ["http://etiuda.dev/licence/v1/note/desk", "https://example.com/licence/v1/note/desk", "https://etiuda.dev:8443/x", "https://a@etiuda.dev/x"]) {
    const f = serve(note());
    let threw = false;
    try { await S0.fetchNote(f, u); } catch { threw = true; }
    if (!threw || f.calls.length) refusedAt.push(u);
  }
  check(refusedAt.length === 0, "u3b an address not https on etiuda.dev, or with a port or a user, is refused before anything is sent" + (refusedAt.length ? ": " + refusedAt.join(" ") : ""));
  const statuses = [];
  for (const st of [404, 429, 500, 301]) {
    let threw = false;
    try { await S0.fetchNote(fetchOf(() => ({ status: st, body: note() })), S0.NOTE_URL); } catch { threw = true; }
    statuses.push(st + (threw ? " refused" : " READ"));
  }
  check(statuses.every(s => / refused$/.test(s)), "u3c any answer but 200 is refused: " + statuses.join(", "));
  let capThrew = false, capLen = -1;
  try { capLen = (await S0.fetchNote(fetchOf(() => ({ status: 200, body: "x".repeat(5000), stream: true })), S0.NOTE_URL)).length; } catch { capThrew = true; }
  check(capThrew, "u3d a body streamed past 1024 bytes with no length said is refused while it is read" + (capThrew ? "" : ", got " + capLen));
  let edge = -1;
  try { edge = (await S0.fetchNote(fetchOf(() => ({ status: 200, body: "x".repeat(1024), stream: true })), S0.NOTE_URL)).length; } catch { edge = -2; }
  check(edge === 1024, "u3e a body of exactly 1024 bytes is read whole: " + edge);
  let aborted = false, lateThrew = false;
  const t0 = Date.now();
  try {
    await S0.fetchNote((u, i) => new Promise(() => { i.signal.addEventListener("abort", () => { aborted = true; }); }), S0.NOTE_URL, 60);
  } catch { lateThrew = true; }
  check(lateThrew && aborted && Date.now() - t0 < 2000, "u3f a note that does not arrive is given up at the bound and its request aborted (" + (Date.now() - t0) + " ms)");
  const redirector = fetchOf((u, i) => {
    if (i.redirect === "error") throw new TypeError("fetch failed: redirect");
    return { status: 200, body: note({ version: "9.0.0", serial: 9 }) };
  });
  const S3 = shellOf();
  const look3 = await S3.lookForNote(redirector);
  check(look3 === "failed" && S3.updateState().offer === "", "u3g a route that redirects reads as a failed look and offers nothing: " + look3);

  /* ---- u4: the shell's offer, kept and judged ---------------------------------------------------------------------- */
  const S4 = shellOf();
  check(S4.updateState().offer === "" && S4.updateState().look === "", "u4a before any look nothing is offered and no look has ended");
  const l1 = await S4.lookForNote(serve(note({ serial: 5, version: "2.0.1" })));
  const file = path.join(S4.ud, S4.NOTE_FILE);
  check(l1 === "read" && S4.updateState().offer === "2.0.1" && fs.existsSync(file) && fs.readFileSync(file, "utf8") === note({ serial: 5, version: "2.0.1" })
    && S4.sent.length === 1 && S4.sent[0][0] === "etiuda:update" && S4.sent[0][1].offer === "2.0.1" && S4.sent[0][1].look === "read",
    "u4b a valid note for 2.0.1 over the running 2.0.0 is offered, kept byte for byte beside desk.json, and sent to the page");
  const l2 = await S4.lookForNote(serve(note({ serial: 4, version: "2.0.2" })));
  check(l2 === "read" && S4.updateState().offer === "2.0.1" && fs.readFileSync(file, "utf8") === note({ serial: 5, version: "2.0.1" }),
    "u4c an older note served again, serial 4 naming 2.0.2, changes nothing: the kept 2.0.1 stands");
  const l2b = await S4.lookForNote(serve(note({ serial: 5, version: "2.0.3" })));
  check(l2b === "read" && S4.updateState().offer === "2.0.1", "u4d the same serial with another release is refused, the kept note stands");
  const refusals = [];
  for (const [label, text] of [["another key", note({ serial: 7, version: "2.0.7" }, other)], ["Studio's", note({ serial: 7, version: "2.0.7", app: "studio" })],
    ["off etiuda.dev", note({ serial: 7, version: "2.0.7", url: "https://example.com/x" })], ["http", note({ serial: 7, version: "2.0.7", url: "http://etiuda.dev/x" })],
    ["oversized", note({ serial: 7, version: "2.0.7" }, root, n => JSON.stringify(n) + " ".repeat(1100))], ["malformed", "{\"kind\":"]]) {
    const before = S4.sent.length;
    const l = await S4.lookForNote(serve(text));
    const s = S4.updateState();
    if (l !== "failed" || s.offer !== "2.0.1" || s.look !== "failed" || S4.sent.length !== before + 1 || S4.sent[before][1].offer !== "2.0.1") refusals.push(label);
  }
  check(refusals.length === 0, "u4e a note signed by another key, Studio's, one pointing off etiuda.dev or over http, an oversized and a malformed one each fail the look and change nothing"
    + (refusals.length ? ": " + refusals.join(", ") : ""));
  const l404 = await S4.lookForNote(fetchOf(() => ({ status: 404, body: "" })));
  check(l404 === "failed" && S4.updateState().offer === "2.0.1", "u4f the route not there yet (404) is a failed look, and a note kept before still offers");
  const S4b = shellOf({ ud: S4.ud });
  check(S4b.updateState().offer === "2.0.1" && S4b.updateState().look === "", "u4g a fresh start reads the kept note back through the same checks and offers it before any look");
  const S4c = shellOf({ ud: S4.ud, running: "2.0.1" });
  check(S4c.updateState().offer === "", "u4h the running release equal to the offered one shows nothing");
  const S4d = shellOf({ ud: S4.ud, running: "2.0.3" });
  check(S4d.updateState().offer === "", "u4i a running release above the offered one shows nothing");
  const Sbad = shellOf();
  fs.writeFileSync(path.join(Sbad.ud, Sbad.NOTE_FILE), note({ serial: 5, version: "2.0.1" }).replace("2.0.1/", "2.0.9/"));
  check(Sbad.updateState().offer === "", "u4j a kept file changed after signing is dropped as though none were kept");
  const S4e = shellOf();
  await S4e.lookForNote(serve(note({ serial: 5, version: "2.0.1" })));
  await S4e.lookForNote(serve(note({ serial: 6, version: "2.0.2", url: "https://etiuda.dev/desk/2.0.2/" })));
  check(S4e.updateState().offer === "2.0.2" && S4e.readNote(fs.readFileSync(path.join(S4e.ud, S4e.NOTE_FILE))).note.serial === 6,
    "u4k a higher serial naming 2.0.2 replaces the kept note and is offered");

  /* ---- u5: the release page, and the timer ------------------------------------------------------------------------- */
  const open = S4e.handle["etiuda:update-open"], click = ev => { const e = Object.assign({}, ev); S4e.on["etiuda:update-click"](e); return e; };
  const unclicked = open({ engine: true }), openedBefore = S4e.opened.length;
  click({ engine: false });
  const otherFrameClick = open({ engine: true }), openedOther = S4e.opened.length;
  click({ engine: true });
  const notEngine = open({ engine: false });
  const okOpen = open({ engine: true });
  const spent = open({ engine: true });
  check(unclicked === false && openedBefore === 0 && otherFrameClick === false && openedOther === 0 && notEngine === false
    && okOpen === true && spent === false && S4e.opened.length === 1 && S4e.opened[0] === "https://etiuda.dev/desk/2.0.2/",
    "u5a the release page leaves for a click on its button alone, from the engine's own frame, once a click, at the kept note's address: "
    + JSON.stringify(S4e.opened));
  const S5 = shellOf({ running: "2.0.1" });
  await S5.lookForNote(serve(note({ serial: 5, version: "2.0.1" })));
  S5.on["etiuda:update-click"]({ engine: true });
  check(S5.handle["etiuda:update-open"]({ engine: true }) === false && S5.opened.length === 0,
    "u5b with no offer standing, a click on the button opens nothing");
  const stateEv = { engine: true }, otherEv = { engine: false };
  S4e.on["etiuda:update-state"](stateEv); S4e.on["etiuda:update-state"](otherEv);
  check(stateEv.returnValue && stateEv.returnValue.offer === "2.0.2" && otherEv.returnValue === null && Object.keys(stateEv.returnValue).sort().join() === "look,offer",
    "u5c the page asks {offer, look} and is told nothing else, the address included; another frame is told nothing");
  const timers = [];
  const fakeTimer = (fn, ms) => { timers.push(ms); return { unref() {} }; };
  const S5a = shellOf({ aside: true, setTimeout: fakeTimer, net: { fetch: () => { throw new Error("reached"); } } });
  S5a.armNoteLook();
  const S5b = shellOf({ setTimeout: fakeTimer, net: { fetch: () => { throw new Error("reached"); } } });
  S5b.armNoteLook(); S5b.armNoteLook();
  check(timers.length === 1 && timers[0] === 60 * 1000 && S5b.NOTE_FIRST_MS === 60000,
    "u5d the first look is armed a minute after the window opens, once, and never from the harness's own window: " + JSON.stringify(timers));
  /* u5d2: any harness start (--user-data-dir, ETIUDA_TEST_DOCUMENTS and the rest, harnessLaunch) arms no look, so a leg past a
     minute never asks production etiuda.dev (the test architect's edit on 04147d77). */
  const harnessTimers = [];
  const S5e = shellOf({ harness: true, setTimeout: (fn, ms) => { harnessTimers.push(ms); return { unref() {} }; }, net: { fetch: () => { throw new Error("reached"); } } });
  S5e.armNoteLook();
  check(harnessTimers.length === 0, "u5d2 a harness start arms no look at all: " + JSON.stringify(harnessTimers));
  /* u5d3: machine policy turns the look off (DeskNoUpdateCheck, Claude α's decision 10 of 2026-11-11): no look is armed,
     and a note kept before the policy was set offers nothing. */
  const offTimers = [];
  const S5f = shellOf({ policyOff: true, setTimeout: (fn, ms) => { offTimers.push(ms); return { unref() {} }; }, net: { fetch: () => { throw new Error("reached"); } } });
  S5f.armNoteLook();
  check(offTimers.length === 0, "u5d3 machine policy that turns the look off arms no look at all: " + JSON.stringify(offTimers));
  const S5g = shellOf({ ud: S4.ud, policyOff: true });
  check(S5g.updateState().offer === "" && shellOf({ ud: S4.ud }).updateState().offer === "2.0.1",
    "u5d4 under that policy a note kept before offers nothing, and the same folder without it still offers 2.0.1");
  /* The preload: a trusted click whose path holds the release page's button tells main so; an untrusted one, or a middle
     click, does not; and E_HOST carries the three verbs. */
  const pre = { sync: [], invoke: [], listeners: {} };
  const savedWindow = globalThis.window;
  globalThis.window = { addEventListener: (t, fn) => { pre.listeners[t] = fn; } };
  const bridge = {};
  new Function("require", "process", fs.readFileSync(path.join(ROOT, "shell", "preload.js"), "utf8"))(
    n => (n === "electron" ? {
      contextBridge: { exposeInMainWorld: (k, v) => { bridge[k] = v; }, executeInMainWorld: () => {} },
      ipcRenderer: { sendSync: (ch, ...a) => { pre.sync.push(ch); return ch === "etiuda:host" ? { platform: "win32" } : null; },
        invoke: (ch, ...a) => { pre.invoke.push(ch); return Promise.resolve(true); }, send: () => {}, on: () => {} },
      webUtils: { getPathForFile: () => "" } } : null),
    { argv: ["electron", "."] });
  const button = { localName: "button", dataset: { eOpen: "update" } }, plainBtn = { localName: "button", dataset: {} };
  const fire = (type, trusted, pathNodes, btn) => pre.listeners[type] && pre.listeners[type]({ type, isTrusted: trusted, button: btn || 0, composedPath: () => pathNodes });
  const base = pre.sync.length;
  fire("click", false, [button]); fire("click", true, [plainBtn]); fire("auxclick", true, [button], 1);
  const quiet = pre.sync.slice(base).length;
  fire("click", true, [{ localName: "span", dataset: {} }, button]);
  const heard = pre.sync.slice(base);
  const H = bridge.E_HOST || {};
  H.updateState(); H.openUpdatePage();
  globalThis.window = savedWindow;
  check(quiet === 0 && heard.length === 1 && heard[0] === "etiuda:update-click" && pre.sync[pre.sync.length - 1] === "etiuda:update-state"
    && pre.invoke[pre.invoke.length - 1] === "etiuda:update-open" && typeof H.onUpdate === "function",
    "u5e the preload tells main of a trusted click on the release page's button alone, and E_HOST asks the state and the open");

  /* ---- u6: the page ------------------------------------------------------------------------------------------------ */
  const mem = new Map();
  const store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(String(k), String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] || null, get length() { return mem.size; } };
  const els = {};
  const el = id => (els["#" + id] = { id, hidden: true, attrs: {}, textContent: "", title: "",
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } });
  ["settingsBtn", "updDot", "menuUpdate", "menuUpdateT", "menuUpdateSee", "menuUpdateLater", "menuUpdateSep"].forEach(el);
  let hostState = { offer: "2.0.1", look: "read" }, onUpdate = null, pageOpened = 0;
  const host = { updateState: () => hostState, onUpdate: fn => { onUpdate = fn; }, openUpdatePage: () => { pageOpened++; return Promise.resolve(true); } };
  globalThis.window = { localStorage: store, sessionStorage: store, addEventListener() {}, removeEventListener() {}, E_HOST: host };
  globalThis.localStorage = store;
  globalThis.document = { querySelector: s => els[s] || null, addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
  store.setItem("eUiLang", "en");
  const UP = await import(MOD("update-offer.js"));
  UP.wireUpdateOffer();
  const dot = els["#updDot"], row = els["#menuUpdate"];
  check(!dot.hidden && !row.hidden && !els["#menuUpdateSep"].hidden && els["#menuUpdateT"].textContent === "Etiuda 2.0.1 is available"
    && els["#menuUpdateSee"].textContent === "See what's new" && els["#menuUpdateSee"].title === "Opens the page of this release"
    && els["#menuUpdateLater"].textContent === "Later",
    "u6a an offer shows the dot and the Menu's first row: Etiuda 2.0.1 is available, See what's new and Later");
  check(dot.getAttribute("aria-label") === "A newer Etiuda is available: 2.0.1" && dot.title === "A newer Etiuda is available: 2.0.1"
    && els["#settingsBtn"].getAttribute("aria-describedby") === "updDot",
    "u6b the dot says itself in words, to the pointer and to a screen reader through the Menu button");
  UP.openUpdatePage();
  check(pageOpened === 1, "u6c See what's new asks the shell to open the release page, naming no address");
  const T = Date.parse("2026-12-02T10:00:00Z"), WEEK = 7 * 24 * 60 * 60 * 1000;
  UP.updateLater(T);
  const later = JSON.parse(store.getItem("eUpdateLater"));
  check(later.version === "2.0.1" && later.until === T + WEEK && UP.UPDATE_LATER_MS === 604800000,
    "u6d Later keeps {version 2.0.1, until} a week from the press, in the desk's own store");
  const held = UP.updateLaterHeld(), st = { offer: "2.0.1", look: "read" };
  check(UP.updateInMenu(st, held, T) === "" && UP.updateInMenu(st, held, T + WEEK - 1) === "" && UP.updateInMenu(st, held, T + WEEK) === "2.0.1",
    "u6e put off, 2.0.1 shows nothing for the week, and comes back the moment the week ends");
  check(UP.updateInMenu({ offer: "2.0.2", look: "read" }, held, T + 1) === "2.0.2", "u6f a still newer release, 2.0.2, shows at once within that week");
  const aboutOff = UP.updateAbout("2.0.0");
  check(aboutOff && aboutOff.lines.join(" | ") === "This version: 2.0.0 | Newest available: 2.0.1" && aboutOff.offer === "2.0.1",
    "u6g About shows the running and the offered release one above the other, put off or not: " + (aboutOff && aboutOff.lines.join(" | ")));
  onUpdate({ offer: "", look: "read" });
  check(dot.hidden && row.hidden && UP.updateAbout("2.0.0").lines[1] === "This is the newest version.",
    "u6h with nothing newer the dot and the row go, and About says This is the newest version.");
  onUpdate({ offer: "", look: "failed" });
  const failLine = "Whether a newer version exists could not be checked just now. This one works as it is.";
  check(dot.hidden && row.hidden && UP.updateAbout("2.0.0").lines[1] === failLine, "u6i a look that failed shows nothing but About's could-not-check line");
  onUpdate({ offer: "", look: "" });
  check(UP.updateAbout("2.0.0").lines[1] === failLine, "u6j before any look ends, About says the same line");
  onUpdate({ offer: "<b>2</b>", look: "read" });
  check(dot.hidden && row.hidden, "u6k an answer not shaped as a release shows nothing");
  store.setItem("eUiLang", "pl");
  onUpdate({ offer: "2.0.2", look: "read" });
  const pl = UP.updateAbout("2.0.0").lines.join(" | ");
  check(els["#menuUpdateT"].textContent === "Dostępna jest Etiuda 2.0.2" && els["#menuUpdateSee"].textContent === "Co nowego"
    && els["#menuUpdateLater"].textContent === "Później" && dot.getAttribute("aria-label") === "Dostępna jest nowsza Etiuda: 2.0.2"
    && pl === "Ta wersja: 2.0.0 | Najnowsza dostępna: 2.0.2",
    "u6l in Polish the row, the dot and About read the copywriter's words: " + pl);
  store.setItem("eUiLang", "en");
  window.E_HOST = undefined;
  UP.syncUpdateOffer();
  check(dot.hidden && row.hidden && UP.updateAbout("2.0.0") === null, "u6m in a browser nothing is shown and About keeps its bare version");
  window.E_HOST = host;

  /* ---- u7: the markup the page draws into ------------------------------------------------------------------------- */
  const tpl = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const menuAt = tpl.indexOf('<div class="menu" id="settingsMenu"'), firstBtn = tpl.indexOf("<button", menuAt), rowAt = tpl.indexOf('id="menuUpdate"', menuAt);
  check(menuAt > 0 && rowAt > menuAt && rowAt < firstBtn && /<button type="button" role="menuitem" data-act="update-see" data-e-open="update" id="menuUpdateSee"><\/button><button type="button" role="menuitem" data-act="update-later" id="menuUpdateLater"><\/button>/.test(tpl),
    "u7a the row stands first in the Menu, its two actions ordinary buttons the Menu's keys walk, See what's new marked for the preload");
  check(/id="settingsBtn"[^>]*>(?:(?!<\/button>)[\s\S])*<span class="upd-dot" id="updDot" role="img" data-i18n-skip hidden><\/span><\/button>/.test(tpl),
    "u7b the dot is inside the Menu button, hidden until an offer stands");
  const hm = fs.readFileSync(path.join(ROOT, "src", "modules", "header-menus.js"), "utf8");
  check(/act==="update-see"\)\{ closeSettingsMenu\(\); openUpdatePage\(\); \}/.test(hm) && /act==="update-later"\)\{ closeSettingsMenu\(\); updateLater\(\); \}/.test(hm)
    && /function syncSettingsMenu\(\)\{[^}]*syncUpdateOffer\(\);/.test(hm),
    "u7c the Menu's two actions open the page and put the offer off, and every open of the Menu reads the offer afresh");
  const built = fs.readFileSync(path.join(ROOT, "engine", "etiuda.html"), "utf8");
  check(built.indexOf("Whether a newer version exists could not be checked just now.") > 0 && built.indexOf('id="menuUpdateSee"') > 0,
    "u7d the built engine carries the offer's words and markup");

  /* ---- u-plants: each guard lifted in memory, its case read again ------------------------------------------------- */
  if (PLANTS_OFF) console.log("  SKIP  u-plants: ETIUDA_PLANTS=off");
  else {
    const SEC = section(MAIN);
    const lifted = (tag, replacement) => {
      const lines = SEC.split("\n"), at = lines.findIndex(l => l.indexOf(tag) >= 0);
      if (at < 0 || lines.findIndex((l, i) => i > at && l.indexOf(tag) >= 0) >= 0) throw new Error(tag + " is not in the section once");
      lines.splice(at, 1, ...(replacement === undefined ? [] : [replacement]));
      return shellOf({ text: lines.join("\n") });
    };
    const P = lifted("plant:note-size");
    check(!!P.readNote(big).note, "u-plant note-size lifted lets the 1100-byte note through");
    check(!!lifted("plant:note-app").readNote(note({ app: "studio" })).note, "u-plant note-app lifted lets Studio's note through");
    check(!!lifted("plant:note-url").readNote(note({ url: "https://example.com/x" })).note, "u-plant note-url lifted lets an address off etiuda.dev through");
    check(!!lifted("plant:note-sig").readNote(note({}, other)).note, "u-plant note-sig lifted lets another key's note through");
    const PS = lifted("plant:note-serial");
    check(PS.keepNote(PS.readNote(note({ serial: 4, version: "2.0.2" })).note, PS.readNote(note({ serial: 5 })).note) === "taken",
      "u-plant note-serial lifted takes a lower serial");
    const PE = lifted("plant:note-equal", "  return true;");
    check(PE.versionAbove("2.0.1", "2.0.1") === true, "u-plant note-equal turned counts the running release as above itself");
    const PO = lifted("plant:note-origin");
    const fo = serve(note());
    let reached = false;
    try { await PO.fetchNote(fo, "http://etiuda.dev/licence/v1/note/desk"); reached = fo.calls.length === 1; } catch { reached = fo.calls.length === 1; }
    check(reached, "u-plant note-origin lifted sends a request over http");
    const PR = lifted("plant:note-redirect", '    const res = await fetchFn(u.href, { method: "GET", redirect: "follow", cache: "no-store", credentials: "omit", signal: ctl ? ctl.signal : undefined });');
    check((await PR.lookForNote(redirector)) === "read" && PR.updateState().offer === "9.0.0", "u-plant note-redirect turned follows the redirect and offers what it found");
    const PC = lifted("plant:note-cap");
    let capLifted = false;
    try { capLifted = (await PC.fetchNote(fetchOf(() => ({ status: 200, body: "x".repeat(5000), stream: true })), PC.NOTE_URL)).length === 5000; } catch { capLifted = false; }
    check(capLifted, "u-plant note-cap lifted reads a 5000-byte stream whole");
    const PU = lifted("plant:update-open-offer", "  if (kept) linkClicked = { href: new URL(kept.url).href, at: Date.now() };");
    await PU.lookForNote(serve(note({ serial: 5, version: "2.0.0" })));
    PU.on["etiuda:update-click"]({ engine: true });
    check(PU.handle["etiuda:update-open"]({ engine: true }) === true && PU.opened.length === 1, "u-plant update-open-offer turned opens a page with no offer standing");
    const pageSrc = fs.readFileSync(path.join(ROOT, "src", "modules", "update-offer.js"), "utf8");
    const fnAt = pageSrc.indexOf("function updateInMenu("), fnEnd = pageSrc.indexOf("\n}\n", fnAt) + 2;
    const fnText = pageSrc.slice(fnAt, fnEnd).split("\n").filter(l => l.indexOf("plant:later-holds") < 0).join("\n");
    const liftedMenu = new Function(fnText + "\nreturn updateInMenu;")();
    check(fnAt > 0 && liftedMenu(st, held, T) === "2.0.1", "u-plant later-holds lifted shows the put-off release within its week");
  }
} catch (e) {
  check(false, "the leg stopped: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" / ") : String(e)));
} finally {
  clearInterval(keepAlive);
  try { fs.rmSync(LAB, { recursive: true, force: true }); } catch { /* left for the system's temp sweep */ }
}

const complete = asserted === EXPECTED;
console.log("\nupdate-offer: " + (asserted - failed) + "/" + asserted + " passed" + (complete ? "" : ", expected " + EXPECTED + " checks: NOT COMPLETE"));
process.exit(failed > 0 ? Math.min(failed, 63) : complete ? 0 : 78);
