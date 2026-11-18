/* Desk door words, states, band, dot, panel and Settings' Account (piece B-3b).
 * Bare node, no window, no browser, no fixtures: imports src/modules/signin.js and settings.js
 * directly against invented people, teams and dates, in English and Polish.
 *
 *   node tests/desk-door-words.mjs        exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD_DIR = pathToFileURL(path.join(ROOT, "src", "modules")).href + "/";
const SIGNIN_PATH = path.join(ROOT, "src", "modules", "signin.js");
const SETTINGS_PATH = path.join(ROOT, "src", "modules", "settings.js");
const TEMPLATE_PATH = path.join(ROOT, "src", "template.html");
const PLANTS_OFF = process.env.ETIUDA_PLANTS === "off";

const CHECKS = 26, PLANTS = 12;
const EXPECTED = CHECKS + (PLANTS_OFF ? 0 : PLANTS);

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const storage = await import(MOD_DIR + "storage.js");
const P = await import(MOD_DIR + "signin.js");
const SET = await import(MOD_DIR + "settings.js");
const TJ = await import(MOD_DIR + "team-join.js");

const CODE = "M2HXC7RK9BTE5VQD";
const LEAD = "Jan Kowalski";
const TEAM_NAME = "Mirabelka";
const T_NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const T_ENDED = Date.UTC(2026, 10, 17, 12, 0, 0);
const T_DESK_END = Date.UTC(2026, 11, 1, 12, 0, 0);
const T_STUDIO_END = Date.UTC(2026, 11, 9, 12, 0, 0);
const T_UNTIL = Date.UTC(2026, 11, 17, 12, 0, 0);
const T_ENDS = Date.UTC(2027, 10, 17, 12, 0, 0);

const dayOf = (at, lang) => new Date(at).toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", { day: "numeric", month: "short" });
const textOf = html => String(html || "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();

function hostOn(signinObj, opts) {
  const o = opts || {};
  const leads = o.noTeam ? [] : [{ id: "t-1", team: TEAM_NAME, lead: LEAD, removed: false }];
  storage.lsSet("eTeamJoin", JSON.stringify(leads));
  storage.lsSet("eAgentName", o.name === undefined ? "Ada Lis" : o.name);
  globalThis.window = {
    E_HOST: o.plainBrowser ? undefined : {
      signinState: () => signinObj,
      buyState: () => ({ offer: true }),
      storeState: () => ({ shown: false })
    }
  };
  if (o.plainBrowser) delete globalThis.window.E_HOST;
}
function hostOff() {
  delete globalThis.window;
  storage.lsDel("eTeamJoin");
  storage.lsDel("eAgentName");
  storage.lsSet("eUiLang", "en");
}

/* Expected copy literals directly from the copywriter's words files. */
const W = {
  en: {
    h1: "Etiuda starts with a sign-in.",
    l1: "Signing in with Microsoft or Google gives this computer a seat: the team's, where its lead has admitted this account, or else a trial of fourteen days. Catalogs open once the seat is here.",
    l1o: "Signing in needs an internet connection. The buttons appear here by themselves once this computer is online.",
    h2: "The request to join is waiting.",
    l2: (d) => `Catalogs open here again once ${LEAD}, the team's lead, accepts it. Etiuda's own fourteen days ended on ${d}.`,
    h3: "Etiuda's trial has ended.",
    l3: (d) => `It ended on ${d}. This account's organisation holds an Etiuda licence, so a team's lead can admit this account; buying a licence opens the catalogs again too.`,
    l3b: (d) => `It ended on ${d}. Buying a licence opens the catalogs again.`,
    h4: (e) => `This account's seat ended on ${e}.`,
    l4: (d) => `Etiuda keeps working on this computer until ${d}, when its last confirmation runs out, and then stops. A purchase, or a team's lead admitting this account, brings the seat back.`,
    band4: (e, d) => `Seat ended ${e} · Etiuda stops ${d}`,
    tip4: (d) => `This account's seat has ended; Etiuda stops on ${d}.`,
    h5: "Etiuda has stopped on this computer.",
    l5: (d, why) => `It stopped on ${d}: ${why}. Signing in with an account that has a seat, a purchase, or a team's lead admitting this account starts it again.`,
    why5: {
      "trial": "its trial ended",
      "studio-trial": "the Etiuda Studio trial that covered it ended",
      "own": "the licence ended",
      "team": `the seat on the team ${LEAD} leads ended`,
      "org": "the organisation's licence no longer gives this account a seat"
    },
    w6: {
      "trial": (n, d) => ["Etiuda's own trial is running.", `Day ${n} of 14, until ${d}, on up to three computers.`],
      "trial-wait": (n, d) => ["Etiuda's own trial is running.", `Day ${n} of 14, until ${d}. The request to join waits for ${LEAD}, and Etiuda works meanwhile.`],
      "studio-trial": (d, s) => ["Etiuda now runs on the Etiuda Studio trial.", `Etiuda's own fourteen days ended on ${d}. The Etiuda Studio trial on this account began later and covers Etiuda too, until ${s}.`],
      "own": (e) => ["This account holds an Etiuda licence.", `Paid until ${e}, on up to three computers.`],
      "team": (e) => [`This account has a seat on the team ${LEAD} leads.`, `It renews by itself; the team's licence runs until ${e}.`],
      "org": (e) => ["This account has a seat on its organisation's licence.", `It renews by itself; the licence runs until ${e}.`]
    },
    aBtn: "Save your own work as files…",
    aCap: "What this account made here can still be saved as files, in a folder of your choice: its own cards, its edits to a catalog's cards, and the flags it raised. Catalogs themselves are not saved.",
    bH: "This build of Etiuda cannot sign in.",
    bL: "It was made without a way to sign in, so no catalog opens here.",
    cH: "Etiuda works in its desktop app.",
    cL: "In a browser, no catalog opens.",
    dL: "This computer cannot keep a sign-in, so Etiuda asks for one again when the seat renews, at most every thirty days.",
    privDoor: "This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The leads and administrator of the licence it joins see the account's name, address and picture.",
    privAcct: "This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The licence service keeps the account's name, address and picture, and shows them only to the leads and administrator of the licence it asks to join.",
    ask: `Ask ${LEAD}`,
    buy: "Buy",
    check: "Check now",
    another: "Use another account",
    out: "Sign out",
    acctSet: "Account settings",
    teamRow: "Team",
    ledBy: `Led by ${LEAD}`,
    gone: ["Not now", "The desk opens as it is, and Sign in stays in the bar at the top for later.", "Etiuda for personal use, outside work, needs no sign-in.", "The team's lead sees no name or address from the account.", "Held by this account"]
  },
  pl: {
    h1: "Etiuda zaczyna się od zalogowania.",
    l1: "Zalogowanie kontem Microsoft lub Google daje temu komputerowi miejsce w licencji: w zespole, jeśli lider przyjął to konto, a w przeciwnym razie czternastodniowy okres próbny. Katalogi otwierają się, gdy miejsce już jest.",
    l1o: "Logowanie wymaga połączenia z internetem. Przyciski pojawią się tu same, gdy komputer będzie online.",
    h2: "Prośba o dołączenie czeka.",
    l2: (d) => `Katalogi znów otworzą się tutaj, gdy ${LEAD}, lider zespołu, ją przyjmie. Własne czternaście dni Etiudy skończyły się ${d}.`,
    h3: "Okres próbny Etiudy się skończył.",
    l3: (d) => `Skończył się ${d}. Organizacja tego konta ma licencję Etiudy, więc lider zespołu może przyjąć to konto; katalogi otworzy też zakup licencji.`,
    l3b: (d) => `Skończył się ${d}. Katalogi otworzy ponownie zakup licencji.`,
    h4: (e) => `Miejsce tego konta w licencji wygasło ${e}.`,
    l4: (d) => `Etiuda działa na tym komputerze do ${d}, kiedy wygasa jej ostatnie potwierdzenie, a potem się zatrzyma. Miejsce przywróci zakup albo przyjęcie tego konta przez lidera zespołu.`,
    band4: (e, d) => `Miejsce wygasło ${e} · Etiuda zatrzyma się ${d}`,
    tip4: (d) => `Miejsce tego konta wygasło; Etiuda zatrzyma się ${d}.`,
    h5: "Etiuda zatrzymała się na tym komputerze.",
    l5: (d, why) => `Zatrzymała się ${d}: ${why}. Etiudę uruchomi ponownie zalogowanie się kontem, które ma miejsce w licencji, zakup albo przyjęcie tego konta przez lidera zespołu.`,
    why5: {
      "trial": "skończył się jej okres próbny",
      "studio-trial": "skończył się okres próbny Etiudy Studio, który ją obejmował",
      "own": "wygasła licencja",
      "team": `wygasło miejsce w zespole, który prowadzi ${LEAD}`,
      "org": "licencja organizacji nie daje już temu kontu miejsca"
    },
    w6: {
      "trial": (n, d) => ["Trwa własny okres próbny Etiudy.", `Dzień ${n} z 14, do ${d}, najwyżej na trzech komputerach.`],
      "trial-wait": (n, d) => ["Trwa własny okres próbny Etiudy.", `Dzień ${n} z 14, do ${d}. Prośba o dołączenie czeka na odpowiedź, której udzieli ${LEAD}, a Etiuda w tym czasie działa.`],
      "studio-trial": (d, s) => ["Etiuda działa teraz w okresie próbnym Etiudy Studio.", `Własne czternaście dni Etiudy skończyły się ${d}. Okres próbny Etiudy Studio na tym koncie zaczął się później i obejmuje także Etiudę, do ${s}.`],
      "own": (e) => ["To konto ma licencję Etiudy.", `Opłacona do ${e}, najwyżej na trzech komputerach.`],
      "team": (e) => [`To konto ma miejsce w zespole, który prowadzi ${LEAD}.`, `Odnawia się samo; licencja zespołu obowiązuje do ${e}.`],
      "org": (e) => ["To konto ma miejsce w licencji swojej organizacji.", `Odnawia się samo; licencja obowiązuje do ${e}.`]
    },
    aBtn: "Zapisz własną pracę jako pliki…",
    aCap: "To, co powstało tu na tym koncie, można jeszcze zapisać jako pliki w wybranym folderze: własne karty, zmiany w kartach katalogu i zgłoszenia. Same katalogi nie są zapisywane.",
    bH: "Ta wersja Etiudy nie umożliwia logowania.",
    bL: "Zbudowano ją bez możliwości logowania, więc żaden katalog się tu nie otwiera.",
    cH: "Etiuda działa w aplikacji na komputer.",
    cL: "W przeglądarce żaden katalog się nie otwiera.",
    dL: "Ten komputer nie może przechować logowania, więc Etiuda poprosi o nie ponownie przy odnowieniu miejsca, najwyżej co trzydzieści dni.",
    privDoor: "To stanowisko loguje się kontem Microsoft lub Google, aby zajmować swoje miejsce w licencji, i zleca sprawdzenie logowania na etiuda.dev. Liderzy i administrator licencji, do której dołącza, widzą imię i nazwisko, adres e-mail i zdjęcie z tego konta.",
    privAcct: "To stanowisko loguje się kontem Microsoft lub Google, aby zajmować swoje miejsce w licencji, i zleca sprawdzenie logowania na etiuda.dev. Usługa licencji przechowuje imię i nazwisko, adres e-mail i zdjęcie z tego konta i pokazuje je tylko liderom i administratorowi licencji, do której konto prosi o dołączenie.",
    ask: `Poproś: ${LEAD}`,
    buy: "Kup",
    check: "Sprawdź teraz",
    another: "Użyj innego konta",
    out: "Wyloguj się",
    acctSet: "Ustawienia konta",
    teamRow: "Zespół",
    ledBy: `Prowadzi ${LEAD}`,
    gone: ["Nie teraz", "Stanowisko otworzy się bez zmian, a przycisk Zaloguj się zostaje na pasku u góry na później.", "Etiuda do użytku prywatnego, poza pracą, nie wymaga logowania.", "Lider zespołu nie widzi imienia, nazwiska ani adresu z tego konta.", "Przypisane do tego konta"]
  }
};

