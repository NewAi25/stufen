// @stufen/core-mail
// Outbound email behind MailPort. The only public surface of this box.
// The port itself lives in contracts; it is re exported here for convenience.
export type { MailMessage, MailPort } from '@stufen/contracts';

export { createConsoleMail } from './console-mail';
export type { ConsoleMail, ConsoleMailOptions, SentMail } from './console-mail';

export { createSmtpMail } from './smtp-mail';
export type { SmtpMail, SmtpMailOptions, SmtpTransport } from './smtp-mail';

export { createMailFromEnv } from './create-mail';
export type { CreateMailOptions } from './create-mail';

export { MailConfigError, MailDeliveryError } from './errors';
export type { MailDeliveryErrorOptions } from './errors';

export { MailValidationError, MAX_SUBJECT_LENGTH, validateMessage } from './validate';
export type { MailField } from './validate';
