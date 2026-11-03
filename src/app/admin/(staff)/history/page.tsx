import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, StatStrip } from "@/components/AdminPageHeader";
import { DeleteBookingButton } from "@/components/DeleteBookingButton";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NoticeBanner } from "@/components/NoticeBanner";
import { formatDateTime, formatPeso, formatTime } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Booking history" };

type Row = {
  id: string;
  ref: string;
  starts_at: string;
  status: "completed" | "cancelled" | "no_show";
  source: "website" | "chat" | "staff";
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  address: string;
  customers: { name: string; phone: string; email: string } | null;
  services: { name: string; price_php: number } | null;
  technicians: { full_name: string } | null;
};

const FILTERS = {
  all: { label: "All", statuses: ["completed", "cancelled", "no_show"] },
  completed: { label: "Done", statuses: ["completed"] },
  cancelled: { label: "Cancelled", statuses: ["cancelled"] },
  no_show: { label: "No show", statuses: ["no_show"] },
} as const;

const STATUS: Record<Row["status"], { label: string; style: string; bar: string }> = {
  completed: { label: "Done", style: "bg-ok/10 text-ok", bar: "bg-ok" },
  cancelled: { label: "Cancelled", style: "bg-mist/50 text-steel", bar: "bg-mist" },
  no_show: { label: "No show", style: "bg-warn/10 text-warn", bar: "bg-warn" },
};

// Finished jobs: done, cancelled or no show. Newest first, with search.
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; error?: string; notice?: string }>;
}) {
  const { status: rawStatus, q: rawQ, error: actionError, notice } = await searchParams;
  const filter = (rawStatus && rawStatus in FILTERS ? rawStatus : "all") as keyof typeof FILTERS;
  const q = (rawQ ?? "").trim().toLowerCase();

  const db = await staffDb();
  const { data, error } = await db
    .from("appointments")
    .select("id, ref, starts_at, status, source, completed_at, cancelled_at, updated_at, address, customers(name, phone, email), services(name, price_php), technicians(full_name)")
    .in("status", ["completed", "cancelled", "no_show"])
    .order("starts_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const all = (data ?? []) as unknown as Row[];

  const matches = (r: Row) =>
    !q ||
    [r.ref, r.customers?.name, r.customers?.email, r.customers?.phone, r.services?.name]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  const rows = all.filter((r) => (FILTERS[filter].statuses as readonly string[]).includes(r.status) && matches(r));

  const done = all.filter((r) => r.status === "completed");
  const earned = done.reduce((sum, r) => sum + Number(r.services?.price_php ?? 0), 0);
  const params = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...(filter !== "all" ? { status: filter } : {}), ...(q ? { q } : {}), ...next });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "status" && v === "all")) p.delete(k);
    const s = p.toString();
    return s ? `/admin/history?${s}` : "/admin/history";
  };
  const back = params({});

  return (
    <>
      <ErrorBanner message={actionError} />
      <NoticeBanner message={notice} />
      <AdminPageHeader title="Booking history" actions={<Link href="/admin" className="btn btn-quiet btn-sm">Open jobs</Link>}>
        Every job that is done, cancelled or marked no show. Use the bin icon to delete a booking you no longer need.
      </AdminPageHeader>

      <StatStrip
        stats={[
          { label: "Jobs done", value: done.length },
          { label: "Earned from done jobs", value: formatPeso(earned) },
          { label: "Cancelled", value: all.filter((r) => r.status === "cancelled").length },
          { label: "No show", value: all.filter((r) => r.status === "no_show").length },
        ]}
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)] ring-1 ring-mist/70">
          {Object.entries(FILTERS).map(([key, f]) => (
            <Link
              key={key}
              href={params({ status: key })}
              aria-current={filter === key ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 font-bold transition-colors ${filter === key ? "bg-ink text-frost" : "text-steel hover:text-ink"}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex w-full gap-2 sm:w-auto">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <label htmlFor="history-q" className="sr-only">Search bookings</label>
          <input id="history-q" name="q" defaultValue={rawQ ?? ""} placeholder="Name, email, phone or reference" className="field py-2 sm:w-80" />
          <button className="btn btn-ink btn-sm">Search</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="panel mt-6 p-10 text-center">
          <p className="title text-xl">{q ? "No bookings match your search" : "No finished jobs yet"}</p>
          <p className="mt-2 text-steel">
            {q ? (
              <Link href={params({ q: "" })} className="underline underline-offset-2">Clear the search</Link>
            ) : (
              "Jobs show up here after you mark them done, no show or cancelled on Appointments."
            )}
          </p>
        </div>
      ) : (
        <ul className="panel mt-6 divide-y divide-mist/70 overflow-hidden">
          {rows.map((r) => {
            const s = STATUS[r.status];
            const closedAt = r.completed_at ?? r.cancelled_at ?? r.updated_at;
            return (
              <li key={r.id} className="relative grid gap-4 p-5 pl-6 lg:grid-cols-[10rem_1fr_1fr_auto] lg:items-start lg:gap-6">
                <span aria-hidden className={`absolute top-0 bottom-0 left-0 w-1 ${s.bar}`} />
                <div>
                  <p className="font-bold">
                    {new Date(r.starts_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  <p className="text-sm text-steel">{formatTime(r.starts_at)}</p>
                  <span className={`pill mt-2 ${s.style}`}>{s.label}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-bold">
                    {r.services?.name} <span className="font-normal text-steel">{r.services ? formatPeso(Number(r.services.price_php)) : ""}</span>
                  </p>
                  <p className="text-sm text-steel">
                    {r.ref}, booked {r.source === "chat" ? "by the AI receptionist" : r.source === "staff" ? "by staff" : "on the website"}
                  </p>
                  <p className="text-sm text-steel">
                    Technician: {r.technicians?.full_name ?? "none"}. {s.label} {formatDateTime(closedAt, { weekday: undefined })}.
                  </p>
                </div>
                <div className="min-w-0">
                  {r.customers ? (
                    <Link href={`/admin/customers/${encodeURIComponent(r.customers.email)}`} className="font-bold underline-offset-2 hover:underline">
                      {r.customers.name}
                    </Link>
                  ) : (
                    <p className="font-bold">Unknown customer</p>
                  )}
                  <p className="text-sm text-steel">{[r.customers?.phone, r.customers?.email].filter(Boolean).join(", ")}</p>
                  <p className="text-sm text-steel">{r.address}</p>
                </div>
                <div className="lg:justify-self-end">
                  <DeleteBookingButton
                    id={r.id}
                    bookingRef={r.ref}
                    label={`${r.services?.name ?? "booking"} for ${r.customers?.name ?? "an unknown customer"}`}
                    back={back}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {all.length === 500 && <p className="mt-4 text-sm text-steel">Showing the newest 500 finished jobs.</p>}
    </>
  );
}