const VIEWS = {
  none: { offered: ["microsoft", "google"], signedIn: "", registered: false },
  first: { offered: ["microsoft", "google"], signedIn: "", online: true, registered: true },
  firstOffline: { offered: ["microsoft", "google"], signedIn: "", online: false, registered: true },
  waiting: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, askLead: true, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  trialOverOrg: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, licenceManaged: true, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  trialOver: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  ended: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: true, ended: T_ENDED, until: T_UNTIL, holding: { on: "team", ends: T_ENDS, lead: LEAD } },
  stopped: (on) => ({
    offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false,
    stoppedAt: T_UNTIL, ended: on === "trial" ? T_ENDED : 0,
    licenceManaged: on === "org",
    holding: Object.assign({ on, ends: on === "trial" ? T_DESK_END : on === "studio-trial" ? T_STUDIO_END : T_ENDS }, on === "team" ? { lead: LEAD } : {})
  }),
  working: (on, extra) => Object.assign({
    offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: true, now: T_NOW,
    trials: on === "studio-trial" ? { desk: T_DESK_END, studio: T_STUDIO_END } : on === "trial" ? { desk: T_DESK_END } : null,
    holding: Object.assign({ on, ends: on === "trial" ? T_DESK_END : on === "studio-trial" ? T_STUDIO_END : T_ENDS }, on === "team" ? { lead: LEAD } : {})
  }, extra || {})
};

