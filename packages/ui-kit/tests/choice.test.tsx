// @vitest-environment jsdom
import { createRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Choice } from '../src/index';
import type { ChoiceOption, ChoiceProps } from '../src/index';

afterEach(cleanup);

const OPTIONS: ChoiceOption[] = [
  { value: 'berlin', label: 'Er fährt nach Berlin.', lang: 'de' },
  { value: 'bremen', label: 'Er fährt nach Bremen.', lang: 'de' },
  { value: 'home', label: 'Er bleibt zu Hause.', lang: 'de' },
];

function renderChoice(props: Partial<ChoiceProps> = {}) {
  return render(<Choice label="Listen and choose" options={OPTIONS} {...props} />);
}

function radios(): HTMLElement[] {
  return screen.getAllByRole('radio');
}

function radio(index: number): HTMLElement {
  const el = radios()[index];
  if (el === undefined) throw new Error(`No radio at index ${index}`);
  return el;
}

function checked(): string[] {
  return radios().map((el) => el.getAttribute('aria-checked') ?? '');
}

function tabIndexes(): number[] {
  return radios().map((el) => el.tabIndex);
}

/** Text of the elements an option points to with aria-describedby. */
function description(el: HTMLElement): string {
  return (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id !== '')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' | ');
}

describe('Choice roles and names', () => {
  it('is a named radiogroup with one radio per option', () => {
    renderChoice();
    const group = screen.getByRole('radiogroup', { name: 'Listen and choose' });
    expect(group.getAttribute('aria-orientation')).toBe('vertical');
    expect(radios()).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Er fährt nach Berlin.' })).toBe(radio(0));
    expect(screen.getByRole('radio', { name: 'Er bleibt zu Hause.' })).toBe(radio(2));
  });

  it('starts with nothing selected and the first option in the tab order', () => {
    renderChoice();
    expect(checked()).toEqual(['false', 'false', 'false']);
    expect(tabIndexes()).toEqual([0, -1, -1]);
  });

  it('links an option description with aria-describedby', () => {
    renderChoice({
      options: [
        { value: 'zero', label: 'Start from zero', description: 'Begin with A1, Unit 1.' },
        { value: 'placement', label: 'Take placement' },
      ],
    });
    expect(description(radio(0))).toBe('Begin with A1, Unit 1.');
    expect(radio(1).hasAttribute('aria-describedby')).toBe(false);
    expect(screen.getByRole('radio', { name: 'Start from zero' })).toBe(radio(0));
  });

  it('marks option text with its language', () => {
    renderChoice();
    expect(screen.getByText('Er fährt nach Bremen.').getAttribute('lang')).toBe('de');
  });

  it('supports horizontal layout, a caller class name and a ref', () => {
    const ref = createRef<HTMLDivElement>();
    renderChoice({ orientation: 'horizontal', className: 'mine', ref });
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-orientation')).toBe('horizontal');
    expect(group.className.split(' ')).toEqual(['st-choice', 'st-choice--horizontal', 'mine']);
    expect(ref.current).toBe(group);
  });
});

