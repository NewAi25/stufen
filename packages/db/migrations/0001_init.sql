-- 0001_init.sql
-- Stufen initial schema. Owner boxes are named above each group.
-- Never edit this file after it has been applied. Add 0002_*.sql instead.
--
-- Runs on plain PostgreSQL 16 or later through packages/db (see its README).
-- Authorisation model: boxes check the user id themselves. Row level security
-- stays as defence in depth. The request layer runs
--   select set_config('app.user_id', '<uuid>', true)
-- inside each transaction, and every policy below reads that value with
-- current_setting('app.user_id', true). Policies are granted to the role
-- stufen_app, which the application connects as. The migration creates the
-- role without login; the password and login flag are set outside migrations.

-- gen_random_uuid() is built in since PostgreSQL 13. The extension line is
-- kept because it is harmless and documents the dependency.
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Application role
-- ---------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'stufen_app') then
    create role stufen_app nologin;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Shared enums and helpers
-- ---------------------------------------------------------------

create type skill as enum (
  'reading', 'listening', 'spoken_production', 'spoken_interaction',
  'writing', 'mediation', 'grammar', 'vocabulary'
);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------
-- core-auth: users
-- ---------------------------------------------------------------
-- The users table is owned by core-auth (better-auth). The sessions, accounts
-- and verifications tables that better-auth also needs arrive in migration
-- 0002, owned by core-auth. Sign in looks users up by email before any
-- app.user_id is known, so this table does not use row level security.
-- core-auth is the only box that reads or writes it.

create table users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  email_verified  boolean not null default false,
  name            text,
  image           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-curriculum: reference tables
-- ---------------------------------------------------------------

create table languages (
  code          text primary key check (code ~ '^[a-z]{2}$'),
  name_en       text not null,
  name_native   text not null,
  status        text not null default 'coming' check (status in ('active','coming','hidden')),
  pack_version  text,
  created_at    timestamptz not null default now()
);

create table cefr_levels (
  level     text primary key check (level in ('A1','A2','B1','B2','C1','C2')),
  ordinal   smallint not null unique,
  label_en  text not null
);

insert into cefr_levels (level, ordinal, label_en) values
  ('A1', 1, 'Breakthrough'),
  ('A2', 2, 'Waystage'),
  ('B1', 3, 'Threshold'),
  ('B2', 4, 'Vantage'),
  ('C1', 5, 'Effective operational proficiency'),
  ('C2', 6, 'Mastery');

insert into languages (code, name_en, name_native, status) values
  ('de', 'German', 'Deutsch', 'active'),
  ('nl', 'Dutch', 'Nederlands', 'coming'),
  ('fr', 'French', 'Français', 'coming');

create table cando_descriptors (
  id             uuid primary key default gen_random_uuid(),
  language_code  text references languages(code),          -- null = common CEFR descriptor
  level          text not null references cefr_levels(level),
  skill          skill not null,
  code           text not null,                              -- e.g. A1.LIS.03
  text_en        text not null,
  text_native    text,
  source         text not null default 'unverified',
  mastery_rule   jsonb,
  created_at     timestamptz not null default now(),
  unique (language_code, code)
);

create table units (
  id             uuid primary key default gen_random_uuid(),
  language_code  text not null references languages(code),
  level          text not null references cefr_levels(level),
  ordinal        smallint not null,
  slug           text not null,
  title          text not null,
  description    text,
  pack_version   text not null,
  created_at     timestamptz not null default now(),
  unique (language_code, slug)
);

create table lessons (
  id                 uuid primary key default gen_random_uuid(),
  unit_id            uuid not null references units(id) on delete cascade,
  ordinal            smallint not null,
  slug               text not null,
  title              text not null,
  kind               text not null default 'core' check (kind in ('core','review','production','checkpoint')),
  estimated_minutes  smallint not null default 15,
  cando_ids          uuid[] not null default '{}',
  pack_version       text not null,
  created_at         timestamptz not null default now(),
  unique (unit_id, slug)
);

