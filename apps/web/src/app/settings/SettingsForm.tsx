'use client';

import { useEffect, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { Button, Card, TextInput, useToast } from '@stufen/ui-kit';
import { ThemeToggle } from '../../components/ThemeProvider';
import { DAILY_GOAL_MAX, DAILY_GOAL_MIN } from '../../lib/learning-options';
import { submitSettings } from './actions';

export interface SettingsFormProps {
  email: string;
  displayName: string;
  timezone: string;
  dailyGoalMinutes: number;
}

type FieldErrors = Partial<Record<'displayName' | 'timezone' | 'dailyGoalMinutes', string>>;

function isFormField(field: string | undefined): field is keyof FieldErrors {
  return field === 'displayName' || field === 'timezone' || field === 'dailyGoalMinutes';
}

/** Profile and interface settings, saved together with one button. */
export function SettingsForm(props: SettingsFormProps) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(props.displayName);
  const [timezone, setTimezone] = useState(props.timezone);
  const [goal, setGoal] = useState(String(props.dailyGoalMinutes));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [browserZone, setBrowserZone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Read after mount, so the server and the first client render match.
  useEffect(() => {
    setBrowserZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await submitSettings({
        displayName,
        uiLocale: 'en',
        timezone,
        // An empty or non numeric goal becomes NaN, which the server rejects.
        dailyGoalMinutes: goal.trim() === '' ? Number.NaN : Number(goal),
      });
      if (result.ok) {
        toast.show({ message: 'Settings saved.', tone: 'success' });
        return;
      }
      if (isFormField(result.field)) setErrors({ [result.field]: result.message });
      else toast.show({ message: result.message, tone: 'error' });
    });
  }

  const zoneHint =
    browserZone === null
      ? 'For example Europe/Berlin.'
      : `Your browser reports ${browserZone}. For example Europe/Berlin.`;

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
      <Card title="Profile" headingLevel={2}>
        <div className="flex flex-col gap-4">
          <TextInput
            label="Display name"
            name="displayName"
            autoComplete="nickname"
            hint={`Signed in as ${props.email}.`}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            {...(errors.displayName ? { error: errors.displayName } : {})}
          />
          <TextInput
            label="Timezone"
            name="timezone"
            hint={zoneHint}
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            {...(errors.timezone ? { error: errors.timezone } : {})}
          />
          <TextInput
            label="Daily goal in minutes"
            name="dailyGoalMinutes"
            type="number"
            inputMode="numeric"
            min={DAILY_GOAL_MIN}
            max={DAILY_GOAL_MAX}
            step={1}
            hint={`From ${DAILY_GOAL_MIN} to ${DAILY_GOAL_MAX}.`}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            {...(errors.dailyGoalMinutes ? { error: errors.dailyGoalMinutes } : {})}
          />
        </div>
      </Card>

      <Card title="Interface" headingLevel={2}>
        <div className="flex flex-col gap-4">
          <p className="app-fixed-field">
            <span className="app-fixed-field__label">Interface language</span>
            <span>English</span>
            <span className="app-muted">More interface languages come later.</span>
          </p>
          <div>
            <ThemeToggle />
          </div>
        </div>
      </Card>

      <div>
        <Button type="submit" loading={pending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
