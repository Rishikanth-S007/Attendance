"""End-to-end checks of the real dlib pipeline on a real face photo."""
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.matcher import distance
from app.services.pipeline import process_image
from tests.conftest import encode_jpeg

client = TestClient(app)


def test_clear_face_is_accepted_and_embedding_is_128d(face_bgr):
    res = process_image(encode_jpeg(face_bgr), jitters=1)
    assert res["ok"], res
    assert len(res["embedding"]) == 128
    assert res["quality"]["faceWidth"] >= 80


@pytest.mark.parametrize("name,transform", [
    ("resized", lambda im: cv2.resize(im, None, fx=1.5, fy=1.5)),
    ("brighter", lambda im: cv2.convertScaleAbs(im, alpha=1.0, beta=25)),
    ("darker", lambda im: cv2.convertScaleAbs(im, alpha=0.7, beta=-15)),
    ("mirrored", lambda im: cv2.flip(im, 1)),
    ("rotated", lambda im: cv2.warpAffine(
        im, cv2.getRotationMatrix2D((im.shape[1] / 2, im.shape[0] / 2), 8, 1.0),
        (im.shape[1], im.shape[0]), borderMode=cv2.BORDER_REFLECT)),
])
def test_same_person_under_variation_stays_close(face_bgr, name, transform):
    base = process_image(encode_jpeg(face_bgr), jitters=1)
    varied = process_image(encode_jpeg(transform(face_bgr)), jitters=1)
    assert varied["ok"], (name, varied)
    assert distance(base["embedding"], varied["embedding"]) < 0.4


def test_jpeg_compression_does_not_break_matching(face_bgr):
    base = process_image(encode_jpeg(face_bgr, 95), jitters=1)
    low = process_image(encode_jpeg(face_bgr, 30), jitters=1)
    assert distance(base["embedding"], low["embedding"]) < 0.4


def test_no_face_is_rejected(noface_bgr):
    res = process_image(encode_jpeg(noface_bgr), jitters=1)
    assert not res["ok"] and res["code"] == "NO_FACE"


def test_two_equal_faces_are_rejected(face_bgr):
    res = process_image(encode_jpeg(np.hstack([face_bgr, face_bgr])), jitters=1)
    assert not res["ok"] and res["code"] == "MULTIPLE_FACES"


@pytest.mark.parametrize("name,transform,code", [
    ("blurry", lambda im: cv2.GaussianBlur(im, (0, 0), 5), "TOO_BLURRY"),
    ("dark", lambda im: cv2.convertScaleAbs(im, alpha=0.2, beta=0), "TOO_DARK"),
    ("washed_out", lambda im: cv2.convertScaleAbs(im, alpha=1.0, beta=120), "OVEREXPOSED"),
])
def test_quality_gates(face_bgr, name, transform, code):
    res = process_image(encode_jpeg(transform(face_bgr)), jitters=1)
    assert not res["ok"] and res["code"] == code, (name, res)


def test_garbage_bytes_are_rejected():
    res = process_image(b"not an image", jitters=1)
    assert not res["ok"] and res["code"] == "BAD_IMAGE"


def test_http_register_then_recognize_roundtrip(face_bgr):
    img = encode_jpeg(face_bgr)
    reg = client.post("/api/face/register", data={"employee_id": "E1"}, files={"image": ("f.jpg", img, "image/jpeg")}).json()
    assert reg["success"] and len(reg["embedding"]) == 128

    import json
    rng = np.random.default_rng(7)
    other = (rng.normal(size=128) * 0.1).tolist()
    candidates = [{"employeeId": "E1", "embeddings": [reg["embedding"]]},
                  {"employeeId": "E2", "embeddings": [other]}]
    rec = client.post("/api/face/recognize", data={"registered_employees": json.dumps(candidates)},
                      files={"image": ("f.jpg", img, "image/jpeg")}).json()
    assert rec["matched"] and rec["employeeId"] == "E1"
    assert rec["distance"] < 0.3
    assert rec["margin"] > 0.3          # clearly separated from the other employee
    assert 0.7 < rec["confidence"] <= 1


def test_http_recognize_returns_reason_when_no_face(noface_bgr):
    res = client.post("/api/face/recognize", data={"registered_employees": "[]"},
                      files={"image": ("f.jpg", encode_jpeg(noface_bgr), "image/jpeg")}).json()
    assert res["matched"] is False and res["code"] == "NO_FACE"


def test_http_compare_and_health(face_bgr):
    import json
    emb = process_image(encode_jpeg(face_bgr), jitters=1)["embedding"]
    res = client.post("/api/face/compare", data={
        "embedding": json.dumps(emb),
        "registered_employees": json.dumps([{"employeeId": "E1", "embeddings": [emb]}]),
    }).json()
    assert res["employeeId"] == "E1" and res["distance"] == 0.0
    assert client.get("/api/health").json()["status"] == "ok"
