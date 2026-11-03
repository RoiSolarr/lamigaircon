import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/AccountForm";
import { HeaderAccount } from "@/components/HeaderAccount";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { getBusiness } from "@/lib/data";
import { staffDb as userDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

// Reached from the "reset your password" email (through /account/callback,
// which signs the customer in), or from "Change password" on the account page.
export default async function ResetPasswordPage() {
  const { settings } = await getBusiness();
  const db = await userDb();
  const { data } = await db.auth.getClaims();

  return (
    <>
      <SiteHeader account={<HeaderAccount />} />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:pt-12">
        <h1 className="display-wide text-[clamp(1.5rem,6.5vw,3rem)] leading-tight whitespace-nowrap">Set a new password</h1>
        <Link href="/account" className="mt-5 inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-2 font-bold text-ink ring-1 ring-mist transition-colors hover:bg-white">
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          Back to my account
        </Link>
        <div className="mx-auto mt-8 max-w-xl">
          {data?.claims ? (
            <NewPasswordForm />
          ) : (
            <div className="panel p-6 sm:p-8">
              <p className="text-lg">This page needs the link from your reset email, and that link only works once.</p>
              <p className="mt-2 text-steel">Ask for a new link with &quot;Forgot password?&quot; on the sign in form.</p>
              <Link href="/account" className="btn btn-ink mt-6">Go to sign in</Link>
            </div>
          )}
        </div>
      </main>
      <SiteFooter name={settings.name} phone={settings.phone} email={settings.email} />
    </>
  );
}
