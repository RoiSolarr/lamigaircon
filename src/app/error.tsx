"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/SiteHeader";

// Shown when a page fails to load, for example when Supabase does not answer.
// The visitor gets a calm message and a way to try again, never the raw error.
export default function SiteError({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16">
      <Logo />
      <div className="panel mt-10 p-6 sm:p-8">
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-sun/25 text-sun-deep">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          </svg>
        </span>
        <h1 className="title mt-5 text-3xl">This page did not load</h1>
        <p className="mt-3 text-lg text-steel">
          Our booking system took too long to answer. It is usually back within a few seconds.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => (retry ?? reset)?.()} className="btn btn-ink">
            Try again
          </button>
          <Link href="/" className="btn btn-quiet">Go to the home page</Link>
        </div>
      </div>
    </main>
  );
}
