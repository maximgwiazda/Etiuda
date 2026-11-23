/* WHAT ONLY WORKS ON A TEAM STANDS GREYED ON A DESK WITH NONE, NEVER MISSING (Settings and the Library), in bare node.
 *
 *   node tests/team-off.mjs      exit code is the number of failed checks, capped at 63
 *
 * Three controls, each present, faded and inert on a desk with no team and live on a desk in one, with the same markup either way
 * (the box keeps its place, so joining only lifts the fade): Settings' Teams and keys section (its rail entry, its page's heading and
 * lede, and its block on the one page), the two team notification rows, and the Library row's Private switch. The words in each
 * control's title are the copywriter's. Each decision line carries a plant, and lifting it turns its own check red.
 *   tof1 no team: the two notification rows are team-off rows with their choices disabled and the reason in the title
 *   tof2 in a team: the same rows, no team-off, nothing disabled
 *   tof3 no team: the rail lists Teams and keys, faded, aria-disabled, out of the tab order, opening nothing
 *   tof4 no team: Teams and keys opened alone shows its heading and lede faded and no row; in a team, its rows and the entry open
 *   tof5 no team: the one page names the section with a faded heading that is no link
 *   tof6 no team: the Library's Private switch is present, disabled, unchecked and faded; in a team it is live
 *   tof7 the sheet carries the designer's rules, one fade for all three
 *   tof8 to tof10 lifting plant:team-off-notes, plant:team-off-section and plant:team-off-private turns tof1, tof3 and tof6 red
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODS = path.join(ROOT, "src", "modules");
const DIR = pathToFileURL(MODS).href + "/";
const EXPECTED = 12;
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";
let asserted = 0, failed = 0, skipped = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}
function skip(line) { skipped++; console.log("  skip " + line); }

const quiet = { contains: () => false, add() {}, remove() {}, toggle() {} };
function hostOn(host) {
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {}, E_HOST: host };
  globalThis.document = { querySelector: () => null, getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: {}, classList: quiet },
    body: { classList: quiet }, addEventListener() {}, removeEventListener() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
}
function hostOff() { delete globalThis.window; delete globalThis.document; delete globalThis.getComputedStyle; }
const MOD = n => pathToFileURL(path.join(MODS, n)).href;
const source = n => fs.readFileSync(path.join(MODS, n), "utf8");
/* A module's text with one line's anchor swapped, imported fresh, its own imports reaching the real modules. The anchor is asserted to
   match exactly once, so a plant that names nothing is an error and not a pass. */
