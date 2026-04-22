import { API_BASE_URL } from '../api/client';

/**
 * Backend returns chart URLs as either absolute (http://host/static/x.png)
 * or relative (/static/x.png). Normalize to an absolute URL we can <img src>.
 */
export function resolveChartUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${base}${path}`;
}

/** Reject chart URLs that are not same-origin with our API (defense-in-depth). */
export function isAllowedChartUrl(rawUrl: string): boolean {
  try {
    const resolved = resolveChartUrl(rawUrl);
    const u = new URL(resolved);
    const base = new URL(API_BASE_URL);
    return u.origin === base.origin && u.pathname.startsWith('/static/');
  } catch {
    return false;
  }
}
