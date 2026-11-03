"use client";

import { useState } from "react";

export type StatusOption = {
  value: string;
  label: string;
  question: string;
  confirm: string;
  primary?: boolean;
  danger?: boolean;
};

// Status buttons for a job, used inside a <form> that posts name="status".
// The first press only asks; the job changes after "Yes" is pressed, so a
// stray click never moves a job to Booking history.
export function StatusActions({ options, className = "" }: { options: StatusOption[]; className?: string }) {
  const [asking, setAsking] = useState<StatusOption | null>(null);

  if (asking) {
    return (
      <div role="group" aria-label={asking.question} className={`animate-rise rounded-2xl bg-frost p-3 ring-1 ring-mist ${className}`}>
        <p className="text-sm font-bold">{asking.question}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="submit"
            name="status"
            value={asking.value}
            autoFocus
            className={`btn btn-sm flex-1 ${asking.danger ? "bg-bad text-white hover:bg-bad/90" : "btn-ink"}`}
          >
            {asking.confirm}
          </button>
          <button type="button" onClick={() => setAsking(null)} className="btn btn-quiet btn-sm flex-1">
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 lg:flex-col lg:items-stretch ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setAsking(o)}
          className={`btn btn-sm ${o.primary ? "btn-ink" : "btn-quiet"} ${o.danger ? "hover:!border-bad hover:text-bad" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