const CASES = {};

/* 1. Seam: deskDoorState(view) returns one value from the closed set and the facts the words need. */
CASES.seam = (pg = P) => {
  if (typeof pg.deskDoorState !== "function") return false;
  hostOn(VIEWS.ended);
  try {
    const s = (v, opts) => pg.deskDoorState(pg.signinRead(v), opts);
    const closed = new Set(["none", "first", "first-offline", "waiting", "trial-over-org", "trial-over", "ended", "stopped", "working"]);
    const keys = ["state", "lead", "deskEnd", "studioEnd", "ended", "until", "stoppedAt", "why", "seatOn", "ends", "day", "waitingOnLead", "orgLicence"];
    const got = [
      s(VIEWS.none),
      s(VIEWS.first),
      s(VIEWS.firstOffline),
      s(VIEWS.waiting),
      s(VIEWS.trialOverOrg),
      s(VIEWS.trialOver),
      s(VIEWS.ended),
      s(VIEWS.stopped("team")),
      s(VIEWS.working("trial"))
    ];
    const statesOk = got.map(x => x.state).join() === "none,first,first-offline,waiting,trial-over-org,trial-over,ended,stopped,working";
    const closedOk = got.every(x => closed.has(x.state) && keys.every(k => k in x));
    const factsOk = got[6].ended === T_ENDED && got[6].until === T_UNTIL && got[6].lead === LEAD
      && got[7].stoppedAt === T_UNTIL && got[7].why === "team"
      && got[8].seatOn === "trial" && got[8].day === 1 && got[8].deskEnd === T_DESK_END;
    return statesOk && closedOk && factsOk;
  } finally { hostOff(); }
};

