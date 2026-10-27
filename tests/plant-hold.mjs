/* A mark left while a tracked file is planted in place. Written and fsynced before the first
   changed byte, and removed only once that file's sha256 is the one the mark names. The test
   chain runs this file first, and the pre-commit hook refuses on the same mark.
   The same run records the sha256 of every tracked file under .plant-hold, which is gitignored.
   The chain's last step compares that record and names any file whose sha256 changed. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

/* One record for the run, fsynced before this returns. It is not a tracked path. Hold writes a
   one-time id; the compare spends that id and will not judge it again. */
const RECORD_NAME = "tree.record";

function recordFile(root) {
  return path.join(holdDir(root), RECORD_NAME);
}

function splitZero(buf) {
  const out = [];
  if (!buf || !buf.length) return out;
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0) {
      if (i > start) out.push(buf.toString("utf8", start, i));
      start = i + 1;
    }
  }
  return out;
}

function normalRel(rel) {
  return String(rel).split("\\").join("/");
}

function relOk(rel) {
  if (!rel || rel.startsWith("/") || rel.startsWith("\\")) return false;
  const parts = rel.split("/");
  for (const p of parts) if (!p || p === "." || p === "..") return false;
  return true;
}

/* A checkout lists what git tracks. An archive of that tree has no .git, so the files on disk
   are the tracked set, minus the record directory and a junction to dependencies. */
function listTracked(root) {
  if (!fs.existsSync(path.join(root, ".git"))) return { mode: "walk", paths: walkFiles(root) };
  const listed = spawnSync("git", ["-C", root, "-c", "core.quotePath=false", "ls-files", "-z"], {
    windowsHide: true,
    maxBuffer: 32 << 20,
  });
  if (listed.status !== 0) throw new Error("plant record: the tracked list could not be read");
  const paths = [];
  for (const rel of splitZero(listed.stdout)) {
    const norm = normalRel(rel);
    if (!relOk(norm)) throw new Error("plant record: the tracked list could not be read");
    paths.push(norm);
  }
  return { mode: "git", paths };
}

function walkFiles(root) {
  const out = [];
  const skip = new Set(["node_modules", ".plant-hold", ".git"]);
  function walk(curr, rel) {
    for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) continue;
      if (skip.has(ent.name)) continue;
      const next = rel ? rel + "/" + ent.name : ent.name;
      if (ent.isDirectory()) {
        walk(path.join(curr, ent.name), next);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!relOk(next)) throw new Error("plant record: the tracked list could not be read");
      out.push(next);
    }
  }
  walk(root, "");
  return out;
}

function hashTracked(root, rel) {
  try {
    return sha256(fs.readFileSync(path.join(root, rel)));
  } catch (e) {
    if (e && e.code === "ENOENT") return "missing";
    throw e;
  }
}

function serialize(rec) {
  const lines = [
    "v=2",
    (rec.spent ? "spent=" : "id=") + rec.id,
    "list=" + rec.list,
    "n=" + rec.files.length,
  ];
  for (const [rel, sha] of rec.files) lines.push(sha + "\t" + rel);
  return lines.join("\n") + "\n";
}

function writeRecord(root, rec) {
  const dir = holdDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const dest = recordFile(root);
  const tmp = path.join(dir, "tree.record.tmp");
  fs.writeFileSync(tmp, serialize(rec));
  fsyncFile(tmp);
  try {
    fs.unlinkSync(dest);
  } catch (e) {
    if (!e || e.code !== "ENOENT") throw e;
  }
  fs.renameSync(tmp, dest);
  fsyncFile(dest);
}

export function recordTree(root) {
  const listed = listTracked(root);
  const seen = new Set();
  const files = [];
  for (const rel of listed.paths) {
    if (seen.has(rel)) throw new Error("plant record: the tracked list could not be read");
    seen.add(rel);
    files.push([rel, hashTracked(root, rel)]);
  }
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  writeRecord(root, {
    id: crypto.randomBytes(16).toString("hex"),
    spent: false,
    list: listed.mode,
    files,
  });
  return files.length;
}

function parseRecord(text) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines[0] === "v=1") return { stale: true };
  if (lines.length < 4) return null;
  if (lines[0] !== "v=2") return null;
  const token = /^(id|spent)=([0-9a-f]{32})$/.exec(lines[1]);
  const list = /^list=(git|walk)$/.exec(lines[2]);
  const n = /^n=(\d+)$/.exec(lines[3]);
  if (!token || !list || !n) return null;
  const count = Number(n[1]);
  const body = lines.slice(4);
  if (body.length !== count) return null;
  const files = [];
  const seen = new Set();
  for (const line of body) {
    const tab = line.indexOf("\t");
    if (tab < 1) return null;
    const sha = line.slice(0, tab);
    const rel = line.slice(tab + 1);
    if (sha !== "missing" && !/^[0-9a-f]{64}$/.test(sha)) return null;
    if (!relOk(rel) || seen.has(rel)) return null;
    seen.add(rel);
    files.push([rel, sha]);
  }
  return { id: token[2], spent: token[1] === "spent", list: list[1], files };
}

function readRecord(root) {
  let text;
  try {
    text = fs.readFileSync(recordFile(root), "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return "missing";
    return null;
  }
  return parseRecord(text);
}

function diffLines(root, oldFiles, newPaths) {
  const present = new Set();
  for (const rel0 of newPaths) present.add(normalRel(rel0));
  const lines = [];
  const known = new Set();
  for (const [rel, oldSha] of oldFiles) {
    known.add(rel);
    const neu = present.has(rel) ? hashTracked(root, rel) : "missing";
    if (neu !== oldSha) lines.push("FAIL plant-record: " + rel + " sha256 " + oldSha + " to " + neu);
  }
  for (const rel of present) {
    if (known.has(rel)) continue;
    lines.push("FAIL plant-record: " + rel + " sha256 missing to " + hashTracked(root, rel));
  }
  lines.sort();
  return lines;
}

/* A spent id, or a record listed another way, names no file. The next hold writes a fresh id. */
export function compareTree(root) {
  const loaded = readRecord(root);
  if (loaded === "missing") return { ok: false, lines: ["plant record: none for this run"] };
  if (!loaded) return { ok: false, lines: ["plant record: unreadable"] };
  if (loaded.stale || loaded.spent) return { ok: false, lines: ["plant record: not from this run"] };
  let listed;
  try {
    listed = listTracked(root);
  } catch (e) {
    return { ok: false, lines: ["plant record: the tracked list could not be read"] };
  }
  if (listed.mode !== loaded.list) return { ok: false, lines: ["plant record: not from this run"] };
  let lines;
  try {
    lines = diffLines(root, loaded.files, listed.paths);
    writeRecord(root, { id: loaded.id, spent: true, list: loaded.list, files: loaded.files });
  } catch (e) {
    return { ok: false, lines: ["plant record: unreadable"] };
  }
  if (lines.length) return { ok: false, lines };
  return { ok: true, lines: ["ok plant-record: " + loaded.files.length + " tracked files unchanged"] };
}

function main() {
  const holds = listHolds(ROOT);
  if (holds.length) {
    console.error(holdReport(holds));
    process.exit(1);
  }
  try {
    const n = recordTree(ROOT);
    process.stdout.write("ok plant-record: recorded " + n + " tracked files\n");
  } catch (e) {
    console.error((e && e.message) || e);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
