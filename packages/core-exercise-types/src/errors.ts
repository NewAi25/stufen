// Typed errors thrown by the registry and the graders.
// Callers can test with instanceof or read the `code` field.

import type { ExerciseTypeId } from '@stufen/contracts';

/** getType was asked for an id that nobody registered. */
export class UnknownExerciseTypeError extends Error {
  readonly code = 'unknown_exercise_type';
  readonly exerciseType: string;

  constructor(exerciseType: string) {
    super(`Exercise type "${exerciseType}" is not registered.`);
    this.name = 'UnknownExerciseTypeError';
    this.exerciseType = exerciseType;
  }
}

/** The exercise payload from the content pack does not have the expected shape. */
export class InvalidPayloadError extends Error {
  readonly code = 'invalid_payload';
  readonly exerciseType: ExerciseTypeId;
  /** One line per problem, each starting with the path inside the payload. */
  readonly problems: string[];

  constructor(exerciseType: ExerciseTypeId, problems: string[]) {
    super(`Invalid ${exerciseType} payload: ${problems.join('; ')}`);
    this.name = 'InvalidPayloadError';
    this.exerciseType = exerciseType;
    this.problems = problems;
  }
}

/** What the learner submitted does not have the expected shape for the type. */
export class InvalidResponseError extends Error {
  readonly code = 'invalid_response';
  readonly exerciseType: ExerciseTypeId;
  readonly problems: string[];

  constructor(exerciseType: ExerciseTypeId, problems: string[]) {
    super(`Invalid ${exerciseType} response: ${problems.join('; ')}`);
    this.name = 'InvalidResponseError';
    this.exerciseType = exerciseType;
    this.problems = problems;
  }
}
