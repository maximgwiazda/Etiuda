"""Export Google's EmbeddingGemma 2 weights to a text-only q4 ONNX model.

The checksum, the arguments and the pin use the standard library only. The
export imports its packages after every source file has matched, and refuses
before writing model_q4.onnx when one has not. optimum-onnx is not used: its
current release cannot load the transformers that this model needs.

  python tools/model-export/export.py --self-test
  python tools/model-export/export.py --write-pin <file>
  python tools/model-export/export.py --check <dir> [--sources <file>]
  python tools/model-export/export.py --export <dir> --out <dir> [--sources <file>]
"""
import hashlib
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources.json")
PIN_FILE = os.path.join(HERE, "pin.json")
COMMIT = "f9972ac22e696a105c482202646979e33e4b5a1e"
PROMPT = "task: classification | query: "
COSINE_MINIMUM = 0.98
MESSAGES = [
    "The customer wants to change the name on the order.",
    "The bag arrived damaged and they want a replacement.",
    "Dzie\u0144 dobry, prosz\u0119 o zmian\u0119 adresu dostawy.",
    "Can I add a second item to this order?",
    "The payment did not go through.",
]
USAGE = ("usage: python tools/model-export/export.py --self-test | --write-pin <file> "
         "| --check <dir> [--sources <file>] | --export <dir> --out <dir> [--sources <file>]")


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


def export_onnx(source, out_dir):
    """Run only after check_source has passed. Not executed without the weights."""
    import numpy as np
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

    import onnx
    # onnxruntime 1.31.1 ships this quantiser as MatMulNBitsQuantizer.
    # The block size and the symmetric 4-bit settings are unchanged.
    from onnxruntime.quantization.matmul_nbits_quantizer import DefaultWeightOnlyQuantConfig, MatMulNBitsQuantizer
    from onnxruntime.quantization.quant_utils import load_model_with_shape_infer
    loaded = load_model_with_shape_infer(fp32)
    quant_config = DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True)
    quant = MatMulNBitsQuantizer(loaded, algo_config=quant_config)
    quant.process()
    proto = quant.model.model
    onnx_path = os.path.join(out_dir, "model_q4.onnx")
    onnx.save_model(proto, onnx_path, save_as_external_data=True, all_tensors_to_one_file=True,
                    location="model_q4.onnx_data", size_threshold=1024)
    os.remove(fp32)

    for name in ("tokenizer.json", "tokenizer_config.json"):
        shutil.copyfile(os.path.join(source, name), os.path.join(out_dir, name))

    cosines = parity(source, onnx_path, tokenizer)
    files = []
    for name in ("model_q4.onnx", "model_q4.onnx_data", "tokenizer.json", "tokenizer_config.json"):
        at = os.path.join(out_dir, name)
        files.append({"name": name, "size": os.path.getsize(at), "sha256": sha256_file(at)})
    worst = min(cosines) if cosines else 0
    status = "exported" if worst >= COSINE_MINIMUM else "parity-failed"
    document = pin_document(files, {"status": "pass" if status == "exported" else "fail",
                                     "cosineMinimum": COSINE_MINIMUM, "cosines": cosines,
                                     "messages": list(MESSAGES)}, status)
    write_pin(os.path.join(out_dir, "pin.json"), document)
    write_pin(PIN_FILE, document)
    if status != "exported":
        for name in ("model_q4.onnx", "model_q4.onnx_data"):
            at = os.path.join(out_dir, name)
            if os.path.isfile(at):
                os.remove(at)
        print("export: parity failed, worst cosine " + str(worst), file=sys.stderr)
        return 1
    print("export: q4 written, worst cosine " + format(worst, ".4f"))
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
        return export_onnx(folder, out_dir)
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
