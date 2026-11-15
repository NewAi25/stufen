# Stufen

Learn a language from zero to CEFR C2. German first, then Dutch and French.

Stufen is built as a set of small boxes. Each box does one job, has one public interface and can be changed or replaced on its own. The wiring lives in one place. When a feature changes, one box changes.

## Status

Version 0.2.0, Phase 1 complete (15 November 2026). The German A1 course is in: 8 units, 56 lessons, 706 exercises and 813 vocabulary items. A learner who starts from zero can sign in with a link sent by mail, work through the lessons, review what they introduced and see the evidence for each A1 descriptor on the level map. Everything is stored in Postgres and the whole app runs in Docker. A level is never granted on exercise accuracy alone; see [docs/14-levels-in-real-life.md](docs/14-levels-in-real-life.md).

Not built yet: the AI tutor and writing grading (Phase 2), speech and A2 (Phase 3), and a hosted preview. See the progress table in [docs/07-build-sequence.md](docs/07-build-sequence.md).

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
  scripts/                  repo checks (boundaries, content validation) and pack install
  docker-compose.yml        Postgres for development, or the whole app with profile app
  Dockerfile                builds the web app for any container host
```

## Stack

Next.js and TypeScript on the front. PostgreSQL through Kysely on the back, with our own magic link sign in in our own tables (ADR-009), files behind a storage port (local filesystem or any S3 endpoint) and mail behind a mail port (console or SMTP). Claude API for the tutor and grading, FSRS for spaced repetition, browser speech APIs first for listening and speaking. Local development runs Postgres in Docker. Hosting is a Dockerfile, so Vercel, a VPS or any container host works. No provider specific code anywhere; see `docs/adr/ADR-008-provider-independence.md`.

## Commands

```
pnpm install
docker compose up -d db        start Postgres for local development and tests
pnpm db:migrate                apply migrations in packages/db/migrations/
pnpm pack:install de           install the German content pack into the database
pnpm dev                       run the web app
pnpm test                      run every box's tests
pnpm test:db                   run the database tests, one box after another
pnpm --filter @stufen/web e2e  run the end to end browser test against a running app
node scripts/check-boundaries.mjs      verify no box imports another box's internals
node scripts/validate-content.mjs      validate content packs against schema
```

## Run the whole app in Docker

```
docker compose --profile app up --build
```

This starts Postgres, applies the migrations, installs the German pack, starts a local mail catcher and the web app. Open http://localhost:3000 and sign in with any email address. The sign in link arrives in the mail catcher at http://localhost:8025. The secrets in `docker-compose.yml` are local placeholders; a real deployment sets its own `APP_URL` (https), `SMTP_URL`, `MAIL_FROM`, `DATABASE_URL` and `STORAGE_SIGNING_SECRET`.
