/* First-opening sign-in screen: gate, memory, boot order, UI and plants.
 *
 *   node tests/desk-first-signin.mjs    exit code is the number of failed checks, capped at 63
 */
process.removeAllListeners("warning");
process.on("warning", () => {});

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let asserted = 0, failed = 0;
function check(ok, line) {
  asserted++;
  if (ok) console.log("  ok   " + line);
  else { failed++; console.log("  FAIL " + line); }
}

const P = await import(pathToFileURL(path.join(ROOT, "src", "modules", "signin.js")).href);
const S = await import(pathToFileURL(path.join(ROOT, "src", "modules", "storage.js")).href);

/* Part 1: the gate and the memory */
check(typeof P.firstSigninDue === "function" && typeof P.firstSigninSeen === "function" && typeof P.markFirstSigninSeen === "function",
  "fs1a gate and memory functions are exported");
check(typeof P.FIRST_SIGNIN_KEY === "string" && /^e(?:[A-Z]|[0-9a-z]+~)/.test(P.FIRST_SIGNIN_KEY),
  "fs1b stored mark key follows desk storage key shape");

if (typeof P.firstSigninDue === "function") {
  const due = { offered: ["microsoft"], signedIn: "" };
  check(P.firstSigninDue(due, { seen: false, policy: false }) === true,
    "fs1c due when provider offered, signed out, unseen and not a policy desk");
  check(P.firstSigninDue({ offered: ["microsoft", "google"] }, { seen: false, policy: false }) === true,
    "fs1d due with both providers offered");
  check(P.firstSigninDue({ offered: [] }, { seen: false, policy: false }) === false
    && P.firstSigninDue(null, { seen: false, policy: false }) === false
    && P.firstSigninDue({ offered: ["unknown"] }, { seen: false, policy: false }) === false,
    "fs1e not due when no known provider is offered");
  check(P.firstSigninDue({ offered: ["microsoft"], signedIn: "microsoft" }, { seen: false, policy: false }) === false,
    "fs1f not due when already signed in");
  check(P.firstSigninDue(due, { seen: true, policy: false }) === false,
    "fs1g not due when already shown on this desk");
  check(P.firstSigninDue(due, { seen: false, policy: true }) === false,
    "fs1h not due on a policy desk");

  if (typeof P.firstSigninSeen === "function" && typeof P.markFirstSigninSeen === "function" && typeof P.FIRST_SIGNIN_KEY === "string") {
    check(P.firstSigninSeen() === false && P.firstSigninDue(due, { policy: false }) === true,
      "fs1i unseen desk starts unmarked and due");
    P.markFirstSigninSeen();
    check(P.firstSigninSeen() === true && S.lsGet(P.FIRST_SIGNIN_KEY) === "1" && P.firstSigninDue(due, { policy: false }) === false,
      "fs1j markFirstSigninSeen persists mark and closes the gate");
    S.lsDel(P.FIRST_SIGNIN_KEY);
    globalThis.window = { E_HOST: { catalogFolderPolicy: "C:\\Policy\\Team" } };
    check(P.firstSigninDue(due) === false,
      "fs1k default policy check reads eCatalogFolderPinned from E_HOST.catalogFolderPolicy");
    delete globalThis.window;
  }
}

console.log("\n" + asserted + " checks, " + failed + " failed");
process.exit(Math.min(63, failed));
