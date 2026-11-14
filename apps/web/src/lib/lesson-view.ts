// What the lesson screen receives from the server. Plain data only, so it
// crosses the server action boundary. Shared by server and client code.

import type { Feedback } from '@stufen/contracts';

/** The three task types the tutor will grade. Until then they are self checks. */
export const SELF_CHECK_TYPES = ['translate', 'write_free', 'speak_prompt'] as const;
export type SelfCheckType = (typeof SELF_CHECK_TYPES)[number];

/** The parts of a self check payload the screen shows. */
export interface SelfCheckContent {
  type: SelfCheckType;
  /** The task in English, or the sentence to translate. */
  prompt: string;
  /** True when `prompt` is in the target language (translate, to English). */
  promptInTarget: boolean;
  /** The task in the target language, when the pack has it. */
  promptNative: string | null;
  /** A sample answer or reference. Null when the pack gives none. */
  sample: string | null;
  /** True when the sample is in the target language. */
  sampleInTarget: boolean;
  /** For a read aloud task: the text to say. */
  targetText: string | null;
  /** A short note, such as the word range or a remark of the author. */
  note: string | null;
}

/** One exercise as the lesson screen shows it. */
export interface ExerciseView {
  id: string;
  type: string;
  payload: unknown;
  /** The instruction line. English at A1. */
  instruction: string | null;
  /** Set for the three types without a grader, null for the eight others. */
  selfCheck: SelfCheckContent | null;
}

/** The grade as the client gets it. A GradeResult without the error types. */
export interface AnswerResultView {
  correct: boolean;
  score: number;
  feedback: Feedback;
  /** True when nobody checked the answer. It is stored, and it is no evidence. */
  provisional: boolean;
}

/** What the screen shows after the last exercise. */
export interface LessonSummaryView {
  lessonId: string;
  lessonTitle: string;
  /** The target language, as a BCP 47 tag for `lang`. Empty when it is not known. */
  language: string;
  /** Exercises a grader checked, and how many of those were right. */
  checked: number;
  correct: number;
  /** Tasks saved as a self check. They are not part of the score. */
  selfChecked: number;
  /** How many items the lesson handed to the review box. */
  newReviewItems: number;
  next: { id: string; title: string } | null;
}

/** A lesson in progress: where the learner is and what comes now. */
export interface LessonProgressView {
  sessionId: string;
  lessonId: string;
  lessonTitle: string;
  /** The target language, as a BCP 47 tag for `lang`. */
  language: string;
  total: number;
  /** 1 for the first exercise. */
  position: number;
  exercise: ExerciseView;
}

export type LessonView =
  ({ status: 'in_progress' } & LessonProgressView) | { status: 'done'; summary: LessonSummaryView };

export type AnswerOutcome =
  | { ok: true; result: AnswerResultView; next: ExerciseView | null }
  | { ok: false; message: string };

export type FinishOutcome =
  { ok: true; summary: LessonSummaryView } | { ok: false; message: string };

export function isSelfCheckType(type: string): type is SelfCheckType {
  return (SELF_CHECK_TYPES as readonly string[]).includes(type);
}
