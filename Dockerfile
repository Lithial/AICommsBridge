# syntax=docker/dockerfile:1

# ── Stage 1: build ──────────────────────────────────────────────────────────
# Pinned to match .tool-versions; the runtime stage uses the SAME base so the
# natively-compiled better-sqlite3 binary stays ABI-compatible.
FROM node:22.18.0-bookworm-slim AS builder
WORKDIR /app

# Toolchain for building better-sqlite3 when no prebuilt binary is available.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install deps first so this layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

# Build the UI bundle (web/dist) and compile the server (dist/).
COPY . .
RUN npm run build

# Strip devDependencies; keeps the compiled native modules in node_modules.
RUN npm prune --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22.18.0-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    AICB_HOST=0.0.0.0 \
    AICB_PORT=4500 \
    AICB_DATA_DIR=/data

# Production node_modules + built artifacts. package.json is required so Node
# treats dist/*.js as ESM ("type": "module"); index.js resolves the UI from
# ../web/dist, so the layout under /app must mirror the repo.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/package.json ./package.json

# Persistent data dir, owned by the unprivileged runtime user. A named volume
# inherits this ownership on first use; bind-mounts must be writable by uid 1000.
RUN mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]
USER node

EXPOSE 4500

# Liveness probe with no extra packages — Node 22 ships a global fetch().
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.AICB_PORT||4500)+'/api/events?after=99999999&limit=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
