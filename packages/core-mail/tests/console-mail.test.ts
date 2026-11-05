// Behaviour of the console mail adapter (P0-28). Acceptance check from
// docs/07-build-sequence.md: the console adapter prints the to, subject and
// body of one message and returns a message id.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createConsoleMail,
  MailValidationError,
  MAX_SUBJECT_LENGTH,
  validateMessage,
} from '../src';
import type { MailField, MailMessage, MailPort } from '../src';

const message: MailMessage = {
  to: 'lerner@example.com',
  subject: 'Dein Anmeldelink',
  text: 'Hallo,\nhier ist dein Link: https://stufen.test/auth/consume?token=abc',
};

function capture() {
  const lines: string[] = [];
  return { lines, log: (line: string) => void lines.push(line) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createConsoleMail', () => {
  it('prints the to, subject and body of one message and returns a message id', async () => {
    const { lines, log } = capture();
    const mail = createConsoleMail({ log, newId: () => 'console-1-test' });

    const result = await mail.send(message);

    expect(result).toEqual({ messageId: 'console-1-test' });
    const separator = '-'.repeat(60);
    expect(lines).toEqual([
      separator,
      'To: lerner@example.com',
      'Subject: Dein Anmeldelink',
      'Message id: console-1-test',
      '',
      'Hallo,',
      'hier ist dein Link: https://stufen.test/auth/consume?token=abc',
      separator,
    ]);
  });

  it('is usable as a plain MailPort', async () => {
    const port: MailPort = createConsoleMail({ log: () => {} });

    const { messageId } = await port.send(message);

    expect(messageId).toMatch(/^console-1-[0-9a-f]{8}$/);
  });

  it('logs through console.log when no log is given', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mail = createConsoleMail();

    await mail.send(message);

    expect(spy).toHaveBeenCalledWith('To: lerner@example.com');
    expect(spy).toHaveBeenCalledWith('Subject: Dein Anmeldelink');
  });

  it('keeps sent messages with their id and send time, and last() returns the newest', async () => {
    const mail = createConsoleMail({
      log: () => {},
      now: () => new Date('2026-11-05T10:00:00.000Z'),
    });
    expect(mail.sent).toEqual([]);
    expect(mail.last()).toBeUndefined();

    const first = await mail.send(message);
    const second = await mail.send({ ...message, subject: 'Zweite Mail', html: '<p>Hallo</p>' });

    expect(mail.sent).toHaveLength(2);
    expect(mail.sent[0]).toEqual({
      ...message,
      messageId: first.messageId,
      sentAt: '2026-11-05T10:00:00.000Z',
    });
    expect(mail.last()).toEqual({
      ...message,
      subject: 'Zweite Mail',
      html: '<p>Hallo</p>',
      messageId: second.messageId,
      sentAt: '2026-11-05T10:00:00.000Z',
    });
  });

  it('stores a copy, so changing the original afterwards does not change the record', async () => {
    const mail = createConsoleMail({ log: () => {} });
    const mutable: MailMessage = { ...message };

    await mail.send(mutable);
    mutable.subject = 'Geändert';

    expect(mail.last()?.subject).toBe('Dein Anmeldelink');
  });

  it('keeps only the last `keep` messages and drops the oldest', async () => {
    const mail = createConsoleMail({ log: () => {}, keep: 2 });

    await mail.send({ ...message, subject: 'eins' });
    await mail.send({ ...message, subject: 'zwei' });
    await mail.send({ ...message, subject: 'drei' });

    expect(mail.sent.map((sent) => sent.subject)).toEqual(['zwei', 'drei']);
    expect(mail.last()?.subject).toBe('drei');
  });

  it('keeps 50 messages by default', async () => {
    const mail = createConsoleMail({ log: () => {} });

    for (let i = 1; i <= 51; i += 1) {
      await mail.send({ ...message, subject: `Mail ${i}` });
    }

    expect(mail.sent).toHaveLength(50);
    expect(mail.sent[0]?.subject).toBe('Mail 2');
  });

  it('keep 0 still prints and returns an id but remembers nothing', async () => {
    const { lines, log } = capture();
    const mail = createConsoleMail({ log, keep: 0 });

    const { messageId } = await mail.send(message);

    expect(messageId).toMatch(/^console-1-/);
    expect(lines).toContain('To: lerner@example.com');
    expect(mail.sent).toEqual([]);
    expect(mail.last()).toBeUndefined();
  });

  it('rejects a keep that is negative or not a whole number', () => {
    expect(() => createConsoleMail({ keep: -1 })).toThrow(RangeError);
    expect(() => createConsoleMail({ keep: 1.5 })).toThrow(RangeError);
  });

  it('clear forgets every kept message', async () => {
    const mail = createConsoleMail({ log: () => {} });
    await mail.send(message);
    await mail.send(message);

    mail.clear();

    expect(mail.sent).toEqual([]);
    expect(mail.last()).toBeUndefined();
  });

  it('two sends produce different ids', async () => {
    const mail = createConsoleMail({ log: () => {} });

    const first = await mail.send(message);
    const second = await mail.send(message);

    expect(first.messageId).toMatch(/^console-1-[0-9a-f]{8}$/);
    expect(second.messageId).toMatch(/^console-2-[0-9a-f]{8}$/);
    expect(first.messageId).not.toBe(second.messageId);
  });

  it('an invalid message rejects, prints nothing and is not kept', async () => {
    const { lines, log } = capture();
    const mail = createConsoleMail({ log });

    await expect(mail.send({ ...message, to: 'not an address' })).rejects.toBeInstanceOf(
      MailValidationError,
    );

    expect(lines).toEqual([]);
    expect(mail.sent).toEqual([]);
  });
});

