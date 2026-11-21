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

const CHECKS = 42, PLANTS = 41;
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
const { hooks } = await import(MOD_DIR + "hooks.js");

const CODE = "M2HXC7RK9BTE5VQD";
const LEAD = "Jan Kowalski";
const TEAM_NAME = "Mirabelka";
const T_NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const T_ENDED = Date.UTC(2026, 10, 17, 12, 0, 0);
const T_DESK_END = Date.UTC(2026, 11, 1, 12, 0, 0);
const T_STUDIO_END = Date.UTC(2026, 11, 9, 12, 0, 0);
const T_UNTIL = Date.UTC(2026, 11, 17, 12, 0, 0);
const T_ENDS = Date.UTC(2027, 10, 17, 12, 0, 0);

const dayOf = (at, lang) => {
  const d = new Date(at);
  const opt = { day: "numeric", month: "long" };
  if (d.getFullYear() !== new Date(T_NOW).getFullYear()) opt.year = "numeric";
  return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", opt);
};
const textOf = html => String(html || "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();

const footOf = html => { const m = String(html || "").match(/<p class="sgn-ft">([\s\S]*?)<\/p>/); return m ? textOf(m[1]) : null; };

function hostOn(signinObj, opts) {
  const o = opts || {};
  const leads = o.noTeam ? [] : [{ team: TEAM_NAME, lead: LEAD, removed: false }];
  storage.lsSet("eAgent", o.name === undefined ? "Ada Lis" : o.name);
  globalThis.window = {
    E_HOST: o.plainBrowser ? undefined : {
      signinState: () => signinObj,
      buyState: () => ({ offer: true }),
      storeState: () => ({ shown: false })
    }
  };
  if (o.plainBrowser) delete globalThis.window.E_HOST;
  if (typeof hooks.render !== "function") hooks.render = () => {};
  TJ.joinTook({ leads: leads });
}
function hostOff() {
  try { TJ.joinTook({ leads: [] }); } catch (e) { /* the team is already clear */ }
  delete globalThis.window;
  storage.lsDel("eAgent");
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
      "trial": (n, d) => [`Trial · until ${d}`, `Etiuda's own trial, day ${n} of 14, until ${d}, on up to three computers.`, true],
      "trial-wait": (n, d) => [`Trial · until ${d}`, `Day ${n} of 14, until ${d}. The request to join waits for ${LEAD}, and Etiuda works meanwhile.`, true],
      "studio-trial": (d, s) => [`Etiuda Studio's trial · until ${s}`, `Etiuda's own fourteen days ended on ${d}. The Etiuda Studio trial on this account began later and covers Etiuda too, until ${s}.`, true],
      "own": (e) => [`Own licence · paid until ${e}`, `This account's own licence, paid until ${e}, on up to three computers.`, true],
      "team": (e) => [`Team's licence · until ${e}`, `A seat on the team ${TEAM_NAME}; it renews by itself, and the team's licence runs until ${e}.`, true],
      "org": (e) => ["This account has a seat on its organisation's licence.", `It renews by itself; the licence runs until ${e}.`, false]
    },
    seat: "Seat",
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
      "trial": (n, d) => [`Okres próbny · do ${d}`, `Własny okres próbny Etiudy, dzień ${n} z 14, do ${d}, najwyżej na trzech komputerach.`, true],
      "trial-wait": (n, d) => [`Okres próbny · do ${d}`, `Dzień ${n} z 14, do ${d}. Prośba o dołączenie czeka na odpowiedź, której udzieli ${LEAD}, a Etiuda w tym czasie działa.`, true],
      "studio-trial": (d, s) => [`Okres próbny Etiudy Studio · do ${s}`, `Własne czternaście dni Etiudy skończyły się ${d}. Okres próbny Etiudy Studio na tym koncie zaczął się później i obejmuje także Etiudę, do ${s}.`, true],
      "own": (e) => [`Własna licencja · opłacona do ${e}`, `Własna licencja tego konta, opłacona do ${e}, najwyżej na trzech komputerach.`, true],
      "team": (e) => [`Licencja zespołu · do ${e}`, `Miejsce w zespole: ${TEAM_NAME}; odnawia się samo, a licencja zespołu obowiązuje do ${e}.`, true],
      "org": (e) => ["To konto ma miejsce w licencji swojej organizacji.", `Odnawia się samo; licencja obowiązuje do ${e}.`, false]
    },
    seat: "Miejsce w licencji",
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
  waiting: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, askLead: true, now: T_NOW, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  trialOverOrg: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, licenceManaged: true, now: T_NOW, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  trialOver: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, now: T_NOW, holding: { on: "trial", ends: T_DESK_END }, trials: { desk: T_DESK_END } },
  ended: { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: true, now: T_NOW, ended: T_ENDED, until: T_UNTIL, holding: { on: "team", ends: T_ENDS, lead: LEAD } },
  stopped: (on) => ({
    offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, now: T_NOW,
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

/* 1b. Seam shape and gate body (B-3a1): exact same keys and types across all states. Waiting and both trial-over
   states come before stopped where their fields hold, on a view whose stoppedAt the shell has set. Stopped is
   !works with stoppedAt > 0 where those fields do not. Trials-ended with null holding maps to trial-over,
   trial-over-org or waiting. Busy and refusal map to none. */
CASES.seamShape = (pg = P) => {
  if (typeof pg.deskDoorState !== "function" || typeof pg.deskWorks !== "function") return false;
  const expectedTypes = {
    day: "number", deskEnd: "number", ended: "number", ends: "number", lead: "string", now: "number",
    online: "boolean", orgLicence: "boolean", seatOn: "string", state: "string", stoppedAt: "number",
    studioEnd: "number", until: "number", waitingOnLead: "boolean", why: "string"
  };
  const expectedKeys = Object.keys(expectedTypes).sort().join();
  hostOn(VIEWS.ended);
  try {
    const s = v => pg.deskDoorState(pg.signinRead(v));
    const all = [VIEWS.none, VIEWS.first, VIEWS.firstOffline, VIEWS.waiting, VIEWS.trialOverOrg, VIEWS.trialOver,
      VIEWS.ended, VIEWS.stopped("team"), VIEWS.working("trial")].map(s);
    const shapesOk = all.every(x => Object.keys(x).sort().join() === expectedKeys
      && Object.keys(expectedTypes).every(k => typeof x[k] === expectedTypes[k]));
    const stoppedPlain = s({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: false, stoppedAt: T_UNTIL }).state === "stopped";
    const noCompoundTeam = s({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: false, stoppedAt: 0, holding: { on: "team", ends: T_ENDS } }).state === "stopped";
    const noCompoundEnded = s({ offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: false, stoppedAt: 0, ended: T_ENDED }).state === "stopped";
    /* The shell sets stoppedAt on every seated desk that does not work (shell/main.js signinViewOf). */
    const trialsOnly = { offered: ["microsoft"], signedIn: "microsoft", code: CODE, works: false, stoppedAt: T_UNTIL, now: T_NOW, trials: { desk: T_DESK_END } };
    const trialSeat = { holding: { on: "trial", ends: T_DESK_END } };
    const trialsEndedOk = s(trialsOnly).state === "trial-over"
      && s(Object.assign({}, trialsOnly, { licenceManaged: true })).state === "trial-over-org"
      && s(Object.assign({}, trialsOnly, { askLead: true })).state === "waiting"
      && s(Object.assign({}, trialsOnly, trialSeat, { askLead: true })).state === "waiting"
      && s(Object.assign({}, trialsOnly, trialSeat)).state === "stopped";
    const busyRefusedOk = s(Object.assign({}, VIEWS.first, { busy: "microsoft" })).state === "none"
      && s(Object.assign({}, VIEWS.first, { said: "unreached" })).state === "none";
    return shapesOk && stoppedPlain && noCompoundTeam && noCompoundEnded && trialsEndedOk && busyRefusedOk;
  } finally {
    hostOff();
  }
};

/* 1c. Argon 51 B2: deskDoorState must not answer "none" while the gate is due (waiting, full, no licence, and signin.json
   marked by another key while a team seat is held). Side-step: paintFirstSignin never draws the retired "Sign in to Etiuda"
   fallback for any signed-in non-working view, and other held seat kinds marked by another key map to stopped too. */
CASES.doorNotNoneWhenDue = (pg = P) => {
  const s = v => pg.deskDoorState(pg.signinRead(v));
  const waiting = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, refused: "waiting" };
  const full = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, refused: "full" };
  const noLic = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, refused: "" };
  const noLicSaid = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, refused: "nolicence" };
  const askNoTrial = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, askLead: true };
  const otherKeyTeam = { offered: ["microsoft", "google"], signedIn: "microsoft", code: "", works: false, stoppedAt: 0, holding: { on: "team", ends: T_ENDS, lead: LEAD } };
  const otherKeyOwn = { offered: ["microsoft", "google"], signedIn: "microsoft", code: "", works: false, stoppedAt: 0, holding: { on: "own", ends: T_ENDS } };

  hostOn(waiting);
  const hadDoc = "document" in globalThis, prevDoc = globalThis.document;
  try {
    const dueStatesOk = [waiting, full, noLic, noLicSaid, askNoTrial, otherKeyTeam, otherKeyOwn].every(v => {
      const rv = pg.signinRead(v), ds = s(rv), html = pg.firstSigninHtml(rv);
      return pg.firstSigninDue(rv) === true && ds.state !== "none" && html.length > 0 && !html.includes("Sign in to Etiuda");
    });
    const waitKindOk = s(waiting).state === "waiting" && s(full).state === "waiting" && s(askNoTrial).state === "waiting";
    const stopKindOk = s(noLic).state === "stopped" && s(noLicSaid).state === "stopped"
      && s(otherKeyTeam).state === "stopped" && s(otherKeyOwn).state === "stopped"
      && pg.firstSigninHtml(pg.signinRead(otherKeyTeam)).includes("data-door-save")
      && pg.firstSigninHtml(pg.signinRead(otherKeyTeam)).includes(LEAD);

    /* Side-step: paintFirstSignin on DOM stand-in draws doorLaterHtml (not the retired fallback) for waiting, full, noLic, C2.5a. */
    const classes = new Set();
    const fsEl = { hidden: true, innerHTML: "", setAttribute() {}, contains: () => false, querySelector: () => null };
    globalThis.document = {
      body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } },
      activeElement: null,
      querySelector: sel => (sel === "#firstSignin" ? fsEl : null)
    };
    let paintedOk = true;
    for (const v of [waiting, full, noLic, otherKeyTeam]) {
      hostOn(v);
      pg.signinNow();
      pg.bootFirstSignin();
      if (!pg.firstSigninOpenNow() || fsEl.innerHTML.includes("Sign in to Etiuda") || !fsEl.innerHTML.length) paintedOk = false;
    }
    return dueStatesOk && waitKindOk && stopKindOk && paintedOk;
  } finally {
    if (!hadDoc) delete globalThis.document; else globalThis.document = prevDoc;
    hostOff();
  }
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
  /* settingsPageHtml builds every section. Appearance reads document.body, and the column floor reads getComputedStyle. A node leg has neither. */
  const hadDoc = "document" in globalThis, prevDoc = globalThis.document;
  const hadStyle = "getComputedStyle" in globalThis, prevStyle = globalThis.getComputedStyle;
  if (!hadDoc) globalThis.document = { body: { classList: { contains: () => false } }, documentElement: {} };
  if (!hadStyle) globalThis.getComputedStyle = () => ({ fontSize: "16px", getPropertyValue: () => "" });
  try {
    return set.settingsPageHtml("account", "");
  } finally {
    if (!hadDoc) delete globalThis.document; else globalThis.document = prevDoc;
    if (!hadStyle) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = prevStyle;
    hostOff();
  }
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

