"""
Face-image quality checks, run on the detected face before an embedding is
trusted. Rejecting poor captures early is the cheapest way to avoid both
false rejects (bad light, blur) and false accepts (tiny or turned faces).
"""
import math

import cv2
import numpy as np

from .. import config


def assess_quality(image_bgr: np.ndarray, rect, shape) -> dict:
    """
    Returns {"ok": bool, "code": str|None, "reason": str|None, "metrics": {...}}.
    `rect` is a dlib rectangle, `shape` the matching 5-point landmark object.
    """
    h_img, w_img = image_bgr.shape[:2]
    left, top = max(rect.left(), 0), max(rect.top(), 0)
    right, bottom = min(rect.right(), w_img), min(rect.bottom(), h_img)
    width, height = right - left, bottom - top

    metrics = {"faceWidth": int(width), "faceHeight": int(height)}

    if width < config.MIN_FACE_PX or height < config.MIN_FACE_PX:
        return _fail("FACE_TOO_SMALL", "Face is too small - move closer to the camera", metrics)

    crop = image_bgr[top:bottom, left:right]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (128, 128), interpolation=cv2.INTER_AREA)  # size-independent blur metric

    brightness = float(np.mean(gray))
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    metrics.update({"brightness": round(brightness, 1), "sharpness": round(blur, 1)})

    if brightness < config.BRIGHTNESS_MIN:
        return _fail("TOO_DARK", "Too dark - move to a brighter spot", metrics)
    if brightness > config.BRIGHTNESS_MAX:
        return _fail("OVEREXPOSED", "Too bright - avoid strong light behind or on your face", metrics)
    if blur < config.BLUR_MIN:
        return _fail("TOO_BLURRY", "Image is blurry - hold still and try again", metrics)

    # 5-point model: 0,1 = one eye's corners, 2,3 = other eye's corners, 4 = nose base.
    pts = [(shape.part(i).x, shape.part(i).y) for i in range(5)]
    eye_a = ((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2)
    eye_b = ((pts[2][0] + pts[3][0]) / 2, (pts[2][1] + pts[3][1]) / 2)
    eye_dist = math.hypot(eye_a[0] - eye_b[0], eye_a[1] - eye_b[1]) or 1.0
    mid_x = (eye_a[0] + eye_b[0]) / 2

    yaw_ratio = abs(pts[4][0] - mid_x) / eye_dist
    roll_deg = abs(math.degrees(math.atan2(eye_b[1] - eye_a[1], eye_b[0] - eye_a[0])))
    roll_deg = min(roll_deg, 180 - roll_deg)  # eyes may be listed in either order
    metrics.update({"yawRatio": round(yaw_ratio, 3), "rollDeg": round(roll_deg, 1)})

    if yaw_ratio > config.MAX_YAW_RATIO:
        return _fail("FACE_TURNED", "Please face the camera directly", metrics)
    if roll_deg > config.MAX_ROLL_DEG:
        return _fail("FACE_TILTED", "Please keep your head level", metrics)

    return {"ok": True, "code": None, "reason": None, "metrics": metrics}


def _fail(code: str, reason: str, metrics: dict) -> dict:
    return {"ok": False, "code": code, "reason": reason, "metrics": metrics}
