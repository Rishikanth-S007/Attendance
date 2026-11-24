from fastapi import APIRouter

from ..services.engine import get_engine

router = APIRouter()


@router.get("/health")
def health():
    """Liveness plus a real check that the models load."""
    try:
        get_engine()
        return {"status": "ok", "service": "face-recognition-ai-service", "model": "dlib-resnet-v1"}
    except Exception as exc:  # noqa: BLE001 - surface any load failure to the probe
        return {"status": "error", "service": "face-recognition-ai-service", "detail": str(exc)}
