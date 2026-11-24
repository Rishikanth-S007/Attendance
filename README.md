# Attendance Pro — Face Recognition Attendance System

A rebuilt and extended version of the original AI face-recognition attendance project, on the same stack:
Node/Express + MongoDB, FastAPI + dlib, React admin dashboard, React Native (Expo) employee app.

## What is new

| Area | Improvement |
|---|---|
| Face recognition | Real dlib ResNet embeddings (replaces the placeholder model); quality gate (blur, brightness, size, pose, one face only); multi-angle enrolment; match needs both a distance threshold and a margin over the runner-up; duplicate-face guard |
| GPS geofencing | Offices with radius; check-in/out must be inside one; accuracy handling; mock-location rejection |
| Shifts and late rules | Per-employee shifts, grace period, half-day rules, overtime, working days, holidays |
| Leave | Request from the app (face-verified) or record by admin; approve/reject; yearly balances by type; weekends and holidays not counted |
| Reports | Attendance register and employee summary as Excel, PDF or CSV (formula-injection safe) |
| Security | Device keys for the employee app, one-time first-admin setup token, validated queries and bodies, rate limits, embeddings never returned by the API, audit log, scan log |
| Operations | Docker Compose, Dockerfiles, CI, automated tests |

## Run with Docker

```bash
cp .env.example .env        # set JWT_SECRET (openssl rand -hex 48) and SETUP_TOKEN
docker compose up --build
```
Dashboard: http://localhost:8080 · API: http://localhost:5000

### First-time setup
1. Create the first admin (once):
   ```bash
   curl -X POST http://localhost:5000/api/auth/setup-first-admin \
     -H "x-setup-token: $SETUP_TOKEN" -H "Content-Type: application/json" \
     -d '{"name":"Admin","email":"you@example.com","password":"a-long-password"}'
   ```
   Then remove `SETUP_TOKEN` from `.env`.
2. Sign in to the dashboard. Create a **Shift** (mark it default), add **Holidays**, and optionally an **Office** (this turns geofencing on).
3. **Devices** → generate a key for each phone. Copy it; it is shown once.
4. Add employees, then **Register face** (straight on, plus left/right if possible).
5. On the phone, install the Expo app, enter the server address (`http://<computer-LAN-IP>:5000/api`) and the device key.

## Run without Docker

```bash
# MongoDB running locally
cd face-service && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
cd backend && cp .env.example .env && npm install && npm run dev
cd admin-dashboard && npm install && npm run dev
cd employee-app && npm install && npx expo start
```

## Tests
```bash
cd backend && npm test                         # unit tests
cd face-service && pytest -q                   # recognition pipeline
INTEGRATION=1 npm test                         # full workflow (needs MongoDB + face service; see tests/integration.test.js)
```

## Notes
- Face matching thresholds, timezone, leave allowances and geofence settings are in `backend/.env.example`.
- Biometric data is personal data: get employee consent, restrict access, and use `DELETE /api/employees/:id/face` for offboarding.
- Face recognition from a photo can be fooled by a printed picture; there is no liveness detection yet. Pair with geofencing and supervised devices where that matters.
- `docs/DOCUMENTATION.md` describes the original design; the sections on rules, API and security are extended by the list above.
