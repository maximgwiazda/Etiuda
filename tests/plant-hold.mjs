/* A mark left while a tracked file is planted in place. Written and fsynced before the first
   changed byte, and removed only once that file's sha256 is the one the mark names. The test
   chain runs this file first, and the pre-commit hook refuses on the same mark.
   The same run records the sha256 of every tracked file under .plant-hold, which is gitignored.
   The chain's last step compares that record and names any file whose sha256 changed.
   Also guards tracked files: with no hold mark, a tracked file holding fewer plant:<tag> markers
   than its blob at HEAD is refused (--guard). */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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

export function countPlantMarkers(text) {
  const counts = new Map();
  if (typeof text !== "string") return counts;
  const re = /plant:([a-zA-Z0-9_-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tag = m[1];
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return counts;
}

function gitRefuse(cmd, res) {
  const errText = (res.stderr ? String(res.stderr) : "") ||
    (res.error ? String(res.error.message) : "") ||
    ("exit " + res.status);
  const firstLine = errText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || "unknown error";
  console.error(`${cmd}: ${firstLine}`);
  process.exit(78);
}

export function checkPlantMarkers(root) {
  /* A folder that is not a git tree (a history-less export, where a review runs npm test) has no HEAD to compare against:
     it passes, and says so. Inside a git tree, any git failure refuses with 78 (the test architect's C1 and C2). */
  if (!fs.existsSync(path.join(root, ".git"))) {
    process.stdout.write("plant-guard: markers not checked: " + root + " is not a git tree\n"); /* plant:guard-no-git */
    return [];
  }
  const headCmd = `git -C ${root} rev-parse --verify HEAD`;
  const headCheck = spawnSync("git", ["-C", root, "rev-parse", "--verify", "HEAD"], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (headCheck.status !== 0) {
    gitRefuse(headCmd, headCheck);
  }

  const grepCmd = `git -C ${root} -c core.quotePath=false grep -lz plant: HEAD --`;
  const grepRes = spawnSync("git", ["-C", root, "-c", "core.quotePath=false", "grep", "-lz", "plant:", "HEAD", "--"], {
    windowsHide: true,
    maxBuffer: 32 << 20,
  });
  if (grepRes.status === 1) return [];
  if (grepRes.status !== 0) {
    gitRefuse(grepCmd, grepRes);
  }

  const filesAtHead = [];
  for (const raw of splitZero(grepRes.stdout)) {
    if (!raw) continue;
    let rel = raw;
    if (rel.startsWith("HEAD:")) rel = rel.slice(5);
    const norm = normalRel(rel);
    if (relOk(norm)) filesAtHead.push(norm);
  }

  if (filesAtHead.length === 0) return [];

  const catCmd = `git -C ${root} cat-file --batch`;
  const catInput = filesAtHead.map(f => "HEAD:" + f).join("\n") + "\n";
  const catRes = spawnSync("git", ["-C", root, "cat-file", "--batch"], {
    input: catInput,
    windowsHide: true,
    maxBuffer: 64 << 20,
  });

  if (catRes.status !== 0) {
    gitRefuse(catCmd, catRes);
  }

  const buf = catRes.stdout;
  let offset = 0;
  const violations = [];

  for (const rel of filesAtHead) {
    const newlineIdx = buf.indexOf(10, offset);
    if (newlineIdx === -1) break;
    const header = buf.subarray(offset, newlineIdx).toString("utf8");
    if (header.endsWith("missing")) {
      offset = newlineIdx + 1;
      continue;
    }
    const parts = header.split(" ");
    const size = parseInt(parts[2], 10);
    const contentStart = newlineIdx + 1;
    const contentEnd = contentStart + size;
    const headText = buf.subarray(contentStart, contentEnd).toString("utf8");
    offset = contentEnd + 1;

    const headCounts = countPlantMarkers(headText);

    let diskText = "";
    try {
      diskText = fs.readFileSync(path.join(root, rel), "utf8");
    } catch (e) {
      diskText = "";
    }
    const diskCounts = countPlantMarkers(diskText);

    const missing = [];
    for (const [tag, count] of headCounts) {
      const onDisk = diskCounts.get(tag) || 0;
      if (onDisk < count) {
        missing.push("plant:" + tag);
      }
    }
    if (missing.length > 0) {
      violations.push({ file: rel, missing });
    }
  }

  return violations;
}

export function plantMarkerReport(violations) {
  const lines = ["etiuda plant-guard: a tracked file holds fewer plant markers than HEAD; refused."];
  for (const v of violations) {
    lines.push("  file: " + v.file);
    lines.push("  missing tags: " + v.missing.join(", "));
    lines.push("  restore: git checkout -- " + v.file);
  }
  return lines.join("\n");
}

function parseRootArg() {
  const i = process.argv.indexOf("--root");
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  return ROOT;
}

function modeOf() {
  if (process.argv.indexOf("--guard") >= 0) return "guard";
  if (process.argv.indexOf("--self") >= 0 || process.argv.indexOf("--selftest") >= 0) return "self";
  return "default";
}

export function runSelftest() {
  let asserted = 0, failed = 0;
  function check(cond, line) {
    asserted++;
    if (cond) process.stdout.write("  ok   " + line + "\n");
    else {
      failed++;
      process.stderr.write("  FAIL " + line + "\n");
    }
  }

  const lab = fs.mkdtempSync(path.join(os.tmpdir(), "plant-guard-selftest-"));
  const selfScript = fileURLToPath(import.meta.url);
  try {
    spawnSync("git", ["init", "-b", "main"], { cwd: lab, windowsHide: true });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: lab, windowsHide: true });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: lab, windowsHide: true });

    const sampleRel = "sample.js";
    const sampleAbs = path.join(lab, sampleRel);
    const originalContent = "// plant:test-marker\nconst x = 1;\n";
    fs.writeFileSync(sampleAbs, originalContent);
    spawnSync("git", ["add", sampleRel], { cwd: lab, windowsHide: true });
    spawnSync("git", ["commit", "-m", "init"], { cwd: lab, windowsHide: true });

    // Check 1: clean HEAD has no violations
    const v1 = checkPlantMarkers(lab);
    check(v1.length === 0, "clean repository has no missing plant markers");

    // Check 2: lifted line with no hold mark is refused
    fs.writeFileSync(sampleAbs, "const x = 1;\n");
    const v2 = checkPlantMarkers(lab);
    check(v2.length === 1 && v2[0].file === sampleRel && v2[0].missing.includes("plant:test-marker"),
      "lifted plant marker with no mark is refused with file and missing tag");

    const report = plantMarkerReport(v2);
    check(report.includes(sampleRel) && report.includes("plant:test-marker") && report.includes("git checkout -- " + sampleRel),
      "refusal report names the file, missing tag, and git checkout restore command");

    // Check 3: line restored via git checkout goes green
    spawnSync("git", ["checkout", "--", sampleRel], { cwd: lab, windowsHide: true });
    const v3 = checkPlantMarkers(lab);
    check(v3.length === 0, "restoring marker via git checkout makes check clean again");

    // Check 4: countPlantMarkers handles multiple tags
    const multi = countPlantMarkers("// plant:alpha\n// plant:beta\n// plant:alpha\n");
    check(multi.get("alpha") === 2 && multi.get("beta") === 1,
      "countPlantMarkers correctly tallies counts for multiple tags");

    // Check 5: committing a removed plant does not trip the check
    fs.writeFileSync(sampleAbs, "const x = 2;\n");
    spawnSync("git", ["add", sampleRel], { cwd: lab, windowsHide: true });
    spawnSync("git", ["commit", "-m", "remove plant deliberately"], { cwd: lab, windowsHide: true });
    const v5 = checkPlantMarkers(lab);
    check(v5.length === 0, "deliberately removed and committed plant does not trip check");

    // Check 6: restore initial commit with plant marker to test CLI invocation
    spawnSync("git", ["reset", "--hard", "HEAD~1"], { cwd: lab, windowsHide: true });

    // CLI test: --guard clean exits 0
    const cliClean = spawnSync(process.execPath, [selfScript, "--guard", "--root", lab], {
      windowsHide: true,
      encoding: "utf8",
    });
    check(cliClean.status === 0, "CLI --guard on clean repository exits 0");

    // CLI test: --guard with lifted line exits 1, prints refusal naming file and tag
    fs.writeFileSync(sampleAbs, "const x = 1;\n");
    const cliRefused = spawnSync(process.execPath, [selfScript, "--guard", "--root", lab], {
      windowsHide: true,
      encoding: "utf8",
    });
    check(cliRefused.status === 1 &&
      cliRefused.stderr.includes(sampleRel) &&
      cliRefused.stderr.includes("plant:test-marker") &&
      cliRefused.stderr.includes("git checkout -- " + sampleRel),
      "CLI --guard with lifted marker exits 1, naming file, missing tag, and git checkout");

    // CLI test: restoring marker makes CLI --guard exit 0
    spawnSync("git", ["checkout", "--", sampleRel], { cwd: lab, windowsHide: true });
    const cliRestored = spawnSync(process.execPath, [selfScript, "--guard", "--root", lab], {
      windowsHide: true,
      encoding: "utf8",
    });
    check(cliRestored.status === 0, "CLI --guard with marker restored exits 0");

    // Check 7: holdPlant behavior and hold mark refusal under --guard
    const hold = holdPlant(lab, sampleAbs);
    const holds = listHolds(lab);
    check(holds.length === 1 && holds[0].file === sampleRel, "holdPlant leaves mark listed in listHolds");

    const cliHeld = spawnSync(process.execPath, [selfScript, "--guard", "--root", lab], {
      windowsHide: true,
      encoding: "utf8",
    });
    check(cliHeld.status === 1 && cliHeld.stderr.includes("a plant is held, so this is refused"),
      "CLI --guard with hold mark present exits 1 with hold report");

    // Check 8: release restores clean state
    const released = hold.release();
    check(released === true && listHolds(lab).length === 0, "hold.release() removes mark when content matches");

    const cliAfterRelease = spawnSync(process.execPath, [selfScript, "--guard", "--root", lab], {
      windowsHide: true,
      encoding: "utf8",
    });
    check(cliAfterRelease.status === 0, "CLI --guard after hold mark release exits 0");

    // Check 9: recordTree and compareTree lifecycle in lab
    const recCount = recordTree(lab);
    check(recCount === 1, "recordTree records 1 tracked file in lab repo");
    const cmpClean = compareTree(lab);
    check(cmpClean.ok === true, "compareTree on unchanged tree reports ok");

    // Check 10: a root that is not a git tree passes, and says the markers were not checked
    const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), "plant-guard-notgit-"));
    try {
      fs.writeFileSync(path.join(plainDir, "sample.js"), "// plant:test-marker\n");
      const cliNotGit = spawnSync(process.execPath, [selfScript, "--guard", "--root", plainDir], {
        windowsHide: true,
        encoding: "utf8",
      });
      const notGitOut = (cliNotGit.stderr || "") + (cliNotGit.stdout || "");
      check(cliNotGit.status === 0 && /markers not checked: .* is not a git tree/.test(notGitOut),
        "a root that is not a git tree passes and says the markers were not checked: exit " + cliNotGit.status);
    } finally {
      fs.rmSync(plainDir, { recursive: true, force: true });
    }

    // Check 11: a git repository with no commit refuses with 78, naming the git command
    const noCommit = fs.mkdtempSync(path.join(os.tmpdir(), "plant-guard-nocommit-"));
    try {
      spawnSync("git", ["init", "-q", "-b", "main"], { cwd: noCommit, windowsHide: true });
      fs.writeFileSync(path.join(noCommit, "sample.js"), "// plant:test-marker\n");
      const cliNoCommit = spawnSync(process.execPath, [selfScript, "--guard", "--root", noCommit], {
        windowsHide: true,
        encoding: "utf8",
      });
      const noCommitOut = (cliNoCommit.stderr || "") + (cliNoCommit.stdout || "");
      check(cliNoCommit.status === 78 && noCommitOut.includes("rev-parse"),
        "a git repository with no commit refuses with 78 naming the git command: exit " + cliNoCommit.status);
    } finally {
      fs.rmSync(noCommit, { recursive: true, force: true });
    }

  } finally {
    fs.rmSync(lab, { recursive: true, force: true });
  }

  process.stdout.write("#counts checks=" + asserted + " failed=" + failed + "\n");
  return failed === 0;
}

function main() {
  const mode = modeOf();
  if (mode === "self") {
    const ok = runSelftest();
    process.exit(ok ? 0 : 1);
  }

  const root = parseRootArg() || ROOT;
  const holds = listHolds(root);
  if (holds.length) {
    console.error(holdReport(holds));
    process.exit(1);
  }
  const violations = checkPlantMarkers(root);
  if (violations.length) {
    console.error(plantMarkerReport(violations));
    process.exit(1);
  }
  if (mode === "guard") {
    process.exit(0);
  }
  try {
    const n = recordTree(root);
    process.stdout.write("ok plant-record: recorded " + n + " tracked files\n");
  } catch (e) {
    console.error((e && e.message) || e);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
