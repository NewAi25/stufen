# 04. Module contracts

Everything a box exposes is listed here. If it is not in this document, it is not public and `apps/web` may not use it. The TypeScript versions of these live in `packages/contracts/src/`. This document is the readable copy and is updated in the same commit as the code.

## Shared types (contracts)

```ts
type LanguageCode = 'de' | 'nl' | 'fr';
type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type Skill = 'reading' | 'listening' | 'spoken_production' | 'spoken_interaction'
           | 'writing' | 'mediation' | 'grammar' | 'vocabulary';
type ExerciseTypeId = 'multiple_choice' | 'cloze' | 'match_pairs' | 'order_words'
           | 'translate' | 'dictation' | 'read_answer' | 'listen_answer'
           | 'write_free' | 'speak_prompt' | 'flashcard';

interface GradeResult {
  correct: boolean;          // pass or fail for evidence purposes
  score: number;             // 0 to 1
  feedback: Feedback;        // shown to the learner
  errorTypes?: ErrorType[];  // article, case, gender, word_order, spelling, tense, register, vocabulary, other
}
```

## Event bus (contracts)

```ts
interface EventMap {
  'user.signed_up':        { userId: string };
  'user.language_set':     { userId: string; language: LanguageCode; targetLevel: CefrLevel };
  'content.pack_installed':{ language: LanguageCode; version: string };
  'attempt.recorded':      { userId: string; attemptId: string; exerciseType: ExerciseTypeId;
                             correct: boolean; score: number; candoIds: string[]; itemIds: string[];
                             language: LanguageCode };
  'lesson.completed':      { userId: string; lessonId: string; score: number };
  'item.reviewed':         { userId: string; itemId: string; rating: 1|2|3|4 };
  'cando.mastered':        { userId: string; candoId: string; level: CefrLevel };
  'level.reached':         { userId: string; language: LanguageCode; level: CefrLevel; method: string };
  'assessment.completed':  { userId: string; assessmentId: string; kind: string; level?: CefrLevel; score: number };
  'writing.graded':        { userId: string; submissionId: string; overall: number; estimatedLevel: CefrLevel };
  'tutor.turn':            { userId: string; conversationId: string; correctionCount: number };
  'speech.transcribed':    { userId: string; recordingId: string; similarity: number };
  'feedback.submitted':    { feedbackId: string; kind: string };
  'entitlement.changed':   { userId: string; plan: string };
}

interface EventBus {
  emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): Promise<void>;
  on<K extends keyof EventMap>(name: K, handler: (p: EventMap[K]) => Promise<void>): () => void;
  onAny(handler: (name: string, payload: unknown) => Promise<void>): () => void;
}
```

## db (infra)

```ts
createDb(url: string): Kysely<DB>                      // one instance per process, built by apps/web
migrate(db, dir): Promise<{ applied: string[] }>        // applies missing numbered SQL files, records them in schema_migrations
withUser<T>(db, userId: string | null, fn: (trx) => Promise<T>): Promise<T>
                                                        // transaction with set_config('app.user_id', userId, true) so RLS applies
```

No box imports `pg` or `kysely` directly. Each box that persists data defines its own storage port and ships an in memory adapter for unit tests and a Postgres adapter built on `db`. See ADR-008.

## core-auth

```ts
// Interface lives in contracts (src/ports.ts) so any box can depend on it.
interface AuthPort {
  getSession(sessionToken): Promise<AuthSession | null>;          // null when missing, unknown or expired
  requestMagicLink(email, redirectTo): Promise<{ sent: true }>;    // sends through a MailPort
  consumeMagicLink(token): Promise<AuthSession | null>;            // one time; unknown or used tokens return null
  signInWithGoogle(redirectTo): Promise<{ url: string }>;
  signOut(sessionToken): Promise<void>;
}
createInMemoryAuth(options: { mail: MailPort; bus?: EventBus; now?: () => Date }): AuthPort
// On first sign in: emits user.signed_up. The Postgres adapter also calls ensure_profile(userId).
```

Owns `users`, `sessions`, `accounts`, `verifications`. The production adapter is better-auth (Phase 1). Replaceable.

## core-storage

```ts
// Interface lives in contracts (src/ports.ts).
interface StoragePort {
  put(key, data: Uint8Array, contentType): Promise<void>;
  get(key): Promise<Uint8Array | null>;
  delete(key): Promise<void>;
  signedUrl(key, ttlSeconds?): Promise<string>;
}
createFsStorage(options: { root: string; baseUrl?: string }): StoragePort    // dev and tests
// s3 adapter for any S3 compatible endpoint arrives in Phase 3
```

Keys are relative paths such as `<userId>/recordings/<id>.webm`. A key that escapes the root throws.

## core-mail

```ts
// Interface lives in contracts (src/ports.ts).
interface MailPort {
  send(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ messageId: string }>;
}
createConsoleMail(options?: { log?: (line: string) => void }): MailPort & { sent: MailMessage[] }   // dev and tests
// smtp adapter arrives in Phase 1
```

