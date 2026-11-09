#!/usr/bin/env python3
"""Build the pinned model from the public weights.

Standard library only, until this has created the venv and handed the export to it.

  python3 tools/model-export/make.py --out <dir>
  python tools/model-export/make.py --out <dir>

The venv is created beside the output from tools/model-export/requirements.txt.
Each file sources.json names is fetched from Hugging Face's public resolve URL
at the pinned commit, with no account and no token, checked against that file's
sha256 before use, and resumed if a partial download is already there.
export.py then runs with --pin-match. This exits 0 only when model_q4.onnx and
model_q4.onnx_data, and the two tokenizer files, match shell/embed/core.cjs.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources.json")
REQUIREMENTS = os.path.join(HERE, "requirements.txt")
EXPORT = os.path.join(HERE, "export.py")
CORE = os.path.join(HERE, "..", "..", "shell", "embed", "core.cjs")
USAGE = "usage: python3 tools/model-export/make.py --out <dir> [--sources <file>]"
ATTEMPTS = 5
CHUNK = 1024 * 1024


def say(line):
    print(line, flush=True)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            block = handle.read(CHUNK)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def take(argv, flag):
    if flag not in argv:
        return None
    at = argv.index(flag)
    if at + 1 >= len(argv):
        return ""
    return argv[at + 1]


def parse_pin_rows(block):
    found = []
    for match in re.finditer(r'name:\s*"([^"]+)",\s*size:\s*(\d+),\s*sha256:\s*"([0-9a-f]{64})"', block):
        found.append({"name": match.group(1), "size": int(match.group(2)), "sha256": match.group(3)})
    return found


def shell_model_pin():
    """The four files the desk loads. Read here, not taken from export.py's own word."""
    with open(CORE, "r", encoding="utf-8") as handle:
        text = handle.read()
    start = text.find("q4: Object.freeze([")
    end = text.find("]),", start)
    tokenizer = text.find("const TOKENIZER = Object.freeze([")
    tokenizer_end = text.find("]);", tokenizer)
    if start < 0 or end < 0 or tokenizer < 0 or tokenizer_end < 0:
        raise RuntimeError("the shell pin could not be read")
    rows = parse_pin_rows(text[start:end]) + parse_pin_rows(text[tokenizer:tokenizer_end])
    if len(rows) != 4:
        raise RuntimeError("the shell pin did not name four files")
    return rows


def source_problems(folder, sources):
    problems = []
    for item in sources.get("files") or []:
        name = item["name"]
        at = os.path.join(folder, name.replace("/", os.sep))
        if not os.path.isfile(at):
            problems.append(name + " is absent")
            continue
        size = os.path.getsize(at)
        if size != item["size"]:
            problems.append(name + " is " + str(size) + " bytes, not " + str(item["size"]))
            continue
        got = sha256_file(at)
        if got != item["sha256"]:
            problems.append(name + " sha256 is " + got + ", not " + item["sha256"])
    return problems


def pin_problems(folder, rows):
    problems = []
    for item in rows:
        at = os.path.join(folder, item["name"])
        if not os.path.isfile(at):
            problems.append(item["name"] + " is absent")
            continue
        size = os.path.getsize(at)
        if size != item["size"]:
            problems.append(item["name"] + " is " + str(size) + " bytes, not " + str(item["size"]))
            continue
        got = sha256_file(at)
        if got != item["sha256"]:
            problems.append(item["name"] + " sha256 is " + got + ", not " + item["sha256"])
    return problems


def print_hashes(folder, rows):
    by_name = {item["name"]: item for item in rows}
    for name in ("model_q4.onnx", "model_q4.onnx_data", "tokenizer.json", "tokenizer_config.json"):
        item = by_name.get(name)
        if not item:
            continue
        at = os.path.join(folder, name)
        got = sha256_file(at) if os.path.isfile(at) else "absent"
        print(name + " " + got, flush=True)


