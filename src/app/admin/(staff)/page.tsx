import Link from "next/link";
import { setAppointmentStatus } from "@/app/admin/actions";
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
const STATUS_LABEL: Record<Row["status"], string> = {
  booked: "Booked",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "No show",
};

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view = rawView === "past" ? "past" : "upcoming";
  const today = manilaToday();
  // Midnight in Manila (UTC+8, no daylight saving) as an absolute time.
  const startOfToday = new Date(`${today}T00:00:00+08:00`).toISOString();

  const db = await staffDb();
  let query = db
    .from("appointments")
    .select("id, ref, starts_at, ends_at, address, notes, status, source, conversation_id, created_at, customers(name, phone, email), services(name, price_php)");

  query =
    view === "past"
      ? query.lt("starts_at", startOfToday).gte("starts_at", new Date(`${addDays(today, -30)}T00:00:00+08:00`).toISOString()).order("starts_at", { ascending: false })
      : query.gte("starts_at", startOfToday).order("starts_at", { ascending: true });

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const byDay = new Map<string, Row[]>();
  for (const r of rows) {
    const day = manilaDateOf(r.starts_at);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }

  const todayCount = (byDay.get(today) ?? []).filter((r) => r.status === "booked").length;
  const fromChat = rows.filter((r) => r.source === "chat").length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontStretch: "100%" }}>Appointments</h1>
          {view === "upcoming" && (
            <p className="mt-1 text-steel">
              {todayCount} job{todayCount === 1 ? "" : "s"} left today. {fromChat} of {rows.length} upcoming booked by the AI receptionist.
            </p>
          )}
        </div>
        <nav aria-label="Appointment views" className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-mist">
          {Object.entries(VIEWS).map(([key, label]) => (
            <Link
              key={key}
              href={key === "upcoming" ? "/admin" : `/admin?view=${key}`}
              aria-current={view === key ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 ${view === key ? "bg-ink text-frost" : "hover:bg-ice"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-mist bg-white p-10 text-center">
          <p className="text-lg font-bold">{view === "upcoming" ? "No upcoming appointments yet" : "No appointments in the last 30 days"}</p>
          <p className="mt-1 text-steel">
            Bookings from the website and the chat show up here. Try booking one on the <Link href="/book" className="underline">booking page</Link>.
          </p>
        </div>
      )}

      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="mt-10">
          <h2 className="border-b border-mist pb-2 text-xl font-bold" style={{ fontStretch: "100%" }}>
            {day === today ? "Today, " : ""}
            {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
          </h2>
          <ul className="divide-y divide-mist">
            {items.map((r) => (
              <li key={r.id} className="grid gap-4 py-5 lg:grid-cols-[9rem_1fr_1fr_auto] lg:gap-6">
                <div>
                  <p className="readout text-2xl leading-none">{formatTime(r.starts_at)}</p>
                  <p className="mt-1 text-sm text-steel">until {formatTime(r.ends_at)}</p>
                  <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div>
                  <p className="font-bold">{r.services?.name}</p>
                  <p className="text-steel">{r.services ? formatPeso(Number(r.services.price_php)) : ""}</p>
                  <p className="mt-1 text-sm text-steel">
                    {r.ref}, booked {r.source === "chat" ? "by the AI receptionist" : r.source === "staff" ? "by staff" : "on the website"} {formatDateTime(r.created_at, { weekday: undefined })}
                    {r.conversation_id && (
                      <>
                        {" "}
                        <Link href={`/admin/inbox?c=${r.conversation_id}`} className="underline">see chat</Link>
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-bold">{r.customers?.name}</p>
                  <p>
                    <a href={`tel:${r.customers?.phone}`} className="underline underline-offset-2">{r.customers?.phone}</a>
                    <span className="text-steel">, </span>
                    <a href={`mailto:${r.customers?.email}`} className="break-all underline underline-offset-2">{r.customers?.email}</a>
                  </p>
                  <p className="text-steel">{r.address}</p>
                  {r.notes && <p className="mt-1 text-sm italic text-steel">“{r.notes}”</p>}
                </div>
                <form action={setAppointmentStatus} className="flex flex-wrap items-start gap-2 lg:w-48 lg:flex-col lg:items-stretch">
                  <input type="hidden" name="id" value={r.id} />
                  {r.status === "booked" ? (
                    <>
                      <button name="status" value="completed" className="btn btn-ink px-3 py-1.5 text-sm">Mark done</button>
                      <button name="status" value="no_show" className="btn btn-line px-3 py-1.5 text-sm">No show</button>
                      <button name="status" value="cancelled" className="btn btn-line px-3 py-1.5 text-sm">Cancel</button>
                    </>
                  ) : (
                    <button name="status" value="booked" className="btn btn-line px-3 py-1.5 text-sm">Set back to booked</button>
                  )}
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-12 max-w-2xl text-sm text-steel">
        Marking a job done lets the follow up email go out a day later. Cancelled and no show jobs get no reminder or follow up.
      </p>
    </>
  );
}
