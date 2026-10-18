# ============================================================
# File:        Dockerfile
# Path:        deploy/site/Dockerfile
# Project:     Seasonal Entertainment
# Description: The site's production image: the built client and the Node server in one
#              process (docs/ARCHITECTURE.md), run as the unprivileged "node" user. Multi-stage:
#              the build stage installs everything and builds the client; the runtime stage
#              gets only production dependencies, the server, the shared code, the built client
#              and the operations scripts (backup, restore, first admin). Base image pinned by
#              digest. Build from the repository root: docker build -f deploy/site/Dockerfile
#              --build-arg COMMIT_SHA=$(git rev-parse HEAD) . (docs/DEPLOYMENT.md). CI builds it
#              on every pull request.
# ============================================================

# node 24.22.0 on Debian 12 (glibc: the prebuilt better-sqlite3, bcrypt and sharp binaries
# fit), pinned by digest so a moved tag cannot change the image.
ARG NODE_IMAGE=node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Native modules build from source only if no prebuilt binary fits; then these are needed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# Manifests first: the dependency layer is reused while only code changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY server server
COPY client client
COPY scripts/backup.mjs scripts/restore.mjs scripts/bootstrap-admin.mjs scripts/
# Then only what runs stays: production dependencies, no tests.
RUN npm run build && npm prune --omit=dev && rm -rf server/test shared/*.test.js

FROM ${NODE_IMAGE} AS runtime
ARG COMMIT_SHA=unknown
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3800 \
    DATABASE_PATH=/data/seasonal.db \
    MEDIA_DIR=/data/media \
    BACKUP_DIR=/backups \
    COMMIT_SHA=${COMMIT_SHA}
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/shared shared
COPY --from=build /app/server server
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/scripts scripts
# The data and backup folders belong to the unprivileged user; volumes mount over them.
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
VOLUME ["/data", "/backups"]
EXPOSE 3800
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3800/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/src/index.js"]
