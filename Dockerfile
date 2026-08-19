# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The project postinstall runs Prisma generation, but schema/source are copied only
# in the builder stage. Install deterministically here and generate after COPY.
RUN npm ci --ignore-scripts

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build-only@127.0.0.1:5432/build \
    AUTH_SECRET=build-only-secret-not-used-at-runtime
RUN npx prisma generate && npm run build

FROM deps AS migrate
WORKDIR /app
ARG GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA
ENV NODE_ENV=production \
    npm_config_cache=/tmp/npm-cache
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app --shell /usr/sbin/nologin nextjs
COPY --from=builder /app/src/generated ./src/generated
COPY prisma.config.ts package.json package-lock.json ./
COPY prisma ./prisma
USER 1001:1001
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ARG GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app --shell /usr/sbin/nologin nextjs \
    && mkdir -p /app/storage/archives /app/storage/templates /app/storage/generated \
    && chown -R nextjs:nodejs /app/storage \
    && chmod 0700 /app/storage /app/storage/archives /app/storage/templates /app/storage/generated

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER 1001:1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
