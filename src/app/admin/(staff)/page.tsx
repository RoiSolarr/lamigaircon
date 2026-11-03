import type { Metadata } from "next";
import Link from "next/link";
import { setAppointmentStatus, setAppointmentTechnician } from "@/app/admin/actions";
import { AdminPageHeader, StatStrip } from "@/components/AdminPageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NoticeBanner } from "@/components/NoticeBanner";
import { StatusActions } from "@/components/StatusActions";
import { addDays, formatDateTime, formatPeso, formatTime, manilaDateOf, manilaToday } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Appointments" };

type Row = {
  id: string;
  ref: string;
  starts_at: string;
  ends_at: string;
  address: string;
  notes: string | null;
  status: "booked" | "completed" | "cancelled" | "no_show";
  source: "website" | "chat" | "staff";
  conversation_id: string | null;
  created_at: string;
  customers: { name: string; phone: string; email: string } | null;
  services: { name: string; price_php: number } | null;
  technician_id: string | null;
  technicians: { full_name: string } | null;
};

const STATUS_STYLE: Record<Row["status"], string> = {
  booked: "bg-ice text-ink",
  completed: "bg-ok/10 text-ok",
  cancelled: "bg-mist/50 text-steel line-through",
  no_show: "bg-warn/10 text-warn",
};
const STATUS_BAR: Record<Row["status"], string> = {
  booked: "bg-ink",
  completed: "bg-ok",
  cancelled: "bg-mist",
  no_show: "bg-warn",
};
const STATUS_LABEL: Record<Row["status"], string> = {
  booked: "Booked",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "No show",
};

