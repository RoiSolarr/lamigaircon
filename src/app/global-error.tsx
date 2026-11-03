"use client";

import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";

// Last line of defence: replaces the whole page when even the root layout fails.
// It has its own <html> and <body>, so it brings its own styles and title.
export default function GlobalError({ retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong | Lamig Aircon Cleaning</title>
        <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16">
          <p className="display-wide text-3xl">lamig</p>
          <div className="panel mt-10 p-6 sm:p-8">
            <h1 className="title text-3xl">Something went wrong</h1>
            <p className="mt-3 text-lg text-steel">The website could not load just now. Please try again in a moment.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={() => (retry ?? reset)?.()} className="btn btn-ink">
                Try again
              </button>
              {/* A plain link on purpose: it reloads the page fully. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="btn btn-quiet">Go to the home page</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
