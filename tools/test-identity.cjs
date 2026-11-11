/* THE INSTALLER TEST'S OWN IDENTITY: an install keyed by the shipped app id writes, and its uninstall removes, the
 * account's own uninstall entry, shortcuts and .ec class, whatever folder it went into. The test build differs in app id
 * and GUID, product, shortcut and file names, user-data name, .ec extension and class, and etiuda: scheme.
 *   node tools/package.mjs --test-identity     (electron-builder --win --config tools/electron-builder-test.cjs)
 * The same file is in the desk's tree and Studio's, so each tree's legs refuse while either shipped app is present. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

/* The shipped apps, as their electron-builder.js names them. testConfig refuses a base that disagrees, so a rename
   there cannot leave the guard watching names nothing installs. */
const SHIPPED = Object.freeze({
  desk: Object.freeze({ appId: "app.etiuda.desktop", productName: "Etiuda", packageName: "etiuda",
    ext: "ec", catalogClass: "Etiuda catalog", scheme: "etiuda" }),
  studio: Object.freeze({ appId: "app.etiuda.studio", productName: "Etiuda Studio", packageName: "etiuda-studio" }),
});
/* The test builds. Every name differs from every shipped one, so nothing a test install writes, and nothing its
   uninstall removes, is keyed by a shipped name. */
const TEST = Object.freeze({
  desk: Object.freeze({ appId: "app.etiuda.desktop.qa", productName: "Etiuda QA", packageName: "etiuda-qa",
    ext: "ecqa", catalogClass: "Etiuda QA catalog", scheme: "etiuda-qa" }),
  studio: Object.freeze({ appId: "app.etiuda.studio.qa", productName: "Etiuda Studio QA", packageName: "etiuda-studio-qa" }),
});

/* The test build's app id, written into the description, which electron-builder stamps into the setup's version
   resource: the one place a built setup.exe names its identity without being run or unpacked. */
const markOf = appId => "[test build " + appId + "]";
const markIn = text => { const m = /\[test build ([A-Za-z0-9.-]+)\]/.exec(String(text || "")); return m ? m[1] : ""; };

/* Every shipped name the test config could still carry; [] when none. */
function shippedLeft(cfg) {
  const names = new Set(), ids = new Set(), exts = new Set();
  for (const s of Object.values(SHIPPED)) {
    ids.add(s.appId);
    for (const n of [s.productName, s.packageName, s.catalogClass, s.scheme]) if (n) names.add(n.toLowerCase());
    if (s.ext) exts.add(s.ext.toLowerCase());
  }
  const n = cfg.nsis || {}, meta = cfg.extraMetadata || {};
  const left = [];
  if (ids.has(cfg.appId)) left.push("appId " + cfg.appId);
  for (const [what, v] of [["productName", cfg.productName], ["extraMetadata.name", meta.name],
    ["nsis.shortcutName", n.shortcutName], ["nsis.uninstallDisplayName", n.uninstallDisplayName]])
    if (!v || names.has(String(v).toLowerCase())) left.push(what + " " + JSON.stringify(v || null));
  for (const a of cfg.fileAssociations || []) {
    if (exts.has(String(a.ext).toLowerCase())) left.push("fileAssociations ext " + a.ext);
    if (names.has(String(a.name).toLowerCase())) left.push("fileAssociations name " + a.name);
  }
  if (markIn(meta.description) !== cfg.appId) left.push("the description carries no mark of " + cfg.appId);
  return left;
}

/* An installer script with the shipped names it spells out renamed to the test build's: the desk's class and scheme,
   and either app's profile folder. The same script, so the test install still writes and removes them, under names no
   shipped install uses; `left` is every line still naming a shipped one. */
