import { describe, expect, it } from 'vitest';
import { multipleChoiceType } from '../src/graders/multiple-choice';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules } from './helpers';

const payload = {
  question: 'It is 7 pm. What do you say?',
  options: ['Guten Morgen', 'Guten Tag', 'Guten Abend'],
  answer_index: 2,
  explanation_en: 'Guten Abend is the evening greeting.',
};
const ctx = ctxWithRules();

describe('multiple_choice definition', () => {
  it('is deterministic and renders under its own id', () => {
    expect(multipleChoiceType.id).toBe('multiple_choice');
    expect(multipleChoiceType.needsAi).toBe(false);
    expect(multipleChoiceType.rendererKey).toBe('multiple_choice');
    expect(multipleChoiceType.skill).toContain('vocabulary');
  });
});

describe('multiple_choice grading', () => {
  it('marks the right option correct with score 1', async () => {
    const result = await multipleChoiceType.grade(payload, { selected: 2 }, ctx);
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
    expect(result.feedback.message).toBe('Correct.');
    expect(result.feedback.explanation).toBe(payload.explanation_en);
  });

  it('accepts the right option as a one entry list', async () => {
    const result = await multipleChoiceType.grade(payload, { selected: [2] }, ctx);
    expect(result.correct).toBe(true);
  });

  it('marks a wrong option with score 0 and names the answer', async () => {
    const result = await multipleChoiceType.grade(payload, { selected: 0 }, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.feedback.expected).toBe('Guten Abend');
    expect(result.feedback.message).toBe('Not quite. The answer is "Guten Abend".');
  });

  it('gives no partial credit when the right option is chosen with a wrong one', async () => {
    const result = await multipleChoiceType.grade(payload, { selected: [1, 2] }, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });

  it('leaves optional feedback fields out when the payload has no explanation', async () => {
    const bare = { question: 'Q', options: ['a', 'b'], answer_index: 0 };
    const result = await multipleChoiceType.grade(bare, { selected: 0 }, ctx);
    expect('explanation' in result.feedback).toBe(false);
    expect('errorTypes' in result).toBe(false);
  });
});

describe('multiple_choice malformed input', () => {
  it.each([
    ['no response', undefined],
    ['a bare number', 2],
    ['a text index', { selected: '2' }],
    ['a negative index', { selected: -1 }],
    ['an empty list', { selected: [] }],
    ['an index past the options', { selected: 3 }],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(multipleChoiceType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['no payload', null],
    ['one option only', { question: 'Q', options: ['a'], answer_index: 0 }],
    ['a missing answer index', { question: 'Q', options: ['a', 'b'] }],
    ['an answer index past the options', { question: 'Q', options: ['a', 'b'], answer_index: 2 }],
    ['an unknown field', { question: 'Q', options: ['a', 'b'], answer_index: 0, extra: 1 }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(multipleChoiceType.grade(bad, { selected: 0 }, ctx)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    );
  });
});
