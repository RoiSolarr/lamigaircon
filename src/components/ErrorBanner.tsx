// Shows the reason when a staff action was refused (passed as ?error=...).
export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-6 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-bad shadow-[var(--shadow-soft)] ring-1 ring-bad/25">
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" />
      </svg>
      {message}
    </p>
  );
}
