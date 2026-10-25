/* The relay's Worker: each route under /relay/v1 goes to its team's Durable Object, named by the relay team id and
   made in the EU jurisdiction. What no route answers (a path or a method outside the table in relay/team.cjs) is missing here
   and wakes no object. Every POST body is read here, to its cap, before an object is asked, so a body that trickles or never
   ends holds a Worker request and no object; a create's body is also read for the id it names and for its grant: a create that
   carries no valid grant under the vendor's root is refused here, before any object is asked, so a stranger's create costs one
   Worker request and wakes nothing. The object judges it again. A create whose t is stale or far ahead of the Worker's clock,
   by the rule the object applies, is refused here the same way, so a replayed create wakes no object either. A renewal whose
   grant does not hold for the lead it names is refused here too. */
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
  /* A renewal's grant holds for the lead it names; the object then holds it to the team's own lead. */
  const renewable = (body, now) => {
    const grant = body && typeof body === "object" ? body.grant : undefined;
    return core.grantOk(grant, grant && typeof grant === "object" ? grant.lead : undefined, now, roots);
  };

  async function route(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.search !== "") return team.missing();
    const hit = team.routeOf(request.method, url.pathname);
    if (!hit) return team.missing(); /* plant:worker-route */
    let teams = env.TEAMS;
    teams = env.TEAMS.jurisdiction("eu"); /* plant:eu */
    if (hit.what === "teams") {
      const bytes = await team.readCapped(request, team.JSON_MAX);
      if (!bytes) return team.refusedFor("blob-size");
      const body = bodyOf(bytes), rt = rtOf(body);
      if (!rt) return team.refusedFor("bad-signature");
      const now = nowOf(env), judged = core.judgeCreate(rt, body, now, roots);
      if (!judged.ok) return team.refusedFor(judged.reason); /* plant:worker-grant */
      if (!core.isFresh(body.t, now)) return team.refusedFor("nonce-stale"); /* plant:worker-fresh */
      return teams.get(teams.idFromName(rt)).fetch(new Request(request.url, { method: "POST", headers: request.headers, body: bytes }));
    }
    let forward = request;
    if (request.method === "POST") { /* plant:worker-body */
      const bytes = await team.readCapped(request, team.JSON_MAX);
      if (!bytes) return team.refusedFor("blob-size");
      if (hit.what === "grant" && !renewable(bodyOf(bytes), nowOf(env))) return team.refusedFor("bad-grant"); /* plant:worker-renew */
      forward = new Request(request.url, { method: "POST", headers: request.headers, body: bytes });
    }
    return teams.get(teams.idFromName(hit.rt)).fetch(forward);
  }

  return {
    async fetch(request, env) {
      try { return await route(request, env); } catch { return team.fault(); }
    },
  };
}

export default routeWith([core.ROOT_PUB]);
