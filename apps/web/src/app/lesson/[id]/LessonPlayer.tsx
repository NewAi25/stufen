'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, emptyValue, ExerciseRenderer, isComplete, Progress } from '@stufen/ui-kit';
import type { ExerciseValue } from '@stufen/ui-kit';
import { isSelfCheckComplete, SelfCheckExercise } from '../../../components/SelfCheckExercise';
import { useEnterKey } from '../../../components/use-enter-key';
import type {
  AnswerResultView,
  ExerciseView,
  LessonSummaryView,
  LessonView,
} from '../../../lib/lesson-view';
import { finishSession, submitAnswer } from './actions';
import { LessonSummary } from './LessonSummary';

/** The controls an exercise can start at. A locked or disabled one is skipped. */
const FIRST_CONTROL =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

const NOT_GRADED = 'Your answer could not be graded. Try again.';
const NOT_FINISHED = 'This lesson could not be finished. Try again.';

/** One exercise on screen with the answer so far. Replaced as a whole on Continue. */
interface Step {
  exercise: ExerciseView;
  position: number;
  /** The response of a renderer, or `{ text }` for a self check. */
  value: ExerciseValue | null;
  text: string;
  result: AnswerResultView | null;
  /** What comes after this exercise. Known once it is answered. */
  next: ExerciseView | null;
  answered: boolean;
}

function stepFor(exercise: ExerciseView, position: number): Step {
  return {
    exercise,
    position,
    value: exercise.selfCheck === null ? emptyValue(exercise.type, exercise.payload) : null,
    text: '',
    result: null,
    next: null,
    answered: false,
  };
}

export function LessonPlayer({ initial }: { initial: LessonView }) {
  const [step, setStep] = useState<Step | null>(() =>
    initial.status === 'in_progress' ? stepFor(initial.exercise, initial.position) : null,
  );
  const [summary, setSummary] = useState<LessonSummaryView | null>(
    initial.status === 'done' ? initial.summary : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exerciseRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shownId = useRef(step?.exercise.id ?? null);

  // A new exercise takes the focus. It goes to the first control inside the
  // exercise, because the letter and number keys of some renderers only act
  // while the focus is inside them. An exercise without a control gets it itself.
  useEffect(() => {
    const id = step?.exercise.id ?? null;
    if (id === shownId.current) return;
    shownId.current = id;
    const region = exerciseRef.current;
    const first = region?.querySelector<HTMLElement>(FIRST_CONTROL) ?? region;
    first?.focus();
  }, [step?.exercise.id]);

  // A waiting button is disabled and drops the focus. Once the result is
  // there, the focus goes back to it so the next press continues.
  const answered = step?.answered ?? false;
  useEffect(() => {
    if (pending || !answered) return;
    if (document.activeElement === document.body) buttonRef.current?.focus();
  }, [pending, answered]);

  const session = initial.status === 'in_progress' ? initial : null;
  const selfCheck = step?.exercise.selfCheck ?? null;
  const ready =
    step !== null &&
    (step.answered ||
      (selfCheck === null
        ? isComplete(step.exercise.type, step.exercise.payload, step.value)
        : isSelfCheckComplete(selfCheck, step.text)));

  async function finish(sessionId: string): Promise<void> {
    const outcome = await finishSession(sessionId);
    if (outcome.ok) setSummary(outcome.summary);
    else setError(outcome.message);
  }

  /** Check, then Continue. A self check is saved and moves on in one press. */
  async function primary(): Promise<void> {
    if (session === null || step === null || pending || !ready) return;
    setPending(true);
    setError(null);
    try {
      if (!step.answered) {
        const response = selfCheck === null ? step.value : { text: step.text.trim() };
        const outcome = await submitAnswer(session.sessionId, step.exercise.id, response);
        if (!outcome.ok) return setError(outcome.message);
        const answered = { ...step, result: outcome.result, next: outcome.next, answered: true };
        if (selfCheck === null) return setStep(answered);
        if (outcome.next !== null) return setStep(stepFor(outcome.next, step.position + 1));
        setStep(answered);
        return await finish(session.sessionId);
      }
      if (step.next !== null) return setStep(stepFor(step.next, step.position + 1));
      await finish(session.sessionId);
    } catch {
      setError(step.answered ? NOT_FINISHED : NOT_GRADED);
    } finally {
      setPending(false);
    }
  }

  // Enter is only taken while the button can be pressed. Before that it keeps
  // its own meaning, such as choosing the option that has the focus.
  useEnterKey(() => void primary(), summary === null && ready && !pending);

  if (summary !== null) return <LessonSummary summary={summary} />;
  if (session === null || step === null) return null;

  const done = step.position - (step.answered ? 0 : 1);
  const closing = step.position >= session.total ? 'Finish' : 'Continue';
  const label = !step.answered && selfCheck === null ? 'Check' : closing;

  return (
    <div className="app-lesson">
      <header className="app-lesson__bar">
        <Link
          href="/"
          className="app-lesson__exit"
          aria-label="Exit lesson. Your answers are saved."
        >
          Exit
        </Link>
        <Progress
          size="sm"
          value={done}
          max={session.total}
          label="Lesson progress"
          valueText={`Exercise ${step.position} of ${session.total}`}
        />
        <span className="app-lesson__count" aria-hidden="true">
          {step.position} of {session.total}
        </span>
      </header>
      <div className="app-lesson__exercise" ref={exerciseRef} tabIndex={-1}>
        {selfCheck === null ? (
          <ExerciseRenderer
            key={step.exercise.id}
            type={step.exercise.type}
            payload={step.exercise.payload}
            value={step.value}
            onChange={(value) => setStep((now) => (now === null ? now : { ...now, value }))}
            disabled={pending}
            result={step.result}
            lang={session.language}
            {...(step.exercise.instruction ? { instruction: step.exercise.instruction } : {})}
          />
        ) : (
          <SelfCheckExercise
            key={step.exercise.id}
            content={selfCheck}
            instruction={step.exercise.instruction}
            lang={session.language}
            value={step.text}
            onChange={(text) => setStep((now) => (now === null ? now : { ...now, text }))}
            disabled={pending || step.answered}
          />
        )}
      </div>
      {error === null ? null : (
        <p className="app-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="app-lesson__actions">
        <Button
          ref={buttonRef}
          size="lg"
          loading={pending}
          disabled={!ready}
          onClick={() => void primary()}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
