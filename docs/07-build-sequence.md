# 07. Build sequence

This table is the single source of truth for progress. Nothing else records status. Not the README, not a tracker, not memory.

## How to read and update it

Each row is one work item that fits in one box and one commit. Read the rows top to bottom. The order is the build order.

| Status | Meaning |
|--------|---------|
| `done` | Merged to main. The acceptance check passes. |
| `next` | Ready to start. Every dependency is done. At most three rows are `next` at once. |
| `in_progress` | Someone is on it right now. At most one row per person. |
| `planned` | Not started. May still be reworded or split. |
| `parked` | Deliberately stopped. The reason is in the parked table at the end. |

Rules for updating:

1. Every commit that changes a box's status or version edits that box's row in the same commit.
2. When a row goes to `done`, set `Box version after` to the version now in that box's `module.json`, and add a row to the sequence log at the bottom.
3. When a row goes to `done`, look at the rows that depended on it. Any row whose dependencies are now all done becomes `next`.
4. Do not add columns. Do not reorder rows. New work goes in as a new row with the next free ID in its phase, or as a split of an existing row (`P1-09a`, `P1-09b`).
5. A row that turns out to be too big gets split before it starts, not after.

## Phase overview

| Phase | Goal | Exit criteria (all must be checkable) | Target version | Git tag |
|-------|------|----------------------------------------|----------------|---------|
| 0 Foundation | Repo builds, boundaries enforced, the database migrates, every outside dependency sits behind a port, a user can leave feedback locally | `pnpm test` green; `check-boundaries` green in CI; db migrates 0001 on Docker Postgres; auth, storage and mail ports exist with in memory or fs adapters; the layout renders on a Vercel or Docker host preview; one feedback row written from the app through the in memory adapter; `entitlements.can` returns true for `free_beta` | 0.1.0 | `v0.1.0` |
| 1 German A1 vertical slice | A zero start learner can sign in, complete an A1 lesson, review items, and see mastery move | A1 pack installs from `content/de`; all eight A1 units open; a Playwright run finishes one lesson and one review; `cando_mastery` rows change after the run; level map shows A1 evidence; sign in works with magic link on a preview deployment; unit tests run with no network | 0.2.0 | `v0.2.0` |
| 2 AI tutor and feedback | Tutor conversation, writing grading and AI graded exercises work within daily limits | `/tutor` streams a reply with corrections; `/write` returns rubric scores 0 to 5; `translate` and `write_free` grade through `aiGrade`; a user hitting the daily limit gets a clear message; 50 sample corrections hand checked at 90 percent | 0.3.0 | `v0.3.0` |
| 3 Speech, A2 content, placement | Speaking exercises work in the browser, A2 pack ships, placement test lands restarters | `speak_prompt` records, transcribes and scores; A2 pack installs and validates; placement finishes in under 15 minutes and writes a `level_estimates` row; immersion ramp shows German toggle at A2 | 0.4.0 | `v0.4.0` |
| 4 B1 and B2 content, checkpoints, analytics | Learners can be promoted by evidence plus checkpoint; beta measures are readable | B1 and B2 packs install; checkpoint tests exist for A1 to B2; `level.reached` fires from mastery ratio plus checkpoint; a script prints the six beta measures from `docs/01-prd.md` | 0.5.0 | `v0.5.0` |
| 5 C1 and C2 content, exam simulation, public beta hardening | Full ladder to C2, exam formats simulated, app fit for strangers | C1 and C2 packs install; Goethe and telc formats run in `exam_sim`; PWA installable; accessibility pass on every route; RLS audit clean; then four weeks of beta fixes | 0.9.0 then 1.0.0 | `v0.9.0`, `v1.0.0` |
| 6 Dutch pack | Second language with no core change | `content/nl` and `lang-nl` install with zero commits touching `core-*`; a learner can switch active language and complete an NL A1 lesson | 1.1.0 | `v1.1.0` |
| 7 French pack | Third language with no core change | Same as Phase 6 for `content/fr` and `lang-fr` | 1.2.0 | `v1.2.0` |
| 8 Entitlements and payments switched on | Plans exist, one payment adapter, no learner loses access | Stripe adapter passes webhook tests; a `plus` user sees higher limits; every `free_beta` user is migrated to a named plan with no feature lost on day one | 1.3.0 | `v1.3.0` |

## The main table

Box versions start at 0.0.1 (skeleton) and go to 0.1.0 with the first real feature. Content pack versions are the `version` in `content/<lang>/pack.json` and move independently.