## core-identity

```ts
getProfile(userId): Promise<Profile>
updateProfile(userId, patch: Partial<ProfileEditable>): Promise<Profile>
setActiveLanguage(userId, language, targetLevel): Promise<void>     // emits user.language_set
listLearnerLanguages(userId): Promise<LearnerLanguage[]>
```

Sign in is not here. `core-auth` owns it and emits `user.signed_up`.

## core-curriculum

```ts
listLevels(): CefrLevel[]
listCandos(language, level?, skill?): Promise<Cando[]>
getCando(candoId): Promise<Cando>
listUnits(language, level): Promise<Unit[]>
listLessons(unitId): Promise<LessonSummary[]>
getLesson(lessonId): Promise<Lesson>                    // includes ordered exercises
nextLessonFor(userId, language): Promise<LessonSummary | null>   // first incomplete lesson at current level
```

## core-content

```ts
registerPack(pack: LanguagePack): void                 // called once at app start by apps/web
validatePack(language): Promise<ValidationReport>      // schema plus referential checks
installPack(language, version): Promise<InstallReport> // service role, emits content.pack_installed
activePackVersion(language): Promise<string | null>
```

`LanguagePack` is the interface every `lang-*` box implements:

```ts
interface LanguagePack {
  code: LanguageCode;
  version: string;
  loadManifest(): PackManifest;
  loadCandos(): CandoInput[];
  loadItems(): ItemInput[];
  loadUnits(): UnitInput[];                // units with lessons with exercises
  rules: LanguageRules;                    // see lang-de
  immersionRamp: Record<CefrLevel, 'en' | 'mixed' | 'target'>;
  examFormats: ExamFormat[];
  tts: { voiceHint: string; locale: string };
}
```

## core-lesson-engine

```ts
startSession(userId, lessonId): Promise<LessonSession>
currentExercise(sessionId): Promise<Exercise | null>
submitAnswer(sessionId, exerciseId, response): Promise<{ grade: GradeResult; next: Exercise | null }>
                                                          // emits attempt.recorded
completeSession(sessionId): Promise<SessionResult>       // emits lesson.completed
recordStandaloneAttempt(userId, input: StandaloneAttempt): Promise<void>  // used by srs, tutor, assessment
```

## core-exercise-types

```ts
registerType(def: ExerciseTypeDefinition): void
getType(id: ExerciseTypeId): ExerciseTypeDefinition
listTypes(): ExerciseTypeDefinition[]

interface ExerciseTypeDefinition {
  id: ExerciseTypeId;
  skill: Skill[];                          // which skills it can evidence
  payloadSchema: JSONSchema;               // validated at pack install
  grade(payload, response, ctx: GradeContext): Promise<GradeResult>;   // ctx has languageRules and aiGrader
  needsAi: boolean;                        // translate, write_free, speak_prompt
  rendererKey: string;                     // apps/web maps this to a component
}
```

## core-srs

```ts
dueQueue(userId, language, limit?): Promise<ReviewCard[]>
review(userId, itemId, rating: 1|2|3|4): Promise<ReviewCard>     // emits item.reviewed
introduceItems(userId, itemIds): Promise<void>                   // called after a lesson introduces items
stats(userId, language): Promise<{ due: number; learning: number; mature: number }>
```

## core-progress

```ts
masteryFor(userId, language, level?): Promise<CandoMastery[]>
levelEstimate(userId, language): Promise<LevelEstimate>
recordEstimate(userId, language, level, confidence, method): Promise<void>  // emits level.reached when level rises
streak(userId, language): Promise<Streak>
levelMap(userId, language): Promise<LevelMap>            // per level: candos, mastered count, checkpoint status
```

Default mastery rule, applied per can do unless `cando_descriptors.mastery_rule` overrides:

```
evidence_count >= 6
and correct in at least 2 distinct exercise types
and recent_accuracy (last 10 attempts) >= 0.8
and for skills writing, spoken_production, spoken_interaction:
    best_production_score >= 3 (of 5)
```

Level L is reached when all four conditions hold:

1. At least 80 percent of L's descriptors are mastered under the evidence rule.
2. Every production descriptor of L (`SPI`, `SPP`, `WRI`) is mastered, which needs a graded sample at or above 3 of 5 (4 of 5 at C1 and C2).
3. The checkpoint for L is completed: each exercise section at or above 60 percent, mirroring the Goethe module pass mark, plus one unscripted spoken roleplay and one written task drawn from L's scenario library, each graded at or above 3 of 5 (4 of 5 at C1 and C2) with a rubric estimated level of at least L.
4. Receptive and scaffolding evidence alone (`REA`, `LIS`, `GRA`, `VOC`) never raises a level. Until production evidence exists the level map shows "working towards L".

