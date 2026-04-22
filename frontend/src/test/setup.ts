import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // Node 25 exposes a native experimental localStorage that can shadow jsdom's
  // inside vitest. Reach through window (which is always jsdom's) and guard.
  try {
    window.localStorage?.clear?.();
  } catch {
    /* ignore if unavailable */
  }
});
