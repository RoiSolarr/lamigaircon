// Shown while a page waits for Supabase, so a slow answer looks intentional.
export default function Loading() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4" aria-busy="true">
      <div role="status" className="flex flex-col items-center gap-4 text-steel">
        <svg aria-hidden width="44" height="44" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-[spin_2.4s_linear_infinite] text-ink">
          <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" />
          <path d="M12 5.5l4 3 4-3M12 26.5l4-3 4 3" />
        </svg>
        <p className="font-bold">Loading…</p>
      </div>
    </main>
  );
}
