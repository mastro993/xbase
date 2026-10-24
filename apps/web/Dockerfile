# syntax=docker/dockerfile:1
# XBase web, self-hosted. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t xbase .
# See apps/web/README.md for running it, and compose.yaml for an example.

FROM node:24-slim AS build
ENV CI=1
# Pinned to packageManager in package.json. A global install also works on Node 25+, which
# ships without Corepack.
RUN npm install -g pnpm@10.33.0
WORKDIR /repo
# Download every package from the lockfile alone, so this layer stays cached until it changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --store-dir /pnpm/store
COPY . .
# The web app and the workspace packages it depends on; the extension is left out.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store --filter @xbase/web...
RUN pnpm --filter @xbase/web build

# Same base image as the build, so anything Nitro traced matches the libc and architecture.
FROM node:24-slim AS runtime
# SERVER_SHUTDOWN_TIMEOUT: seconds srvx (Nitro's server) waits for requests when it stops,
# under Docker's 30-second stop timeout in the README and compose.yaml. Its default is 5.
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/xbase.db \
    MIGRATIONS_DIR=/app/drizzle \
    SERVER_SHUTDOWN_TIMEOUT=25
WORKDIR /app
# .output is self-contained (Nitro bundles the dependencies); the migrations run at boot.
COPY --from=build --chown=node:node /repo/apps/web/.output ./.output
COPY --from=build --chown=node:node /repo/packages/db/drizzle ./drizzle
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
