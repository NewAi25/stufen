// SMTP adapter for MailPort (P1-36). It sends through any SMTP server given
// as a URL, so the provider is a deployment choice and never a code change
// (ADR-008). Failures come back as MailDeliveryError with a retryable flag
// and never contain the password from the URL.
import type { MailMessage, MailPort } from '@stufen/contracts';
import { createTransport } from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { MailConfigError, MailDeliveryError } from './errors';
import { parseSender, parseSmtpUrl, redact } from './smtp-config';
import { validateMessage } from './validate';

/**
 * The part of a nodemailer transporter this adapter uses. Anything returned
 * by nodemailer's `createTransport` fits, and a test can pass a small fake.
 */
export interface SmtpTransport {
  sendMail(data: SendMailOptions): Promise<{ messageId: string }>;
  verify(): Promise<unknown>;
  close(): void;
}

export interface SmtpMailOptions {
  /** An SMTP URL such as smtp://user:pass@host:587 or smtps://host:465. */
  url: string;
  /** Sender: `no-reply@example.org` or `Stufen <no-reply@example.org>`. */
  from: string;
  /** Where replies go, in the same two forms. Default: no Reply-To header. */
  replyTo?: string;
  /** Limit for connecting, for the greeting and for a silent socket. Default 10000. */
  timeoutMs?: number;
  /** A nodemailer transport to use instead of one built from `url`. For tests. */
  transport?: SmtpTransport;
}

export type SmtpMail = MailPort & {
  /** Connects and signs in without sending. Rejects with `MailDeliveryError`. */
  verify(): Promise<void>;
  /** Closes the transport. Safe to call more than once. */
  close(): Promise<void>;
};

// Transport error codes that mean the settings or the message are wrong, so
// trying again cannot help even though no SMTP reply code came back.
const NOT_RETRYABLE_CODES = new Set(['ECONFIG', 'ENOAUTH', 'EENVELOPE', 'EOAUTH2']);

interface ErrorDetails {
  message: string;
  code?: string;
  responseCode?: number;
}

function readError(error: unknown): ErrorDetails {
  if (typeof error !== 'object' || error === null) return { message: String(error) };
  const source = error as { message?: unknown; code?: unknown; responseCode?: unknown };
  const details: ErrorDetails = {
    message: typeof source.message === 'string' ? source.message : 'unknown error',
  };
  if (typeof source.code === 'string') details.code = source.code;
  if (typeof source.responseCode === 'number') details.responseCode = source.responseCode;
  return details;
}

/** Connection problems and 4xx replies are retryable, 5xx replies are not. */
function isRetryable(details: ErrorDetails): boolean {
  const { responseCode, code } = details;
  if (responseCode !== undefined && responseCode >= 500) return false;
  if (responseCode !== undefined && responseCode >= 400) return true;
  return code === undefined || !NOT_RETRYABLE_CODES.has(code);
}

function toDeliveryError(
  action: string,
  error: unknown,
  secrets: readonly string[],
): MailDeliveryError {
  const details = readError(error);
  const facts = [details.responseCode, details.code].filter((fact) => fact !== undefined);
  const suffix = facts.length > 0 ? ` (${facts.join(', ')})` : '';
  // The original error is not attached as a cause: its text is not redacted.
  return new MailDeliveryError(
    redact(`SMTP ${action} failed${suffix}: ${details.message}`, secrets),
    {
      retryable: isRetryable(details),
      ...(details.responseCode !== undefined ? { responseCode: details.responseCode } : {}),
      ...(details.code !== undefined ? { code: details.code } : {}),
    },
  );
}

export function createSmtpMail(options: SmtpMailOptions): SmtpMail {
  const { href, secrets } = parseSmtpUrl(options.url);
  const from = parseSender(options.from, 'from');
  const replyTo =
    options.replyTo === undefined ? undefined : parseSender(options.replyTo, 'replyTo');
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new MailConfigError(`Mail timeoutMs must be a number above 0, got ${timeoutMs}`);
  }

  const transport: SmtpTransport =
    options.transport ??
    createTransport({
      url: href,
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });

  return {
    async send(message: MailMessage): Promise<{ messageId: string }> {
      validateMessage(message);

      const data: SendMailOptions = {
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html !== undefined ? { html: message.html } : {}),
        ...(replyTo !== undefined ? { replyTo } : {}),
      };
      try {
        const info = await transport.sendMail(data);
        return { messageId: info.messageId };
      } catch (error) {
        throw toDeliveryError('send', error, secrets);
      }
    },

    async verify(): Promise<void> {
      try {
        await transport.verify();
      } catch (error) {
        throw toDeliveryError('verify', error, secrets);
      }
    },

    async close(): Promise<void> {
      transport.close();
    },
  };
}