| ID | Phase | Box | Work item | Depends on | Box version after | Status | Acceptance check | Planned commit message |
|----|-------|-----|-----------|------------|-------------------|--------|------------------|------------------------|
| P0-01 | 0 | docs | Planning package: docs 01 to 13 | none | repo 0.0.1 | done | All thirteen docs exist under `docs/` and are linked from `CLAUDE.md` | `docs(repo): add planning package v0.0.1` |
| P0-02 | 0 | docs/adr | ADRs 001 to 007 | P0-01 | repo 0.0.1 | done | Seven files under `docs/adr/` each with status accepted | `docs(repo): add ADRs 001 to 007` |
| P0-03 | 0 | packages | Box skeletons: `module.json`, README, empty `src/index.ts`, `CHANGELOG.md` for every box | P0-01 | all boxes 0.0.1 | done | Every box directory named in `docs/02` has the five files | `chore(repo): add box skeletons` |
| P0-04 | 0 | db | Migration `0001_init.sql` written in `packages/db/migrations/` | P0-01 | schema 0001 | done | File exists, has a rollback comment block, and parses in `psql --dry-run` style check | `feat(db): add 0001_init migration` |
| P0-05 | 0 | content/schema | JSON schemas for pack, cando, item, unit, lesson, exercise, exam format, ramp | P0-01 | schema 0.1.0 | done | Eight schema files load and `validate-content.mjs` uses all of them | `feat(content-schema): add pack JSON schemas` |
| P0-06 | 0 | content/de | Sample A1 unit 1 with two lessons | P0-05 | pack 0.0.1 | done | `node scripts/validate-content.mjs de` passes on the sample | `content(de-a1): add sample unit 1` |
| P0-07 | 0 | scripts | `check-boundaries.mjs` | P0-03 | n/a | done | Script exits 1 when a test fixture imports across a boundary, 0 on the clean repo | `feat(scripts): add check-boundaries` |
| P0-08 | 0 | scripts | `validate-content.mjs` | P0-05 | n/a | done | Script exits 1 on a fixture with a missing cando reference, 0 on the sample pack | `feat(scripts): add validate-content` |
| P0-09 | 0 | repo | pnpm workspace, root tsconfig, Vitest, ESLint, Prettier | P0-03 | repo 0.0.2 | done | `pnpm install` then `pnpm test` runs and reports zero failing suites | `chore(repo): add workspace tooling` |
| P0-10 | 0 | contracts | Shared types, `EventMap`, `EventBus` interface, `GradeResult`, `LanguagePack` | P0-09 | 0.1.0 | done | `pnpm --filter contracts test` passes a type level test that every event in `docs/04` is in `EventMap` | `feat(contracts): add shared types and event map` |
| P0-11 | 0 | contracts | In process event bus implementation with `emit`, `on`, `onAny` | P0-10 | 0.2.0 | done | Test: two subscribers on one event both run; `onAny` sees every emit; unsubscribe stops delivery | `feat(contracts): add in process event bus` |
| P0-12 | 0 | CI | GitHub Actions: install, `check-boundaries`, `validate-content`, `pnpm test` on every push | P0-09 | n/a | done | Workflow has install, typecheck, lint, format, boundaries, content and test steps; done when a push shows green | `chore(ci): add push workflow` |
| P0-13 | 0 | db | `db` box 0.1.0: Kysely with the pg driver, local Docker Postgres via `docker-compose.yml`, migration runner `pnpm db:migrate` reading `packages/db/migrations/`, migration 0001 applied locally | P0-04, P0-09 | 0.1.0 | done | `docker compose up -d db` then `pnpm db:migrate` applies 0001 and `schema_migrations` has one row | `feat(db): add migration runner and docker postgres` |
| P0-14 | 0 | ui-kit | Tokens plus `Button`, `Card`, `Progress`, `TextInput`, `Choice`, `Toast` | P0-10 | 0.1.0 | done | Storybook or a test page renders all six in light and dark | `feat(ui-kit): add tokens and base components` |
| P0-15 | 0 | apps/web | Next.js App Router scaffold, layout, Tailwind, ui-kit wired, preview on Vercel or Docker host | P0-14 | 0.1.0 | done | Local production build (`next build` then `next start`) renders the layout with a ui-kit `Button`; the hosted preview is row P1-40 | `feat(web): scaffold app and layout` |
| P0-16 | 0 | core-identity | `ProfileStore` port plus in memory adapter; `getProfile`, `updateProfile`, `setActiveLanguage`, `listLearnerLanguages`; no sign in, that lives in `core-auth` | P0-11 | 0.1.0 | done | Test: `setActiveLanguage` writes `learner_languages` in the in memory store and emits `user.language_set` | `feat(core-identity): add profile api and in memory store` |
| P0-17 | 0 | apps/web | `/settings` and `/onboarding` language and target level, using a dev session from the `core-auth` in memory adapter | P0-15, P0-16, P0-25 | 0.2.0 | planned | Locally with the dev session, `/settings` shows the display name and `/onboarding` sets the active language | `feat(web): add settings and onboarding` |
| P0-18 | 0 | core-entitlements | `EntitlementStore` port plus in memory adapter; `free_beta` default, `can`, `remaining`, `consume`, `plan`, `flag` with limits from the `entitlements` row | P0-11 | 0.1.0 | done | Test: new user gets `free_beta`; `can(user, 'tutor')` true; `consume` past limit throws | `feat(core-entitlements): add free_beta plan and limits` |
| P0-19 | 0 | core-analytics | `EventStore` port plus in memory adapter; `attach(bus)` subscribes `onAny` and writes `events`; `track` | P0-11 | 0.1.0 | done | Test: emitting `user.signed_up` produces one `events` row with that name | `feat(core-analytics): add event sink` |
| P0-20 | 0 | core-feedback | `FeedbackStore` port plus in memory adapter; `submit`, `listMine`, anonymous insert allowed | P0-11 | 0.1.0 | done | Test: `submit` without `userId` inserts a row and emits `feedback.submitted` | `feat(core-feedback): add submit and listMine` |
| P0-21 | 0 | ui-kit | `FeedbackFab`, `Sheet` | P0-14 | 0.2.0 | done | Fab opens a sheet with kind, message and rating fields | `feat(ui-kit): add FeedbackFab and Sheet` |
| P0-22 | 0 | apps/web | `/feedback` route and FeedbackFab on every page | P0-17, P0-20, P0-21 | 0.3.0 | planned | Locally, submit feedback in under 30 seconds and see the row returned by `feedback.listMine` | `feat(web): wire feedback` |
| P0-24 | 0 | db | `db` 0.2.0: typed `DB` interface for every table in migration 0001, `withUser(db, userId, fn)` that runs `fn` in a transaction with `app.user_id` set for RLS | P0-13 | 0.2.0 | done | Type test: every table in 0001 has a key in `DB`; integration test on Docker Postgres: inside `withUser(A)` a select on `profiles` returns only A's row | `feat(db): add typed schema and withUser` |
| P0-25 | 0 | core-auth | `AuthPort` interface (`getSession`, `requestMagicLink`, `consumeMagicLink`, `signInWithGoogle`, `signOut`) plus in memory adapter with tests; no library yet | P0-11 | 0.1.0 | done | Test: in memory adapter issues a link token for an email, consuming it creates a session that `getSession` returns; an unknown token returns null | `feat(core-auth): add AuthPort and in memory adapter` |
| P0-26 | 0 | db | Migration `0002_auth.sql` written, owned by `core-auth`: better-auth `users`, `sessions`, `accounts`, `verifications` tables with RLS keyed on `app.user_id` | P0-13, P0-25 | schema 0002 | done | File has a rollback block; `pnpm db:migrate` applies 0001 and 0002 and `schema_migrations` has two rows | `feat(db): add 0002 auth migration` |
| P0-27 | 0 | core-storage | `StoragePort` (`put`, `get`, `signedUrl`, `delete`) plus fs adapter with tests | P0-10 | 0.1.0 | done | Test: `put` then `get` round trips a file under a user prefix on the local filesystem; a key outside the prefix throws | `feat(core-storage): add StoragePort and fs adapter` |
| P0-28 | 0 | core-mail | `MailPort` (`send`) plus console adapter | P0-10 | 0.1.0 | done | Test: console adapter prints to, subject and body of one message and returns a message id | `feat(core-mail): add MailPort and console adapter` |
| P0-29 | 0 | db | Migration `0003_policy_fixes.sql`: row security on `users` with select own only, writes on `users` and all access to `schema_migrations` revoked from `stufen_app`, anonymous `events` inserts allowed, `feature_flags` updated_at trigger, explicit grants from now on | P0-26 | 0.4.0 | done | On a real Postgres as `stufen_app`: a user reads only the own `users` row and cannot write it, cannot read `schema_migrations`, an anonymous event insert succeeds | `fix(db): add 0003 policy fixes` |
| P0-23 | 0 | release | Tag v0.1.0 | P0-12, P0-17, P0-18, P0-19, P0-22, P0-24, P0-26, P0-27, P0-28, P0-29 | repo 0.1.0 | planned | Tag exists, root CHANGELOG has a 0.1.0 section, preview deploy green | `release(repo): v0.1.0` |
| P1-01 | 1 | core-curriculum | `CurriculumStore` port plus in memory adapter; `listLevels`, `listCandos`, `getCando`, `listUnits`, `listLessons`, `getLesson` | P0-10 | 0.1.0 | planned | Test against seeded in memory rows: `getLesson` returns exercises in ordinal order | `feat(core-curriculum): add read api` |
| P1-27 | 1 | core-curriculum | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P1-01, P0-24 | 0.2.0 | planned | Integration test: the same read api tests pass against Docker Postgres with seeded rows | `feat(core-curriculum): add postgres adapter` |
| P1-02 | 1 | core-content | `registerPack`, `validatePack` (schema plus referential checks) | P0-10, P1-01 | 0.1.0 | planned | Test: a pack with a dangling `item_ids` entry fails validation with the id in the report | `feat(core-content): add pack registry and validation` |
| P1-03 | 1 | core-content | `ContentStore` port plus in memory adapter; `installPack`, `content_pack_versions` write, `activePackVersion`, emits `content.pack_installed` | P1-02 | 0.2.0 | planned | Test: install writes units, lessons, exercises, items and one `active` version row | `feat(core-content): add installPack` |
| P1-28 | 1 | core-content | 0.3.0 Postgres adapter via `db`, integration test against Docker Postgres | P1-03, P0-24 | 0.3.0 | planned | Integration test: `installPack` on Docker Postgres writes the same rows as the in memory test and a second install supersedes the first version | `feat(core-content): add postgres adapter` |
| P1-04 | 1 | lang-de | `LanguagePack` implementation loading `content/de` files | P0-10 | 0.1.0 | planned | `loadUnits()` returns the units in `content/de` and `validatePack('de')` passes | `feat(lang-de): implement LanguagePack loader` |
| P1-05 | 1 | lang-de | Rules: `articles`, `nounGender`, `normalize` | P1-04 | 0.2.0 | planned | Test table: 20 nouns return the right gender; `normalize('Straße')` equals `normalize('strasse')` | `feat(lang-de): add article, gender and normalize rules` |
| P1-06 | 1 | lang-de | Rules: `conjugate` (regular plus listed irregular), `classifyError` | P1-05 | 0.3.0 | planned | Test table: 30 verb forms correct; `classifyError('dem Mann','den Mann')` returns `case` | `feat(lang-de): add conjugate and classifyError` |
| P1-07 | 1 | content/de | A1 descriptors, 45, each with a source citation | P0-05 | pack 0.1.0 | planned | `validate-content` passes and zero descriptors are `source: "unverified"` | `content(de-a1): add A1 descriptors` |
| P1-08 | 1 | content/de | A1 items, about 650 vocab and chunks with gloss, gender, plural, example | P1-07 | pack 0.1.0 | planned | Item count at or above 600; every item has `level: A1` and a `frequency_rank` | `content(de-a1): add A1 items` |
| P1-09 | 1 | content/de | A1 units 1 to 4, about 30 lessons following the lesson pattern in `docs/05` | P1-08 | pack 0.1.0 | planned | Each lesson has 8 to 14 exercises and ends with a production task | `content(de-a1): add units 1 to 4` |
| P1-10 | 1 | content/de | A1 units 5 to 8, about 30 lessons | P1-09 | pack 0.1.0 | planned | All twelve A1 grammar rows in `docs/05` are covered by at least one GRA descriptor with exercises | `content(de-a1): add units 5 to 8` |
| P1-11 | 1 | core-exercise-types | Registry plus deterministic graders: `multiple_choice`, `cloze`, `match_pairs`, `order_words`, `flashcard`, `read_answer`, `listen_answer`, `dictation` | P0-10 | 0.1.0 | planned | Test table: each type grades one correct and one wrong fixture; `cloze` uses `languageRules.classifyError` | `feat(core-exercise-types): add registry and deterministic graders` |
| P1-12 | 1 | core-lesson-engine | `SessionStore` port plus in memory adapter; `startSession`, `currentExercise`, `submitAnswer`, `completeSession`; emits `attempt.recorded` and `lesson.completed` | P1-01, P1-11 | 0.1.0 | planned | Test: a session of three exercises writes three `attempts` rows and one `lesson_sessions` row with a score | `feat(core-lesson-engine): add session api` |
| P1-29 | 1 | core-lesson-engine | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P1-12, P0-24 | 0.2.0 | planned | Integration test: the three exercise session writes `attempts` and `lesson_sessions` rows on Docker Postgres inside `withUser` | `feat(core-lesson-engine): add postgres adapter` |
| P1-13 | 1 | core-lesson-engine | `recordStandaloneAttempt` for reviews, tutor and assessment | P1-12 | 0.3.0 | planned | Test: standalone attempt has null `session_id` and still emits `attempt.recorded` | `feat(core-lesson-engine): add recordStandaloneAttempt` |
| P1-14 | 1 | core-srs | `CardStore` port plus in memory adapter; FSRS scheduler via `ts-fsrs`: `dueQueue`, `review`, `introduceItems`, `stats` | P0-11 | 0.1.0 | planned | Test: rating 1 then 3 then 3 moves a card from `new` to `review` and `due` moves forward | `feat(core-srs): add FSRS scheduler` |
| P1-30 | 1 | core-srs | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P1-14, P0-24 | 0.2.0 | planned | Integration test: `review` upserts `review_cards` and appends `review_logs` on Docker Postgres | `feat(core-srs): add postgres adapter` |
| P1-15 | 1 | core-srs | Subscribe to `attempt.recorded` and update cards for `itemIds` | P1-14 | 0.3.0 | planned | Test: emitting `attempt.recorded` with one item id upserts a `review_cards` row | `feat(core-srs): subscribe to attempt.recorded` |
| P1-16 | 1 | core-progress | `MasteryStore` port plus in memory adapter; `cando_mastery` updates from `attempt.recorded`; default mastery rule; emits `cando.mastered` | P0-11 | 0.1.0 | planned | Test: six correct attempts across two types with accuracy 1.0 sets `mastered_at` and emits once | `feat(core-progress): add mastery from attempts` |
| P1-31 | 1 | core-progress | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P1-16, P0-24 | 0.2.0 | planned | Integration test: six attempts set `mastered_at` on a `cando_mastery` row on Docker Postgres | `feat(core-progress): add postgres adapter` |
| P1-17 | 1 | core-progress | `masteryFor`, `levelEstimate`, `recordEstimate`, `streak`, `levelMap` | P1-16 | 0.3.0 | planned | Test: `levelMap` returns six levels with mastered counts; streak increments once per calendar day | `feat(core-progress): add level map and streaks` |
| P1-18 | 1 | ui-kit | Exercise renderers for the eight deterministic types, `LevelBadge`, `AudioButton`, `CorrectionInline`, `LevelMap` | P0-14 | 0.3.0 | planned | Test page renders every renderer key from `listTypes()` | `feat(ui-kit): add exercise renderers and level map` |
| P1-32 | 1 | core-identity | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P0-16, P0-24 | 0.2.0 | planned | Integration test: `setActiveLanguage` writes `learner_languages` on Docker Postgres and a second user cannot read it | `feat(core-identity): add postgres adapter` |
| P1-33 | 1 | core-entitlements | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P0-18, P0-24 | 0.2.0 | planned | Integration test: a new user gets an `entitlements` row with `free_beta` on Docker Postgres | `feat(core-entitlements): add postgres adapter` |
| P1-34 | 1 | core-analytics | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P0-19, P0-24 | 0.2.0 | planned | Integration test: one emit writes one `events` row on Docker Postgres | `feat(core-analytics): add postgres adapter` |
| P1-35 | 1 | core-feedback | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P0-20, P0-24 | 0.2.0 | planned | Integration test: anonymous `submit` inserts a `feedback` row on Docker Postgres; `listMine` returns only the caller's rows | `feat(core-feedback): add postgres adapter` |
| P1-36 | 1 | core-mail | smtp adapter for `MailPort`, chosen by `MAIL_ADAPTER` env | P0-28 | 0.2.0 | planned | Test against a local SMTP stub: one message is delivered with the given subject | `feat(core-mail): add smtp adapter` |
| P1-37 | 1 | core-auth | better-auth wired to the 0002 tables through `db`: magic link sent through `MailPort`, Google provider, emits `user.signed_up`, calls `ensure_profile` for a new user | P0-26, P0-28, P1-32 | 0.2.0 | planned | Integration test on Docker Postgres with the console mail adapter: requesting a link sends one mail, consuming it creates a session, `user.signed_up` fires once and a `profiles` row exists | `feat(core-auth): wire better-auth with magic link and google` |
| P1-38 | 1 | apps/web | Sign in page with magic link and Google through `core-auth`, session middleware, sign out; replaces the dev session from P0-17 | P0-17, P1-37 | 0.4.0 | planned | Locally, request a magic link, follow it from the console mail output and land on `/settings` signed in | `feat(web): add sign in with core-auth` |
| P1-39 | 1 | repo | Dockerfile completed for `apps/web` (multi stage, pnpm, standalone Next output) and a `web` service in `docker-compose.yml` next to `db` | P0-13, P0-15 | n/a | planned | `docker compose up` serves the app on port 3000 against the compose Postgres | `chore(repo): complete Dockerfile and compose web service` |
| P1-40 | 1 | CI | Deploy preview on Vercel or a Docker host with `DATABASE_URL` on a hosted Postgres and `MAIL_ADAPTER=smtp`; `pnpm db:migrate` runs on deploy | P1-36, P1-38, P1-39 | n/a | planned | Preview URL serves sign in; a magic link arrives by mail and `/settings` loads signed in | `chore(ci): add preview deploy` |
| P1-19 | 1 | apps/web | `/lesson/[id]`: runs a session, maps `rendererKey` to components | P1-12, P1-18, P1-29, P1-38 | 0.5.0 | planned | Complete a lesson on preview and see `lesson_sessions.completed_at` set | `feat(web): add lesson route` |
| P1-20 | 1 | apps/web | `/review`: due queue with flashcard and cloze | P1-15, P1-18, P1-30 | 0.6.0 | planned | Review ten cards on preview; `review_logs` has ten rows | `feat(web): add review route` |
| P1-21 | 1 | core-curriculum | `nextLessonFor(userId, language)` | P1-01, P1-12 | 0.3.0 | planned | Test: after completing lesson 1, returns lesson 2 of the same unit | `feat(core-curriculum): add nextLessonFor` |
| P1-22 | 1 | apps/web | `/` daily loop: reviews due, next lesson, tutor slot | P1-20, P1-21, P1-27 | 0.7.0 | planned | Home shows a due count that matches `srs.stats` | `feat(web): add home daily loop` |
| P1-23 | 1 | apps/web | `/progress` level map with evidence per descriptor | P1-17, P1-18, P1-31 | 0.8.0 | planned | Click a descriptor and see attempt count, types seen, best production score | `feat(web): add progress route` |
| P1-24 | 1 | scripts | `install-pack.mjs` CLI wrapping `validatePack` then `installPack` against `DATABASE_URL` | P1-03, P1-04, P1-28 | n/a | planned | `node scripts/install-pack.mjs de` installs and prints the version row | `feat(scripts): add install-pack` |
| P1-25 | 1 | CI | Playwright: sign in, finish A1 lesson 1, review five cards | P1-22, P1-40 | n/a | planned | Workflow step green on main | `test(ci): add A1 lesson flow` |
| P1-26 | 1 | release | Tag v0.2.0 | P1-10, P1-23, P1-24, P1-25, P1-32, P1-33, P1-34, P1-35 | repo 0.2.0 | planned | Tag exists; phase 1 exit criteria all pass | `release(repo): v0.2.0` |
| P2-01 | 2 | core-ai-tutor | `TutorStore` port plus in memory adapter; Claude client, model config, streaming wrapper, token logging | P0-10 | 0.1.0 | planned | Test with a recorded response: chunks stream and `input_tokens` is saved | `feat(core-ai-tutor): add claude client and streaming` |
| P2-18 | 2 | core-ai-tutor | 0.2.0 Postgres adapter via `db`, integration test against Docker Postgres | P2-01, P0-24 | 0.2.0 | planned | Integration test: one recorded turn writes one `tutor_messages` row with token counts on Docker Postgres | `feat(core-ai-tutor): add postgres adapter` |
| P2-02 | 2 | core-ai-tutor | `startConversation`, `sendTurn` with corrections in the final chunk; emits `tutor.turn` | P2-01 | 0.3.0 | planned | Test: a turn with `ich habe ein Hund` yields one correction of type `case` | `feat(core-ai-tutor): add conversation and corrections` |
| P2-03 | 2 | core-ai-tutor | `gradeWriting` with the rubric in `docs/10`; emits `writing.graded` | P2-01 | 0.4.0 | planned | Test: rubric scores are integers 0 to 5 and `estimated_level` is a CEFR level | `feat(core-ai-tutor): add writing rubric grader` |
| P2-04 | 2 | core-ai-tutor | `explain(language, level, question)` | P2-01 | 0.5.0 | planned | Returns a non empty string under 200 words for a dative question at A1 | `feat(core-ai-tutor): add explain` |
| P2-05 | 2 | core-ai-tutor | `aiGrade(exerciseType, payload, response, level, rules)` | P2-01 | 0.6.0 | planned | Test: returns a `GradeResult` with `errorTypes` for a wrong translation | `feat(core-ai-tutor): add aiGrade` |
| P2-06 | 2 | core-exercise-types | `translate` and `write_free` graders calling `ctx.aiGrader` | P1-11, P2-05 | 0.2.0 | planned | Test with a stub grader: both types set `needsAi: true` and pass the level through | `feat(core-exercise-types): add ai graded types` |
| P2-07 | 2 | core-entitlements | Daily limits consumed for `tutor_messages_per_day` and `writing_grades_per_day` | P0-18 | 0.3.0 | planned | Test: `remaining` resets at the user's midnight in their timezone | `feat(core-entitlements): add daily limit reset` |
| P2-08 | 2 | ui-kit | `RubricBars`, chat bubble, correction list | P0-14 | 0.4.0 | planned | Test page renders a message with three inline corrections | `feat(ui-kit): add tutor and rubric components` |
| P2-09 | 2 | apps/web | `/tutor` text chat with streaming and corrections, gated by entitlements | P2-02, P2-07, P2-08 | 0.9.0 | planned | Send five turns on preview; `tutor_messages` has ten rows | `feat(web): add tutor route` |
| P2-10 | 2 | apps/web | `/write` writing studio with rubric result and flag button | P2-03, P2-08 | 0.10.0 | planned | Submit a text; rubric bars render; flag writes `flagged_by_user` | `feat(web): add writing studio` |
| P2-11 | 2 | content/de | A1 production prompts for every unit (`write_free`) with rubric anchors | P1-10 | pack 0.1.1 | planned | Each A1 unit has at least one `write_free` exercise | `content(de-a1): add production prompts` |
| P2-12 | 2 | scripts | `export-review-sheet.mjs`: 50 random corrections and 30 writing grades to CSV for hand checking | P2-09 | n/a | planned | CSV has the columns needed for the two manual measures in `docs/01` | `feat(scripts): add review sheet export` |
| P2-13 | 2 | release | Tag v0.3.0 | P2-06, P2-10, P2-11, P2-12, P2-15, P2-17, P2-18 | repo 0.3.0 | planned | Tag exists; hand check sample at 90 percent recorded in the release notes | `release(repo): v0.3.0` |
| P2-14 | 2 | content/schema | `scenario.schema.json`: real life scenario with `life_area` (work, offices, housing, health, social, media_study), level, roles, goal, `cando_ids`, success criteria, register | P0-05 | schema 0.2.0 | planned | Schema loads; `validate-content` validates `scenarios/<level>.json` and checks `cando_ids` resolve | `feat(content-schema): add scenario schema` |
| P2-15 | 2 | content/de | Scenario library A1 and A2: 12 scenarios per level covering all six life areas (arriving, registering, shopping, doctor, landlord, first day at work) with sources | P2-14 | pack 0.1.2 | planned | Every life area has at least two scenarios per level; `validate-content` passes | `content(de-a1): add scenario library A1 and A2` |
| P2-16 | 2 | core-ai-tutor | Roleplay mode loads a scenario, plays the other role, judges whether the goal was reached and grades with the rubric | P2-02, P2-14 | 0.7.0 | planned | Test with recorded responses: goal reached flag and rubric present in the final chunk; emits `tutor.turn` and records a standalone attempt against the scenario `cando_ids` | `feat(core-ai-tutor): add scenario roleplay` |
| P2-17 | 2 | apps/web | `/tutor` scenario picker grouped by life area with completed marks | P2-09, P2-16 | 0.10.1 | planned | Pick a scenario on preview, finish it, see it marked done on the level map | `feat(web): add scenario picker` |
| P3-01 | 3 | core-speech | `SpeechProvider` interface, Web Speech API adapter, `compare` word diff | P0-10 | 0.1.0 | planned | Test: `compare('ich bin da','ich bin hier')` gives similarity below 1 and one diff | `feat(core-speech): add provider interface and web speech adapter` |
| P3-02 | 3 | core-storage | 0.2.0 S3 compatible adapter for `StoragePort` (`@aws-sdk/client-s3`), bucket and endpoint from env, per user prefix enforced in the adapter; MinIO service added to `docker-compose.yml` for local runs | P0-27 | 0.2.0 | planned | Integration test against MinIO: a user can `put` and `get` under own prefix and `get` on another user's prefix throws | `feat(core-storage): add s3 compatible adapter` |
| P3-03 | 3 | core-speech | `RecordingStore` port with in memory and Postgres adapters; `saveRecording` writes the audio through `StoragePort` and the row to `speech_recordings`; emits `speech.transcribed` | P3-01, P3-02, P0-24 | 0.2.0 | planned | Test with the fs storage adapter: row has `storage_path`, `similarity` and `provider: web_speech`; integration test on Docker Postgres writes the row inside `withUser` | `feat(core-speech): add saveRecording` |
| P3-04 | 3 | core-exercise-types | `speak_prompt` grader using `compare` then `aiGrade` for production score | P2-06, P3-01 | 0.3.0 | planned | Test: similarity 0.9 with stub AI score 4 returns `correct: true` | `feat(core-exercise-types): add speak_prompt` |
| P3-05 | 3 | ui-kit | `RecordButton` with levels and permission states | P0-14 | 0.5.0 | planned | Component shows denied, idle, recording and done states | `feat(ui-kit): add RecordButton` |
| P3-06 | 3 | apps/web | Speech in lessons and voice turn in `/tutor` | P3-03, P3-04, P3-05 | 0.11.0 | planned | Record a sentence on preview in Chrome; transcript and score appear | `feat(web): add speech to lesson and tutor` |
| P3-07 | 3 | core-assessment | `startPlacement` adaptive blocks, `answer`, `finish`; emits `assessment.completed` | P1-13, P1-17 | 0.1.0 | planned | Test: two correct blocks step up from A2 to B1; four blocks stop | `feat(core-assessment): add adaptive placement` |
| P3-08 | 3 | apps/web | `/assess/placement` and onboarding branch for restarters | P3-07 | 0.12.0 | planned | Finish placement on preview under 15 minutes; `level_estimates` has a `placement` row | `feat(web): add placement route` |
| P3-09 | 3 | content/de | A2 descriptors, 53, with sources | P1-07 | pack 0.2.0 | planned | `validate-content` passes; zero `unverified` | `content(de-a2): add A2 descriptors` |
| P3-10 | 3 | content/de | A2 items, about 650 new | P3-09 | pack 0.2.0 | planned | Cumulative A1 plus A2 items at or above 1300 | `content(de-a2): add A2 items` |
| P3-11 | 3 | content/de | A2 units 1 to 4 | P3-10 | pack 0.2.0 | planned | About 35 lessons, each 8 to 14 exercises | `content(de-a2): add units 1 to 4` |
| P3-12 | 3 | content/de | A2 units 5 to 8 | P3-11 | pack 0.2.0 | planned | All fourteen A2 grammar rows in `docs/05` covered | `content(de-a2): add units 5 to 8` |
| P3-13 | 3 | lang-de | Rules for A2: dative tables, two way prepositions, adjective endings in `classifyError` | P1-06 | 0.4.0 | planned | Test table: `classifyError('auf dem Tisch','auf den Tisch')` returns `case` | `feat(lang-de): add A2 case and adjective rules` |
| P3-14 | 3 | apps/web | Immersion ramp: instruction language per level from pack, German toggle at A2 | P3-12 | 0.13.0 | planned | At A2 a toggle switches instructions to German | `feat(web): add immersion ramp` |
| P3-15 | 3 | release | Tag v0.4.0 | P3-06, P3-08, P3-12, P3-13, P3-14 | repo 0.4.0 | planned | Tag exists; phase 3 exit criteria pass | `release(repo): v0.4.0` |
| P4-01 | 4 | core-assessment | `startCheckpoint` from a lesson of kind `checkpoint`; scores per section | P3-07 | 0.2.0 | planned | Test: finish writes `section_scores` and calls `progress.recordEstimate` | `feat(core-assessment): add checkpoint` |
| P4-02 | 4 | content/de | Checkpoint lessons for A1 and A2 | P4-01, P3-12 | pack 0.2.1 | planned | Each level has one lesson of kind `checkpoint` covering all four skills | `content(de-a2): add A1 and A2 checkpoints` |
| P4-03 | 4 | core-progress | Level reached by mastery ratio 80 percent plus checkpoint 0.7; emits `level.reached` | P1-17, P4-01 | 0.4.0 | planned | Test: 36 of 45 mastered plus checkpoint 0.7 emits `level.reached A1` | `feat(core-progress): add level reached rule` |
| P4-04 | 4 | content/de | B1 descriptors, 61, and items to 2400 cumulative | P3-10 | pack 0.3.0 | planned | Validation passes; cumulative items at or above 2400 | `content(de-b1): add B1 descriptors and items` |
| P4-05 | 4 | content/de | B1 units 1 to 5 | P4-04 | pack 0.3.0 | planned | About 45 lessons | `content(de-b1): add units 1 to 5` |
| P4-06 | 4 | content/de | B1 units 6 to 10 plus checkpoint | P4-05 | pack 0.3.0 | planned | All fourteen B1 grammar rows covered; checkpoint lesson exists | `content(de-b1): add units 6 to 10 and checkpoint` |
| P4-07 | 4 | content/de | B2 descriptors, 60, and items to 4000 cumulative | P4-04 | pack 0.4.0 | planned | Validation passes; cumulative items at or above 4000 | `content(de-b2): add B2 descriptors and items` |
| P4-08 | 4 | content/de | B2 units 1 to 5 | P4-07 | pack 0.4.0 | planned | About 50 lessons | `content(de-b2): add units 1 to 5` |
| P4-09 | 4 | content/de | B2 units 6 to 10 plus checkpoint | P4-08 | pack 0.4.0 | planned | All twelve B2 grammar rows covered; checkpoint lesson exists | `content(de-b2): add units 6 to 10 and checkpoint` |
| P4-10 | 4 | lang-de | Rules for B1 and B2: genitive, passive, Konjunktiv forms, N declension in `conjugate` and `classifyError` | P3-13 | 0.5.0 | planned | Test table of 30 B level forms passes | `feat(lang-de): add B level rules` |
| P4-11 | 4 | core-entitlements | `levels_above_b1` feature gate wired to level map | P0-18 | 0.4.0 | planned | Test: `can(user,'levels_above_b1')` false for a plan with the flag off | `feat(core-entitlements): add levels_above_b1 gate` |
| P4-12 | 4 | core-analytics | Event sampling config and the six beta measure queries as SQL views | P0-19 | 0.3.0 | planned | Views return the numbers in `docs/01` success table | `feat(core-analytics): add sampling and beta measure views` |
| P4-13 | 4 | scripts | `beta-report.mjs` printing the six measures as a table | P4-12 | n/a | planned | Script prints six rows with target and actual | `feat(scripts): add beta-report` |
| P4-14 | 4 | apps/web | `/assess/checkpoint` and level up screen | P4-01, P4-03 | 0.14.0 | planned | Pass an A1 checkpoint on preview; level map marks A1 reached | `feat(web): add checkpoint route` |
| P4-15 | 4 | apps/web | German instructions with English hover at B1 | P3-14 | 0.15.0 | planned | At B1 instruction text is German; hover shows English | `feat(web): add B1 immersion step` |
| P4-90 | 4 | content/de | Workplace and life scenario library B1 and B2: 16 scenarios per level (job interview, team meeting, email to HR, sick note, Bürgeramt, rental contract, bank, salary talk, presenting work) | P2-14 | pack 0.3.2 | planned | Every life area has at least two scenarios per level; each scenario cites the descriptor it evidences | `content(de-b1): add scenario library B1 and B2` |
| P4-91 | 4 | core-assessment | Level checkpoint requires one unscripted roleplay and one written task drawn from the scenario library, graded by rubric, in addition to the exercise sections; exercise accuracy alone cannot pass | P3-07, P2-16 | 0.3.0 | planned | Test: a checkpoint with perfect exercise sections and a failing roleplay does not pass; result shows per section scores | `feat(core-assessment): require scenario tasks in checkpoints` |
| P4-16 | 4 | release | Tag v0.5.0 | P4-06, P4-09, P4-10, P4-13, P4-14, P4-15 | repo 0.5.0 | planned | Tag exists; phase 4 exit criteria pass | `release(repo): v0.5.0` |
| P5-01 | 5 | lang-de | Exam format data: Goethe and telc A1 to C2 sections, task counts, time limits, scoring | P1-04 | 0.6.0 | planned | `examFormats` has one entry per row of the exam table in `docs/05` | `feat(lang-de): add exam formats` |
| P5-02 | 5 | core-assessment | `startExamSim` with section timing and format scoring | P4-01, P5-01 | 0.3.0 | planned | Test: a B1 Goethe sim has four sections and modular scores | `feat(core-assessment): add exam simulation` |
| P5-03 | 5 | apps/web | `/assess/exam_sim` with timers and section results | P5-02 | 0.16.0 | planned | Run a B1 sim on preview; result page shows per section scores | `feat(web): add exam sim route` |
| P5-04 | 5 | content/de | C1 descriptors, 58, and items to 7000 cumulative | P4-07 | pack 0.5.0 | planned | Validation passes; cumulative items at or above 6000 | `content(de-c1): add C1 descriptors and items` |
| P5-05 | 5 | content/de | C1 units 1 to 5 | P5-04 | pack 0.5.0 | planned | About 50 lessons | `content(de-c1): add units 1 to 5` |
| P5-06 | 5 | content/de | C1 units 6 to 10 plus checkpoint | P5-05 | pack 0.5.0 | planned | All ten C1 rows covered; checkpoint exists | `content(de-c1): add units 6 to 10 and checkpoint` |
| P5-07 | 5 | docs/adr | ADR: C2 as own content or C1 plus register work | P4-16 | n/a | planned | ADR accepted and linked from `docs/05` | `docs(repo): add ADR on C2 content shape` |
| P5-08 | 5 | content/de | C2 descriptors, 48, items and units per the ADR, with `mastery_rule` 4 of 5 for writing | P5-07, P5-06 | pack 0.6.0 | planned | Validation passes; C2 writing descriptors carry an override rule | `content(de-c2): add C2 pack` |
| P5-09 | 5 | core-ai-tutor | C level rubric anchors and register feedback | P2-03 | 0.8.0 | planned | Test: a C1 target returns register notes in `feedback` | `feat(core-ai-tutor): add C level rubric anchors` |
| P5-10 | 5 | lang-de | C level rules: modal particles list, Funktionsverbgefüge list, regional variants for `normalize` | P4-10 | 0.7.0 | planned | Test table passes; Swiss `ss` normalises equal to `ß` | `feat(lang-de): add C level rules` |
| P5-11 | 5 | apps/web | Fully German interface at C1 and above | P4-15 | 0.17.0 | planned | At C1 no English string renders on any route | `feat(web): add C level immersion` |
| P5-12 | 5 | apps/web | PWA manifest, responsive audit, accessibility pass on every route | P5-03 | 0.18.0 | planned | Lighthouse PWA installable; no axe critical issues on any route | `feat(web): add PWA and accessibility pass` |
| P5-13 | 5 | db | RLS audit keyed on `app.user_id` and index review; migration `0003` for any fixes | P0-24 | schema 0003 | planned | A script runs every table read inside `withUser(A)` against rows owned by B and gets zero rows; the same reads with no `app.user_id` set also get zero rows | `chore(db): audit RLS and indexes` |
| P5-14 | 5 | CI | Playwright smoke: placement, one lesson per level, one exam sim | P5-03 | n/a | planned | Workflow green on main in under 15 minutes | `test(ci): add full ladder smoke` |
| P5-18 | 5 | db | Backups and restore drill: scheduled `pg_dump` to the S3 compatible bucket, restore into a fresh Docker Postgres, procedure in `packages/db/README.md` | P5-13, P3-02 | n/a | planned | Restoring last night's dump into an empty Docker Postgres leaves `pnpm db:migrate` with nothing pending and a per table row count that matches the source | `chore(db): add backup and restore drill` |
| P5-90 | 5 | content/de | Scenario library C1 and C2: 12 scenarios per level with register variants (formal, neutral, casual) for negotiation, presentations, complaints, academic and legal texts | P2-14 | pack 0.5.2 | planned | Each scenario has three register variants; `validate-content` passes | `content(de-c1): add scenario library C1 and C2` |
| P5-15 | 5 | release | Tag v0.9.0, public beta opens | P5-08, P5-09, P5-10, P5-11, P5-12, P5-13, P5-14, P5-18 | repo 0.9.0 | planned | Tag exists; invite link works for a stranger | `release(repo): v0.9.0` |
| P5-16 | 5 | apps/web | Beta fixes from feedback rows, four weeks, one commit per fix in its box | P5-15 | varies | planned | Every `feedback` row with status `planned` has a row in this table | `fix(<box>): <feedback id> short title` |
| P5-19 | 5 | db | Portability rehearsal: move the hosted Postgres from provider A to provider B by dump and restore, switch `DATABASE_URL` on the preview deploy, no code change | P5-18, P1-40 | n/a | planned | Preview deploy signs in and completes a lesson against provider B with no commit outside `docs/`; timings and steps recorded in `packages/db/README.md` | `docs(db): record hosted postgres migration rehearsal` |
| P5-17 | 5 | release | Tag v1.0.0 | P5-16, P5-19 | repo 1.0.0 | planned | All six beta measures in `docs/01` met or accepted in release notes | `release(repo): v1.0.0` |
| P6-01 | 6 | lang-nl | `LanguagePack` implementation and Dutch rules (articles de and het, verb forms, `normalize`, `classifyError`) | P5-17 | 0.1.0 | planned | Rules test table passes; no `core-*` file changed | `feat(lang-nl): implement LanguagePack and rules` |
| P6-02 | 6 | content/nl | A1 and A2 descriptors, items, units, checkpoints | P6-01 | pack 0.2.0 | planned | Validation passes; sources cited | `content(nl-a2): add A1 and A2 packs` |
| P6-03 | 6 | content/nl | B1 and B2 descriptors, items, units, checkpoints | P6-02 | pack 0.4.0 | planned | Validation passes | `content(nl-b2): add B1 and B2 packs` |
| P6-04 | 6 | content/nl | C1 and C2 per the C2 ADR | P6-03 | pack 0.6.0 | planned | Validation passes | `content(nl-c2): add C1 and C2 packs` |
| P6-05 | 6 | lang-nl | Exam formats CNaVT and Staatsexamen NT2, immersion ramp, TTS voice | P6-01 | 0.2.0 | planned | `examFormats` non empty; exam sim runs an NT2 format | `feat(lang-nl): add exam formats and ramp` |
| P6-06 | 6 | apps/web | Register `lang-nl`, language switcher, `languages.status` active for nl | P6-02 | 0.19.0 | planned | Switch to Dutch on preview and finish NL A1 lesson 1 | `feat(web): register Dutch pack` |
| P6-07 | 6 | release | Tag v1.1.0 | P6-04, P6-05, P6-06 | repo 1.1.0 | planned | Tag exists; `git log v1.0.0..v1.1.0 -- packages/core-*` is empty | `release(repo): v1.1.0` |
| P7-01 | 7 | lang-fr | `LanguagePack` implementation and French rules (gender, agreement, verb groups, `normalize` with accents, `classifyError`) | P6-07 | 0.1.0 | planned | Rules test table passes; no `core-*` file changed | `feat(lang-fr): implement LanguagePack and rules` |
| P7-02 | 7 | content/fr | A1 and A2 packs | P7-01 | pack 0.2.0 | planned | Validation passes; sources cited | `content(fr-a2): add A1 and A2 packs` |
| P7-03 | 7 | content/fr | B1 and B2 packs | P7-02 | pack 0.4.0 | planned | Validation passes | `content(fr-b2): add B1 and B2 packs` |
| P7-04 | 7 | content/fr | C1 and C2 packs | P7-03 | pack 0.6.0 | planned | Validation passes | `content(fr-c2): add C1 and C2 packs` |
| P7-05 | 7 | lang-fr | Exam formats DELF and DALF, immersion ramp, TTS voice | P7-01 | 0.2.0 | planned | Exam sim runs a DELF B1 format | `feat(lang-fr): add exam formats and ramp` |
| P7-06 | 7 | apps/web | Register `lang-fr`, `languages.status` active for fr | P7-02 | 0.20.0 | planned | Finish FR A1 lesson 1 on preview | `feat(web): register French pack` |
| P7-07 | 7 | release | Tag v1.2.0 | P7-04, P7-05, P7-06 | repo 1.2.0 | planned | Tag exists; no `core-*` change since v1.1.0 | `release(repo): v1.2.0` |
| P8-01 | 8 | docs/adr | ADR: plans, prices, and which limits differ per plan (see `docs/12`) | P7-07 | n/a | planned | ADR accepted | `docs(repo): add ADR on plans` |
| P8-02 | 8 | core-entitlements | Plan definitions `free`, `plus`, `pro` with limits; `free_beta` migration rule | P8-01 | 1.0.0 | planned | Test: a `free_beta` user maps to a plan with no feature lost | `feat(core-entitlements): add plan definitions` |
| P8-03 | 8 | db | Migration `0004_subscriptions.sql` in `packages/db/migrations/`, owned by `core-entitlements`: provider ids, status, period, RLS keyed on `app.user_id` | P8-02 | schema 0004 | planned | `pnpm db:migrate` applies it locally; inside `withUser(A)` a select on `subscriptions` returns only A's row | `feat(db): add 0004 subscriptions` |
| P8-04 | 8 | core-entitlements | Stripe adapter implementing `PaymentProvider`: `createCheckout`, `handleWebhook` | P8-03 | 1.1.0 | planned | Test with recorded webhook payloads: `entitlement.changed` fires on paid and on cancel | `feat(core-entitlements): add stripe adapter` |
| P8-05 | 8 | apps/web | `/settings/plan`, checkout redirect, webhook route, limit reached upsell | P8-04 | 0.21.0 | planned | Test mode checkout on preview upgrades the plan row | `feat(web): add plan settings and checkout` |
| P8-06 | 8 | release | Tag v1.3.0, payments on | P8-05 | repo 1.3.0 | planned | Tag exists; one real test purchase refunded | `release(repo): v1.3.0` |

