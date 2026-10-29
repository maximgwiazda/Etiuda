/* The relay's Worker: each route under its prefix goes to its team's Durable Object, named by the relay team id and
   made in the EU jurisdiction. What no route answers (a path or a method outside the table in relay/team.cjs) is missing here
   and wakes no object. Every POST body is read here, to its cap, before an object is asked, so a body that trickles or never
   ends holds a Worker request and no object; a create's body is also read for the id it names and for its grant: a create that
   carries no valid grant under the vendor's root is refused here, before any object is asked, so a stranger's create costs one
   Worker request and wakes nothing. The object judges it again. A create whose t is stale or far ahead of the Worker's clock,
   by the rule the object applies, is refused here the same way, so a replayed create wakes no object either. A renewal whose
   grant does not hold for the lead it names is refused here too, and so is a grant a revoked service key signed. A create
   that passes is reserved on that lead's object before the team's object is woken, and a team the object then refuses
   gives the place back. */
import team from "./team.cjs";
import core from "./core.cjs";

export const RelayTeam = team.RelayTeam;

function bodyOf(bytes) {
  try { return JSON.parse(bytes.toString("utf8")); } catch { return null; }
}

function rtOf(body) {
  const rt = body && typeof body === "object" ? body.rt : undefined;
  return typeof rt === "string" && /^[0-9a-f]{32}$/.test(rt) ? rt : null;
}

/* The Worker over a set of roots and a clock. Only a leg passes either: the default export below is this over the constant
   root and the Worker's own clock. `clockOf` takes the env and answers the time in ms. */
