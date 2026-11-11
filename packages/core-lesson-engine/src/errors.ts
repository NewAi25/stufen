// The typed errors the lesson engine throws. Each one means a rule was broken
// and nothing was stored or emitted by the call that threw it.

/** startSession and the session methods: `getLesson` knows no lesson with this id. */
export class LessonNotFoundError extends Error {
  readonly lessonId: string;

  constructor(lessonId: string) {
    super(`No lesson with id ${lessonId}`);
    this.name = 'LessonNotFoundError';
    this.lessonId = lessonId;
  }
}

/**
 * The acting user has no session with this id. Thrown both when the id is
 * unknown and when the session belongs to someone else: the store only shows a
 * user the own rows, so the two cases cannot be told apart, and a caller
 * should not learn which ids exist.
 */
export class SessionAccessError extends Error {
  readonly userId: string;
  readonly sessionId: string;

  constructor(userId: string, sessionId: string) {
    super(`User ${userId} has no lesson session ${sessionId}`);
    this.name = 'SessionAccessError';
    this.userId = userId;
    this.sessionId = sessionId;
  }
}

export type OutOfOrderReason = 'not_in_session' | 'already_answered' | 'not_current';

/** submitAnswer: the exercise is not the one the session is waiting for. */
export class OutOfOrderError extends Error {
  readonly sessionId: string;
  readonly exerciseId: string;
  readonly reason: OutOfOrderReason;
  /** The exercise the session is waiting for, or null when all are answered. */
  readonly expectedExerciseId: string | null;

  constructor(
    sessionId: string,
    exerciseId: string,
    reason: OutOfOrderReason,
    expectedExerciseId: string | null,
  ) {
    const why: Record<OutOfOrderReason, string> = {
      not_in_session: 'is not part of the session',
      already_answered: 'was already answered in the session',
      not_current: 'is not the current exercise of the session',
    };
    super(`Exercise ${exerciseId} ${why[reason]} ${sessionId}`);
    this.name = 'OutOfOrderError';
    this.sessionId = sessionId;
    this.exerciseId = exerciseId;
    this.reason = reason;
    this.expectedExerciseId = expectedExerciseId;
  }
}

/** completeSession: some exercises of the session have no attempt yet. */
export class SessionIncompleteError extends Error {
  readonly sessionId: string;
  readonly remainingExerciseIds: string[];

  constructor(sessionId: string, remainingExerciseIds: string[]) {
    super(`Lesson session ${sessionId} has ${remainingExerciseIds.length} unanswered exercise(s)`);
    this.name = 'SessionIncompleteError';
    this.sessionId = sessionId;
    this.remainingExerciseIds = remainingExerciseIds;
  }
}

/** The input field an AttemptValidationError is about. */
export type AttemptField =
  | 'userId'
  | 'language'
  | 'exerciseType'
  | 'exerciseId'
  | 'itemId'
  | 'correct'
  | 'score'
  | 'candoIds'
  | 'itemIds'
  | 'response'
  | 'feedback'
  | 'durationMs';

/**
 * An attempt cannot be stored as given. Thrown by recordStandaloneAttempt for
 * bad input, and by submitAnswer for a response or duration that cannot be
 * stored or a grade result that breaks the GradeResult contract.
 */
export class AttemptValidationError extends Error {
  readonly field: AttemptField;

  constructor(field: AttemptField, message: string) {
    super(message);
    this.name = 'AttemptValidationError';
    this.field = field;
  }
}
