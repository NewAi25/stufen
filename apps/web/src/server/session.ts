import 'server-only';

import { cookies } from 'next/headers';
import type { AuthSession } from '@stufen/contracts';
import { getContainer } from './container';

export const SESSION_COOKIE = 'stufen_session';

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

/**
 * The session for this request, or null when nobody is signed in.
 *
 * With a `stufen_session` cookie, core-auth decides. Without one, and only
 * outside production, the dev session for STUFEN_DEV_SESSION_EMAIL is used so
 * local pages work before real sign in exists. config.devSessionEmail is
 * always null in production, and NODE_ENV is checked again here.
 */
export async function getSession(): Promise<AuthSession | null> {
  const { auth, config } = getContainer();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) return auth.getSession(token);

  if (config.isProduction || process.env.NODE_ENV === 'production') return null;
  if (!config.devSessionEmail) return null;
  return devSession(config.devSessionEmail);
}
