# Multi stage build for apps/web. The build and run stages are placeholders
# until the apps/web rows in docs/07-build-sequence.md land a Next.js app with
# `output: 'standalone'`; then the run stage copies .next/standalone.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# Install with the lockfile only, so this layer is cached until deps change.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# Build apps/web. Placeholder: completed in the apps/web rows.
FROM deps AS build
COPY . .
RUN pnpm --filter @stufen/web build

# Run stage. Placeholder: completed in the apps/web rows.
FROM node:24-alpine AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "-e", "console.log('apps/web is not built yet; see docs/07-build-sequence.md')"]
