/* SETTINGS' TWO DENSEST PLACES, GROUPED: Keyboard shortcuts and Account, nothing removed, in bare node.
 *
 *   node tests/settings-grouped.mjs      exit code is the number of failed checks, capped at 63
 *
 * The shortcuts list stands under five task headings (and the hotkey row under its own), the fixed keys in their task's group and
 * their one explanation after the last group; Account holds who is signed in with the name inside the identity card, then the
 * state (team, seat, sync, when last checked) under one heading, and buying under another. Every control and fact that was there
 * is still there, once, and a search still finds the name. The headings' words are the copywriter's; each is a placeholder.
 *   dgr1 every shortcut lies in exactly one task group, and every id a group names exists
 *   dgr2 the list is drawn as the five groups in their order, each heading over its own rows, each of the 39 rows once
 *   dgr3 the 13 fixed keys stand in their groups with no second slot, and the fixed keys' line follows the last group
 *   dgr4 a search keeps only the groups it finds a row in, each with its heading, and none empty
 *   dgr5 Account signed in: the name is inside the identity card and is the field's only copy
 *   dgr6 Account signed in: the state rows stand in one group under their heading, in order, Last checked last
 *   dgr7 Account signed in: buying is a group of its own after the state, and holds the Buy row
 *   dgr8 nothing dropped: the rows Account drew before are the rows it draws now
 *   dgr9 signed out, the name stays a row of its own, as it was, and no state group is drawn
 *   dgr10 a search for the name still finds its row
 *   dgr11 the headings are Polish in Polish
 *   dgr12 to dgr14 lifting plant:keys-groups, plant:account-name-card and plant:account-status turns dgr2, dgr5 and dgr6 red
 */
process.removeAllListeners("warning");
process.on("warning", () => {});
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODS = path.join(ROOT, "src", "modules");
const DIR = pathToFileURL(MODS).href + "/";
const EXPECTED = 14;
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

/* Illustrations only: a lead's name and a team id are invented, and an account's name and address are of the sample's. */
const LEAD = { team: "t-0123456789abcdef", lead: "Ewa", print: "0123456789abcdef" };
const SIGNED = { offered: ["microsoft", "google"], signedIn: "microsoft", seat: "held", reached: true, at: 1_800_000_000_000,
  account: { name: "Ada Nowak", email: "ada@harbour-lamps.example" } };
const SIGNED_OUT = { offered: ["microsoft", "google"] };
const OFFER = { buyState: () => ({ offer: true }), storeState: () => ({ shown: true, line: "on", on: true, at: 1_800_000_000_000 }) };

async function accountWith(v, settingsText, query) {
  const hooksMod = await import(MOD("hooks.js"));
  const tj = await import(MOD("team-join.js"));
  const SET = settingsText ? await settingsText() : await import(MOD("settings.js"));
  let sendJoin = null;
  const wasRender = hooksMod.hooks.render;
  hooksMod.hooks.render = () => {};
  hostOn(Object.assign({ signinState: () => v, teamJoin: () => Promise.resolve(null), onTeamJoin: fn => { sendJoin = fn; } }, OFFER));
  try {
    tj.wireTeamJoin();
    sendJoin({ leads: v.signedIn ? [LEAD] : [] });
    return SET.settingsPageHtml("account", query || "");
  } finally { sendJoin({ leads: [] }); hooksMod.hooks.render = wasRender; hostOff(); }
}
const rowKeys = html => [...String(html).matchAll(/data-row="(\w+)"/g)].map(m => m[1]);
/* The groups of a settings page, each as its heading and the row keys under it ("" where it has none). */
const groupsOf = html => String(html).split('<div class="sx-group">').slice(1).map(g => ({
  head: (/^<h3>([^<]*)<\/h3>/.exec(g) || [0, ""])[1], rows: rowKeys(g.split('<div class="sx-group">')[0]), html: g }));

