# syntax=docker/dockerfile:1

# --- UI: shadcn/Tailwind app built into /src/web (vite outDir is ../web) ---
FROM node:26-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Python app ---
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/
WORKDIR /app

FROM base AS builder
# Dependencies first so this layer is cached until pyproject/uv.lock change.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --all-extras --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --all-extras --no-editable

FROM base AS runtime
# Local OCR for scanned contracts (Tesseract, Apache-2.0): scans never leave the container for OCR.
# The "best" Arabic and English models (tessdata_best, Apache-2.0, pinned + checksummed) read Arabic
# far more accurately than the distro's fast models (e.g. "اثني عشر" instead of Latin noise).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/share/tessdata-best \
    && cp -r /usr/share/tesseract-ocr/*/tessdata/configs /usr/share/tessdata-best/
ARG TESSDATA_BEST=https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec
ADD --chmod=644 --checksum=sha256:ab9d157d8e38ca00e7e39c7d5363a5239e053f5b0dbdb3167dde9d8124335896 \
    ${TESSDATA_BEST}/ara.traineddata /usr/share/tessdata-best/ara.traineddata
ADD --chmod=644 --checksum=sha256:8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba \
    ${TESSDATA_BEST}/eng.traineddata /usr/share/tessdata-best/eng.traineddata
ENV TESSDATA_PREFIX=/usr/share/tessdata-best
RUN useradd --create-home --uid 1000 app \
    && mkdir -p /app/runs /app/data/uploads && chown -R app /app/runs /app/data
COPY --from=builder /app/.venv /app/.venv
COPY --from=web /src/web ./web
COPY evals ./evals
COPY demo ./demo
ENV PATH="/app/.venv/bin:$PATH"
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)"
CMD ["uvicorn", "hack.api:app", "--host", "0.0.0.0", "--port", "8000"]
