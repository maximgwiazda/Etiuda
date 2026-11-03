/* The message test and the score floor, on an invented catalog.
 *
 *   node tests/clip-suggest.mjs
 *
 * A word is a whitespace token which, with punctuation trimmed from its ends, is letters
 * only (an inner hyphen or apostrophe allowed) and two or more letters long. A message
 * has at least MESSAGE_WORD_MIN such words, and at least MESSAGE_LETTER_SHARE of its
 * non-space characters are letters. The strip is the intents whose score is above
 * SUGGEST_SCORE_FLOOR, five at most. Nothing of the message is kept after the score.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = path.join(ROOT, "src", "modules", "clip-suggest.js");
const CJS = path.join(ROOT, "shell", "clip-suggest.cjs");
const nodeRequire = createRequire(import.meta.url);

let checks = 0, failed = 0;
const check = (ok, what) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failed++;
};

const api = await import(pathToFileURL(MOD).href);
const {
  MESSAGE_WORD_MIN, MESSAGE_LETTER_SHARE, SUGGEST_SCORE_FLOOR, SUGGEST_LIMIT,
  readsLikeMessage, messageWords, buildSuggestModel, scoreSuggestions
} = api;

check(MESSAGE_WORD_MIN === 3 && MESSAGE_LETTER_SHARE === 0.6 && SUGGEST_SCORE_FLOOR === 2.5 && SUGGEST_LIMIT === 5,
  "the floors are the named constants: " + [MESSAGE_WORD_MIN, MESSAGE_LETTER_SHARE, SUGGEST_SCORE_FLOOR, SUGGEST_LIMIT].join(", "));

const notMessages = [
  ["bare code", "X7K2P9"],
  ["labelled code", "Booking code X7K2P9"],
  ["phone", "+44 7700 900123"],
  ["email", "ada@example.com"],
  ["url", "https://example.com/lamps"],
  ["card", "4242 4242 4242 4242"],
  ["one name", "Ada"],
  ["two names", "Ada Lovelace"],
  ["code and two names", "X7K2P9 Ada Lovelace"]
];
for (const [name, text] of notMessages) {
  check(readsLikeMessage(text) === false, name + " is not a message (" + messageWords(text).length + " words): " + JSON.stringify(text));
}
const names = ["Ada Maria Quinn", "Mary Anne Evans", "Jan Maria Kowalski"];
for (const text of names) {
  check(readsLikeMessage(text) === true && messageWords(text).length === 3, "a three-word name is a message: " + JSON.stringify(text));
}
check(readsLikeMessage("well-known brass lamp") && messageWords("Mary-Jane Anne Smith").length === 3,
  "an inner hyphen stays inside the word");
check(messageWords("O'Brien sends lamps").length === 3, "an inner apostrophe stays inside the word");
check(readsLikeMessage("Ok ok ok !!!!") === true && readsLikeMessage("Ok ok ok !!!!!") === false,
  "the letter share is at least " + MESSAGE_LETTER_SHARE + ", and one more mark falls under it");
check(readsLikeMessage("") === false && readsLikeMessage("   ") === false, "an empty clipboard is not a message");

/* Thirteen cards, so a word on one of them is under the 8% weight cut. The topic word
   lantern is on no card, so its weight stays 1 and one exact tier-1 hit scores 4.
   brasswick is a keyword on one card only, a tier-2 hit, which scores 2.5 and stays hidden. */
function filler(n) {
  const cards = [];
  for (let i = 0; i < n; i++) {
    cards.push({
      title: { en: "Filler shade " + i, pl: "Wypelniacz " + i },
      k: "filler" + i,
      body: { en: "A plain note about shade " + i + " and nothing else.", pl: "" },
      requests: i === 0 ? ["t:wick"] : []
    });
  }
  return cards;
}
const catalog = {
  cards: filler(12).concat([{
    title: { en: "Wick trim", pl: "Przyciecie knota" },
    k: "brasswick",
    body: { en: "Trim the wick before lighting.", pl: "" },
    requests: ["t:wick"]
  }]),
  tags: [{
    kind: "request", id: "t:wick", name: "Wick trim",
    topic: { en: "lantern", pl: "latarnia" },
    clause: { en: "trimming a wick", pl: "przycinanie knota" },
    action: { en: "trimmed", pl: "przycieto" }
  }, {
    kind: "request", id: "t:shade", name: "Shade cloth",
    topic: { en: "shade", pl: "abażur" },
    clause: { en: "a cloth shade", pl: "abażur z tkaniny" },
    action: { en: "fitted", pl: "zalozono" }
  }]
};
const labels = { suggest: "Suggested from the copied message", suggestTip: "None is chosen until one is clicked." };
const model = buildSuggestModel(catalog, labels);
const hidden = scoreSuggestions("please send brasswick soonish", model);
const shown = scoreSuggestions("please mend lantern today", model);
check(hidden.length === 0, "a tier-2 exact at the floor stays hidden: " + JSON.stringify(hidden));
check(shown.length === 1 && shown[0].id === "t:wick" && shown[0].score > SUGGEST_SCORE_FLOOR && shown[0].name === "Wick trim",
  "a tier-1 exact above the floor is offered: " + JSON.stringify(shown));
