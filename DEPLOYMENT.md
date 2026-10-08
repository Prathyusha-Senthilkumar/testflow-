# TestFlow deployment readiness

Deployment to a Revature instance is not set up yet. This describes the current Docker layout and what is still needed.

## Services

| Service | Image | Role |
|---|---|---|
| frontend | `frontend/Dockerfile` | Next.js UI |
| backend | `backend/Dockerfile` target `backend` | FastAPI |
| worker | `worker/Dockerfile` | Node + TypeScript Playwright worker |
| redis | `redis:7-alpine` | Job queue |

Containers talk to Redis at `redis://redis:6379/0`. The browser uses `NEXT_PUBLIC_API_URL`. Password-reset and CORS use `FRONTEND_URL`.

## Environment variables

Set these in a root `.env` copied from `compose.env.example`. Do not commit that file.

| Name | When |
|---|---|
| `USE_DEMO_DATA` | Runtime. `true` is in-memory. `false` requires Supabase. |
| `SUPABASE_URL` | Runtime, when not using demo data. |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime, when not using demo data. |
| `TESTFLOW_SECRET_KEY` | Runtime. Encrypts Auth Profile credentials. |
| `FRONTEND_URL` | Runtime. Public origin of the UI. |
| `NEXT_PUBLIC_API_URL` | Frontend image build. Public API URL the browser calls. |
| `RECORDING_DELEGATE_URL` | Runtime. Host recorder used by Record Test. |
| `REDIS_HOST_PORT` | Host port mapped to Redis. Default `6380`. |
| `BACKEND_PORT` | Host port mapped to the API. Default `8000`. |
| `FRONTEND_PORT` | Host port mapped to the UI. Default `3000`. |
| `WORKER_STATUS_INTERVAL_MS` | Runtime, worker and backend. Heartbeat period for the Workers page. Default `5000`. |
| `GIT_SHA` | Optional, worker. Commit shown next to the worker version. |
| `WARM_CONTEXTS` | Runtime, worker. Spare browser contexts kept ready. Default `1`. |
| `BROWSER_RECYCLE_AFTER_TESTS` / `BROWSER_RECYCLE_RSS_MB` | Runtime, worker. When Chromium is relaunched. Defaults `200` / `1500`. |

Inside the Compose network the API is port 8000, the UI is port 3000, and Redis is port 6379.

## Build and start

From the repository root:

```bash
docker compose build
docker compose up -d
docker compose ps
```

Changing `NEXT_PUBLIC_API_URL` or `FRONTEND_URL` for a public hostname requires rebuilding the frontend image. `NEXT_PUBLIC_API_URL` is compiled into the Next.js bundle.

## Workers page and warm runners

The Workers page (`GET /api/workers`) needs a worker image built from this branch or later; older worker images publish no heartbeat, so the page shows no workers. Run `supabase/migrations/20261008_worker_status.sql` to show pending suite/project batches (otherwise that count is blank).

Workers keep Chromium warm: it is launched at container start, spare contexts are kept ready, and it is recycled between tests after `BROWSER_RECYCLE_AFTER_TESTS` tests or `BROWSER_RECYCLE_RSS_MB` of memory. At least one worker container should always be running so a test never waits for a cold start; the worker service uses `restart: unless-stopped` for this. Scale with `docker compose up -d --scale worker=N`.

## Still needed from Revature

- Server or instance access
- Public hostname or IP
- SSH or other access method
- Whether images are built on the server or pushed to a container registry
- Production values for the variables above
- Firewall or security-group openings for the UI and API
- HTTPS and domain decision

## Later CD flow

GitHub Actions CI stays manual (`workflow_dispatch`) until that instance exists. The later flow is:

GitHub Actions CI → build and test succeed → deployment job → Revature instance → `docker compose up -d`

That deployment job is not implemented.
