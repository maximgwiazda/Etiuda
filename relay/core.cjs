"use strict";
/* The relay's team object: every check and every change of state, synchronous over the store its caller passes in
   (get, put, del, list by prefix after a key, and atomic, which keeps a function's writes as one). It holds no team
   key, opens no blob and keeps no path or name: an upload's metadata is taken field by field and the rest dropped. */
const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
const B = require("../shell/relay/blob.cjs");

const CHALLENGE_MS = 5 * 60 * 1000;
const SESSION_MS = 30 * 60 * 1000;
const CALL_SKEW_MS = 5 * 60 * 1000;
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_TRIES = 20;
const INVITES_MAX = 200;
const INVITE_UPLOAD_MAX = 64 * 1024;
const CHALLENGES_MAX = 256;
const SESSIONS_MAX = 1024;
const KEYS_MAX = 1000;
const SINCE_MAX = 1000;
const TOKEN_MAX = 256;
const META_MAX = 4096;

const HEX24 = /^[0-9a-f]{24}$/, HEX32 = /^[0-9a-f]{32}$/, HEX64 = /^[0-9a-f]{64}$/, HEX128 = /^[0-9a-f]{128}$/;
/* A key id takes blob.cjs's id shape, so no newline or separator rides in it. A desk id is isDeskId: that shape, and not a
   reserved device name, so the relay does not enrol a desk the program's writerOf would refuse. */
const isId = B.isId;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
/* The lead's place for what it seals under one invitation's key alone (step 4's joining bootstrap): served in the clear,
   so a desk not joining by that invitation passes over it without trying to open it. */
const INVITE_PLACE = /^invite:[0-9a-f]{32}$/;
/* The one blob an uploaded invitation may fetch. Its id is the invitation's, and no list serves it. */
const ANSWER_PLACE = /^answer:[0-9a-f]{32}$/;

const is = (re, v) => typeof v === "string" && re.test(v);
const isCount = v => Number.isSafeInteger(v) && v >= 1;
const sha256 = v => crypto.createHash("sha256").update(v).digest("hex");
const pad = n => String(Math.max(0, Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER))).padStart(16, "0");
const expiryKey = (t, id) => "kx:" + pad(t) + ":" + id;
const no = B.refusal;
/* What the relay keeps of a spent invitation past its keep, under its id: that it was spent, and no hash, try or time. */
const SPENT = Object.freeze({ spent: true });

/* The canonical JSON shell/main.js signs with (canonJson): keys sorted, an undefined value left out. */
function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}

const createBytes = (rt, keyId, t) => Buffer.from("etiuda-relay-create\n" + rt + "\n" + keyId + "\n" + t, "utf8");
/* A create is signed over the hash of the grant it carries, so a grant lifted from another create does not fit. */
const create2Bytes = (rt, keyId, t, grant) => Buffer.from("etiuda-relay-create-2\n" + rt + "\n" + keyId + "\n" + t + "\n" + sha256(grantBytes(grant)), "utf8");
const devicesBytes = (rt, rev, t, keys) => Buffer.from("etiuda-relay-devices\n" + rt + "\n" + rev + "\n" + t + "\n" + canon(keys), "utf8");
/* `wraps` left out when the caller does not pass it, so a slice 1 signature over add and drop still matches. */
const invitesBytes = (rt, t, add, drop, wraps) => Buffer.from("etiuda-relay-invites\n" + rt + "\n" + t + "\n"
  + canon(wraps === undefined ? { add, drop } : { add, drop, wraps }), "utf8");
const helloBytes = (rt, nonce, keyId) => Buffer.from("etiuda-relay-hello\n" + rt + "\n" + nonce + "\n" + keyId + "\n", "utf8");

/* blob.cjs verifies under the upload prefix alone, so the relay's own four signatures are verified here. */
function verified(pubHex, bytes, sigHex) {
  if (!is(HEX64, pubHex) || !is(HEX128, sigHex)) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pubHex, "hex")]), format: "der", type: "spki" });
    return crypto.verify(null, bytes, key, Buffer.from(sigHex, "hex"));
  } catch { return false; }
}

/* A device's key id is its public key, or the branch id shell/main.js makes of it (branchIdOf). */
const keyMatches = (id, pub) => is(HEX64, pub) && (id === pub || id === "k-" + sha256(Buffer.from(pub, "hex")).slice(0, 16));

/* The vendor's root key, public half: the one key a grant, or the delegation a grant names, must trace to. A constant of this
   file and read from no environment. Only a leg hands the relay other roots, through `roots`, and production code never does. */
const ROOT_PUB = "f78558260ad75c094052f936326a63bffb1a581ac8b91d898ae1fd01b61127ee";
const GRANT_KIND = "etiuda-relay-grant", DELEGATION_KIND = "etiuda-delegation";
const GRANT_MAX_MS = 45 * 24 * 60 * 60 * 1000;
const GRANT_FIELDS = ["kind", "format", "lead", "issued", "until", "paid", "sig", "via"];
const DELEGATION_FIELDS = ["kind", "format", "key", "may", "from", "until", "sig"];
const SIG_FIELDS = ["alg", "keyId", "value"];
const MAY_MAX = 16;

const plain = v => !!v && typeof v === "object" && !Array.isArray(v);
const only = (o, names) => Object.keys(o).every(k => names.indexOf(k) > -1);
const exactly = (o, names) => only(o, names) && names.every(k => Object.prototype.hasOwnProperty.call(o, k));
const sigShaped = s => plain(s) && exactly(s, SIG_FIELDS) && s.alg === "ed25519" && isId(s.keyId) && is(HEX128, s.value);

