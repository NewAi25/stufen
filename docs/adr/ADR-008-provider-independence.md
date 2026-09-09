# ADR-008: Provider independence

Status: Accepted
Date: 2026-09-09

Supersedes the Supabase and Vercel specific parts of ADR-002. ADR-002 remains accepted for Next.js, TypeScript, Tailwind and pnpm workspaces.

## Context

The owner does not want Stufen tied to Supabase or any similar hosted service. ADR-002 chose Supabase for Postgres, auth and storage, and Vercel for hosting, because the free tiers and MCP tooling made a one person team faster. That reasoning still holds for speed, but it puts auth, storage, migrations and the security model behind one vendor's API.

Nothing has been applied yet. There is no application code, no migration has run against any shared environment, and no user exists. The cost of changing course today is a documentation change. The cost in six months would be a rewrite of every core box.

The rule the owner set: the code assumes only open, replaceable things. A hosted provider is a deployment choice made through environment variables, never a dependency in code.

## Decision

Stufen depends on PostgreSQL and open source libraries only. No provider specific code anywhere.

- Database: PostgreSQL 16 or later, accessed through the Kysely query builder with the pg driver, in a new package `packages/db` (box name `db`, kind `infra`). Migrations are numbered plain SQL files in `packages/db/migrations/` run by a small runner we own (`pnpm db:migrate`). The `supabase/` directory is removed. Local development and tests use Postgres in Docker (`docker-compose.yml` at root). Hosted Postgres from any provider (Supabase, Neon, a VPS) is a deployment choice made only through environment variables (`DATABASE_URL`).
- Sign in: a new box `core-auth` using the open source better-auth library, storing users, sessions, accounts and verification tokens in our own Postgres. Magic link and Google sign in. It owns the `users` table. `profiles.id` references `users.id`. Replaceable behind an `AuthPort` interface (getSession, signInMagicLink, signInOAuth, signOut).
- Authorisation: each box checks the signed in user id itself. Postgres row level security stays as defence in depth, keyed on a per request session variable `app.user_id` set with `set_config` at the start of each request, read with `current_setting('app.user_id', true)`. No provider functions in SQL.
- Files: a new box `core-storage` with a `StoragePort` (put, get, delete, signedUrl) and two adapters: local filesystem (dev and tests) and S3 compatible (Cloudflare R2, MinIO, or any S3 endpoint). `core-speech` uses it for recordings.
- Email: a new box `core-mail` with a `MailPort` (send) and two adapters: console (dev and tests) and SMTP. Used by core-auth for magic links, later by notifications.
- Hosting: a Dockerfile builds the web app. Vercel still works, so does any VPS. No provider specific code anywhere.
- Dependency rules become: contracts depends on nothing; db depends on contracts; core-* may depend on contracts and db; lang-* on contracts; ui-kit on contracts; apps/web on anything.
- Rule for every box that persists data: it defines a small storage port (the reads and writes it needs), ships an in memory adapter used in unit tests, and a Postgres adapter using db. Unit tests never touch a network or an account. Integration tests run against the Docker Postgres.

Environment variables follow `.env.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STORAGE_DRIVER`, `S3_*`, `MAIL_DRIVER`, `SMTP_URL`, plus the existing `ANTHROPIC_API_KEY` and `STUFEN_*` settings.

## Consequences

We own more code. Auth flows (magic link, Google, sessions) run in `core-auth` on better-auth rather than on a vendor service. Magic link email needs `core-mail` and an SMTP account in production. The migration runner is ours, about fifty lines, and we keep it working. Operations are ours too: backups, upgrades and monitoring of whichever Postgres we deploy on.

What gets easier. The whole app runs offline with `docker compose up -d db`. Unit tests use in memory adapters and never touch a network. Integration tests run against a throwaway Postgres in Docker, locally and in CI, with no account or key. Hosting is a price comparison, not a migration: any Postgres and any container host work, and moving between them changes environment variables only. Row level security no longer depends on a provider's JWT claims, so the same policies hold on every host.

What we must do now. Add the `db`, `core-auth`, `core-storage` and `core-mail` boxes to the build sequence before `core-identity`. Write the migration runner and the Docker Compose file in Phase 0. Rewrite the RLS policies in terms of `app.user_id`. Update `docs/02`, `docs/03`, `docs/11`, `docs/12`, `README.md`, `.env.example` and `CLAUDE.md` in the same change as this ADR.

## Alternatives considered

Stay on Supabase. Rejected: fastest to start, but auth, storage, RLS helpers and the dashboard all pull code toward the vendor. The owner ruled out the lock in while it still costs nothing to leave.

Firebase. Rejected in ADR-002 and again here: document model fits the CEFR spine badly, and it is a deeper lock in than Supabase.

Fully self hosted from day one, Postgres and the app on a VPS we operate. Rejected as a requirement: it costs money and an operator before there is a user. The decision above makes it possible at any time without code changes, which is the point. It is a deployment choice, not an architecture choice.