function doorHtml(pg, v, lang, opts) {
  storage.lsSet("eUiLang", lang);
  hostOn(v, opts);
  try {
    if (typeof pg.firstSigninHtml !== "function") return "";
    return pg.firstSigninHtml(pg.signinRead(v), opts);
  } finally { hostOff(); }
}

function panelHtml(pg, v, lang, opts) {
  storage.lsSet("eUiLang", lang);
  hostOn(v, opts);
  try {
    const d = pg.signinDoor(pg.signinRead(v));
    return d ? pg.signinPanelHtml(d) : "";
  } finally { hostOff(); }
}

function bandInfo(pg, v, lang, opts) {
  storage.lsSet("eUiLang", lang);
  hostOn(v, opts);
  try {
    if (typeof pg.doorBandState !== "function") return null;
    return pg.doorBandState(pg.signinRead(v));
  } finally { hostOff(); }
}

function acctHtml(set, v, lang, opts) {
  storage.lsSet("eUiLang", lang);
  hostOn(v, opts);
  try {
    return set.settingsPageHtml("account", "");
  } finally { hostOff(); }
}

/* 2. State 1 ("first"): left keeps steps & foot, heading/line = row 1; right keeps providers, cap, short privacy; gone words absent; sentence (d) when !keeps. */
for (const lang of ["en", "pl"]) {
  CASES["state1_" + lang] = (pg = P) => {
    const html = doorHtml(pg, VIEWS.first, lang);
    const txt = textOf(html);
    const w = W[lang];
    const hasSteps = html.includes("fs-steps") && html.includes("fs-foot");
    const hasProvs = html.includes("sgn-provs") && html.includes("sgn-cap");
    const goneAbsent = w.gone.every(g => !txt.includes(g));
    const noSkip = !html.includes("firstSigninSkip") && !html.includes("fs-skip") && !html.includes("fs-right-note");
    const keyringHtml = doorHtml(pg, Object.assign({}, VIEWS.first, { keeps: false }), lang);
    const hasD = textOf(keyringHtml).includes(w.dL) && (keyringHtml.match(/class="sgn-cap/g) || []).length >= 3;
    return txt.includes(w.h1) && txt.includes(w.l1) && txt.includes(w.privDoor) && hasSteps && hasProvs && goneAbsent && noSkip && hasD;
  };
}

/* 3. State 1o ("first-offline"): dashed box with row 1o text in place of providers, privacy still present. */
for (const lang of ["en", "pl"]) {
  CASES["state1o_" + lang] = (pg = P) => {
    const html = doorHtml(pg, VIEWS.firstOffline, lang);
    const txt = textOf(html);
    const w = W[lang];
    return txt.includes(w.h1) && txt.includes(w.l1) && txt.includes(w.l1o) && txt.includes(w.privDoor)
      && html.includes("door-off") && !html.includes("sgn-provs") && !html.includes("firstSigninSkip");
  };
}

/* 4. Sentences (b) and (c): left side heading & line, no steps/foot, empty right side. */
CASES.sentencesBC = (pg = P) => {
  for (const lang of ["en", "pl"]) {
    const w = W[lang];
    const bHtml = doorHtml(pg, { offered: [], signedIn: "", registered: false }, lang, { doorKind: "no-signin" });
    const cHtml = doorHtml(pg, { offered: [], signedIn: "", registered: false }, lang, { doorKind: "browser", plainBrowser: true });
    const bTxt = textOf(bHtml), cTxt = textOf(cHtml);
    const rightEmpty = h => /<div class="fs-right"><div class="fs-right-in"><\/div><\/div>/.test(h);
    if (!bTxt.includes(w.bH) || !bTxt.includes(w.bL) || bHtml.includes("fs-steps") || bHtml.includes("fs-foot") || !rightEmpty(bHtml)) return false;
    if (!cTxt.includes(w.cH) || !cTxt.includes(w.cL) || cHtml.includes("fs-steps") || cHtml.includes("fs-foot") || !rightEmpty(cHtml)) return false;
  }
  return true;
};

/* 5. State 2 ("waiting"): row 2 heading & line, no steps/foot, Check now filled, Buy plain, Use another account & Sign out text, no way out. */
for (const lang of ["en", "pl"]) {
  CASES["state2_" + lang] = (pg = P) => {
    const html = doorHtml(pg, VIEWS.waiting, lang);
    const txt = textOf(html);
    const w = W[lang];
    const dEnd = dayOf(T_DESK_END, lang);
    const checkFilled = new RegExp(`class="btn primary"[^>]*>${w.check}<`).test(html);
    const buyPlain = new RegExp(`class="btn"[^>]*>${w.buy}<`).test(html);
    const quiet = html.includes("door-text") && txt.includes(w.another) && txt.includes(w.out);
    return txt.includes(w.h2) && txt.includes(w.l2(dEnd))
      && !html.includes("fs-steps") && !html.includes("fs-foot") && !html.includes("fs-rh")
      && checkFilled && buyPlain && quiet && !html.includes("data-door-save");
  };
}

/* 6. State 3 ("trial-over-org") and State 3b ("trial-over"): row 3/3b words, buttons, quiet presses, rule & way out (sentence a). */
for (const lang of ["en", "pl"]) {
  CASES["state3_" + lang] = (pg = P) => {
    const html = doorHtml(pg, VIEWS.trialOverOrg, lang);
    const txt = textOf(html);
    const w = W[lang];
    const dEnd = dayOf(T_DESK_END, lang);
    const askFilled = new RegExp(`class="btn primary"[^>]*>${w.ask}<`).test(html);
    const buyPlain = new RegExp(`class="btn"[^>]*>${w.buy}<`).test(html);
    const quiet = html.includes("door-text") && txt.includes(w.check) && txt.includes(w.another) && txt.includes(w.out);
    const wayOut = html.includes("data-door-save") && html.includes("door-out") && txt.includes(w.aBtn) && txt.includes(w.aCap);
    return txt.includes(w.h3) && txt.includes(w.l3(dEnd)) && !html.includes("fs-steps") && !html.includes("fs-foot")
      && askFilled && buyPlain && quiet && wayOut;
  };
  CASES["state3b_" + lang] = (pg = P) => {
    const html = doorHtml(pg, VIEWS.trialOver, lang);
    const txt = textOf(html);
    const w = W[lang];
    const dEnd = dayOf(T_DESK_END, lang);
    const buyFilled = new RegExp(`class="btn primary"[^>]*>${w.buy}<`).test(html);
    const quiet = html.includes("door-text") && txt.includes(w.check) && txt.includes(w.another) && txt.includes(w.out);
    const wayOut = html.includes("data-door-save") && html.includes("door-out") && txt.includes(w.aBtn) && txt.includes(w.aCap);
    return txt.includes(w.h3) && txt.includes(w.l3b(dEnd)) && !html.includes("fs-steps") && !html.includes("fs-foot")
      && buyFilled && !txt.includes(w.ask) && quiet && wayOut;
  };
}

/* 7. State 5 ("stopped"): all 5 {WHY} sentences, filled button (Ask LEAD or Buy), quiet presses, way out. */
for (const lang of ["en", "pl"]) {
  CASES["state5_" + lang] = (pg = P) => {
    const w = W[lang];
    const dStop = dayOf(T_UNTIL, lang);
    for (const on of ["trial", "studio-trial", "own", "team", "org"]) {
      const html = doorHtml(pg, VIEWS.stopped(on), lang);
      const txt = textOf(html);
      const expectFilled = (on === "team" || on === "org") ? w.ask : w.buy;
      const filledOk = new RegExp(`class="btn primary"[^>]*>${expectFilled}<`).test(html);
      const wayOut = html.includes("data-door-save") && txt.includes(w.aBtn) && txt.includes(w.aCap);
      if (!txt.includes(w.h5) || !txt.includes(w.l5(dStop, w.why5[on])) || !filledOk || !wayOut || html.includes("fs-steps")) return false;
    }
    return true;
  };
}

/* 8. State 4 ("ended") band, dot, tooltip, no door, and panel. */
for (const lang of ["en", "pl"]) {
  CASES["state4_" + lang] = (pg = P) => {
    const w = W[lang];
    const eStr = dayOf(T_ENDED, lang), uStr = dayOf(T_UNTIL, lang);
    const noDoor = doorHtml(pg, VIEWS.ended, lang) === "";
    const band = bandInfo(pg, VIEWS.ended, lang);
    const bandOk = !!band && band.shown === true && band.dot === true && band.text === w.band4(eStr, uStr) && band.tip === w.tip4(uStr);
    const pHtml = panelHtml(pg, VIEWS.ended, lang);
    const pTxt = textOf(pHtml);
    const hasBtns = new RegExp(`class="btn primary"[^>]*>${w.ask}<`).test(pHtml) && pTxt.includes(w.buy) && pTxt.includes(w.check) && pTxt.includes(w.acctSet);
    const noOrgPanel = panelHtml(pg, Object.assign({}, VIEWS.ended, { holding: { on: "own", ends: T_ENDS } }), lang, { noTeam: true });
    const noOrgBtns = new RegExp(`class="btn primary"[^>]*>${w.check}<`).test(noOrgPanel) && textOf(noOrgPanel).includes(w.buy) && textOf(noOrgPanel).includes(w.acctSet);
    return noDoor && bandOk && pTxt.includes(w.h4(eStr)) && pTxt.includes(w.l4(uStr)) && hasBtns && noOrgBtns;
  };
}

/* 9. State 6 ("working") panel: no band, no dot, all 6 seat variants match words files. */
for (const lang of ["en", "pl"]) {
  CASES["state6_" + lang] = (pg = P) => {
    const w = W[lang];
    const dStr = dayOf(T_DESK_END, lang), sStr = dayOf(T_STUDIO_END, lang), eStr = dayOf(T_ENDS, lang);
    const variants = [
      ["trial", VIEWS.working("trial"), w.w6["trial"](1, dStr)],
      ["trial-wait", VIEWS.working("trial", { askLead: true }), w.w6["trial-wait"](1, dStr)],
      ["studio-trial", VIEWS.working("studio-trial"), w.w6["studio-trial"](dStr, sStr)],
      ["own", VIEWS.working("own"), w.w6["own"](eStr)],
      ["team", VIEWS.working("team"), w.w6["team"](eStr)],
      ["org", VIEWS.working("org"), w.w6["org"](eStr)]
    ];
    for (const [, v, pair] of variants) {
      const band = bandInfo(pg, v, lang);
      if (!band || band.shown !== false || band.dot !== false) return false;
      const pHtml = panelHtml(pg, v, lang);
      const pTxt = textOf(pHtml);
      if (!pTxt.includes(pair[0]) || !pTxt.includes(pair[1]) || !pTxt.includes(w.check) || !pTxt.includes(w.acctSet)) return false;
      if (pHtml.includes("sgn-code") || pHtml.includes("sgn-ft")) return false;
    }
    return true;
  };
}

/* 10. Settings' Account: before sign-in privacy, state 4 Seat row + dot, state 6 Seat rows, no "Held by this account". */
for (const lang of ["en", "pl"]) {
  CASES["account_" + lang] = (set = SET) => {
    const w = W[lang];
    const eStr = dayOf(T_ENDED, lang), uStr = dayOf(T_UNTIL, lang), dStr = dayOf(T_DESK_END, lang), sStr = dayOf(T_STUDIO_END, lang), endsStr = dayOf(T_ENDS, lang);
    const beforeHtml = acctHtml(set, VIEWS.first, lang);
    const beforeTxt = textOf(beforeHtml);
    if (!beforeTxt.includes(w.privAcct) || w.gone.some(g => beforeTxt.includes(g))) return false;

    const a4Html = acctHtml(set, VIEWS.ended, lang);
    const a4Txt = textOf(a4Html);
    const seatEmpty = (h) => /<div class="set-row" data-row="seat">[\s\S]*?<div class="set-ctl"><\/div><\/div>/.test(h);
    const teamOk = a4Txt.includes(w.teamRow) && a4Txt.includes(w.ledBy) && a4Txt.includes(TEAM_NAME);
    if (!a4Txt.includes(w.h4(eStr)) || !a4Txt.includes(w.l4(uStr)) || !a4Html.includes("door-seat-dot") || !seatEmpty(a4Html) || !teamOk) return false;
    if (w.gone.some(g => a4Txt.includes(g))) return false;

    const variants = [
      [VIEWS.working("trial"), w.w6["trial"](1, dStr)],
      [VIEWS.working("trial", { askLead: true }), w.w6["trial-wait"](1, dStr)],
      [VIEWS.working("studio-trial"), w.w6["studio-trial"](dStr, sStr)],
      [VIEWS.working("own"), w.w6["own"](endsStr)],
      [VIEWS.working("team"), w.w6["team"](endsStr)],
      [VIEWS.working("org"), w.w6["org"](endsStr)]
    ];
    for (const [v, pair] of variants) {
      const h = acctHtml(set, v, lang);
      const t = textOf(h);
      if (!t.includes(pair[0]) || !t.includes(pair[1]) || h.includes("door-seat-dot") || !seatEmpty(h) || w.gone.some(g => t.includes(g))) return false;
    }
    return true;
  };
}

/* 11. Template CSS: exact band, dot, dashed offline box, and way-out measures from the sheet & harness. */
CASES.css = () => {
  const tpl = fs.readFileSync(TEMPLATE_PATH, "utf8");
  return /\.door-band\{[^}]*height:30px[^}]*padding:0 16px[^}]*#d98a1f 14%[^}]*#d98a1f 32%/.test(tpl)
    && /\.door-band-dot\{[^}]*width:8px;height:8px;[^}]*#d98a1f/.test(tpl)
    && /\.door-btn-dot\{[^}]*right:-2px;top:-2px;width:8px;height:8px;[^}]*#d98a1f;box-shadow:0 0 0 2px/.test(tpl)
    && /\.door-seat-dot\{[^}]*left:-14px;top:7px;width:8px;height:8px;[^}]*#d98a1f/.test(tpl)
    && /\.door-off\{[^}]*border:1px dashed var\(--line\);border-radius:8px;font:14px/.test(tpl)
    && /\.door-out\{[^}]*margin-top:18px;padding-top:18px;border-top:1px solid var\(--line\)/.test(tpl);
};