/* 5b. The door names whom an open join request waits on, as the service's answer gave it (the view's `asked`): one lead as the
   team's lead is told, several in one line with the plural heading, none as before; both languages. */
CASES.askedDoor = (pg = P) => {
  const noTeam = { noTeam: true };
  const asks = names => Object.assign({}, VIEWS.waiting, { asked: names });
  const one = ["Anna Nowak"], two = ["Anna Nowak", "Piotr Zieliński"];
  for (const lang of ["en", "pl"]) {
    const w = W[lang], dEnd = dayOf(T_DESK_END, lang);
    const lineOne = lang === "en" ? `Catalogs open here again once ${one[0]}, the team's lead, accepts it. Etiuda's own fourteen days ended on ${dEnd}.`
      : `Katalogi znów otworzą się tutaj, gdy ${one[0]}, lider zespołu, ją przyjmie. Własne czternaście dni Etiudy skończyły się ${dEnd}.`;
    const lineTwo = lang === "en" ? `Catalogs open here again once one of these leads accepts a request: ${two.join(", ")}. Etiuda's own fourteen days ended on ${dEnd}.`
      : `Katalogi znów otworzą się tutaj, gdy któryś z tych liderów przyjmie prośbę: ${two.join(", ")}. Własne czternaście dni Etiudy skończyły się ${dEnd}.`;
    const headTwo = lang === "en" ? "The requests to join are waiting." : "Prośby o dołączenie czekają.";
    const bare = lang === "en" ? `Catalogs open here again once the team's lead accepts it. Etiuda's own fourteen days ended on ${dEnd}.`
      : `Katalogi znów otworzą się tutaj, gdy lider zespołu ją przyjmie. Własne czternaście dni Etiudy skończyły się ${dEnd}.`;
    const tOne = textOf(doorHtml(pg, asks(one), lang, noTeam)), tTwo = textOf(doorHtml(pg, asks(two), lang, noTeam));
    const tNone = textOf(doorHtml(pg, VIEWS.waiting, lang, noTeam)), tNoneList = textOf(doorHtml(pg, asks([]), lang, noTeam));
    if (!(tOne.includes(w.h2) && tOne.includes(lineOne))) return false;
    if (!(tTwo.includes(headTwo) && tTwo.includes(lineTwo) && !tTwo.includes(w.h2))) return false;
    if (!(tNone.includes(w.h2) && tNone.includes(bare) && tNoneList.includes(bare))) return false;
  }
  return true;
};

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
      if (!pTxt.includes(pair[1]) || !pTxt.includes(w.check) || !pTxt.includes(w.acctSet)) return false;
      if (pHtml.includes("sgn-code")) return false;
      /* A family seat is told by its short form in the foot and its line, with no heading; the organisation's keeps its heading and has no foot. */
      if (pair[2]) {
        if (footOf(pHtml) !== pair[0] || pHtml.includes("<h4>")) return false;
      } else if (!pTxt.includes(pair[0]) || pHtml.includes("sgn-ft")) return false;
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
      if (!t.includes(pair[1]) || h.includes("door-seat-dot") || w.gone.some(g => t.includes(g))) return false;
      if (pair[2]) {
        /* The Seat row: its label, the short form as the value, the line under the label. */
        const m = h.match(/<div class="set-row" data-row="seat">[\s\S]*?<div class="set-ctl">([\s\S]*?)<\/div><\/div>/);
        if (!m || !m[1].includes('<span class="sgn-val">') || textOf(m[1]) !== pair[0] || !textOf(h).includes(w.seat + " " + pair[1])) return false;
      } else if (!t.includes(pair[0]) || !seatEmpty(h)) return false;
    }
    return true;
  };
}

