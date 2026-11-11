-- 0005_phase1_fixes.sql
-- Owner box: db. Changes that the Postgres adapters of phase 1 need, found
-- while the boxes were built against the first schema.
-- Never edit this file after it has been applied. Add a new migration instead.
--
--   1. core-srs: review_cards gains the two values the FSRS scheduler must
--      get back on the next review.
--   2. core-progress: a table for the outcome of each attempt per descriptor,
--      so recent accuracy can be computed.
--   3. core-entitlements: the entitlements row holds only real per user
--      overrides. Limits come from the plan definition in code.
--   4. ensure_profile: a learner may call it only for the own user id.
--
-- Grants are explicit, as 0003 requires.

-- ---------------------------------------------------------------
-- 1. core-srs: scheduler state
-- ---------------------------------------------------------------

alter table review_cards add column scheduled_days real not null default 0;
alter table review_cards add column learning_steps integer not null default 0;

-- ---------------------------------------------------------------
-- 2. core-progress: attempt outcomes per descriptor
-- ---------------------------------------------------------------
-- One row per attempt and descriptor. The mastery rule reads the last ten.

create table cando_outcomes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  cando_id       uuid not null references cando_descriptors(id) on delete cascade,
  correct        boolean not null,
  exercise_type  text not null,
  created_at     timestamptz not null default now()
);

create index cando_outcomes_user_cando_idx on cando_outcomes (user_id, cando_id, created_at desc);

alter table cando_outcomes enable row level security;

create policy cando_outcomes_own_select on cando_outcomes for select to stufen_app
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
create policy cando_outcomes_own_insert on cando_outcomes for insert to stufen_app
  with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

grant select, insert on cando_outcomes to stufen_app;

-- ---------------------------------------------------------------
-- 3. core-entitlements: limits are overrides only
-- ---------------------------------------------------------------
-- 0001 gave every row the free_beta numbers as its own limits. A later change
-- to a plan would then never reach existing users. From now on an empty
-- object means "use the plan". Rows that still carry exactly the old default
-- and were never set by hand are cleared.

alter table entitlements alter column limits set default '{}';

update entitlements
   set limits = '{}'
 where source = 'default'
   and limits = '{"tutor_messages_per_day": 200, "writing_grades_per_day": 20, "speech_minutes_per_day": 30}'::jsonb;

-- ---------------------------------------------------------------
-- 4. ensure_profile: own id only for learners
-- ---------------------------------------------------------------
-- The function is security definer so that it can create the entitlement.
-- Inside withUser the session runs with `set local role stufen_app`; that
-- value is visible here through the role setting even though current_user is
-- the function owner. A learner may then only ensure the own profile. Owner
-- work (core-auth at sign up) is not restricted.

create or replace function ensure_profile(p_user_id uuid) returns void as $$
begin
  if current_setting('role', true) = 'stufen_app'
     and p_user_id is distinct from nullif(current_setting('app.user_id', true), '')::uuid then
    raise exception 'ensure_profile: a learner may only ensure the own profile'
      using errcode = '42501';
  end if;
  insert into profiles (id, display_name)
    select u.id, coalesce(u.name, '') from users u where u.id = p_user_id
    on conflict (id) do nothing;
  insert into entitlements (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------
-- Rollback (manual reference, do not run automatically)
-- ---------------------------------------------------------------
-- The previous ensure_profile body is in 0001_init.sql.
-- alter table entitlements alter column limits set default
--   '{"tutor_messages_per_day": 200, "writing_grades_per_day": 20, "speech_minutes_per_day": 30}';
-- drop table if exists cando_outcomes;
-- alter table review_cards drop column if exists learning_steps;
-- alter table review_cards drop column if exists scheduled_days;
-- delete from schema_migrations where filename = '0005_phase1_fixes.sql';
