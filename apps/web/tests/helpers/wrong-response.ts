// Builds a response the graders mark as not correct, from the payload of an
// exercise. Only for the eight types that have a grader.

import type { Exercise } from '@stufen/contracts';

type Json = Record<string, unknown>;

const NONSENSE = 'zzzz';

function record(value: unknown): Json {
  if (typeof value !== 'object' || value === null) throw new Error('payload is not an object');
  return value as Json;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('payload field is not a list');
  return value;
}

/** Another option than the right one, or a text nobody accepts. */
function wrongQuestionAnswer(question: unknown): unknown {
  const typed = record(question);
  if (typeof typed.answer_index !== 'number') return NONSENSE;
  return (typed.answer_index + 1) % list(typed.options).length;
}

export function wrongResponseFor(exercise: Exercise): unknown {
  const payload = record(exercise.payload);
  switch (exercise.type) {
    case 'multiple_choice':
      return { selected: (Number(payload.answer_index) + 1) % list(payload.options).length };
    case 'cloze':
      return { answers: list(payload.blanks).map(() => NONSENSE) };
    case 'match_pairs': {
      // Every left item gets the right item of its neighbour.
      const pairs = list(payload.pairs).map(record);
      return {
        pairs: pairs.map((pair, index) => ({
          left: pair.left,
          right: pairs[(index + 1) % pairs.length]?.right,
        })),
      };
    }
    case 'order_words':
      // The same words, last one first.
      return { order: String(payload.answer).trim().split(/\s+/).reverse() };
    case 'flashcard':
      return { rating: 'again' };
    case 'read_answer':
    case 'listen_answer':
      return { answers: list(payload.questions).map(wrongQuestionAnswer) };
    case 'dictation':
      return { text: NONSENSE };
    default:
      throw new Error(`${exercise.type} has no grader, so no answer to it is wrong`);
  }
}