## Common versus language specific

| Box or area | Shared by all languages | Per language | What a new language must deliver |
|-------------|-------------------------|--------------|----------------------------------|
| `contracts` | yes | no | Nothing. `LanguageCode` already lists `de`, `nl`, `fr`. A fourth language adds one literal here in its own commit first |
| `db`, `core-auth`, `core-storage`, `core-mail` | yes | no | Nothing. Database, sign in, files and mail do not know which language a learner studies |
| `core-identity` | yes | no | Nothing |
| `core-curriculum` | yes | no | Nothing. Descriptor codes are shared |
| `core-content` | yes | no | Nothing. The pack is registered in `apps/web` |
| `core-lesson-engine` | yes | no | Nothing |
| `core-exercise-types` | yes | no | Nothing. Graders take `languageRules` from the pack |
| `core-srs` | yes | no | Nothing |
| `core-progress` | yes | no | Nothing |
| `core-assessment` | yes | no | Nothing. It runs whatever `examFormats` it is given |
| `core-ai-tutor` | yes | no | Prompt templates take the language name and level; no code change |
| `core-speech` | yes | no | Nothing. Locale and voice come from the pack |
| `core-feedback`, `core-analytics`, `core-entitlements` | yes | no | Nothing |
| `ui-kit`, `apps/web` | yes | no | One registration line in `apps/web` and a `languages` row |
| `lang-<code>` | no | yes | `LanguagePack` implementation, `rules` (gender, conjugation, normalize, classifyError), `examFormats`, `immersionRamp`, `tts` |
| `content/<code>` | no | yes | `pack.json`, descriptors with sources for six levels, items, units with lessons and exercises, checkpoint lessons, all validating against `content/schema` |

