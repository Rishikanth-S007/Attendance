"""Tunable settings for the face pipeline, all overridable via environment."""
import os


def _f(name: str, default: float) -> float:
    return float(os.getenv(name, default))


def _i(name: str, default: int) -> int:
    return int(os.getenv(name, default))


# Images larger than this (longest side, px) are downscaled before detection.
# Phone photos are often 4000px+, which makes detection needlessly slow.
MAX_IMAGE_SIDE = _i("MAX_IMAGE_SIDE", 960)

# --- Quality gates -----------------------------------------------------
MIN_FACE_PX = _i("MIN_FACE_PX", 80)            # face box width/height in the resized image
BLUR_MIN = _f("BLUR_MIN", 25.0)                # Laplacian variance of a 128x128 face crop
BRIGHTNESS_MIN = _f("BRIGHTNESS_MIN", 40.0)    # mean gray level of the face crop (0-255)
BRIGHTNESS_MAX = _f("BRIGHTNESS_MAX", 215.0)
# Whole-frame limits, used only to explain a missed face ("too dark" / "too bright").
FRAME_BRIGHTNESS_MIN = _f("FRAME_BRIGHTNESS_MIN", 40.0)
FRAME_BRIGHTNESS_MAX = _f("FRAME_BRIGHTNESS_MAX", 200.0)
MAX_YAW_RATIO = _f("MAX_YAW_RATIO", 0.40)      # head turn: nose offset / eye distance
MAX_ROLL_DEG = _f("MAX_ROLL_DEG", 30.0)        # head tilt

# If several faces are visible, accept the largest only when it clearly
# dominates (area >= ratio x the next largest). Otherwise ask for one person.
DOMINANCE_RATIO = _f("DOMINANCE_RATIO", 2.5)

# dlib detector upsampling: 1 finds smaller faces at a modest speed cost.
DETECT_UPSAMPLE = _i("DETECT_UPSAMPLE", 1)
# Ignore weak detections (dlib's default cut-off of 0.0 admits background clutter).
DETECT_MIN_SCORE = _f("DETECT_MIN_SCORE", 0.4)

# Jitters = how many slightly perturbed copies are averaged into one embedding.
# More is steadier but slower: use more when enrolling, fewer when checking in.
REGISTER_JITTERS = _i("REGISTER_JITTERS", 5)
RECOGNIZE_JITTERS = _i("RECOGNIZE_JITTERS", 1)

EMBEDDING_SIZE = 128
