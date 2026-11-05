"""Rebuild the pinned U2Netp model for WeChat's 2 MiB subpackage limit.
Requires: pip install onnx onnxsim numpy (reference QA additionally uses onnxruntime).
"""
from pathlib import Path
import hashlib
import json
import subprocess
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto
from onnxsim import simplify

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'scripts/subject-source/u2netp-original.onnx'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'
model, valid = simplify(onnx.load(SOURCE))
assert valid
output = model.graph.output[0].name
needed, nodes = {output}, []
for node in reversed(model.graph.node):
    if needed.intersection(node.output):
        nodes.append(node)
        needed.update(node.input)
del model.graph.node[:]
model.graph.node.extend(reversed(nodes))
del model.graph.output[1:]
for tensor in list(model.graph.initializer):
    if tensor.name not in needed:
        model.graph.initializer.remove(tensor)
weights = [node.input[1] for node in model.graph.node if node.op_type == 'Conv']
tensors = {t.name: numpy_helper.to_array(t) for t in model.graph.initializer}
selected, count = set(), 0
# Quantize only the largest four kernels; sensitive output/detail layers remain fp16.
for name in sorted(weights, key=lambda name: tensors[name].size, reverse=True):
    if tensors[name].size < 1000:
        continue
    selected.add(name)
    count += tensors[name].size
    if count >= 260000:
        break
prefix = []
model.graph.initializer.append(numpy_helper.from_array(np.array(128, dtype='float32'), 'weight_zero'))
for tensor in list(model.graph.initializer):
    if tensor.data_type != TensorProto.FLOAT or tensor.name == 'weight_zero':
        continue
    name, array = tensor.name, numpy_helper.to_array(tensor)
    model.graph.initializer.remove(tensor)
    if name in selected:
        scale = np.maximum(np.max(np.abs(array), axis=tuple(range(1, array.ndim)), keepdims=True) / 127, 1e-8).astype('float32')
        quantized = (np.round(array / scale) + 128).clip(0, 255).astype('uint8')
        model.graph.initializer.extend([numpy_helper.from_array(quantized, name + '_bytes'), numpy_helper.from_array(scale, name + '_scale')])
        prefix.extend([helper.make_node('Cast', [name + '_bytes'], [name + '_float'], to=TensorProto.FLOAT), helper.make_node('Sub', [name + '_float', 'weight_zero'], [name + '_centered']), helper.make_node('Mul', [name + '_centered', name + '_scale'], [name])])
    else:
        model.graph.initializer.append(numpy_helper.from_array(array.astype(np.float16), name + '_fp16'))
        prefix.append(helper.make_node('Cast', [name + '_fp16'], [name], to=TensorProto.FLOAT))
nodes = list(model.graph.node)
del model.graph.node[:]
model.graph.node.extend(prefix + nodes)
old_input = model.graph.input[0].name
for node in model.graph.node:
    for index, name in enumerate(node.input):
        if name == old_input:
            node.input[index] = 'rgb'
    for index, name in enumerate(node.output):
        if name == output:
            node.output[index] = 'mask'
model.graph.input[0].name = 'rgb'
model.graph.output[0].name = 'mask'
del model.graph.value_info[:]
onnx.checker.check_model(model)
# Fold storage-only casts/dequantization offline. WeChat's native importer must
# see ordinary float32 Conv constants, not fp16/uint8 constants feeding Cast.
model, valid = simplify(model)
assert valid
del model.graph.value_info[:]
for tensor in model.graph.initializer:
    if tensor.data_type == TensorProto.FLOAT:
        # Round constants offline, while keeping the graph's actual storage
        # type float32. This improves lossless transport compression further.
        values = numpy_helper.to_array(tensor).astype(np.float16).astype(np.float32)
        tensor.CopyFrom(numpy_helper.from_array(values, tensor.name))
for node in model.graph.node:
    node.name = ''
    # All resize outputs have width/height > 1, where these modes are identical.
    for attribute in node.attribute:
        if attribute.name == 'coordinate_transformation_mode' and attribute.s == b'pytorch_half_pixel':
            attribute.s = b'half_pixel'
assert not any(node.op_type == 'Cast' for node in model.graph.node)
assert not any(t.data_type in (TensorProto.FLOAT16, TensorProto.UINT8) for t in model.graph.initializer)
onnx.checker.check_model(model)
runtime = ROOT / 'scripts/subject-source/u2netp-runtime.onnx'
onnx.save(model, runtime)
destination = ROOT / 'src/subject/static/subject-u2net.br'
subprocess.run(['node', '-e', "const fs=require('node:fs'),z=require('node:zlib');fs.writeFileSync(process.argv[2],z.brotliCompressSync(fs.readFileSync(process.argv[1]),{params:{[z.constants.BROTLI_PARAM_QUALITY]:11}}))", str(runtime), str(destination)], check=True)
metadata = {
    'version': hashlib.sha256(runtime.read_bytes()).hexdigest()[:12],
    'bytes': runtime.stat().st_size,
    'sha256': hashlib.sha256(runtime.read_bytes()).hexdigest(),
    'compressedBytes': destination.stat().st_size,
    'compressedSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
}
(ROOT / 'src/subject/modelInfo.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(metadata)
