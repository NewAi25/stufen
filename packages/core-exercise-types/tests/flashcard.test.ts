import { describe, expect, it } from 'vitest';
import { flashcardType } from '../src/graders/flashcard';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules } from './helpers';

const payload = { front: 'die Stadt', back: 'the city, the town', hint: 'Plural: die Städte' };
const ctx = ctxWithRules();

describe('flashcard definition', () => {
  it('is deterministic and evidences vocabulary', () => {
    expect(flashcardType.id).toBe('flashcard');
    expect(flashcardType.needsAi).toBe(false);
    expect(flashcardType.rendererKey).toBe('flashcard');
    expect(flashcardType.skill).toEqual(['vocabulary']);
  });
});

describe('flashcard grading', () => {
  it.each([
    ['again', false, 0],
    ['hard', true, 0.6],
    ['good', true, 0.8],
    ['easy', true, 1],
  ])('rating %s gives correct %s and score %s', async (rating, correct, score) => {
    const result = await flashcardType.grade(payload, { rating }, ctx);
    expect(result.correct).toBe(correct);
    expect(result.score).toBe(score);
    expect(result.feedback.expected).toBe('the city, the town');
    expect(result.errorTypes).toBeUndefined();
  });

  it('shows the back of the card after again, without blame', async () => {
    const result = await flashcardType.grade(payload, { rating: 'again' }, ctx);
    expect(result.feedback.message).toBe('The answer is "the city, the town".');
  });

  it('confirms the rating otherwise', async () => {
    const result = await flashcardType.grade(payload, { rating: 'good' }, ctx);
    expect(result.feedback.message).toBe('Rated good. "the city, the town".');
  });
});

describe('flashcard malformed input', () => {
  it.each([
    ['no response', undefined],
    ['a number rating', { rating: 3 }],
    ['an unknown rating', { rating: 'perfect' }],
    ['a missing rating', {}],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(flashcardType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['no payload', undefined],
    ['a missing back', { front: 'die Stadt' }],
    ['an empty front', { front: '', back: 'the city' }],
    ['an unknown field', { front: 'die Stadt', back: 'the city', colour: 'red' }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(flashcardType.grade(bad, { rating: 'good' }, ctx)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    );
  });
});
