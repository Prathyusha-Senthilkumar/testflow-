FROM node:20-bookworm

WORKDIR /workspace

COPY . .
RUN npm install --include=dev && npx playwright install --with-deps chromium

CMD ["node", "src/worker.js"]
