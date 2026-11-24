import cv2
import pytest
from skimage import data


def encode_jpeg(image_bgr, quality=92) -> bytes:
    return cv2.imencode(".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])[1].tobytes()


@pytest.fixture(scope="session")
def face_bgr():
    """A single clear face (scikit-image's bundled astronaut photo, upscaled so the face is large)."""
    img = cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR)
    return cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)


@pytest.fixture(scope="session")
def noface_bgr():
    return cv2.cvtColor(data.coffee(), cv2.COLOR_RGB2BGR)
