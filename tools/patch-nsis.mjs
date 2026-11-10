import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cjs = require('./patch-nsis.cjs');
export const { getPaths, verifyNsisPatches, applyNsisPatches } = cjs;
export default cjs;
