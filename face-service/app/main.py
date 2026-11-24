from fastapi import FastAPI

from .routes import face, health

app = FastAPI(
    title="Attendance Face Recognition Service",
    description="Face detection, quality checks, embedding generation and matching "
                "for the AI Face Recognition Attendance System. Internal service: "
                "only the backend should be able to reach it.",
    version="2.0.0",
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(face.router, prefix="/api/face", tags=["face"])


@app.get("/")
def root():
    return {"service": "face-recognition-ai-service", "docs": "/docs"}
