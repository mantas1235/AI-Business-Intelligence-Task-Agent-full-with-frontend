import type { MouseEvent as ReactMouseEvent } from 'react';
import clsx from 'clsx';
import type { FileEntry, UploadResponse } from '../types';
import UploadButton from './UploadButton';
import Spinner from './Spinner';

interface SidebarProps {
  files: FileEntry[];
  activeFileId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (fileId: string) => void;
  onDelete: (fileId: string) => void;
  onUploaded: (res: UploadResponse) => void;
  onRefresh: () => void;
  open: boolean;
  onClose: () => void;
}

function formatWhen(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return '';
  }
}

export default function Sidebar({
  files,
  activeFileId,
  loading,
  error,
  onSelect,
  onDelete,
  onUploaded,
  onRefresh,
  open,
  onClose,
}: SidebarProps) {
  const handleDeleteClick = (e: ReactMouseEvent, file: FileEntry) => {
    e.stopPropagation();
    if (window.confirm(`Ištrinti failą „${file.original_name}"?`)) {
      onDelete(file.file_id);
    }
  };
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800 bg-slate-900/95 backdrop-blur transition-transform duration-200',
          'md:static md:z-0 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        aria-label="File history"
      >
        <header className="border-b border-slate-800 px-4 py-4">
          <h1 className="text-base font-semibold text-slate-100">BI Agent</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">CSV in, insights out.</p>
        </header>

        <div className="border-b border-slate-800 p-3">
          <UploadButton onUploaded={onUploaded} />
        </div>

        <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500">
          <span>History</span>
          <button
            type="button"
            onClick={onRefresh}
            className="text-brand-500 hover:text-brand-600"
            aria-label="Refresh file list"
          >
            Refresh
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Uploaded files">
          {loading && (
            <div className="px-2 py-4 text-xs text-slate-500">
              <Spinner label="Loading files…" />
            </div>
          )}
          {error && (
            <p className="px-2 py-4 text-xs text-rose-400" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && files.length === 0 && (
            <p className="px-2 py-4 text-xs text-slate-500">
              No files yet. Upload a CSV to begin.
            </p>
          )}
          <ul className="space-y-1">
            {files.map((f) => {
              const active = f.file_id === activeFileId;
              return (
                <li key={f.file_id}>
                  <div
                    className={clsx(
                      'group flex items-center gap-1 rounded-md pr-1 transition',
                      active
                        ? 'bg-brand-600/20 ring-1 ring-brand-600/40'
                        : 'hover:bg-slate-800',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(f.file_id)}
                      className={clsx(
                        'min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm',
                        active ? 'text-brand-50' : 'text-slate-300',
                      )}
                      title={f.original_name}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="block truncate font-medium">{f.original_name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                        {formatWhen(f.created_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, f)}
                      className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
                      aria-label={`Delete ${f.original_name}`}
                      title="Ištrinti failą"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.75 1a.75.75 0 0 0-.75.75V3H4.25a.75.75 0 0 0 0 1.5h.312l.738 11.07A2.25 2.25 0 0 0 7.547 17.75h4.906a2.25 2.25 0 0 0 2.247-2.18l.738-11.07h.312a.75.75 0 0 0 0-1.5H12V1.75a.75.75 0 0 0-.75-.75h-2.5ZM10.5 3h-1v-.5h1V3ZM8.5 7.75a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-1.5 0v-6Zm3.25-.75a.75.75 0 0 0-.75.75v6a.75.75 0 0 0 1.5 0v-6a.75.75 0 0 0-.75-.75Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <footer className="border-t border-slate-800 px-4 py-3 text-[10px] text-slate-500">
          Sessions expire after 1 hour.
        </footer>
      </aside>
    </>
  );
}
