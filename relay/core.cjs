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
/* blob.cjs's id shape, the one its associated data carries, so no newline or separator rides in a key or desk id. */
const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
/* The lead's place for what it seals under one invitation's key alone (step 4's joining bootstrap): served in the clear,
   so a desk not joining by that invitation passes over it without trying to open it. */
const INVITE_PLACE = /^invite:[0-9a-f]{32}$/;

const is = (re, v) => typeof v === "string" && re.test(v);
const isId = v => is(ID_RE, v);
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
const devicesBytes = (rt, rev, t, keys) => Buffer.from("etiuda-relay-devices\n" + rt + "\n" + rev + "\n" + t + "\n" + canon(keys), "utf8");
const invitesBytes = (rt, t, add, drop) => Buffer.from("etiuda-relay-invites\n" + rt + "\n" + t + "\n" + canon({ add, drop }), "utf8");
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

/* The Etiuda-Blob header, base64url of JSON, as the fields the relay judges; anything else in it is dropped. */
function parseMeta(header) {
  if (typeof header !== "string" || header.length > META_MAX || !/^[A-Za-z0-9_-]+$/.test(header)) return null;
  let m;
  try { m = JSON.parse(Buffer.from(header, "base64url").toString("utf8")); } catch { return null; }
  if (!m || typeof m !== "object" || Array.isArray(m) || m.v !== 1) return null;
  const out = { id: m.id, supersedes: m.supersedes === undefined ? null : m.supersedes, epoch: m.epoch, writer: m.writer,
    counter: m.counter, del: m.del, sig: m.sig, nonce: m.nonce, place: m.place, pub: m.pub === undefined ? null : m.pub };
  const placed = out.place === "root" || INVITE_PLACE.test(String(out.place))
    || (typeof out.place === "string" && out.place.startsWith("desk:") && isId(out.place.slice(5)));
  if (!is(HEX32, out.id) || (out.supersedes !== null && (!is(HEX32, out.supersedes) || out.supersedes === out.id))
    || !isCount(out.epoch) || !isId(out.writer) || !isCount(out.counter) || typeof out.del !== "boolean"
    || !is(HEX128, out.sig) || !is(HEX24, out.nonce) || !placed || (out.pub !== null && !is(HEX64, out.pub))) return null;
  return out;
}

