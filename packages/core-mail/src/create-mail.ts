// Picks the mail adapter from configuration (P1-36). The app calls this once
// with `process.env`, so which adapter runs is a deployment choice (ADR-008).
import type { MailPort } from '@stufen/contracts';
import { createConsoleMail } from './console-mail';
import type { ConsoleMailOptions } from './console-mail';
import { MailConfigError } from './errors';
import { parseSender, parseSmtpUrl } from './smtp-config';
import { createSmtpMail } from './smtp-mail';
import type { SmtpMailOptions } from './smtp-mail';

export interface CreateMailOptions {
  /** Passed to the console adapter when it is chosen. */
  console?: ConsoleMailOptions;
  /** Passed to the SMTP adapter when it is chosen. */
  smtp?: Pick<SmtpMailOptions, 'timeoutMs' | 'transport'>;
}

const NO_CONSOLE_IN_PRODUCTION =
  'The console adapter prints sign in links and must not run in production. ' +
  'Set MAIL_DRIVER=smtp with SMTP_URL and MAIL_FROM.';

/** The trimmed value, or undefined when it is missing or blank. */
function read(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/** Runs a settings check and puts the variable name in front of its error. */
function named(name: string, check: () => unknown): void {
  try {
    check();
  } catch (error) {
    if (error instanceof MailConfigError) {
      throw new MailConfigError(`${name} is not valid. ${error.message}`);
    }
    throw error;
  }
}

/**
 * Returns the adapter the environment asks for.
 *
 * - `MAIL_DRIVER=console`, or no `MAIL_DRIVER` outside production: the
 *   console adapter. Refused when `NODE_ENV` is `production`.
 * - `MAIL_DRIVER=smtp`: the SMTP adapter. Needs `SMTP_URL` and `MAIL_FROM`.
 *   `MAIL_REPLY_TO` is optional.
 *
 * Anything else throws `MailConfigError`.
 */
export function createMailFromEnv(
  env: Record<string, string | undefined>,
  options: CreateMailOptions = {},
): MailPort {
  const production = read(env, 'NODE_ENV') === 'production';
  const driver = read(env, 'MAIL_DRIVER');

  if (driver === undefined) {
    if (production) {
      throw new MailConfigError(`MAIL_DRIVER is not set. ${NO_CONSOLE_IN_PRODUCTION}`);
    }
    return createConsoleMail(options.console);
  }

  if (driver === 'console') {
    if (production) {
      throw new MailConfigError(
        `MAIL_DRIVER is console and NODE_ENV is production. ${NO_CONSOLE_IN_PRODUCTION}`,
      );
    }
    return createConsoleMail(options.console);
  }

  if (driver === 'smtp') {
    const url = read(env, 'SMTP_URL');
    const from = read(env, 'MAIL_FROM');
    const missing = [
      url === undefined ? 'SMTP_URL' : '',
      from === undefined ? 'MAIL_FROM' : '',
    ].filter((name) => name !== '');
    if (url === undefined || from === undefined) {
      const verb = missing.length > 1 ? 'are' : 'is';
      throw new MailConfigError(
        `MAIL_DRIVER is smtp but ${missing.join(' and ')} ${verb} not set.`,
      );
    }
    const replyTo = read(env, 'MAIL_REPLY_TO');
    // Checked here first so the error names the variable to fix.
    named('SMTP_URL', () => parseSmtpUrl(url));
    named('MAIL_FROM', () => parseSender(from, 'from'));
    if (replyTo !== undefined) named('MAIL_REPLY_TO', () => parseSender(replyTo, 'replyTo'));
    return createSmtpMail({
      url,
      from,
      ...(replyTo !== undefined ? { replyTo } : {}),
      ...options.smtp,
    });
  }

  // The value is not echoed back: a secret pasted into the wrong variable
  // must not end up in a log.
  throw new MailConfigError('MAIL_DRIVER must be console or smtp.');
}
