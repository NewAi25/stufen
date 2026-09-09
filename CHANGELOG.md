# Changelog

All notable changes to Stufen. Format follows Keep a Changelog. Versions follow semver as described in `docs/08-versioning-and-git.md`.

## [Unreleased]

### Changed
- Provider independence (ADR-008): plain Postgres through the new `db` box with Kysely and SQL migrations in `packages/db/migrations/`, `core-auth`, `core-storage` and `core-mail` boxes with ports and adapters, Docker Postgres for local and CI, `supabase/` removed. Migration 0001 rewritten with an own `users` table and RLS keyed on `app.user_id`.

### Added
- Workspace tooling: pnpm workspace, root tsconfig, Vitest, ESLint, Prettier, CI steps for typecheck, lint and format

## [0.0.1] - 2026-09-09

### Added
- Planning package: builder prompt, PRD, architecture, data schema, module contracts, curriculum spine, UI and UX spec, build sequence, versioning rules, content pack spec, AI tutor design, testing strategy, entitlements design, roadmap, ADRs 001 to 007.
- Box skeletons under `packages/` with `module.json` and README for every planned box.
- First Supabase migration `0001_init.sql` (not yet applied).
- Content pack JSON schemas and a sample German A1 unit.
- `scripts/check-boundaries.mjs` and `scripts/validate-content.mjs`.
