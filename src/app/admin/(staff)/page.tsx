import Link from "next/link";
import { setAppointmentStatus, setAppointmentTechnician } from "@/app/admin/actions";
import { AdminPageHeader, StatStrip } from "@/components/AdminPageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { addDays, formatDateTime, formatPeso, formatTime, manilaDateOf, manilaToday } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

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

const VIEWS = {
  upcoming: "Upcoming",
  past: "Past 30 days",
} as const;

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

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ view?: string; error?: string }> }) {
  const { view: rawView, error: actionError } = await searchParams;
  const view = rawView === "past" ? "past" : "upcoming";
  const today = manilaToday();
  // Midnight in Manila (UTC+8, no daylight saving) as an absolute time.
  const startOfToday = new Date(`${today}T00:00:00+08:00`).toISOString();

  const db = await staffDb();
  let query = db
    .from("appointments")
    .select("id, ref, starts_at, ends_at, address, notes, status, source, conversation_id, created_at, technician_id, customers(name, phone, email), services(name, price_php), technicians(full_name)");

  query =
    view === "past"
      ? query.lt("starts_at", startOfToday).gte("starts_at", new Date(`${addDays(today, -30)}T00:00:00+08:00`).toISOString()).order("starts_at", { ascending: false })
      : query.gte("starts_at", startOfToday).order("starts_at", { ascending: true });

  const [{ data, error }, { data: techData }] = await Promise.all([
    query.limit(200),
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

  const todayCount = (byDay.get(today) ?? []).filter((r) => r.status === "booked").length;
  const fromChat = rows.filter((r) => r.source === "chat").length;
  const unassigned = rows.filter((r) => r.status === "booked" && !r.technician_id).length;
  const back = view === "past" ? "/admin?view=past" : "/admin";

  return (
    <>
      <ErrorBanner message={actionError} />
      <AdminPageHeader
        title="Appointments"
        actions={
          <nav aria-label="Appointment views" className="flex gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)] ring-1 ring-mist/70">
            {Object.entries(VIEWS).map(([key, label]) => (
              <Link
                key={key}
                href={key === "upcoming" ? "/admin" : `/admin?view=${key}`}
                aria-current={view === key ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 font-bold transition-colors ${view === key ? "bg-ink text-frost" : "text-steel hover:text-ink"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        }
      >
        {view === "upcoming" ? "Every booking from the website and the AI receptionist, from today on." : "Jobs from the last 30 days, newest first."}
      </AdminPageHeader>

      {view === "upcoming" && (
        <StatStrip
          stats={[
            { label: "Jobs left today", value: todayCount },
            { label: "Upcoming jobs", value: rows.length },
            { label: "Booked by the AI", value: fromChat },
            { label: "No technician yet", value: unassigned, tone: unassigned > 0 ? "warn" : undefined },
          ]}
        />
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
          <p className="title text-xl">{view === "upcoming" ? "No upcoming appointments yet" : "No appointments in the last 30 days"}</p>
          <p className="mt-2 text-steel">
            Bookings from the website and the chat show up here. Try booking one on the <Link href="/book" className="underline">booking page</Link>.
          </p>
        </div>
      )}

      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="mt-10">
          <h2 className="title flex items-baseline gap-3 text-xl">
            {day === today ? "Today, " : ""}
            {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
            <span className="text-sm font-normal text-steel">
              {items.length} job{items.length === 1 ? "" : "s"}
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
                <form action={setAppointmentStatus} className="flex flex-wrap items-start gap-2 lg:w-40 lg:flex-col lg:items-stretch">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="back" value={back} />
                  {r.status === "booked" ? (
                    <>
                      <button name="status" value="completed" className="btn btn-ink btn-sm">Mark done</button>
                      <button name="status" value="no_show" className="btn btn-quiet btn-sm">No show</button>
                      <button name="status" value="cancelled" className="btn btn-quiet btn-sm hover:!border-bad hover:text-bad">Cancel</button>
                    </>
                  ) : (
                    <button name="status" value="booked" className="btn btn-quiet btn-sm">Set back to booked</button>
                  )}
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
