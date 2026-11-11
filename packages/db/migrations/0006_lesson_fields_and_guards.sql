-- 0006_lesson_fields_and_guards.sql
-- Owner box: db. Two groups of changes found while phase 1 was built.
-- Never edit this file after it has been applied. Add a new migration instead.
--
-- A. Content fields that the pack carries and the learner must see, which had
--    no column: the instruction of an exercise, the English titles, the items
--    a lesson introduces.
-- B. Guards that were enforced only in code and now also hold in the
--    database: one answer per exercise in a session, one open session per
--    lesson, an attempt may only point at an own session, one active pack
--    version per language, no write grants on content for the app role.
--    Scheduler numbers become double precision so they round trip exactly.

-- ---------------------------------------------------------------
-- A. Content fields (core-curriculum)
-- ---------------------------------------------------------------

alter table exercises add column instruction_en text;
alter table exercises add column instruction_native text;
alter table lessons add column title_en text;
alter table lessons add column description text;
alter table lessons add column introduces_item_ids uuid[] not null default '{}';
alter table units add column title_en text;

-- ---------------------------------------------------------------
-- B1. core-lesson-engine: sessions and attempts
-- ---------------------------------------------------------------

-- One answer per exercise in a session.
create unique index attempts_session_exercise_key
  on attempts (session_id, exercise_id)
  where session_id is not null and exercise_id is not null;

-- One open session per learner and lesson.
create unique index lesson_sessions_one_open_key
  on lesson_sessions (user_id, lesson_id)
  where completed_at is null;

-- An attempt may only point at a session of the same learner. The insert
-- policy from 0001 checked the user id only, and a foreign key is not subject
-- to row level security.
drop policy if exists attempts_own_insert on attempts;

create policy attempts_own_insert on attempts for insert to stufen_app
  with check (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and (
      session_id is null
      or exists (
        select 1 from lesson_sessions s
        where s.id = session_id
          and s.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      )
    )
  );

-- ---------------------------------------------------------------
-- B2. core-content: one active version per language
-- ---------------------------------------------------------------

create unique index content_pack_versions_one_active_key
  on content_pack_versions (language_code)
  where status = 'active';

-- ---------------------------------------------------------------
-- B3. Content tables: the app role reads, it never writes
-- ---------------------------------------------------------------
-- 0001 granted every privilege on every table and relied on the absence of a
-- write policy. The grant itself goes now.

revoke insert, update, delete on
  languages, cefr_levels, cando_descriptors, units, lessons, exercises, items,
  content_pack_versions, feature_flags
from stufen_app;

-- ---------------------------------------------------------------
-- B4. core-srs: exact scheduler numbers
-- ---------------------------------------------------------------

alter table review_cards
  alter column stability type double precision,
  alter column difficulty type double precision,
  alter column scheduled_days type double precision;

alter table review_logs
  alter column elapsed_days type double precision,
  alter column scheduled_days type double precision;

-- ---------------------------------------------------------------
-- Rollback (manual reference, do not run automatically)
-- ---------------------------------------------------------------
-- alter table review_logs alter column elapsed_days type real, alter column scheduled_days type real;
-- alter table review_cards alter column stability type real, alter column difficulty type real,
--   alter column scheduled_days type real;
-- grant insert, update, delete on languages, cefr_levels, cando_descriptors, units, lessons,
--   exercises, items, content_pack_versions, feature_flags to stufen_app;
-- drop index if exists content_pack_versions_one_active_key;
-- drop policy if exists attempts_own_insert on attempts;
-- create policy attempts_own_insert on attempts for insert to stufen_app
--   with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
-- drop index if exists lesson_sessions_one_open_key;
-- drop index if exists attempts_session_exercise_key;
-- alter table units drop column if exists title_en;
-- alter table lessons drop column if exists introduces_item_ids, drop column if exists description,
--   drop column if exists title_en;
-- alter table exercises drop column if exists instruction_native, drop column if exists instruction_en;
-- delete from schema_migrations where filename = '0006_lesson_fields_and_guards.sql';
