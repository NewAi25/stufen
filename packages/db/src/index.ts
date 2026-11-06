// @stufen/db public surface. Nothing else in this package is public.
import type { Insertable, Kysely, Selectable, Transaction, Updateable } from 'kysely';
import type { DB, TableName } from './schema';

export { createDb } from './create-db';
export { migrate } from './migrate';
export type { MigrateResult } from './migrate';
export { withUser } from './with-user';
export { TABLE_NAMES } from './schema';
export type {
  DB,
  TableName,
  // value types
  CefrLevel,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Skill,
  // one interface per table
  AccountsTable,
  AssessmentsTable,
  AttemptsTable,
  CandoDescriptorsTable,
  CandoMasteryTable,
  CefrLevelsTable,
  ContentPackVersionsTable,
  EntitlementsTable,
  EventsTable,
  ExercisesTable,
  FeatureFlagsTable,
  FeedbackTable,
  ItemsTable,
  LanguagesTable,
  LearnerLanguagesTable,
  LessonSessionsTable,
  LessonsTable,
  LevelEstimatesTable,
  ProfilesTable,
  ReviewCardsTable,
  ReviewLogsTable,
  SessionsTable,
  SpeechRecordingsTable,
  StreaksTable,
  TutorConversationsTable,
  TutorMessagesTable,
  UnitsTable,
  UsersTable,
  VerificationsTable,
  WritingSubmissionsTable,
} from './schema';

// Boxes do not import kysely themselves, so the handles and row shapes a
// Postgres adapter needs are named here.

/** What createDb returns. */
export type Database = Kysely<DB>;
/** What withUser hands to fn. */
export type DatabaseTransaction = Transaction<DB>;
/** A row as a select returns it. */
export type Row<T extends TableName> = Selectable<DB[T]>;
/** The values an insert takes. Defaulted and nullable columns are optional. */
export type NewRow<T extends TableName> = Insertable<DB[T]>;
/** The values an update may set. Every column is optional. */
export type RowPatch<T extends TableName> = Updateable<DB[T]>;
export type { DailyUsageView, Views } from './schema';
// Boxes may not import kysely themselves. This is the raw SQL tag they use for
// the few statements the query builder cannot express, such as calling
// ensure_profile.
export { sql } from 'kysely';
