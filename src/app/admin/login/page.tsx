"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { Logo } from "@/components/SiteHeader";
import { browserDb } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await browserDb().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-frost lg:flex">
        <div aria-hidden className="vent absolute inset-x-0 top-0 h-24" />
        <div className="relative">
          <Logo tone="frost" />
        </div>
        <div className="relative">
          <p className="display-wide text-5xl leading-[1.05]">Every booking, chat and email in one place.</p>
          <ul className="mt-10 space-y-3 text-mist">
            <li>Appointments and technicians for each day</li>
            <li>Chats with customers, with the AI or with you</li>
            <li>Whether every confirmation and reminder went out</li>
          </ul>
        </div>
        <Link href="/" className="relative text-sm text-mist underline underline-offset-2 hover:text-frost">
          Back to the website
        </Link>
      </aside>

      <main id="main" className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Logo />
          </div>
          <h1 className="title mt-8 text-3xl lg:mt-0">Staff sign in</h1>
          <p className="mt-2 text-steel">For the office team and technicians.</p>
          <form onSubmit={signIn} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <PasswordInput id="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p role="alert" className="rounded-xl bg-bad/8 px-4 py-3 text-bad ring-1 ring-bad/20">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-ink w-full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-8 text-sm text-steel lg:hidden">
            <Link href="/" className="underline underline-offset-2">Back to the website</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
