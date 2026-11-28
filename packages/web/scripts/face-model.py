"""Makes src/forehead/blaze-face-short-range.tflite, the face detector Forehead pins its cards with.

The model is MediaPipe's BlazeFace (short range), Apache-2.0. The copy published for MediaPipe Tasks
lives on Google's storage, which the parlor's build doesn't reach; the one in the npm package
@mediapipe/face_detection is the same network without the metadata MediaPipe Tasks reads (how to
scale the camera's pixels). This adds it.

    npm pack @mediapipe/face_detection && tar xzf mediapipe-face_detection-*.tgz
    python3 -m venv venv && venv/bin/pip install mediapipe
    venv/bin/python scripts/face-model.py package/face_detection_short_range.tflite src/forehead/blaze-face-short-range.tflite
"""
import sys
import types

# The Python wheel lacks the compiled helper that works out which metadata parser version can read
# the result. Image normalisation and two plain outputs are all in the first one.
stub = types.ModuleType("_pywrap_metadata_version")
stub.GetMinimumMetadataParserVersion = lambda *_: "1.0.0"
for name in ["mediapipe.tasks.cc", "mediapipe.tasks.cc.metadata", "mediapipe.tasks.cc.metadata.python"]:
    sys.modules[name] = types.ModuleType(name)
sys.modules["mediapipe.tasks.cc.metadata.python._pywrap_metadata_version"] = stub
sys.modules["mediapipe.tasks.cc.metadata.python"]._pywrap_metadata_version = stub

from mediapipe.tasks.python.metadata.metadata_writers import metadata_writer as mw  # noqa: E402

source, out = sys.argv[1], sys.argv[2]
writer = mw.MetadataWriter.create(bytearray(open(source, "rb").read()))
writer.add_general_info("BlazeFace (short-range)", "Detects faces within about two metres of the camera. Apache-2.0, from MediaPipe.")
# The network takes RGB in [-1, 1].
writer.add_image_input(norm_mean=[127.5], norm_std=[127.5])
writer.add_feature_output(name="regressors")
writer.add_feature_output(name="classificators")
model, _ = writer.populate()
open(out, "wb").write(model)
print(f"{out}: {len(model)} bytes")
