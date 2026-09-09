# Changelog

## [0.1.0] - 2026-09-09

- Added `createDb(url)` over Kysely and pg.
- Added `migrate(db, dir)`: numbered SQL files, `schema_migrations` ledger, one transaction per file, idempotent.
- Added `withUser(db, userId, fn)`: transaction with `app.user_id` set for row level security.
- Added `DB` table map with placeholder row types.
- Moved `0001_init.sql` here from `supabase/migrations/`. Users table for core-auth, `ensure_profile(uuid)` replaces the auth trigger, RLS keyed on `app.user_id` and granted to role `stufen_app`.
