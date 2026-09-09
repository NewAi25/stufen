// Shared types for every box. Readable copy: docs/04-module-contracts.md.
// Field names follow docs/03-data-schema.md, written in camelCase for TypeScript.
// Pack input shapes (CandoInput, ItemInput, UnitInput) keep the snake_case of
// the JSON files they are read from, because they are validated against
// content/schema/ as is.

// ---------- enum like unions and their runtime arrays ----------

export const LANGUAGE_CODES = ['de', 'nl', 'fr'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const SKILLS = [
  'reading',
  'listening',
  'spoken_production',
  'spoken_interaction',
  'writing',
  'mediation',
  'grammar',
  'vocabulary',
] as const;
export type Skill = (typeof SKILLS)[number];

export const EXERCISE_TYPES = [
  'multiple_choice',
  'cloze',
  'match_pairs',
  'order_words',
  'translate',
  'dictation',
  'read_answer',
  'listen_answer',
  'write_free',
  'speak_prompt',
  'flashcard',
] as const;
export type ExerciseTypeId = (typeof EXERCISE_TYPES)[number];

export const ERROR_TYPES = [
  'article',
  'case',
  'gender',
  'word_order',
  'spelling',
  'tense',
  'register',
  'vocabulary',
  'other',
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

/** Loose JSON Schema object. The only place `any` is allowed through. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JSONSchema = Record<string, any>;

/** SRS rating: 1 again, 2 hard, 3 good, 4 easy. */
export type ReviewRating = 1 | 2 | 3 | 4;

// ---------- grading ----------

/** One correction on a learner text. See docs/10-ai-tutor.md. */
export interface Correction {
  span: string;
  errorType: ErrorType;
  correction: string;
  note: string;
}

/** What the learner sees after an answer. Shape may grow. */
export interface Feedback {
  message: string;
  explanation?: string;
  expected?: string;
  corrections?: Correction[];
}

export interface GradeResult {
  /** Pass or fail for evidence purposes. */
  correct: boolean;
  /** 0 to 1. */
  score: number;
  /** Shown to the learner. */
  feedback: Feedback;
  errorTypes?: ErrorType[];
}

/** Signature of core-ai-tutor.aiGrade, handed to graders through GradeContext. */
export type AiGrader = (
  exerciseType: ExerciseTypeId,
  payload: unknown,
  response: unknown,
  level: CefrLevel,
  rules: LanguageRules,
) => Promise<GradeResult>;

/** Passed to ExerciseTypeDefinition.grade. Has languageRules and aiGrader. */
export interface GradeContext {
  language: LanguageCode;
  level: CefrLevel;
  languageRules: LanguageRules;
  /** Absent when no AI grader is wired, for example in offline tests. */
  aiGrader?: AiGrader;
}

// ---------- language rules (implemented by lang-* boxes) ----------

export type GrammaticalCase = 'nominative' | 'accusative' | 'dative' | 'genitive';
export type Gender = 'm' | 'f' | 'n';
export type GrammaticalNumber = Gender | 'plural';

export interface LanguageRules {
  /** Article per case, per gender and number. Shape may grow. */
  articles: Record<GrammaticalCase, Record<GrammaticalNumber, string>>;
  nounGender(lemma: string): Gender | undefined;
  /** Regular and listed irregular verbs. */
  conjugate(verb: string, person: string, tense: string): string | undefined;
  /** Case folding and character normalisation for lenient compare. */
  normalize(text: string): string;
  /** Used by cloze and translate graders. */
  classifyError(expected: string, actual: string): ErrorType[];
}

// ---------- core-identity ----------

export interface Profile {
  id: string;
  displayName: string | null;
  uiLocale: string;
  timezone: string;
  dailyGoalMinutes: number;
  activeLanguage: LanguageCode | null;
  createdAt: string;
  updatedAt: string;
}

/** The fields a learner may change through updateProfile. */
export type ProfileEditable = Pick<
  Profile,
  'displayName' | 'uiLocale' | 'timezone' | 'dailyGoalMinutes'
>;

export interface LearnerLanguage {
  userId: string;
  languageCode: LanguageCode;
  targetLevel: CefrLevel;
  currentLevelEstimate: CefrLevel | null;
  startedAt: string;
}

// ---------- core-curriculum ----------

/** Overrides for the default mastery rule in docs/04. */
export interface MasteryRule {
  evidenceCount?: number;
  distinctExerciseTypes?: number;
  recentAccuracy?: number;
  bestProductionScore?: number;
}

export interface Cando {
  id: string;
  /** Null means the common CEFR descriptor. */
  languageCode: LanguageCode | null;
  level: CefrLevel;
  skill: Skill;
  /** Stable key like A1.LIS.03. */
  code: string;
  textEn: string;
  textNative: string | null;
  source: string;
  masteryRule: MasteryRule | null;
}

export interface Unit {
  id: string;
  languageCode: LanguageCode;
  level: CefrLevel;
  ordinal: number;
  slug: string;
  title: string;
  description: string | null;
  packVersion: string;
}

export type LessonKind = 'core' | 'review' | 'production' | 'checkpoint';

export interface LessonSummary {
  id: string;
  unitId: string;
  ordinal: number;
  slug: string;
  title: string;
  kind: LessonKind;
  estimatedMinutes: number;
  candoIds: string[];
  packVersion: string;
}

export interface Exercise {
  id: string;
  lessonId: string;
  ordinal: number;
  type: ExerciseTypeId;
  skill: Skill;
  /** Shape depends on type, validated against the type payloadSchema. */
  payload: unknown;
  candoIds: string[];
  itemIds: string[];
  packVersion: string;
}

/** A lesson with its exercises in ordinal order. */
export interface Lesson extends LessonSummary {
  exercises: Exercise[];
}

// ---------- core-content ----------

export type ItemKind = 'vocab' | 'chunk' | 'grammar' | 'phrase';

export interface Item {
  id: string;
  languageCode: LanguageCode;
  kind: ItemKind;
  /** Stable string like de:vocab:haus. */
  key: string;
  lemma: string;
  glossEn: string;
  level: CefrLevel;
  frequencyRank: number | null;
  /** Gender, plural, forms, examples, audio path. Shape depends on kind. */
  payload: unknown;
  packVersion: string;
}

export interface PackSource {
  id: string;
  title: string;
  publisher: string;
  author?: string;
  year?: number;
  url?: string;
  note?: string;
}

/** content/<lang>/pack.json. See docs/09-content-pack-spec.md. */
export interface PackManifest {
  code: LanguageCode;
  version: string;
  name: string;
  name_native: string;
  description?: string;
  locale?: string;
  levels: CefrLevel[];
  tts?: { locale: string; voiceHint: string };
  sources: PackSource[];
  checksum: string;
  strictUnitEnding?: boolean;
  reviewed?: boolean;
  updated?: string;
}

/** One element of content/<lang>/candos/<level>.json. */
export interface CandoInput {
  key: string;
  code: string;
  level: CefrLevel;
  skill: Skill;
  text_en: string;
  text_native?: string;
  source: string;
  source_note?: string;
  sequence_ref?: string;
  mastery_rule?: {
    evidence_count?: number;
    distinct_exercise_types?: number;
    recent_accuracy?: number;
    best_production_score?: number;
  };
  reviewed?: boolean;
  note?: string;
}

/** One line of content/<lang>/items/<level>.jsonl. */
export interface ItemInput {
  key: string;
  kind: ItemKind;
  lemma: string;
  gloss_en: string;
  level: CefrLevel;
  frequency_rank?: number;
  source: string;
  source_note?: string;
  tags?: string[];
  reviewed?: boolean;
  note?: string;
  /** Shape depends on kind, validated by content/schema/item.schema.json. */
  payload: Record<string, unknown>;
}

export interface ExerciseInput {
  key: string;
  ordinal: number;
  type: ExerciseTypeId;
  skill: Skill;
  cando_ids: string[];
  item_ids: string[];
  instruction_en?: string;
  instruction_native?: string;
  payload: Record<string, unknown>;
  source?: string;
  reviewed?: boolean;
}

export interface LessonInput {
  key: string;
  unit_key: string;
  ordinal: number;
  slug: string;
  title: string;
  title_en: string;
  description?: string;
  kind: LessonKind;
  estimated_minutes: number;
  cando_ids: string[];
  introduces_item_ids?: string[];
  exercises: ExerciseInput[];
  source?: string;
  reviewed?: boolean;
}

/** A unit with its lessons with their exercises, as read from content/<lang>/units/. */
export interface UnitInput {
  key: string;
  level: CefrLevel;
  ordinal: number;
  slug: string;
  title: string;
  title_en: string;
  description?: string;
  theme: string;
  lessons: LessonInput[];
  source?: string;
  reviewed?: boolean;
}

export interface ValidationIssue {
  file: string;
  /** JSON pointer or key of the failing element. */
  path: string;
  message: string;
}

export interface ValidationReport {
  language: LanguageCode;
  version: string;
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Result of installPack. Shape may grow. */
export interface InstallReport {
  language: LanguageCode;
  version: string;
  status: 'active' | 'failed';
  candos: number;
  items: number;
  units: number;
  lessons: number;
  exercises: number;
  error?: string;
}

export type ImmersionMode = 'en' | 'mixed' | 'target';

/** The interface every lang-* box implements. */
export interface LanguagePack {
  code: LanguageCode;
  version: string;
  loadManifest(): PackManifest;
  loadCandos(): CandoInput[];
  loadItems(): ItemInput[];
  /** Units with lessons with exercises. */
  loadUnits(): UnitInput[];
  rules: LanguageRules;
  immersionRamp: Record<CefrLevel, ImmersionMode>;
  examFormats: ExamFormat[];
  tts: { voiceHint: string; locale: string };
}

// ---------- core-exercise-types ----------

export interface ExerciseTypeDefinition {
  id: ExerciseTypeId;
  /** Which skills it can evidence. */
  skill: Skill[];
  /** Validated at pack install. */
  payloadSchema: JSONSchema;
  grade(payload: unknown, response: unknown, ctx: GradeContext): Promise<GradeResult>;
  /** translate, write_free, speak_prompt. */
  needsAi: boolean;
  /** apps/web maps this to a component. */
  rendererKey: string;
}

// ---------- core-lesson-engine ----------

export interface LessonSession {
  id: string;
  userId: string;
  lessonId: string;
  startedAt: string;
  completedAt: string | null;
  /** 0 to 1, set on completion. */
  score: number | null;
  exerciseOrder: string[];
}

export interface SessionResult {
  sessionId: string;
  lessonId: string;
  /** 0 to 1. */
  score: number;
  attempts: number;
  correct: number;
  completedAt: string;
}

/** An attempt outside a lesson session: review, tutor task, assessment. */
export interface StandaloneAttempt {
  language: LanguageCode;
  exerciseType: ExerciseTypeId;
  exerciseId?: string;
  itemId?: string;
  correct: boolean;
  /** 0 to 1. */
  score: number;
  candoIds: string[];
  itemIds: string[];
  response?: unknown;
  feedback?: Feedback;
  durationMs?: number;
}

// ---------- core-srs ----------

export type ReviewState = 'new' | 'learning' | 'review' | 'relearning';

export interface ReviewCard {
  userId: string;
  itemId: string;
  stability: number;
  difficulty: number;
  due: string;
  lastReview: string | null;
  reps: number;
  lapses: number;
  state: ReviewState;
}

// ---------- core-progress ----------

export interface CandoMastery {
  userId: string;
  candoId: string;
  evidenceCount: number;
  correctCount: number;
  exerciseTypesSeen: ExerciseTypeId[];
  bestProductionScore: number | null;
  recentAccuracy: number | null;
  masteredAt: string | null;
  updatedAt: string;
}

export type LevelEstimateMethod = 'placement' | 'checkpoint' | 'mastery_ratio' | 'manual';

export interface LevelEstimate {
  userId: string;
  languageCode: LanguageCode;
  level: CefrLevel;
  /** 0 to 1. */
  confidence: number;
  method: LevelEstimateMethod;
  createdAt: string;
}

export interface Streak {
  userId: string;
  languageCode: LanguageCode;
  currentDays: number;
  longestDays: number;
  lastActiveDate: string | null;
}

export type CheckpointStatus = 'locked' | 'available' | 'passed' | 'failed';

/** One level row of the level map. Shape may grow. */
export interface LevelMapLevel {
  level: CefrLevel;
  candos: CandoMastery[];
  masteredCount: number;
  totalCount: number;
  checkpoint: CheckpointStatus;
}

export interface LevelMap {
  userId: string;
  languageCode: LanguageCode;
  estimate: LevelEstimate | null;
  levels: LevelMapLevel[];
}

// ---------- core-assessment ----------

export type AssessmentKind = 'placement' | 'checkpoint' | 'exam_sim';
export type AssessmentStatus = 'in_progress' | 'completed' | 'abandoned';

export interface Assessment {
  id: string;
  userId: string;
  languageCode: LanguageCode;
  kind: AssessmentKind;
  level: CefrLevel | null;
  status: AssessmentStatus;
  startedAt: string;
  completedAt: string | null;
}

/** One question inside an assessment. Shape may grow. */
export interface Question {
  id: string;
  assessmentId: string;
  ordinal: number;
  type: ExerciseTypeId;
  skill: Skill;
  level: CefrLevel;
  payload: unknown;
}

export interface AssessmentResult {
  assessmentId: string;
  kind: AssessmentKind;
  level: CefrLevel | null;
  /** 0 to 1. */
  score: number;
  sectionScores: Record<string, number>;
  passed: boolean;
  completedAt: string;
}

export type ExamFormatId = string;

export interface ExamSection {
  id: string;
  name: string;
  name_en?: string;
  skill: Skill;
  task_count: number;
  item_count?: number;
  minutes: number;
  points?: number;
  task_types_en?: string[];
  source: string;
  note?: string;
}

/** One element of content/<lang>/exam-formats.json. */
export interface ExamFormat {
  id: ExamFormatId;
  name: string;
  level: CefrLevel;
  provider: string;
  total_minutes?: number;
  max_points?: number;
  /** Fraction of max_points needed to pass. */
  pass_mark: number;
  scoring_en?: string;
  sections: ExamSection[];
  source: string;
  source_note?: string;
  reviewed?: boolean;
}

// ---------- core-ai-tutor ----------

export type TutorMode = 'chat' | 'roleplay' | 'explain';

export interface Conversation {
  id: string;
  userId: string;
  languageCode: LanguageCode;
  mode: TutorMode;
  level: CefrLevel;
  scenario: string | null;
  createdAt: string;
  lastMessageAt: string | null;
}

/** Streamed by sendTurn. See docs/10-ai-tutor.md. */
export type TutorChunk =
  | { kind: 'text'; delta: string }
  | { kind: 'corrections'; items: Correction[] }
  | { kind: 'done'; messageId: string; inputTokens: number; outputTokens: number }
  | { kind: 'error'; code: string; learnerMessage: string };

/** Each 0 to 5. */
export interface RubricScores {
  task: number;
  coherence: number;
  vocabulary: number;
  grammar: number;
  overall: number;
}

export interface WritingGrade {
  submissionId: string;
  rubricScores: RubricScores;
  feedback: Feedback;
  estimatedLevel: CefrLevel;
  corrections: Correction[];
}

// ---------- core-speech ----------

export interface SpeechProvider {
  transcribe(audio: Blob, locale: string): Promise<{ text: string; confidence?: number }>;
  speak(text: string, locale: string, voiceHint?: string): Promise<AudioSource>;
}

/** What speak() returns. Shape may grow. */
export interface AudioSource {
  url: string;
  mimeType?: string;
  durationMs?: number;
}

export interface WordDiff {
  op: 'equal' | 'insert' | 'delete' | 'replace';
  expected?: string;
  actual?: string;
}

export interface Recording {
  id: string;
  userId: string;
  exerciseId: string | null;
  storagePath: string;
  transcript: string;
  targetText: string;
  similarity: number;
  provider: string;
  createdAt: string;
}

// ---------- core-feedback ----------

export type FeedbackKind = 'bug' | 'idea' | 'confusing' | 'rating' | 'other';
export type FeedbackStatus = 'new' | 'seen' | 'planned' | 'done' | 'wontfix';

export interface FeedbackItem {
  id: string;
  userId: string | null;
  kind: FeedbackKind;
  page: string;
  message: string;
  rating: number | null;
  context: Record<string, unknown> | null;
  status: FeedbackStatus;
  createdAt: string;
}

// ---------- core-entitlements ----------

export const FEATURE_KEYS = [
  'tutor',
  'writing_studio',
  'speech',
  'exam_sim',
  'levels_above_b1',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = [
  'tutor_messages_per_day',
  'writing_grades_per_day',
  'speech_minutes_per_day',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export type PlanId = 'free_beta' | 'free' | 'plus' | 'pro';
export type EntitlementSource = 'default' | 'manual' | 'stripe';

export interface Entitlement {
  userId: string;
  plan: PlanId;
  /** Per user overrides on top of the plan. */
  features: Partial<Record<FeatureKey, boolean>>;
  limits: Partial<Record<LimitKey, number>>;
  source: EntitlementSource;
  expiresAt: string | null;
  updatedAt: string;
}

export interface EntitlementChange {
  userId: string;
  plan: PlanId;
  expiresAt: Date | null;
}

/** Payment adapter slot, unused in beta. See docs/12-entitlements-and-payments.md. */
export interface PaymentProvider {
  createCheckout(input: {
    userId: string;
    plan: 'plus' | 'pro';
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortalSession(input: { userId: string; returnUrl: string }): Promise<{ url: string }>;
  handleWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ eventId: string; handled: boolean; change?: EntitlementChange }>;
}
