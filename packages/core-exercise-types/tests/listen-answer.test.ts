import { describe, expect, it } from 'vitest';
import { listenAnswerType } from '../src/graders/listen-answer';
import { InvalidPayloadError, InvalidResponseError } from '../src/errors';
import { ctxWithRules } from './helpers';

const payload = {
  transcript: 'Hallo! Ich heiße Anna. Ich komme aus Österreich.',
  questions: [
    {
      question: 'Woher kommt Anna?',
      options: ['aus Deutschland', 'aus Österreich', 'aus der Schweiz'],
      answer_index: 1,
    },
    { question: 'Wie heißt sie?', options: ['Anna', 'Anne', 'Hanna'], answer_index: 0 },
    { question: 'Was sagt sie zuerst?', answer: 'Hallo', accept: ['Hallo!'] },
  ],
};
const ctx = ctxWithRules();

describe('listen_answer definition', () => {
  it('is deterministic and evidences listening', () => {
    expect(listenAnswerType.id).toBe('listen_answer');
    expect(listenAnswerType.needsAi).toBe(false);
    expect(listenAnswerType.rendererKey).toBe('listen_answer');
    expect(listenAnswerType.skill).toEqual(['listening']);
  });
});

describe('listen_answer grading', () => {
  it('marks every question right as correct, mixing options and a short answer', async () => {
    const result = await listenAnswerType.grade(payload, { answers: [1, 0, 'hallo!'] }, ctx);
    expect(result).toMatchObject({ correct: true, score: 1 });
    expect(result.feedback.message).toBe('Correct.');
  });

  it('gives the share of questions right', async () => {
    const result = await listenAnswerType.grade(payload, { answers: [1, 2, 'Hallo'] }, ctx);
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.6667);
    expect(result.feedback.message).toBe('Partly correct. Question 2: "Anna".');
  });

  it('scores 0 when every question is missed and never shows the transcript', async () => {
    const result = await listenAnswerType.grade(payload, { answers: [0, 1, 'Tschüss'] }, ctx);
    expect(result.score).toBe(0);
    expect(result.feedback.expected).toBe('aus Österreich; Anna; Hallo');
    expect(JSON.stringify(result.feedback)).not.toContain('Ich komme aus');
  });

  it('accepts a payload with an audio path', async () => {
    const withAudio = { ...payload, audio: 'audio/a1-01-01-01.mp3' };
    const result = await listenAnswerType.grade(withAudio, { answers: [1, 0, 'Hallo'] }, ctx);
    expect(result.correct).toBe(true);
  });
});

describe('listen_answer malformed input', () => {
  it.each([
    ['no response', undefined],
    ['answers missing', {}],
    ['too many answers', { answers: [1, 0, 'Hallo', 2] }],
    ['a negative index', { answers: [-1, 0, 'Hallo'] }],
    ['an index where a text is needed', { answers: [1, 0, 0] }],
  ])('rejects %s as an invalid response', async (_label, response) => {
    await expect(listenAnswerType.grade(payload, response, ctx)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['no payload', undefined],
    ['a missing transcript', { questions: payload.questions }],
    ['an empty transcript', { transcript: '', questions: payload.questions }],
    ['a text field from read_answer', { transcript: 'T', text: 'T', questions: payload.questions }],
    ['questions as an object', { transcript: 'T', questions: {} }],
  ])('rejects %s as an invalid payload', async (_label, bad) => {
    await expect(
      listenAnswerType.grade(bad, { answers: [1, 0, 'Hallo'] }, ctx),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });
});