The level card shows the official CEFR global scale paragraph for L next to the evidence, states what L is good for in Germany with sources, and says that the estimate is not a certificate. Details and sources: `docs/14-levels-in-real-life.md`.

## core-assessment

```ts
startPlacement(userId, language): Promise<Assessment>
startCheckpoint(userId, language, level): Promise<Assessment>
startExamSim(userId, language, level, format: ExamFormatId): Promise<Assessment>
answer(assessmentId, questionId, response): Promise<{ next: Question | null }>
finish(assessmentId): Promise<AssessmentResult>          // emits assessment.completed, calls progress.recordEstimate
```

Checkpoints contain exercise sections shaped like the certifying exam plus two scenario tasks (one spoken roleplay, one written) from the level's scenario library; `finish` fails the checkpoint if either scenario task is below threshold regardless of the exercise sections.

Placement is adaptive: starts at A2, steps up on two consecutive correct blocks, steps down on two consecutive failed blocks, stops after 4 blocks or when bounded.

## core-ai-tutor

```ts
startConversation(userId, language, mode, level, scenario?): Promise<Conversation>
sendTurn(conversationId, text): AsyncIterable<TutorChunk>        // streams; final chunk carries corrections; emits tutor.turn
gradeWriting(userId, language, prompt, text, targetLevel, taskId?): Promise<WritingGrade>   // emits writing.graded
explain(language, level, question, context?): Promise<string>     // grammar or vocabulary explanation on demand
aiGrade(exerciseType, payload, response, level, rules): Promise<GradeResult>   // used by core-exercise-types
```

Prompts, rubrics and model settings are in `docs/10-ai-tutor.md`. Model ids are configuration.

## core-speech

```ts
interface SpeechProvider {
  transcribe(audio: Blob, locale: string): Promise<{ text: string; confidence?: number }>;
  speak(text: string, locale: string, voiceHint?: string): Promise<AudioSource>;
}
setProvider(p: SpeechProvider): void
transcribe(...)   // delegates
speak(...)        // delegates
compare(transcript, target): { similarity: number; diff: WordDiff[] }   // pure, no provider
saveRecording(userId, exerciseId, audio, transcript, target): Promise<Recording>  // stores through core-storage, emits speech.transcribed
```

## core-feedback

```ts
submit(input: { userId?: string; kind; page; message; rating?; context? }): Promise<void>   // emits feedback.submitted
listMine(userId): Promise<FeedbackItem[]>
```

## core-analytics

```ts
track(userId | null, name, props?): Promise<void>
attach(bus: EventBus): void            // subscribes onAny and writes events
```

## core-entitlements

```ts
can(userId, feature: FeatureKey): Promise<boolean>
remaining(userId, limit: LimitKey): Promise<number>          // per day, resets at user's midnight
consume(userId, limit: LimitKey, amount?): Promise<void>     // throws when exhausted
plan(userId): Promise<Entitlement>
flag(key: string, userId?, ctx?: { level?: CefrLevel }): Promise<boolean>   // ctx lets a rule gate on level
// remaining() and consume() count today's rows through a view named daily_usage owned by this box; nothing is stored in entitlements
// Payment adapter slot, unused in beta:
interface PaymentProvider { createCheckout(...); handleWebhook(...); }
setPaymentProvider(p: PaymentProvider): void
```

Feature keys in beta: `tutor`, `writing_studio`, `speech`, `exam_sim`, `levels_above_b1`. All true for `free_beta`.

## lang-de (implements LanguagePack)

```ts
rules: {
  articles: { nominative, accusative, dative, genitive } per gender and number;
  nounGender(lemma): 'm' | 'f' | 'n' | undefined;
  conjugate(verb, person, tense): string | undefined;   // regular and listed irregular verbs
  normalize(text): string;                              // ß, umlauts, case folding for lenient compare
  classifyError(expected, actual): ErrorType[];         // used by cloze and translate graders
}
```

## ui-kit

Components: `Button`, `Card`, `Progress`, `LevelBadge`, `Choice`, `TextInput`, `AudioButton`, `RecordButton`, `CorrectionInline`, `RubricBars`, `LevelMap`, `FeedbackFab`, `Toast`, `Sheet`. Tokens in `packages/ui-kit/src/tokens.ts`. See `docs/06-ui-ux.md`.

## apps/web routes

| Route | Boxes used |
|-------|------------|
| `/` | identity, progress, srs, curriculum |
| `/sign-in` | auth, mail |
| `/onboarding` | identity, assessment, entitlements |
| `/lesson/[id]` | lesson-engine, exercise-types, speech, ai-tutor (via graders) |
| `/review` | srs, exercise-types |
| `/tutor` | ai-tutor, speech, entitlements |
| `/write` | ai-tutor, entitlements |
| `/progress` | progress, curriculum |
| `/assess/[kind]` | assessment |
| `/settings` | identity |
| `/feedback` | feedback |
| `/api/*` | server actions, never called by boxes |
