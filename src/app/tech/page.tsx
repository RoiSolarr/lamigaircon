import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setAppointmentStatus, signOut } from "@/app/admin/actions";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Logo } from "@/components/SiteHeader";
import { addDays, formatTime, manilaDateOf, manilaToday } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My jobs" };
export const dynamic = "force-dynamic";

type Job = {
  id: string;
  ref: string;
  starts_at: string;
  ends_at: string;
  address: string;
  notes: string | null;
  status: "booked" | "completed" | "cancelled" | "no_show";
  customers: { name: string; phone: string } | null;
  services: { name: string } | null;
};

const STATUS: Record<Job["status"], { label: string; style: string }> = {
  booked: { label: "To do", style: "bg-ice text-ink" },
  completed: { label: "Done", style: "bg-ok/10 text-ok" },
  no_show: { label: "No show", style: "bg-warn/10 text-warn" },
  cancelled: { label: "Cancelled", style: "bg-mist/50 text-steel line-through" },
};

const dayTitle = (day: string, today: string) => {
  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  if (day === today) return `Today, ${label}`;
  if (day === addDays(today, 1)) return `Tomorrow, ${label}`;
  return label;
};

// Technicians see only their own jobs (row level security), today and the next 6 days.
export default async function TechnicianPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: actionError } = await searchParams;
  const db = await staffDb();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/admin/login");

  const { data: staff } = await db.from("staff").select("full_name, role").eq("user_id", claims.claims.sub).maybeSingle();
  if (staff?.role === "admin") redirect("/admin");

  const today = manilaToday();
  const { data, error } = staff
    ? await db
        .from("appointments")
        .select("id, ref, starts_at, ends_at, address, notes, status, customers(name, phone), services(name)")
        .neq("status", "cancelled")
        .gte("starts_at", new Date(`${today}T00:00:00+08:00`).toISOString())
        .lt("starts_at", new Date(`${addDays(today, 7)}T00:00:00+08:00`).toISOString())
        .order("starts_at")
    : { data: [], error: null };
  if (error) throw new Error(error.message);

  const jobs = (data ?? []) as unknown as Job[];
  const days = new Map<string, Job[]>();
  for (const j of jobs) {
    const d = manilaDateOf(j.starts_at);
    days.set(d, [...(days.get(d) ?? []), j]);
  }
  const leftToday = (days.get(today) ?? []).filter((j) => j.status === "booked").length;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-mist/70 bg-frost/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <form action={signOut}>
            <button className="btn btn-quiet btn-sm">Sign out</button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <ErrorBanner message={actionError} />
        {!staff ? (
          <>
            <h1 className="title text-2xl">No access yet</h1>
            <p className="mt-2 text-steel">Ask the office to give your login access on the Technicians page.</p>
          </>
        ) : (
          <>
            <h1 className="title text-3xl">Hi, {staff.full_name.split(" ")[0]}</h1>
            <p className="mt-1 text-steel">
              {leftToday === 0 ? "No jobs left today." : `${leftToday} job${leftToday === 1 ? "" : "s"} left today.`} Mark each job done when you
              finish, so the customer gets the follow up message.
            </p>

            {jobs.length === 0 && (
              <p className="panel mt-8 p-8 text-center text-steel">
                No jobs in the next 7 days.
              </p>
            )}

            {[...days.entries()].map(([day, list]) => (
              <section key={day} className="mt-8">
                <h2 className="title text-lg">{dayTitle(day, today)}</h2>
                <ul className="mt-3 space-y-3">
                  {list.map((j) => {
                    const canFinish = j.status === "booked" && day <= today;
                    return (
                      <li key={j.id} className="panel p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="readout text-3xl leading-none">{formatTime(j.starts_at)}</p>
                            <p className="mt-1 text-sm text-steel">until {formatTime(j.ends_at)}</p>
                          </div>
                          <span className={`pill ${STATUS[j.status].style}`}>
                            {STATUS[j.status].label}
                          </span>
                        </div>
                        <p className="mt-3 font-bold">{j.services?.name}</p>
                        <p>{j.customers?.name}</p>
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          <a href={`tel:${j.customers?.phone}`} className="font-bold underline underline-offset-2">
                            Call {j.customers?.phone}
                          </a>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            Open map
                          </a>
                        </p>
                        <p className="mt-1 text-steel">{j.address}</p>
                        {j.notes && <p className="mt-2 rounded-lg bg-frost px-3 py-2 text-sm">Note: {j.notes}</p>}
                        <p className="mt-2 text-xs text-steel">{j.ref}</p>

                        <form action={setAppointmentStatus} className="mt-4 flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={j.id} />
                          <input type="hidden" name="back" value="/tech" />
                          {canFinish && (
                            <>
                              <button name="status" value="completed" className="btn btn-sun flex-1 py-2">Mark done</button>
                              <button name="status" value="no_show" className="btn btn-line py-2">No one home</button>
                            </>
                          )}
                          {j.status !== "booked" && (
                            <button name="status" value="booked" className="btn btn-quiet btn-sm">Undo</button>
                          )}
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
