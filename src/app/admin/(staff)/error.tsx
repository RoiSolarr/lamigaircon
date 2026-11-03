"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-8">
      <h1 className="title text-2xl">That did not work</h1>
      <p className="mt-2 text-steel">{error.message || "Something went wrong loading this page."}</p>
      <button type="button" onClick={reset} className="btn btn-ink mt-6">Try again</button>
    </div>
  );
}
