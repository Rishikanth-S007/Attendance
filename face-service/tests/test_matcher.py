import numpy as np

from app.services.matcher import distance, find_best_match, to_confidence


def vec(seed, scale=1.0):
    v = np.random.default_rng(seed).normal(size=128)
    return (v / np.linalg.norm(v) * scale).tolist()


def test_picks_closest_employee_and_reports_runner_up():
    a, b = vec(1), vec(2)
    query = (np.array(a) + 0.01).tolist()
    result = find_best_match(query, [
        {"employeeId": "A", "embeddings": [a]},
        {"employeeId": "B", "embeddings": [b]},
    ])
    assert result["employeeId"] == "A"
    assert result["distance"] < 0.2
    assert result["secondDistance"] > result["distance"]
    assert result["margin"] == round(result["secondDistance"] - result["distance"], 4)


def test_uses_best_template_per_employee():
    a_front, a_side = vec(1), vec(3)
    query = (np.array(a_side) + 0.005).tolist()
    result = find_best_match(query, [{"employeeId": "A", "embeddings": [a_front, a_side]}])
    assert result["employeeId"] == "A"
    assert result["distance"] < 0.1


def test_single_employee_has_no_margin():
    result = find_best_match(vec(1), [{"employeeId": "A", "embeddings": [vec(1)]}])
    assert result["employeeId"] == "A"
    assert result["secondDistance"] is None and result["margin"] is None


def test_ignores_malformed_templates_and_empty_candidates():
    assert find_best_match(vec(1), [])["employeeId"] is None
    bad = find_best_match(vec(1), [{"employeeId": "A", "embeddings": [[1, 2, 3]]}])
    assert bad["employeeId"] is None


def test_confidence_is_clamped():
    assert to_confidence(None) == 0.0
    assert to_confidence(0.0) == 1.0
    assert to_confidence(5.0) == 0.0
    assert distance([0] * 128, [0] * 128) == 0.0