/* A document without its signature's value: what its signer signed, after the label of its own domain. */
function unsigned(doc) {
  if (!plain(doc)) return doc;
  const out = Object.assign({}, doc);
  if (plain(doc.sig)) { out.sig = Object.assign({}, doc.sig); delete out.sig.value; }
  return out;
}
function grantBytes(grant) { return Buffer.from(GRANT_KIND + "\n" + canon(unsigned(grant)), "utf8"); }
function delegationBytes(d) { return Buffer.from(DELEGATION_KIND + "\n" + canon(unsigned(d)), "utf8"); }

/* The delegation a grant names, judged against that grant: its kind and shape, then what it lets its key do and when, and the
   root's signature last. A reason is a short word for a leg to read; the relay answers every one of them bad-grant. */
function delegationWhy(d, grant, roots) {
  if (!plain(d)) return "via-shape";
  if (d.kind !== DELEGATION_KIND) return "via-kind"; /* plant:via-kind */
  if (d.format !== 1) return "via-shape";
  if (!exactly(d, DELEGATION_FIELDS) || !plain(d.key) || !exactly(d.key, ["id", "pub"]) || !isId(d.key.id) || !is(HEX64, d.key.pub)
    || !Array.isArray(d.may) || d.may.length < 1 || d.may.length > MAY_MAX || !d.may.every(m => typeof m === "string")
    || !Number.isSafeInteger(d.from) || !Number.isSafeInteger(d.until) || !sigShaped(d.sig)) return "via-shape";
  if (d.may.indexOf("relay-grant") < 0) return "via-may"; /* plant:grant-may */
  if (!(d.from <= grant.issued && grant.until <= d.until)) return "via-window"; /* plant:grant-window */
  if (!roots.some(root => verified(root, delegationBytes(d), d.sig.value))) return "via-signature"; /* plant:via-sig */
  return null;
}

/* Why a grant does not hold for this lead at this instant, or null where it does. Every check of kind, shape, window and bound
   comes before the signature, and a document of another kind is refused by its kind alone. */
function grantWhy(grant, leadPub, now, roots) {
  const rs = roots === undefined ? [ROOT_PUB] : roots;
  if (!Array.isArray(rs) || rs.length < 1 || !rs.every(r => is(HEX64, r)) || !Number.isSafeInteger(now) || !is(HEX64, leadPub)) return "setup";
  if (!plain(grant)) return "shape";
  if (grant.kind !== GRANT_KIND) return "kind"; /* plant:grant-kind */
  if (grant.format !== 1) return "shape"; /* plant:grant-format */
  if (!only(grant, GRANT_FIELDS)) return "fields"; /* plant:grant-fields */
  if (!is(HEX64, grant.lead) || !Number.isSafeInteger(grant.issued) || !Number.isSafeInteger(grant.until) || !sigShaped(grant.sig)) return "shape";
  if (typeof grant.paid !== "boolean") return "shape"; /* plant:grant-paid */
  if (grant.lead !== leadPub) return "lead"; /* plant:grant-lead */
  if (grant.until <= grant.issued || grant.until - grant.issued > GRANT_MAX_MS) return "span"; /* plant:grant-span */
  if (grant.issued > now + CALL_SKEW_MS) return "future"; /* plant:grant-future */
  if (now >= grant.until) return "ended"; /* plant:grant-ended */
  let signers = rs;
  if (grant.via !== undefined) {
    const why = delegationWhy(grant.via, grant, rs);
    if (why !== null) return why;
    if (grant.sig.keyId !== grant.via.key.id) return "via-key";
    signers = [grant.via.key.pub];
  }
  if (!signers.some(pub => verified(pub, grantBytes(grant), grant.sig.value))) return "signature"; /* plant:grant-sig */
  return null;
}
const grantOk = (grant, leadPub, now, roots) => grantWhy(grant, leadPub, now, roots) === null;

/* A create's judgement that waits on no team and no store, so the Worker runs it before any object wakes and the object runs
   it again: its shape, its grant for its lead, and the lead's signature over the create and that grant's hash. */
function judgeCreate(rt, body, now, roots) {
  const b = plain(body) ? body : {}, lead = plain(b.lead) ? b.lead : {};
  if (!is(HEX32, rt) || b.rt !== rt || !isId(lead.keyId) || !is(HEX64, lead.pub) || !Number.isSafeInteger(b.t)) return no("bad-signature");
  /* The lead's key id comes from its key, as every other key id here does; a grant names the key alone, so nothing else binds the id. */
  if (!keyMatches(lead.keyId, lead.pub)) return no("bad-signature"); /* plant:create-keyid */
  if (!grantOk(b.grant, lead.pub, now, roots)) return no("bad-grant"); /* plant:create-grant */
  if (!verified(lead.pub, create2Bytes(rt, lead.keyId, b.t, b.grant), b.sig)) return no("bad-signature"); /* plant:create-sig */
  return { ok: true };
}

/* The Etiuda-Blob header, base64url of JSON, as the fields the relay judges; anything else in it is dropped. */
function parseMeta(header) {
  if (typeof header !== "string" || header.length > META_MAX || !/^[A-Za-z0-9_-]+$/.test(header)) return null;
  let m;
  try { m = JSON.parse(Buffer.from(header, "base64url").toString("utf8")); } catch { return null; }
  if (!m || typeof m !== "object" || Array.isArray(m) || m.v !== 1) return null;
  const out = { id: m.id, supersedes: m.supersedes === undefined ? null : m.supersedes, epoch: m.epoch, writer: m.writer,
    counter: m.counter, del: m.del, sig: m.sig, nonce: m.nonce, place: m.place, pub: m.pub === undefined ? null : m.pub };
  const placed = out.place === "root" || INVITE_PLACE.test(String(out.place)) || ANSWER_PLACE.test(String(out.place))
    || (typeof out.place === "string" && out.place.startsWith("desk:") && isId(out.place.slice(5)));
  if (!is(HEX32, out.id) || (out.supersedes !== null && (!is(HEX32, out.supersedes) || out.supersedes === out.id))
    || !isCount(out.epoch) || !isId(out.writer) || !isCount(out.counter) || typeof out.del !== "boolean"
    || !is(HEX128, out.sig) || !is(HEX24, out.nonce) || !placed || (out.pub !== null && !is(HEX64, out.pub))) return null;
  return out;
}

