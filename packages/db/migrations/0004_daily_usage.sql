-- 0004_daily_usage.sql
-- Owner box: core-entitlements. Daily limits are counted from the rows that
-- record the thing itself, never from a counter. This file adds what is needed
-- to count them: a duration on speech recordings, and one view.
-- Never edit this file after it has been applied. Add a new migration instead.
--
-- Access: the view is created with security_invoker, so a query made as role
-- stufen_app is checked against the row level security of the tables under
-- it. A learner therefore sees only the own usage. Explicit grant below, as
-- 0003 requires.

-- ---------------------------------------------------------------
-- core-speech: how long a recording is
-- ---------------------------------------------------------------
-- Needed to count speech minutes. Null for rows written before this column.

alter table speech_recordings add column duration_ms integer check (duration_ms is null or duration_ms >= 0);

-- ---------------------------------------------------------------
-- Local day of a timestamp in a named time zone
-- ---------------------------------------------------------------
-- profiles.timezone is free text. An unknown zone must not break the view, so
-- it falls back to UTC.

create or replace function local_day(ts timestamptz, tz text) returns date as $$
begin
  return (ts at time zone tz)::date;
exception when others then
  return (ts at time zone 'UTC')::date;
end;
$$ language plpgsql stable;

-- ---------------------------------------------------------------
-- core-entitlements: daily_usage
-- ---------------------------------------------------------------
-- One row per user and local day on which something was used.
--   tutor_messages   messages the learner sent to the tutor
--   writing_grades   writing submissions
--   speech_minutes   recorded speech, rounded up to whole minutes

create view daily_usage with (security_invoker = true) as
select
  u.user_id,
  to_char(u.day, 'YYYY-MM-DD') as day,
  sum(u.tutor_messages)::integer as tutor_messages,
  sum(u.writing_grades)::integer as writing_grades,
  ceil(sum(u.speech_ms) / 60000.0)::integer as speech_minutes
from (
  select c.user_id, local_day(m.created_at, p.timezone) as day,
         1 as tutor_messages, 0 as writing_grades, 0::bigint as speech_ms
  from tutor_messages m
  join tutor_conversations c on c.id = m.conversation_id
  join profiles p on p.id = c.user_id
  where m.role = 'user'
  union all
  select w.user_id, local_day(w.created_at, p.timezone),
         0, 1, 0::bigint
  from writing_submissions w
  join profiles p on p.id = w.user_id
  union all
  select s.user_id, local_day(s.created_at, p.timezone),
         0, 0, coalesce(s.duration_ms, 0)::bigint
  from speech_recordings s
  join profiles p on p.id = s.user_id
) u
group by u.user_id, u.day;

grant select on daily_usage to stufen_app;

-- ---------------------------------------------------------------
-- Rollback (manual reference, do not run automatically)
-- ---------------------------------------------------------------
-- drop view if exists daily_usage;
-- drop function if exists local_day(timestamptz, text);
-- alter table speech_recordings drop column if exists duration_ms;
-- delete from schema_migrations where filename = '0004_daily_usage.sql';
