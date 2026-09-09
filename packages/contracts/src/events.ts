// Event names and payloads. Readable copy: docs/04-module-contracts.md.
// This file declares the bus. The in process implementation is in ./bus.
import type { CefrLevel, ExerciseTypeId, LanguageCode, ReviewRating } from './types';

export interface EventMap {
  'user.signed_up': { userId: string };
  'user.language_set': { userId: string; language: LanguageCode; targetLevel: CefrLevel };
  'content.pack_installed': { language: LanguageCode; version: string };
  'attempt.recorded': {
    userId: string;
    attemptId: string;
    exerciseType: ExerciseTypeId;
    correct: boolean;
    score: number;
    candoIds: string[];
    itemIds: string[];
    language: LanguageCode;
  };
  'lesson.completed': { userId: string; lessonId: string; score: number };
  'item.reviewed': { userId: string; itemId: string; rating: ReviewRating };
  'cando.mastered': { userId: string; candoId: string; level: CefrLevel };
  'level.reached': { userId: string; language: LanguageCode; level: CefrLevel; method: string };
  'assessment.completed': {
    userId: string;
    assessmentId: string;
    kind: string;
    level?: CefrLevel;
    score: number;
  };
  'writing.graded': {
    userId: string;
    submissionId: string;
    overall: number;
    estimatedLevel: CefrLevel;
  };
  'tutor.turn': { userId: string; conversationId: string; correctionCount: number };
  'speech.transcribed': { userId: string; recordingId: string; similarity: number };
  'feedback.submitted': { feedbackId: string; kind: string };
  'entitlement.changed': { userId: string; plan: string };
}

export type EventName = keyof EventMap;

export type EventHandler<K extends EventName> = (payload: EventMap[K]) => Promise<void>;
export type AnyEventHandler = (name: string, payload: unknown) => Promise<void>;

/** Returned by on and onAny. Calling it removes the subscription. */
export type Unsubscribe = () => void;

export interface EventBus {
  emit<K extends EventName>(name: K, payload: EventMap[K]): Promise<void>;
  on<K extends EventName>(name: K, handler: EventHandler<K>): Unsubscribe;
  onAny(handler: AnyEventHandler): Unsubscribe;
}
