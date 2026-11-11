// Parsing for the SMTP adapter's settings: the sender address and the SMTP
// URL. Internal to the box. Nothing here ever puts the URL or its password
// into an error message.
import { MailConfigError } from './errors';
import { isSingleAddress } from './validate';

/** A sender as nodemailer takes it: an address with an optional display name. */
export interface Sender {
  address: string;
  name?: string;
}

// "Display name <address>". The name may be empty or quoted.
const NAMED_ADDRESS = /^([^<>\r\n]*)<([^<>\r\n]*)>$/;

/**
 * Reads a sender given as `no-reply@example.org` or as
 * `Stufen <no-reply@example.org>`. Throws `MailConfigError` otherwise.
 * `label` names the setting in the error, for example `from`.
 */
export function parseSender(value: unknown, label: string): Sender {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isSingleAddress(trimmed)) return { address: trimmed };

    const match = NAMED_ADDRESS.exec(trimmed);
    if (match) {
      const address = (match[2] ?? '').trim();
      const name = (match[1] ?? '').trim().replace(/^"(.*)"$/, '$1');
      if (isSingleAddress(address)) return name === '' ? { address } : { address, name };
    }
  }
  throw new MailConfigError(
    `Mail ${label} must be one email address, optionally with a display name such as "Stufen <no-reply@example.org>"`,
  );
}

export interface SmtpUrl {
  /** The URL as given, trimmed. */
  href: string;
  /** Strings that must never appear in an error message. */
  secrets: string[];
}

/**
 * Checks an SMTP URL such as smtp://user:pass@host:587 or smtps://host:465
 * and collects the password, as written and decoded, for redaction.
 */
export function parseSmtpUrl(value: unknown): SmtpUrl {
  const problem = 'SMTP URL must look like smtp://user:pass@host:587 or smtps://host:465';
  if (typeof value !== 'string' || value.trim() === '') throw new MailConfigError(problem);

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new MailConfigError(problem);
  }
  if ((parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') || parsed.hostname === '') {
    throw new MailConfigError(problem);
  }

  const secrets = new Set<string>();
  if (parsed.password !== '') {
    secrets.add(parsed.password);
    try {
      secrets.add(decodeURIComponent(parsed.password));
    } catch {
      // Not valid percent encoding. The written form is already collected.
    }
  }
  // Longest first, so a secret that contains another is replaced whole.
  return { href: value.trim(), secrets: [...secrets].sort((a, b) => b.length - a.length) };
}

/** Replaces every secret in the text with `***`. */
export function redact(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join('***');
  return result;
}