function createCore(deps) {
  const store = deps.store, clock = deps.clock;
  const teamMax = deps.limits && Number.isSafeInteger(deps.limits.teamMax) ? deps.limits.teamMax : B.TEAM_MAX;
  /* For legs only: the roots a grant may trace to. Production code passes none, so the constant stands. */
  const roots = deps.roots === undefined ? [ROOT_PUB] : deps.roots;
  const random = n => crypto.randomBytes(n).toString("hex");
  const fresh = t => Math.abs(clock() - t) <= CALL_SKEW_MS;
  const bodyOf = b => (b && typeof b === "object" && !Array.isArray(b) ? b : {});

  function teamOf(rt) {
    const team = store.get("team");
    return team && team.rt === rt ? team : null;
  }

  /* The grant is judged first, and the object judges it again after the Worker did. The team keeps the grant's until and paid and
     nothing else of it: a repeat create by the same lead keeps the later until, and the paid of the grant that gave it. */
  function create(rt, body) {
    const judged = judgeCreate(rt, body, clock(), roots);
    if (!judged.ok) return judged;
    const b = bodyOf(body), lead = bodyOf(b.lead);
    if (!fresh(b.t)) return no("nonce-stale"); /* plant:create-fresh */
    const team = store.get("team");
    if (team && (team.lead.keyId !== lead.keyId || team.lead.pub !== lead.pub)) return no("not-enrolled"); /* plant:create-taken */
    let until = b.grant.until, paid = b.grant.paid;
    if (team && Number.isSafeInteger(team.until) && team.until >= until) { until = team.until; paid = team.paid === true; } /* plant:until-later */
    store.atomic(() => store.put("team", { rt, lead: { keyId: lead.keyId, pub: lead.pub }, epoch: team ? team.epoch : 0, until, paid }));
    return { ok: true, rt };
  }

  /* The lead's enrolled set replaces the last; a key it leaves out is withdrawn, and every session it holds with it.
     A key it adds lets that key's invitation sessions go, so the next hello is the device's own. */
  function devices(rt, body) {
    const team = teamOf(rt);
    if (!team) return no("not-enrolled");
    const b = bodyOf(body);
    if (!Array.isArray(b.keys) || !Number.isSafeInteger(b.rev) || b.rev < 0 || !Number.isSafeInteger(b.t)) return no("bad-signature");
    if (!verified(team.lead.pub, devicesBytes(rt, b.rev, b.t, b.keys), b.sig)) return no("bad-signature"); /* plant:devices-sig */
    if (!fresh(b.t)) return no("nonce-stale"); /* plant:devices-fresh */
    if (b.rev <= (store.get("devrev") || 0)) return no("replay-rev"); /* plant:devices-rev */
    if (b.keys.length > KEYS_MAX) return no("team-size"); /* plant:devices-cap */
    const next = new Map();
    for (const k of b.keys) {
      /* The lead's key is no desk, under whichever of its two id forms the lead did not take for itself. */
      if (k && k.pub === team.lead.pub) return no("bad-signature"); /* plant:devices-lead-pub */
      const shaped = !!k && typeof k === "object" && isId(k.id) && keyMatches(k.id, k.pub) && B.isDeskId(k.desk) && k.id !== team.lead.keyId;
      if (!shaped || next.has(k.id)) return no("bad-signature"); /* plant:devices-shape */
      next.set(k.id, { pub: k.pub, desk: k.desk });
    }
    const withdrawn = store.list("dev:").map(([k]) => k.slice(4)).filter(id => !next.has(id));
    store.atomic(() => {
      const ord = (store.get("ord") || 0) + 1;
      if (withdrawn.length) store.put("ord", ord); /* plant:order-gone */
      for (const id of withdrawn) {
        const was = store.get("dev:" + id);
        store.put("gone:" + id, Object.assign({}, was || {}, { at: clock(), ord }));
        store.del("dev:" + id);
      }
      for (const [id, v] of next) { store.put("dev:" + id, v); store.del("gone:" + id); }
      store.put("devrev", b.rev);
      for (const [k, s] of store.list("ses:")) {
        if (withdrawn.indexOf(s.key) > -1) store.put(k, Object.assign({}, s, { removed: true })); /* plant:withdraw-sessions */
        if (s.bound && next.has(s.bound)) store.del(k);
      }
      /* An invitation's session is held by no key of its own, so the key it binds is read from the session or the invitation:
         every invitation standing now was registered before this removal, and its session reads nothing from here on. */
      for (const [k, s] of store.list("ses:")) {
        const bound = s.inv ? s.bound || (store.get("inv:" + s.inv) || {}).key : null;
        if (bound && withdrawn.indexOf(bound) > -1) store.put(k, Object.assign({}, s, { removed: true })); /* plant:withdraw-invite-sessions */
      }
    });
    return { ok: true, rev: b.rev, withdrawn };
  }

/* A wrap is {epoch, ct}. The relay keeps at most 1 KiB of its canonical JSON and cannot open it, so anything else on the
     object, a team key among it, is not stored. */
  function takeWrap(wrap) {
    if (!wrap || typeof wrap !== "object" || Array.isArray(wrap)) return no("bad-signature");
    if (!Number.isSafeInteger(wrap.epoch) || wrap.epoch < 1 || typeof wrap.ct !== "string" || wrap.ct.length < 1) return no("bad-signature");
    const size = Buffer.byteLength(canon(wrap), "utf8");
    let over = size > 1025;
    over = size > 1024; /* plant:S3-wrap-cap */
    if (over) return no("blob-size");
    let kept = wrap;
    kept = { epoch: wrap.epoch, ct: wrap.ct }; /* plant:S3-wrap-blind */
    return { ok: true, wrap: kept };
  }

  /* Invitations by their token's sha256 alone. The same call twice is refused while its time still holds. A spent
     invitation is never live again (F9 of the slice 1 review): once its keep is over, or the lead drops it, the relay keeps
     of it its id and that it was spent, and nothing else, so its token is token-spent for as long as the team lives and the
     lead sending its id again adds nothing. An add may carry one wrap for a new id. `wraps` replaces an invitation's one
     wrap. A drop keeps its meaning, and an id dropped in the same call is not given a wrap. */
  function invites(rt, body) {
    const team = teamOf(rt);
    if (!team) return no("not-enrolled");
    const b = bodyOf(body);
    if (!Array.isArray(b.add) || !Array.isArray(b.drop) || !Number.isSafeInteger(b.t)) return no("bad-signature");
    if (b.wraps !== undefined && !Array.isArray(b.wraps)) return no("bad-signature");
    let covered = undefined;
    covered = b.wraps; /* plant:S3-wrap-signed */
    const bytes = invitesBytes(rt, b.t, b.add, b.drop, covered);
    if (!verified(team.lead.pub, bytes, b.sig)) return no("bad-signature"); /* plant:invites-sig */
    if (!fresh(b.t)) return no("nonce-stale"); /* plant:invites-fresh */
    const seen = "seen:" + sha256(bytes);
    if (store.get(seen) !== undefined) return no("replay-counter"); /* plant:invites-replay */
    const wrapRows = b.wraps || [];
    const shaped = b.add.every(a => !!a && typeof a === "object" && !Array.isArray(a) && is(HEX32, a.id) && is(HEX64, a.hash)
      && (a.until === undefined || Number.isSafeInteger(a.until)))
      && b.drop.every(d => is(HEX32, d))
      && wrapRows.every(w => !!w && typeof w === "object" && !Array.isArray(w) && is(HEX32, w.id));
    if (!shaped) return no("bad-signature"); /* plant:invites-shape */
    const prepared = [];
    for (const a of b.add) {
      let kept = null;
      if (a.wrap !== undefined) {
        const taken = takeWrap(a.wrap);
        if (!taken.ok) return taken;
        kept = taken.wrap;
      }
      prepared.push({ id: a.id, hash: a.hash, until: a.until, wrap: kept });
    }
    const replacing = [];
    for (const w of wrapRows) {
      const taken = takeWrap(w.wrap);
      if (!taken.ok) return taken;
      replacing.push({ id: w.id, wrap: taken.wrap });
    }
    const drop = new Set(b.drop);
    const held = new Map(store.list("inv:").map(([k, v]) => [k.slice(4), v]));
    const added = new Map(prepared.filter(a => !held.has(a.id) && !drop.has(a.id)).map(a => [a.id, a]));
    const live = [...held].filter(([id, v]) => !v.spent && !drop.has(id)).length + added.size;
    if (live > INVITES_MAX) return no("team-size"); /* plant:invites-cap */
    const now = clock();
    const used = [];
    store.atomic(() => {
      const ord = (store.get("ord") || 0) + 1;
      if (added.size) store.put("ord", ord); /* plant:order-invite */
      for (const [k, until] of store.list("seen:")) if (until < now) store.del(k);
      store.put(seen, b.t + CALL_SKEW_MS);
      for (const id of drop) {
        const was = held.get(id);
        store.del("inv:" + id);
        let nameUsed = false;
        nameUsed = !!(was && was.spent); /* plant:S3-cancel */
        if (nameUsed) used.push(id);
        if (was && was.spent) store.put("inv:" + id, SPENT); /* plant:spent-drop */
      }
      for (const [k, s] of store.list("ses:")) if (s.inv && drop.has(s.inv)) store.del(k); /* plant:drop-sessions */
      for (const [id, row] of added) {
        const rec = { hash: row.hash, fails: 0, spent: false, uploaded: false, at: now, ord };
        if (row.until !== undefined) rec.until = row.until;
        if (row.wrap) rec.wrap = row.wrap;
        store.put("inv:" + id, rec);
      }
      for (const entry of replacing) {
        if (drop.has(entry.id)) continue;
        const cur = store.get("inv:" + entry.id);
        /* Opened, so spent, and not yet admitted: the new wrap replaces the old. An admitted invitation, or one kept only as spent, is left. */
        if (!cur || cur.uploaded || !cur.hash) continue;
        let replace = false;
        replace = true; /* plant:S3-reseal */
        const next = Object.assign({}, cur);
        if (replace) delete next.oldWrap;
        else next.oldWrap = cur.wrap;
        next.wrap = entry.wrap;
        store.put("inv:" + entry.id, next);
      }
    });
    return { ok: true, dropped: [...drop], used };
  }

  function challenge(rt) {
    if (!teamOf(rt)) return no("not-enrolled"); /* plant:challenge-team */
    const now = clock(), nonce = random(16), n = (store.get("chn") || 0) + 1;
    store.atomic(() => {
      const held = store.list("ch:").sort((a, b) => a[1].n - b[1].n);
      const live = held.filter(([k, c]) => (now - c.at > CHALLENGE_MS ? (store.del(k), false) : true));
      for (const [k] of live.slice(0, Math.max(0, live.length - CHALLENGES_MAX + 1))) store.del(k); /* plant:challenge-cap */
      store.put("chn", n);
      store.put("ch:" + nonce, { at: now, n });
    });
    return { ok: true, challenge: nonce, until: now + CHALLENGE_MS };
  }

  /* A session for a live challenge, signed by an enrolled key or the lead's, or holding an invitation's token. The
     challenge is spent only on success, and a removed key's hello is verified before it is told so. */
  function session(rt, body) {
    const team = teamOf(rt);
    if (!team) return no("not-enrolled");
    const b = bodyOf(body);
    const ch = is(HEX32, b.challenge) ? store.get("ch:" + b.challenge) : undefined;
    if (ch === undefined) return no("hello-replay"); /* plant:challenge-once */
    if (clock() - ch.at > CHALLENGE_MS) return no("nonce-stale"); /* plant:challenge-life */
    return b.invite !== undefined ? byToken(rt, b) : byKey(team, rt, b);
  }

  function byToken(rt, b) {
    const inv = is(HEX32, b.inv) ? store.get("inv:" + b.inv) : undefined;
    if (!inv) return no("not-enrolled");
    if (inv.fails >= TOKEN_TRIES) return no("token-tries"); /* plant:token-tries */
    if (inv.spent) return no("token-spent"); /* plant:token-spent */
    const right = typeof b.invite === "string" && b.invite.length <= TOKEN_MAX
      && crypto.timingSafeEqual(Buffer.from(sha256(b.invite), "hex"), Buffer.from(inv.hash, "hex"));
    if (!right) return failedTry(b.inv, inv); /* plant:token-match */
    /* After the end the token hello is refused, the token stays unspent and the wrap is deleted. A key already bound
       still fetches the wrap it was served: the end bounds an unused invitation only. The instant of the end is still live. */
    let ended = false;
    ended = inv.until != null && clock() > inv.until; /* plant:S3-lapse */
    if (ended) {
      store.atomic(() => {
        const cur = store.get("inv:" + b.inv);
        if (!cur || cur.spent) return;
        const next = Object.assign({}, cur);
        delete next.wrap;
        store.put("inv:" + b.inv, next);
      });
      return no("invite-ended");
    }
    /* The first use is this hello, and only where it binds the desk's own key. A right token that binds no key is refused
       and spends nothing: the token stays unspent, the failure is not one of the 20 tries, and the challenge is kept. */
    const binds = isId(b.key) && keyMatches(b.key, b.pub) && verified(b.pub, helloBytes(rt, b.challenge, b.key), b.sig);
    let allowUnbound = true;
    allowUnbound = false; /* plant:S3-unbound */
    if (!binds && !allowUnbound) return no("bad-signature");
    /* A key already removed opens no read on an invitation registered before that removal. The token is not spent. */
    if (binds) {
      const gone = store.get("gone:" + b.key);
      if (gone && !registeredAfter(inv, gone)) return no("removed"); /* plant:token-removed */
    }
    const who = { key: null, inv: b.inv };
    if (binds) who.bound = b.key;
    return issue(b.challenge, who, () => {
      const next = Object.assign({}, inv, { spent: true, spentAt: clock() }); /* plant:token-spend */
      if (binds) { next.key = b.key; next.pub = b.pub; }
      store.put("inv:" + b.inv, next);
    });
  }

  /* An invitation spent by a token hello that bound this key, inside its keep: the binding ends when the keep does, at the
     time of use, whether or not a list has pruned the record by then (C2 of the read of cf90c15). After the one upload the
     same key still opens a session, until it is enrolled, the invitation is dropped or the keep ends. */
  function boundInvite(key) {
    const now = clock();
    const skipUploaded = false;
    for (const [k, v] of store.list("inv:")) {
      if (!v.spent || v.key !== key || !is(HEX64, v.pub)) continue;
      if (skipUploaded && v.uploaded) continue;
      if (now - v.spentAt > KEEP_MS) continue; /* plant:bound-keep */
      return { id: k.slice(4), inv: v };
    }
    return null;
  }

  function failedTry(id, inv) {
    store.atomic(() => store.put("inv:" + id, Object.assign({}, inv, { fails: inv.fails + 1 })));
    return no("not-enrolled");
  }

  function byKey(team, rt, b) {
    if (!isId(b.key)) return no("not-enrolled");
    const msg = helloBytes(rt, b.challenge, b.key);
    if (b.key === team.lead.keyId) {
      if (!verified(team.lead.pub, msg, b.sig)) return no("bad-signature"); /* plant:lead-sig */
      return issue(b.challenge, { key: b.key, inv: null });
    }
    const dev = store.get("dev:" + b.key), gone = store.get("gone:" + b.key);
    if (!dev && gone && !verified(gone.pub, msg, b.sig)) return no("bad-signature"); /* plant:removed-sig */
    if (!dev && gone) {
      /* The invitation's session again, only where the lead registered it after this removal, for its one upload. */
      const held = boundInvite(b.key);
      if (held && registeredAfter(held.inv, gone) && verified(held.inv.pub, msg, b.sig))
        return issue(b.challenge, { key: null, inv: held.id, bound: b.key }, () => {
          for (const [k, x] of store.list("ses:")) if (x.inv === held.id) store.del(k);
        });
      return no("removed"); /* plant:removed-key */
    }
    if (!dev) {
      /* A key on no list that a token hello bound: the invitation's session again, for its one upload and then its answer alone, and only one held. */
      const held = boundInvite(b.key);
      if (held && verified(held.inv.pub, msg, b.sig)) /* plant:invite-resume */
        return issue(b.challenge, { key: null, inv: held.id, bound: b.key }, () => {
          for (const [k, x] of store.list("ses:")) if (x.inv === held.id) store.del(k);
        });
      return no("not-enrolled"); /* plant:key-enrolled */
    }
    if (!verified(dev.pub, msg, b.sig)) return no("bad-signature"); /* plant:key-sig */
    return issue(b.challenge, { key: b.key, inv: null });
  }

  /* The session is kept by its sha256, so the store holds nothing a reader could present. */
  function issue(nonce, who, also) {
    const token = random(32), now = clock(), until = now + SESSION_MS;
    store.atomic(() => {
      also && also();
      store.del("ch:" + nonce); /* plant:challenge-spend */
      const held = store.list("ses:").filter(([k, s]) => (s.until < now ? (store.del(k), false) : true)).sort((a, b) => a[1].until - b[1].until);
      for (const [k] of held.slice(0, Math.max(0, held.length - SESSIONS_MAX + 1))) store.del(k); /* plant:session-cap */
      store.put("ses:" + sha256(token), who.bound ? { key: who.key, inv: who.inv, bound: who.bound, until } : { key: who.key, inv: who.inv, until });
    });
    return who.inv ? { ok: true, session: token, until, invite: true } : { ok: true, session: token, until };
  }

  /* An invitation registered strictly after the key was withdrawn, by the order the relay itself keeps: "ord", raised in
     the same atomic write as the gone row (devices) and as the invitation (invites), so a relay clock stepping back cannot
     make an invitation the lead registered before a removal read as after it. A row with no order, written before the
     counter existed, is not after. */
  function registeredAfter(inv, gone) {
    return !!inv && !!gone && Number.isSafeInteger(inv.ord) && Number.isSafeInteger(gone.ord) && inv.ord > gone.ord;
  }

  /* An invitation's session bound to a key removed earlier may put its one request and may not read. */
  function quietSession(s) {
    if (!s || !s.inv || s.key) return false;
    const inv = store.get("inv:" + s.inv);
    if (!inv) return false;
    const who = s.bound || inv.key;
    if (!who) return false;
    const gone = store.get("gone:" + who);
    return registeredAfter(inv, gone);
  }

  /* The wrap, and only to the session whose hello bound the invitation's key. Gone once the upload or a drop deletes it. */
  function wrapFor(token) {
    const s = sessionOf(token);
    if (!s.ok) return s;
    let onlyBound = false;
    onlyBound = true; /* plant:S3-wrap-session */
    if (!onlyBound) {
      for (const [, v] of store.list("inv:")) if (v.wrap) return { ok: true, wrap: { epoch: v.wrap.epoch, ct: v.wrap.ct } };
      return no("missing");
    }
    if (!s.inv || !s.bound) return no("not-enrolled");
    const inv = store.get("inv:" + s.inv);
    if (!inv || inv.key !== s.bound) return no("not-enrolled");
    if (!inv.wrap) return no("missing");
    return { ok: true, wrap: { epoch: inv.wrap.epoch, ct: inv.wrap.ct } };
  }

  /* The lead's session, and only the lead's, is told each invitation's state. The used time is the clock at the hello and stays after the upload. */
  function statesFor(rt, token) {
    const team = teamOf(rt);
    if (!team) return no("not-enrolled");
    const s = sessionOf(token);
    if (!s.ok) return s;
    if (s.inv || s.key !== team.lead.keyId) return no("not-enrolled");
    const states = [];
    for (const [k, v] of store.list("inv:")) {
      const id = k.slice(4);
      if (!v.spent) {
        states.push({ id: id, state: "unused", usedAt: null });
        continue;
      }
      let keepTime = false;
      keepTime = true; /* plant:S3-states */
      states.push({ id: id, state: v.uploaded ? "asked" : "used", usedAt: keepTime && v.spentAt !== undefined ? v.spentAt : null });
    }
    return { ok: true, states: states };
  }

  function sessionByHash(h) {
    const s = is(HEX64, h) ? store.get("ses:" + h) : undefined;
    if (!s) return no("no-hello"); /* plant:session-known */
    if (clock() > s.until) return no("no-hello"); /* plant:session-life */
    if (s.removed) return no("removed"); /* plant:session-removed */
    const out = { ok: true, hash: h, key: s.key, inv: s.inv, bound: s.bound || null, until: s.until };
    if (quietSession(out)) out.quiet = true; /* plant:rejoin-quiet */
    return out;
  }
  const sessionOf = token => sessionByHash(is(HEX64, token) ? sha256(token) : null);

  function expired(m, now) {
    return m.del && now - m.at > KEEP_MS; /* plant:deletion-keep */
  }

  function served(m) {
    const out = { v: 1, id: m.id, supersedes: m.supersedes, epoch: m.epoch, writer: m.writer, counter: m.counter, del: m.del,
      size: m.size, sig: m.sig, nonce: m.nonce };
    if (m.pub) out.pub = m.pub;
    if (m.place) out.place = m.place;
    return out;
  }

  /* An uploaded invitation's session, while its key is not enrolled, fetches only its answer. Lifting the plant opens the team. */
  function answerOnly(s) {
    let gate = false;
    gate = true; /* plant:S3-read-on */
    if (!gate || !s || !s.inv) return false;
    const inv = store.get("inv:" + s.inv);
    if (!inv || !inv.uploaded) return false;
    if (s.bound && store.get("dev:" + s.bound)) return false;
    return true;
  }

  function readGate(token) {
    const s = sessionOf(token);
    if (!s.ok) return s;
    if (answerOnly(s)) return no("not-enrolled");
    return null;
  }

  function isAnswer(m) {
    return !!(m && ANSWER_PLACE.test(String(m.place || "")) && m.id === String(m.place).slice(7));
  }

  function since(token, after) {
    const s = sessionOf(token);
    if (!s.ok) return s;
    if (s.quiet) return no("removed");
    if (answerOnly(s)) return no("not-enrolled");
    const now = clock(), items = [];
    for (const [, id] of store.list("seq:", { after: "seq:" + pad(after), limit: SINCE_MAX })) {
      const m = store.get("blob:" + id);
      if (m && !expired(m, now) && !isAnswer(m)) items.push({ seq: m.seq, meta: served(m) });
    }
    return { ok: true, items };
  }

  function blobFor(token, id) {
    const s = sessionOf(token);
    if (!s.ok) return s;
    const now = clock();
    const m = is(HEX32, id) ? store.get("blob:" + id) : undefined;
    if (m && expired(m, now)) return no("expired");
    /* The lead's answer to its own request reaches even a desk rejoining after its removal (the quiet session of board
       918): after its one upload it reads that answer and nothing else, as board 922 rules for every invitation. */
    const ownAnswer = answerOnly(s) && isAnswer(m) && m.place === "answer:" + s.inv;
    if (ownAnswer) return { ok: true, meta: served(m), obj: m.obj };
    if (s.quiet) return no("removed");
    if (answerOnly(s)) {
      if (m) return no("not-enrolled");
      const tomb = is(HEX32, id) ? store.get("tomb:" + id) : undefined;
      if (tomb && now <= tomb.until) return no(tomb.why);
      return no("missing");
    }
    if (m && isAnswer(m)) return no("missing");
    if (m) return { ok: true, meta: served(m), obj: m.obj };
    const tomb = is(HEX32, id) ? store.get("tomb:" + id) : undefined;
    if (tomb && now <= tomb.until) return no(tomb.why);
    return no("missing");
  }

  /* Who uploads, where, and how much: what can be judged before the body is read. */
  function admit(rt, token, m, pathId) {
    const team = teamOf(rt);
    if (!team) return no("not-enrolled");
    const s = sessionOf(token);
    if (!s.ok) return s; /* plant:put-session */
    if (!m || m.id !== pathId) return no("bad-signature");
    if (s.inv) return admitInvite(team, s, m);
    if (s.key !== m.writer) return no("no-hello"); /* plant:put-writer */
    const lead = m.writer === team.lead.keyId;
    const dev = lead ? null : store.get("dev:" + m.writer);
    if (!lead && !dev) return no("removed");
    if (lead && ANSWER_PLACE.test(String(m.place))) {
      if (m.id !== String(m.place).slice(7)) return no("outside-place");
      return { ok: true, team, s, max: B.BLOB_MAX, pub: team.lead.pub, lead: true, invite: null };
    }
    if (m.place !== (lead ? "root" : "desk:" + dev.desk) && !(lead && INVITE_PLACE.test(m.place))) return no("outside-place"); /* plant:put-place */
    return { ok: true, team, s, max: B.BLOB_MAX, pub: lead ? team.lead.pub : dev.pub, lead, invite: null };
  }

  /* An invitation's one upload: a writer on no list, at a desk place nobody holds, small, signed by the key its id names,
     inside the invitation's keep. A record pruned to {spent: true} has lost its times and whether the upload was made, so it
     admits nothing; nor does one past its keep that no list has pruned yet, so a session opened just inside the keep makes
     no upload after it, a list between or not (C2 of the read of cf90c15). */
  function admitInvite(team, s, m) {
    const inv = store.get("inv:" + s.inv);
    if (!inv) return no("no-hello");
    if (inv.uploaded) return no("token-spent"); /* plant:invite-once */
    if (inv.spentAt === undefined) return no("token-spent"); /* plant:invite-pruned */
    if (clock() - inv.spentAt > KEEP_MS) return no("token-spent"); /* plant:invite-keep */
    if (s.bound && m.writer !== s.bound) return no("no-hello"); /* plant:invite-bound */
    if (m.writer === team.lead.keyId || store.get("dev:" + m.writer) !== undefined) return no("no-hello"); /* plant:invite-stranger */
    const goneRec = store.get("gone:" + m.writer);
    if (goneRec && !registeredAfter(inv, goneRec)) return no("removed"); /* plant:invite-removed */
    const pub = m.pub !== null ? m.pub : m.writer;
    if (!keyMatches(m.writer, pub)) return no("bad-signature"); /* plant:invite-key */
    if (pub === team.lead.pub) return no("no-hello"); /* plant:invite-lead-pub */
    const ownDesk = !!(goneRec && registeredAfter(inv, goneRec) && m.place === "desk:" + goneRec.desk);
    let atDesk = true;
    atDesk = typeof m.place === "string" && m.place.indexOf("desk:") === 0; /* plant:S3-invite-place */
    if (!atDesk || m.place === "root" || !ownDesk && deskHeld(m.place.slice(5))) return no("outside-place"); /* plant:invite-place */
    return { ok: true, team, s, max: INVITE_UPLOAD_MAX, pub, lead: false, invite: s.inv, inv };
  }

  function deskHeld(desk) {
    return store.list("dev:").concat(store.list("gone:")).some(([, v]) => v.desk === desk);
  }

  function chainOwner(id) {
    const m = store.get("blob:" + id);
    if (m) return m.writer;
    const tomb = store.get("tomb:" + id);
    return tomb && clock() <= tomb.until ? tomb.writer : null;
  }

  /* Every check of an upload, in order, changing nothing. The commit runs it again after the bucket's write. */
  function judge(rt, token, m, pathId, ct) {
    const a = admit(rt, token, m, pathId);
    if (!a.ok) return a;
    if (ct.length > a.max) return no("blob-size"); /* plant:put-size */
    const aad = B.aadOf({ relayTeamId: rt, epoch: m.epoch, id: m.id, supersedes: m.supersedes, writerKeyId: m.writer, counter: m.counter });
    if (!aad || !B.verifyUpload(a.pub, aad, ct, m.sig)) return no("bad-signature"); /* plant:put-sig */
    if (!B.counterFresh(store.get("counters") || {}, m.writer, m.epoch, m.counter).ok) return no("replay-counter"); /* plant:put-counter */
    if (store.get("blob:" + m.id) !== undefined || store.get("tomb:" + m.id) !== undefined) return no("replay-counter"); /* plant:put-id */
    const owner = m.supersedes === null ? null : chainOwner(m.supersedes);
    if (owner !== null && owner !== m.writer && !a.lead) return no("outside-place"); /* plant:put-chain */
    if (m.supersedes !== null && store.get("tomb:" + m.supersedes) !== undefined) return no("superseded"); /* plant:put-tomb */
    if (m.epoch < a.team.epoch) return no("epoch"); /* plant:put-epoch */
    /* Above the epoch the lead's uploads have raised, only the lead. A desk at an epoch the team has not reached is
       refused. Before any lead upload the team is at epoch 1, which is where a team's files begin (F7). */
    if (!a.lead && m.epoch > (a.team.epoch > 0 ? a.team.epoch : 1)) return no("epoch"); /* plant:put-above */
    const old = m.supersedes === null ? undefined : store.get("blob:" + m.supersedes);
    if (!B.checkTeamSize((store.get("bytes") || 0) - (old ? old.size : 0), ct.length, teamMax).ok) return no("team-size"); /* plant:put-team */
    const rate = B.checkRate(store.get("rate:" + m.writer), clock());
    if (!rate.ok) return no("rate"); /* plant:put-rate */
    return { ok: true, a, old, stamps: rate.stamps };
  }

  function commit(rt, token, m, pathId, ct, obj) {
    const j = judge(rt, token, m, pathId, ct);
    if (!j.ok) return j; /* plant:commit-judge */
    const now = clock(), seq = (store.get("seq") || 0) + 1, drop = [];
    store.atomic(() => {
      store.put("seq", seq);
      store.put("counters", B.raiseCounter(store.get("counters"), m.writer, m.epoch, m.counter));
      store.put("rate:" + m.writer, j.stamps);
      store.put("bytes", (store.get("bytes") || 0) + ct.length);
      if (j.old) bury(j.old, "superseded", now, drop); /* plant:supersede-drop */
      if (j.a.lead && m.epoch > j.a.team.epoch) store.put("team", Object.assign({}, j.a.team, { epoch: m.epoch }));
      if (j.a.invite) {
        const next = Object.assign({}, j.a.inv, { uploaded: true });
        let clear = false;
        clear = true; /* plant:S3-burn */
        if (clear) delete next.wrap;
        store.put("inv:" + j.a.invite, next); /* plant:invite-mark */
      }
      const rec = { id: m.id, supersedes: m.supersedes, epoch: m.epoch, writer: m.writer, counter: m.counter, del: m.del,
        size: ct.length, sig: m.sig, nonce: m.nonce, seq, at: now, obj };
      if (j.a.invite) rec.pub = j.a.pub;
      if (INVITE_PLACE.test(m.place) || ANSWER_PLACE.test(String(m.place))) rec.place = m.place;
      store.put("blob:" + m.id, rec);
      store.put("seq:" + pad(seq), m.id);
      if (m.del) store.put(expiryKey(now + KEEP_MS, m.id), "del");
    });
    return { ok: true, seq, id: m.id, size: ct.length, writer: m.writer, session: j.a.s.hash, drop, uploadedInv: j.a.invite || null };
  }

  /* A blob no longer served: its bytes given back, its object for the caller to delete, and its id kept 30 days as a
     tombstone, so a fetch says why and a later upload cannot reuse it. */
  function bury(m, why, now, drop) {
    store.del("blob:" + m.id);
    store.del("seq:" + pad(m.seq));
    if (m.del) store.del(expiryKey(m.at + KEEP_MS, m.id));
    store.put("bytes", Math.max(0, (store.get("bytes") || 0) - m.size));
    store.put("tomb:" + m.id, { writer: m.writer, why, until: now + KEEP_MS });
    store.put(expiryKey(now + KEEP_MS, m.id), "tomb");
    drop.push(m.obj);
  }

  /* Deletion records past their keep, tombstones past theirs, a spent invitation's hash and times past its keep (its id and
     that it was spent stay), and objects a delete missed. */
  function prune() {
    const now = clock(), drop = [];
    store.atomic(() => {
      for (const [k, kind] of store.list("kx:")) {
        if (Number(k.slice(3, 19)) >= now) break;
        const id = k.slice(20);
        store.del(k);
        if (kind === "tomb") { store.del("tomb:" + id); continue; }
        const m = store.get("blob:" + id);
        if (m && expired(m, now)) bury(m, "expired", now, drop);
      }
      for (const [k, v] of store.list("inv:")) {
        if (!v.spent || v.spentAt === undefined || now - v.spentAt <= KEEP_MS) continue;
        store.del(k);
        store.put(k, SPENT); /* plant:spent-kept */
      }
      for (const [k] of store.list("orphan:")) { drop.push(k.slice(7)); store.del(k); }
    });
    return drop;
  }

  function orphan(obj) {
    store.atomic(() => store.put("orphan:" + obj, 1));
  }

  /* Whether this object holds the team of that id: the question the object asks before it awaits a body. */
  const hasTeam = rt => teamOf(rt) !== null;

  return { create, devices, invites, challenge, session, sessionOf, sessionByHash, since, blobFor, admit, judge, commit,
    prune, orphan, parseMeta, wrapFor, statesFor, readGate, hasTeam };
}

module.exports = {
  CHALLENGE_MS, SESSION_MS, CALL_SKEW_MS, KEEP_MS, TOKEN_TRIES, INVITES_MAX, INVITE_UPLOAD_MAX, CHALLENGES_MAX,
  SESSIONS_MAX, KEYS_MAX, SINCE_MAX, ROOT_PUB, GRANT_MAX_MS, canon, createBytes, create2Bytes, devicesBytes, invitesBytes, helloBytes,
  grantBytes, delegationBytes, grantWhy, grantOk, judgeCreate, keyMatches, parseMeta,
  createCore,
};
