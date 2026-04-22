import { useCallback, useEffect, useRef, useState } from 'react';
import { sendChat } from '../api/endpoints';
import { toApiError } from '../api/client';
import type { ChatMessage } from '../types';
import { getTranscript, setTranscript } from '../utils/storage';

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useChat(fileId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    fileId ? getTranscript(fileId) : [],
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load transcript when active file changes
  useEffect(() => {
    setError(null);
    setMessages(fileId ? getTranscript(fileId) : []);
  }, [fileId]);

  // Persist transcript
  useEffect(() => {
    if (fileId) setTranscript(fileId, messages);
  }, [fileId, messages]);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!fileId) {
        setError('Upload a CSV first.');
        return;
      }
      if (trimmed.length < 3) {
        setError('Question is too short (min 3 characters).');
        return;
      }
      if (trimmed.length > 200) {
        setError('Question is too long (max 200 characters).');
        return;
      }

      setError(null);
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      const placeholder: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, placeholder]);
      setSending(true);

      try {
        const res = await sendChat(fileId, trimmed, ctrl.signal);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? {
                  ...m,
                  pending: false,
                  content: res.ai_answer ?? '',
                  chartUrl: res.chartUrl ?? undefined,
                }
              : m,
          ),
        );
      } catch (err) {
        if ((err as { name?: string })?.name === 'CanceledError') {
          setMessages((prev) => prev.filter((m) => m.id !== placeholder.id));
          return;
        }
        const apiErr = toApiError(err);
        setError(apiErr.message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id
              ? {
                  ...m,
                  pending: false,
                  error: true,
                  content: `**Error:** ${apiErr.message}`,
                }
              : m,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [fileId],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, sending, error, send, cancel, clear };
}
