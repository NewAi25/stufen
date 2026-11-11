import { describe, expect, it } from 'vitest';
import { readAnswerType } from '../src/graders/read-answer';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules, ctxWithoutRules } from './helpers';

const payload = {
  text: 'Ich heiße Lena Fischer. Ich komme aus Deutschland. Herr Braun kommt aus Österreich.',
  title: 'Lena',
  questions: [
    {
      question: 'Woher kommt Lena?',
      options: ['aus Österreich', 'aus Deutschland', 'aus England'],
      answer_index: 1,
      explanation_en: 'The text says: Ich komme aus Deutschland.',
    },
    {
      question: 'Herr Braun kommt aus ...',
      options: ['Deutschland', 'Österreich'],
      answer_index: 1,
    },
  ],
};
const shortPayload = {
  text: 'Ich heiße Max und ich wohne in der Bergstraße.',
  questions: [
    { question: 'Wie heißt er?', answer: 'Max' },
    { question: 'Wo wohnt er?', answer: 'in der Bergstraße', accept: ['Bergstraße'] },
  ],
};
const ctx = ctxWithRules();

describe('read_answer definition', () => {
  it('is deterministic and evidences reading', () => {
    expect(readAnswerType.id).toBe('read_answer');
    expect(readAnswerType.needsAi).toBe(false);
    expect(readAnswerType.rendererKey).toBe('read_answer');
    expect(readAnswerType.skill).toEqual(['reading']);
  });
});

describe('read_answer grading with options', () => {
  it('marks every question right as correct with score 1', async () => {
    const result = await readAnswerType.grade(payload, { answers: [1, 1] }, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
    expect(result.feedback.message).toBe('Correct.');
    expect(result.feedback.explanation).toBe('The text says: Ich komme aus Deutschland.');
  });

  it('gives the share of questions right and names the missed answer', async () => {
    const result = await readAnswerType.grade(payload, { answers: [1, 0] }, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.5);
    expect(result.feedback.message).toBe('Partly correct. Question 2: "Österreich".');
    expect(result.feedback.expected).toBe('Österreich');
    expect('explanation' in result.feedback).toBe(false);
  });

  it('scores 0 when every question is missed', async () => {
    const result = await readAnswerType.grade(payload, { answers: [0, 0] }, ctx);
    expect(result.score).toBe(0);
    expect(result.feedback.message).toBe(
      'Not quite. Question 1: "aus Deutschland". Question 2: "Österreich".',
    );
    expect(result.feedback.explanation).toBe('The text says: Ich komme aus Deutschland.');
  });
});

describe('read_answer grading with short answers', () => {
  it('accepts a normalised match and an accept entry', async () => {
    const response = { answers: [' max ', 'BERGSTRASSE'] };
    const result = await readAnswerType.grade(shortPayload, response, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
  });

  it('trims and case folds when no rules are wired', async () => {
    const response = { answers: ['MAX', ' in der bergstraße '] };
    const result = await readAnswerType.grade(shortPayload, response, ctxWithoutRules());
    expect(result.correct).toBe(true);
  });

  it('does not accept a near miss', async () => {
    const result = await readAnswerType.grade(shortPayload, { answers: ['Maxi', ''] }, ctx);
    expect(result.score).toBe(0);
    expect(result.feedback.expected).toBe('Max; in der Bergstraße');
  });

  it('words the feedback for a single question', async () => {
    const single = { text: 'Ich heiße Max.', questions: [{ question: 'Name?', answer: 'Max' }] };
    const result = await readAnswerType.grade(single, { answers: ['Tom'] }, ctx);
    expect(result.feedback.message).toBe('Not quite. The answer is "Max".');
  });
});

describe('read_answer malformed input', () => {
  it.each([
    ['no response', undefined],
    ['answers as a number', { answers: 1 }],
    ['too few answers', { answers: [1] }],
    ['an index past the options', { answers: [3, 1] }],
    ['a text where an option index is needed', { answers: ['aus Deutschland', 1] }],
    ['a boolean answer', { answers: [true, 1] }],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(readAnswerType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it('rejects an option index where a text is needed', async () => {
    await expect(
      readAnswerType.grade(shortPayload, { answers: [0, 'Bergstraße'] }, ctx),
    ).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['no payload', undefined],
    ['no questions', { text: 'T', questions: [] }],
    ['a missing text', { questions: payload.questions }],
    [
      'an answer index past the options',
      { text: 'T', questions: [{ question: 'Q', options: ['a', 'b'], answer_index: 5 }] },
    ],
    [
      'a question with options and a short answer',
      {
        text: 'T',
        questions: [{ question: 'Q', options: ['a', 'b'], answer_index: 0, answer: 'a' }],
      },
    ],
    ['a question with neither', { text: 'T', questions: [{ question: 'Q' }] }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(readAnswerType.grade(bad, { answers: [0] }, ctx)).rejects.toBeInstanceOf(
      InvalidPayloadError,
    );
  });
});