def public_url(repo, commit, name):
    parts = [urllib.parse.quote(part) for part in name.split("/")]
    return "https://huggingface.co/" + repo + "/resolve/" + commit + "/" + "/".join(parts)


def fetch(url, dest, size, digest, label):
    """Download url to dest, resuming a sibling .part file. Refuse a finished file whose sha256 differs."""
    if os.path.isfile(dest):
        got_size = os.path.getsize(dest)
        if got_size != size:
            raise RuntimeError(label + " is " + str(got_size) + " bytes, not " + str(size))
        got = sha256_file(dest)
        if got != digest:
            raise RuntimeError(label + " sha256 is " + got + ", not " + digest)
        return
    part = dest + ".part"
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    last = None
    for attempt in range(ATTEMPTS):
        have = os.path.getsize(part) if os.path.isfile(part) else 0
        if have > size:
            os.remove(part)
            have = 0
        if have == size:
            break
        req = urllib.request.Request(url, headers={"User-Agent": "etiuda-model-export"})
        if have:
            req.add_header("Range", "bytes=%d-" % have)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                code = getattr(resp, "status", None) or resp.getcode()
                # A 200 after a Range request is the whole file again, so the partial is discarded.
                mode = "ab" if code == 206 and have else "wb"
                if mode == "wb" and have and os.path.isfile(part):
                    os.remove(part)
                    have = 0
                written = 0
                reported = have
                with open(part, mode) as out:
                    while True:
                        block = resp.read(CHUNK)
                        if not block:
                            break
                        out.write(block)
                        written += len(block)
                        if have + written - reported >= 32 * CHUNK:
                            reported = have + written
                            say("fetch: " + label + " " + str(reported) + " bytes")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            if attempt + 1 == ATTEMPTS:
                raise RuntimeError(label + " could not be fetched: " + str(exc)) from exc
            time.sleep(2)
            continue
        last = None
    if last is not None:
        raise RuntimeError(label + " could not be fetched: " + str(last))
    if not os.path.isfile(part) or os.path.getsize(part) != size:
        raise RuntimeError(label + " is incomplete")
    got = sha256_file(part)
    if got != digest:
        os.remove(part)
        raise RuntimeError(label + " sha256 is " + got + ", not " + digest)
    os.replace(part, dest)


def fetch_all(sources, folder):
    repo = sources.get("repo") or ""
    commit = sources.get("commit") or ""
    if not repo or not commit:
        raise RuntimeError("sources.json names no repo or no commit")
    os.makedirs(folder, exist_ok=True)
    for item in sources.get("files") or []:
        url = public_url(repo, commit, item["name"])
        dest = os.path.join(folder, item["name"].replace("/", os.sep))
        say("fetch: " + item["name"])
        fetch(url, dest, item["size"], item["sha256"], item["name"])
        say("fetch: " + item["name"] + " ok")
    problems = source_problems(folder, sources)
    if problems:
        raise RuntimeError(problems[0])


def beside(out_dir, suffix):
    out_dir = os.path.abspath(out_dir).rstrip("\\/")
    return os.path.join(os.path.dirname(out_dir), os.path.basename(out_dir) + suffix)


def venv_python(venv):
    if os.name == "nt":
        return os.path.join(venv, "Scripts", "python.exe")
    for name in ("python3", "python"):
        at = os.path.join(venv, "bin", name)
        if os.path.isfile(at):
            return at
    return os.path.join(venv, "bin", "python3")


