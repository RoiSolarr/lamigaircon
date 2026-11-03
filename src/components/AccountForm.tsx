"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearSavedChat } from "@/components/ChatWidget";
import { PasswordChecklist, PasswordInput, passwordIsStrong } from "@/components/PasswordInput";
import { Spinner } from "@/components/Spinner";
import { browserDb } from "@/lib/supabase/browser";

type Mode = "signin" | "signup" | "forgot";

// Customer sign in, sign up and "forgot password" (Supabase Auth, email and password).
// `next` is where to go after signing in (the account page, or back to booking).
export function AccountForm({ initialMode = "signin", next = "/account" }: { initialMode?: "signin" | "signup"; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const switchTo = (m: Mode) => {
    setMode(m);
    setError("");
    setNotice("");
    setForm((f) => ({ ...f, password: "", confirm: "" }));
  };

  const confirmMismatch = mode === "signup" && form.confirm.length > 0 && form.confirm !== form.password;
  // Links in Supabase emails come back here, then go to the page in `next`.
  const callback = (next: string) => `${window.location.origin}/account/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const email = form.email.trim();

    if (mode === "signup") {
      if (form.name.trim().length < 2) return setError("Please give your full name.");
      if (form.phone.replace(/\D/g, "").length < 7) return setError("Please add your mobile number.");
      if (!passwordIsStrong(form.password)) return setError("Your password does not meet every rule in the list yet.");
      if (form.password !== form.confirm) return setError("The two passwords do not match.");
    }

    setBusy(true);
    const db = browserDb();
    try {
      if (mode === "forgot") {
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: callback("/account/reset") });
        if (error) return setError(error.message);
        setNotice(`If ${email} has an account, a link to set a new password is on its way. Check your inbox and spam folder.`);
        return;
      }

      if (mode === "signin") {
        const { error } = await db.auth.signInWithPassword({ email, password: form.password });
        if (error) {
          return setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
        }
      } else {
        const { data, error } = await db.auth.signUp({
          email,
          password: form.password,
          options: {
            data: { full_name: form.name.trim(), phone: form.phone.trim() },
            emailRedirectTo: callback(next),
          },
        });
        if (error) return setError(error.message);
        if (!data.session) {
          // Email confirmation is on in Supabase.
          switchTo("signin");
          setNotice("Check your email and click the link to confirm your account. It signs you in.");
          return;
        }
        const { data: saved, error: saveError } = await db
          .schema("lamig")
          .rpc("save_my_account", { p_full_name: form.name.trim(), p_phone: form.phone.trim() });
        const result = saved as { ok?: boolean; error?: string } | null;
        if (saveError || !result?.ok) {
          return setError(saveError?.message ?? result?.error ?? "Your account was created, but your details were not saved.");
        }
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = {
    signin: busy ? "Signing in…" : "Sign in",
    signup: busy ? "Creating your account…" : "Create account",
    forgot: busy ? "Sending…" : "Send reset link",
  }[mode];

  return (
    <div className="panel p-5 sm:p-8">
      {mode === "forgot" ? (
        <div>
          <h2 className="title text-2xl">Reset your password</h2>
          <p className="mt-1 text-steel">Enter your account email. We send you a link to set a new password.</p>
        </div>
      ) : (
        <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-full bg-frost p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchTo(m)}
              className={`rounded-full px-4 py-2 font-bold transition-colors ${mode === m ? "bg-white text-ink shadow-[var(--shadow-soft)]" : "text-steel hover:text-ink"}`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-5" noValidate={false}>
        {mode === "signup" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="acc-name" className="label">Full name</label>
              <input id="acc-name" required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={set("name")} className="field" />
            </div>
            <div>
              <label htmlFor="acc-phone" className="label">
                Mobile number
              </label>
              <input id="acc-phone" required minLength={7} maxLength={30} type="tel" inputMode="tel" autoComplete="tel" placeholder="09171234567" value={form.phone} onChange={set("phone")} className="field" />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="acc-email" className="label">Email</label>
          <input id="acc-email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} className="field" />
        </div>

        {mode !== "forgot" && (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="acc-password" className="label">Password</label>
              {mode === "signin" && (
                <button type="button" onClick={() => switchTo("forgot")} className="mb-1.5 text-sm text-steel underline underline-offset-2 hover:text-ink">
                  Forgot password?
                </button>
              )}
            </div>
            <PasswordInput
              id="acc-password"
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={form.password}
              onChange={set("password")}
              aria-describedby={mode === "signup" ? "acc-password-rules" : undefined}
            />
            {mode === "signup" && <PasswordChecklist password={form.password} id="acc-password-rules" />}
          </div>
        )}

        {mode === "signup" && (
          <div>
            <label htmlFor="acc-confirm" className="label">Confirm password</label>
            <PasswordInput
              id="acc-confirm"
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
              aria-invalid={confirmMismatch}
              aria-describedby="acc-confirm-hint"
            />
            <p id="acc-confirm-hint" className={`hint ${confirmMismatch ? "text-bad" : ""} ${form.confirm && !confirmMismatch ? "text-ok" : ""}`}>
              {confirmMismatch ? "The passwords do not match yet." : form.confirm ? "The passwords match." : "Type the same password again."}
            </p>
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-bad/8 px-4 py-3 text-bad ring-1 ring-bad/20">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-ok ring-1 ring-ok/20">{notice}</p>}

        <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-ink w-full disabled:cursor-wait">
          {busy && <Spinner />}
          {submitLabel}
        </button>
        {mode === "forgot" && (
          <button type="button" onClick={() => switchTo("signin")} className="block w-full text-center text-sm text-steel underline underline-offset-2 hover:text-ink">
            Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}

// Set a new password after following the reset link (the link signs the customer in).
export function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!passwordIsStrong(password)) return setError("Your password does not meet every rule in the list yet.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    const { error } = await browserDb().auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    router.push("/account?saved=password");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="panel space-y-5 p-5 sm:p-8">
      <div>
        <label htmlFor="new-password" className="label">New password</label>
        <PasswordInput id="new-password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="new-password-rules" />
        <PasswordChecklist password={password} id="new-password-rules" />
      </div>
      <div>
        <label htmlFor="new-confirm" className="label">Confirm new password</label>
        <PasswordInput id="new-confirm" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} aria-describedby="new-confirm-hint" />
        <p id="new-confirm-hint" className={`hint ${mismatch ? "text-bad" : ""} ${confirm && !mismatch ? "text-ok" : ""}`}>
          {mismatch ? "The passwords do not match yet." : confirm ? "The passwords match." : "Type the same password again."}
        </p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-bad/8 px-4 py-3 text-bad ring-1 ring-bad/20">{error}</p>}
      <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-ink w-full disabled:cursor-wait">
        {busy && <Spinner />}
        {busy ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="btn btn-quiet"
      onClick={async () => {
        setBusy(true);
        await browserDb().auth.signOut();
        clearSavedChat();
        router.push("/");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
