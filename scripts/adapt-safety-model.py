"""Convert the pinned NSFWJS MobileNetV2 to ordinary float32 ONNX offline.

Requires numpy and onnx. No model training or extra weight quantization.
The source uint8 weights are dequantized using the upstream manifest exactly.
Three independently compressed parts keep each WeChat subpackage under 2 MiB.
"""
import hashlib
import gzip
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/safety-source"
EXPECTED = {
    "model.json": "11846416217e68bf1eb7b0e651bcfd305973566453c63275bbd16766ab089979",
    "weights.bin": "8e7dddbb16acacc1bf1601b1b8a761e730ff934b7f2d7771312b2f000e5f5f13",
}
for filename, checksum in EXPECTED.items():
    assert hashlib.sha256((SOURCE / filename).read_bytes()).hexdigest() == checksum, filename
model_json = json.loads((SOURCE / "model.json").read_text())
raw = (SOURCE / "weights.bin").read_bytes()
weights, offset = {}, 0
for group in model_json["weightsManifest"]:
    for weight in group["weights"]:
        count = int(np.prod(weight["shape"]))
        quant = weight["quantization"]
        assert quant["dtype"] == "uint8"
        values = np.frombuffer(raw, dtype=np.uint8, count=count, offset=offset)
        # TFJS dequantization performs the affine operation before float32 storage.
        weights[weight["name"]] = (values.astype(np.float64) * quant["scale"] + quant["min"]).astype(np.float32).reshape(weight["shape"])
        offset += count
assert offset == len(raw)

nodes, initializers, outputs = [], [], {}
def constant(name, value):
    initializers.append(numpy_helper.from_array(np.asarray(value, dtype=np.float32), name))
    return name
def node(op, inputs, name, **attrs):
    nodes.append(helper.make_node(op, inputs, [name], name=name, **attrs))
    return name

for layer in model_json["modelTopology"]["model_config"]["config"]["layers"]:
    name, kind, config = layer["name"], layer["class_name"], layer["config"]
    inputs = [outputs[value[0]] for value in layer["inbound_nodes"][0]] if layer["inbound_nodes"] else []
    if kind == "InputLayer":
        outputs[name] = "rgb"
        continue
    if kind in ("Dropout",):
        outputs[name] = inputs[0]
        continue
    if kind == "ZeroPadding2D":
        (top, bottom), (left, right) = config["padding"]
        node("Pad", inputs, name, pads=[0, 0, top, left, 0, 0, bottom, right], mode="constant", value=0.0)
    elif kind in ("Conv2D", "DepthwiseConv2D"):
        key = "kernel" if kind == "Conv2D" else "depthwise_kernel"
        kernel = weights[f"{name}/{key}"]
        groups = 1
        if kind == "DepthwiseConv2D":
            groups = kernel.shape[2]
            kernel = kernel.transpose(2, 3, 0, 1).reshape(-1, 1, *kernel.shape[:2])
        else:
            kernel = kernel.transpose(3, 2, 0, 1)
        inputs.append(constant(f"{name}/weight", kernel))
        if config["use_bias"]:
            inputs.append(constant(f"{name}/bias", weights[f"{name}/bias"]))
        node("Conv", inputs, name, strides=config["strides"], dilations=config["dilation_rate"], group=groups, auto_pad="SAME_UPPER" if config["padding"] == "same" else "VALID")
        assert config["activation"] == "linear"
    elif kind == "BatchNormalization":
        for key in ["gamma", "beta", "moving_mean", "moving_variance"]:
            inputs.append(constant(f"{name}/{key}", weights[f"{name}/{key}"]))
        node("BatchNormalization", inputs, name, epsilon=config["epsilon"])
    elif kind == "ReLU":
        assert config["negative_slope"] == config["threshold"] == 0
        node("Clip", inputs, name, min=0.0, max=float(config["max_value"]))
    elif kind == "Add":
        node("Add", inputs, name)
    elif kind == "AveragePooling2D":
        node("AveragePool", inputs, name, kernel_shape=config["pool_size"], strides=config["strides"])
    elif kind == "Flatten":
        node("Flatten", inputs, name, axis=1)
    elif kind == "Dense":
        inputs += [constant(f"{name}/weight", weights[f"{name}/kernel"]), constant(f"{name}/bias", weights[f"{name}/bias"])]
        linear = node("Gemm", inputs, name + "/linear")
        node("Relu" if config["activation"] == "relu" else "Softmax", [linear], name, **({"axis": 1} if config["activation"] == "softmax" else {}))
    else:
        raise ValueError(f"Unsupported layer {kind}")
    outputs[name] = name
node("Identity", [outputs["dense_3"]], "probabilities")
graph = helper.make_graph(nodes, "NSFWJS-MobileNetV2", [helper.make_tensor_value_info("rgb", TensorProto.FLOAT, [1, 3, 224, 224])], [helper.make_tensor_value_info("probabilities", TensorProto.FLOAT, [1, 5])], initializers)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 10)], producer_name="perler-beads NSFWJS adapter", ir_version=8)
onnx.checker.check_model(model)
model = onnx.shape_inference.infer_shapes(model)
binary = model.SerializeToString()
(SOURCE / "nsfw-runtime.onnx").write_bytes(binary)
parts = []
# Split by original byte count, not compression offsets, so wx can decompress
# each resource with the bundled gzip decoder before concatenating the model.
for index, root in enumerate(["safety", "safetyExtra", "safetyLast"]):
    chunk = binary[index * len(binary) // 3:(index + 1) * len(binary) // 3]
    path = f"{root}/static/nsfw-model.bin"
    target = ROOT / "src" / path
    target.parent.mkdir(parents=True, exist_ok=True)
    compressed = gzip.compress(chunk, compresslevel=9, mtime=0)
    assert (len(compressed) + 2) // 3 * 4 < 2 * 1024**2 - 16000, "subpackage module too large"
    target.write_bytes(compressed)
    parts.append({"root": root, "path": "/" + path, "bytes": len(chunk), "compressedBytes": len(compressed), "sha256": hashlib.sha256(compressed).hexdigest()})
checksum = hashlib.sha256(binary).hexdigest()
info = {"version": checksum[:12], "compression": "gzip", "bytes": len(binary), "sha256": checksum, "md5": hashlib.md5(binary).hexdigest(), "classes": ["Drawing", "Hentai", "Neutral", "Porn", "Sexy"], "inputSize": 224, "parts": parts, "source": json.loads((SOURCE / "source.json").read_text())}
(ROOT / "src/data/safety-model.json").write_text(json.dumps(info, indent=2) + "\n")
print(json.dumps(info, indent=2))
