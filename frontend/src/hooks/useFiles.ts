import { useCallback, useEffect, useState } from 'react';
import { listFiles } from '../api/endpoints';
import { toApiError } from '../api/client';
import type { FileEntry } from '../types';

export function useFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFiles(signal);
      const sorted = [...data].sort(
        (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
      );
      setFiles(sorted);
    } catch (err) {
      if ((err as { name?: string })?.name === 'CanceledError') return;
      setError(toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    refresh(ctrl.signal);
    return () => ctrl.abort();
  }, [refresh]);

  const addFileOptimistic = useCallback((entry: FileEntry) => {
    setFiles((prev) => {
      if (prev.some((f) => f.file_id === entry.file_id)) return prev;
      return [entry, ...prev];
    });
  }, []);

  return { files, loading, error, refresh, addFileOptimistic };
}
