import clsx from 'clsx';
import type { ChatMessage } from '../types';
import Markdown from './Markdown';
import Spinner from './Spinner';
import ChartImage from './ChartImage';

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      role="article"
      aria-label={isUser ? 'Your message' : 'Assistant message'}
      className={clsx(
        'flex w-full animate-fade-in',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={clsx(
          'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border text-sm',
          isUser
            ? 'bg-brand-600 border-brand-700 text-white rounded-br-sm'
            : 'bg-slate-900 border-slate-800 text-slate-100 rounded-bl-sm',
          message.error && 'border-rose-600/60 bg-rose-950/40',
        )}
      >
        {message.pending ? (
          <Spinner label="Thinking…" />
        ) : isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <>
            <Markdown content={message.content} />
            {message.chartUrl && <ChartImage url={message.chartUrl} />}
          </>
        )}
      </div>
    </div>
  );
}
