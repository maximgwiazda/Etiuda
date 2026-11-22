/* A SEATED DESK FOR A LEG THAT LAUNCHES THE REAL SHELL. An unseated desk shows the first sign-in door, which swallows every key
 * aimed outside it (src/modules/keydown.js, the door's capture lock), so a leg about anything else seats its desk first, through
 * the shell's own ETIUDA_SIGNIN_LAB path: a loopback service on 127.0.0.1 answers the lab provider's token address and the licence
 * service's signin/desk with certificates tests/seat-lab.mjs mints under a per-run root the lab file names, and the desk's own
 * certificate check judges them. Nothing writes signin.json but the shell.
 *
 *     const seat = await openShellSeat({ dir });      // dir: a folder of the leg's own, the lab file is written there
 *     env: Object.assign(legEnv, seat.env)              // the launch's environment
 *     child.stdout.on("data", d => seat.hear(String(d))) // stdout and stderr: the shell's hand-off line completes the sign-in
 *     await seat.seat(page);                            // a trusted click on the door's Lab button, then waits for a working desk
 *     seat.close();                                     // stops the service; the leg removes `dir`
 *
 * LIMITS. The launch must replace the shell's one browser call with a line naming the address on stdout, as tests/links.js's lab
 * copy does, or the press opens this machine's browser; hear() finds the lab's authorize address in any such line. The shell reads
 * the lab file only unpackaged and not installed, so a packaged or installed desk cannot be seated this way. The sign-in needs the
 * system to seal for real (sealsForReal), so on Linux without an unlocked keyring the press is answered signin-keyring and seat()
 * throws. One sign-in per service; renewals go to the same service and are answered alike.
 */
import http from "node:http";
import { createSeatLab } from "./seat-lab.mjs";

const AUTH_IN_LINE = /http:\/\/127\.0\.0\.1:[0-9]{1,5}\/auth\?[^\s"'\\]+/;
const LAB_BUTTON = '[data-e-open="signin"][data-e-provider="lab"]';

export async function openShellSeat(opts) {
  const o = opts || {};
  if (!o.dir) throw new Error("seat-shell: name a folder of the leg's own as dir");
  const calls = [];
  let lab = null, origin = "";
  const server = http.createServer((req, res) => {
    const parts = [];
    req.on("data", c => parts.push(c));
    req.on("end", () => {
      const url = origin + String(req.url || "/");
      calls.push(req.method + " " + String(req.url || "/").split("?")[0]);
      const answer = lab ? lab.labFetch(url, { method: req.method, body: Buffer.concat(parts) }) : null;
      if (!answer) { res.writeHead(404, { "content-type": "text/plain" }); res.end(); return; }
      Promise.resolve(answer).then(async r => {
        const bytes = Buffer.from(await r.arrayBuffer());
        res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/json", "content-length": bytes.length });
        res.end(bytes);
      }).catch(() => { try { res.writeHead(500); res.end(); } catch { /* the shell has gone */ } });
    });
  });
  await new Promise((yes, no) => { server.once("error", no); server.listen(0, "127.0.0.1", yes); });
  origin = "http://127.0.0.1:" + server.address().port;
  lab = createSeatLab({ labDir: o.dir, serviceOrigin: origin, seat: o.seat || { kind: "own" } });
  const browser = lab.labShell();
  const handed = [];
  let handedYes = null;
  const handedNow = () => new Promise(yes => { if (handed.length) yes(handed[handed.length - 1]); else handedYes = yes; });

  return {
    env: { ETIUDA_SIGNIN_LAB: lab.path },
    root: lab.root,
    calls,
    handed,
    /* One chunk of the shell's output: where it names this service's authorize address, the provider's redirect is made as a browser
       would make it. True where it did. */
    hear(text) {
      let took = false;
      for (const line of String(text).split(/\r?\n/)) {
        const m = AUTH_IN_LINE.exec(line);
        if (!m || m[0].indexOf(origin + "/auth?") !== 0) continue;
        handed.push(m[0]);
        browser.openExternal(m[0]).catch(() => {});
        if (handedYes) { handedYes(m[0]); handedYes = null; }
        took = true;
      }
      return took;
    },
    /* The door's Lab button pressed as a person presses it (a trusted click, which the preload requires), then the desk read until
       it works, holds its seat and the door has closed. Throws, saying what it saw, where any of that does not come. */
    async seat(page, so) {
      const ms = (so && so.timeout) || 20000;
      await page.waitForFunction(sel => [...document.querySelectorAll(sel)].some(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
        { timeout: ms }, LAB_BUTTON);
      const at = await page.evaluate(sel => {
        const b = [...document.querySelectorAll(sel)].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
        return { x, y, hits: !!hit && (hit === b || b.contains(hit)) };
      }, LAB_BUTTON);
      if (!at.hits) throw new Error("seat-shell: something sits over the door's Lab button");
      const from = handed.length;
      await page.mouse.click(at.x, at.y);
      const url = await Promise.race([handedNow(), new Promise(yes => setTimeout(() => yes(""), ms))]);
      if (!url || handed.length <= from) throw new Error("seat-shell: the press handed no lab address out; is the browser call stubbed to a line and hear() fed?");
      try {
        await page.waitForFunction(() => {
          const v = window.E_HOST && typeof window.E_HOST.signinState === "function" ? window.E_HOST.signinState() : null;
          return !!v && v.works === true && v.seat === "held" && !document.body.classList.contains("e-first-signin");
        }, { timeout: ms });
      } catch (e) {
        const v = await page.evaluate(() => { try { return window.E_HOST.signinState(); } catch { return null; } });
        throw new Error("seat-shell: the desk did not come to work: " + JSON.stringify(v && { works: v.works, seat: v.seat, signedIn: v.signedIn, said: v.said, refused: v.refused }) + "; service calls " + calls.join(", "));
      }
      return page.evaluate(() => window.E_HOST.signinState());
    },
    close() {
      try { server.close(); } catch { /* closed */ }
      try { server.closeAllConnections(); } catch { /* closed */ }
    },
  };
}
