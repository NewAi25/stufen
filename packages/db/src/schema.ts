// Kysely table map for every table the files in migrations/ create, written
// by hand. The SQL is the source of truth: when a migration adds or changes a
// column, change the matching interface here in the same commit. The unit test
// tests/schema.test.ts compares table and column names against the SQL.
//
// schema_migrations is not listed. The migration runner creates and reads it
// with raw SQL, and no box may touch it.
//
// How SQL types arrive from the pg driver, and so how they are typed here:
//   uuid                 string
//   text                 string (a union when a check constraint lists the values)
//   smallint, integer    number
//   real                 number
//   numeric              string on read (pg keeps the precision), number or string on write
//   boolean              boolean
//   timestamptz, date    Date on read, Date or ISO string on write
//   jsonb                parsed JSON on read; on write a plain object or a JSON string
//   uuid[], text[]       string[]
//
// Generated<T> marks a column with a default: optional on insert, always
// present on select. A column typed `T | null` is nullable and also optional
// on insert.

import type { ColumnType, Generated } from 'kysely';

// ---------- value types ----------

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** The `skill` enum in 0001. */
export type Skill =
  | 'reading'
  | 'listening'
  | 'spoken_production'
  | 'spoken_interaction'
  | 'writing'
  | 'mediation'
  | 'grammar'
  | 'vocabulary';

/** The check constraint on cefr_levels.level. Every `level` column references it. */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// ---------- column helpers ----------

/** timestamptz. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>;
/** timestamptz with a default. */
export type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
/**
 * date. pg builds the Date at midnight in the time zone of the Node process, so
 * read the calendar day with local getters, or write and compare as
 * 'YYYY-MM-DD' strings.
 */
export type DateOnly = ColumnType<Date, Date | string, Date | string>;
/** numeric. pg returns it as a string so no precision is lost. */
export type Numeric = ColumnType<string, number | string, number | string>;
/**
 * jsonb. Reads give the parsed value. Writes take a plain object, which pg
 * serialises, or a string that is already JSON. A JS array must go through
 * JSON.stringify first, because pg would send a bare array as a Postgres
 * array literal, and a bare string is read by Postgres as JSON text.
 */
export type Json = ColumnType<JsonValue, JsonObject | string, JsonObject | string>;
/** jsonb with a default. */
export type GeneratedJson = ColumnType<
  JsonValue,
  JsonObject | string | undefined,
  JsonObject | string
>;

// ---------- core-auth ----------

