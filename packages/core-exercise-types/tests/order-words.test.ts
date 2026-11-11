import { describe, expect, it } from 'vitest';
import { orderWordsType } from '../src/graders/order-words';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules } from './helpers';

const payload = {
  words: ['heute', 'Ich', 'Berlin.', 'in', 'bin'],
  answer: 'Ich bin heute in Berlin.',
  accept: ['heute bin Ich in Berlin.'],
};
const ctx = ctxWithRules();

describe('order_words definition', () => {
  it('is deterministic and evidences grammar', () => {
    expect(orderWordsType.id).toBe('order_words');
    expect(orderWordsType.needsAi).toBe(false);
    expect(orderWordsType.rendererKey).toBe('order_words');
    expect(orderWordsType.skill).toEqual(['grammar']);
  });
});

describe('order_words grading', () => {
  it('marks the answer order correct with score 1', async () => {
    const response = { order: ['Ich', 'bin', 'heute', 'in', 'Berlin.'] };
    const result = await orderWordsType.grade(payload, response, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
    expect(result.errorTypes).toBeUndefined();
  });

  it('marks an order from the accept list correct', async () => {
    const response = { order: ['heute', 'bin', 'Ich', 'in', 'Berlin.'] };
    const result = await orderWordsType.grade(payload, response, ctx);
    expect(result.correct).toBe(true);
  });

  it('ignores stray spaces around tokens', async () => {
    const response = { order: [' Ich ', 'bin', 'heute  ', 'in', 'Berlin.'] };
    const result = await orderWordsType.grade(payload, response, ctx);
    expect(result.correct).toBe(true);
  });

  it('gives the share of words in the right place when two are swapped', async () => {
    const response = { order: ['Ich', 'heute', 'bin', 'in', 'Berlin.'] };
    const result = await orderWordsType.grade(payload, response, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.6);
    expect(result.errorTypes).toEqual(['word_order']);
    expect(result.feedback.message).toBe(
      'Partly correct. The sentence is: Ich bin heute in Berlin.',
    );
    expect(result.feedback.expected).toBe('Ich bin heute in Berlin.');
  });

  it('scores 0 when no word is in the right place', async () => {
    const response = { order: ['Berlin.', 'Ich', 'bin', 'heute', 'in'] };
    const result = await orderWordsType.grade(payload, response, ctx);
    expect(result.score).toBe(0);
    expect(result.feedback.message.startsWith('Not quite.')).toBe(true);
  });

  it('treats an unfinished sentence as not yet correct', async () => {
    const response = { order: ['Ich', 'bin'] };
    const result = await orderWordsType.grade(payload, response, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.4);
  });

  it('is case sensitive, because tokens come from the word bank', async () => {
    const response = { order: ['ich', 'bin', 'heute', 'in', 'Berlin.'] };
    const result = await orderWordsType.grade(payload, response, ctx);
    expect(result.correct).toBe(false);
  });
});

describe('order_words malformed input', () => {
  it.each([
    ['no response', undefined],
    ['a sentence instead of a list', { order: 'Ich bin heute in Berlin.' }],
    ['a number among the tokens', { order: ['Ich', 2] }],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(orderWordsType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['no payload', undefined],
    ['one word only', { words: ['Hallo'], answer: 'Hallo' }],
    ['a missing answer', { words: ['Ich', 'bin'] }],
    ['an answer with other tokens', { words: ['Ich', 'bin'], answer: 'Ich bist' }],
    ['an accept entry with other tokens', { words: ['a', 'b'], answer: 'a b', accept: ['b c'] }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(orderWordsType.grade(bad, { order: [] }, ctx)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    );
  });
});
