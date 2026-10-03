# syntax=docker/dockerfile:1
FROM node:24.15.0-bookworm-slim AS build
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY apps/worker apps/worker

FROM build AS api-build
RUN pnpm --filter @schedlane/api build \
    && pnpm --filter @schedlane/api deploy --prod /output

FROM build AS worker-build
RUN pnpm --filter @schedlane/worker build \
    && pnpm --filter @schedlane/worker deploy --prod /output

FROM node:24.15.0-bookworm-slim AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=api-build --chown=node:node /output ./
USER node
EXPOSE 3000
# Kysely serializes migrations with its database lock. A failure prevents startup.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/index.js"]

FROM node:24.15.0-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=worker-build --chown=node:node /output ./
USER node
CMD ["node", "dist/index.js"]
