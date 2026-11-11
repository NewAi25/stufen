import { describe, expect, it } from 'vitest';
import { dictationType, wordEditDistance } from '../src/graders/dictation';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules, ctxWithoutRules } from './helpers';

const payload = {
  text: 'Guten Tag, ich heiße Peter.',
  accept: ['Guten Tag, ich heisse Peter.'],
};
const longPayload = { text: 'Ich wohne in Hamburg und ich komme aus Österreich, ja.' };
const ctx = ctxWithRules();

describe('dictation definition', () => {
  it('is deterministic and evidences listening and writing', () => {
    expect(dictationType.id).toBe('dictation');
    expect(dictationType.needsAi).toBe(false);
    expect(dictationType.rendererKey).toBe('dictation');
    expect(dictationType.skill).toEqual(['listening', 'writing']);
  });
});

describe('word edit distance', () => {
  it.each([
    [['a', 'b', 'c'], ['a', 'b', 'c'], 0],
    [['a', 'x', 'c'], ['a', 'b', 'c'], 1],
    [['a', 'c'], ['a', 'b', 'c'], 1],
    [['a', 'b', 'c', 'd'], ['a', 'b', 'c'], 1],
    [[], ['a', 'b', 'c'], 3],
    [['a', 'b'], [], 2],
  ])('from %j to %j is %i', (from, to, distance) => {
    expect(wordEditDistance(from, to)).toBe(distance);
  });
});

describe('dictation grading', () => {
  it('marks the exact sentence correct with score 1', async () => {
    const result = await dictationType.grade(payload, { text: payload.text }, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
    expect(result.feedback.message).toBe('Correct.');
    expect(result.feedback.expected).toBe(payload.text);
    expect(result.errorTypes).toBeUndefined();
  });

  it('ignores case, extra spaces and punctuation', async () => {
    const response = { text: '  guten tag   ich heiße peter ', replays: 2 };
    const result = await dictationType.grade(payload, response, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
  });

  it('uses the accept list when no language rules are wired', async () => {
    const response = { text: 'Guten Tag, ich heisse Peter.' };
    const result = await dictationType.grade(payload, response, ctxWithoutRules());
    expect(result).toMatchObject({ correct: true, score: 1 });
  });

  it('gives one minus the word error rate for one wrong word in five', async () => {
    const result = await dictationType.grade(payload, { text: 'Guten Tag, ich heiße Pedro.' }, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.8);
    expect(result.errorTypes).toEqual(['spelling']);
    expect(result.feedback.message).toBe(
      'Partly correct. The sentence is: Guten Tag, ich heiße Peter.',
    );
  });

  it('counts a missing word as one error', async () => {
    const result = await dictationType.grade(payload, { text: 'Guten Tag ich Peter' }, ctx);
    expect(result.score).toBe(0.8);
  });

  it('passes at exactly 0.9 and says there was a small slip', async () => {
    const response = { text: 'Ich wohne in Hamburg und ich komme aus Österreich, na.' };
    const result = await dictationType.grade(longPayload, response, ctx);
    expect(result.score).toBe(0.9);
    expect(result.correct).toBe(true);
    expect(result.errorTypes).toBeUndefined();
    expect(result.feedback.message).toBe(
      'Correct, with a small slip. The sentence is: Ich wohne in Hamburg und ich komme aus Österreich, ja.',
    );
  });

  it('never goes below 0, however much extra text is typed', async () => {
    const response = { text: 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf' };
    const result = await dictationType.grade(payload, response, ctx);
    expect(result.score).toBe(0);
    expect(result.feedback.message).toBe('Not quite. The sentence is: Guten Tag, ich heiße Peter.');
  });

  it('scores an empty answer 0', async () => {
    const result = await dictationType.grade(payload, { text: '' }, ctx);
    expect(result).toMatchObject({ correct: false, score: 0 });
  });
});

describe('dictation malformed input', () => {
  it.each([
    ['no response', undefined],
    ['a bare string', 'Guten Tag'],
    ['a missing text', { replays: 1 }],
    ['a number as text', { text: 5 }],
    ['a negative replay count', { text: 'Guten Tag', replays: -1 }],
    ['a fractional replay count', { text: 'Guten Tag', replays: 1.5 }],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(dictationType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['no payload', undefined],
    ['a missing text', { audio: 'a.mp3' }],
    ['an empty text', { text: '' }],
    ['accept as a string', { text: 'Guten Tag', accept: 'Guten Tag' }],
    ['an unknown field', { text: 'Guten Tag', speed: 'slow' }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(dictationType.grade(bad, { text: 'Guten Tag' }, ctx)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    );
  });
});
