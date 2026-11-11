import 'server-only';

// Sign in, callback and sign out as plain functions. No Next imports: the
// server action and the route handlers stay thin and the tests call these
// with a real container.

import type { AuthPort, AuthSession } from '@stufen/contracts';
import { AuthError } from '@stufen/core-auth';
import type { ConsoleMail } from '@stufen/core-mail';
import type { RateLimiter } from './rate-limit';

export const SESSION_COOKIE = 'stufen_session';

/** The one answer to every sign in request, whether or not the address has an account. */
export const NEUTRAL_MESSAGE = 'If that address can sign in, a link is on its way.';

export const SIGN_IN_LIMIT = 5;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export const CALLBACK_PATH = '/auth/callback';
export const SIGN_IN_PATH = '/sign-in';
export const LINK_ERROR_PATH = '/sign-in?error=link';

const EMAIL_MAX_LENGTH = 254;
const TOKEN_MAX_LENGTH = 256;
const NEXT_MAX_LENGTH = 512;
// Tab, line breaks and other control characters. Browsers drop some of them
// while parsing a URL, which can turn a harmless looking path into "//host".
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Where to go after sign in. Only a path on this site is accepted: it starts
 * with exactly one slash and has no backslash and no control character.
 * Anything else, including an absolute URL and "//host", becomes "/".
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > NEXT_MAX_LENGTH) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  if (next.includes('\\') || hasControlCharacter(next)) return '/';
  // The sign in pages themselves are never a target, so no redirect loop.
  if (next === SIGN_IN_PATH || next.startsWith(`${SIGN_IN_PATH}?`)) return '/';
  if (next.startsWith('/auth/')) return '/';
  return next;
}

/** The address the mail link points at. core-auth appends `&token=...`. */
export function callbackUrl(appUrl: string, next: string): string {
  return `${appUrl}${CALLBACK_PATH}?next=${encodeURIComponent(safeNextPath(next))}`;
}

/** The sign in page for a signed out visitor of `path`. */
export function signInPathFor(path: string): string {
  const next = safeNextPath(path);
  return next === '/' ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
  // One @, no spaces, a dot in the host. core-auth and core-mail check again.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export interface SignInRequest {
  email: unknown;
  next?: unknown;
  /** The client address as the proxy reports it. Null when unknown. */
  clientAddress: string | null;
}

export type SignInResult =
  { ok: true; message: typeof NEUTRAL_MESSAGE } | { ok: false; field: 'email'; message: string };

export interface SignInDeps {
  auth: Pick<AuthPort, 'requestMagicLink'>;
  limiter: RateLimiter;
  appUrl: string;
  /** Receives a failed send. Never gets the token. Default: console.error. */
  onError?: (error: unknown) => void;
}

/**
 * Handles one sign in request. An address that is not an email gets a field
 * error, which says nothing about accounts. Every other outcome is the same
 * neutral answer: sent, rate limited, or a mail server that failed.
 */
export async function requestSignInLink(
  deps: SignInDeps,
  input: SignInRequest,
): Promise<SignInResult> {
  const email = normalizeEmail(input.email);
  if (email === null) {
    return { ok: false, field: 'email', message: 'Enter your email address.' };
  }
  const neutral: SignInResult = { ok: true, message: NEUTRAL_MESSAGE };

  // Both counters are hit on every request, so neither can be probed alone.
  const emailAllowed = deps.limiter.hit(`email:${email}`);
  const addressAllowed = deps.limiter.hit(`address:${input.clientAddress ?? 'unknown'}`);
  if (!emailAllowed || !addressAllowed) return neutral;

  try {
    await deps.auth.requestMagicLink(email, callbackUrl(deps.appUrl, safeNextPath(input.next)));
  } catch (error) {
    if (error instanceof AuthError && error.code === 'invalid_email') {
      return { ok: false, field: 'email', message: 'Enter your email address.' };
    }
    // A mail server that is down must not change the answer, or the form
    // would tell addresses apart. The operator sees it in the log.
    (deps.onError ?? defaultOnError)(error);
  }
  return neutral;
}

function defaultOnError(error: unknown): void {
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  console.error(`Sign in mail could not be sent. ${reason}`);
}

/**
 * The newest magic link the console mail adapter printed for this address.
 * Local development only: the caller checks NODE_ENV, and the console adapter
 * does not exist in production.
 */
export function devLinkFor(mail: Pick<ConsoleMail, 'sent'>, email: unknown): string | null {
  const address = normalizeEmail(email);
  if (address === null) return null;
  for (let index = mail.sent.length - 1; index >= 0; index -= 1) {
    const message = mail.sent[index];
    if (!message || message.to !== address) continue;
    const link = message.text.match(/https?:\/\/\S+/)?.[0];
    if (link?.includes(`${CALLBACK_PATH}?`)) return link;
  }
  return null;
}

export type CallbackResult =
  | { ok: true; session: AuthSession; redirectTo: string }
  | { ok: false; redirectTo: typeof LINK_ERROR_PATH };

/** Trades a magic link token for a session. A token works once. */
export async function completeSignIn(
  deps: { auth: Pick<AuthPort, 'consumeMagicLink'> },
  input: { token: unknown; next?: unknown },
): Promise<CallbackResult> {
  const failed: CallbackResult = { ok: false, redirectTo: LINK_ERROR_PATH };
  const { token } = input;
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX_LENGTH) {
    return failed;
  }
  const session = await deps.auth.consumeMagicLink(token);
  if (session === null) return failed;
  return { ok: true, session, redirectTo: safeNextPath(input.next) };
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
  /** Seconds. Ends when the session ends. */
  maxAge: number;
}

/** The flags of the session cookie. `secure` follows the scheme of APP_URL. */
export function sessionCookieOptions(
  session: Pick<AuthSession, 'expiresAt'>,
  options: { secure: boolean; now?: Date },
): SessionCookieOptions {
  const now = options.now ?? new Date();
  const seconds = Math.floor((new Date(session.expiresAt).getTime() - now.getTime()) / 1000);
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: options.secure,
    maxAge: Math.max(0, seconds),
  };
}

/** Ends the session behind a cookie value. Safe without one and safe to repeat. */
export async function signOutSession(
  deps: { auth: Pick<AuthPort, 'signOut'> },
  token: string | null | undefined,
): Promise<void> {
  if (typeof token !== 'string' || token.length === 0 || token.length > TOKEN_MAX_LENGTH) return;
  await deps.auth.signOut(token);
}

type HeaderReader = { get(name: string): string | null };

/**
 * The client address for the rate limit: the last entry of X-Forwarded-For,
 * which is the one the nearest proxy (or the Next server itself) added. The
 * entries before it come from the client and can be made up. Null when the
 * header is missing.
 */
export function clientAddressFrom(headers: HeaderReader): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) return null;
  const last = forwarded.split(',').pop()?.trim() ?? '';
  return last.length > 0 && last.length <= 64 ? last : null;
}

/**
 * True when a POST may change state: it was sent by a page of this site, or
 * by a client that is not a browser. A browser always sends Origin on a POST,
 * so another site cannot sign a learner out with a hidden form.
 */
export function isSameOriginPost(headers: HeaderReader, appUrl: string): boolean {
  const origin = headers.get('origin');
  if (origin !== null) {
    try {
      return new URL(origin).origin === new URL(appUrl).origin;
    } catch {
      return false;
    }
  }
  const site = headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}
