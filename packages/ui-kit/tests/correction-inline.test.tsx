// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CorrectionInline } from '../src/index';
import type { InlineCorrection } from '../src/index';

afterEach(cleanup);

const TEXT = 'Ich habe gestern ins Kino ging und ich trinke ein Kaffee.';
const CORRECTIONS: InlineCorrection[] = [
  {
    span: 'ging',
    errorType: 'tense',
    correction: 'gegangen',
    note: 'Perfect needs the participle.',
  },
  { span: 'ein Kaffee', errorType: 'case', correction: 'einen Kaffee' },
];

function marks(): HTMLElement[] {
  return screen.getAllByRole('group');
}

describe('CorrectionInline', () => {
  it('keeps the learner text whole and in order, with lang', () => {
    render(<CorrectionInline text={TEXT} corrections={CORRECTIONS} lang="de" />);
    const paragraph = document.querySelector('.st-correction__text');
    expect(paragraph?.getAttribute('lang')).toBe('de');
    const originals = [...document.querySelectorAll('.st-correction__original')].map(
      (el) => el.textContent,
    );
    expect(originals).toEqual(['ging', 'ein Kaffee']);
    expect(paragraph?.textContent?.startsWith('Ich habe gestern ins Kino ging')).toBe(true);
  });

  it('makes each mark reachable by keyboard and names the error type and the correction', () => {
    render(<CorrectionInline text={TEXT} corrections={CORRECTIONS} lang="de" />);
    expect(marks()).toHaveLength(2);
    for (const mark of marks()) expect(mark.tabIndex).toBe(0);
    const tense = screen.getByRole('group', { name: 'Tense. "ging" should be "gegangen".' });
    expect(tense.getAttribute('data-error-type')).toBe('tense');
    expect(
      screen.getByRole('group', { name: 'Case. "ein Kaffee" should be "einen Kaffee".' }),
    ).toBe(marks()[1]);
  });

  it('shows the category and the correction as visible words in the mark', () => {
    render(<CorrectionInline text={TEXT} corrections={CORRECTIONS} />);
    const fix = marks()[0]?.querySelector('.st-correction__fix');
    expect(fix?.textContent).toBe('Tensegegangen');
    expect(marks()[0]?.querySelector('.st-correction__type')?.textContent).toBe('Tense');
  });

  it('lists a note under the text and links the mark to it', () => {
    render(<CorrectionInline text={TEXT} corrections={CORRECTIONS} />);
    const list = screen.getByRole('list', { name: 'Corrections' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    const noteId = marks()[0]?.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(noteId)?.textContent).toBe('Perfect needs the participle.');
    expect(marks()[1]?.getAttribute('aria-describedby')).toBeNull();
  });

  it('lists a correction whose span is not in the text instead of dropping it', () => {
    render(
      <CorrectionInline
        text="Ich bin müde."
        corrections={[{ span: 'bist', errorType: 'other', correction: 'bin' }]}
      />,
    );
    expect(screen.queryByRole('group')).toBeNull();
    const item = within(screen.getByRole('list')).getByRole('listitem');
    expect(item.textContent).toContain('Other');
    expect(item.textContent).toContain('bist');
    expect(item.textContent).toContain('bin');
  });

  it('marks the same span twice at two places', () => {
    render(
      <CorrectionInline
        text="der Frau und der Kind"
        corrections={[
          { span: 'der', errorType: 'article', correction: 'die' },
          { span: 'der', errorType: 'article', correction: 'das' },
        ]}
      />,
    );
    expect(marks().map((mark) => mark.getAttribute('aria-label'))).toEqual([
      'Article. "der" should be "die".',
      'Article. "der" should be "das".',
    ]);
    expect(document.querySelector('.st-correction__text')?.textContent).toBe(
      'derArticledie Frau und derArticledas Kind',
    );
  });

  it('renders plain text without corrections, and takes translated labels', () => {
    const view = render(<CorrectionInline text="Alles gut." corrections={[]} className="mine" />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(document.querySelector('.st-correction')?.className).toBe('st-correction mine');
    view.rerender(
      <CorrectionInline
        text="Ich ging gehen."
        corrections={[{ span: 'ging', errorType: 'tense', correction: '' }]}
        labels={{
          errorTypes: { tense: 'Zeitform' },
          remove: 'streichen',
          mark: ({ span, errorType, correction }) => `${errorType}: ${span}, ${correction}`,
        }}
      />,
    );
    expect(screen.getByRole('group', { name: 'Zeitform: ging, streichen' })).toBeTruthy();
  });
});
