import { describe, expect, it, vi } from 'vitest';
import { clozeType } from '../src/graders/cloze';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules, ctxWithoutRules } from './helpers';

const payload = {
  text: 'Ich ___ Tom und ich ___ aus England.',
  blanks: [
    { answer: 'heiße', accept: ['heisse'], hint: 'heißen' },
    { answer: 'komme', hint: 'kommen' },
  ],
  explanation_en: 'With ich the verb ends in e.',
};
const ctx = ctxWithRules();

describe('cloze definition', () => {
  it('is deterministic and evidences grammar and vocabulary', () => {
    expect(clozeType.id).toBe('cloze');
    expect(clozeType.needsAi).toBe(false);
    expect(clozeType.rendererKey).toBe('cloze');
    expect(clozeType.skill).toEqual(['grammar', 'vocabulary']);
  });
});

describe('cloze grading', () => {
  it('marks all blanks right as correct with score 1', async () => {
    const result = await clozeType.grade(payload, { answers: ['heiße', 'komme'] }, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
    expect(result.feedback.message).toBe('Correct.');
    expect(result.errorTypes).toBeUndefined();
  });

  it('accepts an entry from the accept list', async () => {
    const result = await clozeType.grade(payload, { answers: ['heisse', 'komme'] }, ctx);
    expect(result.correct).toBe(true);
  });

  it('compares through the language rules normalize', async () => {
    const result = await clozeType.grade(payload, { answers: ['  HEISSE ', 'Komme'] }, ctx);
    expect(result.correct).toBe(true);
  });

  it('falls back to trim and case fold when no rules are wired', async () => {
    const bare = ctxWithoutRules();
    const right = await clozeType.grade(payload, { answers: [' Heiße', 'KOMME '] }, bare);
    expect(right.correct).toBe(true);
    const wrong = await clozeType.grade(payload, { answers: ['heiße', 'kome'] }, bare);
    expect(wrong.correct).toBe(false);
    expect(wrong.errorTypes).toBeUndefined();
  });

  it('gives partial credit and names the expected answer for the wrong blank', async () => {
    const result = await clozeType.grade(payload, { answers: ['heiße', 'kommst'] }, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.5);
    expect(result.feedback.message).toBe('Partly correct. Blank 2 is "komme".');
    expect(result.feedback.expected).toBe('Ich heiße Tom und ich komme aus England.');
    expect(result.feedback.explanation).toBe(payload.explanation_en);
    expect(result.errorTypes).toEqual(['spelling']);
  });

  it('scores 0 when every blank is wrong and lists each expected answer', async () => {
    const result = await clozeType.grade(payload, { answers: ['du', 'ja'] }, ctx);
    expect(result.score).toBe(0);
    expect(result.feedback.message).toBe('Not quite. Blank 1 is "heiße". Blank 2 is "komme".');
    expect(result.errorTypes).toEqual(['vocabulary']);
  });

  it('calls classifyError with expected then actual, once per wrong typed blank', async () => {
    const classifyError = vi.fn(() => ['case' as const]);
    const spyCtx = ctxWithRules({ classifyError });
    const result = await clozeType.grade(payload, { answers: ['', 'kommt'] }, spyCtx);
    expect(classifyError).toHaveBeenCalledTimes(1);
    expect(classifyError).toHaveBeenCalledWith('komme', 'kommt');
    expect(result.errorTypes).toEqual(['case']);
  });

  it('words the feedback for a single blank exercise', async () => {
    const single = { text: 'Ich ___ Anna.', blanks: [{ answer: 'bin' }] };
    const result = await clozeType.grade(single, { answers: ['bist'] }, ctx);
    expect(result.feedback.message).toBe('Not quite. The answer is "bin".');
  });
});

describe('cloze malformed input', () => {
  it.each([
    ['no response', undefined],
    ['answers as one string', { answers: 'heiße' }],
    ['a number among the answers', { answers: ['heiße', 3] }],
    ['too few answers', { answers: ['heiße'] }],
    ['too many answers', { answers: ['heiße', 'komme', 'aus'] }],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(clozeType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['no payload', undefined],
    ['no blanks', { text: 'Ich ___ Anna.', blanks: [] }],
    ['a blank without an answer', { text: 'Ich ___ Anna.', blanks: [{ hint: 'sein' }] }],
    ['more gaps than blanks', { text: 'Ich ___ Anna. Du ___ Tom.', blanks: [{ answer: 'bin' }] }],
    ['an unknown field', { text: 'Ich ___ Anna.', blanks: [{ answer: 'bin' }], extra: true }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(clozeType.grade(bad, { answers: ['bin'] }, ctx)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    );
  });
});
