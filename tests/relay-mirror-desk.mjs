/* A DESK ON A RELAY TEAM'S MIRROR, for the legs that need a team's catalog folder to be a team's place.
 *
 * A team works over the relay only, and no folder is read as a team: the one place a desk reads a team file, and the catalog folder
 * of a team's desk, is the mirror the relay channel keeps, `<userData>/relay/<rt>/`. A leg that wants a team desk therefore builds
 * it the way a desk comes to one by invitation: desk.json pins the lead (teamPins, teamPinFrom "invite"), names the relay
 * (teamChannel), shows the team (teamShown, its folder the mirror), and the team file in the mirror names that relay. This helper
 * writes exactly that, and nothing else of a desk's: tests/desk-first-edition.mjs and tests/join-policy.mjs (waitDesk) build the
 * same desk by hand.
 *
 * It also stands in for the relay between desks, for the legs that put several desks on one team. `store` is a folder that plays
 * the relay's copy of the team; `relayMirrorSync` carries it to a desk's mirror and back. A stand-in judges nothing: a file lands
 * as it was put, and what a desk makes of it is the shell's own reading, which is what such a leg holds (the relay channel's own
 * judgement of what it may carry is held by tests/relay-channel.mjs). What goes where:
 *   - every file of the store that is not a desk's own (the team file, the ring, a catalog) reaches the mirror, the store's
 *     bytes winning over what the mirror held;
 *   - a desk's own files, `desks/<id>/...`, go both ways, the newer by modified time winning, and a file taken from one side
 *     since the last carry is taken from the other; a file the store held and no longer does is taken from the mirror too.
 * A mirror holds nothing the syncer used to leave there (.outbox.json, .primed): they are the folder syncer's, not the relay's.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const RELAY_URL = "https://etiuda.dev/relay/v1";
export const RELAY_HOST = "etiuda.dev";

/* One relay token per team, the same on every desk of the team, as 32 hex characters (the shell's own shape for one). */
export function relayTokenOf(team) {
  return crypto.createHash("sha256").update("relay-token\n" + String(team)).digest("hex").slice(0, 32);
}
export function relayMirrorOf(ud, team) {
  return path.join(ud, "relay", relayTokenOf(team));
}
/* What a team's file names as its channel. */
export function relayChannelOf(team) {
  return { kind: "relay", rt: relayTokenOf(team), url: RELAY_URL };
}

/* The facts desk.json holds for a desk that follows `team` over the relay under `lead` ({keyId, public}), by invitation. `lead` named
   is the lead's name as an invitation gave it. Merged by `deskFacts` into a desk.json's top level. */
export function relayDeskFacts(ud, team, lead, name) {
  const mirror = relayMirrorOf(ud, team);
  return {
    teamPins: { [team]: { keyId: lead.keyId, public: lead.public } },
    teamPinFrom: { [team]: "invite" },
    teamChannel: { [team]: relayChannelOf(team) },
    teamShown: { [team]: Object.assign({ folder: mirror, relay: RELAY_HOST }, name ? { lead: name } : {}) },
  };
}

/* A desk.json for `ud`: the person's own catalog folder `own` as the setting, the team's relay facts, and whatever `more` adds
   (its keys are merged one level deep: `keys`, `teamKeys` and the like). The mirror is made. Returns {mirror, rt}. */
export function writeRelayDesk(ud, { team, lead, own, name, more, keys }) {
  const mirror = relayMirrorOf(ud, team);
  fs.mkdirSync(mirror, { recursive: true });
  fs.mkdirSync(ud, { recursive: true });
  const doc = Object.assign({ kind: "etiuda-desk", schema: 1, keys: Object.assign({ eUiLang: "en" }, own ? { eCatalogFolder: own } : {}, keys || {}) },
    relayDeskFacts(ud, team, lead, name));
  for (const [k, v] of Object.entries(more || {})) {
    doc[k] = (v && typeof v === "object" && !Array.isArray(v) && doc[k] && typeof doc[k] === "object") ? Object.assign({}, doc[k], v) : v;
  }
  fs.writeFileSync(path.join(ud, "desk.json"), JSON.stringify(doc), "utf8");
  return { mirror: mirror, rt: relayTokenOf(team) };
}

/* A desk.json written for a desk on a team's shared folder, put on the team's relay mirror instead, before the shell reads it: where it
   pins a team (teamPins), its catalog folder setting (the folder the team shared) becomes the relay's stand-in, the store, and the
   desk's own catalog folder a folder of its own beside it, with the relay facts of an invitation added. A leg's own fixtures keep
   what they said (keys, catalog revisions, ...). Returns {team, store, mirror} for the desk to carry files by, or null where the
   desk pins no team and is left as it was. Called after the desk.json is written and before the shell loads over it. */