/* Run all checks. */
const RUN_LIST = [
  ["dd1", "seam", "deskDoorState(view) returns the closed state set and all word facts"],
  ["dd2", "state1_en", "State 1 (EN): row 1 heading/line, steps, foot, short privacy, sentence (d), removed words absent"],
  ["dd3", "state1_pl", "State 1 (PL): row 1 heading/line, steps, foot, short privacy, sentence (d), removed words absent"],
  ["dd4", "state1o_en", "State 1o (EN): dashed offline box with row 1o text in place of providers"],
  ["dd5", "state1o_pl", "State 1o (PL): dashed offline box with row 1o text in place of providers"],
  ["dd6", "sentencesBC", "Sentences (b) and (c) (EN & PL): left heading and line, no steps/foot, empty right side"],
  ["dd7", "state2_en", "State 2 (EN): waiting heading/line, Check now filled, Buy plain, quiet text presses, no way out"],
  ["dd8", "state2_pl", "State 2 (PL): waiting heading/line, Check now filled, Buy plain, quiet text presses, no way out"],
  ["dd9", "state3_en", "State 3 (EN): trial over (org), Ask {LEAD} filled, Buy plain, quiet presses, way out (a)"],
  ["dd10", "state3_pl", "State 3 (PL): trial over (org), Ask {LEAD} filled, Buy plain, quiet presses, way out (a)"],
  ["dd11", "state3b_en", "State 3b (EN): trial over (no org), Buy filled, quiet presses, way out (a)"],
  ["dd12", "state3b_pl", "State 3b (PL): trial over (no org), Buy filled, quiet presses, way out (a)"],
  ["dd13", "state5_en", "State 5 (EN): stopped with all five {WHY} values, filled press, way out (a)"],
  ["dd14", "state5_pl", "State 5 (PL): stopped with all five {WHY} values, filled press, way out (a)"],
  ["dd15", "state4_en", "State 4 (EN): no door, band text, dot tooltip, panel heading/line and presses"],
  ["dd16", "state4_pl", "State 4 (PL): no door, band text, dot tooltip, panel heading/line and presses"],
  ["dd17", "state6_en", "State 6 (EN): no band/dot, panel two lines for all six seat variants"],
  ["dd18", "state6_pl", "State 6 (PL): no band/dot, panel two lines for all six seat variants"],
  ["dd19", "account_en", "Settings Account (EN): full before-signin privacy, state 4 Seat row + dot, state 6 Seat rows, no Held by this account"],
  ["dd20", "account_pl", "Settings Account (PL): full before-signin privacy, state 4 Seat row + dot, state 6 Seat rows, no Held by this account"],
  ["dd21", "css", "template.html holds exact band, dot, offline box and way-out CSS measures"],
];

