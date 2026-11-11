/* The installer legs' build: electron-builder.js under the test identity of tools/test-identity.cjs.
 *   electron-builder --win --config tools/electron-builder-test.cjs      (from the tree's root) */
"use strict";
const path = require("node:path");
module.exports = require("./test-identity.cjs").testConfig(require("../electron-builder.js"), "desk", path.join(__dirname, ".."));
