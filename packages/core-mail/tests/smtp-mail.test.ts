// Behaviour of the SMTP mail adapter (P1-36), against a real SMTP server on
// the loopback interface. Acceptance check: one message arrives with the
// right envelope, subject and body, and failures are typed and never leak
// the password.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSmtpMail, MailConfigError, MailDeliveryError, MailValidationError } from '../src';
import type { MailMessage, MailPort, SmtpMail } from '../src';
import { closedPort, startStubSmtp } from './stub-smtp';
import type { StubSmtp } from './stub-smtp';

const PASSWORD = 's3cr3t-Pa55word';
const FROM = 'Stufen <no-reply@stufen.test>';

const message: MailMessage = {
  to: 'lerner@example.com',
  subject: 'Dein Anmeldelink',
  text: 'Hallo,\nhier ist dein Link: https://stufen.test/c?token=abc',
};

let stub: StubSmtp;
let mail: SmtpMail;
const opened: SmtpMail[] = [];

function smtpUrl(port: number, password = PASSWORD): string {
  return `smtp://stufen:${password}@127.0.0.1:${port}`;
}

/** Creates an adapter that afterAll closes. */
function open(options: Parameters<typeof createSmtpMail>[0]): SmtpMail {
  const created = createSmtpMail(options);
  opened.push(created);
  return created;
}

async function failure(run: () => Promise<unknown>): Promise<MailDeliveryError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(MailDeliveryError);
    return error as MailDeliveryError;
  }
  throw new Error('expected the call to reject');
}

beforeAll(async () => {
  stub = await startStubSmtp({
    password: PASSWORD,
    refuse: { 'gone@example.com': 550, 'busy@example.com': 451 },
  });
  mail = open({ url: smtpUrl(stub.port), from: FROM });
});

afterAll(async () => {
  for (const created of opened) await created.close();
  await stub.close();
});

describe('createSmtpMail: sending', () => {
  it('delivers one message with the right envelope, subject and body', async () => {
    const before = stub.received.length;
    const port: MailPort = mail;

    const { messageId } = await port.send(message);

    expect(messageId).toMatch(/^<.+@.+>$/);
    expect(stub.received).toHaveLength(before + 1);
    const got = stub.received[before];
    expect(got?.from).toBe('no-reply@stufen.test');
    expect(got?.to).toEqual(['lerner@example.com']);
    expect(got?.raw).toContain('From: Stufen <no-reply@stufen.test>');
    expect(got?.raw).toContain('To: lerner@example.com');
    expect(got?.raw).toContain('Subject: Dein Anmeldelink');
    expect(got?.raw).toContain(`Message-ID: ${messageId}`);
    expect(got?.raw).toContain('Content-Type: text/plain');
    expect(got?.raw).toContain('Hallo,\r\nhier ist dein Link: https://stufen.test/c?token=abc');
    expect(got?.raw).not.toContain('multipart/alternative');
  });

  it('sends html as an alternative part next to the text', async () => {
    const before = stub.received.length;

    await mail.send({ ...message, html: '<p>Hallo, <a href="https://stufen.test/c">Link</a></p>' });

    const raw = stub.received[before]?.raw ?? '';
    expect(raw).toContain('Content-Type: multipart/alternative;');
    expect(raw).toContain('Content-Type: text/plain');
    expect(raw).toContain('Content-Type: text/html');
    expect(raw).toContain('hier ist dein Link: https://stufen.test/c?token=abc');
    expect(raw).toContain('<p>Hallo, <a href="https://stufen.test/c">Link</a></p>');
    expect(raw.indexOf('text/plain')).toBeLessThan(raw.indexOf('text/html'));
  });

  it('accepts a plain from address and adds Reply-To when replyTo is given', async () => {
    const before = stub.received.length;
    const plain = open({
      url: smtpUrl(stub.port),
      from: 'no-reply@stufen.test',
      replyTo: 'Hilfe <hilfe@stufen.test>',
    });

    await plain.send(message);

    const got = stub.received[before];
    expect(got?.from).toBe('no-reply@stufen.test');
    expect(got?.raw).toContain('From: no-reply@stufen.test');
    expect(got?.raw).toContain('Reply-To: Hilfe <hilfe@stufen.test>');
  });

  it('works without credentials in the URL, and verify resolves', async () => {
    const before = stub.received.length;
    const anonymous = open({ url: `smtp://127.0.0.1:${stub.port}`, from: FROM });

    await expect(anonymous.verify()).resolves.toBeUndefined();
    await anonymous.send(message);

    expect(stub.received).toHaveLength(before + 1);
  });
});