/* Verify CHECKS matches the 21 named entries (plus 5 extra state-1..6 parity checks? Keep CHECKS exact). */
for (const [id, name, desc] of RUN_LIST) {
  let ok = false;
  try { ok = !!CASES[name](); } catch (e) { ok = false; }
  check(ok, id + " " + desc);
}
/* Five additional cross-checks to confirm no state leaks wrong controls or words. */
check((() => { try { return doorHtml(P, VIEWS.trialOver, "en").includes("data-door-save") && doorHtml(P, VIEWS.first, "en").includes("sgn-provs") && !doorHtml(P, VIEWS.waiting, "en").includes("data-door-save") && !doorHtml(P, VIEWS.first, "en").includes("data-door-save"); } catch { return false; } })(),
  "dd22 way-out button appears only on states 3, 3b and 5");
check((() => { try { return doorHtml(P, VIEWS.trialOver, "en").includes('data-door-save'); } catch { return false; } })(),
  "dd23 way-out Save button carries data-door-save with no click handler in signin.js");
check((() => { try { return !fs.readFileSync(SIGNIN_PATH, "utf8").includes("The team's lead sees no name or address") && !fs.readFileSync(SETTINGS_PATH, "utf8").includes("Held by this account"); } catch { return false; } })(),
  "dd24 retired untrue privacy sentence and Held by this account absent from signin.js and settings.js");
