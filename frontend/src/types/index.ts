export interface UploadResponse {
  status: string;
  file_id: string;
  info: {
    name: string;
    total_rows: number;
  };
}

export interface FileEntry {
  file_id: string;
  original_name: string;
  created_at: number;
}

export interface ChatResponse {
  ai_answer: string;
  history_depth?: number;
  chart_url?: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  chartUrl?: string;
  createdAt: number;
  error?: boolean;
  pending?: boolean;
}

export interface ApiError {
  status?: number;
  message: string;
}

export type UploadStatus =
  | { state: 'idle' }
  | { state: 'validating' }
  | { state: 'uploading'; progress: number }
  | { state: 'success'; file: UploadResponse }
  | { state: 'error'; message: string };
