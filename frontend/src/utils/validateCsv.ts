export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // matches backend MAX_FILE_SIZE

const ALLOWED_EXTENSIONS = ['.csv'];
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  '',
]);

export interface CsvValidationResult {
  ok: boolean;
  message?: string;
}

export function validateCsvFile(file: File): CsvValidationResult {
  if (!file) return { ok: false, message: 'No file selected.' };

  const name = file.name ?? '';
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return { ok: false, message: 'Unsafe file name.' };
  }
  const lower = name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { ok: false, message: 'Only .csv files are allowed.' };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, message: `Unexpected MIME type: ${file.type || 'unknown'}.` };
  }
  if (file.size === 0) {
    return { ok: false, message: 'File is empty.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `File exceeds ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB limit.`,
    };
  }
  return { ok: true };
}
