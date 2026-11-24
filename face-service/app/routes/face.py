"""
Face HTTP endpoints. This service is stateless and only ever called by the
backend: it detects, checks quality, embeds and compares. Whether a match is
accepted (threshold, margin, employee status, duplicates) is the backend's
decision.
"""
import json

from fastapi import APIRouter, File, Form, UploadFile

from .. import config
from ..services.matcher import find_best_match, to_confidence
from ..services.pipeline import process_image

router = APIRouter()


def _parse_candidates(raw: str):
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, list) else None


def _no_match(message, code):
    return {
        "matched": False, "employeeId": None, "distance": None, "secondDistance": None,
        "margin": None, "confidence": 0.0, "code": code, "message": message,
    }


@router.post("/register")
async def register_face(
    employee_id: str = Form(...),
    label: str = Form("primary"),
    image: UploadFile = File(...),
):
    """Detect one face, check quality, return its embedding (averaged over several jitters)."""
    result = process_image(await image.read(), jitters=config.REGISTER_JITTERS)
    if not result["ok"]:
        return {"success": False, "code": result["code"], "message": result["message"],
                "quality": result["quality"]}
    return {
        "success": True, "employeeId": employee_id, "label": label,
        "embedding": result["embedding"], "quality": result["quality"],
    }


@router.post("/recognize")
async def recognize_face(
    image: UploadFile = File(...),
    registered_employees: str = Form(...),
):
    """
    `registered_employees` is JSON: [{"employeeId": "EMP001", "embeddings": [[...128], ...]}, ...]
    Returns the closest employee plus distance, runner-up distance and margin.
    """
    candidates = _parse_candidates(registered_employees)
    if candidates is None:
        return _no_match("Invalid candidate list", "BAD_REQUEST")

    result = process_image(await image.read(), jitters=config.RECOGNIZE_JITTERS)
    if not result["ok"]:
        return _no_match(result["message"], result["code"])

    best = find_best_match(result["embedding"], candidates)
    return {
        "matched": best["employeeId"] is not None,
        "employeeId": best["employeeId"],
        "distance": best["distance"],
        "secondDistance": best["secondDistance"],
        "margin": best["margin"],
        "confidence": to_confidence(best["distance"]),
        "quality": result["quality"],
    }


@router.post("/compare")
async def compare_embedding(
    embedding: str = Form(...),
    registered_employees: str = Form(...),
):
    """Compare an existing embedding to candidates (used to catch duplicate enrolments)."""
    candidates = _parse_candidates(registered_employees)
    try:
        query = json.loads(embedding)
    except json.JSONDecodeError:
        query = None
    if candidates is None or not isinstance(query, list) or len(query) != config.EMBEDDING_SIZE:
        return _no_match("Invalid input", "BAD_REQUEST")

    best = find_best_match(query, candidates)
    return {
        "matched": best["employeeId"] is not None,
        "employeeId": best["employeeId"],
        "distance": best["distance"],
        "secondDistance": best["secondDistance"],
        "margin": best["margin"],
        "confidence": to_confidence(best["distance"]),
    }
