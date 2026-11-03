import type { Metadata } from "next";
import Link from "next/link";
import { saveMyAccount } from "@/app/account/actions";
import { AccountForm, SignOutButton } from "@/components/AccountForm";
import { ChatWidget } from "@/components/ChatWidget";
import { ErrorBanner } from "@/components/ErrorBanner";
import { HeaderAccount } from "@/components/HeaderAccount";
import { MyBookings, type MyBooking } from "@/components/MyBookings";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { getBusiness } from "@/lib/data";
import { staffDb as userDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

type Account = { full_name: string; phone: string; email: string };

const benefits = [
  "Our staff see your name when you chat with us, and can reply to you.",
  "Your chat continues on your phone or any other device.",
  "The booking form fills in your name, number and email.",
  "All your bookings and their status in one place.",
];

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; mode?: string; next?: string }> }) {
  const { error, saved, mode, next } = await searchParams;
  // After signing in from the booking page, go back there.
  const after = next === "/book" ? "/book" : "/account";
  const { settings } = await getBusiness();
  const db = await userDb();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;

  const { data: accountData } = claims
    ? await db.from("customer_accounts").select("full_name, phone, email").eq("user_id", claims.sub).maybeSingle()
    : { data: null };
  const account = accountData as Account | null;
  const { data: bookingData } = account ? await db.rpc("my_bookings") : { data: null };
  const bookings = (bookingData ?? []) as MyBooking[];

  // Details given at sign up, used when the account row is not saved yet.
  const meta = (claims?.user_metadata ?? {}) as { full_name?: string; phone?: string };

  return (
    <>
      <SiteHeader account={<HeaderAccount />} />
      <main id="main" className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:pt-16">
        {!claims && (
          <>
            <div>
              <h1 className="display-wide text-4xl sm:text-5xl">Your account</h1>
              <p className="mt-4 max-w-[30rem] text-lg text-steel">
                Create a free account to book a cleaning. Signing in also lets our team know who they are chatting with.
              </p>
              <ul className="mt-8 space-y-4">
                {benefits.map((b) => (
                  <li key={b} className="flex max-w-[30rem] gap-3">
                    <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-sun">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <ErrorBanner message={error} />
              <AccountForm initialMode={mode === "signup" ? "signup" : "signin"} next={after} />
            </div>
          </>
        )}

        {claims && (
          <>
            <div>
              <span aria-hidden className="avatar h-16 w-16 bg-ink text-2xl text-frost">
                {(account?.full_name ?? meta.full_name ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <h1 className="display-wide mt-6 text-4xl sm:text-5xl">
                {account ? `Hi, ${account.full_name.split(" ")[0]}` : "Finish your account"}
              </h1>
              <p className="mt-4 max-w-[30rem] text-lg text-steel">
                {account
                  ? "When you chat with us while signed in, our staff see your name and can reply to you."
                  : "Add your name so our staff know who they are chatting with."}
              </p>
              {account && (
                <dl className="mt-8 grid max-w-sm grid-cols-2 gap-3">
                  {[
                    ["Bookings", bookings.length],
                    ["Coming up", bookings.filter((b) => b.status === "booked").length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-mist/70">
                      <dt className="text-sm text-steel">{label}</dt>
                      <dd className="readout text-3xl">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className="min-w-0">
              <ErrorBanner message={error} />
              {saved && (
                <p role="status" className="mb-6 rounded-xl bg-ok/10 px-4 py-3 font-bold text-ok ring-1 ring-ok/20">
                  {saved === "password" ? "Your new password is saved." : "Saved."}
                </p>
              )}
              <form action={saveMyAccount} className="space-y-5">
                <h2 className="title text-2xl">Your details</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="label">Full name</label>
                    <input
                      id="name"
                      name="full_name"
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      defaultValue={account?.full_name ?? meta.full_name ?? ""}
                      className="field"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="label">
                      Mobile number <span className="font-normal text-steel">(optional)</span>
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="09171234567"
                      defaultValue={account?.phone ?? meta.phone ?? ""}
                      className="field"
                    />
                  </div>
                </div>
                <div>
                  <p className="label">Email</p>
                  <p className="rounded-xl bg-mist/30 px-3.5 py-2.5 text-steel">{account?.email ?? String(claims.email ?? "")}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Link href="/account/reset" className="text-steel underline underline-offset-2 hover:text-ink">
                    Change password
                  </Link>
                  <button className="btn btn-ink">{account ? "Save changes" : "Save my details"}</button>
                </div>
              </form>

              <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-mist/70 pt-6">
                <p className="min-w-0 text-steel">
                  Signed in as <span className="font-bold break-all text-ink">{account?.email ?? String(claims.email ?? "")}</span>
                </p>
                <SignOutButton />
              </div>
            </div>

            {account && <MyBookings bookings={bookings} />}
          </>
        )}
      </main>
      <SiteFooter name={settings.name} phone={settings.phone} email={settings.email} />
      <ChatWidget />
    </>
  );
}
