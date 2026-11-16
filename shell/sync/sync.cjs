"use strict";
/* THE SYNC OF A PERSON'S STORE: what follows the person between their computers, kept in this computer's own place in the store
   (desks/<its id>/), sealed under K by the relay channel (shell/relay/channel.cjs), and merged on read from every other computer's
   place. Pure but for what the caller passes in, so legs run it over stand-ins.

   WHAT FOLLOWS is an allowlist and nothing else reaches the store: the settings named in SETTINGS, the personal layer's own edits
   over a catalog (LAYER_RE), and the person's own catalog files. A team's key, its mirror, a sign-in token and the desk's identity
   live elsewhere (desk.json's envelope, signin.json, the relay's mirrors) and are never read here.

   THE MERGE, per item: a setting by the later write; an edit or a catalog file by the later write where only one computer changed it
   since it last took the other's, and where both changed it, the later write in place on every computer and the earlier version kept
   aside on the computer whose write gave way, so nothing is lost. Each entry names who wrote it, when, and the other computers' entries it was made over
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
/* A part of a field item that names an object's own machinery is no field: it would reach Object.prototype where it is put back. */
const PROTO_PART = /(^|[/#]|\[\])(__proto__|constructor|prototype)($|[/[])/;
function follows(item) {
  const s = String(item), at = s.indexOf("#");
  if (s.startsWith("k:") && at > 0) return LAYER_RE.test(s.slice(2, at)) && at < s.length - 1 && !PROTO_PART.test(s.slice(at)); /* plant:follows-proto */
  if (s.startsWith("k:")) return SETTINGS.indexOf(s.slice(2)) >= 0 || LAYER_RE.test(s.slice(2)); /* plant:follows */
  if (s.startsWith("f:")) return CATALOG_RE.test(s.slice(2));
  return false;
}
const isSetting = item => String(item).startsWith("k:") && SETTINGS.indexOf(String(item).slice(2)) >= 0;
/* Where a catalog's bytes sit in a computer's place: by a hash of its name, so no file name meets the relay's path rules. */
const fileRel = (id, item) => "desks/" + id + "/c/" + sha(item).slice(0, 32) + ".ec";
const syncRel = id => "desks/" + id + "/" + SYNC_NAME;

/* This computer's items as they stand: its desk keys and catalog files, each that follows, value by item. One past its cap is left out
   and named in `held` where given, so the merge leaves it as it was rather than reading it as removed. */
function localItems(keys, files, held) {
  const out = {};
  for (const k of Object.keys(plain(keys) ? keys : {})) {
    const v = keys[k];
    if (typeof v !== "string" || !follows("k:" + k)) continue;
    if (v.length > VALUE_MAX) { if (Array.isArray(held)) held.push("k:" + k); continue; } /* plant:held-value */
    const parts = LAYER_RE.test(k) ? fieldsOf(v) : null; /* plant:fields */
    if (!parts) { out["k:" + k] = v; continue; }
    for (const p of Object.keys(parts)) out["k:" + k + "#" + p] = parts[p];
  }
  for (const n of Object.keys(plain(files) ? files : {})) {
    const v = files[n];
    if (typeof v !== "string" || !follows("f:" + n)) continue;
    if (Buffer.byteLength(v, "utf8") <= CATALOG_MAX) out["f:" + n] = v;
    else if (Array.isArray(held)) held.push("f:" + n);
  }
  return out;
}
/* The items of desk key `key` whose values differ between its texts `a` and `b` (null where it stands nowhere): for a layer key its fields. */
function keyItems(key, a, b) {
  const x = localItems(typeof a === "string" ? { [key]: a } : {}), y = localItems(typeof b === "string" ? { [key]: b } : {});
  return [...new Set(Object.keys(x).concat(Object.keys(y)))].filter(i => x[i] !== y[i]);
}
/* Whether `item` is one of `held`: an item named, a layer key's every field, or every item of a kind ("f:", the catalog files). */
const heldBy = (held, item) => held.some(h => item === h || (h.endsWith(":") ? item.startsWith(h) : item.startsWith(h + "#")));

/* A layer's sets, by member, "<field>[]<member's id>": hiding, starring, deleting or adding one card or request is that member's change
   alone, and showing it again or removing it is recorded for that member, so only the same member changed both ways is a conflict.
   SET_IDS are lists of ids, SET_OWN lists of the person's own entries by each one's id; card order and every other list stay whole. */
const SET_IDS = ["hidden", "favourites", "removed", "removedCats", "intentHidden", "intentFavourites", "intentRemoved"]; /* plant:set-ids */
const SET_OWN = ["custom", "intentCustom"]; /* plant:set-own */
const MEMBER = "[]";
/* A set field's members {id: JSON text}, or null where the field is merged whole: not a set, or a list a member of which has no id of
   its own or shares one. */
function membersOf(f, v) {
  if (!Array.isArray(v)) return null;
  const out = {};
  if (SET_IDS.indexOf(f) >= 0) {
    for (const id of v) { if (typeof id !== "string" || !id) return null; out[id] = JSON.stringify(id); }
    return out;
  }
  if (SET_OWN.indexOf(f) < 0) return null;
  for (const m of v) {
    if (!plain(m) || typeof m.id !== "string" || !m.id || has(out, m.id)) return null;
    out[m.id] = JSON.stringify(m);
  }
  return out;
}
/* A layer's value as its fields, each field's value as JSON text, a map field by its keys and a set by its members; null where it is
   no JSON object. */
function fieldsOf(text) {
  let j = null;
  try { j = JSON.parse(text); } catch { return null; }
  if (!plain(j)) return null;
  const out = {};
  for (const f of Object.keys(j)) {
    if (f.indexOf("/") >= 0 || f.indexOf("#") >= 0 || f.indexOf("[") >= 0) return null;
    const set = membersOf(f, j[f]);
    if (set) { for (const id of Object.keys(set)) out[f + MEMBER + id] = set[id]; }
    else if (plain(j[f]) && Object.keys(j[f]).length) { for (const k of Object.keys(j[f])) out[f + "/" + k] = JSON.stringify(j[f][k]); }
    else out[f] = JSON.stringify(j[f]);
  }
  return out;
}
/* The layer key an item is a field of, or "". */
const layerOf = item => { const s = String(item), at = s.indexOf("#"); return s.startsWith("k:") && at > 0 ? s.slice(2, at) : ""; };
/* A layer key's value put back together from its field items, null where none stands. A set's members keep the order they stand in
   `items`, this computer's own first and those taken after; a member already in the field whole is not added twice. */
function layerText(items, key) {
  const pre = "k:" + key + "#", out = Object.create(null);
  let any = false;
  for (const item of Object.keys(items).sort()) {
    if (!item.startsWith(pre)) continue;
    let v;
    try { v = JSON.parse(items[item]); } catch { continue; }
    const rest = item.slice(pre.length), at = rest.search(/[/[]/), f = at < 0 ? rest : rest.slice(0, at);
    any = true;
    if (at < 0) out[rest] = v;
    else if (rest.startsWith(MEMBER, at)) { if (!Array.isArray(out[f])) out[f] = []; }
    else { if (!plain(out[f]) || !has(out, f)) out[f] = Object.create(null); out[f][rest.slice(at + 1)] = v; } /* plant:layer-own */
  }
  for (const item of Object.keys(items)) {
    if (!item.startsWith(pre)) continue;
    const rest = item.slice(pre.length), at = rest.search(/[/[]/);
    if (at < 0 || !rest.startsWith(MEMBER, at)) continue;
    let v;
    try { v = JSON.parse(items[item]); } catch { continue; }
    const list = out[rest.slice(0, at)], id = rest.slice(at + MEMBER.length);
    if (Array.isArray(list) && !list.some(x => x === id || (plain(x) && x.id === id))) list.push(v);
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
  /* Past the cap the file is refused whole: a tail dropped would read as items that computer never had. */
  const names = Object.keys(j.items);
  if (names.length > ITEMS_MAX) return null; /* plant:items-cap */
  const items = {};
  for (const item of names) {
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
/* Per computer, the later of two seen maps' times, so an entry's own lower time never stands over what was merged. */
const maxSeen = (a, b) => { const out = Object.assign({}, a); for (const k of Object.keys(b || {})) out[k] = Math.max(out[k] || 0, b[k]); return out; };
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
  const me = o.me, now = Math.floor(o.now), local = o.local || {}, held = Array.isArray(o.held) ? o.held : [];
  const ledger = Object.assign({}, (o.state && o.state.ledger) || {});
  let kept = ((o.state && o.state.kept) || []).slice();
  /* A version kept for the person is let go once a later one stands over it, chosen on another computer. */
  const settled = (item, win, tops) => { kept = kept.filter(k => k.item !== item || !(tops || [win]).some(e => over(e, Object.assign({ seen: {} }, k)))); };
  const patch = {}, copies = [];
  /* A computer that has never synced joining a store it did not make (state.join, set when it adopted the store: not made here, another
     computer listed): what it held before counts as older than anything they wrote, so a setting gives way to the store's; and the shipped
     sample untouched here (o.pristine) is none of its own at any merge while it stays untouched (state.untouched), so the store's word on it
     stands. What it changed since it adopted the store (state.before, its items' hashes then, and state.beforeHeld what it held back) is
     its own write, a removal included. The store's first computer, not joining, records what it held then as written when it adopted the
     store (state.at), so a later write on a computer that joined meanwhile stands over it. A state from before the flag judges by another
     computer's sync file holding items. */
  const st = o.state || {}, before = plain(st.before) ? st.before : null, beforeHeld = Array.isArray(st.beforeHeld) ? st.beforeHeld.map(String) : [];
  const first = !Object.keys(ledger).length;
  /* This computer's own place as a fresh state found it (o.own, its sync file; createStoreSync merge): what it wrote there under an earlier
     state is the store's like any computer's, so a fresh state joins it and takes it in. */
  const own = o.own && plain(o.own.items) ? o.own.items : {};
  const joining = first && (st.join === true || Object.keys(own).length > 0 || (st.join === undefined && (o.theirs || []).some(t => t.by !== me && Object.keys(t.items).length))); /* plant:join-flag */
  const held0 = item => !before || before[item] === (has(local, item) ? sha(local[item]) : undefined) || (!has(before, item) && heldBy(beforeHeld, item)); /* plant:join-since */
  const pristine = Array.isArray(o.pristine) ? o.pristine : [];
  const untouched = ((o.state && Array.isArray(o.state.untouched)) ? o.state.untouched : []).filter(i => typeof i === "string" && !has(ledger, i));
  /* An untouched sample removed here while no computer held an entry for it (state.gone): its removal is made over the first entry that
     comes. What a joining computer held back then (state.joinHeld, patterns as held lists them) counts as held before it joined once read. */
  const gone = (Array.isArray(st.gone) ? st.gone : []).filter(i => typeof i === "string" && !has(ledger, i));
  const joinHeld = joining ? beforeHeld.filter(p => held.indexOf(p) >= 0) : (Array.isArray(st.joinHeld) ? st.joinHeld.map(String) : []);
  /* This computer's own changes first: an item whose value is not the one its entry names was changed here. */
  for (const item of new Set(Object.keys(ledger).concat(Object.keys(local), untouched, gone, first && before ? Object.keys(before) : []))) {
    const was = ledger[item], h = has(local, item) ? sha(local[item]) : null;
    if (h === null && heldBy(held, item)) continue; /* plant:held-kept */
    if (!was && gone.indexOf(item) >= 0) {
      if (h !== null) { gone.splice(gone.indexOf(item), 1); }
      else {
        const there = (o.theirs || []).filter(x => x.by !== me && x.items[item]).map(x => x.items[item]);
        if (there.length) { gone.splice(gone.indexOf(item), 1); ledger[item] = { h: null, by: me, t: Math.max(now, ...there.map(e => e.t + 1)), seen: unionSeen(...there) }; } /* plant:gone-later */
        continue;
      }
    }
    const lateHeld = !was && !joining && heldBy(joinHeld, item);
    /* Held when its account was seated and removed since, at its first merge: the person's removal, made over no other computer's entry,
       so one standing elsewhere meets it as a conflict and is kept. */
    if (!was && first && before && h === null && has(before, item)) {
      const there = (o.theirs || []).filter(x => x.by !== me && x.items[item]).map(x => x.items[item]);
      ledger[item] = { h: null, by: me, t: Math.max(now, ...there.map(e => e.t + 1)), seen: {} }; /* plant:join-removed */
      continue;
    }
    if (!was && untouched.indexOf(item) >= 0) {
      if (h !== null && pristine.indexOf(item) >= 0) continue; /* plant:untouched-skip */
      untouched.splice(untouched.indexOf(item), 1);
      /* Removed here, the person's own removal: made over every entry another computer holds for it, so it travels; with none, nothing. */
      if (h === null) {
        const there = (o.theirs || []).filter(x => x.by !== me && x.items[item]).map(x => x.items[item]);
        if (there.length) ledger[item] = { h: null, by: me, t: Math.max(now, ...there.map(e => e.t + 1)), seen: unionSeen(...there) }; /* plant:untouched-removal */
        if (!there.length) gone.push(item);
        continue;
      }
    }
    if (was ? was.h === h : h === null) continue; /* plant:recorded */
    if (!was && (joining || lateHeld) && pristine.indexOf(item) >= 0 && held0(item)) { untouched.push(item); continue; } /* plant:join-pristine */
    const t = was ? Math.max(now, was.t + 1) : lateHeld ? 0 : !held0(item) ? now : joining ? 0 : before && Number.isSafeInteger(st.at) ? Math.min(now, st.at) : now; /* plant:join-older */
    ledger[item] = { h, by: me, t, seen: was ? (was.by === me ? Object.assign({}, was.seen) : unionSeen(was)) : {} };
  }
  const valueOf = (e, item) => {
    if (e.h === null) return null;
    if (item.startsWith("k:")) return typeof e.v === "string" ? e.v : undefined;
    const text = typeof o.fileOf === "function" ? o.fileOf(e.by, item, e.h) : null;
    return typeof text === "string" && sha(text) === e.h ? text : undefined;
  };
  /* This computer's own entry's value, from what it holds now (its ledger keeps no value). */
  const ownOf = (e, item) => (e.h === null ? null : has(local, item) && sha(local[item]) === e.h ? local[item] : undefined);
  const items = new Set(Object.keys(ledger).concat(Object.keys(own)));
  for (const t of o.theirs || []) for (const item of Object.keys(t.items)) items.add(item);
  for (const item of items) {
    if (!follows(item) || heldBy(held, item)) continue;
    const mine = ledger[item] || null;
    const others = [];
    for (const t of o.theirs || []) {
      const e = t.items[item];
      if (!e || t.by === me || (mine && same(e, mine)) || others.some(x => same(x, e))) continue;
      others.push(e);
    }
    const ownE = own[item];
    if (ownE && !(mine && same(ownE, mine)) && !others.some(x => same(x, ownE))) others.push(ownE); /* plant:own-taken */
    if (!others.length) continue;
    const all = (mine ? [mine] : []).concat(others);
    /* Two entries each made over the other (the same value written on two computers, each merging the other's) both stand. */
    let top = all.filter(a => !all.some(b => b !== a && !same(a, b) && over(b, a) && !over(a, b))); /* plant:top-mutual */
    /* A setting by the later write, read from each computer's own clock (t is max(now, previous + 1) above), so within the clocks'
       skew the faster clock's write wins. */
    if (isSetting(item)) top = [top.reduce((a, b) => (b.t > a.t || (b.t === a.t && b.by > a.by) ? b : a))];
    const values = new Set(top.map(e => e.h));
    if (values.size === 1) {
      /* One version stands, or the same bytes from two: taken, with every entry it stands over. */
      const win = mine && top.some(e => same(e, mine)) ? mine : top.reduce((a, b) => (b.t > a.t ? b : a));
      if (mine && same(win, mine)) {
        settled(item, win);
        if (top.length > 1) ledger[item] = Object.assign({}, mine, { seen: unionSeen(...top) }); /* plant:seen-max-mine */
        continue;
      }
      const v = valueOf(win, item);
      if (v === undefined) continue; /* its bytes have not arrived yet: the next merge takes it, and lets go what it overtakes */
      settled(item, win); /* plant:settled-arrived */
      ledger[item] = { h: win.h, by: win.by, t: win.t, seen: maxSeen(unionSeen(...all.filter(e => !same(e, win) && e.by !== win.by)), win.seen) }; /* plant:seen-max */
      patch[item] = v;
      continue;
    }
    /* Both changed it: the later write stands on every computer, and each earlier version this computer holds is kept aside here, its
       own among them. Only the computer whose write gave way is sure to keep it: the other may never read it, its place moved on. */
    const stay = top.reduce((a, b) => (b.t > a.t || (b.t === a.t && b.by > a.by) ? b : a)); /* plant:later-stands */
    if (!mine || !same(stay, mine)) {
      const v = valueOf(stay, item);
      if (v === undefined) continue;
      ledger[item] = { h: stay.h, by: stay.by, t: stay.t, seen: Object.assign({}, stay.seen) };
      patch[item] = v;
    }
    /* A version kept before is let go once its own writer has overtaken it (or this computer took it), so a conflict renewed round after
       round keeps the latest of each side, not every round. */
    /* Only by a version whose bytes are here, so a kept one is never let go for one the next merge may still not have. */
    settled(item, null, top.filter(e => (mine && same(e, mine) ? ownOf(e, item) : valueOf(e, item)) !== undefined)); /* plant:kept-overtaken */
    /* A removal is a version too, kept with the value null, so the conflict waits on both computers and not only where it was undone. */
    for (const e of top) {
      if (same(e, stay) || kept.some(k => k.item === item && k.by === e.by && k.t === e.t)) continue; /* plant:keep-both */
      const v = mine && same(e, mine) ? ownOf(e, item) : valueOf(e, item); /* plant:keep-own */
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
  const rest = {};
  if (gone.length) rest.gone = gone.filter(i => !has(ledger, i));
  if (joinHeld.some(p => held.indexOf(p) >= 0)) rest.joinHeld = joinHeld.filter(p => held.indexOf(p) >= 0);
  return { state: Object.assign({ ledger, kept, untouched: untouched.filter(i => !has(ledger, i)) }, rest), patch, copies, own: placeOf(me, ledger, after), after, untouched };
}
/* This computer's place in the store: its sync file and the catalogs its ledger holds. */
function placeOf(me, ledger, after) {
  const own = { [syncRel(me)]: syncText(me, ledger, after) };
  for (const item of Object.keys(ledger)) if (item.startsWith("f:") && has(after, item)) own[fileRel(me, item)] = after[item];
  return own;
}
/* A merge whose patch or copies the desk could not put in place (`failed`, as apply names them: an item, or a layer key for all its
   fields): those items stand as they stood before it, ledger and kept versions alike, so nothing is taken as taken and the next merge
   tries again; this computer's place says only what it holds. */
function unapplied(prev, r, failed, local, me) {
  if (!Array.isArray(failed) || !failed.length) return r;
  const under = item => heldBy(failed.map(String), item);
  const was = (prev && prev.ledger) || {}, ledger = Object.assign({}, r.state.ledger);
  for (const item of Object.keys(ledger)) if (under(item)) { if (has(was, item)) ledger[item] = was[item]; else delete ledger[item]; }
  const kept = r.state.kept.filter(k => !under(k.item)).concat(((prev && prev.kept) || []).filter(k => under(k.item)));
  const after = {};
  for (const item of Object.keys(r.after)) if (!under(item)) after[item] = r.after[item];
  for (const item of Object.keys(local || {})) if (under(item)) after[item] = local[item];
  /* An untouched sample whose store entry could not be put in place is still untouched here. */
  const still = (r.state.untouched || []).concat((r.untouched || []).filter(i => under(i) && !has(ledger, i) && (r.state.untouched || []).indexOf(i) < 0));
  const rest = {};
  for (const k of ["gone", "joinHeld"]) if (r.state[k]) rest[k] = r.state[k];
  return { state: Object.assign({ ledger, kept, untouched: still }, rest), patch: r.patch, copies: r.copies, own: placeOf(me, ledger, after), after, untouched: r.untouched };
}

/* The person chose one version of an item both changed (`value`, null to remove): taken here over every version it was chosen from,
   so the choice stands on every computer. It records only; the value is put in place first (createStoreSync's choose). */
function resolve(state, me, item, value, now) {
  const ledger = Object.assign({}, state.ledger), kept = state.kept.filter(k => k.item !== item);
  const from = state.kept.filter(k => k.item === item).concat(ledger[item] ? [ledger[item]] : []);
  const seen = unionSeen(...from.map(k => ({ by: k.by, t: k.t, seen: k.seen || {} })));
  delete seen[me];
  ledger[item] = { h: value === null ? null : sha(value), by: me, t: Math.max(Math.floor(now), ...from.map(k => k.by === me ? k.t + 1 : 0)), seen };
  return Object.assign({}, state, { ledger, kept, untouched: (state.untouched || []).filter(i => i !== item) });
}

/* ---- THE PAGE'S COPY OF THE DESK: what the sync put on the desk behind the page, by key, until the page next writes that key -----
   Each tell is numbered, and each page write names per key the tell whose value its copy took (src/modules/storage.js eDeskTook), so
   a write from a copy that never held a tell's value is known for one. tell's `pre` {key: {item: the ledger entry before the take}},
   a key it lacks cleared whole, and `every` a test of keys cleared whole by it, held or not; write answers {rewind: those entries again
   (createStoreSync untake), dropped: the keys cleared whole}. */
function createDeskBridge() {
  let no = 0, whole = null;
  const told = new Map(), loads = new Map();
  function tell(keys, pre, every) {
    const n = ++no;
    if (typeof every === "function") whole = { n, every };
    for (const k of Object.keys(keys)) {
      const l = told.get(k) || [];
      l.push({ n, pre: pre && plain(pre[k]) ? pre[k] : null });
      /* Bounded where the page never writes the key: the two earliest meet, the earlier entry of an item standing, a whole clear whole. */
      if (l.length > 64) l.splice(0, 2, { n: l[1].n, pre: l[0].pre && l[1].pre ? Object.assign({}, l[1].pre, l[0].pre) : null });
      told.set(k, l);
    }
    return n;
  }
  /* A load is handed the desk as it stands, every tell so far in it. */
  const load = from => { loads.set(from, no); };
  const forget = from => { loads.delete(from); };
  function write(from, keys, took) {
    const rewind = {}, dropped = [], t = plain(took) ? took : {};
    for (const k of keys) {
      const l = told.get(k) || [], at = Math.max(Number.isSafeInteger(t[k]) ? t[k] : 0, loads.get(from) || 0);
      if (whole && whole.n > at && whole.every(k)) { told.delete(k); dropped.push(k); continue; } /* plant:desk-every */
      if (!l.length) continue;
      told.delete(k);
      const late = l.filter(x => x.n > at); /* plant:desk-stale */
      if (late.some(x => x.pre === null)) { dropped.push(k); continue; } /* plant:desk-whole */
      for (const x of late) for (const item of Object.keys(x.pre || {})) if (!has(rewind, item)) rewind[item] = x.pre[item];
    }
    return { rewind, dropped };
  }
  return { tell, load, forget, write };
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
   not be read, held() those it left out (localItems' `held`), and pristine() its catalog files that are the shipped sample untouched;
   apply(patch, copies) puts the merge's patch in place and keeps each
   copy for the person, answering the items it could not (unapplied); pubOf and canonBytes; now().
   WHILE PAUSED nothing is lost: edits go on into the last store's mirror, which is this computer's outbox, and the channel, started
   again at the next look that is on, sends what waited and takes what came. A store the folder now names in place of the one this
   computer had (another computer's replace ended it) is adopted at that look, and this computer's whole place written into it, so
   every edit it holds reaches the new store. */
function createStoreSync(o) {
  let ch = null, at = "", revNow = -1, keysNow = null, certNow = null, busy = false, reached = "";
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
    /* A catalog's bytes under that hash from the place of whichever computer holds them: the one that wrote it, any on the list, or this
       one, since the writer may have left the list or never placed them in this store. */
    fileOf.f = (by, item, h) => {
      for (const id of new Set([by, ...ids, o.me.id])) {
        const b = io.read(fileRel(id, item)), text = b ? b.toString("utf8") : null;
        if (text !== null && (h === undefined || sha(text) === h)) return text;
      }
      return null;
    };
    return { list: out, fileOf: fileOf.f };
  }
  /* What this computer holds now, by item's hash, what it holds back, and the time: what it held before it joined (mergeOnce). */
  function heldNow() {
    const local = o.local(), before = {}, held = local && typeof o.held === "function" ? o.held() : [];
    for (const item of Object.keys(local || {})) before[item] = sha(local[item]);
    return { before: local ? before : null, beforeHeld: held.slice(), at: Math.floor(o.now()) };
  }
  /* An account seated on this computer, which has synced nothing: what the desk holds now is what it held before, and a change after it
     the person's own under that account. */
  function seated() {
    if (Object.keys(state.ledger).length) return false;
    state = Object.assign({}, state, heldNow()); /* plant:join-seated */
    o.save(state);
    return true;
  }
  /* One merge into the mirror of the store this computer last synced to; nothing where it has synced to none yet. */
  function merge() {
    if (!state.rt || busy) return null;
    /* A computer that has never synced merges first once a cycle has reached the store, so that merge sees what the store holds. */
    if (!Object.keys(state.ledger).length && reached !== state.rt) return null; /* plant:join-reached */
    const local = o.local();
    if (!local) return null;
    busy = true;
    try {
      const io = o.io(mirrorOf(state.rt)), t = theirs(io, state.rt);
      const held = typeof o.held === "function" ? o.held() : [], pristine = typeof o.pristine === "function" ? o.pristine() : [];
      /* A fresh state (state.ownTake, set where it adopted a store with nothing synced) reads its own place, written under an earlier state. */
      const ownDoc = state.ownTake === true ? syncRead(String(io.read(syncRel(o.me.id)) || ""), o.me.id) : null;
      let r = mergeOnce({ me: o.me.id, now: o.now(), state, local, held, pristine, theirs: t.list, fileOf: t.fileOf, own: ownDoc });
      if (Object.keys(r.patch).length || r.copies.length) r = unapplied(state, r, o.apply(r.patch, r.copies), local, o.me.id); /* plant:unapplied */
      const was = state;
      state = Object.assign({ rt: state.rt }, r.state);
      if (!Object.keys(state.ledger).length && was.join !== undefined) Object.assign(state, { join: was.join, before: was.before, beforeHeld: was.beforeHeld, at: was.at });
      /* What the own place holds that this state has not yet taken in (bytes not come, held, not put in place) stays in the place, written
         again as it stood, until it is taken or overtaken; then the place is this state's alone. */
      const pending = ownDoc ? Object.keys(ownDoc.items).filter(i => { const e = ownDoc.items[i], l = state.ledger[i]; return !(l && (same(l, e) || over(l, e))); }) : [];
      if (pending.length) state.ownTake = true;
      o.save(state);
      const place = placeOf(o.me.id, state.ledger, Object.assign(heldPlaced(io, held), r.after)); /* plant:held-placed */
      if (pending.length) {
        const doc = JSON.parse(place[syncRel(o.me.id)]);
        for (const i of pending) {
          const e = ownDoc.items[i];
          doc.items[i] = Object.assign({ h: e.h, by: e.by, t: e.t, seen: e.seen }, typeof e.v === "string" ? { v: e.v } : {});
          const b = i.startsWith("f:") ? io.read(fileRel(o.me.id, i)) : null;
          if (b) place[fileRel(o.me.id, i)] = b.toString("utf8");
        }
        place[syncRel(o.me.id)] = JSON.stringify(doc); /* plant:own-kept */
      }
      write(io, place);
      return r;
    } finally { busy = false; }
  }
  /* An item left out (held) keeps what this computer last placed for it, while its entry still names those bytes: a catalog's file in
     this place and a key's value in this place's sync file, so the store's copy stays readable to the other computers. */
  function heldPlaced(io, held) {
    const out = {};
    let prev = null;
    for (const item of Object.keys(state.ledger)) {
      const e = state.ledger[item];
      if (!heldBy(held, item) || e.h === null) continue;
      if (item.startsWith("f:")) { const b = io.read(fileRel(o.me.id, item)), text = b ? b.toString("utf8") : null; if (text !== null && sha(text) === e.h) out[item] = text; continue; }
      if (prev === null) { const b = io.read(syncRel(o.me.id)); prev = (b && syncRead(b.toString("utf8"), o.me.id)) || { items: {} }; }
      const was = prev.items[item];
      if (was && typeof was.v === "string" && was.h === e.h) out[item] = was.v;
    }
    return out;
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
    /* A computer that has synced nothing adopting a store keeps whether it joins one it did not make, and what it held when its account was
       seated (seated, below), or now where none was kept (mergeOnce). */
    if (fresh) {
      const none = !Object.keys(state.ledger).length;
      const join = none ? Object.assign({ join: look.made !== true && look.keys.devices.some(d => d.id !== o.me.id), ownTake: true }, plain(state.before) ? {} : heldNow()) : {}; /* plant:join-made */
      state = Object.assign({}, state, { rt: look.keys.rt }, join); /* plant:adopt */
      o.save(state);
    }
    /* A computer enrolled since is taken into the channel it has, by the list's new roster, not a new channel over the same mirror. */
    if (ch && at === look.keys.rt) {
      if (look.keys.rev !== revNow) { ch.program.loadTeamFile(storeTeamDoc(look.keys, o.pubOf, o.canonBytes)); revNow = look.keys.rev; }
      ch.kick();
      return;
    }
    stop();
    fs.mkdirSync(mirrorOf(look.keys.rt), { recursive: true });
    /* After each cycle that reached the relay, what came is merged in. */
    const rt = look.keys.rt;
    ch = o.channel(Object.assign(storeChannelOptions(look.keys, o.me, () => certNow, o.mirrorRoot, o.pubOf), { onHere: () => { reached = rt; merge(); } }));
    at = look.keys.rt; revNow = look.keys.rev;
    ch.program.loadTeamFile(storeTeamDoc(look.keys, o.pubOf, o.canonBytes));
    merge();
    ch.start(); /* plant:resume */
  }
  /* A version chosen (resolve, above) is put in place before it is recorded, so the next merge does not read the one that stood as a newer
     change; where the desk could not put it in place nothing is recorded. A layer field goes in as its whole key, as a merge's patch does. */
  function choose(item, value) {
    const local = o.local();
    if (!local || !follows(item)) return false;
    const key = layerOf(item), after = Object.assign({}, local);
    if (value === null) delete after[item]; else after[item] = value;
    const failed = o.apply(key ? { ["k:" + key]: layerText(after, key) } : { [item]: value }, []); /* plant:choose-applied */
    if (Array.isArray(failed) && failed.length) return false;
    state = Object.assign({ rt: state.rt }, resolve(state, o.me.id, item, value, o.now()));
    o.save(state);
    merge();
    return true;
  }
  /* What a merge took from another computer and put on the desk, written over since by the page from a copy that never held it: each
     item's entry stands again as it stood before the take (`pre` {item: entry, or null for none}), so the next merge takes it again
     rather than reading the page's copy as this computer's removal. An item this computer has written since keeps its own entry. */
  function untake(pre) {
    const ledger = Object.assign({}, state.ledger);
    let any = false;
    for (const item of Object.keys(plain(pre) ? pre : {})) {
      const now = ledger[item];
      if (!now || now.by === o.me.id) continue;
      if (plain(pre[item])) ledger[item] = pre[item]; else delete ledger[item]; /* plant:untake */
      any = true;
    }
    if (!any) return false;
    state = Object.assign({}, state, { ledger });
    o.save(state);
    return true;
  }
  /* The person has opened the notice of the versions kept: each kept now is marked so, and only the desk counts it; the copies stay. */
  function opened() {
    if (!state.kept.some(k => !k.opened)) return false;
    state = Object.assign({}, state, { kept: state.kept.map(k => (k.opened ? k : Object.assign({}, k, { opened: true }))) });
    o.save(state);
    return true;
  }
  return { turn, merge, stop, state: () => state, channel: () => ch, running: () => !!ch, resolve: choose, opened, untake, seated };
}

module.exports = { SYNC_NAME, SYNC_KIND, SETTINGS, LAYER_RE, CATALOG_RE, CATALOG_MAX, follows, isSetting, fileRel, syncRel, localItems, keyItems, createDeskBridge, syncRead, syncText,
  fieldsOf, layerText, mergeOnce, unapplied, resolve, createStoreSync, STORE_TEAM, storeTeamDoc, storeChannelOptions, sha };
