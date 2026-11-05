// Console adapter for MailPort (P0-28). It prints each message instead of
// sending it and keeps the most recent ones in memory, so tests can assert on
// what would have been sent and a developer can copy a sign in link from the
// terminal. Never use it in production: it prints sign in links.
import type { MailMessage, MailPort } from '@stufen/contracts';
import { validateMessage } from './validate';

/** A message the console adapter accepted, with its id and send time. */
export interface SentMail extends MailMessage {
  messageId: string;
  /** ISO 8601 timestamp. */
  sentAt: string;
}

export interface ConsoleMailOptions {
  /** Receives one line per call. Default `console.log`. */
  log?: (line: string) => void;
  /** Returns the id for the next message. Default `console-<counter>-<random hex>`. */
  newId?: () => string;
  /** Clock used for `sentAt`. Default the system clock. */
  now?: () => Date;
  /** How many of the most recent messages stay in `sent`. Default 50. */
  keep?: number;
}

export type ConsoleMail = MailPort & {
  /** The most recent messages, oldest first. At most `keep` long. */
  readonly sent: readonly SentMail[];
  /** The most recent message, or undefined when nothing is kept. */
  last(): SentMail | undefined;
  /** Forgets every kept message. The id counter keeps counting. */
  clear(): void;
};

const SEPARATOR = '-'.repeat(60);

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createConsoleMail(options: ConsoleMailOptions = {}): ConsoleMail {
  // The default looks up console.log at call time, so a test can spy on it.
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => new Date());
  const keep = options.keep ?? 50;
  if (!Number.isInteger(keep) || keep < 0) {
    throw new RangeError(`keep must be a whole number of 0 or more, got ${keep}`);
  }

  let counter = 0;
  const newId =
    options.newId ??
    (() => {
      counter += 1;
      return `console-${counter}-${randomHex(4)}`;
    });

  const sent: SentMail[] = [];

  return {
    sent,

    async send(message: MailMessage): Promise<{ messageId: string }> {
      validateMessage(message);

      const messageId = newId();
      const record: SentMail = { ...message, messageId, sentAt: now().toISOString() };

      const lines = [
        SEPARATOR,
        `To: ${record.to}`,
        `Subject: ${record.subject}`,
        `Message id: ${messageId}`,
        '',
        ...record.text.split(/\r?\n/),
        SEPARATOR,
      ];
      for (const line of lines) log(line);

      sent.push(record);
      while (sent.length > keep) sent.shift();

      return { messageId };
    },

    last(): SentMail | undefined {
      return sent[sent.length - 1];
    },

    clear(): void {
      sent.length = 0;
    },
  };
}
