'use server';

import { headers } from 'next/headers';
import type { SignInFormState } from '../../lib/sign-in-state';
import { getContainer } from '../../server/container';
import { clientAddressFrom, devLinkFor, requestSignInLink } from '../../server/sign-in';

/**
 * Asks for a magic link. The answer is the same for every address that looks
 * like an email, so the form does not reveal who has an account.
 */
export async function requestLink(
  _previous: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const { auth, signInLimiter, config, consoleMail } = getContainer();
  const email = formData.get('email');
  const result = await requestSignInLink(
    { auth, limiter: signInLimiter, appUrl: config.appUrl },
    { email, next: formData.get('next'), clientAddress: clientAddressFrom(await headers()) },
  );
  if (!result.ok) return { status: 'invalid', message: result.message };

  // Local development only. The console adapter prints the mail to the
  // terminal; showing the same link here saves the trip. core-mail refuses
  // the console adapter in production, and both flags are checked again.
  const local = !config.isProduction && process.env.NODE_ENV !== 'production';
  const devLink = local && consoleMail ? devLinkFor(consoleMail, email) : null;
  return {
    status: 'sent',
    message: result.message,
    ...(devLink === null ? {} : { devLink }),
  };
}
