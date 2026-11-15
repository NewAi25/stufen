// Gets the sign in link for an email address, in one of two ways.
//
// E2E_MAILPIT_URL set (the Docker stack): the app sends real mail to Mailpit,
// and the link is read from the newest message to that address through the
// Mailpit HTTP API.
// E2E_MAILPIT_URL not set (the dev server with the console mail adapter): the
// sign in page shows the link below the form, labelled "Development only".
import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const CALLBACK_PATH = '/auth/callback';
const POLL_MS = 500;
const MAIL_TIMEOUT_MS = 30_000;

const MAILBOX_PAGE = '50';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTo(entry: Record<string, unknown>, email: string): boolean {
  const recipients: unknown[] = Array.isArray(entry.To) ? entry.To : [];
  return recipients.some(
    (recipient) =>
      isRecord(recipient) &&
      typeof recipient.Address === 'string' &&
      recipient.Address.toLowerCase() === email.toLowerCase(),
  );
}

/**
 * The id of the newest message to `email` in the answer of Mailpit's
 * `GET /api/v1/messages`, which lists the newest message first.
 */
export function newestMessageId(body: unknown, email: string): string | null {
  const messages: unknown[] = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
  for (const entry of messages) {
    if (isRecord(entry) && typeof entry.ID === 'string' && isTo(entry, email)) return entry.ID;
  }
  return null;
}

/** The first sign in link in a mail text, or null. */
export function linkInText(text: string): string | null {
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  return links.find((link) => link.includes(`${CALLBACK_PATH}?`)) ?? null;
}

/** Puts the link on the origin under test. Mail links are built from APP_URL. */
export function onBaseUrl(link: string, baseUrl: string): string {
  const url = new URL(link);
  const base = new URL(baseUrl);
  if (url.origin === base.origin) return link;
  return `${base.origin}${url.pathname}${url.search}${url.hash}`;
}

async function linkFromMailpit(
  request: APIRequestContext,
  mailpitUrl: string,
  email: string,
): Promise<string> {
  const root = mailpitUrl.replace(/\/+$/, '');
  const deadline = Date.now() + MAIL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const list = await request.get(`${root}/api/v1/messages`, {
      params: { limit: MAILBOX_PAGE },
    });
    const newest = list.ok() ? newestMessageId(await list.json(), email) : null;
    if (newest !== null) {
      const message = await request.get(`${root}/api/v1/message/${newest}`);
      const body: unknown = message.ok() ? await message.json() : null;
      const text = isRecord(body) && typeof body.Text === 'string' ? body.Text : '';
      const link = linkInText(text);
      if (link !== null) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`No sign in mail for ${email} reached Mailpit at ${root} in time.`);
}

async function linkFromPage(page: Page, email: string): Promise<string> {
  const link = page.getByRole('link', { name: /\/auth\/callback\?/ });
  await expect(
    link,
    `The sign in page shows no development link for ${email}. It needs the dev server with ` +
      'the console mail adapter, and at most 5 sign in requests in 15 minutes per client.',
  ).toBeVisible();
  const href = await link.getAttribute('href');
  if (href === null) throw new Error('The development link has no href.');
  return href;
}

/**
 * The sign in link for `email`, on the origin of `baseUrl`. Call it after the
 * sign in form was sent and shows its answer.
 */
export async function magicLinkFor(page: Page, email: string, baseUrl: string): Promise<string> {
  const mailpitUrl = process.env.E2E_MAILPIT_URL ?? '';
  const link =
    mailpitUrl === ''
      ? await linkFromPage(page, email)
      : await linkFromMailpit(page.request, mailpitUrl, email);
  return onBaseUrl(link, baseUrl);
}
