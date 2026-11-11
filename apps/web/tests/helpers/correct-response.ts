// Builds a response the graders accept as fully correct, from the payload of
// an exercise. For the three types without a grader any JSON value will do.

import type { Exercise } from '@stufen/contracts';

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  if (typeof value !== 'object' || value === null) throw new Error('payload is not an object');
  return value as Json;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('payload field is not a list');
  return value;
}

function questionAnswers(payload: Json): unknown[] {
  return list(payload.questions).map((question) => {
    const typed = record(question);
    return typed.answer_index ?? typed.answer;
  });
}

export function correctResponseFor(exercise: Exercise): unknown {
  const payload = record(exercise.payload);
  switch (exercise.type) {
    case 'multiple_choice':
      return { selected: payload.answer_index };
    case 'cloze':
      return { answers: list(payload.blanks).map((blank) => record(blank).answer) };
    case 'match_pairs':
      return {
        pairs: list(payload.pairs).map((pair) => {
          const typed = record(pair);
          return { left: typed.left, right: typed.right };
        }),
      };
    case 'order_words':
      return { order: String(payload.answer).trim().split(/\s+/) };
    case 'flashcard':
      return { rating: 'good' };
    case 'read_answer':
    case 'listen_answer':
      return { answers: questionAnswers(payload) };
    case 'dictation':
      return { text: payload.text };
    case 'translate':
      return { text: list(payload.reference)[0] ?? '' };
    case 'write_free':
    case 'speak_prompt':
      return { text: payload.sample_answer ?? '' };
  }
}
