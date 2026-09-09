# 11. Testing and quality

Owner: Manisha Sarkar. Status: accepted for beta.

The point of the box model is that every change is small and checkable. This document says what "checked" means. Every box ships with tests that run in one command and print a table a non expert can read. Nothing merges without them.

## Test pyramid

From cheapest and most frequent at the bottom to most expensive and rarest at the top.

| Layer | What it checks | Tool | Command | Runs |
|-------|----------------|------|---------|------|
| Box unit tests | one box's logic in isolation, no network, no database | Vitest | `pnpm --filter <box> test` | every commit |
| Contract tests | every public function in `docs/04` exists on the box's `src/index.ts` with the documented shape, and nothing else is exported | Vitest | `pnpm --filter <box> test` (file `tests/contract.test.ts`) | every commit |
| Boundary check | no import crosses a line in the dependency rules of `docs/02` | `scripts/check-boundaries.mjs` | `node scripts/check-boundaries.mjs` | every commit |
| Content validation | every content pack file validates against `content/schema/`, every referenced id exists, every descriptor has a source | `scripts/validate-content.mjs` | `node scripts/validate-content.mjs de` | every commit touching `content/` or `lang-*`, every push |
| Integration tests | migrations apply cleanly, Postgres adapters behave like the in memory ones, row level security holds, a user cannot read another user's rows | Vitest against Docker Postgres | `pnpm test:db` | every push |
| End to end | five learner flows in a real browser against a local app and database | Playwright | `pnpm test:e2e` | every push, before release |
| AI evals | correction accuracy and writing grade agreement, hand checked | `packages/core-ai-tutor/evals/run.ts` | `pnpm --filter core-ai-tutor eval:corrections`, `eval:writing` | before any prompt or model change, before release |

### Box unit tests

Each box has a `tests/` folder. Tests import from `../src/index.ts` for public behaviour and from `../src/<file>` only for pure helpers. Unit tests use in memory adapters. Every box that persists data defines a storage port and ships an in memory adapter for it, and unit tests wire that adapter in. The same goes for `AuthPort`, `StoragePort` and `MailPort`: tests use the in memory, filesystem and console adapters. No box test opens a network connection or needs an account. A test that needs the Claude API uses the recorded fixture described under test data.

Every box README lists the command and what a passing run looks like.

### Contract tests

`tests/contract.test.ts` in every box does three things:

1. Imports the box only through `src/index.ts`.
2. Asserts each function named in `docs/04` for that box is exported and is a function.
3. Asserts the export list has no extra names. If a helper needs to be public, `docs/04` changes first.

This is the test that catches "I added a function and forgot the contract" and "apps/web reached into a box internal".

### Boundary check

`scripts/check-boundaries.mjs` reads every `module.json`, walks every `import` in `src/`, and fails with the file, line and rule broken. The rules are the table in `docs/02`. It also fails when a `depends_on` entry in `module.json` is not actually imported, so the file stays honest.

### Content validation

`scripts/validate-content.mjs <lang>` runs in this order and stops at the first failing stage:

| Stage | Check |
|-------|-------|
| Schema | every JSON file validates against its schema in `content/schema/` |
| References | every `cando_id`, `item_id`, `lesson_id`, `unit_id` referenced exists in the pack |
| Codes | descriptor codes match `LEVEL.SKILL.NN` and are unique |
| Sources | every descriptor and grammar item has a `source`; `unverified` is allowed but counted and printed |
| Exercise payloads | each exercise payload validates against the `payloadSchema` of its type in `core-exercise-types` |
| Lesson shape | each lesson has 8 to 14 exercises and ends with one production exercise, except `review` and `checkpoint` lessons |

The output is a table of stage, count checked, count failed, and the first three failures.

### Integration tests

Run against Postgres in Docker, started with `docker compose up -d db`. `pnpm test:db` drops and recreates the test database, applies every migration in order with the migration runner, seeds two test learners, and runs the suite. It needs `DATABASE_URL` pointing at the Docker instance and refuses to run against anything else. The suite has four groups:

| Group | Example test |
|-------|--------------|
| Migrations | every file in `packages/db/migrations/` applies on an empty database without error; running `pnpm db:migrate` a second time applies nothing |
| Adapters | each box's Postgres adapter passes the same test file as its in memory adapter, so both behave alike |
| RLS isolation | a connection sets `app.user_id` to learner A and inserts an `attempts` row; a connection with `app.user_id` set to learner B selects from `attempts` and gets zero rows; the same for `review_cards`, `tutor_messages`, `writing_submissions`, `cando_mastery`, `entitlements` |
| RLS content | a connection with `app.user_id` unset and no learner context cannot be reached from a route; a connection with a learner id can read `exercises` but an insert fails; the pack installer, with `app.user_id` unset, can insert |

The RLS isolation test is the one the owner should care about most. It is the proof that one tester cannot see another tester's data, even if a box forgets its own check.

### End to end

Playwright runs against `pnpm dev` with the Docker Postgres and the console mail adapter, which writes each magic link to a local file the test reads. Five flows, each a single spec file under `apps/web/e2e/`:

| Flow | Spec | Passes when |
|------|------|-------------|
| Sign up and onboarding | `01-onboarding.spec.ts` | a new email signs in with the magic link (read from the console mail adapter's output file), picks German, completes the placement, lands on the home screen with a level shown |
| Complete a lesson | `02-lesson.spec.ts` | the seeded learner opens the next lesson, answers every exercise, sees a score, and the level map shows evidence counts went up |
| Do reviews | `03-review.spec.ts` | the seeded learner with due cards opens `/review`, rates each card, and the due count reaches zero |
| Tutor turn with correction | `04-tutor.spec.ts` | the learner sends a message with a known error, sees streamed text, then sees one inline correction with the right category. The Claude API is replaced by the recorded fixture server |
| Submit feedback | `05-feedback.spec.ts` | the feedback button opens the sheet, a message is sent, a `feedback` row exists with the right page |

End to end tests never call the live Claude API. `apps/web` reads `STUFEN_AI_FIXTURES=1` and `core-ai-tutor` then serves responses from `packages/core-ai-tutor/tests/fixtures/`.

### AI evals

Described in `docs/10-ai-tutor.md`. They cost money, run against the live API, and need a human to fill the rater sheet. They are not part of CI. They run by hand before any change to prompts, schemas, effort or model defaults, and before a release tag.

## Quality gates

| Gate | When | What runs | Must pass |
|------|------|-----------|-----------|
| Local pre commit | every commit, via a git hook installed by `pnpm install` | `pnpm lint`, `pnpm typecheck`, `node scripts/check-boundaries.mjs`, unit and contract tests of the boxes changed in the commit, `validate-content` if `content/` changed | yes; the hook blocks the commit |
| CI on push | every push to any branch | everything in pre commit for all boxes, plus integration tests, plus end to end with fixtures | yes; a red check blocks merge to `main` |
| Release | before a version tag on `main` | everything above, plus AI evals with the result file committed, plus the manual QA script below run by one person who is not the author | yes; the tag is not created otherwise |

### GitHub Actions outline

```yaml
name: ci
on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: node scripts/check-boundaries.mjs
      - run: node scripts/validate-content.mjs de

  unit:
    runs-on: ubuntu-latest
    needs: static
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r test
        env:
          STUFEN_AI_FIXTURES: "1"
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: unit-report, path: reports/unit.md }

  db:
    runs-on: ubuntu-latest
    needs: static
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: stufen, POSTGRES_PASSWORD: stufen, POSTGRES_DB: stufen_test }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U stufen" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://stufen:stufen@localhost:5432/stufen_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
      - run: pnpm test:db

  e2e:
    runs-on: ubuntu-latest
    needs: [unit, db]
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: stufen, POSTGRES_PASSWORD: stufen, POSTGRES_DB: stufen_test }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U stufen" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://stufen:stufen@localhost:5432/stufen_test
      BETTER_AUTH_SECRET: ci-only-not-a-secret
      BETTER_AUTH_URL: http://localhost:3000
      STORAGE_DRIVER: fs
      MAIL_DRIVER: console
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
        env:
          STUFEN_AI_FIXTURES: "1"
          STUFEN_DEFAULT_PLAN: free_beta
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-traces, path: apps/web/test-results }
```

No job has the real `ANTHROPIC_API_KEY`, and no job has a hosted database, storage or mail credential. CI cannot spend money by accident and cannot touch any account.

## Definition of done for a box

A box change is done when every line below is true. The reviewer checks the list, not the diff.

- [ ] `module.json` has the right `version`, `status`, `depends_on` and `provides`
- [ ] `src/index.ts` exports exactly what `docs/04` lists for this box
- [ ] `tests/contract.test.ts` exists and passes
- [ ] Unit tests cover the change: at least one test per public function touched, and one test for each failure path added
- [ ] `pnpm --filter <box> test` prints the pass or fail table and ends green
- [ ] `node scripts/check-boundaries.mjs` passes
- [ ] No live network call in any test
- [ ] `README.md` of the box describes the public API and how to test it as they are now
- [ ] `CHANGELOG.md` has an entry under the new version in Keep a Changelog form
- [ ] The row in `docs/07-build-sequence.md` matches the new version and status
- [ ] If a table changed, a new numbered migration exists, has a reverse block, and `pnpm test:db` passes
- [ ] If a prompt, schema, effort or model default changed, an eval result file is committed with the change
- [ ] Commit message is `type(box): message` and touches one box

## Pass or fail report

Every test command ends by printing this table, and CI uploads it as `reports/unit.md`. The owner reads the last column and nothing else unless something is red.

| Box | Tests | Passed | Failed | Skipped | Time | Result |
|-----|-------|--------|--------|---------|------|--------|
| contracts | 12 | 12 | 0 | 0 | 0.4s | PASS |
| core-identity | 18 | 18 | 0 | 0 | 0.9s | PASS |
| core-srs | 31 | 30 | 1 | 0 | 1.2s | FAIL |
| lang-de | 44 | 44 | 0 | 0 | 0.7s | PASS |
| boundaries | 1 | 1 | 0 | 0 | 0.2s | PASS |
| content de | 6 stages | 6 | 0 | 0 | 2.1s | PASS |
| database | 27 | 27 | 0 | 0 | 14s | PASS |
| e2e | 5 flows | 5 | 0 | 0 | 88s | PASS |

Below the table, each FAIL row gets one paragraph in plain language: which test, what it expected, what it got, and the file and line. Example:

`core-srs: "a card rated Again is due again today" expected due within 24 hours, got 3 days. tests/schedule.test.ts:41.`

Rules for the report:

- Result is PASS only when Failed is 0.
- Skipped tests are listed by name below the table. A skipped test needs a reason in the code and an issue link.
- The report is the same shape locally and in CI.

## Test data

### Fixtures per box

Each box keeps its fixtures in `tests/fixtures/` as JSON. Fixtures are small, named for what they show, and never copied between boxes. When two boxes need the same shape (an exercise, a can do), the fixture lives in `packages/contracts/testing/fixtures/` and both import it from there.

| Box | Fixtures |
|-----|----------|
| `core-curriculum` | three descriptors per skill for A1 and B1, one unit with two lessons |
| `core-content` | a tiny valid pack (`mini-de`), and one broken pack per validation stage |
| `core-lesson-engine` | a lesson with one exercise of each type and their correct and wrong answers |
| `core-exercise-types` | payload and response pairs per type, with expected `GradeResult` |
| `core-srs` | card states at each FSRS stage and the expected next due |
| `core-progress` | attempt histories that just meet and just miss the mastery rule |
| `core-assessment` | placement answer sequences that go up, down and stop |
| `core-ai-tutor` | recorded Claude responses, see below |
| `core-entitlements` | one entitlement row per plan, flag rules of each kind |
| `lang-de` | article table, 40 nouns with gender, 30 verbs with forms, error pairs for `classifyError` |

### Seeded test learner

`packages/db/seed/test-learners.sql` creates two learners for integration and end to end tests:

| Learner | Email | State |
|---------|-------|-------|
| `anna` | `anna@test.stufen.local` | A1, unit 1 lesson 2 next, 8 review cards due, one open tutor conversation, `free_beta` |
| `ben` | `ben@test.stufen.local` | B1, no due cards, one graded writing submission, `free_beta` |

Both use a fixed uuid so tests can reference them. The seed never runs in production; the script refuses to run unless `DATABASE_URL` points at localhost.

### Deterministic AI grading in tests

Unit tests and end to end tests never call the Claude API. `core-ai-tutor` has a fixture mode switched on by `STUFEN_AI_FIXTURES=1`. In this mode the box does not construct an Anthropic client. It looks up the request in `tests/fixtures/recorded/` by a key made of call type, level, and a hash of the learner text, and returns the recorded response with the same shape as a live one, including `usage` and `stop_reason`.

Recording: `pnpm --filter core-ai-tutor record -- <fixture name>` runs the real call once, strips nothing (the fixtures contain no personal data by construction), and writes the JSON. Recorded files are committed. A test that needs a new case records it, commits the fixture, and from then on is deterministic and free.

Fixture mode also covers the failure paths: there are recorded fixtures for a refusal, a `max_tokens` stop, a missing corrections marker, and an invalid grading object, so every row of the failure table in `docs/10` has a test.

## Manual QA script for beta testers

Give this to a tester before a release. They tick each step and write one line if anything felt wrong. Ten steps, about 25 minutes.

| Step | Do this | You should see |
|------|---------|----------------|
| 1 | Open the link on your phone and on a laptop. Sign in with your email | A sign in email arrives within a minute. Both devices land on the same home screen |
| 2 | Pick German and take the placement test | The test ends on its own within 15 minutes and tells you a level. It feels roughly right |
| 3 | On the home screen, find reviews due, next lesson, and the tutor | All three are visible without scrolling on the phone |
| 4 | Start the next lesson and finish it | Between 8 and 14 exercises, one where you write or speak at the end, then a score |
| 5 | Open reviews and rate every card | The due count goes down with each card and reaches zero |
| 6 | Open the tutor, choose free chat, and write two messages with a mistake on purpose (for example "Ich habe gegangen") | Words appear as the tutor types. After your message a correction appears, marked with a category, and it makes sense |
| 7 | Ask the tutor something not about German (for example "write me a poem about cats in English") | The tutor declines in one friendly German sentence and asks you something in German |
| 8 | Open the writing studio and write 60 to 100 words on the task shown | Four rubric bars, an overall score, an estimated level, and line by line notes that quote your text |
| 9 | Open the level map | Your level is highlighted. The can do statements you practised today show evidence counts |
| 10 | Tap the feedback button and send one line about anything that confused you | It sends in under 30 seconds and you see a thank you |

After the script, ask the tester three questions in chat: what was confusing, what was slow, what would make you come back tomorrow. Paste the answers into the `feedback` table with `kind: other` if they did not use the button.