// Open jobs only. Once a job is marked done, cancelled or no show, it moves to
// Booking history. Older jobs nobody marked yet stay here on top, so none are forgotten.
export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error: actionError, notice } = await searchParams;
  const today = manilaToday();

  const db = await staffDb();
  const query = db
    .from("appointments")
    .select("id, ref, starts_at, ends_at, address, notes, status, source, conversation_id, created_at, technician_id, customers(name, phone, email), services(name, price_php), technicians(full_name)")
    .eq("status", "booked")
    .gte("starts_at", new Date(`${addDays(today, -60)}T00:00:00+08:00`).toISOString())
    .order("starts_at", { ascending: true });

  const [{ data, error }, { data: techData }] = await Promise.all([
    query.limit(300),
    db.from("technicians").select("id, full_name").eq("is_active", true).order("sort_order"),
  ]);
  const technicians = (techData ?? []) as { id: string; full_name: string }[];
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    const day = manilaDateOf(r.starts_at);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }

  const overdue = rows.filter((r) => manilaDateOf(r.starts_at) < today);
  const upcoming = rows.filter((r) => manilaDateOf(r.starts_at) >= today);
  const todayCount = (byDay.get(today) ?? []).length;
  const fromChat = upcoming.filter((r) => r.source === "chat").length;
  const unassigned = upcoming.filter((r) => !r.technician_id).length;
  const back = "/admin";

  return (
    <>
      <ErrorBanner message={actionError} />
      <NoticeBanner message={notice} />
      <AdminPageHeader title="Appointments">
        Open jobs from the website and the AI receptionist. Done and cancelled jobs move to Booking history.
      </AdminPageHeader>

      <StatStrip
        stats={[
          { label: "Jobs left today", value: todayCount },
          { label: "Upcoming jobs", value: upcoming.length },
          { label: "Booked by the AI", value: fromChat },
          { label: "No technician yet", value: unassigned, tone: unassigned > 0 ? "warn" : undefined },
        ]}
      />

      {overdue.length > 0 && (
        <p className="mt-4 flex items-start gap-3 rounded-2xl bg-warn/10 px-4 py-3 text-warn ring-1 ring-warn/30">
          <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-warn font-bold text-white">!</span>
          <span>
            <strong>{overdue.length} past job{overdue.length === 1 ? " is" : "s are"} not marked yet.</strong> Mark each one done, no show or cancelled, so the customer gets the right follow up.
          </span>
        </p>
      )}

      {unassigned > 0 && (
        <p className="mt-4 flex items-start gap-3 rounded-2xl bg-sun/20 px-4 py-3 text-deep ring-1 ring-sun/50">
          <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sun font-bold text-deep">!</span>
          <span>
            <strong>{unassigned} job{unassigned === 1 ? " has" : "s have"} no technician.</strong> Pick one below, or add a technician on the Technicians page.
          </span>
        </p>
      )}

      {rows.length === 0 && (
        <div className="panel mt-10 p-10 text-center">
          <p className="title text-xl">No open jobs</p>
          <p className="mt-2 text-steel">
            Bookings from the website and the chat show up here. Try booking one on the <Link href="/book" className="underline">booking page</Link>.
          </p>
        </div>
      )}

      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="mt-10">
          <h2 className={`title flex flex-wrap items-baseline gap-3 text-xl ${day < today ? "text-warn" : ""}`}>
            {day === today ? "Today, " : ""}
            {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
            <span className="text-sm font-normal text-steel">
              {items.length} job{items.length === 1 ? "" : "s"}{day < today ? ", not marked yet" : ""}
            </span>
          </h2>
          <ul className="panel mt-3 divide-y divide-mist/70 overflow-hidden">
            {items.map((r) => (
              <li key={r.id} className="relative grid gap-4 p-5 pl-6 lg:grid-cols-[8.5rem_1fr_1fr_auto] lg:gap-6">
                <span aria-hidden className={`absolute top-0 bottom-0 left-0 w-1 ${STATUS_BAR[r.status]}`} />
                <div>
                  <p className="readout text-3xl leading-none">{formatTime(r.starts_at)}</p>
                  <p className="mt-1 text-sm text-steel">until {formatTime(r.ends_at)}</p>
                  <span className={`pill mt-2 ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-bold">
                    {r.services?.name} <span className="font-normal text-steel">{r.services ? formatPeso(Number(r.services.price_php)) : ""}</span>
                  </p>
                  <p className="mt-1 text-sm text-steel">
                    {r.ref}, booked {r.source === "chat" ? "by the AI receptionist" : r.source === "staff" ? "by staff" : "on the website"} {formatDateTime(r.created_at, { weekday: undefined })}
                    {r.conversation_id && (
                      <>
                        {" "}
                        <Link href={`/admin/inbox?c=${r.conversation_id}`} className="font-bold text-ink underline underline-offset-2">see chat</Link>
                      </>
                    )}
                  </p>
                  <div className="mt-3">
                    {r.status === "booked" ? (
                      <form action={setAppointmentTechnician} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="back" value={back} />
                        <label htmlFor={`tech-${r.id}`} className="text-sm text-steel">
                          Technician
                        </label>
                        <select
                          id={`tech-${r.id}`}
                          name="technician_id"
                          defaultValue={r.technician_id ?? ""}
                          className={`rounded-lg border-[1.5px] bg-white px-2 py-1 text-sm ${r.technician_id ? "border-mist" : "border-sun font-bold"}`}
                        >
                          <option value="">Unassigned</option>
                          {technicians.map((t) => (
                            <option key={t.id} value={t.id}>{t.full_name}</option>
                          ))}
                          {r.technician_id && !technicians.some((t) => t.id === r.technician_id) && (
                            <option value={r.technician_id}>{r.technicians?.full_name ?? "Inactive technician"}</option>
                          )}
                        </select>
                        <button className="rounded-lg px-2 py-1 text-sm font-bold underline underline-offset-2 hover:bg-frost">Save</button>
                      </form>
                    ) : (
                      <p className="text-sm text-steel">Technician: {r.technicians?.full_name ?? "none"}</p>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-bold">{r.customers?.name}</p>
                  <p className="text-sm">
                    <a href={`tel:${r.customers?.phone}`} className="underline underline-offset-2">{r.customers?.phone}</a>
                    <span className="text-steel">, </span>
                    <a href={`mailto:${r.customers?.email}`} className="break-all underline underline-offset-2">{r.customers?.email}</a>
                  </p>
                  <p className="mt-1 text-sm text-steel">{r.address}</p>
                  {r.notes && <p className="mt-2 rounded-lg bg-frost px-3 py-1.5 text-sm text-steel">“{r.notes}”</p>}
                </div>
                <form action={setAppointmentStatus} className="lg:w-44">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="back" value={back} />
                  <StatusActions
                    options={[
                      { value: "completed", label: "Mark done", question: `Mark ${r.ref} as done?`, confirm: "Yes, it's done", primary: true },
                      { value: "cancelled", label: "Cancel", question: `Cancel ${r.ref}?`, confirm: "Yes, cancel", danger: true },
                    ]}
                  />
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-12 max-w-2xl text-sm text-steel">
        Marking a job done lets the follow up email go out a day later. Cancelled and no show jobs get no reminder or follow up.
        New bookings get a technician automatically: the one with the fewest jobs that day who is free at that time.
      </p>
    </>
  );
}