function cssText(src) {
  return typeof src === "string" ? src : fs.readFileSync(TEMPLATE_PATH, "utf8");
}

/* 11. Template CSS: exact band, dot, dashed offline box, and way-out measures from the sheet & harness. */
CASES.css = (src) => {
  const tpl = cssText(src);
  return /\.door-band\{[^}]*height:30px[^}]*padding:0 16px[^}]*#d98a1f 14%[^}]*#d98a1f 32%/.test(tpl)
    && /\.door-band-dot\{[^}]*width:8px;height:8px;[^}]*#d98a1f/.test(tpl)
    && /\.door-btn-dot\{[^}]*right:-2px;top:-2px;width:8px;height:8px;[^}]*#d98a1f;box-shadow:0 0 0 2px/.test(tpl)
    && /\.door-seat-dot\{[^}]*left:-14px;top:7px;width:8px;height:8px;[^}]*#d98a1f/.test(tpl)
    && /\.door-off\{[^}]*border:1px dashed var\(--line\);border-radius:8px;font:14px/.test(tpl)
    && /\.door-out\{[^}]*margin-top:22px;padding-top:18px;border-top:1px solid var\(--line\)/.test(tpl);
};

/* The offline box leads with the sheet's 18px crossed-signal glyph at 70% opacity. */
CASES.offlineGlyph = (pg = P) => {
  const html = doorHtml(pg, VIEWS.firstOffline, "en");
  const online = doorHtml(pg, VIEWS.first, "en");
  const tpl = cssText();
  return html.includes('class="door-off-glyph"') && html.includes('width="18"') && html.includes('height="18"')
    && html.includes('viewBox="0 0 24 24"') && html.includes('stroke-width="1.8"') && html.includes('d="M3 3l18 18"')
    && tpl.includes(".door-off-glyph{flex:none;margin-top:1px;opacity:.7}")
    && tpl.includes(".door-off{display:flex;gap:10px;align-items:flex-start;")
    && online.indexOf("door-off-glyph") < 0;
};

