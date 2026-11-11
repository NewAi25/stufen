import { describe, expect, it } from 'vitest';
import { emptyValue, isComplete, RENDERABLE_TYPES } from '../src/index';

const MC = { question: 'Q?', options: ['a', 'b', 'c'], answer_index: 1 };
const CLOZE = {
  text: 'Ich ___ Anna. Du ___ Tom.',
  blanks: [{ answer: 'bin' }, { answer: 'bist' }],
};
const PAIRS = {
  pairs: [
    { left: 'Hallo', right: 'hello' },
    { left: 'Danke', right: 'thank you' },
  ],
};
const ORDER = { words: ['heiße', 'Maria.', 'Ich'], answer: 'Ich heiße Maria.' };
const CARD = { front: 'die Stadt', back: 'the city' };
const QUESTIONS = [{ question: 'Wo?', options: ['hier', 'dort'] }, { question: 'Wer?' }];
const READ = { text: 'Ein Text.', questions: QUESTIONS };
const LISTEN = { transcript: 'Ein Text.', questions: QUESTIONS };
const DICTATION = { text: 'Guten Tag.' };

describe('RENDERABLE_TYPES', () => {
  it('lists the eight deterministic types', () => {
    expect([...RENDERABLE_TYPES]).toEqual([
      'multiple_choice',
      'cloze',
      'match_pairs',
      'order_words',
      'flashcard',
      'read_answer',
      'listen_answer',
      'dictation',
    ]);
  });
});

describe('emptyValue', () => {
  it('gives the starting value per type', () => {
    expect(emptyValue('multiple_choice', MC)).toBeNull();
    expect(emptyValue('cloze', CLOZE)).toEqual({ answers: ['', ''] });
    expect(emptyValue('match_pairs', PAIRS)).toEqual({ pairs: [] });
    expect(emptyValue('order_words', ORDER)).toEqual({ order: [] });
    expect(emptyValue('flashcard', CARD)).toBeNull();
    expect(emptyValue('read_answer', READ)).toEqual({ answers: ['', ''] });
    expect(emptyValue('listen_answer', LISTEN)).toEqual({ answers: ['', ''] });
    expect(emptyValue('dictation', DICTATION)).toEqual({ text: '' });
  });

  it('gives null for an unknown type and for a payload that does not fit', () => {
    expect(emptyValue('write_free', { prompt_en: 'Write.' })).toBeNull();
    expect(emptyValue('cloze', { text: 5 })).toBeNull();
    expect(emptyValue('read_answer', null)).toBeNull();
  });

  it('is never complete', () => {
    const cases: Array<[string, unknown]> = [
      ['multiple_choice', MC],
      ['cloze', CLOZE],
      ['match_pairs', PAIRS],
      ['order_words', ORDER],
      ['flashcard', CARD],
      ['read_answer', READ],
      ['listen_answer', LISTEN],
      ['dictation', DICTATION],
    ];
    for (const [type, payload] of cases) {
      expect(isComplete(type, payload, emptyValue(type, payload))).toBe(false);
    }
  });
});

describe('isComplete', () => {
  it('multiple_choice needs an index inside the options', () => {
    expect(isComplete('multiple_choice', MC, { selected: 0 })).toBe(true);
    expect(isComplete('multiple_choice', MC, { selected: 3 })).toBe(false);
    expect(isComplete('multiple_choice', MC, { selected: -1 })).toBe(false);
    expect(isComplete('multiple_choice', MC, { selected: '1' })).toBe(false);
  });

  it('cloze needs every blank filled', () => {
    expect(isComplete('cloze', CLOZE, { answers: ['bin', 'bist'] })).toBe(true);
    expect(isComplete('cloze', CLOZE, { answers: ['bin', '  '] })).toBe(false);
    expect(isComplete('cloze', CLOZE, { answers: ['bin'] })).toBe(false);
  });

  it('match_pairs needs every pair joined', () => {
    const one = [{ left: 'Hallo', right: 'hello' }];
    expect(isComplete('match_pairs', PAIRS, { pairs: one })).toBe(false);
    expect(
      isComplete('match_pairs', PAIRS, { pairs: [...one, { left: 'Danke', right: 'thank you' }] }),
    ).toBe(true);
  });

  it('order_words needs every token placed', () => {
    expect(isComplete('order_words', ORDER, { order: ['Ich', 'heiße'] })).toBe(false);
    expect(isComplete('order_words', ORDER, { order: ['Ich', 'heiße', 'Maria.'] })).toBe(true);
  });

  it('flashcard needs a rating', () => {
    expect(isComplete('flashcard', CARD, { rating: 'good' })).toBe(true);
    expect(isComplete('flashcard', CARD, { rating: 'great' })).toBe(false);
  });

  it('read_answer and listen_answer need one answer per question', () => {
    expect(isComplete('read_answer', READ, { answers: [1, 'Anna'] })).toBe(true);
    expect(isComplete('read_answer', READ, { answers: [0, ''] })).toBe(false);
    expect(isComplete('listen_answer', LISTEN, { answers: [0] })).toBe(false);
    expect(isComplete('listen_answer', LISTEN, { answers: [0, 0] })).toBe(true);
  });

  it('dictation needs some text', () => {
    expect(isComplete('dictation', DICTATION, { text: 'Guten' })).toBe(true);
    expect(isComplete('dictation', DICTATION, { text: ' ' })).toBe(false);
  });

  it('is false for an unknown type, a bad payload and a value that is not an object', () => {
    expect(isComplete('translate', {}, { text: 'x' })).toBe(false);
    expect(isComplete('dictation', {}, { text: 'x' })).toBe(false);
    expect(isComplete('dictation', DICTATION, null)).toBe(false);
    expect(isComplete('dictation', DICTATION, 'x')).toBe(false);
  });
});
