FROM node:22.23.3-bookworm-slim

WORKDIR /app/worker

COPY worker/package.json ./
RUN npm install --no-audit --no-fund \
    && npm cache clean --force \
    && npx playwright install chromium --with-deps \
    && find /root/.cache/ms-playwright -mindepth 1 -maxdepth 1 -type d -name 'chromium-*' ! -name 'chromium_headless_shell-*' -exec rm -rf {} + \
    && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

COPY worker/ ./

WORKDIR /app
ENV TESTFLOW_ROOT=/app
ENV PATH="/app/worker/node_modules/.bin:${PATH}"
CMD ["tsx", "/app/worker/src/index.ts"]
