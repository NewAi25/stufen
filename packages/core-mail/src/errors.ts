// Typed errors for the adapters that talk to a real mail server and for the
// factory that picks an adapter from configuration.

export interface MailDeliveryErrorOptions {
  /** True when sending the same message again later may work. */
  retryable: boolean;
  /** The SMTP reply code, when the server answered. For example 550. */
  responseCode?: number;
  /** The transport error code, when there is one. For example ECONNECTION. */
  code?: string;
}

/**
 * The mail server did not accept the message, or could not be reached.
 * Connection problems and 4xx replies are retryable, 5xx replies are not.
 * The message never contains the password from the SMTP URL.
 */
export class MailDeliveryError extends Error {
  readonly retryable: boolean;
  readonly responseCode: number | undefined;
  readonly code: string | undefined;

  constructor(message: string, options: MailDeliveryErrorOptions) {
    super(message);
    this.name = 'MailDeliveryError';
    this.retryable = options.retryable;
    this.responseCode = options.responseCode;
    this.code = options.code;
  }
}

/** The mail configuration is missing, unknown or not allowed in this environment. */
export class MailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailConfigError';
  }
}