function createCore(deps) {
  const store = deps.store, clock = deps.clock;
  const teamMax = deps.limits && Number.isSafeInteger(deps.limits.teamMax) ? deps.limits.teamMax : B.TEAM_MAX;
  const random = n => crypto.randomBytes(n).toString("hex");
  const fresh = t => Math.abs(clock() - t) <= CALL_SKEW_MS;
  const bodyOf = b => (b && typeof b === "object" && !Array.isArray(b) ? b : {});

  function teamOf(rt) {
    const team = store.get("team");
    return team && team.rt === rt ? team : null;
  }

  function create(rt, body) {
    const b = bodyOf(body), lead = bodyOf(b.lead);
    if (!is(HEX32, rt) || b.rt !== rt || !isId(lead.keyId) || !is(HEX64, lead.pub) || !Number.isSafeInteger(b.t)) return no("bad-signature");
    if (!verified(lead.pub, createBytes(rt, lead.keyId, b.t), b.sig)) return no("bad-signature"); /* plant:create-sig */
    if (!fresh(b.t)) return no("nonce-stale"); /* plant:create-fresh */
    const team = store.get("team");
    if (team && (team.lead.keyId !== lead.keyId || team.lead.pub !== lead.pub)) return no("not-enrolled"); /* plant:create-taken */
    store.atomic(() => store.put("team", { rt, lead: { keyId: lead.keyId, pub: lead.pub }, epoch: team ? team.epoch : 0 }));
    return { ok: true, rt };
  }

  /* The lead's enrolled set replaces the last; a key it leaves out is withdrawn, and every session it holds with it. */
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
      const shaped = !!k && typeof k === "object" && isId(k.id) && keyMatches(k.id, k.pub) && isId(k.desk) && k.id !== team.lead.keyId;
      if (!shaped || next.has(k.id)) return no("bad-signature"); /* plant:devices-shape */
      next.set(k.id, { pub: k.pub, desk: k.desk });
    }
    const withdrawn = store.list("dev:").map(([k]) => k.slice(4)).filter(id => !next.has(id));
    store.atomic(() => {
      for (const id of withdrawn) { store.put("gone:" + id, store.get("dev:" + id)); store.del("dev:" + id); }
      for (const [id, v] of next) { store.put("dev:" + id, v); store.del("gone:" + id); }
      store.put("devrev", b.rev);
      for (const [k, s] of store.list("ses:")) if (withdrawn.indexOf(s.key) > -1) store.put(k, Object.assign({}, s, { removed: true })); /* plant:withdraw-sessions */
    });
    return { ok: true, rev: b.rev, withdrawn };
  }

  /* Invitations by their token's sha256 alone. The same call twice is refused while its time still holds. A spent
     invitation is never live again (F9 of the slice 1 review): once its keep is over, or the lead drops it, the relay keeps
     of it its id and that it was spent, and nothing else, so its token is token-spent for as long as the team lives and the
     lead sending its id again adds nothing. */
  function invites(rt, body) {
    const team = teamOf(rt);
    if (!team) return no("not-enrolled");
    const b = bodyOf(body);
    if (!Array.isArray(b.add) || !Array.isArray(b.drop) || !Number.isSafeInteger(b.t)) return no("bad-signature");
    const bytes = invitesBytes(rt, b.t, b.add, b.drop);
    if (!verified(team.lead.pub, bytes, b.sig)) return no("bad-signature"); /* plant:invites-sig */
    if (!fresh(b.t)) return no("nonce-stale"); /* plant:invites-fresh */
    const seen = "seen:" + sha256(bytes);
    if (store.get(seen) !== undefined) return no("replay-counter"); /* plant:invites-replay */
    const shaped = b.add.every(a => !!a && typeof a === "object" && is(HEX32, a.id) && is(HEX64, a.hash)) && b.drop.every(d => is(HEX32, d));
    if (!shaped) return no("bad-signature"); /* plant:invites-shape */
    const drop = new Set(b.drop);
    const held = new Map(store.list("inv:").map(([k, v]) => [k.slice(4), v]));
    const added = new Map(b.add.filter(a => !held.has(a.id) && !drop.has(a.id)).map(a => [a.id, a.hash]));
    const live = [...held].filter(([id, v]) => !v.spent && !drop.has(id)).length + added.size;
    if (live > INVITES_MAX) return no("team-size"); /* plant:invites-cap */
    const now = clock();
    store.atomic(() => {
      for (const [k, until] of store.list("seen:")) if (until < now) store.del(k);
      store.put(seen, b.t + CALL_SKEW_MS);
      for (const id of drop) {
        const was = held.get(id);
        store.del("inv:" + id);
        if (was && was.spent) store.put("inv:" + id, SPENT); /* plant:spent-drop */
      }
      for (const [k, s] of store.list("ses:")) if (s.inv && drop.has(s.inv)) store.del(k); /* plant:drop-sessions */
      for (const [id, hash] of added) store.put("inv:" + id, { hash, fails: 0, spent: false, uploaded: false });
    });
    return { ok: true, dropped: [...drop] };
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
    /* The desk's own key, where its hello is signed by it, is bound to the invitation as it is spent (N4): until the one
       upload is made, that key and no token opens the invitation's session again, so a request lost on the way is sent
       again without a second use of the token. */
    const bound = isId(b.key) && keyMatches(b.key, b.pub) && verified(b.pub, helloBytes(rt, b.challenge, b.key), b.sig)
      ? { key: b.key, pub: b.pub } : {};
    return issue(b.challenge, { key: null, inv: b.inv }, () => {
      store.put("inv:" + b.inv, Object.assign({}, inv, { spent: true, spentAt: clock() }, bound)); /* plant:token-spend */
    });
  }

  /* An invitation spent by a token hello that bound this key, its one upload not yet made, inside its keep: the binding ends
     when the keep does, at the time of use, whether or not a list has pruned the record by then (C2 of the read of cf90c15). */
  function boundInvite(key) {
    const now = clock();
    for (const [k, v] of store.list("inv:")) {
      if (!v.spent || v.uploaded || v.key !== key || !is(HEX64, v.pub)) continue;
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
    if (!dev && gone) return no("removed"); /* plant:removed-key */
    if (!dev) {
      /* A key on no list that a token hello bound: the invitation's session again, for its one upload, and only one held. */
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

  function sessionByHash(h) {
    const s = is(HEX64, h) ? store.get("ses:" + h) : undefined;
    if (!s) return no("no-hello"); /* plant:session-known */
    if (clock() > s.until) return no("no-hello"); /* plant:session-life */
    if (s.removed) return no("removed"); /* plant:session-removed */
    return { ok: true, hash: h, key: s.key, inv: s.inv, bound: s.bound || null, until: s.until };
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

  function since(token, after) {
    const s = sessionOf(token);
    if (!s.ok) return s;
    const now = clock(), items = [];
    for (const [, id] of store.list("seq:", { after: "seq:" + pad(after), limit: SINCE_MAX })) {
      const m = store.get("blob:" + id);
      if (m && !expired(m, now)) items.push({ seq: m.seq, meta: served(m) });
    }
    return { ok: true, items };
  }

  function blobFor(token, id) {
    const s = sessionOf(token);
    if (!s.ok) return s;
    const now = clock();
    const m = is(HEX32, id) ? store.get("blob:" + id) : undefined;
    if (m && expired(m, now)) return no("expired");
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
    if (store.get("gone:" + m.writer) !== undefined) return no("removed"); /* plant:invite-removed */
    const pub = m.pub !== null ? m.pub : m.writer;
    if (!keyMatches(m.writer, pub)) return no("bad-signature"); /* plant:invite-key */
    if (m.place === "root" || deskHeld(m.place.slice(5))) return no("outside-place"); /* plant:invite-place */
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
      if (j.a.invite) store.put("inv:" + j.a.invite, Object.assign({}, j.a.inv, { uploaded: true })); /* plant:invite-mark */
      const rec = { id: m.id, supersedes: m.supersedes, epoch: m.epoch, writer: m.writer, counter: m.counter, del: m.del,
        size: ct.length, sig: m.sig, nonce: m.nonce, seq, at: now, obj };
      if (j.a.invite) rec.pub = j.a.pub;
      if (INVITE_PLACE.test(m.place)) rec.place = m.place;
      store.put("blob:" + m.id, rec);
      store.put("seq:" + pad(seq), m.id);
      if (m.del) store.put(expiryKey(now + KEEP_MS, m.id), "del");
    });
    return { ok: true, seq, id: m.id, size: ct.length, writer: m.writer, session: j.a.s.hash, drop };
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

  return { create, devices, invites, challenge, session, sessionOf, sessionByHash, since, blobFor, admit, judge, commit,
    prune, orphan, parseMeta };
}

module.exports = {
  CHALLENGE_MS, SESSION_MS, CALL_SKEW_MS, KEEP_MS, TOKEN_TRIES, INVITES_MAX, INVITE_UPLOAD_MAX, CHALLENGES_MAX,
  SESSIONS_MAX, KEYS_MAX, SINCE_MAX, canon, createBytes, devicesBytes, invitesBytes, helloBytes, keyMatches, parseMeta,
  createCore,
};
