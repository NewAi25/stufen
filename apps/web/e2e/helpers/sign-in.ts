// The sign in steps both tests share: ask for a link, then follow it.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { magicLinkFor } from './magic-link';

/** A fresh address per call. Only addresses ending in @example.test are used. */
export function uniqueEmail(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `e2e-${Date.now()}-${random}@example.test`;
}

/**
 * Fills the sign in form that is on screen and returns the link that was
 * sent. The form gives every address the same neutral answer.
 */
export async function requestSignInLink(page: Page, email: string, baseUrl: string) {
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('button', { name: 'Send me a link' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'If that address can sign in, a link is on its way.' }),
  ).toBeVisible();
  return magicLinkFor(page, email, baseUrl);
}
