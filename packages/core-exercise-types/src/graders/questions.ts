// Shared by read_answer and listen_answer: a list of questions about a text.
// A question either carries options (graded like multiple_choice) or a short
// answer (graded by exact match after normalising, against answer and accept).
// Score is the share of questions answered right. Correct when all are.

import type { ExerciseTypeId, GradeContext, GradeResult, JSONSchema } from '@stufen/contracts';
import { InvalidPayloadError, InvalidResponseError } from '../errors';
import type { QuestionsResponse } from '../responses';
import { buildFeedback, clampScore, normalizeText } from '../text';

export interface ChoiceQuestion {
  question: string;
  options: string[];
  answer_index: number;
  explanation_en?: string;
}

export interface ShortAnswerQuestion {
  question: string;
  answer: string;
  accept?: string[];
  explanation_en?: string;
}

export type Question = ChoiceQuestion | ShortAnswerQuestion;

/** Same as the `question` definition in content/schema/exercise.schema.json. */
const choiceQuestionSchema: JSONSchema = {
  type: 'object',
  required: ['question', 'options', 'answer_index'],
  additionalProperties: false,
  properties: {
    question: { type: 'string', minLength: 1 },
    options: { type: 'array', minItems: 2, items: { type: 'string', minLength: 1 } },
    answer_index: { type: 'integer', minimum: 0 },
    explanation_en: { type: 'string' },
  },
};

/** Not in the content schema yet. See the README section on short answers. */
const shortAnswerQuestionSchema: JSONSchema = {
  type: 'object',
  required: ['question', 'answer'],
  additionalProperties: false,
  properties: {
    question: { type: 'string', minLength: 1 },
    answer: { type: 'string', minLength: 1 },
    accept: { type: 'array', items: { type: 'string' } },
    explanation_en: { type: 'string' },
  },
};

export const questionsSchema: JSONSchema = {
  type: 'array',
  minItems: 1,
  items: { oneOf: [choiceQuestionSchema, shortAnswerQuestionSchema] },
};

export function isChoiceQuestion(question: Question): question is ChoiceQuestion {
  return 'options' in question;
}

/** Checks what the schema cannot say: every answer_index points at an option. */
export function assertQuestionIndexes(exerciseType: ExerciseTypeId, questions: Question[]): void {
  const problems: string[] = [];
  questions.forEach((question, index) => {
    if (isChoiceQuestion(question) && question.answer_index >= question.options.length) {
      problems.push(`payload.questions[${index}].answer_index must point at one of the options`);
    }
  });
  if (problems.length > 0) throw new InvalidPayloadError(exerciseType, problems);
}

function expectedText(question: Question): string {
  return isChoiceQuestion(question)
    ? (question.options[question.answer_index] ?? '')
    : question.answer;
}

function questionIsRight(
  exerciseType: ExerciseTypeId,
  question: Question,
  answer: number | string,
  index: number,
  ctx: GradeContext | undefined,
): boolean {
  if (isChoiceQuestion(question)) {
    if (typeof answer !== 'number' || answer >= question.options.length) {
      throw new InvalidResponseError(exerciseType, [
        `answers[${index}] must be the index of one of the options`,
      ]);
    }
    return answer === question.answer_index;
  }
  if (typeof answer !== 'string') {
    throw new InvalidResponseError(exerciseType, [`answers[${index}] must be a text`]);
  }
  const given = normalizeText(answer, ctx);
  const accepted = [question.answer, ...(question.accept ?? [])];
  return accepted.some((candidate) => normalizeText(candidate, ctx) === given);
}

export function gradeQuestions(
  exerciseType: ExerciseTypeId,
  questions: Question[],
  response: QuestionsResponse,
  ctx: GradeContext | undefined,
): GradeResult {
  if (response.answers.length !== questions.length) {
    throw new InvalidResponseError(exerciseType, [
      `answers must have one entry per question, ${questions.length} in this exercise`,
    ]);
  }

  const wrong: number[] = [];
  questions.forEach((question, index) => {
    const answer = response.answers[index] ?? '';
    if (!questionIsRight(exerciseType, question, answer, index, ctx)) wrong.push(index);
  });

  const correct = wrong.length === 0;
  const shown = correct ? questions.map((_question, index) => index) : wrong;
  const explanation = shown
    .map((index) => questions[index]?.explanation_en ?? '')
    .filter((text) => text !== '')
    .join(' ');
  const score = clampScore((questions.length - wrong.length) / questions.length);
  if (correct) return { correct, score, feedback: buildFeedback('Correct.', { explanation }) };

  const answers = wrong.map((index) => {
    const question = questions[index];
    return { index, text: question ? expectedText(question) : '' };
  });
  const lead = wrong.length === questions.length ? 'Not quite.' : 'Partly correct.';
  const lines =
    questions.length === 1
      ? [`The answer is "${answers[0]?.text ?? ''}".`]
      : answers.map((entry) => `Question ${entry.index + 1}: "${entry.text}".`);
  return {
    correct,
    score,
    feedback: buildFeedback(`${lead} ${lines.join(' ')}`, {
      explanation,
      expected: answers.map((entry) => entry.text).join('; '),
    }),
  };
}
