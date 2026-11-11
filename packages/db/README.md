# @stufen/db

## Purpose

The one door to PostgreSQL. Holds the numbered SQL migrations, the runner that applies them, the Kysely connection factory and the per user transaction helper. No business logic lives here. Every `core-*` box that touches a table goes through this package; nothing else opens a database connection.

Kind: `infra`. May import: `contracts`.

Runs on plain PostgreSQL 16 or later. There is no dependency on Supabase or any hosted service. Local development and CI use Docker Postgres.

## Public API

```ts
createDb(url: string): Kysely<DB>
migrate(db: Kysely<DB>, dir: string): Promise<{ applied: string[]; skipped: string[] }>
withUser<T>(db: Kysely<DB>, userId: string | null, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T>
type DB
const TABLE_NAMES: readonly (keyof DB)[]
```

`createDb` returns one Kysely instance over a `pg` pool. Call `db.destroy()` when the process ends.

`migrate` reads every `*.sql` file in `dir`, sorts them by name, and applies the ones not yet listed in the `schema_migrations` table. Each file runs inside its own transaction and is recorded with its filename and `applied_at`. Running it again applies nothing. File names must look like `0002_auth.sql`: four digits, underscore, lower case snake case.

### withUser

`withUser` runs `fn` inside one transaction as one user. Pass the signed in user's id, or `null` when nobody is signed in. Before `fn` runs, the transaction does two things:

1. `select set_config('app.user_id', $1, true)` with the user id, or an empty string for `null`. The row level security policies in the migrations read that setting.
2. `set local role stufen_app`. The policies are granted to that role only. A table owner or a superuser skips row level security, so without this step the policies would do nothing for the user that ran the migrations.

Both settings are local to the transaction and disappear at commit or rollback. Nothing leaks to the next request on a pooled connection. A box that forgets its own user check still cannot read another learner's rows.

```ts
const mine = await withUser(db, userId, (trx) =>
  trx.selectFrom('profiles').selectAll().executeTakeFirst(),
);
```

What it throws:

| Case | Result |
|------|--------|
| `userId` is not `null` and not a uuid | `TypeError`, before any transaction opens |
| The connection user may not switch to `stufen_app` | `Error` that names the fix: `grant stufen_app to "<login user>"` |
| The role `stufen_app` does not exist | `Error` that says to apply the migrations |
| `fn` throws | The transaction rolls back and the same error is passed on |

Inside `fn` the current role is `stufen_app`. It can do what the grants and policies in the migrations allow and no more. Work that needs the owner, such as installing a content pack or creating a user at sign up, uses `db` directly, outside `withUser`.

### Role requirement

The database user in `DATABASE_URL` must be able to run `set role stufen_app`. Three cases:

| Connection user | What to do |
|-----------------|------------|
| A superuser (the `stufen` user in Docker and in CI) | Nothing. A superuser may switch to any role |
| `stufen_app` itself, after it was given `login` | Nothing |
| Any other login user, for example a non superuser that owns the tables | Run `grant stufen_app to "<that user>"` once, as a superuser |

Migration 0001 creates `stufen_app` without login. The grant above, the password and the `login` flag are operations steps and are not in the migrations.

### DB and TABLE_NAMES

`DB` is the Kysely table map, written by hand in `src/schema.ts`. It has one interface per table in `migrations/0001_init.sql`. The SQL is the source of truth; when a migration adds or changes a column, the interface changes in the same commit. `schema_migrations` is not in `DB`, because only the runner touches it.

`TABLE_NAMES` lists every key of `DB`. It does not compile if a table is missing or extra.

How column types read and write through the `pg` driver:

| SQL type | Select gives | Insert and update take |
|----------|--------------|------------------------|
| `uuid`, `text` | `string`, or a union when a check constraint lists the values | the same |
| `smallint`, `integer`, `real` | `number` | `number` |
| `numeric` | `string`, so no precision is lost | `number` or `string` |
| `boolean` | `boolean` | `boolean` |
| `timestamptz`, `date` | `Date` | `Date` or an ISO string |
| `jsonb` | the parsed value | a plain object, or a JSON string |
| `uuid[]`, `text[]` | `string[]` | `string[]` |
| `skill` enum | the `Skill` union | the same |

Two things to know. A JS array written to a `jsonb` column must go through `JSON.stringify` first, because `pg` sends a bare array as a Postgres array and the insert fails. A `date` comes back as a `Date` at midnight in the time zone of the Node process, so compare days as `'YYYY-MM-DD'` strings where it matters.

A column with a default is optional on insert. A nullable column is optional on insert too.

### Types for adapters

Boxes do not import `kysely` themselves. The types a Postgres adapter needs come from here:

```ts
type Database            // Kysely<DB>, what createDb returns
type DatabaseTransaction // Transaction<DB>, what withUser hands to fn
type TableName           // keyof DB
type Row<'profiles'>      // a row as select returns it
type NewRow<'profiles'>   // the values an insert takes
type RowPatch<'profiles'> // the values an update may set
type JsonValue, JsonObject, JsonArray, JsonPrimitive, Skill, CefrLevel
type UsersTable, ProfilesTable, ...  // one interface per table
```

