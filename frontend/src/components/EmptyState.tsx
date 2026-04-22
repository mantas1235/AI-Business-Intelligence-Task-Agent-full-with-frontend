interface EmptyStateProps {
  title: string;
  description?: string;
}

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-600/10 text-brand-500">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 20V10m6 10V4m6 16v-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>
      )}
    </div>
  );
}
