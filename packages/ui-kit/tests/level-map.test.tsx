// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LevelMap } from '../src/index';
import type { LevelMapLevel, LevelMapProps } from '../src/index';

vi.setConfig({ testTimeout: 20_000 });
afterEach(cleanup);

function level(over: Partial<LevelMapLevel> & Pick<LevelMapLevel, 'level'>): LevelMapLevel {
  return {
    status: 'not_started',
    masteredCount: 0,
    totalCount: 50,
    checkpoint: 'locked',
    descriptors: [],
    ...over,
  };
}

const LEVELS: LevelMapLevel[] = [
  level({ level: 'C2' }),
  level({
    level: 'A1',
    status: 'reached',
    masteredCount: 45,
    totalCount: 45,
    checkpoint: 'passed',
  }),
  level({
    level: 'A2',
    status: 'reached',
    masteredCount: 50,
    totalCount: 53,
    checkpoint: 'failed',
  }),
  level({
    level: 'B1',
    status: 'working_towards',
    descriptorText: 'Can understand the main points of clear standard input.',
    masteredCount: 12,
    totalCount: 61,
    checkpoint: 'available',
    descriptors: [
      {
        id: 'de:cando:b1-rea-01',
        code: 'B1.REA.01',
        text: 'Understands the main points of clear standard text',
        skill: 'reading',
        mastered: true,
        evidenceCount: 9,
        exerciseTypes: ['read_answer', 'cloze'],
        bestProductionScore: null,
      },
      {
        id: 'de:cando:b1-wri-01',
        code: 'B1.WRI.01',
        text: 'Writes connected text on familiar topics',
        skill: 'spoken_production',
        mastered: false,
        evidenceCount: 1,
        exerciseTypes: [],
        bestProductionScore: 2,
      },
    ],
  }),
  level({ level: 'B2' }),
  level({ level: 'C1' }),
];

function renderMap(props: Partial<LevelMapProps> = {}) {
  return render(<LevelMap levels={LEVELS} {...props} />);
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Level map' })).getAllByRole('listitem');
}

function toggle(levelName: string): HTMLElement {
  const el = screen
    .getAllByRole('button')
    .find((button) => button.closest('li')?.getAttribute('data-level') === levelName);
  if (el === undefined || !el.classList.contains('st-level-map__toggle')) {
    throw new Error(`no toggle for ${levelName}`);
  }
  return el;
}

describe('LevelMap ladder', () => {
  it('renders the ladder A1 to C2 whatever order the levels arrive in', () => {
    renderMap();
    expect(rows().map((row) => row.getAttribute('data-level'))).toEqual([
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
    ]);
  });

  it('can list C2 first', () => {
    renderMap({ order: 'descending' });
    expect(rows()[0]?.getAttribute('data-level')).toBe('C2');
    expect(rows()[5]?.getAttribute('data-level')).toBe('A1');
  });

  it('says the status in words and shows the badge, the count and a progress bar', () => {
    renderMap();
    expect(toggle('A1').textContent).toContain('Reached');
    expect(toggle('B1').textContent).toContain('Working towards B1');
    expect(toggle('C2').textContent).toContain('Not started');
    expect(toggle('B1').textContent).toContain('12 of 61 mastered');
    expect(within(toggle('B1')).getByRole('img', { name: 'Level B1' })).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'B1 progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('12');
    expect(bar.getAttribute('aria-valuemax')).toBe('61');
    expect(bar.getAttribute('aria-valuetext')).toBe('12 of 61 mastered');
  });

  it('puts each toggle in a heading and opens the level being worked towards', () => {
    renderMap({ headingLevel: 4 });
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(6);
    expect(toggle('B1').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('A1').getAttribute('aria-expanded')).toBe('false');
    expect(toggle('A1').getAttribute('aria-controls')).toBeNull();
  });
});

