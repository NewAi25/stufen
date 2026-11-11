'use client';

import { useActionState } from 'react';
import { Button, Card, TextInput } from '@stufen/ui-kit';
import { LINK_LIFETIME_MINUTES, SIGN_IN_IDLE } from '../../lib/sign-in-state';
import { requestLink } from './actions';

export interface SignInFormProps {
  /** Where to go after sign in. Checked again on the server. */
  next: string;
  /** A calm note above the form, for example after a link that did not work. */
  notice?: string;
}

/** One email field and one button. The answer never says whether an account exists. */
export function SignInForm({ next, notice }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(requestLink, SIGN_IN_IDLE);

  return (
    <Card title="Sign in" headingLevel={1}>
      <form className="flex flex-col gap-4" action={formAction} noValidate>
        {notice ? <p className="app-muted">{notice}</p> : null}
        <p>Enter your email address. We send you a link that signs you in. No password.</p>
        <input type="hidden" name="next" value={next} />
        <TextInput
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          {...(state.status === 'invalid' ? { error: state.message } : {})}
        />
        <div>
          <Button type="submit" size="lg" loading={pending}>
            Send me a link
          </Button>
        </div>
        {state.status === 'sent' ? (
          <p role="status" className="app-sign-in-status">
            {state.message} The link works once and expires after {LINK_LIFETIME_MINUTES} minutes.
          </p>
        ) : null}
        {state.status === 'sent' && state.devLink ? (
          <p className="app-dev-only">
            <strong>Development only.</strong> The console mail adapter printed this link:{' '}
            <a href={state.devLink}>{state.devLink}</a>
          </p>
        ) : null}
      </form>
    </Card>
  );
}
