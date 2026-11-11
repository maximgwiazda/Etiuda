"use strict";
/* THE ORGANISATION'S OWN MODEL, where Settings or machine policy chose one: it re-orders a shortlist the desk already made,
   once per settled query, and answers with the order alone. Off unless chosen; nothing here sends while the configuration
   is null. A request carries the instruction, the model's name, the query and the shortlist's texts, and nothing else. */

/* Which result the agent sees at once while the organisation's model is asked: "builtin", the built-in model's where it
   ranks, or "words", word matching alone. Either way the organisation's order, when it comes in time, has the last word. */
const INSTANT_FROM = "builtin";
/* How long an ask may take, from the moment it is sent, before its answer is dropped and counted as a failure. */
const REORDER_WINDOW_MS = 2000;
/* The quiet after the last settled query before the ask goes, so one settle is one ask. */
const SETTLE_MS = 150;
/* Three failures in a row stop the asks for a minute; the next ask after it is tried as any other. */
const FAILS_TO_PAUSE = 3;
const PAUSE_MS = 60000;
/* What one ask sends at most: rows of the shortlist, characters of the query and of each row, and the request's bytes. */
const SHORTLIST_MAX = 12;
const QUERY_CHARS = 1500;
const ITEM_CHARS = 400;
const SEND_MAX = 65536;
const ANSWER_MAX = 262144;
/* Anthropic requires a ceiling on the answer; an order of twelve numbers is far inside it. */
const MESSAGES_MAX_TOKENS = 200;

/* THE SERVICES, one per line, each written from its provider's documentation: OpenAI's chat completions; Azure OpenAI's
   v1 API at the resource's own address, its key in a header of its own; Anthropic's Messages API with its version header;
   Google's Interactions API; and "compatible", any other service that speaks the chat protocol, at the address given. */
const PROVIDERS = Object.freeze({
  openai: Object.freeze({ protocol: "chat", auth: "authorization", endpoint: "https://api.openai.com/v1/" }),
  anthropic: Object.freeze({ protocol: "messages", auth: "x-api-key", endpoint: "https://api.anthropic.com/v1/" }),
  google: Object.freeze({ protocol: "interactions", auth: "x-goog-api-key", endpoint: "https://generativelanguage.googleapis.com/v1/" }),
  azure: Object.freeze({ protocol: "chat", auth: "api-key", endpoint: "" }),
  compatible: Object.freeze({ protocol: "chat", auth: "authorization", endpoint: "" }),
});
const ROUTES = Object.freeze({ chat: "chat/completions", messages: "messages", interactions: "interactions" });
const MESSAGES_VERSION = ["anthropic-version", "2026-10-21"];
/* The only header names a request may carry. */
const HEADERS = Object.freeze(["content-type", "authorization", "api-key", "x-api-key", "anthropic-version", "x-goog-api-key"]);
/* What an agent does that means the list in front of them is theirs now: a key, a click, a wheel, a scroll, a touch.
   A pointer passing over the window is not one. */
const TOUCH_TYPES = new Set(["rawKeyDown", "keyDown", "char", "mouseDown", "contextMenu", "mouseWheel", "gestureScrollBegin",
  "gestureScrollUpdate", "gestureFlingStart", "gestureTap", "gestureTapDown", "touchStart", "pointerDown"]);

const ORDER_PROMPT = "You order a short list of candidate items by how well each one answers the query. "
  + "Reply with the item numbers only, best first, as a JSON array of integers such as [2,1,3]. Write nothing else.";

function touches(type) { return TOUCH_TYPES.has(String(type || "")); }

/** The address as kept: https, no user, query or fragment, its path ending in "/", the protocol's own route taken off
 *  where the whole address was pasted. "" for anything else. */
function endpointShape(text, provider) {
  let u = null;
  try { u = new URL(String(text == null ? "" : text).trim()); } catch { return ""; }
  if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.search !== "" || u.hash !== "" || !u.hostname) return "";
  const p = PROVIDERS[provider];
  const route = p ? ROUTES[p.protocol] : "";
  let at = u.pathname;
  if (route && at.toLowerCase().endsWith("/" + route)) at = at.slice(0, -route.length);
  else if (route && at.toLowerCase().endsWith("/" + route + "/")) at = at.slice(0, -route.length - 1);
  if (!at.endsWith("/")) at += "/";
  u.pathname = at;
  return u.href;
}
/** Where a request for `config` goes: the address it names, else its service's published one; "" where there is neither. */
function endpointFor(config) {
  const p = config && PROVIDERS[config.provider];
  if (!p) return "";
  const given = String(config.endpoint || "");
  return given ? endpointShape(given, config.provider) : p.endpoint;
}
/** The canonical form only: what new URL makes of the address must be the address itself. */
function admitted(url) {
  const raw = String(url);
  let u = null;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.search !== "" || u.hash !== "" || !u.hostname) return false;
  if (/%2e/i.test(raw)) return false;
  return u.href === raw;
}

