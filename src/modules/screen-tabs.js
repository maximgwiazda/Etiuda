/* The desk's one mechanism for named tabs (boards 965, 967, 969).
 * Screen tabs sit beside conversations in the band's strip.
 * screens holds string IDs; screenOn holds active screen ID.
 * body.screen-on reveals #screenHost and suppresses conversation shortcuts.
 * eSessionTabs and the sealed tab payload hold conversations only. */

const REGISTRY = {};

export const screens = [];
export let screenOn = "";
let prevTabId = null;
let _throwForTest = false;

let onScreenChange = null;
let onScreenReturn = null;

export function _setThrowForTest(v) {
  _throwForTest = Boolean(v);
}

export function registerScreen(id, def) {
  REGISTRY[id] = def;
}

export function getScreenDef(id) {
  return REGISTRY[id] || null;
}

export function wireScreenTabsChange(fn) {
  onScreenChange = fn;
}

export function wireScreenTabsReturn(fn) {
  onScreenReturn = fn;
}

export function setPrevTabId(id) {
  if (id && !screens.includes(id)) prevTabId = id;
}

export function isScreenOn() {
  return Boolean(screenOn);
}

export function openScreenTab(id) {
  if (_throwForTest) throw new Error("screen tabs throw simulation");
  if (!screens.includes(id)) {
    screens.push(id);
  }
  frontScreenTab(id);
}

export function frontScreenTab(id) {
  screenOn = id;
  if (typeof document !== "undefined" && document.body && document.body.classList) {
    document.body.classList.add("screen-on");
  }
  renderScreenHost(id);
  if (onScreenChange) onScreenChange();
}

export function closeScreenTab(id) {
  const idx = screens.indexOf(id);
  if (idx >= 0) screens.splice(idx, 1);
  if (screenOn === id) {
    screenOn = "";
    if (typeof document !== "undefined" && document.body && document.body.classList) {
      document.body.classList.remove("screen-on");
    }
    const sh = typeof document !== "undefined" ? document.getElementById("screenHost") : null;
    if (sh) {
      sh.innerHTML = "";
      sh.hidden = true;
    }
    if (onScreenReturn) onScreenReturn(prevTabId);
  }
  if (onScreenChange) onScreenChange();
}

export function dropScreenTab(id) {
  const idx = screens.indexOf(id);
  if (idx >= 0) screens.splice(idx, 1);
  if (screenOn === id) {
    screenOn = "";
    if (typeof document !== "undefined" && document.body && document.body.classList) {
      document.body.classList.remove("screen-on");
    }
    const sh = typeof document !== "undefined" ? document.getElementById("screenHost") : null;
    if (sh) {
      sh.innerHTML = "";
      sh.hidden = true;
    }
  }
}

export function clearScreenOn(returnTab = true) {
  const wasScreen = Boolean(screenOn);
  screenOn = "";
  if (typeof document !== "undefined" && document.body && document.body.classList) {
    document.body.classList.remove("screen-on");
  }
  const sh = typeof document !== "undefined" ? document.getElementById("screenHost") : null;
  if (sh) {
    sh.innerHTML = "";
    sh.hidden = true;
  }
  if (wasScreen && returnTab && onScreenReturn) onScreenReturn(prevTabId);
  if (onScreenChange) onScreenChange();
}

function renderScreenHost(id) {
  const sh = typeof document !== "undefined" ? document.getElementById("screenHost") : null;
  if (!sh) return;
  sh.hidden = false;
  const def = REGISTRY[id];
  if (def && typeof def.render === "function") {
    def.render(sh, () => closeScreenTab(id));
  }
}