/* State 4's panel: the way on and Buy on one row, Check now and Account settings on the next. */
CASES.panelRows = (pg = P) => {
  const split = (html) => {
    const on = String(html || "").match(/<div class="door-on-row">([\s\S]*?)<\/div>/);
    const rest = String(html || "").match(/<div class="sgn-acts">([\s\S]*?)<\/div>/);
    return { on: on && on[1], rest: rest && rest[1] };
  };
  const ask = split(panelHtml(pg, VIEWS.ended, "en"));
  const own = split(panelHtml(pg, Object.assign({}, VIEWS.ended, { holding: { on: "own", ends: T_ENDS } }), "en", { noTeam: true }));
  const work = panelHtml(pg, VIEWS.working("own"), "en");
  if (!ask.on || !ask.rest || !own.on || !own.rest) return false;
  const askOk = ask.on.includes('class="btn primary"') && ask.on.includes("Ask " + LEAD) && ask.on.includes(">Buy<")
    && ask.on.indexOf("Check now") < 0 && ask.on.indexOf("Account settings") < 0
    && ask.rest.includes(">Check now<") && ask.rest.includes(">Account settings<")
    && ask.rest.indexOf("btn primary") < 0 && ask.rest.indexOf(">Buy<") < 0;
  const ownOk = own.on.includes('class="btn primary"') && own.on.includes(">Check now<") && own.on.includes(">Buy<")
    && own.on.indexOf("Account settings") < 0
    && own.rest.includes(">Account settings<") && own.rest.indexOf("Check now") < 0 && own.rest.indexOf(">Buy<") < 0;
  return askOk && ownOk && work.indexOf("door-on-row") < 0 && work.includes('class="sgn-acts"')
    && cssText().includes(".door-on-row{display:flex;gap:8px;flex-wrap:nowrap;");
};

/* No lead's name: the five forms the words file already holds. A named lead keeps the named sentence. */
CASES.noName = (pg = P) => {
  const opt = { noTeam: true };
  const en2 = textOf(doorHtml(pg, VIEWS.waiting, "en", opt));
  const pl2 = textOf(doorHtml(pg, VIEWS.waiting, "pl", opt));
  const en3 = doorHtml(pg, VIEWS.trialOverOrg, "en", opt);
  const pl3 = doorHtml(pg, VIEWS.trialOverOrg, "pl", opt);
  const stoppedTeam = Object.assign({}, VIEWS.stopped("team"), { holding: { on: "team", ends: T_ENDS } });
  const en5 = textOf(doorHtml(pg, stoppedTeam, "en", opt));
  const pl5 = textOf(doorHtml(pg, stoppedTeam, "pl", opt));
  const en6 = textOf(panelHtml(pg, VIEWS.working("trial", { askLead: true }), "en", opt));
  const pl6 = textOf(panelHtml(pg, VIEWS.working("trial", { askLead: true }), "pl", opt));
  const seat = Object.assign({}, VIEWS.working("team"), { holding: { on: "team", ends: T_ENDS } });
  const enTeam = textOf(panelHtml(pg, seat, "en", opt));
  const plTeam = textOf(panelHtml(pg, seat, "pl", opt));
  const ended = Object.assign({}, VIEWS.ended, { holding: { on: "team", ends: T_ENDS } });
  const en4 = panelHtml(pg, ended, "en", opt);
  const pl4 = panelHtml(pg, ended, "pl", opt);
  const ask = "Ask a team's lead\u2026";
  const askPl = "Popro\u015b lidera zespo\u0142u\u2026";
  return en2.includes("once the team's lead accepts it") && en2.indexOf("once ,") < 0
    && pl2.includes("gdy lider zespo\u0142u j\u0105 przyjmie") && pl2.indexOf("gdy ,") < 0
    && textOf(en3).includes(ask) && en3.indexOf(">Ask <") < 0
    && textOf(pl3).includes(askPl) && pl3.indexOf(">Popro\u015b: <") < 0
    && textOf(en4).includes(ask) && textOf(pl4).includes(askPl)
    && en5.includes("the seat on the team ended") && en5.indexOf("leads ended") < 0
    && pl5.includes("wygas\u0142o miejsce w zespole") && pl5.indexOf("kt\u00f3ry prowadzi") < 0
    && en6.includes("waits for the team's lead") && en6.indexOf("waits for ,") < 0
    && pl6.includes("czeka na odpowied\u017a lidera zespo\u0142u") && pl6.indexOf("udzieli ,") < 0
    && enTeam.includes("A seat on a team; it renews by itself") && enTeam.indexOf("on the team") < 0
    && plTeam.includes("Miejsce w zespole; odnawia si\u0119 samo") && plTeam.indexOf("zespole:") < 0;
};

