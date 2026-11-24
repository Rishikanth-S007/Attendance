"""
Embedding comparison.

dlib embeddings are compared by Euclidean distance: smaller means more
similar. Rule of thumb for this model: < 0.45 is almost surely the same
person, 0.45-0.6 is uncertain, > 0.6 is a different person.

Besides the nearest employee we report the nearest *other* employee. The
caller uses the gap (margin) to reject ambiguous results, e.g. look-alikes,
instead of trusting a single best score.
"""
import numpy as np

from .. import config


def _valid(vector) -> bool:
    return isinstance(vector, (list, tuple)) and len(vector) == config.EMBEDDING_SIZE


def distance(a, b) -> float:
    return float(np.linalg.norm(np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64)))


def find_best_match(query, registered_employees: list) -> dict:
    """
    registered_employees: [{"employeeId": str, "embeddings": [[128 floats], ...]}]
    Each employee is scored by their closest template (any one good angle is
    enough evidence), then employees are ranked by that score.
    """
    per_employee = []
    for entry in registered_employees:
        vectors = [v for v in entry.get("embeddings", []) if _valid(v)]
        if not vectors:
            continue
        per_employee.append((min(distance(query, v) for v in vectors), entry["employeeId"]))

    if not per_employee:
        return {"employeeId": None, "distance": None, "secondDistance": None, "margin": None}

    per_employee.sort(key=lambda item: item[0])
    best_dist, best_id = per_employee[0]
    second_dist = per_employee[1][0] if len(per_employee) > 1 else None
    margin = (second_dist - best_dist) if second_dist is not None else None

    return {
        "employeeId": best_id,
        "distance": round(best_dist, 4),
        "secondDistance": round(second_dist, 4) if second_dist is not None else None,
        "margin": round(margin, 4) if margin is not None else None,
    }


def to_confidence(dist) -> float:
    """Display-friendly 0-1 score: 1 - distance, clamped. Not a probability."""
    if dist is None:
        return 0.0
    return round(max(0.0, min(1.0, 1.0 - dist)), 4)
