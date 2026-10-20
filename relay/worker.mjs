/* The relay's Worker: each route under /relay/v1 goes to its team's Durable Object, named by the relay team id and
   made in the EU jurisdiction. Only a create's body is read here, for the id it names and for its grant: a create that
   carries no valid grant under the vendor's root is refused here, before any object is asked, so a stranger's create costs one
   Worker request and wakes nothing. The object judges it again. */
import team from "./team.cjs";
import core from "./core.cjs";

export const RelayTeam = team.RelayTeam;

const TEAM_PATH = /^\/relay\/v1\/t\/([0-9a-f]{32})\//;

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

  async function route(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.search !== "") return team.missing();
    let teams = env.TEAMS;
    teams = env.TEAMS.jurisdiction("eu"); /* plant:eu */
    if (url.pathname === "/relay/v1/teams") {
      if (request.method !== "POST") return team.missing();
      const bytes = await team.readCapped(request, team.JSON_MAX);
      if (!bytes) return team.refusedFor("blob-size");
      const body = bodyOf(bytes), rt = rtOf(body);
      if (!rt) return team.refusedFor("bad-signature");
      const judged = core.judgeCreate(rt, body, nowOf(env), roots);
      if (!judged.ok) return team.refusedFor(judged.reason); /* plant:worker-grant */
      return teams.get(teams.idFromName(rt)).fetch(new Request(request.url, { method: "POST", headers: request.headers, body: bytes }));
    }
    const m = TEAM_PATH.exec(url.pathname);
    if (!m) return team.missing();
    return teams.get(teams.idFromName(m[1])).fetch(request);
  }

  return {
    async fetch(request, env) {
      try { return await route(request, env); } catch { return team.fault(); }
    },
  };
}

export default routeWith([core.ROOT_PUB]);
