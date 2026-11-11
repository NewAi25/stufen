import 'server-only';

// The grade function the lesson engine calls. It only joins things that the
// composition root hands in: the exercise type registry, the rules of the
// language pack and the level of the exercise's lesson.

import type {
  CefrLevel,
  Exercise,
  Feedback,
  GradeResult,
  LanguageCode,
  LanguageRules,
} from '@stufen/contracts';
import type { ExerciseTypeRegistry } from '@stufen/core-exercise-types';

/** Shown for a task that has no grader yet. */
export const PROVISIONAL_MESSAGE =
  'Saved as a self check. This task will be reviewed by the tutor in a later version.';

/** Feedback of an attempt nobody graded. The flag is stored with the attempt. */
export interface ProvisionalFeedback extends Feedback {
  provisional: true;
}

/**
 * The result for translate, write_free and speak_prompt until their graders
 * exist. It counts as done so the lesson can go on, and it is labelled so the
 * attempt can be found and graded again later.
 */
export function provisionalGrade(): GradeResult & { feedback: ProvisionalFeedback } {
  return { correct: true, score: 1, feedback: { message: PROVISIONAL_MESSAGE, provisional: true } };
}

/** True for feedback written by provisionalGrade, also after a JSON round trip. */
export function isProvisionalFeedback(feedback: unknown): feedback is ProvisionalFeedback {
  return (
    typeof feedback === 'object' &&
    feedback !== null &&
    (feedback as { provisional?: unknown }).provisional === true
  );
}

export type GradeFunction = (
  exercise: Exercise,
  response: unknown,
  language: LanguageCode,
) => Promise<GradeResult>;

export interface GradeDeps {
  registry: Pick<ExerciseTypeRegistry, 'getType' | 'hasType'>;
  /** The rules of an installed language pack. Throws for a language without one. */
  rulesFor: (language: LanguageCode) => LanguageRules;
  /** The CEFR level of the lesson the exercise sits in. */
  levelOf: (exercise: Exercise) => Promise<CefrLevel>;
}

export function createGrade(deps: GradeDeps): GradeFunction {
  return async function grade(exercise, response, language) {
    if (!deps.registry.hasType(exercise.type)) return provisionalGrade();
    const definition = deps.registry.getType(exercise.type);
    const languageRules = deps.rulesFor(language);
    const level = await deps.levelOf(exercise);
    return definition.grade(exercise.payload, response, { language, level, languageRules });
  };
}