try {
  const ST = await import(MOD("storage.js"));
  ST.lsSet("eUiLang", "en");
  const SL = await import(MOD("shortcuts-list.js"));
  const SC = await import(MOD("shortcuts.js"));
  const groups = SL.SC_GROUPS || [];
  const ids = SC.SC_DEFS.map(d => d.id);

  const placed = [].concat(...groups.map(g => g.ids));
  check(groups.length === 5 && ids.every(id => placed.filter(p => p === id).length === 1) && placed.every(p => ids.indexOf(p) >= 0),
    "dgr1 every one of the " + ids.length + " shortcuts lies in exactly one of the " + groups.length + " groups, and no group names an id that does not exist");

  const listHtml = () => SL.shortcutsListHtml("");
  const heads = html => [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1]);
  const rowsOf = html => [...html.matchAll(/data-sc="(\w+)"/g)].map(m => m[1]);
  const HEADS = ["Every day", "Tabs and the customer", "Finding a card", "Editing the catalog", "Panels"];
  const html = listHtml();
  const byGroup = html.split('<div class="sc-group"').slice(1).map(g => ({ head: (/<h3>([^<]*)<\/h3>/.exec(g) || [0, ""])[1], rows: rowsOf(g.split("sc-sep")[0]) }));
  check(heads(html).join("|") === HEADS.join("|") && byGroup.length === 5 && byGroup.every((g, i) => g.rows.join(",") === groups[i].ids.join(","))
      && rowsOf(html).length === ids.length && new Set(rowsOf(html)).size === ids.length,
    "dgr2 the list is five groups headed " + HEADS.join(", ") + ", each over its own rows in order, " + rowsOf(html).length + " rows once each: " + heads(html).join("|"));

  const fixedIds = SC.SC_DEFS.filter(d => d.fixed).map(d => d.id);
  const sepAt = html.indexOf('class="sc-sep"'), lastGroupAt = html.lastIndexOf('<div class="sc-group"');
  const fixedRows = fixedIds.map(id => new RegExp('<div class="sc-row"[^>]*data-sc="' + id + '">[\\s\\S]*?</button></div></div>').exec(html.slice(0, sepAt < 0 ? html.length : sepAt)));
  check(sepAt > lastGroupAt && sepAt > 0 && fixedRows.every(m => m && m[0].indexOf("sc-alt") < 0 && (m[0].match(/<button/g) || []).length === 1),
    "dgr3 the " + fixedIds.length + " fixed keys stand in their groups with one greyed key and no second slot, and the fixed keys' line follows the last group: " + fixedRows.filter(Boolean).length + " found");

  const found = SL.shortcutsListHtml("copy");
  const foundGroups = found.split('<div class="sc-group"').slice(1);
  check(foundGroups.length >= 1 && foundGroups.length < 5 && foundGroups.every(g => /<h3>[^<]+<\/h3>/.test(g) && rowsOf(g).length > 0)
      && heads(found).length === foundGroups.length,
    "dgr4 a search for copy keeps " + foundGroups.length + " of 5 groups, each with its heading and at least one row");

  const inCard = await accountWith(SIGNED);
  const card = (groupsOf(inCard)[0] || { html: "" }).html;
  check(card.indexOf('id="setAgentName"') >= 0 && inCard.split('id="setAgentName"').length === 2 && card.indexOf('data-row="name"') >= 0,
    "dgr5 signed in, the name is inside the identity card and the field exists once: " + (card ? "card " + card.length + " chars" : "no card"));

  const pageGroups = groupsOf(inCard).filter(g => g.head);
  const state = pageGroups[0] || { head: "", rows: [] };
  const order = state.rows.join(",");
  check(state.head === "Team and seat" && /^team,seat,sync,checked$/.test(order),
    "dgr6 the state is one group headed Team and seat, its rows team, seat, sync, checked: \"" + state.head + "\" " + order);

  const buying = pageGroups[1] || { head: "", rows: [] };
  check(buying.head === "Buying" && buying.rows.join(",") === "buy" && pageGroups.length === 2,
    "dgr7 buying is a group of its own after the state, headed Buying and holding the Buy row: " + pageGroups.map(g => g.head + "[" + g.rows.join(",") + "]").join(" "));

  check(rowKeys(inCard).slice().sort().join(",") === "buy,checked,name,seat,sync,team",
    "dgr8 the rows Account draws are the six it drew before: " + rowKeys(inCard).slice().sort().join(","));

  const out = await accountWith(SIGNED_OUT);
  const outGroups = groupsOf(out);
  check(!outGroups.some(g => g.head) && out.indexOf('data-row="name"') >= 0 && out.indexOf('<div class="sgn-you">') < 0
      && !/data-row="(team|seat|sync|checked)"/.test(out),
    "dgr9 signed out, the name is a row of its own, no card holds it and no state group is drawn: " + outGroups.map(g => g.head + "[" + g.rows.join(",") + "]").join(" "));

  const named = await accountWith(SIGNED, null, "customers see");
  check(named.indexOf('data-row="name"') >= 0 && named.indexOf('id="setAgentName"') >= 0,
    "dgr10 a search for the name's words still finds its row");

  ST.lsSet("eUiLang", "pl");
  let pl, plKeys;
  try {
    pl = await accountWith(SIGNED);
    plKeys = SL.shortcutsListHtml("");
  } finally { ST.lsSet("eUiLang", "en"); }
  const plHeads = [...pl.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1]).concat(heads(plKeys));
  check(plHeads.length === 7 && plHeads.every(h => HEADS.indexOf(h) < 0 && h !== "Team and seat" && h !== "Buying"),
    "dgr11 the seven headings read Polish in Polish: " + plHeads.join(" | "));

  if (PLANTS_OFF) {
    skip("dgr12 lifting plant:keys-groups turns dgr2 red");
    skip("dgr13 lifting plant:account-name-card turns dgr5 red");
    skip("dgr14 lifting plant:account-status turns dgr6 red");
  } else {
    const listText = source("shortcuts-list.js");
    const gAnchor = "const groups=SC_GROUPS; /* plant:keys-groups */";
    const lifted = await planted(listText, gAnchor, "const groups=[{head:\"All\", ids:SC_DEFS.map(d=>d.id)}];");
    hostOn({});
    let liftedHtml = "";
    try { liftedHtml = lifted.shortcutsListHtml(""); } finally { hostOff(); }
    check(heads(liftedHtml).join("|") !== HEADS.join("|"), "dgr12 lifting plant:keys-groups turns dgr2 red: " + heads(liftedHtml).length + " headings");
    const setText = source("settings.js");
    const nAnchor = "const named=card && !stranded && v.signedIn && !signinChoosingNow(); /* plant:account-name-card */";
    const noName = await accountWith(SIGNED, () => planted(setText, nAnchor, "const named=false;"));
    const liftedCard = (groupsOf(noName)[0] || { html: "" }).html;
    check(liftedCard.indexOf('id="setAgentName"') < 0, "dgr13 lifting plant:account-name-card turns dgr5 red: the card holds the field " + (liftedCard.indexOf('id="setAgentName"') >= 0));
    const sAnchor = "const statusHead=t(\"Team and seat\"); /* plant:account-status */";
    const noHead = await accountWith(SIGNED, () => planted(setText, sAnchor, "const statusHead=\"\";"));
    check(!groupsOf(noHead).some(g => g.head === "Team and seat"), "dgr14 lifting plant:account-status turns dgr6 red: the headings are " + JSON.stringify(groupsOf(noHead).map(g => g.head)));
  }
} catch (e) {
  failed++;
  console.log("  FAIL the run stopped: " + (e && e.stack || e));
}

const complete = asserted + skipped >= EXPECTED;
if (!complete) console.log("  FAIL only " + (asserted + skipped) + " of " + EXPECTED + " legs ran");
console.log("#counts legs=" + asserted + " expected=" + EXPECTED);
console.log((failed || !complete ? "FAIL" : "ok") + " settings grouped: " + (asserted - failed) + " of " + asserted + " legs green");
process.exit(Math.min(63, failed + (complete ? 0 : 1)));
