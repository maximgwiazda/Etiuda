"use strict";
/* THE SYNC OF A PERSON'S STORE: what follows the person between their computers, kept in this computer's own place in the store
   (desks/<its id>/), sealed under K by the relay channel (shell/relay/channel.cjs), and merged on read from every other computer's
   place. Pure but for what the caller passes in, so legs run it over stand-ins.

   WHAT FOLLOWS is an allowlist and nothing else reaches the store: the settings named in SETTINGS, the personal layer's own edits
   over a catalog (LAYER_RE), and the person's own catalog files. A team's key, its mirror, a sign-in token and the desk's identity
   live elsewhere (desk.json's envelope, signin.json, the relay's mirrors) and are never read here.

   THE MERGE, per item: a setting by the later write; an edit or a catalog file by the later write where only one computer changed it
   since it last took the other's, and where both changed it, both kept: this computer keeps its own in place and the other's as a
   copy the person chooses from (resolve). Each entry names who wrote it, when, and the other computers' entries it was made over
   (`seen`), so "changed since it last took the other's" is read from the entries alone. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SYNC_NAME = "sync.json";
const SYNC_KIND = "etiuda-store-sync";
const SETTINGS = ["eUiLang", "eTheme", "eAgent", "eLang", "eMotionOff", "eGlassOff", "eDeckOff", "ePills", "eHdrPills", "eShortcuts",
  "eNoteHover", "eCollapsed", "eNotifyEditionOff", "eNotifyCatalogOff", "eSearchAiOff"];
/* The personal layer's own edits over a catalog, loose or under the catalog's namespace (src/modules/storage.js LAYER_KEYS); its
   counts, its team shares and its edition marks stay with the computer. */
