// A real SMTP server on the loopback interface, for the SMTP adapter tests.
// It listens on an ephemeral port, speaks plain SMTP without TLS, makes sign
// in optional and records every message it accepts. Nothing leaves the machine.
import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';

/** One message the stub accepted. */
export interface ReceivedMail {
  /** Envelope sender, from MAIL FROM. */
  from: string;
  /** Envelope recipients, from RCPT TO. */
  to: string[];
  /** The raw message: headers, a blank line, the body. */
  raw: string;
}

export interface StubSmtp {
  port: number;
  /** Messages accepted so far, oldest first. */
  received: ReceivedMail[];
  /** How many clients have connected so far. */
  connections(): number;
  close(): Promise<void>;
}

export interface StubSmtpOptions {
  /** The only password the stub accepts when a client signs in. */
  password: string;
  /** Recipients the stub refuses, with the SMTP reply code to refuse them with. */
  refuse?: Record<string, number>;
}

function smtpError(message: string, responseCode: number): Error {
  return Object.assign(new Error(message), { responseCode });
}

export async function startStubSmtp(options: StubSmtpOptions): Promise<StubSmtp> {
  const received: ReceivedMail[] = [];
  const refuse = options.refuse ?? {};
  let connections = 0;

  const server = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    logger: false,

    onConnect(_session, callback) {
      connections += 1;
      callback();
    },

    onAuth(auth, _session, callback) {
      if (auth.password === options.password) callback(null, { user: auth.username ?? 'user' });
      else callback(smtpError('Authentication failed', 535));
    },

    onRcptTo(address, _session, callback) {
      const code = refuse[address.address];
      if (code === undefined) callback();
      else callback(smtpError(`Recipient refused with ${code}`, code));
    },

    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const { mailFrom, rcptTo } = session.envelope;
        received.push({
          from: mailFrom === false ? '' : mailFrom.address,
          to: rcptTo.map((recipient) => recipient.address),
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        callback();
      });
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.server.address() as AddressInfo;

  return {
    port,
    received,
    connections: () => connections,
    close: () => new Promise<void>((resolve) => server.close(resolve)),
  };
}

/** A loopback port with nothing listening on it. */
export async function closedPort(): Promise<number> {
  const stub = await startStubSmtp({ password: 'unused' });
  await stub.close();
  return stub.port;
}
