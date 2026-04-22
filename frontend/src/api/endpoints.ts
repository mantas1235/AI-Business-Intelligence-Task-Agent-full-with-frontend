import { api } from './client';
import type { ChatResponse, FileEntry, UploadResponse } from '../types';

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export async function uploadCsv(file: File, opts: UploadOptions = {}): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await api.post<UploadResponse>('/upload-csv', form, {
    signal: opts.signal,
    onUploadProgress: (evt) => {
      if (!opts.onProgress || !evt.total) return;
      opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
    },
  });
  return res.data;
}

export async function listFiles(signal?: AbortSignal): Promise<FileEntry[]> {
  const res = await api.get<FileEntry[]>('/files', { signal });
  return res.data;
}

export async function sendChat(
  fileId: string,
  question: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const res = await api.post<ChatResponse>(
    '/chat',
    { file_id: fileId, question },
    { signal },
  );
  return res.data;
}