## Parked and future

| Item | Status | Reason |
|------|--------|--------|
| `core-notifications` | parked | Reminders need a scheduler; not needed to prove the ladder works. Revisit after v1.0.0 if day 7 return is under 40 percent |
| `core-admin` | parked | Content preview and review can be done with the validate script and a local install until there is a second content author |
| `tools-content-forge` | future | The generation pipeline runs offline. It starts as scripts inside `scripts/` during Phase 4 and becomes a box only if it grows past three files |
| Native mobile wrappers | parked | PWA covers install and home screen. Store listings cost review time with no learning benefit in beta |
| Hosted speech provider | parked | Web Speech API is free. Adapter interface exists in `core-speech`, so a provider is one file later |
| Offline mode | parked | Needs a sync layer for attempts and reviews. Out of scope until v1.0.0 measures are met |
| Fully self hosted stack on one VPS (Postgres, MinIO, SMTP relay) | future | Every outside service already sits behind a port with a swappable adapter: `db` takes any `DATABASE_URL`, `core-storage` speaks S3, `core-mail` speaks smtp. The move is a compose file and env values, not code. Not worth the operations time while a hosted Postgres and a preview host cost less than the beta budget; revisit when hosting cost, data residency or vendor risk makes it worth it |

## How to pick your next task

