# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG APP_RELEASE=development

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM dependencies AS build
COPY backend/tsconfig.json backend/tsconfig.json
COPY backend/src backend/src
RUN npm run backend:build \
    && find backend/dist -type f -name '*.map' -delete

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts \
    && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ARG APP_RELEASE
ENV NODE_ENV=production \
    APP_RELEASE=${APP_RELEASE}
WORKDIR /app

# The runtime does not need package managers. Removing them reduces both the
# attack surface and vulnerabilities inherited from npm's bundled toolchain.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --chown=node:node backend/migrations ./backend/migrations

USER node
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const p=process.env.PORT||process.env.BETINTEL_BACKEND_PORT||3333;fetch(`http://127.0.0.1:${p}/v1/health/ready`).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "--import", "./backend/dist/telemetry/instrumentation.js", "backend/dist/server.js"]
