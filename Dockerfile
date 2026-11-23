# Jones Hypertrophy (JH) – small Node.js image. better-sqlite3 normally downloads a prebuilt
# binary (linux/amd64 and linux/arm64); build tools are installed only if that fails.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN ( npm ci --omit=dev || ( apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
      && npm ci --omit=dev --build-from-source ) ) && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8086 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public
COPY data ./data
# Starts as root only to fix ownership of /data, then runs as PUID:PGID (default 99:100)
ENV PUID=99 PGID=100
EXPOSE 8086
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8086)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/boot.js"]
