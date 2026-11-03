// Shows what a staff action just did (passed as ?notice=...).
export function NoticeBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="animate-rise mb-6 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 font-bold text-ok shadow-[var(--shadow-soft)] ring-1 ring-ok/25">
      <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok text-white">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>
      </span>
      {message}
    </p>
  );
}
