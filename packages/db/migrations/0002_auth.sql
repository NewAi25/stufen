-- 0002_auth.sql
-- Owner box: core-auth. Adds the three tables better-auth needs next to the
-- users table from 0001: sessions, accounts and verifications. The names and
-- columns follow our conventions (plural tables, snake case columns); the
-- core-auth adapter maps better-auth's field names onto them.
-- Never edit this file after it has been applied. Add a new migration instead.
--
-- Access model:
--   * The app connects with a login role that owns the tables and is a member
--     of stufen_app.
--   * Learner facing work runs inside withUser, which switches to the role
--     stufen_app and sets app.user_id. Only that role's grants and policies
--     apply there.
--   * Owner work uses the connection directly as the login role. Sign up,
--     sign in and session checks in core-auth are owner work.
--   * These three tables are owner only. stufen_app gets no grant on them and
--     no policy. Row level security is enabled with no policy at all, so even
--     a grant made by mistake later would still show stufen_app zero rows.
--     The owner connection is not subject to row level security and reads and
--     writes them freely.
--
-- The grant in 0001 covered the tables that existed when it ran. It does not
-- reach the tables created here, and this file grants nothing.

-- ---------------------------------------------------------------
-- core-auth: sessions
-- ---------------------------------------------------------------
-- One row per signed in browser. token is the opaque value in the cookie.

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-auth: accounts
-- ---------------------------------------------------------------
-- One row per sign in method a user has linked. provider_id names the method
-- (for example google), account_id is the user's id at that provider.

create table accounts (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references users(id) on delete cascade,
  account_id                text not null,
  provider_id               text not null,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  password                  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (provider_id, account_id)
);

-- ---------------------------------------------------------------
-- core-auth: verifications
-- ---------------------------------------------------------------
-- Magic link tokens and other short lived values. identifier is what the
-- value was issued for, usually the email address.

create table verifications (
  id          uuid primary key default gen_random_uuid(),
  identifier  text not null,
  value       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------
-- sessions(token) and accounts(provider_id, account_id) are already indexed
-- by their unique constraints.

create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);
create index verifications_identifier_idx on verifications (identifier);

-- ---------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------

create trigger sessions_updated before update on sessions for each row execute function set_updated_at();
create trigger accounts_updated before update on accounts for each row execute function set_updated_at();
create trigger verifications_updated before update on verifications for each row execute function set_updated_at();

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
-- Enabled with no policy and no grant for stufen_app. See the access model at
-- the top of this file.

alter table sessions enable row level security;
alter table accounts enable row level security;
alter table verifications enable row level security;

-- ---------------------------------------------------------------
-- Rollback (manual reference, do not run automatically)
-- ---------------------------------------------------------------
-- drop table if exists verifications, accounts, sessions cascade;
-- delete from schema_migrations where filename = '0002_auth.sql';
