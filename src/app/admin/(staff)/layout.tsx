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

  if (staff?.role === "technician") redirect("/tech");

  if (!staff) {
    return (
      <main id="main" className="mx-auto max-w-lg px-4 py-20">
        <Logo />
        <div className="panel mt-8 p-6 sm:p-8">
          <h1 className="title text-3xl">Not on the staff list</h1>
          <p className="mt-3 text-steel">
            You are signed in as {String(claims?.claims?.email ?? "this account")}, but it is not in the lamig.staff
            table. Add it with the SQL in README.md (Step 3), then reload this page.
          </p>
          <form action={signOut} className="mt-6">
            <button className="btn btn-line">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  const initials = staff.full_name
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Sidebar on wide screens */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-ink px-4 py-6 text-frost lg:flex">
        <div className="px-2">
          <Logo tone="frost" />
          <p className="mt-1 pl-10 text-xs text-mist">Office</p>
        </div>
        <div className="mt-10 pl-3">
          <AdminNav waiting={waiting ?? 0} vertical />
        </div>
        <div className="mt-auto space-y-3 border-t border-white/10 pt-5">
          <div className="flex items-center gap-3 px-2">
            <span className="avatar h-9 w-9 bg-sun text-sm text-deep">{initials}</span>
            <div className="min-w-0">
              <p className="truncate font-bold">{staff.full_name}</p>
              <p className="text-xs text-mist">Admin</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-2 text-sm">
            <Link href="/" className="text-mist underline underline-offset-2 hover:text-frost">View website</Link>
            <form action={signOut}>
              <button className="rounded-lg px-2 py-1 text-mist hover:bg-white/10 hover:text-frost">Sign out</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Top bar on phones and tablets */}
        <header className="sticky top-0 z-20 border-b border-mist/70 bg-frost/90 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <Logo />
            <div className="flex items-center gap-3 text-sm">
              <Link href="/" className="text-steel underline underline-offset-2">Website</Link>
              <form action={signOut}>
                <button className="btn btn-quiet btn-sm">Sign out</button>
              </form>
            </div>
          </div>
          <div className="px-4">
            <AdminNav waiting={waiting ?? 0} />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
