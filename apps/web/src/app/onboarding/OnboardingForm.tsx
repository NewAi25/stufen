'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { CEFR_LEVELS, LANGUAGE_CODES } from '@stufen/contracts';
import { Button, Card, Choice } from '@stufen/ui-kit';
import type { ChoiceOption } from '@stufen/ui-kit';
import { isActiveLanguage, LANGUAGE_NAMES, LEVEL_MEANINGS } from '../../lib/learning-options';
import { submitOnboarding } from './actions';

const LANGUAGE_OPTIONS: readonly ChoiceOption[] = LANGUAGE_CODES.map((code) =>
  isActiveLanguage(code)
    ? { value: code, label: LANGUAGE_NAMES[code] }
    : { value: code, label: LANGUAGE_NAMES[code], description: 'Coming soon', disabled: true },
);

const LEVEL_OPTIONS: readonly ChoiceOption[] = CEFR_LEVELS.map((level) => ({
  value: level,
  label: level,
  description: LEVEL_MEANINGS[level],
}));

export interface OnboardingFormProps {
  initialLanguage: string;
  initialLevel: string;
}

/** Two questions on one card: which language, and which level to reach. */
export function OnboardingForm({ initialLanguage, initialLevel }: OnboardingFormProps) {
  const [language, setLanguage] = useState(initialLanguage);
  const [targetLevel, setTargetLevel] = useState(initialLevel);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError('');
    startTransition(async () => {
      // On success the action redirects to home and never returns a value.
      const result = await submitOnboarding({ language, targetLevel });
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <Card title="Set up your learning" headingLevel={1}>
      <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
        <section className="flex flex-col gap-3" aria-labelledby="onboarding-step-1">
          <h2 id="onboarding-step-1" className="app-step-title">
            Step 1 of 2. Which language?
          </h2>
          <Choice
            label="Which language?"
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={setLanguage}
          />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="onboarding-step-2">
          <h2 id="onboarding-step-2" className="app-step-title">
            Step 2 of 2. What level do you want to reach?
          </h2>
          <Choice
            label="What level do you want to reach?"
            options={LEVEL_OPTIONS}
            value={targetLevel}
            onChange={setTargetLevel}
          />
        </section>

        {error !== '' ? (
          <p className="app-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" loading={pending}>
            Start from zero
          </Button>
          <Button variant="secondary" size="lg" disabled aria-describedby="placement-soon">
            Take the placement test
          </Button>
          <span id="placement-soon" className="app-muted">
            The placement test is coming soon.
          </span>
        </div>
      </form>
    </Card>
  );
}
