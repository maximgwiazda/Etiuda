/* A mark left while a tracked file is planted in place. Written and fsynced before the first
   changed byte, and removed only once that file's sha256 is the one the mark names. The test
   chain runs this file first, and the pre-commit hook refuses on the same mark. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function holdDir(root) {
  return path.join(root, ".plant-hold");
}

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function parseHold(text) {
  const out = {};
  for (const line of String(text).split("\n")) {
    const i = line.indexOf("=");
    if (i < 1) continue;
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  if (!out.file || !/^[0-9a-f]{64}$/.test(out.sha256 || "") || !out.backup) return null;
  return out;
}

export function listHolds(root) {
  const dir = holdDir(root);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    if (e && e.code === "ENOENT") return [];
    throw e;
  }
  const holds = [];
  for (const name of names) {
    if (!name.endsWith(".hold")) continue;
    const mark = ".plant-hold/" + name;
    let text = "";
    try {
      text = fs.readFileSync(path.join(dir, name), "utf8");
    } catch (e) {
      holds.push({ mark, broken: true });
      continue;
    }
    const parsed = parseHold(text);
    if (!parsed) holds.push({ mark, broken: true });
    else holds.push({ mark, file: parsed.file, sha256: parsed.sha256, backup: parsed.backup, broken: false });
  }
  return holds;
}

export function holdReport(holds) {
  const lines = ["etiuda plant-hold: a plant is held, so this is refused."];
  for (const h of holds) {
    if (h.broken) {
      lines.push("  mark " + h.mark + " could not be read.");
      lines.push("  Restore any backup beside it, check the sha256, then remove the mark and the backup.");
    } else {
      lines.push("  file " + h.file);
      lines.push("  sha256 " + h.sha256);
      lines.push("  backup " + h.backup);
      lines.push("  Restore the file from the backup, check the sha256, then remove the mark and the backup.");
    }
  }
  return lines.join("\n");
}

function fsyncFile(file) {
  const fd = fs.openSync(file, "r+");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/* The backup and the mark are on disk, the mark fsynced, before this returns. release removes
   both only when the file's sha256 is the one recorded. */
export function holdPlant(root, fileAbs) {
  const rel = path.relative(root, fileAbs).split("\\").join("/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("plant hold: the file is outside the tree");
  const bytes = fs.readFileSync(fileAbs);
  const sha = sha256(bytes);
  const dir = holdDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomBytes(8).toString("hex");
  const backupAbs = path.join(dir, id + ".bak");
  const markAbs = path.join(dir, id + ".hold");
  const backupRel = ".plant-hold/" + id + ".bak";
  fs.writeFileSync(backupAbs, bytes);
  fsyncFile(backupAbs);
  const fd = fs.openSync(markAbs, "w");
  try {
    fs.writeSync(fd, "file=" + rel + "\nsha256=" + sha + "\nbackup=" + backupRel + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return {
    file: rel,
    sha256: sha,
    backup: backupRel,
    mark: ".plant-hold/" + id + ".hold",
    release() {
      let now;
      try {
        now = sha256(fs.readFileSync(fileAbs));
      } catch (e) {
        return false;
      }
      if (now !== sha) return false;
      fs.unlinkSync(markAbs);
      fs.unlinkSync(backupAbs);
      return true;
    },
  };
}

function main() {
  const holds = listHolds(ROOT);
  if (!holds.length) process.exit(0);
  console.error(holdReport(holds));
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
