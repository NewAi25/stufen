-- 0003_policy_fixes.sql
-- Owner box: db. Corrects access defects found in 0001_init.sql by the schema
-- audit of November 2026. 0001 is never edited, so the fixes live here.
-- Never edit this file after it has been applied. Add a new migration instead.
--
-- Access model (same as 0002):
--   * Learner facing work runs inside withUser as role stufen_app with
--     app.user_id set. Only stufen_app's grants and policies apply there.
--   * Owner work (sign up, sessions, pack install, entitlement changes,
--     account deletion, migrations) uses the connection directly as the login
--     role that owns the tables.
--
-- What was wrong and what this file does:
--   1. users had no row level security and stufen_app could read every row
--      and write any of them. Now stufen_app reads only the own row and
--      cannot write users at all. core-auth creates and updates users as owner.
--   2. stufen_app could read and write schema_migrations, because the grant in
--      0001 ran after the runner had created that table. Revoked.
--   3. events could not be inserted without a user id, although the column is
--      nullable so that anonymous events can be recorded. Now a row with a
--      null user id, or with the own user id, may be inserted.
--   4. feature_flags has an updated_at column but had no trigger to maintain it.
--   5. Grants are explicit from now on. Nothing is granted to stufen_app by
--      default; every later migration grants exactly what its tables need.

-- ---------------------------------------------------------------
-- 1. users: own row only, read only
-- ---------------------------------------------------------------

alter table users enable row level security;

create policy users_own_select on users for select to stufen_app
  using (id = nullif(current_setting('app.user_id', true), '')::uuid);

revoke insert, update, delete on users from stufen_app;

-- ---------------------------------------------------------------
-- 2. schema_migrations: no access for stufen_app
-- ---------------------------------------------------------------

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    revoke all on table schema_migrations from stufen_app;
  end if;
end $$;

-- ---------------------------------------------------------------
-- 3. events: anonymous inserts allowed
-- ---------------------------------------------------------------

drop policy if exists events_insert on events;

create policy events_insert on events for insert to stufen_app
  with check (
    user_id is null
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

-- ---------------------------------------------------------------
-- 4. feature_flags: maintain updated_at
-- ---------------------------------------------------------------

create trigger feature_flags_updated before update on feature_flags
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- 5. Explicit grants from now on
-- ---------------------------------------------------------------
-- Defensive: remove any default privilege that would hand new tables to
-- stufen_app, and make sure the auth tables from 0002 stay owner only.

alter default privileges in schema public revoke all on tables from stufen_app;

revoke all on table sessions, accounts, verifications from stufen_app;

-- Deletes of learner data: there is deliberately no delete policy on learner
-- tables. Account deletion and data removal run as the owner connection, where
-- deleting the users row cascades to every learner table.

-- ---------------------------------------------------------------
-- Rollback (manual reference, do not run automatically)
-- ---------------------------------------------------------------
-- drop trigger if exists feature_flags_updated on feature_flags;
-- drop policy if exists events_insert on events;
-- create policy events_insert on events for insert to stufen_app
--   with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
-- grant select, insert, update, delete on schema_migrations to stufen_app;
-- grant insert, update, delete on users to stufen_app;
-- drop policy if exists users_own_select on users;
-- alter table users disable row level security;
-- delete from schema_migrations where filename = '0003_policy_fixes.sql';
