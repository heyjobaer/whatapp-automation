# OpenWA - Dockerfile
# Multi-stage build for production-ready image

# ===== Stage 1: Builder =====
# Pin the builder to the BUILD host's platform (not the target's). It only produces arch-INDEPENDENT
# artifacts (the NestJS dist/ JS and the static dashboard SPA), so it never needs to run emulated for
# the non-native target. On a multi-arch buildx build this avoids QEMU emulating the whole npm ci +
# Vite build for arm64 — which is slow AND is where the arm64 lightningcss (Vite 8's native CSS
# minifier) optional dependency fails to install ("Cannot find module lightningcss.linux-arm64-gnu.node").
# The per-arch runtime deps are installed natively in the target-platform production stage below.
# NOTE: $BUILDPLATFORM requires BuildKit (CI uses buildx; modern `docker build`/compose default to it).
FROM --platform=$BUILDPLATFORM docker.io/node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy backend package files. The repo is split into backend/ (NestJS API) and frontend/
# (Angular dashboard); the build context is still the repo root.
COPY backend/package*.json ./backend/

# Install the backend deps INCLUDING devDependencies — the build needs them (`nest` from
# @nestjs/cli). `--include=dev` is REQUIRED, not cosmetic: npm omits devDependencies whenever
# NODE_ENV=production is present in the build env. Coolify (and similar PaaS) promote every ${VAR}
# referenced in the compose file to a build-time variable, so docker-compose.yml's
# `NODE_ENV=${NODE_ENV:-production}` leaks NODE_ENV=production into this stage and a bare `npm ci`
# would skip @nestjs/cli → `sh: 1: nest: not found` (exit 127). (docker-compose.dev.yml hardcodes
# NODE_ENV=development, which is why the dev build never hit this.)
# This runs before frontend/ is copied, so backend's postinstall hook (which installs the
# dashboard when ../frontend exists) is a no-op here — the dashboard deps are installed explicitly below.
RUN cd backend && npm ci --include=dev

# Install the frontend (Angular dashboard) deps. `--include=dev` for the same NODE_ENV reason as
# above: the dashboard build needs vite/typescript (devDependencies).
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --include=dev

# Copy the rest of the source
COPY . .

# Build the API (backend/dist/) and the Angular dashboard SPA (frontend/dist/dashboard-ng/browser).
RUN cd backend && npm run build
RUN cd frontend && npm run build

# ===== Stage 2: Production =====
FROM docker.io/node:22-slim AS production

# Install Chrome/Chromium and required dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    dumb-init \
    gosu \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome executable path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create app user for security
RUN groupadd -r openwa && useradd -r -g openwa openwa

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install backend production dependencies only. postinstall's dashboard hook is a no-op here
# (../frontend does not exist in this stage — the built SPA is copied in below).
RUN cd backend && npm ci --omit=dev && npm cache clean --force

# Copy the built API from the builder stage
COPY --from=builder /app/backend/dist ./backend/dist

# Copy the bundled Angular dashboard SPA; ServeStaticModule serves it from this same process/port.
# app.module.ts resolves ../../frontend/dist/dashboard-ng/browser relative to backend/dist/, which
# is /app/frontend/dist/dashboard-ng/browser here. Single container, single port.
COPY --from=builder /app/frontend/dist ./frontend/dist

# Create data directories with correct ownership
RUN mkdir -p ./data/sessions ./data/media && \
    chown -R openwa:openwa /app

# The non-root openwa user has no home of its own (`useradd -r`, no -m). Chromium resolves the home
# dir from the passwd entry via glib's getpwuid() — it IGNORES $HOME — so it tries to read/write
# /home/openwa, which does not exist. On hardened/read-only hosts that makes the browser HARD-CRASH
# at launch (SIGTRAP/int3, logged as "chrome_crashpad_handler: --database is required"). The robust
# fix is to point Chromium's config + cache at writable, pre-created dirs via XDG_* (honored directly,
# bypassing the passwd lookup); docker-entrypoint.sh creates them owned by openwa. On a read_only
# rootfs these live on the tmpfs /tmp. HOME is kept for any other HOME-relative tooling. See #254/#242.
ENV HOME=/app/data
ENV XDG_CONFIG_HOME=/tmp/.config
ENV XDG_CACHE_HOME=/tmp/.cache

# Copy entrypoint: runs as root to fix named-volume ownership, then drops to openwa via gosu
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 2785

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:2785/api/health/ready || exit 1

# dumb-init is PID 1 and handles signal forwarding.
# It execs docker-entrypoint.sh (as root), which fixes volume ownership and
# then drops to the openwa user via gosu before starting the node process.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "backend/dist/main"]
