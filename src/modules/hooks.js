/* THE ONE-WAY VALVE. A low module that calls an app-level action has to import it, and that
   import is what closes the load cycle; so the action is registered here at boot instead and
   called through `hooks`. This file imports nothing, so it can never join a ring.
   SLOTS is the contract: everything the lower layer may call upwards, in one list. wireHooks
   refuses an unknown slot, refuses to leave one empty, and freezes, so a mistyped call is a
   TypeError rather than the silent no-op the split guard exists to prevent. */
const SLOTS = [
  "runShortcut",
  "syncSampleMark",
  "sampleReady",
  "loadSampleCatalog",
  "importCatalogHere",
  "openManage",
  "mgCardsIn",
  "openCategoryEditor",
  "openIntentEditor",
  "segFolded",
  "applyLangUI",
];

const hooks = Object.create(null);

function wireHooks(map){
  const known = new Set(SLOTS);
  for(const k of Object.keys(map)){
    if(!known.has(k)) throw new Error("hooks: no slot named "+k);
    hooks[k] = map[k];
  }
  for(const k of SLOTS) if(typeof hooks[k]!=="function") throw new Error("hooks: slot not wired: "+k);
  Object.freeze(hooks);
}

export {
  hooks,
  wireHooks
};
