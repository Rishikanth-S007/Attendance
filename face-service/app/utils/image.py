"""Shared image helpers used across the face service."""
import cv2
import numpy as np

from .. import config


def decode_image(raw_bytes: bytes) -> np.ndarray:
    """Decode raw uploaded bytes into a BGR OpenCV image array."""
    array = np.frombuffer(raw_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image - unsupported or corrupted file")
    return image


def shrink(image_bgr: np.ndarray) -> np.ndarray:
    """Downscale so the longest side is at most MAX_IMAGE_SIDE (never upscale)."""
    h, w = image_bgr.shape[:2]
    longest = max(h, w)
    if longest <= config.MAX_IMAGE_SIDE:
        return image_bgr
    scale = config.MAX_IMAGE_SIDE / longest
    return cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
