// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RatingInput } from '../src/components/RatingInput';

// Role queries are slow in jsdom, and slower still while other boxes build on
// the same machine. The default 5 s is too tight for the first test in a file.
vi.setConfig({ testTimeout: 20_000 });

afterEach(cleanup);

function radio(name: string): HTMLElement {
  return screen.getByRole('radio', { name });
}

function checkedNames(): string[] {
  return screen
    .getAllByRole('radio')
    .filter((el) => el.getAttribute('aria-checked') === 'true')
    .map((el) => el.getAttribute('aria-label') ?? '');
}

describe('RatingInput', () => {
  it('is a radiogroup named by its visible label with options 1 to 5', () => {
    render(<RatingInput label="How is it so far?" />);
    const group = screen.getByRole('radiogroup', { name: 'How is it so far?' });
    expect(group.classList.contains('st-rating__options')).toBe(true);
    expect(screen.getByText('How is it so far?').tagName).toBe('SPAN');
    const names = screen.getAllByRole('radio').map((el) => el.getAttribute('aria-label'));
    expect(names).toEqual(['1 of 5', '2 of 5', '3 of 5', '4 of 5', '5 of 5']);
    expect(checkedNames()).toEqual([]);
  });

  it('renders 1 to max and clamps max to 2 to 9', () => {
    const { rerender } = render(<RatingInput label="Score" max={7} />);
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(radio('7 of 7')).toBeTruthy();
    rerender(<RatingInput label="Score" max={40} />);
    expect(screen.getAllByRole('radio')).toHaveLength(9);
    rerender(<RatingInput label="Score" max={0} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('takes option names from optionLabel', () => {
    render(<RatingInput label="Note" max={3} optionLabel={(v, m) => `${v} von ${m}`} />);
    expect(radio('2 von 3')).toBeTruthy();
  });

  it('selects on click and reports the value', () => {
    const onChange = vi.fn();
    render(<RatingInput label="Score" onChange={onChange} />);
    fireEvent.click(radio('4 of 5'));
    expect(checkedNames()).toEqual(['4 of 5']);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
    fireEvent.click(radio('4 of 5'));
    expect(checkedNames()).toEqual(['4 of 5']);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('starts from defaultValue and puts only the selected option in the tab order', () => {
    render(<RatingInput label="Score" defaultValue={3} />);
    expect(checkedNames()).toEqual(['3 of 5']);
    const tabbable = screen.getAllByRole('radio').filter((el) => el.tabIndex === 0);
    expect(tabbable).toEqual([radio('3 of 5')]);
  });

  it('puts the first option in the tab order when nothing is selected', () => {
    render(<RatingInput label="Score" />);
    const tabbable = screen.getAllByRole('radio').filter((el) => el.tabIndex === 0);
    expect(tabbable).toEqual([radio('1 of 5')]);
  });

  it('moves and selects with the arrow keys, wrapping at both ends', () => {
    const onChange = vi.fn();
    render(<RatingInput label="Score" defaultValue={4} onChange={onChange} />);
    radio('4 of 5').focus();
    fireEvent.keyDown(radio('4 of 5'), { key: 'ArrowRight' });
    expect(checkedNames()).toEqual(['5 of 5']);
    expect(document.activeElement).toBe(radio('5 of 5'));
    fireEvent.keyDown(radio('5 of 5'), { key: 'ArrowDown' });
    expect(checkedNames()).toEqual(['1 of 5']);
    expect(document.activeElement).toBe(radio('1 of 5'));
    fireEvent.keyDown(radio('1 of 5'), { key: 'ArrowLeft' });
    expect(checkedNames()).toEqual(['5 of 5']);
    fireEvent.keyDown(radio('5 of 5'), { key: 'ArrowUp' });
    expect(checkedNames()).toEqual(['4 of 5']);
    expect(onChange.mock.calls.map(([v]) => v as number)).toEqual([5, 1, 5, 4]);
  });

  it('jumps to the ends with Home and End', () => {
    render(<RatingInput label="Score" defaultValue={3} />);
    fireEvent.keyDown(radio('3 of 5'), { key: 'End' });
    expect(checkedNames()).toEqual(['5 of 5']);
    fireEvent.keyDown(radio('5 of 5'), { key: 'Home' });
    expect(checkedNames()).toEqual(['1 of 5']);
    expect(document.activeElement).toBe(radio('1 of 5'));
  });

  it('selects with the number keys and ignores numbers above max', () => {
    const onChange = vi.fn();
    render(<RatingInput label="Score" onChange={onChange} />);
    fireEvent.keyDown(radio('1 of 5'), { key: '4' });
    expect(checkedNames()).toEqual(['4 of 5']);
    expect(document.activeElement).toBe(radio('4 of 5'));
    fireEvent.keyDown(radio('4 of 5'), { key: '7' });
    expect(checkedNames()).toEqual(['4 of 5']);
    fireEvent.keyDown(radio('4 of 5'), { key: '2', ctrlKey: true });
    expect(checkedNames()).toEqual(['4 of 5']);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows the low and high labels and links them to the end options', () => {
    render(<RatingInput label="Score" lowLabel="Poor" highLabel="Great" />);
    const low = screen.getByText('Poor');
    const high = screen.getByText('Great');
    expect(radio('1 of 5').getAttribute('aria-describedby')).toBe(low.id);
    expect(radio('5 of 5').getAttribute('aria-describedby')).toBe(high.id);
    expect(radio('3 of 5').hasAttribute('aria-describedby')).toBe(false);
  });

  it('has no scale row without low and high labels', () => {
    const { container } = render(<RatingInput label="Score" />);
    expect(container.querySelector('.st-rating__scale')).toBeNull();
    expect(radio('1 of 5').hasAttribute('aria-describedby')).toBe(false);
  });

  it('does not clear by default', () => {
    render(<RatingInput label="Score" defaultValue={2} />);
    fireEvent.click(radio('2 of 5'));
    fireEvent.keyDown(radio('2 of 5'), { key: 'Backspace' });
    fireEvent.keyDown(radio('2 of 5'), { key: '0' });
    expect(checkedNames()).toEqual(['2 of 5']);
  });

  it('clears with a second click, Backspace, Delete or 0 when allowClear is set', () => {
    const onChange = vi.fn();
    render(<RatingInput label="Score" allowClear defaultValue={2} onChange={onChange} />);
    fireEvent.click(radio('2 of 5'));
    expect(checkedNames()).toEqual([]);
    expect(onChange).toHaveBeenLastCalledWith(null);
    for (const key of ['Backspace', 'Delete', '0']) {
      fireEvent.click(radio('3 of 5'));
      expect(checkedNames()).toEqual(['3 of 5']);
      fireEvent.keyDown(radio('3 of 5'), { key });
      expect(checkedNames()).toEqual([]);
      expect(document.activeElement).toBe(radio('1 of 5'));
    }
  });

  it('follows a controlled value, where null means nothing selected', () => {
    function Controlled() {
      const [value, setValue] = useState<number | null>(null);
      return (
        <>
          <RatingInput label="Score" value={value} onChange={setValue} allowClear />
          <output>{value === null ? 'none' : `picked ${value}`}</output>
        </>
      );
    }
    render(<Controlled />);
    expect(screen.getByText('none')).toBeTruthy();
    fireEvent.click(radio('5 of 5'));
    expect(screen.getByText('picked 5')).toBeTruthy();
    expect(checkedNames()).toEqual(['5 of 5']);
    fireEvent.click(radio('5 of 5'));
    expect(screen.getByText('none')).toBeTruthy();
  });

  it('links hint, error and a caller description, and marks invalid and required', () => {
    render(
      <RatingInput
        label="Score"
        id="score"
        hint="One is low."
        error="Pick a rating."
        required
        aria-describedby="outside"
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Score' });
    expect(group.id).toBe('score');
    expect(group.getAttribute('aria-describedby')).toBe('outside score-hint score-error');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(group.getAttribute('aria-required')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Pick a rating.');
    expect(screen.getByText('One is low.').id).toBe('score-hint');
  });

  it('blocks every change when disabled but keeps options focusable', () => {
    const onChange = vi.fn();
    render(<RatingInput label="Score" disabled defaultValue={2} onChange={onChange} />);
    fireEvent.click(radio('4 of 5'));
    fireEvent.keyDown(radio('2 of 5'), { key: 'ArrowRight' });
    fireEvent.keyDown(radio('2 of 5'), { key: '5' });
    expect(checkedNames()).toEqual(['2 of 5']);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radiogroup').getAttribute('aria-disabled')).toBe('true');
    expect(radio('2 of 5').hasAttribute('disabled')).toBe(false);
  });

  it('puts className on the wrapper and native props on the group', () => {
    const { container } = render(<RatingInput label="Score" className="mine" data-testid="g" />);
    expect(container.firstElementChild?.className.split(' ')).toEqual(['st-rating', 'mine']);
    expect(screen.getByTestId('g').getAttribute('role')).toBe('radiogroup');
  });
});
