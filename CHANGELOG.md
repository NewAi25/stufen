# Changelog

All notable changes to Stufen. Format follows Keep a Changelog. Versions follow semver as described in `docs/08-versioning-and-git.md`.

## [Unreleased]

## [0.1.0] - 2026-11-06

Phase 0, the foundation. A learner on a local build can pick German, set a target level, change settings and leave feedback. No lessons yet.

### Added
- Workspace tooling: pnpm workspace, root tsconfig, Vitest, ESLint, Prettier, and CI that migrates a Postgres 16 service, typechecks, lints, checks formatting, box boundaries and content, runs every test and builds the web app.
- `contracts` 0.3.0: shared types, the event map, an in process event bus, and the auth, storage and mail ports.
- `db` 0.4.0: Kysely on plain Postgres, a migration runner, typed tables, `withUser` for row security, migrations 0001 to 0003.
- `core-auth` 0.1.0 (in memory, two step magic link), `core-mail` 0.1.0 (console adapter), `core-storage` 0.1.0 (filesystem adapter with signed URLs).
- `core-identity` 0.1.0, `core-entitlements` 0.1.0 (free_beta plan and daily limits), `core-analytics` 0.1.0, `core-feedback` 0.1.0, each with a storage port and an in memory adapter.
- `ui-kit` 0.2.0: tokens for light and dark, Button, Card, Progress, TextInput, TextArea, Choice, RatingInput, Toast, Sheet and FeedbackFab, with keyboard and screen reader support and contrast tests.
- `apps/web` 0.3.0: Next.js app shell, composition root, onboarding, settings, feedback on every page, a kit gallery and a health route.
- `docs/14-levels-in-real-life.md` and verified German exam formats.

### Changed
- Provider independence (ADR-008): no Supabase or similar service. Plain Postgres through `db`, ports and adapters for auth, storage and mail, Docker Postgres for local and CI.
- A level is reached only with production evidence and scenario tasks, never on exercise accuracy alone.

### Fixed
- Migration 0003 closes access defects in the first schema: the app role reads only the own `users` row and cannot write it, cannot touch the migration ledger, and can record anonymous events.

### Not in this release
- Sign in pages and the Postgres adapters for the boxes. Local development uses a dev session and in memory stores, so data is lost on restart. Both arrive in Phase 1.
- A hosted preview. That is row P1-40.

## [0.0.1] - 2026-09-09

### Added
- Planning package: builder prompt, PRD, architecture, data schema, module contracts, curriculum spine, UI and UX spec, build sequence, versioning rules, content pack spec, AI tutor design, testing strategy, entitlements design, roadmap, ADRs 001 to 007.
- Box skeletons under `packages/` with `module.json` and README for every planned box.
- First Supabase migration `0001_init.sql` (not yet applied).
- Content pack JSON schemas and a sample German A1 unit.
- `scripts/check-boundaries.mjs` and `scripts/validate-content.mjs`.
