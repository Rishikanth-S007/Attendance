"""
Thin wrapper around dlib's face detector, 5-point landmark predictor and the
ResNet face encoder.

The model weights ship inside the `face_recognition_models` pip package, so
no download happens at runtime. We locate the files with importlib instead of
importing that package, because its __init__ depends on `pkg_resources`,
which recent setuptools releases no longer include.
"""
import importlib.util
import os
import threading

import dlib
import numpy as np

_lock = threading.Lock()  # dlib objects are not safe to share across threads


def _model_path(filename: str) -> str:
    spec = importlib.util.find_spec("face_recognition_models")
    if spec is None or not spec.submodule_search_locations:
        raise RuntimeError("face_recognition_models is not installed (pip install face_recognition_models)")
    path = os.path.join(list(spec.submodule_search_locations)[0], "models", filename)
    if not os.path.exists(path):
        raise RuntimeError(f"Model file missing: {path}")
    return path


class FaceEngine:
    def __init__(self):
        self._detector = dlib.get_frontal_face_detector()
        self._landmarks = dlib.shape_predictor(_model_path("shape_predictor_5_face_landmarks.dat"))
        self._encoder = dlib.face_recognition_model_v1(_model_path("dlib_face_recognition_resnet_model_v1.dat"))

    def detect(self, rgb: np.ndarray, upsample: int = 1, min_score: float = 0.0):
        """
        Return dlib rectangles for faces scoring above `min_score`. Real faces
        score well above 1.0 on clear images, while the weak extra boxes that
        dlib's default threshold (0.0) lets through are usually background
        clutter. Dropping them avoids false "multiple faces" rejections.
        """
        with _lock:
            rects, _scores, _idx = self._detector.run(rgb, upsample, min_score)
        return list(rects)

    def landmarks(self, rgb: np.ndarray, rect):
        with _lock:
            return self._landmarks(rgb, rect)

    def encode(self, rgb: np.ndarray, shape, jitters: int = 1) -> list:
        with _lock:
            vec = self._encoder.compute_face_descriptor(rgb, shape, jitters)
        return [float(x) for x in vec]


_engine = None


def get_engine() -> FaceEngine:
    """Lazily build the engine so importing the app stays cheap."""
    global _engine
    if _engine is None:
        _engine = FaceEngine()
    return _engine
