import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import Spinner from './Spinner';

interface InputBarProps {
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  maxLength?: number;
  onSend: (question: string) => void | Promise<void>;
  onCancel?: () => void;
}

export default function InputBar({
  disabled,
  sending,
  placeholder = 'Ask a question about your data…',
  maxLength = 200,
  onSend,
  onCancel,
}: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const canSend = value.trim().length >= 3 && !disabled && !sending;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    const q = value.trim();
    setValue('');
    onSend(q);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="border-t border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur"
      aria-label="Send message"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
          onKeyDown={onKeyDown}
          placeholder={disabled ? 'Upload a CSV to begin…' : placeholder}
          disabled={disabled}
          rows={1}
          maxLength={maxLength}
          aria-disabled={disabled}
          className={clsx(
            'flex-1 resize-none rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100',
            'placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        />
        {sending && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-200 hover:bg-slate-700"
            aria-label="Cancel"
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className={clsx(
              'shrink-0 rounded-xl px-4 py-3 text-sm font-medium transition',
              canSend
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed',
            )}
            aria-label="Send"
          >
            {sending ? <Spinner size={14} /> : 'Send'}
          </button>
        )}
      </div>
      <div className="mx-auto mt-1 flex max-w-3xl justify-between px-1 text-[10px] text-slate-500">
        <span>Press Enter to send · Shift+Enter for newline</span>
        <span>
          {value.length}/{maxLength}
        </span>
      </div>
    </form>
  );
}
