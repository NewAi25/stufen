# Stufen

Learn a language from zero to CEFR C2. German first, then Dutch and French.

Stufen is built as a set of small boxes. Each box does one job, has one public interface and can be changed or replaced on its own. The wiring lives in one place. When a feature changes, one box changes.

## Status

Planning complete. No application code yet. See the progress table in [docs/07-build-sequence.md](docs/07-build-sequence.md).

## Read in this order

1. [CLAUDE.md](CLAUDE.md), the builder prompt. Rules every change follows.
2. [docs/01-prd.md](docs/01-prd.md), what we are building and why.
3. [docs/02-architecture.md](docs/02-architecture.md), the box map.
4. [docs/07-build-sequence.md](docs/07-build-sequence.md), what is done, next and planned.

Full index of documents is in the table at the bottom of `CLAUDE.md`.

## Layout

```
stufen/
  CLAUDE.md                 builder prompt (rules)
  README.md
  CHANGELOG.md              release history
  docs/                     all plans and specs
  docs/adr/                 architecture decision records
  packages/                 the boxes (core-*, lang-*, ui-kit, contracts, db)
  packages/db/migrations/   numbered SQL migrations, run by pnpm db:migrate
  apps/web/                 the Next.js app that wires boxes together
  content/                  language content packs (data only)
  content/schema/           JSON schemas every pack validates against
  scripts/                  repo checks (boundaries, content validation)
  docker-compose.yml        Postgres for local development and tests
  Dockerfile                builds the web app for any container host
```

## Stack

Next.js and TypeScript on the front. PostgreSQL through Kysely on the back, with sign in by better-auth in our own tables, files behind a storage port (local filesystem or any S3 endpoint) and mail behind a mail port (console or SMTP). Claude API for the tutor and grading, FSRS for spaced repetition, browser speech APIs first for listening and speaking. Local development runs Postgres in Docker. Hosting is a Dockerfile, so Vercel, a VPS or any container host works. No provider specific code anywhere; see `docs/adr/ADR-008-provider-independence.md`.

## Commands (once Phase 0 lands)

```
pnpm install
docker compose up -d db        start Postgres for local development and tests
pnpm db:migrate                apply migrations in packages/db/migrations/
pnpm dev                       run the web app
pnpm test                      run every box's tests
node scripts/check-boundaries.mjs      verify no box imports another box's internals
node scripts/validate-content.mjs      validate content packs against schema
```