describe('LevelMap expanded level', () => {
  it('expands and collapses with a button that carries aria-expanded', () => {
    renderMap();
    const a1 = toggle('A1');
    fireEvent.click(a1);
    expect(a1.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(a1.getAttribute('aria-controls') ?? '');
    expect(panel?.textContent).toContain('Checkpoint passed.');
    fireEvent.click(a1);
    expect(a1.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-level="A1"] .st-level-map__panel')).toBeNull();
    // B1 stays open: levels open and close on their own.
    expect(toggle('B1').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the official descriptor text beside the evidence table', () => {
    renderMap({ lang: 'de' });
    const columns = document.querySelector('[data-level="B1"] .st-level-map__columns');
    const official = columns?.querySelector('.st-level-map__official-text');
    expect(official?.textContent).toBe('Can understand the main points of clear standard input.');
    expect(official?.getAttribute('lang')).toBe('de');
    expect(columns?.querySelector('table')).toBeTruthy();
    expect(screen.getByText('What this level means')).toBeTruthy();
  });

  it('lists attempts, exercise types and the best production score per descriptor', () => {
    renderMap();
    const table = screen.getByRole('table', { name: 'Evidence for B1' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((el) => el.textContent),
    ).toEqual(['Can do', 'Skill', 'State', 'Attempts', 'Exercise types', 'Best production score']);
    const [reading, writing] = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(reading).toEqual(['reading', '✓ Mastered', '9 attempts', 'read answer, cloze', 'None']);
    expect(writing).toEqual([
      'spoken production',
      'In progress',
      '1 attempt',
      'None yet',
      'best 2 of 5',
    ]);
    expect(
      within(table).getByRole('rowheader', {
        name: 'B1.REA.01 Understands the main points of clear standard text',
      }),
    ).toBeTruthy();
  });

  it('says so when a level has no descriptors', () => {
    renderMap({ defaultExpanded: ['C2'] });
    expect(toggle('B1').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('No can do statements for this level yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('LevelMap checkpoint', () => {
  it('enables the checkpoint button only when the checkpoint is available', () => {
    const onStartCheckpoint = vi.fn();
    renderMap({ onStartCheckpoint, defaultExpanded: ['A1', 'A2', 'B1', 'B2'] });
    const b1 = screen.getByRole<HTMLButtonElement>('button', { name: 'Take B1 checkpoint' });
    expect(b1.disabled).toBe(false);
    fireEvent.click(b1);
    expect(onStartCheckpoint).toHaveBeenCalledTimes(1);
    expect(onStartCheckpoint).toHaveBeenCalledWith('B1');

    const locked = screen.getByRole<HTMLButtonElement>('button', { name: 'Take B2 checkpoint' });
    expect(locked.disabled).toBe(true);
    expect(screen.getByText('The checkpoint is not open yet.')).toBeTruthy();

    const failed = screen.getByRole<HTMLButtonElement>('button', { name: 'Take A2 checkpoint' });
    expect(failed.disabled).toBe(true);
    expect(screen.getByText('Checkpoint not passed.')).toBeTruthy();

    expect(screen.queryByRole('button', { name: 'Take A1 checkpoint' })).toBeNull();
    expect(screen.getByText('Checkpoint passed.')).toBeTruthy();
    fireEvent.click(locked);
    fireEvent.click(failed);
    expect(onStartCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('takes translated labels and names for ids', () => {
    renderMap({
      className: 'mine',
      labels: {
        map: 'Stufen',
        reached: 'Erreicht',
        workingTowards: (name) => `Auf dem Weg zu ${name}`,
        takeCheckpoint: (name) => `${name} Checkpoint machen`,
        names: { reading: 'Lesen', read_answer: 'Lesen und antworten' },
      },
    });
    expect(screen.getByRole('list', { name: 'Stufen' }).className).toBe('st-level-map mine');
    expect(toggle('A1').textContent).toContain('Erreicht');
    expect(toggle('B1').textContent).toContain('Auf dem Weg zu B1');
    expect(screen.getByRole('button', { name: 'B1 Checkpoint machen' })).toBeTruthy();
    expect(screen.getByText('Lesen')).toBeTruthy();
    expect(screen.getByText('Lesen und antworten, cloze')).toBeTruthy();
  });
});
