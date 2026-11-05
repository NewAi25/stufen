// @vitest-environment jsdom
// Acceptance for P0-14: all six components render in light and in dark.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Button,
  Card,
  Choice,
  Progress,
  TextInput,
  THEMES,
  ToastProvider,
  useToast,
} from '../src/index';
import type { Theme } from '../src/index';

afterEach(cleanup);

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
          <Button>Check</Button>
          <SaveButton />
        </Card>
      </ToastProvider>
    </div>
  );
}

describe('gallery', () => {
  it('covers exactly the light and dark themes', () => {
    expect([...THEMES]).toEqual(['light', 'dark']);
  });

  it.each(THEMES)('renders all six components by role in the %s theme', (theme) => {
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
    expect(inside.getByRole('radiogroup', { name: 'Pick the article' })).toBeTruthy();
    expect(inside.getAllByRole('radio')).toHaveLength(2);
    fireEvent.click(inside.getByRole('radio', { name: 'einen' }));
    expect(inside.getByRole('radio', { name: 'einen' }).getAttribute('aria-checked')).toBe('true');
    // Toast
    const status = inside.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(inside.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
    fireEvent.click(inside.getByRole('button', { name: 'Save' }));
    expect(within(status).getByText('Saved.')).toBeTruthy();
    expect(within(status).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });
});