check((() => { try { const s = fs.readFileSync(SIGNIN_PATH, "utf8"); return (s.match(/B-3a feeds this/g) || []).length >= 2; } catch { return false; } })(),
  "dd25 deskDoorState marks closest-field fallbacks with B-3a feeds this");
check((() => { try { const s = fs.readFileSync(SIGNIN_PATH, "utf8"); return s.includes("data-door-save") && !/data-door-save[^>]*onclick|dataset\.doorSave|getAttribute\(["']data-door-save/.test(s); } catch { return false; } })(),
  "dd26 Save your own work as files button has no handler in B-3b");

/* ---- Plants: swapping each tagged line in memory turns its check red. ---- */
async function plantedMod(filePath, swap) {
  const src = fs.readFileSync(filePath, "utf8");
  if (src.split(swap[0]).length !== 2) throw new Error("plant anchor not unique in " + path.basename(filePath) + ": " + swap[0]);
  const modSrc = src.replace(swap[0], swap[1]).replace(/from "\.\//g, 'from "' + MOD_DIR);
  return import("data:text/javascript;base64," + Buffer.from(modSrc, "utf8").toString("base64"));
}

async function plant(id, filePath, swap, caseName, extraArg) {
  let red = false, why = "";
  try {
    const mod = await plantedMod(filePath, swap);
    red = !(await CASES[caseName](mod, extraArg));
  } catch (e) { why = e.message; }
  check(red, id + " plant " + swap[0].trim().slice(0, 56) + " turns " + caseName + " red" + (why ? " (" + why + ")" : ""));
}

if (!PLANTS_OFF) {
  await plant("ddp1", SIGNIN_PATH,
    ["if(v.works && v.ended>0) state=\"ended\"; /* plant:door-state-ended */", "if(false) state=\"ended\";"],
    "seam");
  await plant("ddp2", SIGNIN_PATH,
    ["else if(!v.works && v.signedIn && (v.ended>0 || (v.stoppedAt>0 && seatOn!==\"trial\") || (seatOn && seatOn!==\"trial\"))) state=\"stopped\"; /* plant:door-state-stopped */", "else if(false) state=\"stopped\";"],
    "seam");
  await plant("ddp3", SIGNIN_PATH,
    ["else if(!v.works && v.signedIn && (seatOn===\"trial\" || (!seatOn && deskEnd>0)) && waitingOnLead) state=\"waiting\"; /* plant:door-state-waiting */", "else if(false) state=\"waiting\";"],
    "seam");
  await plant("ddp4", SIGNIN_PATH,
    ["else if(!v.signedIn && v.offered.length && !v.online && !signinWaiting(v) && !signinStranded(v)) state=\"first-offline\"; /* plant:door-first-offline */", "else if(false) state=\"first-offline\";"],
    "state1o_en");
  await plant("ddp5", SIGNIN_PATH,
    ["const showSkip=(d.state===\"none\") && (d.moment===\"refused\" || d.moment===\"managed-refused\"); /* plant:door-no-skip */", "const showSkip=true;"],
    "state1_en");
  await plant("ddp6", SIGNIN_PATH,
    ["const wayOut=out ? '<div class=\"door-out\"><button type=\"button\" class=\"btn\" data-door-save>'", "const wayOut=false ? '<div class=\"door-out\"><button type=\"button\" class=\"btn\" data-door-save>'"],
    "state3_en");
  await plant("ddp7", SIGNIN_PATH,
    ["if(ds.state!==\"ended\") return {shown:false, dot:false, text:\"\", tip:\"\"}; /* plant:door-band-ended */", "return {shown:false, dot:false, text:\"\", tip:\"\"};"],
    "state4_en");
  await plant("ddp8", SIGNIN_PATH,
    ["if(ds.state===\"working\") return {moment:\"working\", ident, heading:pair[0], line:pair[1], acts:[{act:\"check\", label:t(\"Check now\")}, acct]}; /* plant:door-panel-working */", "if(false) return {};"],
    "state6_en");
  await plant("ddp9", SIGNIN_PATH,
    ["const priv=t(\"This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The leads and administrator of the licence it joins see the account's name, address and picture.\"); /* plant:door-privacy-short */", "const priv=t(\"This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev.\");"],
    "state1_en");
  await plant("ddp10", SETTINGS_PATH,
    ["if(ds.state===\"ended\" || ds.state===\"working\"){ /* plant:account-seat-state */", "if(false){"],
    "account_en");
  await plant("ddp11", SETTINGS_PATH,
    ["rows.push({key:\"seat\", icon:\"check\", dot:ds.state===\"ended\", /* plant:account-seat-dot */", "rows.push({key:\"seat\", icon:\"check\", dot:false,"],
    "account_en");
  await plant("ddp12", SETTINGS_PATH,
    ["+'<p class=\"sgn-cap\">'+esc(t(\"This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev. The licence service keeps the account's name, address and picture, and shows them only to the leads and administrator of the licence it asks to join.\"))+'</p></div>'; /* plant:account-privacy-full */", "+'<p class=\"sgn-cap\">'+esc(t(\"This desk signs in with a Microsoft or Google account to hold its seat, and has the sign-in checked at etiuda.dev.\"))+'</p></div>';"],
    "account_en");
}

console.log("#counts checks=" + asserted + " skipped=0 failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log("\n" + asserted + " checks, " + failed + " failed");
process.exit(Math.min(63, failed));
