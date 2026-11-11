// Every branch of the factory that picks a mail adapter from the environment
// (P1-36). No network: the SMTP branch gets an injected transport.
import { describe, expect, it } from 'vitest';
import { createMailFromEnv, MailConfigError } from '../src';
import type { MailMessage, MailPort, SmtpTransport } from '../src';

const message: MailMessage = {
  to: 'lerner@example.com',
  subject: 'Dein Anmeldelink',
  text: 'Hallo',
};

const SMTP_ENV = {
  MAIL_DRIVER: 'smtp',
  SMTP_URL: 'smtp://stufen:s3cr3t-Pa55word@mail.example.org:587',
  MAIL_FROM: 'Stufen <no-reply@stufen.test>',
};

function fakeTransport() {
  const sent: unknown[] = [];
  const transport: SmtpTransport = {
    async sendMail(data) {
      sent.push(data);
      return { messageId: '<fake@example.org>' };
    },
    async verify() {},
    close() {},
  };
  return { sent, transport };
}

function isConsole(mail: MailPort): boolean {
  return 'sent' in mail && !('verify' in mail);
}

function isSmtp(mail: MailPort): boolean {
  return 'verify' in mail && 'close' in mail && !('sent' in mail);
}

function configError(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MailConfigError);
    expect((error as Error).name).toBe('MailConfigError');
    return (error as Error).message;
  }
  throw new Error('expected a MailConfigError');
}

describe('createMailFromEnv: console', () => {
  it('gives the console adapter when MAIL_DRIVER is console', async () => {
    const lines: string[] = [];
    const mail = createMailFromEnv(
      { MAIL_DRIVER: 'console', NODE_ENV: 'development' },
      { console: { log: (line) => void lines.push(line), newId: () => 'console-1-test' } },
    );

    expect(isConsole(mail)).toBe(true);
    await expect(mail.send(message)).resolves.toEqual({ messageId: 'console-1-test' });
    expect(lines).toContain('To: lerner@example.com');
  });

  it('defaults to the console adapter outside production', () => {
    expect(isConsole(createMailFromEnv({}))).toBe(true);
    expect(isConsole(createMailFromEnv({ NODE_ENV: 'test' }))).toBe(true);
    expect(isConsole(createMailFromEnv({ MAIL_DRIVER: '', NODE_ENV: 'development' }))).toBe(true);
    expect(isConsole(createMailFromEnv({ MAIL_DRIVER: undefined }))).toBe(true);
  });

  it('refuses the console adapter in production', () => {
    const text = configError(() =>
      createMailFromEnv({ MAIL_DRIVER: 'console', NODE_ENV: 'production' }),
    );

    expect(text).toContain('MAIL_DRIVER is console and NODE_ENV is production');
    expect(text).toContain('prints sign in links');
    expect(text).toContain('MAIL_DRIVER=smtp');
  });

  it('refuses a missing MAIL_DRIVER in production, where the default would be console', () => {
    const text = configError(() => createMailFromEnv({ NODE_ENV: 'production' }));

    expect(text).toContain('MAIL_DRIVER is not set');
    expect(text).toContain('must not run in production');
  });
});

describe('createMailFromEnv: smtp', () => {
  it('gives the SMTP adapter with SMTP_URL and MAIL_FROM', async () => {
    const { sent, transport } = fakeTransport();

    const mail = createMailFromEnv(SMTP_ENV, { smtp: { transport } });

    expect(isSmtp(mail)).toBe(true);
    await expect(mail.send(message)).resolves.toEqual({ messageId: '<fake@example.org>' });
    expect(sent[0]).toEqual({
      from: { address: 'no-reply@stufen.test', name: 'Stufen' },
      to: 'lerner@example.com',
      subject: 'Dein Anmeldelink',
      text: 'Hallo',
    });
  });

  it('is allowed in production and passes MAIL_REPLY_TO on', async () => {
    const { sent, transport } = fakeTransport();
    const env = { ...SMTP_ENV, NODE_ENV: 'production', MAIL_REPLY_TO: 'hilfe@stufen.test' };

    const mail = createMailFromEnv(env, { smtp: { transport } });
    await mail.send(message);

    expect(isSmtp(mail)).toBe(true);
    expect(sent[0]).toMatchObject({ replyTo: { address: 'hilfe@stufen.test' } });
  });

  it('builds a real transport without connecting when none is injected', async () => {
    const mail = createMailFromEnv(SMTP_ENV);

    expect(isSmtp(mail)).toBe(true);
    await (mail as MailPort & { close(): Promise<void> }).close();
  });

  it('names what is missing when SMTP_URL or MAIL_FROM is not set', () => {
    const { SMTP_URL, MAIL_FROM } = SMTP_ENV;

    expect(configError(() => createMailFromEnv({ MAIL_DRIVER: 'smtp', MAIL_FROM }))).toBe(
      'MAIL_DRIVER is smtp but SMTP_URL is not set.',
    );
    expect(configError(() => createMailFromEnv({ MAIL_DRIVER: 'smtp', SMTP_URL }))).toBe(
      'MAIL_DRIVER is smtp but MAIL_FROM is not set.',
    );
    expect(configError(() => createMailFromEnv({ MAIL_DRIVER: 'smtp', SMTP_URL: '  ' }))).toBe(
      'MAIL_DRIVER is smtp but SMTP_URL and MAIL_FROM are not set.',
    );
  });

  it('rejects a bad SMTP_URL or MAIL_FROM without repeating the password', () => {
    const badUrl = configError(() =>
      createMailFromEnv({ ...SMTP_ENV, SMTP_URL: 'https://u:s3cr3t-Pa55word@example.org' }),
    );
    const badFrom = configError(() => createMailFromEnv({ ...SMTP_ENV, MAIL_FROM: 'Stufen' }));

    expect(badUrl).toContain('SMTP_URL is not valid.');
    expect(badUrl).not.toContain('s3cr3t-Pa55word');
    expect(badFrom).toContain('MAIL_FROM is not valid.');
    expect(
      configError(() => createMailFromEnv({ ...SMTP_ENV, MAIL_REPLY_TO: 'nobody' })),
    ).toContain('MAIL_REPLY_TO is not valid.');
  });
});

describe('createMailFromEnv: unknown driver', () => {
  it('rejects any other MAIL_DRIVER, in every environment, without echoing it', () => {
    for (const driver of ['sendgrid', 'SMTP', 'Console', 'smtp://u:hunter2@example.org']) {
      for (const NODE_ENV of ['development', 'production', undefined]) {
        const text = configError(() => createMailFromEnv({ MAIL_DRIVER: driver, NODE_ENV }));
        expect(text).toBe('MAIL_DRIVER must be console or smtp.');
      }
    }
  });
});
