"use client";

import { useState } from "react";

// A password field with an eye button. Closed eye: the password is hidden.
// Open eye: the password is shown. Every other prop goes to the <input>.
export function PasswordInput({ className = "", ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={`field pr-12 ${className}`} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-1 my-1 grid w-10 place-items-center rounded-lg text-steel hover:bg-frost hover:text-ink"
      >
        {shown ? <EyeOpen /> : <EyeClosed />}
      </button>
    </div>
  );
}

function EyeOpen() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosed() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10c2.4 3.4 5.8 5.5 10 5.5s7.6-2.1 10-5.5" />
      <path d="M5.3 13.6 3.5 16.2M9.4 15.2l-.8 3M14.6 15.2l.8 3M18.7 13.6l1.8 2.6" />
    </svg>
  );
}

// Rules for a new customer password.
export const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One special character, like ! or @", test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
];

export const passwordIsStrong = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

// Live checklist under the password field.
export function PasswordChecklist({ password, id }: { password: string; id: string }) {
  return (
    <ul id={id} className="mt-2 grid gap-1 text-sm sm:grid-cols-2" aria-label="Password needs">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.label} className={`flex items-center gap-2 ${ok ? "text-ok" : "text-steel"}`}>
            <span
              aria-hidden
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${ok ? "bg-ok text-white" : "border-[1.5px] border-mist"}`}
            >
              {ok && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.2 5 8.5l4.5-5" />
                </svg>
              )}
            </span>
            {r.label}
            <span className="sr-only">{ok ? ", done" : ", not yet"}</span>
          </li>
        );
      })}
    </ul>
  );
}