-- ---------------------------------------------------------------
-- core-content
-- ---------------------------------------------------------------

create table content_pack_versions (
  language_code  text not null references languages(code),
  version        text not null,
  checksum       text not null,
  status         text not null default 'installing' check (status in ('installing','active','superseded','failed')),
  installed_at   timestamptz not null default now(),
  primary key (language_code, version)
);

create table items (
  id              uuid primary key default gen_random_uuid(),
  language_code   text not null references languages(code),
  kind            text not null check (kind in ('vocab','chunk','grammar','phrase')),
  key             text not null,                            -- stable, e.g. de:vocab:haus
  lemma           text not null,
  gloss_en        text not null,
  level           text not null references cefr_levels(level),
  frequency_rank  integer,
  payload         jsonb not null default '{}',
  pack_version    text not null,
  created_at      timestamptz not null default now(),
  unique (language_code, key)
);

create table exercises (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references lessons(id) on delete cascade,
  ordinal       smallint not null,
  type          text not null,                              -- from core-exercise-types registry
  skill         skill not null,
  payload       jsonb not null,
  cando_ids     uuid[] not null default '{}',
  item_ids      uuid[] not null default '{}',
  pack_version  text not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-identity
-- ---------------------------------------------------------------

create table profiles (
  id                  uuid primary key references users(id) on delete cascade,
  display_name        text,
  ui_locale           text not null default 'en',
  timezone            text not null default 'UTC',
  daily_goal_minutes  smallint not null default 15,
  active_language     text references languages(code),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table learner_languages (
  user_id                 uuid not null references profiles(id) on delete cascade,
  language_code           text not null references languages(code),
  target_level            text not null default 'B2' references cefr_levels(level),
  current_level_estimate  text references cefr_levels(level),
  started_at              timestamptz not null default now(),
  primary key (user_id, language_code)
);

-- ---------------------------------------------------------------
-- core-lesson-engine
-- ---------------------------------------------------------------

create table lesson_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  lesson_id       uuid not null references lessons(id),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  score           numeric(4,3) check (score between 0 and 1),
  exercise_order  uuid[] not null default '{}'
);

create table attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  session_id     uuid references lesson_sessions(id) on delete set null,
  exercise_id    uuid references exercises(id) on delete set null,
  item_id        uuid references items(id) on delete set null,
  exercise_type  text not null,
  correct        boolean not null,
  score          numeric(4,3) not null check (score between 0 and 1),
  response       jsonb not null default '{}',
  feedback       jsonb not null default '{}',
  duration_ms    integer,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-srs
-- ---------------------------------------------------------------

create table review_cards (
  user_id      uuid not null references profiles(id) on delete cascade,
  item_id      uuid not null references items(id) on delete cascade,
  stability    real not null default 0,
  difficulty   real not null default 0,
  due          timestamptz not null default now(),
  last_review  timestamptz,
  reps         integer not null default 0,
  lapses       integer not null default 0,
  state        text not null default 'new' check (state in ('new','learning','review','relearning')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table review_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  item_id         uuid not null references items(id) on delete cascade,
  rating          smallint not null check (rating between 1 and 4),
  reviewed_at     timestamptz not null default now(),
  elapsed_days    real,
  scheduled_days  real,
  state_before    text
);

-- ---------------------------------------------------------------
-- core-progress
-- ---------------------------------------------------------------

create table cando_mastery (
  user_id                uuid not null references profiles(id) on delete cascade,
  cando_id               uuid not null references cando_descriptors(id) on delete cascade,
  evidence_count         integer not null default 0,
  correct_count          integer not null default 0,
  exercise_types_seen    text[] not null default '{}',
  best_production_score  numeric(3,2),
  recent_accuracy        numeric(4,3),
  mastered_at            timestamptz,
  updated_at             timestamptz not null default now(),
  primary key (user_id, cando_id)
);

create table level_estimates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  language_code  text not null references languages(code),
  level          text not null references cefr_levels(level),
  confidence     numeric(4,3) not null check (confidence between 0 and 1),
  method         text not null check (method in ('placement','checkpoint','mastery_ratio','manual')),
  created_at     timestamptz not null default now()
);

create table streaks (
  user_id           uuid not null references profiles(id) on delete cascade,
  language_code     text not null references languages(code),
  current_days      integer not null default 0,
  longest_days      integer not null default 0,
  last_active_date  date,
  primary key (user_id, language_code)
);

-- ---------------------------------------------------------------
-- core-assessment
-- ---------------------------------------------------------------

create table assessments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  language_code   text not null references languages(code),
  kind            text not null check (kind in ('placement','checkpoint','exam_sim')),
  level           text references cefr_levels(level),
  status          text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  score           numeric(4,3),
  section_scores  jsonb not null default '{}',
  result          jsonb not null default '{}',
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

-- ---------------------------------------------------------------
-- core-ai-tutor
-- ---------------------------------------------------------------

create table tutor_conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  language_code    text not null references languages(code),
  mode             text not null default 'chat' check (mode in ('chat','roleplay','explain')),
  level            text not null references cefr_levels(level),
  scenario         text,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

create table tutor_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references tutor_conversations(id) on delete cascade,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  corrections      jsonb not null default '[]',
  input_tokens     integer,
  output_tokens    integer,
  model            text,
  created_at       timestamptz not null default now()
);

