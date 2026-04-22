import { useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { uploadCsv } from '../api/endpoints';
import { toApiError } from '../api/client';
import { validateCsvFile } from '../utils/validateCsv';
import type { UploadResponse, UploadStatus } from '../types';
import Spinner from './Spinner';

interface UploadButtonProps {
  onUploaded: (res: UploadResponse) => void;
  compact?: boolean;
}

export default function UploadButton({ onUploaded, compact }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>({ state: 'idle' });

  const doUpload = useCallback(
    async (file: File) => {
      setStatus({ state: 'validating' });
      const validation = validateCsvFile(file);
      if (!validation.ok) {
        setStatus({ state: 'error', message: validation.message ?? 'Invalid file' });
        return;
      }
      setStatus({ state: 'uploading', progress: 0 });
      try {
        const res = await uploadCsv(file, {
          onProgress: (percent) => setStatus({ state: 'uploading', progress: percent }),
        });
        setStatus({ state: 'success', file: res });
        onUploaded(res);
        window.setTimeout(() => setStatus({ state: 'idle' }), 1200);
      } catch (err) {
        setStatus({ state: 'error', message: toApiError(err).message });
      }
    },
    [onUploaded],
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
    e.target.value = '';
  };

  const isBusy = status.state === 'uploading' || status.state === 'validating';

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onChange}
        aria-label="Upload CSV file"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isBusy}
        className={clsx(
          'w-full rounded-lg border border-dashed border-slate-700 px-3 py-2 text-sm transition',
          'hover:border-brand-500 hover:bg-slate-900',
          isBusy && 'opacity-60 cursor-not-allowed',
          compact ? 'text-xs' : 'text-sm',
        )}
      >
        {status.state === 'uploading'
          ? `Uploading… ${status.progress}%`
          : status.state === 'validating'
            ? 'Validating…'
            : '+ Upload CSV'}
      </button>

      {status.state === 'uploading' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={status.progress} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full bg-brand-500 transition-all"
            style={{ width: `${status.progress}%` }}
          />
        </div>
      )}
      {status.state === 'error' && (
        <p className="mt-2 text-xs text-rose-400" role="alert">
          {status.message}
        </p>
      )}
      {status.state === 'success' && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
          <Spinner size={12} /> {status.file.info.name} ready.
        </p>
      )}
    </div>
  );
}