## Owns tables

| Table |
|-------|
| `schema_migrations` |

Every other table in `migrations/` is owned by the box named above it in the SQL. The migration files live here because there is one database and one order of application, but the owner of each table is the box, not this package.

## Authorisation model

Boxes check the user id themselves. Postgres RLS is defence in depth. Policies are granted to the role `stufen_app`. `withUser` switches to that role for the length of its transaction, so the policies apply whichever user the app connects as. Migration 0001 creates the role without login; setting the password and `login`, or granting the role to another login user, is an operations step outside migrations. The user that runs migrations (locally `stufen`, a superuser in Docker) owns the tables and bypasses RLS everywhere outside `withUser`.

## How to run locally

```
pnpm db:up          # docker compose up -d db
pnpm db:migrate     # applies packages/db/migrations to DATABASE_URL
```

`DATABASE_URL` defaults to nothing; set it to `postgres://stufen:stufen@localhost:5432/stufen` for the compose database. To inspect:

```
docker compose exec db psql -U stufen -c "select * from schema_migrations"
```

To add a migration, create `migrations/NNNN_name.sql` with the next number. Never edit a file after it has been applied anywhere.

## How to change it

1. Read this README. State the public interface after the change before writing code.
2. Change only files under `packages/db/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(db): message`.

## How to test it

```
pnpm --filter @stufen/db test
```

That runs the unit tests. They need no database.

| File | What it checks |
|------|----------------|
| `tests/migrate.test.ts` | The runner: ordering, idempotency, one transaction per file, a failure stops the run. Uses a fake executor |
| `tests/schema.test.ts` | `TABLE_NAMES` and `DB` list exactly the tables `0001_init.sql` creates, and each table interface has the same columns in the same order |
| `tests/with-user.test.ts` | `withUser` statement order, uuid validation, rollback and error messages. Uses a fake driver |
| `tests/with-user.integration.test.ts` | Row level security on a real Postgres. Skipped unless `DATABASE_URL` is set |

The type checks in `tests/schema.test.ts` are enforced by the type checker, so also run `pnpm exec tsc -p tsconfig.json --noEmit` from the repo root.

### The integration test

It needs a PostgreSQL 16 or later with the migrations applied, and a `DATABASE_URL` for the user that ran them. That user must own the tables or be a superuser, because the test creates two users outside `withUser` and deletes them at the end.

With Docker:

```
pnpm db:up
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm db:migrate
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/db test
```

Without Docker, with a local PostgreSQL install on the path (`initdb`, `pg_ctl`, `createdb`):

```
initdb -D ./pg-scratch -U stufen -A trust -E UTF8
pg_ctl -D ./pg-scratch -o "-p 5499" -l ./pg-scratch/server.log start
createdb -h localhost -p 5499 -U stufen stufen
DATABASE_URL=postgres://stufen@localhost:5499/stufen pnpm db:migrate
DATABASE_URL=postgres://stufen@localhost:5499/stufen pnpm --filter @stufen/db test
pg_ctl -D ./pg-scratch stop
```

Keep the scratch directory outside the repo and delete it afterwards. In PowerShell set the variable first with `$env:DATABASE_URL = '...'`.

What the test shows, one line each in the report:

| Check | Expected |
|-------|----------|
| Inside `withUser(A)`, select on `profiles` | only A's row |
| Inside `withUser(B)`, select on `profiles` | only B's row |
| Inside `withUser(null)`, select on `profiles` | no rows |
| A asks for B's profile by id, or tries to update it | no rows, nothing updated |
| `languages`, a content table | readable by A, by B and when signed out |
| After `withUser` returns | the connection has its own role back and no user id |
| `fn` throws | what it wrote is rolled back |
| A login user without the grant | error that names `grant stufen_app to "<user>"` |

The real migration also runs against Docker Postgres in CI through `pnpm db:migrate`.

## Status

See the `db` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).

## Migrations

| File | Owner | What |
|------|-------|------|
| `0001_init.sql` | all core boxes | Every table of the first schema, the `stufen_app` role, row security |
| `0002_auth.sql` | core-auth | `sessions`, `accounts`, `verifications`, owner only |
| `0003_policy_fixes.sql` | db | Access fixes for 0001: `users`, `schema_migrations`, `events`, `feature_flags` |
| `0004_daily_usage.sql` | core-entitlements | `speech_recordings.duration_ms`, view `daily_usage` for daily limits |
| `0005_phase1_fixes.sql` | db | Scheduler columns on `review_cards`, table `cando_outcomes`, limits as overrides only, `ensure_profile` for the own id only |

Auth tables are owner only. Learner facing code never reads them; `core-auth` uses the connection directly.

## Raw SQL

`sql` is re exported from this box. Use it only where the query builder cannot express the statement, for example `sql`select ensure_profile(${userId}::uuid)`.execute(db)`.
