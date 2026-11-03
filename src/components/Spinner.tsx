"use client";

import Link, { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";

// The spinning Lamig snowflake, the same one as the page loading screen.
export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" className="shrink-0 animate-[spin_1.6s_linear_infinite]">
      <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" />
      <path d="M12 5.5l4 3 4-3M12 26.5l4-3 4 3" />
    </svg>
  );
}

// Submit button for a server action form: shows the spinner while it saves.
export function SubmitButton({ children, pendingText, className = "" }: { children: React.ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-90`}>
      {pending ? (
        <>
          <Spinner />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

// A link that shows the spinner while the next page loads.
export function PendingLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 ${className}`}>
      <LinkSpinner />
      {children}
    </Link>
  );
}

function LinkSpinner() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner size={16} /> : null;
}
