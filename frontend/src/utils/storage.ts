import type { ChatMessage } from '../types';

const ACTIVE_FILE_KEY = 'bi_agent_active_file';
const TRANSCRIPTS_KEY = 'bi_agent_transcripts';

export function getActiveFileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_FILE_KEY);
  } catch {
    return null;
  }
}

export function setActiveFileId(fileId: string | null): void {
  try {
    if (fileId) {
      localStorage.setItem(ACTIVE_FILE_KEY, fileId);
    } else {
      localStorage.removeItem(ACTIVE_FILE_KEY);
    }
  } catch {
    /* ignore quota errors */
  }
}

type Transcripts = Record<string, ChatMessage[]>;

function readTranscripts(): Transcripts {
  try {
    const raw = localStorage.getItem(TRANSCRIPTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Transcripts) : {};
  } catch {
    return {};
  }
}

export function getTranscript(fileId: string): ChatMessage[] {
  const all = readTranscripts();
  return all[fileId] ?? [];
}

export function setTranscript(fileId: string, messages: ChatMessage[]): void {
  try {
    const all = readTranscripts();
    all[fileId] = messages;
    localStorage.setItem(TRANSCRIPTS_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota errors */
  }
}

export function clearTranscript(fileId: string): void {
  try {
    const all = readTranscripts();
    delete all[fileId];
    localStorage.setItem(TRANSCRIPTS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