function planted(text, from, to) {
  if (text.split(from).length !== 2) throw new Error("plant anchor not in the text once: " + from);
  return import("data:text/javascript;base64," + Buffer.from(text.replace(from, to).replace(/from "\.\//g, 'from "' + DIR)).toString("base64"));
}

/* Illustrations only: a team id and a lead's key are invented here, and no row names a person. */
const LEAD = { team: "t-0123456789abcdef", lead: "Ada", print: "0123456789abcdef" };
const rows = html => [...String(html).matchAll(/<div class="set-row[^"]*"[^>]*data-row="(noteedition|notecatalog)"[\s\S]*?<\/div><\/div>/g)].map(m => m[0]);
const REASON = 'title="Needs a team"';

/* The Settings module over a host with the team's answer given or not: its pages, as the section list draws them. */
async function settingsWith(leads, settingsText) {
  const hooksMod = await import(MOD("hooks.js"));
  const tj = await import(MOD("team-join.js"));
  const SET = settingsText ? await settingsText() : await import(MOD("settings.js"));
  let sendJoin = null;
  const wasRender = hooksMod.hooks.render;
  hooksMod.hooks.render = () => {};
  hostOn({ teamJoin: () => Promise.resolve(null), onTeamJoin: fn => { sendJoin = fn; } });
  try {
    tj.wireTeamJoin();
    sendJoin({ leads });
    return {
      notes: SET.settingsPageHtml("notifications", ""),
      nav: SET.settingsNavHtml("notifications"),
      teams: SET.settingsPageHtml("teams", ""),
      all: SET.settingsPageHtml("all", ""),
      ids: SET.settingsSections().map(s => s.id),
    };
  } finally { sendJoin({ leads: [] }); hooksMod.hooks.render = wasRender; hostOff(); }
}

try {
  (await import(MOD("storage.js"))).lsSet("eUiLang", "en");
  const none = await settingsWith([]);
  const inTeam = await settingsWith([LEAD]);

  const noneRows = rows(none.notes), teamRows = rows(inTeam.notes);
  const greyed = r => /class="set-row team-off"/.test(r) && r.indexOf(REASON) >= 0 && (r.match(/<button[^>]*disabled/g) || []).length === 2;
  check(noneRows.length === 2 && noneRows.every(greyed),
    "tof1 a desk with no team shows both team notification rows, faded, their On and Off disabled, the reason in the title: " + noneRows.length + " rows, " + noneRows.filter(greyed).length + " greyed");
  check(teamRows.length === 2 && teamRows.every(r => r.indexOf("team-off") < 0 && r.indexOf("disabled") < 0 && r.indexOf("Needs a team") < 0),
    "tof2 a desk in a team shows the same two rows live: no fade, nothing disabled, no reason: " + teamRows.length + " rows");

  const entryOf = nav => (/<button[^>]*data-sx="teams"[^>]*>|<button[^>]*class="sx-sec team-off"[^>]*>/.exec(nav) || [""])[0];
  const noneEntry = entryOf(none.nav), teamEntry = entryOf(inTeam.nav);
  check(/class="sx-sec team-off"/.test(noneEntry) && /aria-disabled="true"/.test(noneEntry) && /tabindex="-1"/.test(noneEntry) && noneEntry.indexOf("data-sx") < 0
      && noneEntry.indexOf(REASON) >= 0 && none.nav.indexOf("Teams and keys") >= 0
      && /data-sx="teams"/.test(teamEntry) && teamEntry.indexOf("team-off") < 0,
    "tof3 the rail lists Teams and keys on a desk with no team: faded, aria-disabled, out of the tab order, no data-sx to open it; in a team it opens: " + noneEntry + " | " + teamEntry);

  check(/<h2 class="team-off"[^>]*>Teams and keys<\/h2>/.test(none.teams) && /<p class="lede team-off"[^>]*>/.test(none.teams) && none.teams.indexOf("sx-card") < 0
      && none.teams.indexOf("set-row") < 0 && none.teams.indexOf("Ada") < 0
      && inTeam.teams.indexOf("team-off") < 0 && inTeam.teams.indexOf("Ada") >= 0,
    "tof4 Teams and keys opened alone: no team, its heading and lede faded and no row under them; in a team, its rows and no fade");

  check(/<section class="sx-block team-off" data-sec="teams"><h3[^>]*>Teams and keys<\/h3><\/section>/.test(none.all) && none.all.indexOf('data-open="teams"') < 0
      && inTeam.all.indexOf('data-open="teams"') >= 0,
    "tof5 the one page names Teams and keys on a desk with no team, a faded heading that opens nothing; in a team the heading opens it");

  const OFFER = await import(MOD("catalog-offer.js"));
  hostOn({});
  let offNo, offTeam;
  try {
    offNo = OFFER.rowShareParts("c-quay", "", null).teamHtml;
    offTeam = OFFER.rowShareParts("c-quay", "", { team: LEAD.team, private: [], teamCatalogPins: [] }).teamHtml;
  } finally { hostOff(); }
  check(/<label class="ec-priv team-off"/.test(offNo) && /<input[^>]*disabled/.test(offNo) && offNo.indexOf("checked") < 0 && offNo.indexOf(REASON) >= 0
      && offNo.indexOf('data-ec-private="c-quay"') >= 0
      && /<label class="ec-priv"/.test(offTeam) && offTeam.indexOf("disabled") < 0 && offTeam.indexOf("team-off") < 0,
    "tof6 the Library's Private switch on a desk with no team is present, disabled, unchecked and faded, the reason in its title; in a team it is live: " + offNo.slice(0, 160));
  check(offNo.replace(/ team-off/, "").replace(/ disabled/, "").replace(/ title="[^"]*"/, "") === offTeam.replace(/ title="[^"]*"/, ""),
    "tof6b the greyed switch and the live one are the same box: the markup differs only by the fade, the disabled mark and the title");

  const sheet = fs.readFileSync(path.join(ROOT, "src", "template.html"), "utf8");
  const rules = [":root{--off:.45}", ".sx-sec.team-off{opacity:var(--off)", ".set-row.team-off>*{opacity:var(--off)}", ".set-row.team-off .set-ctl{pointer-events:none}",
    ".set-row.team-off .seg::before{background:var(--dim)}", ".ec-priv.team-off{opacity:var(--off)}",
    "color-mix(in srgb,var(--ink) 45%,var(--bg))", "color-mix(in srgb,var(--dim) 45%,var(--bg))"];
  const missing = rules.filter(r => sheet.indexOf(r) < 0);
  check(!missing.length, "tof7 the sheet carries the designer's team-off rules, one fade (.45) for the section, the rows and the switch: missing " + JSON.stringify(missing));
  check(!/\.team-off[^{]*\{[^}]*(width|height|padding|margin|display)\s*:/.test(sheet), "tof7b no team-off rule changes a box's size, so joining only lifts the fade");

  if (PLANTS_OFF) {
    skip("tof8 lifting plant:team-off-notes turns tof1 red");
    skip("tof9 lifting plant:team-off-section turns tof3 red");
    skip("tof10 lifting plant:team-off-private turns tof6 red");
  } else {
    const noteText = source("settings.js");
    const noteAnchor = "const noTeam=!deskInTeam(); /* plant:team-off-notes */";
    const liftedNotes = await settingsWith([], () => planted(noteText, noteAnchor, "const noTeam=false;"));
    check(!rows(liftedNotes.notes).every(greyed), "tof8 lifting plant:team-off-notes turns tof1 red: " + rows(liftedNotes.notes).filter(greyed).length + " greyed");
    const secAnchor = "off:!teamsG.some(g=>g.rows.length) /* plant:team-off-section */";
    const liftedSec = await settingsWith([], () => planted(noteText, secAnchor, "off:false"));
    check(liftedSec.ids.indexOf("teams") < 0 && entryOf(liftedSec.nav).indexOf("team-off") < 0, "tof9 lifting plant:team-off-section turns tof3 red: sections " + liftedSec.ids.join(","));
    const offerText = source("catalog-offer.js");
    const privAnchor = "if(!content || !content.team) return {lockHtml:\"\", teamHtml:greyedPrivateHtml(id)}; /* plant:team-off-private */";
    hostOn({});
    let lifted = "";
    try { lifted = (await planted(offerText, privAnchor, "if(!content || !content.team) return {lockHtml:\"\", teamHtml:\"\"};")).rowShareParts("c-quay", "", null).teamHtml; } finally { hostOff(); }
    check(lifted === "", "tof10 lifting plant:team-off-private turns tof6 red: the no-team row is \"" + lifted.slice(0, 40) + "\"");
  }
} catch (e) {
  failed++;
  console.log("  FAIL the run stopped: " + (e && e.stack || e));
}

const complete = asserted + skipped >= EXPECTED;
if (!complete) console.log("  FAIL only " + (asserted + skipped) + " of " + EXPECTED + " legs ran");
console.log("#counts legs=" + asserted + " expected=" + EXPECTED);
console.log((failed || !complete ? "FAIL" : "ok") + " team off: " + (asserted - failed) + " of " + asserted + " legs green");
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
