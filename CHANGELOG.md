# Changelog

All notable changes to Stufen. Format follows Keep a Changelog. Versions follow semver as described in `docs/08-versioning-and-git.md`.

## [Unreleased]

## [0.2.0] - 2026-11-15

Phase 1, the German A1 slice. A learner who starts from zero can sign in with a link sent by mail, work through all eight A1 units, review what the lessons introduced, and watch the evidence for each A1 descriptor grow. Everything is stored in Postgres.

### Added
- The German A1 course in `content/de`, pack 0.1.1: 45 descriptors from the CEFR Companion Volume, 813 vocabulary items, 8 units, 56 lessons and 706 exercises. Every exercise is proven gradeable by a test, and no item is used before the lesson that introduces it. 768 items cite the published word list that prints them (Goethe A1, A2 and B1, the DTZ list, Profile deutsch). 45 are marked unverified with a note that says why.
- Sign in with a magic link (ADR-009). Tokens are stored hashed and work once. Mail goes through SMTP or, in development, to the console.
- A Postgres adapter beside the in memory adapter in every box that stores data: `core-auth` 0.2.0, `core-identity` 0.2.0, `core-entitlements` 0.2.2, `core-analytics` 0.2.0, `core-feedback` 0.2.0, `core-curriculum` 0.3.0, `core-content` 0.2.0, `core-lesson-engine` 0.2.0, `core-srs` 0.2.1 and `core-progress` 0.2.0.
- `core-curriculum`, `core-content`, `core-lesson-engine`, `core-exercise-types` 0.1.1, `core-srs` and `core-progress`: the path through the course, pack validation and install, lesson sessions and attempts, eight deterministic graders, FSRS review scheduling, and the mastery and level rules.
- `lang-de` 0.1.1: the German pack loader, answer normalisation and error classification.
- `db` 0.8.0: migrations 0004 to 0006. Daily usage view, descriptor outcomes, lesson fields, one open session per lesson, one active pack version, and content tables the app role can read but not write.
- `ui-kit` 0.4.0: renderers for the eight exercise types, the level map, level badge, audio button and inline correction.
- `apps/web` 0.5: sign in, the lesson player, review, the daily home screen and the level map on `/progress`.
- `contracts` 0.7.0 and `core-storage` 0.2.0: `StoragePort.head`. `core-mail` 0.2.0: the SMTP adapter.
- `pnpm pack:install de` installs a content pack into the database. It is safe to run twice.
- A Dockerfile and a compose stack with database, mail catcher, setup step and the web app. CI starts the stack on every push and runs an end to end browser test against it: sign in by mail, onboarding, a full A1 lesson, a review session and the level map.
- `scripts/validate-content.mjs` checks the unit ending rule, plural only nouns and the order in which items are introduced.

### Changed
- Exercises whose type has no grader yet (translation, free writing, speaking) are shown with a self check and count toward nothing. A self rated flashcard feeds review but no descriptor. Unchecked production cannot raise a level.
- The production threshold of the mastery rule depends on the level: 3 of 5 up to B2, 4 of 5 at C1 and C2.
- Database tests of different boxes run one after another (`pnpm test:db`), because they share one database.

### Fixed
- Migration 0005: a learner can no longer create a profile for another id, and plan limits are stored as overrides only.
- Migration 0006: a learner can only record attempts in an own session, and two tabs cannot open two sessions for one lesson.

### Not in this release
- A hosted preview (row P1-40). The app runs in Docker on any host; which host and which domain is still to be chosen.
- The AI tutor, writing grading and speech. Those are Phases 2 and 3.
- Google sign in (row P1-46, parked).

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
