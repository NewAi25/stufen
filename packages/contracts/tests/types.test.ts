// Runtime checks on the const arrays that mirror the enum like unions.
import { describe, expect, it } from 'vitest';
import {
  CEFR_LEVELS,
  ERROR_TYPES,
  EXERCISE_TYPES,
  FEATURE_KEYS,
  LANGUAGE_CODES,
  LIMIT_KEYS,
  SKILLS,
} from '../src/index';

describe('const arrays match docs/04', () => {
  it('has six CEFR levels in order A1 to C2', () => {
    expect(CEFR_LEVELS).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });

  it('has eight skills', () => {
    expect(SKILLS).toEqual([
      'reading',
      'listening',
      'spoken_production',
      'spoken_interaction',
      'writing',
      'mediation',
      'grammar',
      'vocabulary',
    ]);
  });

  it('has eleven exercise types', () => {
    expect(EXERCISE_TYPES).toHaveLength(11);
    expect(EXERCISE_TYPES).toEqual([
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
    ]);
  });

  it('has nine error types ending in other', () => {
    expect(ERROR_TYPES).toHaveLength(9);
    expect(ERROR_TYPES[ERROR_TYPES.length - 1]).toBe('other');
  });

  it('has three language codes, German first', () => {
    expect(LANGUAGE_CODES).toEqual(['de', 'nl', 'fr']);
  });

  it('has the five beta feature keys and three limit keys', () => {
    expect(FEATURE_KEYS).toEqual([
      'tutor',
      'writing_studio',
      'speech',
      'exam_sim',
      'levels_above_b1',
    ]);
    expect(LIMIT_KEYS).toHaveLength(3);
  });
});
