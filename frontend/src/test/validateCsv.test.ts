import { describe, it, expect } from 'vitest';
import { validateCsvFile, MAX_FILE_SIZE_BYTES } from '../utils/validateCsv';

function makeFile(
  name: string,
  size: number,
  type = 'text/csv',
): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe('validateCsvFile', () => {
  it('accepts a valid small .csv', () => {
    expect(validateCsvFile(makeFile('data.csv', 1024))).toEqual({ ok: true });
  });

  it('rejects non-csv extensions', () => {
    const res = validateCsvFile(makeFile('data.txt', 1024, 'text/plain'));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/csv/i);
  });

  it('rejects path-traversal characters in names', () => {
    const res = validateCsvFile(makeFile('../evil.csv', 100));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/unsafe/i);
  });

  it('rejects files over 5 MB', () => {
    const res = validateCsvFile(makeFile('big.csv', MAX_FILE_SIZE_BYTES + 1));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/5mb/i);
  });

  it('rejects empty files', () => {
    const res = validateCsvFile(makeFile('empty.csv', 0));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/empty/i);
  });
});