def ensure_venv(venv, requirements):
    py = venv_python(venv)
    if not os.path.isfile(py):
        say("venv: create")
        subprocess.check_call([sys.executable, "-m", "venv", venv])
        py = venv_python(venv)
    marker = os.path.join(venv, "etiuda-requirements.sha256")
    digest = sha256_file(requirements)
    if os.path.isfile(marker):
        with open(marker, "r", encoding="utf-8") as handle:
            if handle.read().strip() == digest:
                say("venv: requirements unchanged")
                return py
    say("venv: install requirements")
    subprocess.check_call([py, "-m", "pip", "install", "--disable-pip-version-check", "-r", requirements])
    with open(marker, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(digest + "\n")
    return py


def build(out_dir, sources_path):
    if sys.version_info < (3, 12):
        print("make: Python 3.12 or newer is required", file=sys.stderr)
        return 1
    with open(sources_path, "r", encoding="utf-8") as handle:
        sources = json.load(handle)
    out_dir = os.path.abspath(out_dir)
    src = beside(out_dir, "-src")
    venv = beside(out_dir, "-venv")
    os.makedirs(out_dir, exist_ok=True)
    try:
        fetch_all(sources, src)
    except RuntimeError as exc:
        print("refused: " + str(exc), file=sys.stderr)
        return 1
    py = ensure_venv(venv, REQUIREMENTS)
    done = subprocess.run([py, EXPORT, "--export", src, "--out", out_dir, "--pin-match", "--sources", sources_path])
    try:
        rows = shell_model_pin()
    except RuntimeError as exc:
        print("refused: " + str(exc), file=sys.stderr)
        return 1
    print_hashes(out_dir, rows)
    problems = pin_problems(out_dir, rows)
    if done.returncode != 0 or problems:
        if problems:
            print("refused: " + problems[0], file=sys.stderr)
        return done.returncode or 1
    return 0


def self_test():
    """No network beyond 127.0.0.1, and no venv."""
    body = b"abcdefghijklmnopqrstuvwxyz"
    digest = hashlib.sha256(body).hexdigest()
    folder = tempfile.mkdtemp(prefix="etiuda-make-")
    refused_hash = False
    refused_pin = False
    resumed = False

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def do_GET(self):
            start = 0
            status = 200
            chunk = body
            ranged = self.headers.get("Range")
            if ranged:
                start = int(ranged.split("=", 1)[1].split("-", 1)[0])
                chunk = body[start:]
                status = 206
            self.send_response(status)
            self.send_header("Content-Length", str(len(chunk)))
            if status == 206:
                self.send_header("Content-Range", "bytes %d-%d/%d" % (start, len(body) - 1, len(body)))
            self.end_headers()
            self.wfile.write(chunk)

        def log_message(self, fmt, *args):
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = "http://127.0.0.1:%d/sample.bin" % server.server_address[1]
    try:
        bad = os.path.join(folder, "bad.bin")
        try:
            fetch(url, bad, len(body), "0" * 64, "sample.bin")
        except RuntimeError as exc:
            refused_hash = "sha256" in str(exc) and not os.path.isfile(bad)
        part = os.path.join(folder, "sample.bin.part")
        with open(part, "wb") as handle:
            handle.write(body[:10])
        dest = os.path.join(folder, "sample.bin")
        fetch(url, dest, len(body), digest, "sample.bin")
        with open(dest, "rb") as handle:
            resumed = handle.read() == body and not os.path.isfile(part)
        model = os.path.join(folder, "model")
        os.makedirs(model)
        with open(os.path.join(model, "model_q4.onnx"), "wb") as handle:
            handle.write(b"nope")
        problems = pin_problems(model, shell_model_pin())
        refused_pin = any("model_q4.onnx" in line for line in problems)
    finally:
        server.shutdown()
        server.server_close()
        shutil.rmtree(folder, ignore_errors=True)
    if not refused_hash or not refused_pin or not resumed:
        print("self-test: hash=" + str(refused_hash) + " pin=" + str(refused_pin) + " resume=" + str(resumed), file=sys.stderr)
        return 1
    print("self-test: sha256 refused")
    print("self-test: pin refused")
    print("self-test: resume ok")
    print("self-test: ok")
    return 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    out = take(argv, "--out")
    if not out:
        print(USAGE, file=sys.stderr)
        return 2
    sources_path = take(argv, "--sources") or SOURCES
    if not os.path.isfile(sources_path) or not os.path.isfile(REQUIREMENTS) or not os.path.isfile(EXPORT):
        print("make: the exporter's sources, requirements or export.py is absent", file=sys.stderr)
        return 1
    return build(out, sources_path)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
