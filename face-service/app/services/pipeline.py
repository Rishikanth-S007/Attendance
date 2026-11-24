"""
The shared face pipeline used by registration and recognition:

    decode -> shrink -> detect -> pick one face -> landmarks -> quality -> embed
"""
import cv2
import numpy as np

from .. import config
from ..utils.image import decode_image, shrink
from .engine import get_engine
from .quality import assess_quality


def _result(ok, code=None, message=None, embedding=None, quality=None):
    return {"ok": ok, "code": code, "message": message, "embedding": embedding, "quality": quality}


def pick_single_face(rects):
    """
    Returns (rect, error_code, message). With several faces, the largest is
    used only if it clearly dominates the frame, which tolerates a colleague
    in the far background while still refusing a genuine two-person shot.
    """
    if not rects:
        return None, "NO_FACE", "No face detected in the image"
    if len(rects) == 1:
        return rects[0], None, None

    ranked = sorted(rects, key=lambda r: r.width() * r.height(), reverse=True)
    biggest, second = ranked[0], ranked[1]
    if biggest.width() * biggest.height() >= config.DOMINANCE_RATIO * second.width() * second.height():
        return biggest, None, None
    return None, "MULTIPLE_FACES", "Multiple faces detected - please capture one person at a time"


def process_image(raw_bytes: bytes, jitters: int) -> dict:
    try:
        image_bgr = shrink(decode_image(raw_bytes))
    except ValueError as exc:
        return _result(False, "BAD_IMAGE", str(exc))

    engine = get_engine()
    rgb = np.ascontiguousarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))

    rects = engine.detect(rgb, config.DETECT_UPSAMPLE, config.DETECT_MIN_SCORE)
    rect, code, message = pick_single_face(rects)
    if rect is None:
        if code == "NO_FACE":
            # A missed face is often really a lighting problem; say so if the
            # whole frame is clearly too dark or washed out.
            frame_brightness = float(np.mean(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)))
            if frame_brightness < config.FRAME_BRIGHTNESS_MIN:
                return _result(False, "TOO_DARK", "Too dark - move to a brighter spot")
            if frame_brightness > config.FRAME_BRIGHTNESS_MAX:
                return _result(False, "OVEREXPOSED", "Too bright - avoid strong light behind or on your face")
        return _result(False, code, message)

    shape = engine.landmarks(rgb, rect)
    quality = assess_quality(image_bgr, rect, shape)
    if not quality["ok"]:
        return _result(False, quality["code"], quality["reason"], quality=quality["metrics"])

    embedding = engine.encode(rgb, shape, jitters)
    return _result(True, embedding=embedding, quality=quality["metrics"])
