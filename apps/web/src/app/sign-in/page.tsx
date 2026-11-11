import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCookieSession } from '../../server/session';
import { safeNextPath } from '../../server/sign-in';
import { SignInForm } from './SignInForm';

// Reads the session cookie on every request. Never prerendered at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in | Stufen' };

const LINK_ERROR_NOTICE =
  'That link did not work. It may have expired or been used already. ' +
  'Enter your email address and we send you a new one.';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));

  // Already signed in with a real session: nothing to do here. The automatic
  // dev session does not count, so the page stays reachable in local work.
  if (await getCookieSession()) redirect(next);

  return (
    <SignInForm
      next={next}
      {...(first(params.error) === 'link' ? { notice: LINK_ERROR_NOTICE } : {})}
    />
  );
}