export interface UsersTable {
  id: Generated<string>;
  email: string;
  email_verified: Generated<boolean>;
  name: string | null;
  image: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// The three tables below come from 0002_auth.sql. Only the owner connection
// may touch them. Inside withUser the role stufen_app has no grant on them, so
// a query there fails with "permission denied".

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  /** The opaque value in the session cookie. Unique. */
  token: string;
  expires_at: Timestamp;
  ip_address: string | null;
  user_agent: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AccountsTable {
  id: Generated<string>;
  user_id: string;
  /** The user's id at the provider. Unique together with provider_id. */
  account_id: string;
  /** The sign in method, for example google. */
  provider_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: Timestamp | null;
  refresh_token_expires_at: Timestamp | null;
  scope: string | null;
  password: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface VerificationsTable {
  id: Generated<string>;
  /** What the value was issued for, usually the email address. */
  identifier: string;
  value: string;
  expires_at: Timestamp;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

// ---------- core-curriculum ----------

export interface LanguagesTable {
  code: string;
  name_en: string;
  name_native: string;
  status: Generated<'active' | 'coming' | 'hidden'>;
  pack_version: string | null;
  created_at: GeneratedTimestamp;
}

export interface CefrLevelsTable {
  level: CefrLevel;
  ordinal: number;
  label_en: string;
}

export interface CandoDescriptorsTable {
  id: Generated<string>;
  /** null means the common CEFR descriptor. */
  language_code: string | null;
  level: CefrLevel;
  skill: Skill;
  code: string;
  text_en: string;
  text_native: string | null;
  source: Generated<string>;
  mastery_rule: Json | null;
  created_at: GeneratedTimestamp;
}

export interface UnitsTable {
  id: Generated<string>;
  language_code: string;
  level: CefrLevel;
  ordinal: number;
  slug: string;
  title: string;
  description: string | null;
  pack_version: string;
  created_at: GeneratedTimestamp;
}

export interface LessonsTable {
  id: Generated<string>;
  unit_id: string;
  ordinal: number;
  slug: string;
  title: string;
  kind: Generated<'core' | 'review' | 'production' | 'checkpoint'>;
  estimated_minutes: Generated<number>;
  cando_ids: Generated<string[]>;
  pack_version: string;
  created_at: GeneratedTimestamp;
}

// ---------- core-content ----------

export interface ContentPackVersionsTable {
  language_code: string;
  version: string;
  checksum: string;
  status: Generated<'installing' | 'active' | 'superseded' | 'failed'>;
  installed_at: GeneratedTimestamp;
}

export interface ItemsTable {
  id: Generated<string>;
  language_code: string;
  kind: 'vocab' | 'chunk' | 'grammar' | 'phrase';
  key: string;
  lemma: string;
  gloss_en: string;
  level: CefrLevel;
  frequency_rank: number | null;
  payload: GeneratedJson;
  pack_version: string;
  created_at: GeneratedTimestamp;
}

export interface ExercisesTable {
  id: Generated<string>;
  lesson_id: string;
  ordinal: number;
  /** An id from the core-exercise-types registry. */
  type: string;
  skill: Skill;
  payload: Json;
  cando_ids: Generated<string[]>;
  item_ids: Generated<string[]>;
  pack_version: string;
  created_at: GeneratedTimestamp;
}

// ---------- core-identity ----------

export interface ProfilesTable {
  /** Same value as users.id. Not generated. */
  id: string;
  display_name: string | null;
  ui_locale: Generated<string>;
  timezone: Generated<string>;
  daily_goal_minutes: Generated<number>;
  active_language: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface LearnerLanguagesTable {
  user_id: string;
  language_code: string;
  target_level: Generated<CefrLevel>;
  current_level_estimate: CefrLevel | null;
  started_at: GeneratedTimestamp;
}

// ---------- core-lesson-engine ----------

export interface LessonSessionsTable {
  id: Generated<string>;
  user_id: string;
  lesson_id: string;
  started_at: GeneratedTimestamp;
  completed_at: Timestamp | null;
  /** numeric(4,3), 0 to 1. */
  score: Numeric | null;
  exercise_order: Generated<string[]>;
}

export interface AttemptsTable {
  id: Generated<string>;
  user_id: string;
  session_id: string | null;
  exercise_id: string | null;
  item_id: string | null;
  exercise_type: string;
  correct: boolean;
  /** numeric(4,3), 0 to 1. */
  score: Numeric;
  response: GeneratedJson;
  feedback: GeneratedJson;
  duration_ms: number | null;
  created_at: GeneratedTimestamp;
}

// ---------- core-srs ----------

export interface ReviewCardsTable {
  user_id: string;
  item_id: string;
  stability: Generated<number>;
  difficulty: Generated<number>;
  due: GeneratedTimestamp;
  last_review: Timestamp | null;
  reps: Generated<number>;
  lapses: Generated<number>;
  state: Generated<'new' | 'learning' | 'review' | 'relearning'>;
  updated_at: GeneratedTimestamp;
  /** From 0005. Interval the card carried into its next review. */
  scheduled_days: Generated<number>;
  /** From 0005. Position in the FSRS learning steps. */
  learning_steps: Generated<number>;
}

export interface ReviewLogsTable {
  id: Generated<string>;
  user_id: string;
  item_id: string;
  /** 1 again, 2 hard, 3 good, 4 easy. */
  rating: 1 | 2 | 3 | 4;
  reviewed_at: GeneratedTimestamp;
  elapsed_days: number | null;
  scheduled_days: number | null;
  state_before: string | null;
}

// ---------- core-progress ----------

export interface CandoMasteryTable {
  user_id: string;
  cando_id: string;
  evidence_count: Generated<number>;
  correct_count: Generated<number>;
  exercise_types_seen: Generated<string[]>;
  /** numeric(3,2). */
  best_production_score: Numeric | null;
  /** numeric(4,3). */
  recent_accuracy: Numeric | null;
  mastered_at: Timestamp | null;
  updated_at: GeneratedTimestamp;
}

export interface LevelEstimatesTable {
  id: Generated<string>;
  user_id: string;
  language_code: string;
  level: CefrLevel;
  /** numeric(4,3), 0 to 1. */
  confidence: Numeric;
  method: 'placement' | 'checkpoint' | 'mastery_ratio' | 'manual';
  created_at: GeneratedTimestamp;
}

export interface StreaksTable {
  user_id: string;
  language_code: string;
  current_days: Generated<number>;
  longest_days: Generated<number>;
  last_active_date: DateOnly | null;
}

// ---------- core-assessment ----------

export interface AssessmentsTable {
  id: Generated<string>;
  user_id: string;
  language_code: string;
  kind: 'placement' | 'checkpoint' | 'exam_sim';
  level: CefrLevel | null;
  status: Generated<'in_progress' | 'completed' | 'abandoned'>;
  /** numeric(4,3). */
  score: Numeric | null;
  section_scores: GeneratedJson;
  result: GeneratedJson;
  started_at: GeneratedTimestamp;
  completed_at: Timestamp | null;
}

// ---------- core-ai-tutor ----------

export interface TutorConversationsTable {
  id: Generated<string>;
  user_id: string;
  language_code: string;
  mode: Generated<'chat' | 'roleplay' | 'explain'>;
  level: CefrLevel;
  scenario: string | null;
  created_at: GeneratedTimestamp;
  last_message_at: GeneratedTimestamp;
}

export interface TutorMessagesTable {
  id: Generated<string>;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  /** A JSON array. Write it with JSON.stringify. */
  corrections: GeneratedJson;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  created_at: GeneratedTimestamp;
}

export interface WritingSubmissionsTable {
  id: Generated<string>;
  user_id: string;
  language_code: string;
  task_id: string | null;
  prompt: string;
  text: string;
  target_level: CefrLevel;
  rubric_scores: Json | null;
  feedback: Json | null;
  estimated_level: CefrLevel | null;
  model: string | null;
  flagged_by_user: Generated<boolean>;
  created_at: GeneratedTimestamp;
}

// ---------- core-speech ----------

export interface SpeechRecordingsTable {
  id: Generated<string>;
  user_id: string;
  exercise_id: string | null;
  storage_path: string | null;
  transcript: string | null;
  target_text: string | null;
  /** numeric(4,3). */
  similarity: Numeric | null;
  provider: Generated<string>;
  created_at: GeneratedTimestamp;
  /** From 0004. Null for rows written before the column existed. */
  duration_ms: number | null;
}

// ---------- core-feedback ----------

export interface FeedbackTable {
  id: Generated<string>;
  /** null for anonymous feedback. */
  user_id: string | null;
  kind: 'bug' | 'idea' | 'confusing' | 'rating' | 'other';
  page: string | null;
  message: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  context: GeneratedJson;
  status: Generated<'new' | 'seen' | 'planned' | 'done' | 'wontfix'>;
  created_at: GeneratedTimestamp;
}

// ---------- core-analytics ----------

export interface EventsTable {
  id: Generated<string>;
  user_id: string | null;
  name: string;
  props: GeneratedJson;
  created_at: GeneratedTimestamp;
}

// ---------- core-entitlements ----------

export interface EntitlementsTable {
  user_id: string;
  plan: Generated<'free_beta' | 'free' | 'plus' | 'pro'>;
  features: GeneratedJson;
  limits: GeneratedJson;
  source: Generated<'default' | 'manual' | 'stripe'>;
  expires_at: Timestamp | null;
  updated_at: GeneratedTimestamp;
}

export interface FeatureFlagsTable {
  key: string;
  enabled: Generated<boolean>;
  rules: GeneratedJson;
  updated_at: GeneratedTimestamp;
}

// ---------- the table map ----------

/** From 0005. One row per attempt and descriptor; the mastery rule reads the last ten. */
export interface CandoOutcomesTable {
  id: Generated<string>;
  user_id: string;
  cando_id: string;
  correct: boolean;
  exercise_type: string;
  created_at: GeneratedTimestamp;
}

/**
 * Views. They are not keys of DB, because DB lists tables only. They are type
 * aliases, not interfaces, because Kysely's withTables needs an index signature. Reach a view
 * with `db.withTables<Views>()`, for example
 * `trx.withTables<Views>().selectFrom('daily_usage')`.
 */
export type DailyUsageView = {
  user_id: string;
  /** Local day of the user, as YYYY-MM-DD. */
  day: string;
  tutor_messages: number;
  writing_grades: number;
  speech_minutes: number;
};

export type Views = {
  daily_usage: DailyUsageView;
};

export interface DB {
  // core-auth (users from 0001; sessions, accounts, verifications from 0002)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;
  // core-curriculum
  languages: LanguagesTable;
  cefr_levels: CefrLevelsTable;
  cando_descriptors: CandoDescriptorsTable;
  units: UnitsTable;
  lessons: LessonsTable;
  // core-content
  content_pack_versions: ContentPackVersionsTable;
  items: ItemsTable;
  exercises: ExercisesTable;
  // core-identity
  profiles: ProfilesTable;
  learner_languages: LearnerLanguagesTable;
  // core-lesson-engine
  lesson_sessions: LessonSessionsTable;
  attempts: AttemptsTable;
  // core-srs
  review_cards: ReviewCardsTable;
  review_logs: ReviewLogsTable;
  // core-progress
  cando_mastery: CandoMasteryTable;
  level_estimates: LevelEstimatesTable;
  streaks: StreaksTable;
  cando_outcomes: CandoOutcomesTable;
  // core-assessment
  assessments: AssessmentsTable;
  // core-ai-tutor
  tutor_conversations: TutorConversationsTable;
  tutor_messages: TutorMessagesTable;
  writing_submissions: WritingSubmissionsTable;
  // core-speech
  speech_recordings: SpeechRecordingsTable;
  // core-feedback
  feedback: FeedbackTable;
  // core-analytics
  events: EventsTable;
  // core-entitlements
  entitlements: EntitlementsTable;
  feature_flags: FeatureFlagsTable;
}

export type TableName = keyof DB;

/**
 * Resolves to the list itself when it names every key of DB. When a key is
 * missing it resolves to an object type that names the missing tables, so the
 * assignment below fails to compile and the error says which table to add.
 * A name that is not a key of DB is rejected earlier, by `satisfies`.
 */
type EveryTable<Names extends readonly TableName[]> = [Missing<Names>] extends [never]
  ? Names
  : { readonly missing_from_TABLE_NAMES: Missing<Names> };
type Missing<Names extends readonly TableName[]> = Exclude<TableName, Names[number]>;

const tableNames = [
  'users',
  'languages',
  'cefr_levels',
  'cando_descriptors',
  'units',
  'lessons',
  'content_pack_versions',
  'items',
  'exercises',
  'profiles',
  'learner_languages',
  'lesson_sessions',
  'attempts',
  'review_cards',
  'review_logs',
  'cando_mastery',
  'level_estimates',
  'streaks',
  'assessments',
  'tutor_conversations',
  'tutor_messages',
  'writing_submissions',
  'speech_recordings',
  'feedback',
  'events',
  'entitlements',
  'feature_flags',
  // 0002_auth.sql
  'sessions',
  'accounts',
  'verifications',
  // 0005_phase1_fixes.sql
  'cando_outcomes',
] as const satisfies readonly TableName[];

/** Every key of DB, in migration order. Checked at compile time against DB. */
export const TABLE_NAMES: EveryTable<typeof tableNames> = tableNames;
