// @vitest-environment jsdom
import { createRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextArea } from '../src/components/TextArea';

afterEach(cleanup);

function area(name: string): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name });
}

describe('TextArea', () => {
  it('renders a textarea linked to its visible label', () => {
    render(<TextArea label="Message" />);
    const el = area('Message');
    const label = screen.getByText('Message');
    expect(el.tagName).toBe('TEXTAREA');
    expect(label.tagName).toBe('LABEL');
    expect(label.getAttribute('for')).toBe(el.id);
    expect(el.rows).toBe(4);
  });

  it('uses a caller id when given and gives two areas different ids', () => {
    render(
      <>
        <TextArea label="First" id="first-area" />
        <TextArea label="Second" />
      </>,
    );
    expect(area('First').id).toBe('first-area');
    expect(area('Second').id).not.toBe('');
    expect(area('Second').id).not.toBe('first-area');
  });

  it('has no description, count or error by default', () => {
    render(<TextArea label="Message" />);
    expect(area('Message').hasAttribute('aria-describedby')).toBe(false);
    expect(area('Message').hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('links the hint with aria-describedby', () => {
    render(<TextArea label="Message" hint="Say what happened." />);
    const hint = screen.getByText('Say what happened.');
    expect(area('Message').getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('links the error, sets aria-invalid and announces it', () => {
    render(<TextArea label="Message" error="Write a message." />);
    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('Write a message.');
    expect(area('Message').getAttribute('aria-describedby')).toBe(error.id);
    expect(area('Message').getAttribute('aria-invalid')).toBe('true');
  });

  it('links a caller description, hint, count and error together', () => {
    render(
      <TextArea
        label="Message"
        hint="Hint text"
        error="Error text"
        maxLength={100}
        aria-describedby="outside"
      />,
    );
    const hintId = screen.getByText('Hint text').id;
    const countId = screen.getByText('0 / 100').id;
    const errorId = screen.getByText('Error text').id;
    expect(area('Message').getAttribute('aria-describedby')).toBe(
      `outside ${hintId} ${countId} ${errorId}`,
    );
  });

  it('passes maxLength to the textarea and shows the count', () => {
    render(<TextArea label="Message" maxLength={100} defaultValue="Hallo" />);
    expect(area('Message').maxLength).toBe(100);
    expect(screen.getByText('5 / 100')).toBeTruthy();
  });

  it('updates the count as an uncontrolled area changes', () => {
    const onChange = vi.fn();
    render(<TextArea label="Message" maxLength={100} onChange={onChange} />);
    fireEvent.change(area('Message'), { target: { value: 'Guten Tag' } });
    expect(area('Message').value).toBe('Guten Tag');
    expect(screen.getByText('9 / 100')).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('follows a controlled value', () => {
    function Controlled() {
      const [value, setValue] = useState('ab');
      return (
        <TextArea
          label="Message"
          maxLength={100}
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
        />
      );
    }
    render(<Controlled />);
    expect(screen.getByText('2 / 100')).toBeTruthy();
    fireEvent.change(area('Message'), { target: { value: 'abcd' } });
    expect(area('Message').value).toBe('ABCD');
    expect(screen.getByText('4 / 100')).toBeTruthy();
  });

  it('keeps the polite region empty until the text is within 10 percent of the limit', () => {
    render(<TextArea label="Message" maxLength={100} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');

    fireEvent.change(area('Message'), { target: { value: 'x'.repeat(89) } });
    expect(status.textContent).toBe('');
    expect(screen.getByText('89 / 100').classList.contains('st-textarea__count--near')).toBe(false);

    fireEvent.change(area('Message'), { target: { value: 'x'.repeat(90) } });
    expect(status.textContent).toBe('10 characters left');
    expect(screen.getByText('90 / 100').classList.contains('st-textarea__count--near')).toBe(true);

    fireEvent.change(area('Message'), { target: { value: 'x'.repeat(99) } });
    expect(status.textContent).toBe('1 character left');

    fireEvent.change(area('Message'), { target: { value: 'x'.repeat(100) } });
    expect(status.textContent).toBe('0 characters left');

    fireEvent.change(area('Message'), { target: { value: 'short' } });
    expect(status.textContent).toBe('');
  });

  it('takes the announced words from remainingLabel', () => {
    render(
      <TextArea
        label="Nachricht"
        maxLength={20}
        defaultValue={'x'.repeat(19)}
        remainingLabel={(remaining, max) => `Noch ${remaining} von ${max} Zeichen`}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Noch 1 von 20 Zeichen');
  });

  it('forwards the ref and native props to the textarea, and className to the wrapper', () => {
    const ref = createRef<HTMLTextAreaElement>();
    const { container } = render(
      <TextArea
        label="Message"
        ref={ref}
        rows={6}
        lang="de"
        placeholder="Was ist passiert?"
        className="mine"
        inputClassName="inner"
        disabled
      />,
    );
    const el = area('Message');
    expect(ref.current).toBe(el);
    expect(el.rows).toBe(6);
    expect(el.getAttribute('lang')).toBe('de');
    expect(el.placeholder).toBe('Was ist passiert?');
    expect(el.disabled).toBe(true);
    expect(el.className.split(' ')).toEqual(['st-input__control', 'st-textarea__control', 'inner']);
    expect(container.firstElementChild?.className.split(' ')).toEqual([
      'st-input',
      'st-textarea',
      'mine',
    ]);
  });
});
