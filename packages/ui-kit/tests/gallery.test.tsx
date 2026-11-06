// @vitest-environment jsdom
// Acceptance for P0-14 and P0-21: all ten components render in light and in dark.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Card,
  Choice,
  FeedbackFab,
  Progress,
  RatingInput,
  Sheet,
  TextArea,
  TextInput,
  THEMES,
  ToastProvider,
  useToast,
} from '../src/index';
import type { Theme } from '../src/index';

// Role queries are slow in jsdom, and slower still while other boxes build on
// the same machine. The default 5 s is too tight for the first test in a file.
vi.setConfig({ testTimeout: 20_000 });

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

function MoreSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        More
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="More" description="Extra links.">
        <Button variant="secondary">Settings</Button>
      </Sheet>
    </>
  );
}

function SaveButton() {
  const toast = useToast();
  return (
    <Button variant="secondary" onClick={() => toast.show({ message: 'Saved.', tone: 'success' })}>
      Save
    </Button>
  );
}

function Gallery({ theme }: { theme: Theme }) {
  return (
    <div data-theme={theme} data-testid="gallery">
      <ToastProvider>
        <Card title="Next lesson" as="section">
          <Progress value={5} max={12} label="Lesson progress" valueText="5 of 12" />
          <TextInput label="Your answer" lang="de" hint="Write one word." />
          <Choice
            label="Pick the article"
            shortcuts
            options={[
              { value: 'ein', label: 'ein', lang: 'de' },
              { value: 'einen', label: 'einen', lang: 'de' },
            ]}
          />
          <TextArea label="Your text" lang="de" maxLength={200} hint="Write two sentences." />
          <RatingInput label="How hard was it?" lowLabel="Easy" highLabel="Hard" />
          <Button>Check</Button>
          <SaveButton />
          <MoreSheet />
        </Card>
        <FeedbackFab onSubmit={() => Promise.resolve()} />
      </ToastProvider>
    </div>
  );
}

describe('gallery', () => {
  it('covers exactly the light and dark themes', () => {
    expect([...THEMES]).toEqual(['light', 'dark']);
  });

  it.each(THEMES)('renders all ten components by role in the %s theme', (theme) => {
    render(<Gallery theme={theme} />);
    const gallery = screen.getByTestId('gallery');
    expect(gallery.getAttribute('data-theme')).toBe(theme);
    const inside = within(gallery);

    // Button
    expect(inside.getByRole('button', { name: 'Check' }).classList.contains('st-button')).toBe(
      true,
    );
    // Card
    expect(inside.getByRole('heading', { name: 'Next lesson', level: 2 })).toBeTruthy();
    // Progress
    expect(
      inside.getByRole('progressbar', { name: 'Lesson progress' }).getAttribute('aria-valuenow'),
    ).toBe('5');
    // TextInput
    expect(inside.getByRole('textbox', { name: 'Your answer' }).getAttribute('lang')).toBe('de');
    // Choice
    const choice = inside.getByRole('radiogroup', { name: 'Pick the article' });
    expect(within(choice).getAllByRole('radio')).toHaveLength(2);
    fireEvent.click(inside.getByRole('radio', { name: 'einen' }));
    expect(inside.getByRole('radio', { name: 'einen' }).getAttribute('aria-checked')).toBe('true');
    // Toast
    const status = inside
      .getAllByRole('status')
      .find((el) => el.classList.contains('st-toast-region'));
    if (status === undefined) throw new Error('no toast status region');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(inside.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
    fireEvent.click(inside.getByRole('button', { name: 'Save' }));
    expect(within(status).getByText('Saved.')).toBeTruthy();
    expect(within(status).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    // TextArea
    const area = inside.getByRole('textbox', { name: 'Your text' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.getAttribute('lang')).toBe('de');
    expect(inside.getByText('0 / 200')).toBeTruthy();
    // RatingInput
    const rating = inside.getByRole('radiogroup', { name: 'How hard was it?' });
    expect(within(rating).getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(within(rating).getByRole('radio', { name: '4 of 5' }));
    expect(within(rating).getByRole('radio', { name: '4 of 5' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    // Sheet: portalled to the body, carrying the theme of the gallery
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(inside.getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(gallery.contains(sheet)).toBe(false);
    expect(sheet.closest('.st-sheet')?.getAttribute('data-theme')).toBe(theme);
    expect(within(sheet).getByRole('button', { name: 'Settings' })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // FeedbackFab: the P0-21 acceptance check
    const fab = inside.getByRole('button', { name: 'Give feedback' });
    expect(fab.classList.contains('st-feedback-fab')).toBe(true);
    fireEvent.click(fab);
    const feedback = screen.getByRole('dialog', { name: 'Feedback' });
    expect(feedback.closest('.st-sheet')?.getAttribute('data-theme')).toBe(theme);
    expect(within(feedback).getByRole('radiogroup', { name: 'What is it?' })).toBeTruthy();
    expect(within(feedback).getByRole('textbox', { name: 'Tell us what happened' })).toBeTruthy();
    expect(
      within(feedback).getByRole('radiogroup', { name: 'How is Stufen so far?' }),
    ).toBeTruthy();
    expect(within(feedback).getByRole('button', { name: 'Send' })).toBeTruthy();
  });
});
