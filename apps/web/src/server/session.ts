import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthSession } from '@stufen/contracts';
import { getContainer } from './container';
import { SESSION_COOKIE, signInPathFor } from './sign-in';

export { SESSION_COOKIE };

// The dev session token is kept here so one process reuses one session
// instead of starting a new one on every request. On globalThis for the same
// reason as the container: dev hot reload evaluates this module again.
const DEV_TOKEN_KEY = Symbol.for('stufen.web.devSessionToken');

type GlobalWithDevToken = typeof globalThis & { [DEV_TOKEN_KEY]?: string };

async function devSession(email: string): Promise<AuthSession> {
  const { auth } = getContainer();
  const scope = globalThis as GlobalWithDevToken;
  const known = await auth.getSession(scope[DEV_TOKEN_KEY]);
  if (known) return known;
  const created = await auth.createDevSession(email);
  scope[DEV_TOKEN_KEY] = created.sessionToken;
  return created;
}

/** The session behind the `stufen_session` cookie, or null. Never a dev session. */
export async function getCookieSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getContainer().auth.getSession(token);
}

/**
 * The session for this request, or null when nobody is signed in.
 *
 * With a `stufen_session` cookie, core-auth decides, and an unknown or expired
 * token means signed out. Without a cookie there is one exception for local
 * work: the automatic dev session. It exists only when all three hold:
 * NODE_ENV is not production, the stores are in memory, and
 * config.devSessionEmail is set. On Postgres sign in is always real.
 */
export async function getSession(): Promise<AuthSession | null> {
  const { auth, config, storeMode } = getContainer();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) return auth.getSession(token);

  if (config.isProduction || process.env.NODE_ENV === 'production') return null;
  if (storeMode !== 'memory' || config.storeMode !== 'memory') return null;
  if (!config.devSessionEmail) return null;
  return devSession(config.devSessionEmail);
}

/**
 * The session, or a redirect to the sign in page that remembers `path`.
 * Call it first in every page that needs a signed in learner.
 */
export async function requireSession(path: string): Promise<AuthSession> {
  const session = await getSession();
  if (!session) redirect(signInPathFor(path));
  return session;
}
