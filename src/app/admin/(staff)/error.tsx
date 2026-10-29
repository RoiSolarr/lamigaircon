"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-2xl font-bold" style={{ fontStretch: "100%" }}>That did not work</h1>
      <p className="mt-2 text-steel">{error.message || "Something went wrong loading this page."}</p>
      <button type="button" onClick={reset} className="btn btn-ink mt-6">Try again</button>
    </div>
  );
}