describe('createSmtpMail: failures', () => {
  it('never lets an invalid message reach the server', async () => {
    const received = stub.received.length;
    const connections = stub.connections();

    await expect(mail.send({ ...message, to: 'not an address' })).rejects.toThrow(
      MailValidationError,
    );
    await expect(mail.send({ ...message, subject: 'a\r\nBcc: x@example.com' })).rejects.toThrow(
      MailValidationError,
    );
    await expect(mail.send({ ...message, text: '  ' })).rejects.toThrow(MailValidationError);

    expect(stub.received).toHaveLength(received);
    expect(stub.connections()).toBe(connections);
  });

  it('a 550 reply gives MailDeliveryError with retryable false', async () => {
    const received = stub.received.length;

    const error = await failure(() => mail.send({ ...message, to: 'gone@example.com' }));

    expect(error.name).toBe('MailDeliveryError');
    expect(error.retryable).toBe(false);
    expect(error.responseCode).toBe(550);
    expect(error.message).toContain('550');
    expect(error.message).not.toContain(PASSWORD);
    expect(stub.received).toHaveLength(received);
  });

  it('a 4xx reply gives MailDeliveryError with retryable true', async () => {
    const error = await failure(() => mail.send({ ...message, to: 'busy@example.com' }));

    expect(error.retryable).toBe(true);
    expect(error.responseCode).toBe(451);
    expect(error.message).not.toContain(PASSWORD);
  });

  it('a closed port gives MailDeliveryError with retryable true', async () => {
    const port = await closedPort();
    const unreachable = open({ url: smtpUrl(port), from: FROM, timeoutMs: 2000 });

    const sendError = await failure(() => unreachable.send(message));
    const verifyError = await failure(() => unreachable.verify());

    for (const error of [sendError, verifyError]) {
      expect(error.retryable).toBe(true);
      expect(error.responseCode).toBeUndefined();
      expect(error.code).toBeTypeOf('string');
      expect(error.message).not.toContain(PASSWORD);
    }
  });

  it('a refused sign in is not retryable and does not leak the password', async () => {
    const wrong = 'wr0ng-Pa55word';
    const rejected = open({ url: smtpUrl(stub.port, wrong), from: FROM });

    const sendError = await failure(() => rejected.send(message));
    const verifyError = await failure(() => rejected.verify());

    for (const error of [sendError, verifyError]) {
      expect(error.retryable).toBe(false);
      expect(error.responseCode).toBe(535);
      expect(error.message).not.toContain(wrong);
      expect(JSON.stringify(error)).not.toContain(wrong);
    }
  });
});

describe('createSmtpMail: injected transport and settings', () => {
  it('uses the injected transport, redacts the password and passes the fields on', async () => {
    const sent: unknown[] = [];
    let closed = 0;
    const encoded = 'p%40ss%2Fword';
    const fake = createSmtpMail({
      url: `smtps://stufen:${encoded}@mail.example.org:465`,
      from: FROM,
      transport: {
        async sendMail(data) {
          sent.push(data);
          if (data.to === 'boom@example.com') {
            throw new Error(`cannot sign in as stufen with p@ss/word or ${encoded}`);
          }
          return { messageId: '<fake-1@example.org>' };
        },
        async verify() {
          throw Object.assign(new Error('settings are wrong: p@ss/word'), { code: 'ECONFIG' });
        },
        close() {
          closed += 1;
        },
      },
    });

    await expect(fake.send({ ...message, html: '<p>Hallo</p>' })).resolves.toEqual({
      messageId: '<fake-1@example.org>',
    });
    expect(sent[0]).toEqual({
      from: { address: 'no-reply@stufen.test', name: 'Stufen' },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: '<p>Hallo</p>',
    });

    const sendError = await failure(() => fake.send({ ...message, to: 'boom@example.com' }));
    expect(sendError.message).toBe('SMTP send failed: cannot sign in as stufen with *** or ***');
    expect(sendError.retryable).toBe(true);

    const verifyError = await failure(() => fake.verify());
    expect(verifyError.message).toBe('SMTP verify failed (ECONFIG): settings are wrong: ***');
    expect(verifyError.retryable).toBe(false);
    expect(verifyError.code).toBe('ECONFIG');

    await fake.close();
    await fake.close();
    expect(closed).toBe(2);
  });

  it('rejects a from or replyTo that is not one address', () => {
    const url = 'smtp://127.0.0.1:2525';
    for (const from of [
      '',
      'Stufen',
      'a@b.de, c@d.de',
      'Stufen <not-an-address>',
      'a@b.de\r\nBcc: x@y.de',
    ]) {
      expect(() => createSmtpMail({ url, from })).toThrow(MailConfigError);
    }
    expect(() => createSmtpMail({ url, from: FROM, replyTo: 'nobody' })).toThrow(MailConfigError);
  });

  it('rejects a URL that is not an SMTP URL, without repeating it', () => {
    for (const url of [
      '',
      'mail.example.org',
      'https://user:hunter2-secret@example.org',
      'smtp://',
    ]) {
      let caught: unknown;
      try {
        createSmtpMail({ url, from: FROM });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(MailConfigError);
      expect((caught as Error).message).not.toContain('hunter2-secret');
    }
  });

  it('rejects a timeout that is not above 0', () => {
    const url = 'smtp://127.0.0.1:2525';
    expect(() => createSmtpMail({ url, from: FROM, timeoutMs: 0 })).toThrow(MailConfigError);
    expect(() => createSmtpMail({ url, from: FROM, timeoutMs: Number.NaN })).toThrow(
      MailConfigError,
    );
  });
});
