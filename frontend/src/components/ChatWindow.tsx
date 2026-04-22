import { useEffect, useRef } from 'react';
import type { ChatMessage, FileEntry } from '../types';
import MessageBubble from './MessageBubble';
import EmptyState from './EmptyState';

interface ChatWindowProps {
  messages: ChatMessage[];
  activeFile?: FileEntry | null;
  onToggleSidebar: () => void;
}

export default function ChatWindow({
  messages,
  activeFile,
  onToggleSidebar,
}: ChatWindowProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Conversation">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 md:hidden"
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-100">
              {activeFile?.original_name ?? 'No file selected'}
            </h2>
            <p className="text-[11px] text-slate-500">
              {activeFile ? `file_id: ${activeFile.file_id}` : 'Upload a CSV to get started'}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        {!activeFile ? (
          <EmptyState
            title="Upload a CSV to begin"
            description="Then ask questions like 'what is the average price?' or 'plot sales by region'."
          />
        ) : messages.length === 0 ? (
          <EmptyState
            title={`Ready to analyze ${activeFile.original_name}`}
            description="Ask about totals, averages, trends, or say “plot …” for a chart."
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </section>
  );
}