/* Door lines say the month in full, and a date in another year keeps the year. The panel's own short day is unchanged. */
CASES.doorDates = (pg = P) => {
  const en2 = textOf(doorHtml(pg, VIEWS.waiting, "en"));
  const pl2 = textOf(doorHtml(pg, VIEWS.waiting, "pl"));
  const en6 = textOf(panelHtml(pg, VIEWS.working("own"), "en"));
  const pl6 = textOf(panelHtml(pg, VIEWS.working("own"), "pl"));
  const band = bandInfo(pg, VIEWS.ended, "en");
  const short = (s, token) => new RegExp("\\b" + token + "\\b").test(s);
  return en2.includes("1 December") && !short(en2, "1 Dec")
    && pl2.includes("1 grudnia") && !short(pl2, "1 gru")
    && en6.includes("17 November 2027") && !short(en6, "17 Nov")
    && pl6.includes("17 listopada 2027")
    && !!band && band.text.includes("17 November") && band.text.includes("17 December")
    && band.text.indexOf("2026") < 0 && band.text.indexOf("2027") < 0;
};

/* The band keeps the sheet's 30px. A flex child otherwise shrinks to its text, which measured 18px. */
CASES.bandFixed = (src) => {
  const tpl = cssText(src);
  return tpl.includes(".door-band{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;flex:0 0 30px;min-height:30px;height:30px;");
};

/* The way on is filled accent, and stays filled when focused: the ring is the page's own outline, outside the press. */
CASES.wayOn = (src) => {
  const tpl = cssText(src);
  const i = tpl.indexOf(".door-acts .btn.primary:focus-visible,");
  if (i < 0) return false;
  const block = tpl.slice(i, i + 460);
  return block.includes('.sgn-panel[data-moment="ended"] .btn.primary:focus-visible{background:var(--accent);color:#fff;border-color:var(--accent)}')
    && block.includes(".door-acts .btn.primary:hover")
    && block.indexOf("outline") < 0;
};

/* Licence line, one family (board 1011). The short form the Seat row carries as its value and the panel as its foot, for the
   cases the desk can tell: own trial (A), Studio's trial (B), own licence (C), a team's seat (D). The fifth, a team's seat
   with the person's own licence kept aside (E), is not in what the service sends, so the team's seat shows D. */
