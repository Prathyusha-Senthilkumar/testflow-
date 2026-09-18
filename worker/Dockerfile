FROM node:20-bookworm-slim

WORKDIR /opt/testflow-worker

RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV API_BASE_URL=http://backend:3000
ENV POLL_INTERVAL_MS=1000

CMD ["node", "src/worker.js"]
