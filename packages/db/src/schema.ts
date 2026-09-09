// Table map for Kysely<DB>. One key per table in packages/db/migrations.
// Rows are Record<string, unknown> placeholders for now. P0 follows with
// kysely-codegen output or hand typed rows per owning box; until then boxes
// get no column level type checking from this interface.

type Row = Record<string, unknown>;

export interface DB {
  // packages/db
  schema_migrations: Row;
  // core-auth (sessions, accounts, verifications arrive in 0002)
  users: Row;
  // core-curriculum
  languages: Row;
  cefr_levels: Row;
  cando_descriptors: Row;
  units: Row;
  lessons: Row;
  // core-content
  content_pack_versions: Row;
  items: Row;
  exercises: Row;
  // core-identity
  profiles: Row;
  learner_languages: Row;
  // core-lesson-engine
  lesson_sessions: Row;
  attempts: Row;
  // core-srs
  review_cards: Row;
  review_logs: Row;
  // core-progress
  cando_mastery: Row;
  level_estimates: Row;
  streaks: Row;
  // core-assessment
  assessments: Row;
  // core-ai-tutor
  tutor_conversations: Row;
  tutor_messages: Row;
  writing_submissions: Row;
  // core-speech
  speech_recordings: Row;
  // core-feedback
  feedback: Row;
  // core-analytics
  events: Row;
  // core-entitlements
  entitlements: Row;
  feature_flags: Row;
}