const SHORT = {
  en: { trial: d => `Trial · until ${d}`, studio: s => `Etiuda Studio's trial · until ${s}`, own: e => `Own licence · paid until ${e}`, team: e => `Team's licence · until ${e}` },
  pl: { trial: d => `Okres próbny · do ${d}`, studio: s => `Okres próbny Etiudy Studio · do ${s}`, own: e => `Własna licencja · opłacona do ${e}`, team: e => `Licencja zespołu · do ${e}` }
};
for (const lang of ["en", "pl"]) {
  CASES["seatFamily_" + lang] = (pg = P) => {
    if (typeof pg.deskSeatShort !== "function") return false;
    const sh = SHORT[lang];
    const dStr = dayOf(T_DESK_END, lang), sStr = dayOf(T_STUDIO_END, lang), eStr = dayOf(T_ENDS, lang);
    const short = (v, opts) => {
      storage.lsSet("eUiLang", lang);
      hostOn(v, opts);
      try { return pg.deskSeatShort(pg.deskDoorState(pg.signinRead(v))); } finally { hostOff(); }
    };
    const keptAside = Object.assign({}, VIEWS.working("team"), { deskOnly: true, licenceManaged: true, cause: "own-licence" });
    return short(VIEWS.working("trial")) === sh.trial(dStr)
      && short(VIEWS.working("trial", { askLead: true })) === sh.trial(dStr)
      && short(VIEWS.working("studio-trial")) === sh.studio(sStr)
      && short(VIEWS.working("own")) === sh.own(eStr)
      && short(VIEWS.working("team")) === sh.team(eStr)
      && short(VIEWS.working("team"), { noTeam: true }) === sh.team(eStr)
      && short(keptAside) === sh.team(eStr)
      && short(VIEWS.working("org")) === ""
      && short(VIEWS.ended) === "" && short(VIEWS.waiting) === "" && short(VIEWS.trialOver) === "" && short(VIEWS.stopped("own")) === "";
  };
}
/* Studio's trial told with no end for Etiuda's own fourteen days: the short form takes the seat's end, and the line says no day it does not hold. */
for (const lang of ["en", "pl"]) {
  CASES["studioNoDeskEnd_" + lang] = (pg = P) => {
    const sStr = dayOf(T_STUDIO_END, lang);
    const v = Object.assign({}, VIEWS.working("studio-trial"), { trials: { studio: T_STUDIO_END } });
    const noTrials = Object.assign({}, v, { trials: null });
    const html = panelHtml(pg, v, lang), txt = textOf(html);
    const plainHtml = panelHtml(pg, noTrials, lang), plain = textOf(plainHtml);
    const line = lang === "pl" ? `Okres próbny Etiudy Studio na tym koncie obejmuje także Etiudę, do ${sStr}.` : `The Etiuda Studio trial on this account covers Etiuda too, until ${sStr}.`;
    return footOf(html) === SHORT[lang].studio(sStr) && txt.includes(line)
      && txt.indexOf("ended on") < 0 && txt.indexOf("skończyły") < 0
      && plain.includes(line) && footOf(plainHtml) === SHORT[lang].studio(sStr);
  };
}
/* The own-trial block of the ask-your-lead panel, where the desk holds no seat to read: past Etiuda's own fourteen days and inside Studio's trial it is Studio's trial that is said, never the own trial running. */
for (const lang of ["en", "pl"]) {
  CASES["askLeadStudio_" + lang] = (pg = P) => {
    const sStr = dayOf(T_STUDIO_END, lang), dStr = dayOf(T_DESK_END, lang);
    const base = { offered: ["microsoft", "google"], signedIn: "microsoft", code: CODE, works: false, askLead: true, seat: "held", deskOnly: true, trialUntil: T_DESK_END, now: T_NOW };
    const past = Object.assign({}, base, { now: T_DESK_END + 86400000, trials: { desk: T_DESK_END, studio: T_STUDIO_END } });
    const within = Object.assign({}, base, { trials: { desk: T_DESK_END, studio: T_STUDIO_END } });
    const own = textOf(panelHtml(pg, within, lang));
    const stud = panelHtml(pg, past, lang);
    const sTxt = textOf(stud);
    const line = lang === "pl" ? `Własne czternaście dni Etiudy skończyły się ${dStr}. Okres próbny Etiudy Studio na tym koncie zaczął się później i obejmuje także Etiudę, do ${sStr}.`
      : `Etiuda's own fourteen days ended on ${dStr}. The Etiuda Studio trial on this account began later and covers Etiuda too, until ${sStr}.`;
    const ownHead = lang === "pl" ? "Trwa własny okres próbny tego konta." : "This account's own trial is running.";
    return own.includes(ownHead) && !sTxt.includes(ownHead)
      && sTxt.includes(SHORT[lang].studio(sStr) + " " + line);
  };
}
/* Nothing of the family where no case holds: the ended, waiting and trial-over panels carry no short-form foot, and the organisation's seat keeps its heading with an empty value. */
CASES.noFamilyElsewhere = (pg = P) => {
  for (const lang of ["en", "pl"]) {
    for (const v of [VIEWS.ended, VIEWS.waiting, VIEWS.trialOver, VIEWS.working("org")]) {
      if (panelHtml(pg, v, lang).includes("sgn-ft")) return false;
    }
    const org = acctHtml(SET, VIEWS.working("org"), lang);
    if (!/<div class="set-row" data-row="seat">[\s\S]*?<div class="set-ctl"><\/div><\/div>/.test(org) || org.includes('sgn-val">' + SHORT[lang].team(dayOf(T_ENDS, lang)))) return false;
  }
  return true;
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
  ["dd27", "wayOn", "the way on is filled var(--accent) with white text and an accent border, and the fill is restated on hover and focus"],
  ["dd28", "bandFixed", "the band is flex 0 0 30px with a 30px minimum, so it cannot shrink to its text"],
  ["dd29", "doorDates", "door lines use a long month, and a date in another year keeps the year"],
  ["dd30", "noName", "an unknown lead uses the words file's no-name forms, in English and Polish, and draws no blank"],
  ["dd31", "panelRows", "state 4 puts the way on and Buy on one row, then Check now and Account settings on the next"],
  ["dd32", "offlineGlyph", "the offline box leads with an 18px crossed-signal glyph at 70% opacity"],
  ["dd33", "seamShape", "B-3a1 seam: same keys and types; waiting and both trial-over states come before stopped where their fields hold, on the stoppedAt the shell sends; stopped is !works with stoppedAt > 0 where those fields do not; trials-ended, busy and refusal map cleanly"],
  ["dd35", "seatFamily_en", "licence line (EN): the short form for an own trial, Studio's trial, an own licence and a team's seat; a team's seat with a kept licence is told as the team's, as the service sends nothing more; none elsewhere"],
  ["dd36", "seatFamily_pl", "licence line (PL): the short form for an own trial, Studio's trial, an own licence and a team's seat; a team's seat with a kept licence is told as the team's, as the service sends nothing more; none elsewhere"],
  ["dd37", "studioNoDeskEnd_en", "licence line (EN): Studio's trial told with no end for the own fourteen days draws the seat's end and no day it does not hold"],
  ["dd38", "studioNoDeskEnd_pl", "licence line (PL): Studio's trial told with no end for the own fourteen days draws the seat's end and no day it does not hold"],
  ["dd39", "askLeadStudio_en", "licence line (EN): the ask-your-lead panel past the own fourteen days inside Studio's trial says Studio's trial, with the day, and not the own trial running"],
  ["dd40", "askLeadStudio_pl", "licence line (PL): the ask-your-lead panel past the own fourteen days inside Studio's trial says Studio's trial, with the day, and not the own trial running"],
  ["dd42", "askedDoor", "door (EN & PL): a person held at the door whose sign-in carried open join requests sees whom each waits on, one lead as the team's lead is told, several in one line with the plural heading, none as before"],
  ["dd41", "noFamilyElsewhere", "licence line: the ended, waiting, trial-over and organisation panels carry no short-form foot, and the organisation's Seat row keeps an empty value"],
  ["dd34", "doorNotNoneWhenDue", "Argon 51 B2: deskDoorState never answers none while signed in and due (waiting, full, no licence, team seat marked by another key), and paintFirstSignin never draws the retired fallback"],
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

function plantText(id, filePath, swap, caseName) {
  let red = false, why = "";
  try {
    const src = fs.readFileSync(filePath, "utf8");
    if (src.split(swap[0]).length !== 2) throw new Error("plant anchor not unique");
    red = !CASES[caseName](src.replace(swap[0], swap[1]));
  } catch (e) { why = e.message; }
  check(red, id + " plant " + swap[0].trim().slice(0, 56) + " turns " + caseName + " red" + (why ? " (" + why + ")" : ""));
}

if (!PLANTS_OFF) {
  await plant("ddp1", SIGNIN_PATH,
    ["if(works && v.ended>0) state=\"ended\"; /* plant:door-state-ended */", "if(false) state=\"ended\";"],
    "seam");
  await plant("ddp2", SIGNIN_PATH,
    ["else if(!works && v.signedIn) state=\"stopped\"; /* plant:door-state-stopped */", "else if(false) state=\"stopped\";"],
    "seam");
  await plant("ddp3", SIGNIN_PATH,
    ["else if(!works && v.signedIn && waitingOnLead && (trialOver || (!seatOn && !(v.stoppedAt>0)))) state=\"waiting\"; /* plant:door-state-waiting */", "else if(false) state=\"waiting\";"],
    "seam");
  await plant("ddp4", SIGNIN_PATH,
    ["else if(!works && !v.signedIn && !v.busy && FAIL_FIRST.indexOf(v.said)<0 && v.offered.length && v.registered && !v.online && !signinWaiting(v) && !signinStranded(v)) state=\"first-offline\"; /* plant:door-first-offline */", "else if(false) state=\"first-offline\";"],
    "state1o_en");
  await plant("ddp20", SIGNIN_PATH,
    ["const trialOver=seatOn===\"trial\" || (!seatOn && deskEnd>0); /* plant:door-trial-over */", "const trialOver=seatOn===\"trial\";"],
    "seamShape");
  await plant("ddp21", SIGNIN_PATH,
    ["else if(!works && v.signedIn && waitingOnLead && (trialOver || (!seatOn && !(v.stoppedAt>0)))) state=\"waiting\"; /* plant:door-state-waiting */\n  else if(!works && v.signedIn && trialOpen && orgLicence) state=\"trial-over-org\";\n  else if(!works && v.signedIn && trialOpen) state=\"trial-over\";\n  else if(!works && v.signedIn) state=\"stopped\"; /* plant:door-state-stopped */",
     "else if(!works && v.signedIn) state=\"stopped\"; /* plant:door-state-stopped */\n  else if(!works && v.signedIn && waitingOnLead && (trialOver || (!seatOn && !(v.stoppedAt>0)))) state=\"waiting\"; /* plant:door-state-waiting */\n  else if(!works && v.signedIn && trialOpen && orgLicence) state=\"trial-over-org\";\n  else if(!works && v.signedIn && trialOpen) state=\"trial-over\";"],
    "seamShape");
  await plant("ddp23", SIGNIN_PATH,
    ["const waitingOnLead=!!(v.askLead || signinNoSeat(v)); /* B-3a feeds this */ /* plant:door-waiting-noseat */", "const waitingOnLead=!!v.askLead; /* B-3a feeds this */"],
    "doorNotNoneWhenDue");
  await plant("ddp24", SIGNIN_PATH,
    ["else if(!works && v.signedIn && waitingOnLead && (trialOver || (!seatOn && !(v.stoppedAt>0)))) state=\"waiting\"; /* plant:door-state-waiting */", "else if(!works && v.signedIn && waitingOnLead && trialOver) state=\"waiting\";"],
    "doorNotNoneWhenDue");
  await plant("ddp25", SIGNIN_PATH,
    ["else if(!works && v.signedIn) state=\"stopped\"; /* plant:door-state-stopped */", "else if(!works && v.signedIn && v.stoppedAt>0) state=\"stopped\";"],
    "doorNotNoneWhenDue");
  await plant("ddp22", SIGNIN_PATH,
    ["const trialOpen=trialOver && !(seatOn && v.stoppedAt>0); /* plant:door-trial-open */", "const trialOpen=trialOver;"],
    "state5_en");
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
    ["if(ds.state===\"working\") return {moment:\"working\", ident, heading:pair[0], line:pair[1], foot:deskSeatShort(ds), acts:[{act:\"check\", label:t(\"Check now\")}, acct]}; /* plant:door-panel-working */", "if(false) return {};"],
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
  await plant("ddp18", SIGNIN_PATH,
    ["'<div class=\"door-off\">'+DOOR_OFF_GLYPH+'<span>'", "'<div class=\"door-off\"><span>'"],
    "offlineGlyph");
  await plant("ddp17", SIGNIN_PATH,
    ["if(d.moment===\"ended\") h+=signinEndedActsHtml(d.acts); /* plant:door-panel-rows */", "if(false) h+=signinEndedActsHtml(d.acts); /* plant:door-panel-rows */"],
    "panelRows");
  await plant("ddp16", SIGNIN_PATH,
    ["if(!lead) return t(\"Ask a team's lead…\"); /* plant:door-ask-noname */", "if(false) return t(\"Ask a team's lead…\"); /* plant:door-ask-noname */"],
    "noName");
  await plant("ddp15", SIGNIN_PATH,
    ["if(d.getFullYear()!==new Date(now>0?now:Date.now()).getFullYear()) opt.year=\"numeric\"; /* plant:door-day-year */", "if(false) opt.year=\"numeric\"; /* plant:door-day-year */"],
    "doorDates");
  await plant("ddp24", SIGNIN_PATH,
    ["const opt={day:\"numeric\", month:\"long\"};", "const opt={day:\"numeric\", month:\"short\"};"],
    "doorDates");
  /* The no-name forms: each ternary on the lead's name, put back to the named sentence alone. */
  await plant("ddp20", SIGNIN_PATH,
    ["if(on===\"team\") return lead ? named(", "if(on===\"team\") return true ? named("],
    "noName");
  await plant("ddp21", SIGNIN_PATH,
    ["    lead ? fill(t(\"Catalogs open here again once {LEAD}", "    true ? fill(t(\"Catalogs open here again once {LEAD}"],
    "noName");
  await plant("ddp22", SIGNIN_PATH,
    ["return [\"\", teamName ? fill(t(\"A seat on the team {TEAM}; it renews by itself, and the team's licence runs until {ENDS}.\")", "return [\"\", true ? fill(t(\"A seat on the team {TEAM}; it renews by itself, and the team's licence runs until {ENDS}.\")"],
    "noName");
  await plant("ddp23", SIGNIN_PATH,
    ["    lead ? fill(t(\"Day {N} of 14, until {DESK_END}. The request to join waits for {LEAD}", "    true ? fill(t(\"Day {N} of 14, until {DESK_END}. The request to join waits for {LEAD}"],
    "noName");
  await plant("ddp26", SIGNIN_PATH,
    ["if(ds.seatOn===\"trial\") return named(t(\"Trial \u00b7 until {DATE}\"),\"{DATE}\",day(ds.deskEnd)); /* plant:seat-short-trial */", "if(false) return \"\";"],
    "seatFamily_en");
  await plant("ddp27", SIGNIN_PATH,
    ["if(ds.seatOn===\"studio-trial\") return named(t(\"Etiuda Studio's trial \u00b7 until {STUDIO_END}\"),\"{STUDIO_END}\",day(ds.studioEnd||ds.ends)); /* plant:seat-short-studio */", "if(false) return \"\";"],
    "seatFamily_en");
  await plant("ddp28", SIGNIN_PATH,
    ["if(ds.seatOn===\"own\") return named(t(\"Own licence \u00b7 paid until {ENDS}\"),\"{ENDS}\",day(ds.ends)); /* plant:seat-short-own */", "if(false) return \"\";"],
    "seatFamily_pl");
  await plant("ddp29", SIGNIN_PATH,
    ["if(ds.seatOn===\"team\") return named(t(\"Team's licence \u00b7 until {ENDS}\"),\"{ENDS}\",day(ds.ends)); /* plant:seat-short-team */", "if(false) return \"\";"],
    "seatFamily_pl");
  await plant("ddp30", SIGNIN_PATH,
    ["day(ds.studioEnd||ds.ends)", "day(ds.studioEnd)"],
    "studioNoDeskEnd_en");
  await plant("ddp31", SIGNIN_PATH,
    ["const pastOwn=ds.now>0 && ds.deskEnd>0 && ds.now>ds.deskEnd && ds.studioEnd>ds.now; /* plant:own-trial-past */", "const pastOwn=false;"],
    "askLeadStudio_en");
  await plant("ddp32", SETTINGS_PATH,
    ["ctl:seatShort ? val(seatShort) : \"\"}); /* plant:account-seat-short */", "ctl:\"\"});"],
    "account_en");
  await plant("ddp33", SETTINGS_PATH,
    ["title:seatShort ? t(\"Seat\") : seatPair[0], /* plant:account-seat-title */", "title:seatPair[0],"],
    "account_pl");
  plantText("ddp19", TEMPLATE_PATH,
    [".door-out{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)} /* plant:door-out-gap */", ".door-out{margin-top:18px;padding-top:18px;border-top:1px solid var(--line)} /* plant:door-out-gap */"],
    "css");
  plantText("ddp14", TEMPLATE_PATH,
    ["flex:0 0 30px;min-height:30px;height:30px;/* plant:door-band-fixed */", "height:30px;/* plant:door-band-fixed */"],
    "bandFixed");
  plantText("ddp13", TEMPLATE_PATH,
    ["{background:var(--accent);color:#fff;border-color:var(--accent)} /* plant:door-on-fill */", "{background:var(--btn-rest)} /* plant:door-on-fill */"],
    "wayOn");
}

console.log("#counts checks=" + asserted + " skipped=0 failed=" + failed + " expected=" + EXPECTED);
if (asserted < EXPECTED) {
  console.log("SUITE DID NOT COMPLETE: " + asserted + " of " + EXPECTED + " checks ran");
  process.exit(78);
}
console.log("\n" + asserted + " checks, " + failed + " failed");
process.exit(Math.min(63, failed));