const LAYER_RE = /^e(?:[0-9a-z]+~)?(?:Pack|CatOrder|IntentOrder|IntentsAside|LinksAside|RequestsAside)$/;
const CATALOG_RE = /^[^\\/:*?"<>|\u0000-\u001f]{1,120}\.ec$/i;
const CATALOG_MAX = 20 * 1024 * 1024;
const VALUE_MAX = 8 * 1024 * 1024;
const ITEMS_MAX = 65536;
const ID_RE = /^k-[0-9a-f]{16}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const sha = text => crypto.createHash("sha256").update(Buffer.from(String(text), "utf8")).digest("hex");
const has = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const plain = v => !!v && typeof v === "object" && !Array.isArray(v);

/* An item is "k:<desk key>", "f:<catalog file name>", or one field of a personal layer's key, "k:<key>#<field>" or, for a field that
   is a map, "k:<key>#<field>/<its key>", so two computers changing different cards of one catalog both stand with no copy kept. */
function follows(item) {
  const s = String(item), at = s.indexOf("#");
  if (s.startsWith("k:") && at > 0) return LAYER_RE.test(s.slice(2, at)) && at < s.length - 1;
  if (s.startsWith("k:")) return SETTINGS.indexOf(s.slice(2)) >= 0 || LAYER_RE.test(s.slice(2)); /* plant:follows */
  if (s.startsWith("f:")) return CATALOG_RE.test(s.slice(2));
  return false;
}
const isSetting = item => String(item).startsWith("k:") && SETTINGS.indexOf(String(item).slice(2)) >= 0;
/* Where a catalog's bytes sit in a computer's place: by a hash of its name, so no file name meets the relay's path rules. */
const fileRel = (id, item) => "desks/" + id + "/c/" + sha(item).slice(0, 32) + ".ec";
const syncRel = id => "desks/" + id + "/" + SYNC_NAME;

/* This computer's items as they stand: its desk keys and catalog files, each that follows, value by item. */
function localItems(keys, files) {
  const out = {};
  for (const k of Object.keys(plain(keys) ? keys : {})) {
    const v = keys[k];
    if (typeof v !== "string" || v.length > VALUE_MAX || !follows("k:" + k)) continue;
    const parts = LAYER_RE.test(k) ? fieldsOf(v) : null; /* plant:fields */
    if (!parts) { out["k:" + k] = v; continue; }
    for (const p of Object.keys(parts)) out["k:" + k + "#" + p] = parts[p];
  }
  for (const n of Object.keys(plain(files) ? files : {})) {
    const v = files[n];
    if (typeof v === "string" && Buffer.byteLength(v, "utf8") <= CATALOG_MAX && follows("f:" + n)) out["f:" + n] = v;
  }
  return out;
}

/* A layer's value as its fields, each field's value as JSON text and a map field by its keys; null where it is no JSON object. */
function fieldsOf(text) {
  let j = null;
  try { j = JSON.parse(text); } catch { return null; }
  if (!plain(j)) return null;
  const out = {};
  for (const f of Object.keys(j)) {
    if (f.indexOf("/") >= 0 || f.indexOf("#") >= 0) return null;
    if (plain(j[f]) && Object.keys(j[f]).length) { for (const k of Object.keys(j[f])) out[f + "/" + k] = JSON.stringify(j[f][k]); }
    else out[f] = JSON.stringify(j[f]);
  }
  return out;
}
/* The layer key an item is a field of, or "". */
const layerOf = item => { const s = String(item), at = s.indexOf("#"); return s.startsWith("k:") && at > 0 ? s.slice(2, at) : ""; };
/* A layer key's value put back together from its field items, null where none stands. */
function layerText(items, key) {
  const pre = "k:" + key + "#", out = {};
  let any = false;
  for (const item of Object.keys(items).sort()) {
    if (!item.startsWith(pre)) continue;
    let v;
    try { v = JSON.parse(items[item]); } catch { continue; }
    const rest = item.slice(pre.length), at = rest.indexOf("/");
    any = true;
    if (at < 0) out[rest] = v;
    else { const f = rest.slice(0, at); if (!plain(out[f])) out[f] = {}; out[f][rest.slice(at + 1)] = v; }
  }
  return any ? JSON.stringify(out) : null;
}

function entryOf(e) {
  if (!plain(e) || !(e.h === null || HEX64.test(String(e.h))) || !ID_RE.test(String(e.by)) || !Number.isSafeInteger(e.t) || e.t < 0) return null;
  const seen = {};
  for (const k of Object.keys(plain(e.seen) ? e.seen : {})) if (ID_RE.test(k) && Number.isSafeInteger(e.seen[k])) seen[k] = e.seen[k];
  return { h: e.h, by: e.by, t: e.t, seen };
}
/* Another computer's sync file as read from the mirror, or null: {by, items: {item: entry with v for a key}}. */
function syncRead(text, by) {
  let j = null;
  try { j = JSON.parse(String(text)); } catch { j = null; }
  if (!plain(j) || j.kind !== SYNC_KIND || j.format !== 1 || j.by !== by || !plain(j.items)) return null;
  const items = {};
  for (const item of Object.keys(j.items).slice(0, ITEMS_MAX)) {
    if (!follows(item)) continue;
    const e = entryOf(j.items[item]);
    if (!e) continue;
    if (item.startsWith("k:") && e.h !== null) { const v = j.items[item].v; if (typeof v !== "string" || sha(v) !== e.h) continue; e.v = v; }
    items[item] = e;
  }
  return { by, items };
}
function syncText(me, ledger, local) {
  const items = {};
  for (const item of Object.keys(ledger).sort()) {
    const e = ledger[item];
    items[item] = Object.assign({ h: e.h, by: e.by, t: e.t, seen: e.seen }, item.startsWith("k:") && e.h !== null && has(local, item) ? { v: local[item] } : {});
  }
  return JSON.stringify({ kind: SYNC_KIND, format: 1, by: me, items });
}

/* Whether entry a was made over entry b: a later write of the same computer, or one that took b first. */
const over = (a, b) => (a.by === b.by ? a.t > b.t : has(a.seen, b.by) && a.seen[b.by] >= b.t);
const same = (a, b) => a.by === b.by && a.t === b.t;
const unionSeen = (...es) => {
  const out = {};
  for (const e of es) if (e) {
    for (const k of Object.keys(e.seen || {})) out[k] = Math.max(out[k] || 0, e.seen[k]);
    out[e.by] = Math.max(out[e.by] || 0, e.t);
  }
  return out;
};

/* ONE MERGE. `state` {ledger: {item: entry}, kept: [{item, by, t, h}]} is this computer's, kept between runs whatever store it
   syncs to, so a computer that moves to another store carries every edit there. `local` its items now (localItems), `theirs` the
   other computers' sync files (syncRead) with fileOf(by, item) answering a catalog's text from their place. Answers {state, patch,
   copies, own}: patch {item: value, or null to remove} to apply here; copies the other side of each item both changed, to keep for
   the person ({item, by, t, value}); own {rel: text} this computer's place to write into the mirror. */
function mergeOnce(o) {
  const me = o.me, now = Math.floor(o.now), local = o.local || {};
  const ledger = Object.assign({}, (o.state && o.state.ledger) || {});
  let kept = ((o.state && o.state.kept) || []).slice();
  /* A version kept for the person is let go once a later one stands over it, chosen on another computer. */
  const settled = (item, win) => { kept = kept.filter(k => k.item !== item || !over(win, Object.assign({ seen: {} }, k))); };
  const patch = {}, copies = [];
  /* This computer's own changes first: an item whose value is not the one its entry names was changed here. */
  for (const item of new Set(Object.keys(ledger).concat(Object.keys(local)))) {
    const was = ledger[item], h = has(local, item) ? sha(local[item]) : null;
    if (was ? was.h === h : h === null) continue;
    const t = Math.max(now, was ? was.t + 1 : 0);
    ledger[item] = { h, by: me, t, seen: was ? (was.by === me ? Object.assign({}, was.seen) : unionSeen(was)) : {} };
  }
  const valueOf = (e, item) => {
    if (e.h === null) return null;
    if (item.startsWith("k:")) return typeof e.v === "string" ? e.v : undefined;
    const text = typeof o.fileOf === "function" ? o.fileOf(e.by, item) : null;
    return typeof text === "string" && sha(text) === e.h ? text : undefined;
  };
  const items = new Set(Object.keys(ledger));
  for (const t of o.theirs || []) for (const item of Object.keys(t.items)) items.add(item);
  for (const item of items) {
    if (!follows(item)) continue;
    const mine = ledger[item] || null;
    const others = [];
    for (const t of o.theirs || []) {
      const e = t.items[item];
      if (!e || t.by === me || (mine && same(e, mine)) || others.some(x => same(x, e))) continue;
      others.push(e);
    }
    if (!others.length) continue;
    const all = (mine ? [mine] : []).concat(others);
    let top = all.filter(a => !all.some(b => b !== a && !same(a, b) && over(b, a)));
    /* A setting by the later write, read from each computer's own clock (t is max(now, previous + 1) above), so within the clocks'
       skew the faster clock's write wins: accepted for a setting, never for an edit or a file, where both are kept. */
    if (isSetting(item)) top = [top.reduce((a, b) => (b.t > a.t || (b.t === a.t && b.by > a.by) ? b : a))];
    const values = new Set(top.map(e => e.h));
    if (values.size === 1) {
      /* One version stands, or the same bytes from two: taken, with every entry it stands over. */
      const win = mine && top.some(e => same(e, mine)) ? mine : top.reduce((a, b) => (b.t > a.t ? b : a));
      settled(item, win);
      if (mine && same(win, mine)) {
        if (top.length > 1) ledger[item] = Object.assign({}, mine, { seen: Object.assign(unionSeen(...top), mine.seen) });
        continue;
      }
      const v = valueOf(win, item);
      if (v === undefined) continue; /* its bytes have not arrived yet: the next merge takes it */
      ledger[item] = { h: win.h, by: win.by, t: win.t, seen: Object.assign(unionSeen(...all.filter(e => !same(e, win) && e.by !== win.by)), win.seen) };
      patch[item] = v;
      continue;
    }
    /* Both changed it: this computer keeps its own in place, or the latest where its own was overtaken, and each other version is
       kept for the person. Nothing is lost and the entry here claims none of them, so the other computer keeps both too. */
    const stay = mine && top.some(e => same(e, mine)) ? mine : top.reduce((a, b) => (b.t > a.t || (b.t === a.t && b.by > a.by) ? b : a));
    if (!mine || !same(stay, mine)) {
      const v = valueOf(stay, item);
      if (v === undefined) continue;
      ledger[item] = { h: stay.h, by: stay.by, t: stay.t, seen: Object.assign({}, stay.seen) };
      patch[item] = v;
    }
    for (const e of top) {
      if (same(e, stay) || e.h === null || kept.some(k => k.item === item && k.by === e.by && k.t === e.t)) continue; /* plant:keep-both */
      const v = valueOf(e, item);
      if (v === undefined) continue;
      copies.push({ item, by: e.by, t: e.t, h: e.h, value: v });
    }
  }
  for (const c of copies) kept.push({ item: c.item, by: c.by, t: c.t, h: c.h });
  const after = Object.assign({}, local);
  for (const item of Object.keys(patch)) { if (patch[item] === null) delete after[item]; else after[item] = patch[item]; }
  /* A field taken is put in place as its whole layer key, the fields this computer holds and those taken together. */
  for (const key of new Set(Object.keys(patch).map(layerOf).filter(Boolean))) {
    for (const item of Object.keys(patch)) if (layerOf(item) === key) delete patch[item];
    patch["k:" + key] = layerText(after, key);
  }
  const own = { [syncRel(me)]: syncText(me, ledger, after) };
  for (const item of Object.keys(ledger)) if (item.startsWith("f:") && has(after, item)) own[fileRel(me, item)] = after[item];
  return { state: { ledger, kept }, patch, copies, own };
}

/* The person chose one version of an item both changed (`value`, null to remove): taken here over every version it was chosen from,
   so the choice stands on every computer. */
function resolve(state, me, item, value, now) {
  const ledger = Object.assign({}, state.ledger), kept = state.kept.filter(k => k.item !== item);
  const from = state.kept.filter(k => k.item === item).concat(ledger[item] ? [ledger[item]] : []);
  const seen = unionSeen(...from.map(k => ({ by: k.by, t: k.t, seen: k.seen || {} })));
  delete seen[me];
  ledger[item] = { h: value === null ? null : sha(value), by: me, t: Math.max(Math.floor(now), ...from.map(k => k.by === me ? k.t + 1 : 0)), seen };
  return { ledger, kept };
}

/* ---- the store at its relay, through the relay channel -------------------------------------------------------------------
   A store has no team file at the relay: S opens no session there (relay/core.cjs byKey). Each computer holds S, so it signs for
   itself the roster the channel judges blobs against: the computers the folder's file lists, at the list's revision, epoch 1, K
   its key. A blob from a key the person's own list does not hold is dropped as any team's is. */
const STORE_TEAM = rt => "store-" + rt;
const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
function storeTeamDoc(keys, pubOf, canonBytes) {
  const sPub = pubOf(keys.s);
  const doc = { format: 1, kind: "etiuda-team", id: STORE_TEAM(keys.rt), lead: { keyId: sPub, public: sPub }, sealed: true, epoch: 1, rev: Math.max(1, keys.rev),
    channel: { kind: "relay", rt: keys.rt, url: keys.url }, roster: keys.devices.map(d => ({ desk: { id: d.id, key: d.pub } })) };
  doc.sig = { alg: "Ed25519", keyId: sPub };
  const key = crypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(keys.s, "hex")]), format: "der", type: "pkcs8" });
  doc.sig.value = crypto.sign(null, canonBytes(doc), key).toString("hex");
  return doc;
}
/* The channel's options for a store, beside what the caller adds (request, connect, write, say, onHere): the pin is S, the place
   this computer's own, K the key of epoch 1, and each session carries the store certificate in hand. */