describe('validateMessage', () => {
  function fieldOf(candidate: MailMessage): MailField | 'no error' {
    try {
      validateMessage(candidate);
    } catch (error) {
      if (error instanceof MailValidationError) return error.field;
      throw error;
    }
    return 'no error';
  }

  it('accepts a normal message, with or without html', () => {
    expect(fieldOf(message)).toBe('no error');
    expect(fieldOf({ ...message, html: '<p>Hallo</p>' })).toBe('no error');
    expect(fieldOf({ ...message, to: 'vorname.nachname+stufen@mail.example.co.uk' })).toBe(
      'no error',
    );
  });

  it.each([
    ['empty', ''],
    ['no @', 'lerner.example.com'],
    ['no domain dot', 'lerner@example'],
    ['nothing before the @', '@example.com'],
    ['two @', 'lerner@@example.com'],
    ['a space', 'lerner @example.com'],
    ['two addresses with a comma', 'a@example.com,b@example.com'],
    ['two addresses with a semicolon', 'a@example.com;b@example.com'],
    ['a display name', 'Lerner <lerner@example.com>'],
    ['a line break', 'lerner@example.com\nBcc: spy@example.com'],
    ['a trailing dot', 'lerner@example.com.'],
    ['an empty domain label', 'lerner@example..com'],
    ['more than 254 characters', `${'a'.repeat(250)}@example.com`],
  ])('rejects a to with %s', (_label, to) => {
    expect(fieldOf({ ...message, to })).toBe('to');
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['longer than 200 characters', 'a'.repeat(MAX_SUBJECT_LENGTH + 1)],
    ['a line feed', 'Hallo\nBcc: spy@example.com'],
    ['a carriage return', 'Hallo\rBcc: spy@example.com'],
  ])('rejects a subject that is %s', (_label, subject) => {
    expect(fieldOf({ ...message, subject })).toBe('subject');
  });

  it('accepts a subject of exactly 200 characters', () => {
    expect(fieldOf({ ...message, subject: 'a'.repeat(MAX_SUBJECT_LENGTH) })).toBe('no error');
  });

  it.each([
    ['empty', ''],
    ['only white space', ' \n '],
  ])('rejects a text that is %s', (_label, text) => {
    expect(fieldOf({ ...message, text })).toBe('text');
  });

  it('throws a MailValidationError that names the field', () => {
    let caught: unknown;
    try {
      validateMessage({ ...message, text: '' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MailValidationError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as MailValidationError).name).toBe('MailValidationError');
    expect((caught as MailValidationError).field).toBe('text');
    expect((caught as MailValidationError).message).toBe('Invalid mail text: must not be empty');
  });
});
