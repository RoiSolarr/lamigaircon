"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold" style={{ fontStretch: "100%" }}>Staff sign in</h1>
      <p className="mt-2 text-steel">For appointments, chats that need a person, and email status.</p>
      <form onSubmit={signIn} className="mt-8 space-y-5">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field" />
        </div>
        {error && <p role="alert" className="text-bad">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-ink w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