const STORES = new Map();
export function relayizeDesk(ud) {
  const file = path.join(ud, "desk.json");
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
  const teams = doc && doc.teamPins && typeof doc.teamPins === "object" ? Object.keys(doc.teamPins) : [];
  if (!teams.length || !doc.keys || typeof doc.keys.eCatalogFolder !== "string") return null;
  const team = teams[0], store = doc.keys.eCatalogFolder, mirror = relayMirrorOf(ud, team);
  fs.mkdirSync(mirror, { recursive: true });
  /* Already put there (the desk started again over the same folder, or written by writeRelayDesk): left as it is, its store as it was. */
  if (store === path.join(ud, "own") && doc.teamChannel && doc.teamChannel[team] && doc.teamChannel[team].kind === "relay") {
    return STORES.has(path.resolve(ud)) ? { team: team, store: STORES.get(path.resolve(ud)), mirror: mirror } : { team: team, store: null, mirror: mirror };
  }
  STORES.set(path.resolve(ud), store);
  const facts = relayDeskFacts(ud, team, doc.teamPins[team], doc.teamShown && doc.teamShown[team] && doc.teamShown[team].lead);
  doc.keys.eCatalogFolder = path.join(ud, "own");
  doc.teamPinFrom = Object.assign({}, doc.teamPinFrom, facts.teamPinFrom);
  doc.teamChannel = Object.assign({}, doc.teamChannel, facts.teamChannel);
  doc.teamShown = Object.assign({}, doc.teamShown, facts.teamShown);
  fs.writeFileSync(file, JSON.stringify(doc), "utf8");
  return { team: team, store: store, mirror: mirror };
}

/* Carry every desk that has a relay (`d.relay` from relayizeDesk) between its store and its mirror, twice as the folder syncer's
   legs did, so a file that lands on the first pass is judged on the second. */
export function carryDesks(desks, dir) {
  const want = dir ? path.resolve(dir) : null;
  for (const d of desks) {
    if (!d || !d.relay || !d.relay.store) continue;
    const st = path.resolve(d.relay.store);
    /* Only the desks whose store is, or holds, the folder a write was in (a leg with a hundred desks would carry them all at every write). */
    if (want && !(want === st || want.startsWith(st + path.sep) || st.startsWith(want + path.sep))) continue;
    if (!d.relayProgram) d.relayProgram = relayMirrorProgram({ store: d.relay.store, mirror: d.relay.mirror });
    d.relayProgram.syncOnce();
    d.relayProgram.syncOnce();
  }
}

/* The team file's channel field, as a leg's team file names the relay. */
export const teamChannelField = team => relayChannelOf(team);

const OWN_RE = /^desks\//;
/* `skip` names top-level entries of `dir` not to be walked: where a leg's store is its desk's own userData folder (a leg that names both
   alike), the relay mirror sits inside it and is not the store's file. */
function filesUnder(dir, skip) {
  const out = [];
  const walk = d => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (d === dir && skip && skip.has(e.name)) continue;
      if (e.isDirectory()) walk(p);
      else if (!e.name.startsWith(".") && !/\.tmp$/i.test(e.name)) out.push(path.relative(dir, p).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out;
}
const bytesOf = file => { try { return fs.readFileSync(file); } catch { return null; } };
const mtimeOf = file => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };
function copyOver(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, fs.readFileSync(from));
  const st = fs.statSync(from);
  try { fs.utimesSync(to, st.atime, st.mtime); } catch { /* the time is a hint only */ }
}

/* The stand-in for the relay between the store and one desk's mirror. `program({store, mirror})` keeps what was carried last
   time, so `syncOnce()` can tell a file taken from a side from one never there. */
export function relayMirrorProgram({ store, mirror }) {
  let last = { store: new Set(), mirror: new Set() };
  return {
    store: store, mirror: mirror,
    syncOnce() {
      fs.mkdirSync(mirror, { recursive: true });
      const inside = path.relative(path.resolve(store), path.resolve(mirror));
      const skip = new Set(["desk.json"]);
      if (inside && !inside.startsWith("..") && !path.isAbsolute(inside)) skip.add(inside.split(path.sep)[0]);
      const inStore = filesUnder(store, skip), inMirror = filesUnder(mirror);
      const storeSet = new Set(inStore), mirrorSet = new Set(inMirror);
      /* Taken since the last carry: a desk's own file gone from the mirror that the store still holds goes from it too, and any file the
         store held and no longer does (the lead taking one away) goes from the mirror. */
      for (const rel of inStore) {
        if (OWN_RE.test(rel) && last.mirror.has(rel) && !mirrorSet.has(rel)) { fs.rmSync(path.join(store, rel)); storeSet.delete(rel); }
      }
      for (const rel of inMirror) {
        if (last.store.has(rel) && !storeSet.has(rel)) { fs.rmSync(path.join(mirror, rel)); mirrorSet.delete(rel); }
      }
      for (const rel of storeSet) {
        const s = path.join(store, rel), m = path.join(mirror, rel);
        if (!mirrorSet.has(rel)) { copyOver(s, m); continue; }
        const a = bytesOf(s), b = bytesOf(m);
        if (a && b && a.equals(b)) continue;
        if (!OWN_RE.test(rel) || mtimeOf(s) >= mtimeOf(m)) copyOver(s, m);
        else copyOver(m, s);
      }
      for (const rel of mirrorSet) {
        if (!OWN_RE.test(rel) || storeSet.has(rel)) continue;
        copyOver(path.join(mirror, rel), path.join(store, rel));
      }
      last = { store: new Set(filesUnder(store, skip)), mirror: new Set(filesUnder(mirror)) };
    },
  };
}