const CLASS_RE = /(Software\\Classes\\)Etiuda catalog(?=["\\])/gi;
const LINK_RE = /(Software\\Classes\\)etiuda(?=["\\])/gi;
const URL_RE = /"URL:etiuda"/gi;
const PROFILE_RE = new RegExp("(\\$(?:LOCAL)?APPDATA\\\\)(" + Object.values(SHIPPED).map(s => s.packageName).join("|") + ")(?=[\"\\\\])", "gi");
const LEFT_RE = new RegExp("Classes\\\\(etiuda[\"\\\\]|etiuda catalog[\"\\\\]|\\.ec[\"\\\\])|\"URL:etiuda\"|\\$(LOCAL)?APPDATA\\\\("
  + Object.values(SHIPPED).map(s => s.packageName).join("|") + ")[\"\\\\]", "i");
function ownNamesNsh(text) {
  const t = TEST.desk;
  const count = re => (String(text).match(re) || []).length;
  const counts = { klass: count(CLASS_RE), link: count(LINK_RE), url: count(URL_RE), profile: count(PROFILE_RE) };
  const testOf = name => Object.keys(SHIPPED).map(k => [SHIPPED[k].packageName, TEST[k].packageName]).find(p => p[0] === name.toLowerCase())[1];
  const out = String(text).replace(CLASS_RE, "$1" + t.catalogClass).replace(LINK_RE, "$1" + t.scheme)
    .replace(URL_RE, "\"URL:" + t.scheme + "\"").replace(PROFILE_RE, (m, at, name) => at + testOf(name));
  const left = out.split(/\r?\n/).filter(l => LEFT_RE.test(l));
  return { text: out, counts, left };
}

/** electron-builder.js's config `base`, as the test build of `app` ("desk" or "studio"); `root` is the tree. Throws,
 *  building nothing, where the base is not the shipped app the table knows or a shipped name would survive. */
function testConfig(base, app, root) {
  const s = SHIPPED[app], t = TEST[app];
  if (!s || !t) throw new Error("test identity: no app " + JSON.stringify(app));
  if (base.appId !== s.appId || base.productName !== s.productName)
    throw new Error("test identity: electron-builder.js names " + base.appId + " / " + base.productName
      + " where tools/test-identity.cjs knows " + s.appId + " / " + s.productName + "; no test build is made from a stale table");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const assoc = (base.fileAssociations || []).map(a => {
    if (!s.ext || String(a.ext).toLowerCase() !== s.ext) throw new Error("test identity: an association of ." + a.ext + " is not one the table renames");
    return Object.assign({}, a, { ext: t.ext, name: t.catalogClass, description: t.catalogClass });
  });
  const cfg = Object.assign({}, base, {
    appId: t.appId,
    productName: t.productName,
    extraMetadata: Object.assign({}, base.extraMetadata, { name: t.packageName,
      description: String(pkg.description || "") + " " + markOf(t.appId), etiudaTestBuild: t.appId }),
    fileAssociations: assoc,
    nsis: Object.assign({}, base.nsis, { shortcutName: t.productName, uninstallDisplayName: t.productName,
      artifactName: t.packageName + "-${version}-setup.${ext}" }),
  });
  /* The installer script is renamed into the output folder before packing, and the build refuses one still naming a
     shipped class, scheme or profile folder. */
  if (!base.nsis || !base.nsis.include) throw new Error("test identity: electron-builder.js names no nsis.include to rename");
  const from = path.join(root, (base.directories && base.directories.buildResources) || "build", base.nsis.include);
  const to = path.join(path.resolve(root, (base.directories && base.directories.output) || "dist"), ".test-identity", path.basename(base.nsis.include));
  cfg.nsis.include = to;
  cfg.beforePack = async context => {
    const own = ownNamesNsh(fs.readFileSync(from, "utf8"));
    if (own.left.length) throw new Error("test identity: " + from + " still names a shipped name after renaming: " + own.left.join(" | "));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, own.text);
    if (typeof base.beforePack === "function") return base.beforePack(context);
  };
  const left = shippedLeft(cfg);
  if (left.length) throw new Error("test identity: the test build would still carry " + left.join(", "));
  return cfg;
}

module.exports = { SHIPPED, TEST, markOf, markIn, shippedLeft, ownNamesNsh, testConfig };