const nameScore = scoreSuggestions("Ada Maria Quinn", model);
check(readsLikeMessage("Ada Maria Quinn") && nameScore.length === 0,
  "a three-word name can be a message and still leave the strip empty: " + JSON.stringify(nameScore));
check(scoreSuggestions("please mend the lantern today", model).length <= SUGGEST_LIMIT, "at most five are offered");

const secret = "zebraquill please mend the lantern glass today";
const rows = scoreSuggestions(secret, model);
const held = JSON.stringify(rows) + JSON.stringify(model);
check(held.indexOf("zebraquill") < 0 && held.indexOf(secret) < 0,
  "the score and the model hold none of the message");
const src = readFileSync(MOD, "utf8");
check(!/\b(?:writeFile|appendFile|readFile|console)\s*[.(]/.test(src) && !/\bclipboard\s*\./.test(src) && !/\brequire\s*\(/.test(src),
  "the module neither writes, logs, nor reads a clipboard");

/* The window leg's catalog is two cards and one unlinked topic. A word on one of two cards
   would be dropped by the weight cut, so the topic must be on neither card. */
const two = {
  cards: [
    { title: { en: "Lamp delivery" }, body: { en: "Your lamp leaves the workshop on Monday." }, requests: [] },
    { title: { en: "Care of brass" }, body: { en: "Brass wants a dry cloth." }, requests: [] }
  ],
  tags: [{
    kind: "request", id: "t:t-wick", name: "lantern",
    topic: { en: "lantern" }, clause: { en: "trimming a wick" }, action: { en: "trimmed" }
  }]
};
const twoModel = buildSuggestModel(two, labels);
const twoShown = scoreSuggestions("Please mend lantern today", twoModel);
check(twoShown.length === 1 && twoShown[0].id === "t:t-wick" && twoShown[0].name === "lantern" && twoShown[0].score > SUGGEST_SCORE_FLOOR,
  "two cards and an unlinked topic still clear the floor: " + JSON.stringify(twoShown));
check(scoreSuggestions("Your lamp leaves the workshop on Monday", twoModel).length === 0,
  "the lamp card's own sentence scores no intent");

const cjs = nodeRequire(CJS);
const again = cjs.scoreSuggestions("please mend lantern today", cjs.buildSuggestModel(catalog, labels));
check(JSON.stringify(again) === JSON.stringify(shown),
  "the shell's copy scores the same row: " + JSON.stringify(again));

/* Row 4: A 5-card, 3-intent catalog whose intent topic is the customer's noun suggests that intent. */
const smallCat = {
  cards: [
    { title: { en: "Kettle order" }, body: { en: "The kettle arrives tomorrow." }, requests: ["t:kettle"] },
    { title: { en: "Whistle order" }, body: { en: "The whistle arrives tomorrow." }, requests: ["t:whistle"] },
    { title: { en: "Handle order" }, body: { en: "The handle arrives tomorrow." }, requests: ["t:handle"] },
    { title: { en: "Filler pack one" }, body: { en: "Plain package one." }, requests: [] },
    { title: { en: "Filler pack two" }, body: { en: "Plain package two." }, requests: [] }
  ],
  tags: [
    { kind: "request", id: "t:kettle", name: "Kettle spouts", topic: { en: "kettle" }, clause: { en: "a kettle spout" } },
    { kind: "request", id: "t:whistle", name: "Steam whistle", topic: { en: "whistle" }, clause: { en: "a brass whistle" } },
    { kind: "request", id: "t:handle", name: "Timber handle", topic: { en: "handle" }, clause: { en: "wooden grip" } }
  ]
};
const smallModel = buildSuggestModel(smallCat, labels);
const smallShown = scoreSuggestions("Please send kettle today", smallModel);
check(smallShown.length === 1 && smallShown[0].id === "t:kettle",
  "a 5-card, 3-intent catalog whose intent topic is the customer's noun suggests that intent");
const smallCjs = cjs.scoreSuggestions("Please send kettle today", cjs.buildSuggestModel(smallCat, labels));
check(smallCjs.length === 1 && smallCjs[0].id === "t:kettle",
  "the shell copy suggests the small catalog's intent as well");

/* Row 8a: A German-only fixture catalog (invented words, never a real catalog) suggests its intent. */
const deCat = {
  cards: [
    { title: { de: "Schraube paket" }, body: { de: "Ihre schrauben kommen bald." }, requests: ["t:schraube"] },
    { title: { de: "Andere sache" }, body: { de: "Ein anderes paket." }, requests: [] }
  ],
  tags: [
    { kind: "request", id: "t:schraube", name: "Schraubenlieferung", topic: { de: "schraube" }, clause: { de: "lieferung von schrauben" } }
  ]
};
const deModel = buildSuggestModel(deCat, labels);
const deShown = scoreSuggestions("Guten tag schraube bitte", deModel);
check(deShown.length === 1 && deShown[0].id === "t:schraube",
  "a German-only fixture catalog (invented words, never a real catalog) suggests its intent");
const deCjs = cjs.scoreSuggestions("Guten tag schraube bitte", cjs.buildSuggestModel(deCat, labels));
check(deCjs.length === 1 && deCjs[0].id === "t:schraube",
  "the shell copy suggests the German-only intent as well");

console.log("\n#counts checks=" + checks + " failed=" + failed);
process.exit(failed ? 1 : 0);