function storeChannelOptions(keys, me, cert, mirrorRoot, pubOf) {
  const sPub = pubOf(keys.s), k = Buffer.from(keys.k, "hex");
  const mirror = path.join(mirrorRoot, keys.rt);
  return {
    rt: keys.rt, url: keys.url, mirror, stateFile: mirror + ".json",
    pin: () => ({ teamId: STORE_TEAM(keys.rt), rt: keys.rt, lead: { keyId: sPub, public: sPub } }),
    me: () => ({ keyId: me.id, public: me.pub, privateKey: me.privateKey, place: "desk:" + me.id }),
    keyFor: e => (e === 1 ? k : null), sealEpoch: () => 1,
    seat: () => cert(),
  };
}

/* ---- THE SYNC ON A COMPUTER: one store channel at a time, run while the store is on and stopped while it is not ------------
   `o`: me {id, pub, privateKey}; mirrorRoot, where each store's mirror sits by its relay team id; channel(options) the relay channel
   made from storeChannelOptions with the caller's own request, write, say and clock; io(mirror) the channel's diskIO over a mirror;
   load() and save(state) this computer's sync state {rt, ledger, kept}; local() its items now (localItems), or null where they could
   not be read; apply(patch, copies) puts the merge's patch in place and keeps each copy for the person; pubOf and canonBytes; now().
   WHILE PAUSED nothing is lost: edits go on into the last store's mirror, which is this computer's outbox, and the channel, started
   again at the next look that is on, sends what waited and takes what came. A store the folder now names in place of the one this
   computer had (another computer's replace ended it) is adopted at that look, and this computer's whole place written into it, so
   every edit it holds reaches the new store. */
