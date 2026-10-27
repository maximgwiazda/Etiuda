/* The last step of the node chain. It compares the tracked sha256 record written by
   tests/plant-hold.mjs at the start of this run, and names every file that changed. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareTree } from "./plant-hold.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = compareTree(ROOT);
const stream = result.ok ? process.stdout : process.stderr;
for (const line of result.lines) stream.write(line + "\n");
process.exit(result.ok ? 0 : 1);
