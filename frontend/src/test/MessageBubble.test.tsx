import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from '../components/MessageBubble';
import type { ChatMessage } from '../types';

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'x',
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    ...over,
  };
}

describe('<MessageBubble />', () => {
  it('renders a user message as plain text', () => {
    render(<MessageBubble message={msg({ role: 'user', content: 'Hi there' })} />);
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('renders assistant markdown content', () => {
    render(
      <MessageBubble
        message={msg({ role: 'assistant', content: '**bold** text' })}
      />,
    );
    expect(screen.getByText('bold').tagName.toLowerCase()).toBe('strong');
  });

  it('shows a spinner when pending', () => {
    render(<MessageBubble message={msg({ role: 'assistant', pending: true })} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('strips dangerous HTML via sanitizer', () => {
    render(
      <MessageBubble
        message={msg({
          role: 'assistant',
          content: '<img src=x onerror=alert(1)>ok',
        })}
      />,
    );
    // The onerror attribute should be removed by DOMPurify.
    const img = document.querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull();
  });
});
