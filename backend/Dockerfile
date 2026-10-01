# Shared TestFlow Python image (backend + worker targets).
# Slim keeps Python 3.12 on Debian Bookworm and drops the full image's compilers.
FROM python:3.12-slim-bookworm AS python-base

WORKDIR /app/backend

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
COPY requirements.txt /app/requirements.txt

RUN pip install --upgrade pip \
    && pip install -r /app/backend/requirements.txt \
    && pip install -r /app/requirements.txt

COPY backend /app/backend
COPY automation /app/automation
COPY tests /app/tests

# Record Test (backend) and Run Test (worker) both use Playwright from the same pip version.
# --with-deps installs the Chromium libraries that slim does not include. Chromium only.
RUN playwright install chromium --with-deps \
    && rm -rf /var/lib/apt/lists/*

FROM python-base AS backend

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python-base AS worker

CMD ["python", "worker_main.py"]