describe('Choice selection', () => {
  it('selects one option at a time on click and reports the value', () => {
    const onChange = vi.fn();
    renderChoice({ onChange });
    fireEvent.click(radio(1));
    expect(checked()).toEqual(['false', 'true', 'false']);
    fireEvent.click(radio(2));
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(onChange.mock.calls).toEqual([['bremen'], ['home']]);
  });

  it('does not report a change when the selected option is clicked again', () => {
    const onChange = vi.fn();
    renderChoice({ onChange, defaultValue: 'bremen' });
    fireEvent.click(radio(1));
    expect(onChange).not.toHaveBeenCalled();
    expect(checked()).toEqual(['false', 'true', 'false']);
  });

  it('starts from defaultValue and puts that option in the tab order', () => {
    renderChoice({ defaultValue: 'home' });
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(tabIndexes()).toEqual([-1, -1, 0]);
  });

  it('follows the parent when controlled', () => {
    function Controlled() {
      const [value, setValue] = useState<string | null>(null);
      return <Choice label="Pick" options={OPTIONS} value={value} onChange={setValue} />;
    }
    render(<Controlled />);
    expect(checked()).toEqual(['false', 'false', 'false']);
    fireEvent.click(radio(0));
    expect(checked()).toEqual(['true', 'false', 'false']);
  });

  it('keeps the controlled value when the parent does not update it', () => {
    const onChange = vi.fn();
    renderChoice({ value: 'berlin', onChange });
    fireEvent.click(radio(2));
    expect(onChange).toHaveBeenCalledWith('home');
    expect(checked()).toEqual(['true', 'false', 'false']);
  });

  it('cannot select a disabled option', () => {
    const onChange = vi.fn();
    renderChoice({
      onChange,
      options: [
        { value: 'de', label: 'German' },
        { value: 'nl', label: 'Dutch', description: 'Coming later', disabled: true },
      ],
    });
    expect(radio(1).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(radio(1));
    expect(onChange).not.toHaveBeenCalled();
    expect(checked()).toEqual(['false', 'false']);
  });
});

describe('Choice arrow keys', () => {
  it('moves down and right to the next option, selects it and focuses it', () => {
    const onChange = vi.fn();
    renderChoice({ onChange });
    radio(0).focus();
    fireEvent.keyDown(radio(0), { key: 'ArrowDown' });
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(document.activeElement).toBe(radio(1));
    fireEvent.keyDown(radio(1), { key: 'ArrowRight' });
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(document.activeElement).toBe(radio(2));
    expect(tabIndexes()).toEqual([-1, -1, 0]);
    expect(onChange.mock.calls).toEqual([['bremen'], ['home']]);
  });

  it('moves up and left to the previous option', () => {
    renderChoice({ defaultValue: 'home' });
    radio(2).focus();
    fireEvent.keyDown(radio(2), { key: 'ArrowUp' });
    expect(checked()).toEqual(['false', 'true', 'false']);
    fireEvent.keyDown(radio(1), { key: 'ArrowLeft' });
    expect(checked()).toEqual(['true', 'false', 'false']);
    expect(document.activeElement).toBe(radio(0));
  });

  it('wraps at both ends', () => {
    renderChoice({ defaultValue: 'home' });
    radio(2).focus();
    fireEvent.keyDown(radio(2), { key: 'ArrowDown' });
    expect(checked()).toEqual(['true', 'false', 'false']);
    expect(document.activeElement).toBe(radio(0));
    fireEvent.keyDown(radio(0), { key: 'ArrowUp' });
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(document.activeElement).toBe(radio(2));
  });

  it('jumps to the first and last option with Home and End', () => {
    renderChoice({ defaultValue: 'bremen' });
    radio(1).focus();
    fireEvent.keyDown(radio(1), { key: 'End' });
    expect(checked()).toEqual(['false', 'false', 'true']);
    fireEvent.keyDown(radio(2), { key: 'Home' });
    expect(checked()).toEqual(['true', 'false', 'false']);
    expect(document.activeElement).toBe(radio(0));
  });

  it('skips a disabled option', () => {
    renderChoice({
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
        { value: 'c', label: 'C' },
      ],
    });
    radio(0).focus();
    fireEvent.keyDown(radio(0), { key: 'ArrowDown' });
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(document.activeElement).toBe(radio(2));
  });

  it('leaves other keys and modified arrows alone', () => {
    const onChange = vi.fn();
    renderChoice({ onChange });
    radio(0).focus();
    fireEvent.keyDown(radio(0), { key: 'a' });
    fireEvent.keyDown(radio(0), { key: 'ArrowDown', ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(checked()).toEqual(['false', 'false', 'false']);
  });
});

describe('Choice number shortcuts', () => {
  it('ignores number keys unless shortcuts is on', () => {
    const onChange = vi.fn();
    renderChoice({ onChange });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(onChange).not.toHaveBeenCalled();
    expect(radio(1).hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('selects the matching option from anywhere on the page', () => {
    const onChange = vi.fn();
    renderChoice({ onChange, shortcuts: true });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(checked()).toEqual(['false', 'true', 'false']);
    fireEvent.keyDown(document.body, { key: '3' });
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(onChange.mock.calls).toEqual([['bremen'], ['home']]);
  });

  it('shows the key on each option and exposes it with aria-keyshortcuts', () => {
    renderChoice({ shortcuts: true });
    expect(radios().map((el) => el.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', '3']);
    const hints = radios().map((el) => el.querySelector('kbd'));
    expect(hints.map((kbd) => kbd?.textContent)).toEqual(['1', '2', '3']);
    expect(hints.every((kbd) => kbd?.getAttribute('aria-hidden') === 'true')).toBe(true);
    // The hint is not part of the accessible name.
    expect(screen.getByRole('radio', { name: 'Er fährt nach Berlin.' })).toBe(radio(0));
  });

  it('moves focus with the selection when focus is already in the group', () => {
    renderChoice({ shortcuts: true });
    radio(0).focus();
    fireEvent.keyDown(radio(0), { key: '3' });
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(document.activeElement).toBe(radio(2));
  });

  it('ignores a number with no matching option, zero, and disabled options', () => {
    const onChange = vi.fn();
    renderChoice({
      onChange,
      shortcuts: true,
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
      ],
    });
    fireEvent.keyDown(document.body, { key: '0' });
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: '9' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores number keys typed into a text field', () => {
    const onChange = vi.fn();
    render(
      <>
        <input aria-label="Answer" />
        <textarea aria-label="Notes" />
        <Choice label="Pick" options={OPTIONS} shortcuts onChange={onChange} />
      </>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Answer' }), { key: '1' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Notes' }), { key: '1' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores number keys with Ctrl, Alt or Meta held', () => {
    const onChange = vi.fn();
    renderChoice({ onChange, shortcuts: true });
    fireEvent.keyDown(document.body, { key: '1', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: '1', altKey: true });
    fireEvent.keyDown(document.body, { key: '1', metaKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores number keys while focus is in a different radiogroup', () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Choice label="First" options={OPTIONS} shortcuts onChange={first} />
        <Choice label="Second" options={OPTIONS} shortcuts onChange={second} />
      </>,
    );
    const secondGroup = screen.getByRole('radiogroup', { name: 'Second' });
    const target = secondGroup.querySelector<HTMLElement>('[role="radio"]');
    if (target === null) throw new Error('No radio in the second group');
    fireEvent.keyDown(target, { key: '2' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('bremen');
  });

  it('stops listening when it unmounts', () => {
    const onChange = vi.fn();
    const { unmount } = renderChoice({ onChange, shortcuts: true });
    unmount();
    fireEvent.keyDown(document.body, { key: '1' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Choice revealed states', () => {
  it('shows nothing about the answer until revealed', () => {
    renderChoice({ defaultValue: 'berlin', correctValue: 'bremen' });
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect(radios().map((el) => el.getAttribute('data-state'))).toEqual([null, null, null]);
    expect(screen.getByRole('radiogroup').hasAttribute('aria-readonly')).toBe(false);
  });

  it('labels the correct option and a wrong selection in words', () => {
    renderChoice({ defaultValue: 'berlin', correctValue: 'bremen', revealed: true });
    expect(radios().map((el) => el.getAttribute('data-state'))).toEqual([
      'incorrect',
      'correct',
      null,
    ]);
    expect(description(radio(0))).toContain('Not quite');
    expect(description(radio(1))).toContain('Correct');
    expect(radio(2).hasAttribute('aria-describedby')).toBe(false);
    expect(radio(0).classList.contains('st-choice__option--incorrect')).toBe(true);
    expect(radio(1).classList.contains('st-choice__option--correct')).toBe(true);
    // Names stay the plain option text. The state is the description.
    expect(screen.getByRole('radio', { name: 'Er fährt nach Berlin.' })).toBe(radio(0));
    expect(checked()).toEqual(['true', 'false', 'false']);
  });

  it('labels only the correct option when the selection was right', () => {
    renderChoice({ defaultValue: 'bremen', correctValue: 'bremen', revealed: true });
    expect(screen.getByText('Correct')).toBeTruthy();
    expect(screen.queryByText('Not quite')).toBeNull();
    expect(radios().map((el) => el.getAttribute('data-state'))).toEqual([null, 'correct', null]);
  });

  it('keeps a description and adds the state after it', () => {
    renderChoice({
      options: [{ value: 'a', label: 'einen', description: 'accusative, masculine' }],
      defaultValue: 'a',
      correctValue: 'a',
      revealed: true,
    });
    expect(description(radio(0))).toBe('accusative, masculine | ✓ Correct');
  });

  it('uses translated state words when given', () => {
    renderChoice({
      defaultValue: 'berlin',
      correctValue: 'bremen',
      revealed: true,
      stateLabels: { correct: 'Richtig', incorrect: 'Nicht ganz' },
    });
    expect(description(radio(0))).toContain('Nicht ganz');
    expect(description(radio(1))).toContain('Richtig');
  });

  it('is read only once revealed: clicks, arrows and number keys do nothing', () => {
    const onChange = vi.fn();
    renderChoice({
      onChange,
      defaultValue: 'berlin',
      correctValue: 'bremen',
      revealed: true,
      shortcuts: true,
    });
    expect(screen.getByRole('radiogroup').getAttribute('aria-readonly')).toBe('true');
    fireEvent.click(radio(2));
    fireEvent.keyDown(radio(0), { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: '3' });
    expect(onChange).not.toHaveBeenCalled();
    expect(checked()).toEqual(['true', 'false', 'false']);
    // Still reachable by Tab so the result can be read.
    expect(tabIndexes()).toEqual([0, -1, -1]);
  });
});

describe('Choice disabled', () => {
  it('marks the group and every option disabled and ignores all input', () => {
    const onChange = vi.fn();
    renderChoice({ onChange, disabled: true, shortcuts: true });
    expect(screen.getByRole('radiogroup').getAttribute('aria-disabled')).toBe('true');
    expect(radios().map((el) => el.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
      'true',
    ]);
    fireEvent.click(radio(1));
    fireEvent.keyDown(radio(0), { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(onChange).not.toHaveBeenCalled();
    expect(checked()).toEqual(['false', 'false', 'false']);
  });

  it('is not marked disabled by default', () => {
    renderChoice();
    expect(screen.getByRole('radiogroup').hasAttribute('aria-disabled')).toBe(false);
    expect(radios().every((el) => !el.hasAttribute('aria-disabled'))).toBe(true);
  });
});
