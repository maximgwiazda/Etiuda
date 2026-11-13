/* THE TEST SERVICE BUILD UNDER THE TEST IDENTITY, for tools/runner/installer-legs.mjs's ts-cycle leg alone.
 *   electron-builder --win --config tools/runner/test-service-qa.cjs      (ETIUDA_PACK_TEST_SERVICE naming a lab file)
 *
 * tools/test-identity.cjs refuses a base whose product name is not the shipped one, and the Test Service config renames it, so the
 * two cannot be stacked the way electron-builder.js stacks them (the Test Service inside, the identity outside). Here the order is
 * the other way: electron-builder-test.cjs is loaded with the variable unset, so its base is the ordinary test build, and the Test
 * Service config of tools/test-service.cjs is put on top of it. The result differs from the ordinary test build exactly as the
 * shipped Test Service build differs from the shipped one: the product name with " Test Service", the same program file name, the
 * same package name and so the same user-data folder, the fields inside the asar, the installer's name and shortcut. */
"use strict";
const path = require("node:path");

const VAR = "ETIUDA_PACK_TEST_SERVICE";
const lab = process.env[VAR];
if (!lab) throw new Error("tools/runner/test-service-qa.cjs: " + VAR + " names no lab file, so this would be the ordinary test build");
delete process.env[VAR];
let base;
try { base = require("../electron-builder-test.cjs"); } finally { process.env[VAR] = lab; }
module.exports = require("../test-service.cjs").testServiceConfig(base, process.env, path.join(__dirname, "..", ".."));
