// @vitest-environment jsdom
import { createRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextInput } from '../src/index';

afterEach(cleanup);

function input(name: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('textbox', { name });
}

describe('TextInput', () => {
  it('links the visible label to the input with htmlFor and id', () => {
    render(<TextInput label="Your answer" />);
    const el = input('Your answer');
    const label = screen.getByText('Your answer');
    expect(label.tagName).toBe('LABEL');
    expect(el.id).not.toBe('');
    expect(label.getAttribute('for')).toBe(el.id);
    expect(screen.getByLabelText('Your answer')).toBe(el);
  });

  it('gives two inputs different ids', () => {
    render(
      <>
        <TextInput label="First" />
        <TextInput label="Second" />
      </>,
    );
    expect(input('First').id).not.toBe(input('Second').id);
  });

  it('uses a caller id when given', () => {
    render(<TextInput label="Name" id="profile-name" />);
    expect(input('Name').id).toBe('profile-name');
    expect(screen.getByText('Name').getAttribute('for')).toBe('profile-name');
  });

  it('has no description and is not invalid by default', () => {
    render(<TextInput label="Name" />);
    expect(input('Name').hasAttribute('aria-describedby')).toBe(false);
    expect(input('Name').hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links the hint with aria-describedby', () => {
    render(<TextInput label="Name" hint="As you want to be greeted." />);
    const hint = screen.getByText('As you want to be greeted.');
    expect(hint.id).not.toBe('');
    expect(input('Name').getAttribute('aria-describedby')).toBe(hint.id);
    expect(input('Name').hasAttribute('aria-invalid')).toBe(false);
  });

  it('links the error, sets aria-invalid and announces it', () => {
    render(<TextInput label="Name" error="Enter a name." />);
    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('Enter a name.');
    expect(error.id).not.toBe('');
    expect(input('Name').getAttribute('aria-describedby')).toBe(error.id);
    expect(input('Name').getAttribute('aria-invalid')).toBe('true');
  });

  it('links hint, error and a caller description together', () => {
    render(
      <TextInput label="Name" hint="Hint text" error="Error text" aria-describedby="outside" />,
    );
    const hintId = screen.getByText('Hint text').id;
    const errorId = screen.getByText('Error text').id;
    expect(hintId).not.toBe(errorId);
    expect(input('Name').getAttribute('aria-describedby')).toBe(`outside ${hintId} ${errorId}`);
  });

  it('passes lang through for German input', () => {
    render(<TextInput label="Antwort" lang="de" />);
    expect(input('Antwort').getAttribute('lang')).toBe('de');
  });

  it('works uncontrolled with defaultValue', () => {
    const onChange = vi.fn();
    render(<TextInput label="Answer" defaultValue="ein" onChange={onChange} />);
    const el = input('Answer');
    expect(el.value).toBe('ein');
    fireEvent.change(el, { target: { value: 'einen' } });
    expect(el.value).toBe('einen');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('works controlled with value and onChange', () => {
    function Controlled() {
      const [value, setValue] = useState('ein');
      return (
        <TextInput
          label="Answer"
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
        />
      );
    }
    render(<Controlled />);
    const el = input('Answer');
    expect(el.value).toBe('ein');
    fireEvent.change(el, { target: { value: 'einen' } });
    expect(el.value).toBe('EINEN');
  });

  it('stays at the controlled value when the parent does not update it', () => {
    render(<TextInput label="Answer" value="fixed" onChange={() => undefined} />);
    const el = input('Answer');
    fireEvent.change(el, { target: { value: 'changed' } });
    expect(el.value).toBe('fixed');
  });

  it('forwards the ref and native props to the input, and className to the wrapper', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <TextInput
        label="Email"
        ref={ref}
        type="email"
        placeholder="you@example.org"
        className="mine"
        inputClassName="inner"
        disabled
      />,
    );
    const el = input('Email');
    expect(ref.current).toBe(el);
    expect(el.type).toBe('email');
    expect(el.placeholder).toBe('you@example.org');
    expect(el.disabled).toBe(true);
    expect(el.className.split(' ')).toEqual(['st-input__control', 'inner']);
    expect(container.firstElementChild?.className.split(' ')).toEqual(['st-input', 'mine']);
  });
});
