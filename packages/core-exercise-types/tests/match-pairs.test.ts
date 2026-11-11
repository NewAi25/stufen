import { describe, expect, it } from 'vitest';
import { matchPairsType } from '../src/graders/match-pairs';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules } from './helpers';

const payload = {
  pairs: [
    { left: 'Hallo', right: 'hello' },
    { left: 'Tschüss', right: 'bye' },
    { left: 'Danke', right: 'thank you' },
    { left: 'Bitte', right: 'please' },
  ],
};
const ctx = ctxWithRules();

describe('match_pairs definition', () => {
  it('is deterministic and evidences vocabulary', () => {
    expect(matchPairsType.id).toBe('match_pairs');
    expect(matchPairsType.needsAi).toBe(false);
    expect(matchPairsType.rendererKey).toBe('match_pairs');
    expect(matchPairsType.skill).toEqual(['vocabulary', 'grammar', 'reading']);
  });
});

describe('match_pairs grading', () => {
  it('marks all pairs right as correct, in any order', async () => {
    const response = { pairs: [...payload.pairs].reverse() };
    const result = await matchPairsType.grade(payload, response, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
    expect(result.feedback.message).toBe('Correct.');
  });

  it('gives the share of right pairs when two are swapped', async () => {
    const response = {
      pairs: [
        { left: 'Hallo', right: 'hello' },
        { left: 'Tschüss', right: 'bye' },
        { left: 'Danke', right: 'please' },
        { left: 'Bitte', right: 'thank you' },
      ],
    };
    const result = await matchPairsType.grade(payload, response, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.5);
    expect(result.feedback.message).toBe(
      'Partly correct. "Danke" goes with "thank you". "Bitte" goes with "please".',
    );
    expect(result.feedback.expected).toBe('Danke = thank you; Bitte = please');
  });

  it('counts pairs the learner left open as not matched', async () => {
    const response = { pairs: [{ left: 'Hallo', right: 'hello' }] };
    const result = await matchPairsType.grade(payload, response, ctx);
    expect(result.score).toBe(0.25);
    expect(result.correct).toBe(false);
  });

  it('scores 0 when nothing is matched', async () => {
    const result = await matchPairsType.grade(payload, { pairs: [] }, ctx);
    expect(result.score).toBe(0);
    expect(result.feedback.message.startsWith('Not quite.')).toBe(true);
  });

  it('does not let one submitted pair count twice', async () => {
    const twins = {
      pairs: [
        { left: 'a', right: 'x' },
        { left: 'a', right: 'x' },
      ],
    };
    const result = await matchPairsType.grade(twins, { pairs: [{ left: 'a', right: 'x' }] }, ctx);
    expect(result.score).toBe(0.5);
  });
});

describe('match_pairs malformed input', () => {
  it.each([
    ['no response', undefined],
    ['pairs as an object', { pairs: { Hallo: 'hello' } }],
    ['a pair without a right text', { pairs: [{ left: 'Hallo' }] }],
    [
      'more pairs than the exercise has',
      { pairs: Array(5).fill({ left: 'Hallo', right: 'hello' }) },
    ],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(matchPairsType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['no payload', undefined],
    ['one pair only', { pairs: [{ left: 'Hallo', right: 'hello' }] }],
    [
      'an empty right text',
      {
        pairs: [
          { left: 'a', right: '' },
          { left: 'b', right: 'y' },
        ],
      },
    ],
    ['pairs as a string', { pairs: 'Hallo' }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(matchPairsType.grade(bad, { pairs: [] }, ctx)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    );
  });
});
