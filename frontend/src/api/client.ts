import axios, { AxiosError, AxiosHeaders } from 'axios';
import type { ApiError } from '../types';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
  headers: {
    Accept: 'application/json',
  },
  // Backend has no cookie-auth today; keep false so CORS stays simple.
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  // Ensure JSON POSTs have correct header without overriding multipart.
  if (config.data && !(config.data instanceof FormData)) {
    const headers = AxiosHeaders.from(config.headers);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    config.headers = headers;
  }
  return config;
});

export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<{ detail?: string | Array<{ msg?: string }> }>;
    const data = ax.response?.data;
    let message =
      typeof data?.detail === 'string'
        ? data.detail
        : Array.isArray(data?.detail)
          ? data.detail.map((d) => d?.msg).filter(Boolean).join('; ') || ax.message
          : ax.message;

    if (ax.code === 'ECONNABORTED') message = 'The request timed out. Please try again.';
    if (ax.code === 'ERR_NETWORK') message = 'Cannot reach the server. Is the backend running?';
    if (ax.response?.status === 429) message = 'Rate limit reached — please wait a minute.';
    if (ax.response?.status === 413) message = 'File too large (limit is 5 MB).';
    return { status: ax.response?.status, message };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: 'Unknown error' };
}