function clean(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
/** The user's turn: the query, then the shortlist numbered from 1. */
function orderText(query, items) {
  const rows = (Array.isArray(items) ? items : []).slice(0, SHORTLIST_MAX).map((t, i) => (i + 1) + ". " + clean(t, ITEM_CHARS));
  return "Query: " + clean(query, QUERY_CHARS) + "\n\nItems:\n" + rows.join("\n");
}

/** THE ONE BUILDER OF WHAT LEAVES: {url, headers, body} from `config`'s provider, endpoint, model and key, the query and
 *  the shortlist's texts. It reads no other field of anything. Null where the configuration cannot make a request. */
function requestFor(config, query, items) {
  const p = config && PROVIDERS[config.provider];
  const at = p ? endpointFor(config) : "";
  const model = String((config && config.model) || "").trim();
  if (!p || !at || !model) return null;
  const key = String(config.key || "");
  const headers = { "content-type": "application/json" };
  if (key) headers[p.auth] = p.auth === "authorization" ? "Bearer " + key : key;
  const text = orderText(query, items);
  let doc = null;
  if (p.protocol === "messages") {
    headers[MESSAGES_VERSION[0]] = MESSAGES_VERSION[1];
    doc = { model, max_tokens: MESSAGES_MAX_TOKENS, system: ORDER_PROMPT, messages: [{ role: "user", content: text }] };
  } else if (p.protocol === "interactions") {
    doc = { model, system_instruction: ORDER_PROMPT, input: text, store: false };
  } else {
    doc = { model, messages: [{ role: "system", content: ORDER_PROMPT }, { role: "user", content: text }] };
  }
  return { url: at + ROUTES[p.protocol], headers, body: Buffer.from(JSON.stringify(doc), "utf8") };
}

/** The answer's text from the service's {status, bytes}, or null for an error, a cut answer or one with no text. */
function replyText(provider, status, bytes) {
  if (!(status >= 200 && status < 300)) return null;
  let doc = null;
  try { doc = JSON.parse(Buffer.from(bytes || []).toString("utf8")); } catch { return null; }
  if (!doc || typeof doc !== "object") return null;
  const p = PROVIDERS[provider];
  const texts = list => (Array.isArray(list) ? list : []).filter(b => b && b.type === "text" && typeof b.text === "string").map(b => b.text).join("");
  let text = "";
  if (p && p.protocol === "messages") {
    if (doc.stop_reason === "max_tokens") return null;
    text = texts(doc.content);
  } else if (p && p.protocol === "interactions") {
    if (doc.status !== undefined && doc.status !== "completed") return null;
    text = (Array.isArray(doc.steps) ? doc.steps : []).filter(s => s && s.type === "model_output").map(s => texts(s.content)).join("");
  } else {
    const first = Array.isArray(doc.choices) ? doc.choices[0] : null;
    if (!first || first.finish_reason === "length") return null;
    text = first.message && typeof first.message.content === "string" ? first.message.content : "";
  }
  return text.trim() ? text : null;
}

/** The order the model gave, as indices from 0 into a shortlist of `n`: the first JSON array of integers in its text,
 *  each from 1 to n, each once. Null where there is none, or where it names a number outside the list. */
function parseOrder(text, n) {
  const m = /\[[\s\d,]*\]/.exec(String(text || ""));
  if (!m) return null;
  let list = null;
  try { list = JSON.parse(m[0]); } catch { return null; }
  if (!Array.isArray(list) || !list.length) return null;
  const out = [];
  for (const v of list) {
    if (!Number.isInteger(v) || v < 1 || v > n) return null;
    if (out.indexOf(v - 1) < 0) out.push(v - 1);
  }
  for (let i = 0; i < n; i++) if (out.indexOf(i) < 0) out.push(i);
  return out;
}

/** THE DOOR: one POST of `req` through `fetchFn`, answered {status, bytes}. It refuses before sending anything but a
 *  canonical https address, a header off HEADERS or a body over SEND_MAX; follows no redirect, sends no cookie, reads at
 *  most ANSWER_MAX, and gives up at `ms`. */
async function door(fetchFn, req, ms) {
  const ok = req && typeof req.url === "string" && admitted(req.url) && req.headers && typeof req.headers === "object"
    && Object.keys(req.headers).every(h => HEADERS.indexOf(h) > -1) && Buffer.isBuffer(req.body) && req.body.length <= SEND_MAX;
  if (!ok) throw new Error("the organisation's model is reached at its https address only, with its own headers");
  const ctl = new AbortController();
  let timer = null;
  const late = new Promise((_, no) => {
    timer = setTimeout(() => { try { ctl.abort(); } catch { /* gone */ } no(new Error("late")); }, ms);
    if (timer.unref) timer.unref();
  });
  const read = (async () => {
    const res = await fetchFn(req.url, { method: "POST", headers: req.headers, body: req.body, redirect: "error",
      cache: "no-store", credentials: "omit", signal: ctl.signal });
    const parts = [];
    let got = 0;
    const reader = res && res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
    if (reader) {
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        got += step.value.length;
        if (got > ANSWER_MAX) { try { reader.cancel(); } catch { /* gone */ } throw new Error("too long"); }
        parts.push(Buffer.from(step.value));
      }
    } else if (res && typeof res.arrayBuffer === "function") {
      const all = Buffer.from(await res.arrayBuffer());
      if (all.length > ANSWER_MAX) throw new Error("too long");
      parts.push(all);
    }
    return { status: res ? res.status : 0, bytes: Buffer.concat(parts) };
  })();
  try { return await Promise.race([read, late]); }
  finally { clearTimeout(timer); read.catch(() => {}); late.catch(() => {}); }
}

