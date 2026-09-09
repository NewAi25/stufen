# @stufen/db

## Purpose

The one door to PostgreSQL. Holds the numbered SQL migrations, the runner that applies them, the Kysely connection factory and the per user transaction helper. No business logic lives here. Every `core-*` box that touches a table goes through this package; nothing else opens a database connection.

Kind: `infra`. May import: `contracts`.

Runs on plain PostgreSQL 16 or later. There is no dependency on Supabase or any hosted service. Local development and CI use Docker Postgres.

## Public API

```ts
createDb(url: string): Kysely<DB>
migrate(db: Kysely<DB>, dir: string): Promise<{ applied: string[]; skipped: string[] }>
withUser<T>(db: Kysely<DB>, userId: string, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T>
type DB
```

`createDb` returns one Kysely instance over a `pg` pool. Call `db.destroy()` when the process ends.

`migrate` reads every `*.sql` file in `dir`, sorts them by name, and applies the ones not yet listed in the `schema_migrations` table. Each file runs inside its own transaction and is recorded with its filename and `applied_at`. Running it again applies nothing. File names must look like `0002_auth.sql`: four digits, underscore, lower case snake case.

`withUser` opens a transaction, runs `select set_config('app.user_id', $1, true)` inside it, then runs `fn` with the transaction. The row level security policies in the migrations read that setting, so a box that forgets its own user check still cannot read another learner's rows. The setting is transaction local and disappears at commit or rollback, which matters with a connection pool.

`DB` is the Kysely table map. Today each table is `Record<string, unknown>`. Real row types follow in P0, either from codegen or hand typed per owning box.

## Owns tables

| Table |
|-------|
| `schema_migrations` |

Every other table in `migrations/` is owned by the box named above it in the SQL. The migration files live here because there is one database and one order of application, but the owner of each table is the box, not this package.

## Authorisation model

Boxes check the user id themselves. Postgres RLS is defence in depth. Policies are granted to the role `stufen_app`, which the app connects as. Migration 0001 creates the role without login; setting the password and `login` is an operations step outside migrations. The user that runs migrations (locally `stufen`, a superuser in Docker) owns the tables and bypasses RLS.

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

The unit tests cover the runner (ordering, idempotency, one transaction per file, failure stops the run) with a fake executor and need no database. The real migration runs against Docker Postgres in CI through `pnpm db:migrate`.

## Status

See the `db` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
