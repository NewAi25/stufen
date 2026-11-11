# Image for apps/web. No provider specific step: it runs on any Docker host.
#
#   docker build -t stufen-web .
#   docker build --target tools -t stufen-tools .   # migrations and pack install
#
# The run stage holds only the Next.js standalone output and the content packs.
# The tools stage holds the whole workspace, for `pnpm db:migrate` and
# `pnpm pack:install de` at deploy time.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# Whole workspace with dependencies. Also the image for deploy time tools.
FROM base AS tools
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile

FROM tools AS build
RUN pnpm --filter @stufen/web build

FROM node:24-alpine AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STUFEN_CONTENT_DIR=/app/content
WORKDIR /app
RUN addgroup -S stufen && adduser -S stufen -G stufen
# The standalone output mirrors the repo layout, so the server entry is
# apps/web/server.js. Static files are not part of it and are copied beside it.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
# The German pack is read from disk when the app starts.
COPY --from=build /app/content ./content
USER stufen
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
