"""Export Google's EmbeddingGemma 2 weights to a text-only ONNX model.

The checksum, the arguments and the pin use the standard library only. The
export imports its packages after every source file has matched, and refuses
before writing model_q4.onnx when one has not. optimum-onnx is not used: its
current release cannot load the transformers that this model needs.

The default width is asymmetric q4 (block 32, MatMul and the embedding Gather).
--width fp16 stores the same tower in float16 and casts it back for the session.
The pass gate is the task floor, not the cosine: stage 0's script, nearest head
at its threshold, our top five within one message of the published q4 on en and
on pl. The five cosines stay in the pin as a proxy. The task sets are read in
place. Only counts, cosines and sizes are written into the pin.

  python tools/model-export/export.py --self-test
  python tools/model-export/export.py --write-pin <file>
  python tools/model-export/export.py --check <dir> [--sources <file>]
  python tools/model-export/export.py --export <dir> --out <dir> [--sources <file>]
      [--width q4|fp16] [--fp16-out <dir>] [--task <dir>] [--task-script <file>]
"""
import gc
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources.json")
PIN_FILE = os.path.join(HERE, "pin.json")
COMMIT = "f9972ac22e696a105c482202646979e33e4b5a1e"
PROMPT = "task: classification | query: "
# Recorded beside the task floor. It is not the pass gate.
COSINE_MINIMUM = 0.98
TASK_FLOOR = "top-five within 1 of the published q4 on en and on pl"
WITHIN = 1
THRESHOLD = 0.835
INTENTS_NAME = os.path.join("data", "intents-production.json")
MESSAGES_NAME = os.path.join("data", "test-716.jsonl")
PUBLISHED_NAME = os.path.join("models", "embeddinggemma-2-q4")
MESSAGES = [
    "The customer wants to change the name on the order.",
    "The bag arrived damaged and they want a replacement.",
    "Dzie\u0144 dobry, prosz\u0119 o zmian\u0119 adresu dostawy.",
    "Can I add a second item to this order?",
    "The payment did not go through.",
]
USAGE = ("usage: python tools/model-export/export.py --self-test | --write-pin <file> "
         "| --check <dir> [--sources <file>] | --export <dir> --out <dir> [--sources <file>] "
         "[--width q4|fp16] [--fp16-out <dir>] [--task <dir>] [--task-script <file>]")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            block = handle.read(1024 * 1024)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def load_sources(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def check_source(folder, sources):
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


def pin_document(files=None, parity=None, status="not-exported"):
    return {
        "status": status,
        "source": {"repo": "google/embeddinggemma-2", "commit": COMMIT},
        "quant": "q4",
        "textOnly": True,
        "cosineMinimum": COSINE_MINIMUM,
        "taskFloor": TASK_FLOOR,
        "output": ["model_q4.onnx", "model_q4.onnx_data", "tokenizer.json", "tokenizer_config.json"],
        "files": files or [],
        "parity": parity or {"status": "not-run", "messages": list(MESSAGES)},
        "prompt": PROMPT,
    }


def write_pin(path, document):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(document, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def take(argv, flag):
    if flag not in argv:
        return None
    at = argv.index(flag)
    if at + 1 >= len(argv):
        return ""
    return argv[at + 1]


def say(line):
    print(line, flush=True)


def save_onnx(proto, folder):
    import onnx
    os.makedirs(folder, exist_ok=True)
    onnx_path = os.path.join(folder, "model_q4.onnx")
    # Quantise before this save. After it, a later to_array looks for the data file
    # in the process directory and misses the one written beside the graph.
    onnx.save_model(proto, onnx_path, save_as_external_data=True, all_tensors_to_one_file=True,
                    location="model_q4.onnx_data", size_threshold=1024)
    return onnx_path


def file_rows(folder, names):
    rows = []
    for name in names:
        at = os.path.join(folder, name)
        if os.path.isfile(at):
            rows.append({"name": name, "size": os.path.getsize(at), "sha256": sha256_file(at)})
    return rows


def weight_bytes(folder):
    total = 0
    for name in ("model_q4.onnx", "model_q4.onnx_data"):
        at = os.path.join(folder, name)
        if os.path.isfile(at):
            total += os.path.getsize(at)
    return total


def copy_tokenizer(source, folder):
    os.makedirs(folder, exist_ok=True)
    for name in ("tokenizer.json", "tokenizer_config.json"):
        shutil.copyfile(os.path.join(source, name), os.path.join(folder, name))


def quantize_q4(fp32):
    """Block 32, asymmetric, MatMul and the embedding Gather. The measured candidate."""
    import onnx
    from onnxruntime.quantization.matmul_nbits_quantizer import DefaultWeightOnlyQuantConfig, MatMulNBitsQuantizer
    loaded = onnx.load(fp32)
    quant_config = DefaultWeightOnlyQuantConfig(
        block_size=32, is_symmetric=False, bits=4, op_types_to_quantize=("MatMul", "Gather"),
    )
    quant = MatMulNBitsQuantizer(loaded, algo_config=quant_config)
    quant.process()
    proto = quant.model.model
    del quant, loaded
    gc.collect()
    return proto


def convert_fp16(fp32):
    """Store each float32 initializer as float16 and cast it back for the same ops."""
    import numpy as np
    import onnx
    from onnx import TensorProto, helper, numpy_helper
    proto = onnx.load(fp32)
    graph = proto.graph
    base = str(Path(fp32).parent)
    input_names = {item.name for item in graph.input}
    overlap = [init.name for init in graph.initializer if init.name in input_names]
    if overlap:
        kept_inputs = [item for item in graph.input if item.name not in set(overlap)]
        del graph.input[:]
        graph.input.extend(kept_inputs)
    new_inits = []
    casts = []
    converted = 0
    for init in list(graph.initializer):
        if init.data_type != TensorProto.FLOAT:
            new_inits.append(init)
            continue
        array = numpy_helper.to_array(init, base_dir=base).astype(np.float16)
        name16 = init.name + "_f16"
        new_inits.append(numpy_helper.from_array(array, name16))
        casts.append(helper.make_node("Cast", [name16], [init.name], to=TensorProto.FLOAT))
        converted += 1
    del graph.initializer[:]
    graph.initializer.extend(new_inits)
    nodes = list(casts) + list(graph.node)
    del graph.node[:]
    graph.node.extend(nodes)
    say("export: fp16 converted " + str(converted) + " initializer(s)")
    return proto


def export_fp32(source, out_dir):
    """Run only after check_source has passed. Not executed without the weights."""
    import torch
    from transformers import AutoConfig, AutoModel, AutoTokenizer

    config = AutoConfig.from_pretrained(source)
    # Text tower only. The desk never sends an image, a sound or a video.
    for name in ("vision_config", "audio_config"):
        if hasattr(config, name):
            setattr(config, name, None)
    model = AutoModel.from_pretrained(source, config=config, dtype=torch.float32)
    model.eval()
    tokenizer = AutoTokenizer.from_pretrained(source)

    class TextTower(torch.nn.Module):
        def __init__(self, inner):
            super().__init__()
            self.inner = inner

        def forward(self, input_ids, attention_mask):
            hidden = self.inner(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            mask = attention_mask.unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
            return torch.nn.functional.normalize(pooled, p=2, dim=1)

    tower = TextTower(model)
    sample = tokenizer(PROMPT + MESSAGES[0], return_tensors="pt")
    fp32 = os.path.join(out_dir, "model_fp32.onnx")
    export_args = dict(
        input_names=["input_ids", "attention_mask"],
        output_names=["sentence_embedding"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "sequence"},
            "attention_mask": {0: "batch", 1: "sequence"},
            "sentence_embedding": {0: "batch"},
        },
        opset_version=18,
        do_constant_folding=True,
    )
    try:
        torch.onnx.export(tower, (sample["input_ids"], sample["attention_mask"]), fp32, dynamo=False, **export_args)
    except TypeError:
        torch.onnx.export(tower, (sample["input_ids"], sample["attention_mask"]), fp32, **export_args)
    del tower, model
    gc.collect()
    say("export: float32 written, " + str(os.path.getsize(fp32)) + " bytes")
    return fp32, tokenizer


def paraphrase_hits(path):
    """Counts only. The result file's texts stay where the script wrote them."""
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    nearest = data["heads"]["nearest_cosine"]
    summary = nearest["summary"]
    return {
        "threshold": nearest["threshold"],
        "en": {"hits": summary["en"]["paraphrase"]["hits_at_5"], "of": summary["en"]["paraphrase"]["count"]},
        "pl": {"hits": summary["pl"]["paraphrase"]["hits_at_5"], "of": summary["pl"]["paraphrase"]["count"]},
    }


def within_one(candidate, published):
    return (candidate["en"]["of"] == published["en"]["of"]
            and candidate["pl"]["of"] == published["pl"]["of"]
            and abs(candidate["en"]["hits"] - published["en"]["hits"]) <= WITHIN
            and abs(candidate["pl"]["hits"] - published["pl"]["hits"]) <= WITHIN)


def task_count(script, model_dir, task_root, out_path):
    intents = os.path.join(task_root, INTENTS_NAME)
    messages = os.path.join(task_root, MESSAGES_NAME)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    cmd = [sys.executable, script, "--model-dir", model_dir, "--model-type", "embeddinggemma-2-q4",
           "--intents", intents, "--messages", messages, "--out", out_path,
           "--threshold-cosine", str(THRESHOLD)]
    say("export: task " + os.path.basename(model_dir))
    done = subprocess.run(cmd, check=False)
    if done.returncode != 0 or not os.path.isfile(out_path):
        say("export: task failed, exit " + str(done.returncode))
        return None
    got = paraphrase_hits(out_path)
    say("export: task " + os.path.basename(model_dir) + " en "
        + str(got["en"]["hits"]) + "/" + str(got["en"]["of"]) + " pl "
        + str(got["pl"]["hits"]) + "/" + str(got["pl"]["of"]))
    return got


def task_paths_ready(task_root, script):
    if not task_root or not script:
        print("export: the task check needs --task and --task-script", file=sys.stderr)
        return False
    needed = [script, os.path.join(task_root, INTENTS_NAME), os.path.join(task_root, MESSAGES_NAME),
              os.path.join(task_root, PUBLISHED_NAME, "model_q4.onnx")]
    missing = [item for item in needed if not os.path.isfile(item)]
    if missing:
        print("export: the task check is missing " + str(len(missing)) + " path(s)", file=sys.stderr)
        return False
    return True


def write_shipped(out_dir, files, parity, status, alternative=None):
    document = pin_document(files, parity, status)
    if alternative:
        document["alternative"] = alternative
    write_pin(os.path.join(out_dir, "pin.json"), document)
    write_pin(PIN_FILE, document)
    return document


def merge_alternative(folder):
    """The fp16 weights, recorded on the shipped pin and not selected by it."""
    if not os.path.isfile(PIN_FILE):
        print("export: the shipped pin is absent, so the fp16 row was not recorded", file=sys.stderr)
        return 1
    with open(PIN_FILE, "r", encoding="utf-8") as handle:
        document = json.load(handle)
    rows = file_rows(folder, ("model_q4.onnx", "model_q4.onnx_data"))
    document["alternative"] = {"quant": "fp16", "shipped": False, "files": rows}
    write_pin(PIN_FILE, document)
    write_pin(os.path.join(folder, "pin.json"), {"quant": "fp16", "shipped": False, "files": rows})
    say("export: fp16 recorded, " + str(weight_bytes(folder)) + " bytes")
    return 0


def export_onnx(source, out_dir, width, fp16_out, task_root, task_script):
    os.makedirs(out_dir, exist_ok=True)
    if width == "q4" and not task_paths_ready(task_root, task_script):
        return 2
    fp32, tokenizer = export_fp32(source, out_dir)
    alternative = None
    if width == "fp16":
        proto = convert_fp16(fp32)
        save_onnx(proto, out_dir)
        del proto
        gc.collect()
        os.remove(fp32)
        copy_tokenizer(source, out_dir)
        return merge_alternative(out_dir)

    say("export: quantise q4")
    proto = quantize_q4(fp32)
    onnx_path = save_onnx(proto, out_dir)
    del proto
    gc.collect()
    say("export: q4 bytes " + str(weight_bytes(out_dir)))
    if fp16_out:
        say("export: convert fp16")
        proto = convert_fp16(fp32)
        save_onnx(proto, fp16_out)
        del proto
        gc.collect()
        copy_tokenizer(source, fp16_out)
        alternative = {"quant": "fp16", "shipped": False,
                       "files": file_rows(fp16_out, ("model_q4.onnx", "model_q4.onnx_data"))}
        say("export: fp16 bytes " + str(weight_bytes(fp16_out)))
    os.remove(fp32)
    copy_tokenizer(source, out_dir)

    cosines = parity(source, onnx_path, tokenizer)
    del tokenizer
    gc.collect()
    worst = min(cosines) if cosines else 0
    say("export: cosines " + " ".join(format(item, ".8f") for item in cosines))
    task_dir = os.path.join(out_dir, "task")
    candidate = task_count(task_script, out_dir, task_root, os.path.join(task_dir, "candidate.json"))
    published = task_count(task_script, os.path.join(task_root, PUBLISHED_NAME), task_root,
                           os.path.join(task_dir, "published.json"))
    passed = candidate is not None and published is not None and within_one(candidate, published)
    status = "passed" if passed else "parity-failed"
    parity_doc = {
        "status": "pass" if passed else "fail",
        "floor": TASK_FLOOR,
        "threshold": THRESHOLD,
        "head": "nearest",
        "kind": "paraphrase",
        "cosineMinimum": COSINE_MINIMUM,
        "cosines": cosines,
        "messages": list(MESSAGES),
        "published": None if published is None else {
            "en": published["en"], "pl": published["pl"],
            "bytes": weight_bytes(os.path.join(task_root, PUBLISHED_NAME)),
        },
        "candidate": None if candidate is None else {
            "en": candidate["en"], "pl": candidate["pl"], "bytes": weight_bytes(out_dir),
        },
    }
    names = ("model_q4.onnx", "model_q4.onnx_data", "tokenizer.json", "tokenizer_config.json")
    files = file_rows(out_dir, names)
    write_shipped(out_dir, files, parity_doc, status, alternative)
    if not passed:
        for name in ("model_q4.onnx", "model_q4.onnx_data"):
            at = os.path.join(out_dir, name)
            if os.path.isfile(at):
                os.remove(at)
        print("export: task floor missed, worst cosine " + format(worst, ".8f"), file=sys.stderr)
        return 1
    say("export: passed, worst cosine " + format(worst, ".8f"))
    return 0


def parity(source, onnx_path, tokenizer):
    import numpy as np
    import onnxruntime as ort
    import torch
    from sentence_transformers import SentenceTransformer
    reference = SentenceTransformer(source, device="cpu", model_kwargs={"dtype": torch.float32})
    expected = reference.encode(list(MESSAGES), prompt_name="Classification", normalize_embeddings=True)
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    cosines = []
    for index, text in enumerate(MESSAGES):
        encoded = tokenizer(PROMPT + text, return_tensors="np")
        feeds = {
            "input_ids": np.asarray(encoded["input_ids"], dtype=np.int64),
            "attention_mask": np.asarray(encoded["attention_mask"], dtype=np.int64),
        }
        got = session.run(["sentence_embedding"], feeds)[0][0]
        want = np.asarray(expected[index], dtype=np.float64)
        got = np.asarray(got, dtype=np.float64)
        cosines.append(float(np.dot(got, want) / (np.linalg.norm(got) * np.linalg.norm(want))))
    return cosines


def main(argv):
    if not argv:
        print(USAGE, file=sys.stderr)
        return 2
    if "--self-test" in argv:
        return self_test()
    if "--write-pin" in argv:
        dest = take(argv, "--write-pin")
        if not dest:
            print(USAGE, file=sys.stderr)
            return 2
        write_pin(dest, pin_document())
        print("pin: " + dest)
        return 0
    exporting = "--export" in argv
    checking = "--check" in argv or exporting
    if not checking:
        print(USAGE, file=sys.stderr)
        return 2
    folder = take(argv, "--export") if exporting else take(argv, "--check")
    sources_path = take(argv, "--sources") or SOURCES
    out_dir = take(argv, "--out")
    width = "q4"
    if "--width" in argv:
        width = take(argv, "--width")
    if width not in ("q4", "fp16"):
        print(USAGE, file=sys.stderr)
        return 2
    fp16_out = take(argv, "--fp16-out")
    task_root = take(argv, "--task")
    task_script = take(argv, "--task-script")
    if not folder or not os.path.isdir(folder) or (exporting and not out_dir):
        print(USAGE, file=sys.stderr)
        return 2
    problems = check_source(folder, load_sources(sources_path))
    if problems:
        for line in problems:
            print("refused: " + line, file=sys.stderr)
        return 1
    if not exporting:
        print("check: " + str(len(load_sources(sources_path).get("files") or [])) + " file(s) match")
        return 0
    os.makedirs(out_dir, exist_ok=True)
    try:
        return export_onnx(folder, out_dir, width, fp16_out, task_root, task_script)
    except ImportError as exc:
        print("export: the pinned packages are not installed (" + str(exc) + ")", file=sys.stderr)
        return 3


def self_test():
    bare = main([])
    folder = tempfile.mkdtemp(prefix="etiuda-export-")
    out_dir = tempfile.mkdtemp(prefix="etiuda-export-out-")
    try:
        body = b"good"
        with open(os.path.join(folder, "sample.bin"), "wb") as handle:
            handle.write(body)
        digest = hashlib.sha256(body).hexdigest()
        sources = os.path.join(folder, "sources.json")
        with open(sources, "w", encoding="utf-8") as handle:
            json.dump({"files": [{"name": "sample.bin", "size": 4, "sha256": digest}]}, handle)
        good = main(["--check", folder, "--sources", sources])
        with open(os.path.join(folder, "sample.bin"), "wb") as handle:
            handle.write(b"baad")
        bad = main(["--export", folder, "--out", out_dir, "--sources", sources])
        wrote = os.path.isfile(os.path.join(out_dir, "model_q4.onnx"))
        pin_path = os.path.join(folder, "pin.json")
        write_pin(pin_path, pin_document())
        with open(pin_path, "r", encoding="utf-8") as handle:
            pin = json.load(handle)
        pin_ok = (pin.get("status") == "not-exported" and pin.get("quant") == "q4"
                  and pin.get("cosineMinimum") == COSINE_MINIMUM
                  and pin.get("parity", {}).get("status") == "not-run")
        if bare != 2 or good != 0 or bad != 1 or wrote or not pin_ok:
            print("self-test: bare=" + str(bare) + " good=" + str(good) + " bad=" + str(bad)
                  + " wrote=" + str(wrote) + " pin=" + str(pin_ok), file=sys.stderr)
            return 1
    finally:
        shutil.rmtree(folder, ignore_errors=True)
        shutil.rmtree(out_dir, ignore_errors=True)
    print("self-test: arguments 2")
    print("self-test: checksum refused")
    print("self-test: pin status=not-exported parity=not-run")
    print("self-test: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