function createStoreSync(o) {
  let ch = null, at = "", revNow = -1, keysNow = null, certNow = null, busy = false;
  let state = (() => { const s = o.load(); return plain(s) && plain(s.ledger) && Array.isArray(s.kept) ? s : { rt: "", ledger: {}, kept: [] }; })();
  const mirrorOf = rt => path.join(o.mirrorRoot, rt);
  function theirs(io, rt) {
    const out = [], fileOf = {};
    const ids = new Set((keysNow && keysNow.rt === rt ? keysNow.devices : []).map(d => d.id));
    for (const rel of io.list()) {
      const m = /^desks\/(k-[0-9a-f]{16})\/sync\.json$/.exec(rel);
      if (!m || m[1] === o.me.id || !ids.has(m[1])) continue;
      const doc = syncRead(String(io.read(rel) || ""), m[1]);
      if (doc) out.push(doc);
    }
    fileOf.f = (by, item) => { const b = io.read(fileRel(by, item)); return b ? b.toString("utf8") : null; };
    return { list: out, fileOf: fileOf.f };
  }
  /* One merge into the mirror of the store this computer last synced to; nothing where it has synced to none yet. */
  function merge() {
    if (!state.rt || busy) return null;
    const local = o.local();
    if (!local) return null;
    busy = true;
    try {
      const io = o.io(mirrorOf(state.rt)), t = theirs(io, state.rt);
      const r = mergeOnce({ me: o.me.id, now: o.now(), state, local, theirs: t.list, fileOf: t.fileOf });
      if (Object.keys(r.patch).length || r.copies.length) o.apply(r.patch, r.copies);
      state = Object.assign({ rt: state.rt }, r.state);
      o.save(state);
      write(io, r.own);
      return r;
    } finally { busy = false; }
  }
  function write(io, own) {
    for (const rel of Object.keys(own)) {
      const was = io.read(rel);
      if (!was || was.toString("utf8") !== own[rel]) io.write(rel, own[rel]);
    }
    const mine = "desks/" + o.me.id + "/c/";
    for (const rel of io.list()) if (rel.startsWith(mine) && !has(own, rel)) io.remove(rel);
  }
  function stop() {
    const old = ch;
    ch = null; at = "";
    if (old) old.stop().catch(() => {}); /* plant:outbox-kept */
  }
  /* A look's answer: on starts or keeps the channel for its store, with the certificate it carries; anything else stops it. */
  function turn(look) {
    if (!look || look.state !== "on" || !look.keys || !look.store) { stop(); return; }
    keysNow = look.keys; certNow = look.store;
    const fresh = state.rt !== look.keys.rt;
    if (fresh) { state = Object.assign({}, state, { rt: look.keys.rt }); o.save(state); } /* plant:adopt */
    /* A computer enrolled since is taken into the channel it has, by the list's new roster, not a new channel over the same mirror. */
    if (ch && at === look.keys.rt) {
      if (look.keys.rev !== revNow) { ch.program.loadTeamFile(storeTeamDoc(look.keys, o.pubOf, o.canonBytes)); revNow = look.keys.rev; }
      ch.kick();
      return;
    }
    stop();
    fs.mkdirSync(mirrorOf(look.keys.rt), { recursive: true });
    /* After each cycle that reached the relay, what came is merged in. */
    ch = o.channel(Object.assign(storeChannelOptions(look.keys, o.me, () => certNow, o.mirrorRoot, o.pubOf), { onHere: () => { merge(); } }));
    at = look.keys.rt; revNow = look.keys.rev;
    ch.program.loadTeamFile(storeTeamDoc(look.keys, o.pubOf, o.canonBytes));
    merge();
    ch.start(); /* plant:resume */
  }
  return { turn, merge, stop, state: () => state, channel: () => ch, running: () => !!ch,
    resolve: (item, value) => { state = Object.assign({ rt: state.rt }, resolve(state, o.me.id, item, value, o.now())); o.save(state); merge(); } };
}

module.exports = { SYNC_NAME, SYNC_KIND, SETTINGS, LAYER_RE, CATALOG_RE, CATALOG_MAX, follows, isSetting, fileRel, syncRel, localItems, syncRead, syncText,
  fieldsOf, layerText, mergeOnce, resolve, createStoreSync, STORE_TEAM, storeTeamDoc, storeChannelOptions, sha };
