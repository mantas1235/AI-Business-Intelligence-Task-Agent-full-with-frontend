import clsx from 'clsx';

interface SpinnerProps {
  className?: string;
  size?: number;
  label?: string;
}

export default function Spinner({ className, size = 16, label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
      className={clsx('inline-flex items-center gap-2', className)}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="animate-spin text-slate-400"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="text-xs text-slate-400">{label}</span>}
    </span>
  );
}