export function routeWith(roots, clockOf) {
  const nowOf = typeof clockOf === "function" ? clockOf : () => Date.now();
  /* The one request the list object answers. The host is reserved, the path is outside every public prefix, and the mark
     is set here. A string is the body; none is an unset list. */
  function internalRevokedRequest(text) {
    const headers = new Headers();
    headers.set(team.REVOKED_MARK, "1");
    const init = { method: "POST", headers };
    if (typeof text === "string") { init.body = text; init.duplex = "half"; }
    return new Request("https://relay.invalid" + team.REVOKED_PATH, init);
  }
  /* The object's answer, or a throw. A throw faults the request: a broken object must not be read as an empty list. */
  async function decisionOf(res) {
    const raw = await res.arrayBuffer();
    let body = null;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { body = null; }
    if (res.status !== 200 || !body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.keys)
      || body.keys.some(k => typeof k !== "string")) throw new Error("revoked");
    return {
      keys: body.keys,
      serial: Number.isSafeInteger(body.serial) ? body.serial : null,
      ignored: typeof body.ignored === "string" ? body.ignored : null,
    };
  }
  /* The last accepted list is kept. A later text replaces it only when it verifies, its serial is higher and it names every
     kept key. A chief's own root-signed create or renewal is told when a text was ignored. The Worker's own logs are off.
     The in-process stand-in keeps the list on the namespace. The runtime's namespace has no such method, and its stub
     allows fetch alone, so the list object is asked through fetch. */
  async function revokedDecision(teams, env) {
    const text = env ? env.REVOKED : undefined;
    if (teams && typeof teams.acceptRevocations === "function") return teams.acceptRevocations(text);
    if (teams && typeof teams.get === "function" && typeof teams.idFromName === "function") {
      const stub = teams.get(teams.idFromName("revoked"));
      const res = await stub.fetch(internalRevokedRequest(text)); /* plant:revoked-fetch */
      return decisionOf(res);
    }
    return { keys: core.revokedKeysOf(text, roots), serial: null, ignored: null };
  }
  /* One answer per env and REVOKED text, kept for this isolate's life: the list object is asked again only when the text changes,
     and a throw is never kept. An env the runtime hands anew only asks again. The list object's own answer is sticky (a text that
     names fewer keys is ignored), so every route below carries the kept list, which a team object woken cold could not read from
     the text alone. */
  const revokedHeld = new WeakMap();
  async function revokedFor(teams, env) {
    const text = env ? env.REVOKED : undefined;
    const held = env && typeof env === "object" ? revokedHeld.get(env) : undefined;
    if (held && held.text === text) return held.decided; /* plant:revoked-held */
    const decided = await revokedDecision(teams, env);
    if (env && typeof env === "object") revokedHeld.set(env, { text, decided });
    return decided;
  }
  /* The keys this request enforces, over any header the client sent, including an empty list. The list mark is dropped,
     so a client cannot carry it onto a team's request. */
  function carry(request, keys, body) {
    const headers = new Headers(request.headers);
    headers.delete(team.REVOKED_MARK);
    headers.delete(team.LEAD_MARK);
    headers.delete(team.HELD_MARK);
    headers.set("etiuda-kept", JSON.stringify(Array.isArray(keys) ? keys : [])); /* plant:kept-every-route */
    const init = { method: request.method, headers };
    if (body !== undefined) { init.body = body; init.duplex = "half"; }
    return new Request(request.url, init);
  }
  /* A root-signed create or renewal, and only when a text was ignored. A refusal stays its error and its said sentence. */
  async function noted(res, decided, grant) {
    const why = decided && typeof decided.ignored === "string" ? decided.ignored : null;
    const root = !!(grant && typeof grant === "object" && !Array.isArray(grant) && grant.via === undefined);
    if (!why || !root) return res;
    const raw = await res.arrayBuffer();
    let body = null;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { body = null; }
    if (res.status !== 200 || !body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(raw, { status: res.status, headers: new Headers(res.headers) });
    }
    const out = Object.assign({}, body, { listIgnored: why });
    if (Number.isSafeInteger(decided.serial)) out.keptSerial = decided.serial;
    return new Response(JSON.stringify(out), { status: 200, headers: new Headers(res.headers) });
  }

  async function route(request, env) {
    const prefix = team.apiPrefixOf(env);
    if (prefix === null) return team.unavailable(); /* plant:prefix */
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.search !== "") return team.missing();
    /* A client request for the list object's path is missing before any object is named. */
    if (url.pathname === team.REVOKED_PATH) return team.missing(); /* plant:revoked-door */
    const hit = team.routeOf(request.method, url.pathname, prefix);
    if (!hit) return team.missing(); /* plant:worker-route */
    let teams = env.TEAMS;
    teams = env.TEAMS.jurisdiction("eu"); /* plant:eu */
    const decided = await revokedFor(teams, env);
    const keys = decided && Array.isArray(decided.keys) ? decided.keys : [];
    if (hit.what === "teams") {
      const bytes = await team.readCapped(request, team.JSON_MAX);
      if (!bytes) return team.refusedFor("blob-size");
      const body = bodyOf(bytes), rt = rtOf(body);
      if (!rt) return team.refusedFor("bad-signature");
      const now = nowOf(env), judged = core.judgeCreate(rt, body, now, roots, keys);
      if (!judged.ok) return team.refusedFor(judged.reason); /* plant:worker-grant */
      if (!core.isFresh(body.t, now)) return team.refusedFor("nonce-stale"); /* plant:worker-fresh */
      const leadId = body.lead.keyId;
      const reserved = await teams.get(teams.idFromName("lead:" + leadId)).fetch(team.leadRequest({ op: "reserve", rt, lead: leadId }));
      if (reserved.status !== 200) return reserved;
      const res = await teams.get(teams.idFromName(rt)).fetch(carry(request, keys, bytes));
      if (res.status !== 200) await teams.get(teams.idFromName("lead:" + leadId)).fetch(team.leadRequest({ op: "release", rt })); /* plant:lead-free */
      return noted(res, decided, body.grant);
    }
    if (hit.what === "lead") {
      const bytes = await team.readCapped(request, team.JSON_MAX);
      if (!bytes) return team.refusedFor("blob-size");
      const body = bodyOf(bytes), rt = hit.rt;
      const now = nowOf(env), judged = core.judgeLead(rt, body, now, roots, keys);
      if (!judged.ok) return team.refusedFor(judged.reason); /* plant:worker-lead-grant */
      if (!core.isFresh(body.t, now)) return team.refusedFor("nonce-stale"); /* plant:worker-lead-fresh */
      const newLeadId = body.to.keyId;
      let reserved = { status: 200 };
      reserved = await teams.get(teams.idFromName("lead:" + newLeadId)).fetch(team.leadRequest({ op: "reserve", rt, lead: newLeadId })); /* plant:worker-lead-bound */
      if (reserved.status !== 200) return reserved;
      const res = await teams.get(teams.idFromName(rt)).fetch(carry(request, keys, bytes));
      if (res.status !== 200) {
        await teams.get(teams.idFromName("lead:" + newLeadId)).fetch(team.leadRequest({ op: "release", rt })); /* plant:lead-free-on-fail */
        return res;
      }
      const oldLeadId = res.headers.get("etiuda-old-lead");
      if (oldLeadId) {
        try { await teams.get(teams.idFromName("lead:" + oldLeadId)).fetch(team.leadRequest({ op: "release", rt })); } catch { /* K3 */ } /* plant:old-lead-released */
      }
      return noted(res, decided, body.grant);
    }
    let grant = null, forward = null;
    if (request.method === "POST") { /* plant:worker-body */
      const bytes = await team.readCapped(request, team.JSON_MAX);
      if (!bytes) return team.refusedFor("blob-size");
      if (hit.what === "grant") {
        const grantBody = bodyOf(bytes);
        grant = grantBody && typeof grantBody === "object" ? grantBody.grant : undefined;
        const why = core.grantWhy(grant, grant && typeof grant === "object" ? grant.lead : undefined, nowOf(env), roots, keys);
        if (why === "revoked") return team.refusedFor("revoked"); /* plant:worker-revoked */
        if (why) return team.refusedFor("bad-grant"); /* plant:worker-renew */
      }
      forward = carry(request, keys, bytes);
    } else forward = carry(request, keys, request.body === null || request.body === undefined ? undefined : request.body);
    const res = await teams.get(teams.idFromName(hit.rt)).fetch(forward);
    return hit.what === "grant" ? noted(res, decided, grant) : res;
  }

  return {
    async fetch(request, env) {
      try { return await route(request, env); } catch { return team.fault(); }
    },
  };
}

export default routeWith([core.ROOT_PUB]);
