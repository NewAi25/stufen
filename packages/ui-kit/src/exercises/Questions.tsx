'use client';

// The question list shared by read_answer and listen_answer. Internal to the kit.

import type { KeyboardEvent } from 'react';
import { Choice } from '../components/Choice';
import { TextInput } from '../components/TextInput';
import { OutcomeMark } from './Shell';
import type {
  ExerciseCommonLabels,
  ExerciseResult,
  QuestionPayload,
  QuestionsValue,
} from './types';

export interface QuestionLabels {
  /** Small line above each question. Default gives "Question 1 of 2". */
  question: (position: number, total: number) => string;
}

export const DEFAULT_QUESTION_LABELS: QuestionLabels = {
  question: (position, total) => `Question ${position} of ${total}`,
};

interface QuestionsProps {
  questions: readonly QuestionPayload[];
  value: QuestionsValue | null;
  onChange: (value: QuestionsValue) => void;
  disabled: boolean;
  result: ExerciseResult | null;
  labels: ExerciseCommonLabels & QuestionLabels;
  lang: string | undefined;
  promptLang: string | undefined;
}

/** No option has this value, so a revealed selection without an answer key reads as wrong. */
const NO_OPTION = '';

export function Questions({
  questions,
  value,
  onChange,
  disabled,
  result,
  labels,
  lang,
  promptLang,
}: QuestionsProps) {
  const answers = questions.map((_, index) => value?.answers[index] ?? '');
  const graded = result !== null;
  const locked = disabled || graded;

  function setAnswer(index: number, answer: number | string): void {
    if (locked) return;
    onChange({ answers: answers.map((current, at) => (at === index ? answer : current)) });
  }

  // 1 to 9 pick an option of the question that has focus.
  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number): void {
    if (locked || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!/^[1-9]$/.test(event.key)) return;
    if (event.target instanceof HTMLInputElement) return;
    const option = Number(event.key) - 1;
    if (option >= (questions[index]?.options?.length ?? 0)) return;
    event.preventDefault();
    setAnswer(index, option);
  }

  return (
    <ol className="st-questions">
      {questions.map((question, index) => {
        const answer = answers[index] ?? '';
        const options = question.options;
        const key = question.answer_index;
        const selected = typeof answer === 'number' ? String(answer) : null;
        // With an answer key each question is judged on its own. Without one,
        // only a fully correct result says anything about a single question.
        let correctValue: string | undefined;
        if (graded && key !== undefined) correctValue = String(key);
        else if (graded && result.correct && selected !== null) correctValue = selected;
        else if (graded && questions.length === 1) correctValue = NO_OPTION;
        const explanation = question.explanation_en ?? '';
        return (
          <li key={index} className="st-questions__item" onKeyDown={(e) => onKeyDown(e, index)}>
            <p className="st-questions__number">{labels.question(index + 1, questions.length)}</p>
            {options !== undefined && options.length > 0 ? (
              <>
                <p className="st-exercise__prompt" lang={promptLang}>
                  {question.question}
                </p>
                <Choice
                  label={question.question}
                  options={options.map((option, at) => ({
                    value: String(at),
                    label: option,
                    ...(lang === undefined ? {} : { lang }),
                  }))}
                  value={selected}
                  onChange={(next) => setAnswer(index, Number(next))}
                  disabled={disabled}
                  revealed={graded}
                  {...(correctValue === undefined ? {} : { correctValue })}
                  stateLabels={{ correct: labels.correct, incorrect: labels.incorrect }}
                />
              </>
            ) : (
              <TextInput
                label={question.question}
                lang={lang}
                value={typeof answer === 'string' ? answer : ''}
                disabled={disabled}
                readOnly={graded}
                autoComplete="off"
                onChange={(event) => setAnswer(index, event.target.value)}
              />
            )}
            {graded && result.correct && (options === undefined || options.length === 0) ? (
              <OutcomeMark outcome="correct" labels={labels} />
            ) : null}
            {graded && explanation !== '' ? (
              <p className="st-questions__explanation">{explanation}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