create table writing_submissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  language_code    text not null references languages(code),
  task_id          uuid references exercises(id) on delete set null,
  prompt           text not null,
  text             text not null,
  target_level     text not null references cefr_levels(level),
  rubric_scores    jsonb,
  feedback         jsonb,
  estimated_level  text references cefr_levels(level),
  model            text,
  flagged_by_user  boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-speech
-- ---------------------------------------------------------------

create table speech_recordings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  exercise_id   uuid references exercises(id) on delete set null,
  storage_path  text,
  transcript    text,
  target_text   text,
  similarity    numeric(4,3),
  provider      text not null default 'web_speech',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-feedback
-- ---------------------------------------------------------------

create table feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  kind        text not null check (kind in ('bug','idea','confusing','rating','other')),
  page        text,
  message     text not null,
  rating      smallint check (rating between 1 and 5),
  context     jsonb not null default '{}',
  status      text not null default 'new' check (status in ('new','seen','planned','done','wontfix')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-analytics
-- ---------------------------------------------------------------

create table events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  name        text not null,
  props       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- core-entitlements
-- ---------------------------------------------------------------

create table entitlements (
  user_id     uuid primary key references profiles(id) on delete cascade,
  plan        text not null default 'free_beta' check (plan in ('free_beta','free','plus','pro')),
  features    jsonb not null default '{}',
  limits      jsonb not null default '{"tutor_messages_per_day": 200, "writing_grades_per_day": 20, "speech_minutes_per_day": 30}',
  source      text not null default 'default' check (source in ('default','manual','stripe')),
  expires_at  timestamptz,
  updated_at  timestamptz not null default now()
);

create table feature_flags (
  key         text primary key,
  enabled     boolean not null default false,
  rules       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------

create index attempts_user_created_idx on attempts (user_id, created_at desc);
create index attempts_user_exercise_idx on attempts (user_id, exercise_id);
create index review_cards_user_due_idx on review_cards (user_id, due);
create index cando_mastery_user_mastered_idx on cando_mastery (user_id, mastered_at);
create index exercises_lesson_ordinal_idx on exercises (lesson_id, ordinal);
create index items_lang_level_freq_idx on items (language_code, level, frequency_rank);
create index events_name_created_idx on events (name, created_at desc);
create index level_estimates_user_lang_idx on level_estimates (user_id, language_code, created_at desc);
create index tutor_messages_conv_idx on tutor_messages (conversation_id, created_at);

-- ---------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------

create trigger users_updated before update on users for each row execute function set_updated_at();
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger review_cards_updated before update on review_cards for each row execute function set_updated_at();
create trigger cando_mastery_updated before update on cando_mastery for each row execute function set_updated_at();
create trigger entitlements_updated before update on entitlements for each row execute function set_updated_at();

-- A new user gets a profile and a free_beta entitlement. core-auth calls this
-- after sign up. Safe to call more than once. Runs as the function owner so it
-- can write entitlements, which stufen_app may only read.
create or replace function ensure_profile(p_user_id uuid) returns void as $$
begin
  insert into profiles (id, display_name)
    select u.id, coalesce(u.name, '') from users u where u.id = p_user_id
    on conflict (id) do nothing;
  insert into entitlements (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------
-- Grants to the application role
-- ---------------------------------------------------------------
-- Row level security below decides which rows stufen_app may touch. The grants
-- only open the door to the tables at all.

grant usage on schema public to stufen_app;
grant select, insert, update, delete on all tables in schema public to stufen_app;
grant execute on function ensure_profile(uuid) to stufen_app;

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
-- The user id comes from the transaction local setting app.user_id. When it is
-- unset the value is null; when it was set earlier in the same session and
-- then reset it can be an empty string, so nullif guards the uuid cast.

-- Content: readable by the application role, written only by the migration owner.
do $$
declare t text;
begin
  foreach t in array array['languages','cefr_levels','cando_descriptors','units','lessons','exercises','items','content_pack_versions','feature_flags']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s_read" on %I for select to stufen_app using (true)', t, t);
  end loop;
end $$;

-- Learner data: own rows only.
do $$
declare
  t text;
  col text;
begin
  foreach t in array array['profiles','learner_languages','lesson_sessions','attempts','review_cards','review_logs','cando_mastery','level_estimates','streaks','assessments','tutor_conversations','writing_submissions','speech_recordings']
  loop
    col := case when t = 'profiles' then 'id' else 'user_id' end;
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s_own_select" on %I for select to stufen_app using (%I = nullif(current_setting(''app.user_id'', true), '''')::uuid)', t, t, col);
    execute format('create policy "%s_own_insert" on %I for insert to stufen_app with check (%I = nullif(current_setting(''app.user_id'', true), '''')::uuid)', t, t, col);
    execute format('create policy "%s_own_update" on %I for update to stufen_app using (%I = nullif(current_setting(''app.user_id'', true), '''')::uuid)', t, t, col);
  end loop;
end $$;

-- tutor_messages: through the conversation owner.
alter table tutor_messages enable row level security;
create policy tutor_messages_own on tutor_messages for all to stufen_app
  using (exists (select 1 from tutor_conversations c where c.id = conversation_id and c.user_id = nullif(current_setting('app.user_id', true), '')::uuid))
  with check (exists (select 1 from tutor_conversations c where c.id = conversation_id and c.user_id = nullif(current_setting('app.user_id', true), '')::uuid));

-- feedback: anyone may insert (signed out, or signed in as themselves), users read their own.
alter table feedback enable row level security;
create policy feedback_insert on feedback for insert to stufen_app
  with check (
    nullif(current_setting('app.user_id', true), '') is null
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
create policy feedback_own_select on feedback for select to stufen_app using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- events: users may insert their own, never read.
alter table events enable row level security;
create policy events_insert on events for insert to stufen_app with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- entitlements: users read their own. Writes happen through ensure_profile or the migration owner.
alter table entitlements enable row level security;
create policy entitlements_own_select on entitlements for select to stufen_app using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- ---------------------------------------------------------------
-- Rollback (manual reference, do not run automatically)
-- ---------------------------------------------------------------
-- drop function if exists ensure_profile(uuid);
-- drop table if exists feature_flags, entitlements, events, feedback, speech_recordings,
--   writing_submissions, tutor_messages, tutor_conversations, assessments, streaks,
--   level_estimates, cando_mastery, review_logs, review_cards, attempts, lesson_sessions,
--   learner_languages, profiles, exercises, items, content_pack_versions, lessons, units,
--   cando_descriptors, cefr_levels, languages, users cascade;
-- drop function if exists set_updated_at();
-- drop type if exists skill;
-- revoke all on schema public from stufen_app;
-- drop role if exists stufen_app;
