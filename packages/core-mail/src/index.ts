// @stufen/core-mail
// Outbound email behind MailPort. The only public surface of this box.
// The port itself lives in contracts; it is re exported here for convenience.
export type { MailMessage, MailPort } from '@stufen/contracts';

export { createConsoleMail } from './console-mail';
export type { ConsoleMail, ConsoleMailOptions, SentMail } from './console-mail';

export { MailValidationError, MAX_SUBJECT_LENGTH, validateMessage } from './validate';
export type { MailField } from './validate';
