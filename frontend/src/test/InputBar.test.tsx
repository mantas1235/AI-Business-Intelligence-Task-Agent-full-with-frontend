import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InputBar from '../components/InputBar';

describe('<InputBar />', () => {
  it('disables send while under 3 chars', async () => {
    const onSend = vi.fn();
    render(<InputBar onSend={onSend} />);
    const send = screen.getByRole('button', { name: /send/i });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Message'), 'hi');
    expect(send).toBeDisabled();
  });

  it('sends a valid question and clears the input', async () => {
    const onSend = vi.fn();
    render(<InputBar onSend={onSend} />);
    const input = screen.getByLabelText('Message') as HTMLTextAreaElement;
    await userEvent.type(input, 'what is the total?');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSend).toHaveBeenCalledWith('what is the total?');
    expect(input.value).toBe('');
  });

  it('submits on Enter but not on Shift+Enter', async () => {
    const onSend = vi.fn();
    render(<InputBar onSend={onSend} />);
    const input = screen.getByLabelText('Message');
    await userEvent.type(input, 'average price');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalled();
  });

  it('renders placeholder for disabled state', () => {
    render(<InputBar onSend={() => {}} disabled />);
    expect(screen.getByPlaceholderText(/upload a csv/i)).toBeInTheDocument();
  });
});