1. Open this file. Find the first row from the top with status `next`.
2. Check its `Depends on` column. Every listed ID must be `done`. If one is not, that row was marked wrongly. Fix the status and move on to the next `next` row.
3. Set the row to `in_progress`. Read the box README. State the box and the public API after the change before writing code.
4. Do the work. Run the box tests and `node scripts/check-boundaries.mjs`.
5. Set the row to `done`, update `Box version after`, add the sequence log row, update the box CHANGELOG, and promote any newly unblocked rows to `next`. Commit with the planned message.

If no row is `next`, the table is wrong. Promote the first `planned` row whose dependencies are all done.

## Sequence log

Every merged commit gets one row. Newest at the bottom. See `docs/08-versioning-and-git.md` for the rule.

| Date | Commit | Box | Message |
|------|--------|-----|---------|
| 2026-09-09 | 6b49a37 | repo | `chore(repo): planning package v0.0.1` |
| 2026-09-09 | 7ab9b64 | repo | `chore(repo): normalise line endings to LF` |
| 2026-09-09 | 4f4747a | repo | `chore(repo): add workspace tooling` |
| 2026-09-09 | c1caba2 | contracts | `feat(contracts): add shared types and event map` |
| 2026-09-09 | a32d1a9 | contracts | `feat(contracts): add in process event bus` |
| 2026-09-09 | 2890187 | prd | `docs(prd): add relocating professional persona and scenario track` |
| 2026-09-09 | 13cd598 | de | `content(de): verify exam formats against provider documents` |
| 2026-09-09 | 2c7f55f | curriculum | `docs(curriculum): align level rule with real life CEFR evidence` |
| 2026-09-09 | ce767a9 | repo | `chore(repo): remove provider lock in per ADR-008` |
