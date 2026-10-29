import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/admin/actions";
import { Logo } from "@/components/SiteHeader";
import { staffDb } from "@/lib/supabase/server";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const db = await staffDb();
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/admin/login");

  const [{ data: staff }, { count: waiting }] = await Promise.all([
    db.from("staff").select("full_name, role").eq("user_id", userId).maybeSingle(),
    db.from("conversations").select("id", { count: "exact", head: true }).eq("needs_human", true),
  ]);

  if (!staff) {
    return (
      <main className="mx-auto max-w-lg px-4 py-20">
        <Logo />
        <h1 className="mt-8 text-3xl font-bold" style={{ fontStretch: "100%" }}>Not on the staff list</h1>
        <p className="mt-3 text-steel">
          You are signed in as {String(claims?.claims?.email ?? "this account")}, but it is not in the lamig.staff
          table. Add it with the SQL in README.md (Step 4), then reload this page.
        </p>
        <form action={signOut} className="mt-6">
          <button className="btn btn-line">Sign out</button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-mist bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo />
            <AdminNav waiting={waiting ?? 0} />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-steel underline underline-offset-2">View website</Link>
            <span className="text-steel">{staff.full_name}</span>
            <form action={signOut}>
              <button className="btn btn-line px-3 py-1.5 text-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
