// Checks a message before any adapter sends it. Every adapter calls this
// first, so a bad message fails the same way in development and production.
import type { MailMessage } from '@stufen/contracts';

/** The message field a validation failure points at. */
export type MailField = 'to' | 'subject' | 'text';

/** Longest subject the box accepts, in characters. */
export const MAX_SUBJECT_LENGTH = 200;

// Longest address allowed in an SMTP path (RFC 5321).
const MAX_ADDRESS_LENGTH = 254;

// One address only: something, one @, a domain with at least one dot. No
// spaces, line breaks, commas, semicolons or angle brackets, so a list of
// recipients or a "Name <address>" form is rejected.
const SINGLE_ADDRESS = /^[^\s@,;<>]+@[^\s@,;<>.]+(\.[^\s@,;<>.]+)+$/;

const LINE_BREAK = /[\r\n]/;

/**
 * True when the value is one plausible email address, by the same rule
 * `validateMessage` applies to `to`. Internal to the box: adapters use it to
 * check their own sender address.
 */
export function isSingleAddress(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= MAX_ADDRESS_LENGTH && SINGLE_ADDRESS.test(value)
  );
}

export class MailValidationError extends Error {
  readonly field: MailField;

  constructor(field: MailField, reason: string) {
    super(`Invalid mail ${field}: ${reason}`);
    this.name = 'MailValidationError';
    this.field = field;
  }
}

/**
 * Throws `MailValidationError` when the message must not be sent. Returns
 * nothing when the message is fine.
 */
export function validateMessage(message: MailMessage): void {
  const { to, subject, text } = message;

  if (!isSingleAddress(to)) {
    throw new MailValidationError('to', 'must be one plausible email address');
  }

  if (typeof subject !== 'string' || subject.trim() === '') {
    throw new MailValidationError('subject', 'must not be empty');
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new MailValidationError(
      'subject',
      `must be at most ${MAX_SUBJECT_LENGTH} characters, got ${subject.length}`,
    );
  }
  // A line break in a subject lets a caller smuggle in extra mail headers.
  if (LINE_BREAK.test(subject)) {
    throw new MailValidationError('subject', 'must not contain a line break');
  }

  if (typeof text !== 'string' || text.trim() === '') {
    throw new MailValidationError('text', 'must not be empty');
  }
}
