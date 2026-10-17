/* The relay's Worker: each route under /relay/v1 goes to its team's Durable Object, named by the relay team id and
   made in the EU jurisdiction. Only a create's body is read here, for the id it names. */
import team from "./team.cjs";

export const RelayTeam = team.RelayTeam;

const TEAM_PATH = /^\/relay\/v1\/t\/([0-9a-f]{32})\//;

function rtOf(bytes) {
  try {
    const rt = JSON.parse(bytes.toString("utf8")).rt;
    return typeof rt === "string" && /^[0-9a-f]{32}$/.test(rt) ? rt : null;
  } catch { return null; }
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.search !== "") return team.missing();
  let teams = env.TEAMS;
  teams = env.TEAMS.jurisdiction("eu"); /* plant:eu */
  if (url.pathname === "/relay/v1/teams") {
    if (request.method !== "POST") return team.missing();
    const bytes = await team.readCapped(request, team.JSON_MAX);
    if (!bytes) return team.refusedFor("blob-size");
    const rt = rtOf(bytes);
    if (!rt) return team.refusedFor("bad-signature");
    return teams.get(teams.idFromName(rt)).fetch(new Request(request.url, { method: "POST", headers: request.headers, body: bytes }));
  }
  const m = TEAM_PATH.exec(url.pathname);
  if (!m) return team.missing();
  return teams.get(teams.idFromName(m[1])).fetch(request);
}

export default {
  async fetch(request, env) {
    try { return await route(request, env); } catch { return team.fault(); }
  },
};