/** The asks, their pause and their outcome. `config()` is the configuration in force or null; `onState` hears
 *  {ranking, failures, pausedUntil} after every outcome, ranking "organisation" when the model answered and "builtin"
 *  while it does not. */
function createReorder(opts) {
  const o = opts || {};
  const now = typeof o.now === "function" ? o.now : () => Date.now();
  const later = typeof o.setTimer === "function" ? o.setTimer : (fn, ms) => setTimeout(fn, ms);
  const stopLater = typeof o.clearTimer === "function" ? o.clearTimer : t => clearTimeout(t);
  const config = () => { try { return o.config ? o.config() || null : null; } catch { return null; } };
  const windowMs = Number.isFinite(o.windowMs) ? o.windowMs : REORDER_WINDOW_MS;
  let failures = 0, pausedUntil = 0, settleTimer = null;
  const tell = ranking => { try { if (o.onState) o.onState({ ranking, failures, pausedUntil }); } catch { /* the page has gone */ } };
  const paused = () => pausedUntil > now();
  const failed = () => {
    failures++;
    if (failures >= FAILS_TO_PAUSE) pausedUntil = now() + PAUSE_MS;
    tell("builtin");
    return null;
  };
  return {
    /** A configuration is in force and the asks are not paused. */
    active() { return !!config() && !paused(); },
    paused,
    /** `fn` after SETTLE_MS of quiet; a later call replaces an earlier one still waiting. */
    settle(fn) {
      if (settleTimer) stopLater(settleTimer);
      settleTimer = later(() => { settleTimer = null; fn(); }, SETTLE_MS);
    },
    /** The organisation's order for `items` under `query`, as indices from 0, or null. `wanted()` is asked when the answer
     *  comes: false drops it, which is no failure. An answer after the window, or none, is a failure. */
    async ask(query, items, wanted) {
      const cfg = config();
      if (!cfg || paused()) return null;
      const list = (Array.isArray(items) ? items : []).slice(0, SHORTLIST_MAX);
      if (list.length < 2) return null;
      const req = requestFor(cfg, query, list);
      if (!req) return failed();
      const began = now();
      let res = null;
      try { res = await door(o.fetch, req, windowMs); } catch { return failed(); }
      if (now() - began > windowMs) return failed();
      const order = parseOrder(replyText(cfg.provider, res.status, res.bytes), list.length);
      if (!order) return failed();
      failures = 0;
      pausedUntil = 0;
      tell("organisation");
      if (typeof wanted === "function" && !wanted()) return null;
      return order;
    },
    state() { return { failures, pausedUntil }; },
  };
}

module.exports = {
  INSTANT_FROM, REORDER_WINDOW_MS, SETTLE_MS, FAILS_TO_PAUSE, PAUSE_MS, SHORTLIST_MAX, SEND_MAX, ANSWER_MAX, PROVIDERS,
  HEADERS, ORDER_PROMPT, touches, endpointShape, endpointFor, admitted, orderText, requestFor, replyText, parseOrder, door,
  createReorder,
};
