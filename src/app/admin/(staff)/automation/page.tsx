import type { Metadata } from "next";
import { retryNotification, retryScheduleEmail } from "@/app/admin/actions";
import { AdminPageHeader, StatStrip } from "@/components/AdminPageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { formatDateTime } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Automation" };

type Notification = {
  id: number;
  kind: "confirmation" | "reminder" | "follow_up";
  send_at: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  appointments: { ref: string; customers: { email: string } | null } | null;
};

const KIND: Record<Notification["kind"], string> = {
  confirmation: "Confirmation",
  reminder: "Reminder",
  follow_up: "Follow up",
};
const STATUS: Record<Notification["status"], string> = {
  pending: "text-steel",
  sending: "text-ink",
  sent: "text-ok",
  failed: "text-bad",
  skipped: "text-steel",
};

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

type ScheduleEmail = {
  id: number;
  work_date: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  send_count: number;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  technicians: { full_name: string; email: string | null } | null;
};

export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: actionError } = await searchParams;
  const db = await staffDb();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const overdueCutoff = new Date(now.getTime() - 15 * 60_000).toISOString();

  const count = (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => build(base());
  function base() {
    return db.from("notifications").select("id", { count: "exact", head: true });
  }

  const [pending, overdue, sent24, failed, recent, lastSent, chats24] = await Promise.all([
    count((q) => q.eq("status", "pending")),
    count((q) => q.eq("status", "pending").lt("send_at", overdueCutoff)),
    count((q) => q.eq("status", "sent").gte("sent_at", dayAgo)),
    count((q) => q.eq("status", "failed")),
    db
      .from("notifications")
      .select("id, kind, send_at, status, attempts, last_error, sent_at, appointments(ref, customers(email))")
      .or(`status.neq.pending,send_at.lte.${now.toISOString()}`)
      .order("send_at", { ascending: false })
      .limit(50),
    db.from("notifications").select("sent_at").eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", dayAgo),
  ]);
  const { data: scheduleData } = await db
    .from("schedule_emails")
    .select("id, work_date, status, send_count, attempts, last_error, sent_at, technicians(full_name, email)")
    .order("work_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(30);
  const schedules = (scheduleData ?? []) as unknown as ScheduleEmail[];

  if (recent.error) throw new Error(recent.error.message);
  const rows = (recent.data ?? []) as unknown as Notification[];
  const overdueCount = overdue.count ?? 0;

  const stats = [
    { label: "Sent in the last 24 hours", value: sent24.count ?? 0 },
    { label: "Waiting to send", value: pending.count ?? 0, note: "includes future reminders and follow ups" },
    { label: "Failed after 3 tries", value: failed.count ?? 0, tone: (failed.count ?? 0) > 0 ? ("bad" as const) : undefined },
    { label: "Chat messages in 24 hours", value: chats24.count ?? 0 },
  ];

  return (
    <>
      <ErrorBanner message={actionError} />
      <AdminPageHeader title="Automation">
        The n8n Notifications workflow sends these emails. It runs every 5 minutes and right after each website booking.
        This page is how you check that it is working.
      </AdminPageHeader>

      <div
        role="status"
        className={`mt-8 flex items-start gap-4 rounded-2xl p-5 ring-1 ${overdueCount > 0 ? "bg-bad/8 text-bad ring-bad/25" : "bg-ok/8 text-ok ring-ok/25"}`}
      >
        <span aria-hidden className={`mt-1 h-3 w-3 shrink-0 rounded-full ${overdueCount > 0 ? "bg-bad" : "bg-ok ring-4 ring-ok/20"}`} />
        <div>
        {overdueCount > 0 ? (
          <>
            <p className="font-bold">
              {overdueCount} email{overdueCount === 1 ? " is" : "s are"} more than 15 minutes late.
            </p>
            <p className="mt-1 text-ink">
              The Notifications workflow is probably not running. In n8n, check that it is Active, and open Executions to see
              errors. On a free Render plan, n8n may be asleep: the wake up step in n8n/SETUP.md keeps it awake.
            </p>
          </>
        ) : (
          <p className="font-bold">
            On schedule. {lastSent.data?.sent_at ? `Last email sent ${ago(lastSent.data.sent_at)}.` : "No email sent yet."}
          </p>
        )}
        </div>
      </div>

      <StatStrip stats={stats} />

      <h2 className="title mt-12 text-xl">Recent emails</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-steel">No emails yet. Make a booking on the website and the confirmation shows up here.</p>
      ) : (
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left">
            <thead className="border-b border-mist/70 bg-frost/60 text-sm text-steel">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Email</th>
                <th scope="col" className="px-4 py-3 font-normal">Booking</th>
                <th scope="col" className="px-4 py-3 font-normal">Due</th>
                <th scope="col" className="px-4 py-3 font-normal">Status</th>
                <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist/70">
              {rows.map((n) => (
                <tr key={n.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-bold">{KIND[n.kind]}</p>
                    <p className="text-sm break-all text-steel">{n.appointments?.customers?.email}</p>
                  </td>
                  <td className="px-4 py-3">{n.appointments?.ref}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(n.send_at)}</td>
                  <td className="px-4 py-3">
                    <p className={`font-bold ${STATUS[n.status]}`}>
                      {n.status === "sent" && n.sent_at ? `Sent ${ago(n.sent_at)}` : n.status[0].toUpperCase() + n.status.slice(1)}
                    </p>
                    {n.attempts > 1 && <p className="text-sm text-steel">{n.attempts} tries</p>}
                    {n.last_error && <p className="max-w-xs text-sm text-steel">{n.last_error}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {n.status === "failed" && (
                      <form action={retryNotification}>
                        <input type="hidden" name="id" value={n.id} />
                        <button className="btn btn-quiet btn-sm">Send again</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="title mt-12 text-xl">Technician schedules</h2>
      <p className="mt-1 max-w-3xl text-steel">
        The n8n Technician Schedules workflow sends each technician their jobs for tomorrow every evening, and an
        updated schedule when a job changes after that.
      </p>
      {schedules.length === 0 ? (
        <p className="mt-3 text-steel">No schedule emails yet. They start in the evening for technicians with jobs the next day.</p>
      ) : (
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="border-b border-mist/70 bg-frost/60 text-sm text-steel">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Technician</th>
                <th scope="col" className="px-4 py-3 font-normal">Work day</th>
                <th scope="col" className="px-4 py-3 font-normal">Status</th>
                <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist/70">
              {schedules.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-bold">{e.technicians?.full_name}</p>
                    <p className="text-sm break-all text-steel">{e.technicians?.email ?? "no email"}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(`${e.work_date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                  </td>
                  <td className="px-4 py-3">
                    <p className={`font-bold ${STATUS[e.status]}`}>
                      {e.status === "sent" && e.sent_at
                        ? `Sent ${ago(e.sent_at)}${e.send_count > 1 ? `, ${e.send_count} versions` : ""}`
                        : e.status[0].toUpperCase() + e.status.slice(1)}
                    </p>
                    {e.last_error && <p className="max-w-xs text-sm text-steel">{e.last_error}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(e.status === "failed" || e.status === "skipped") && (
                      <form action={retryScheduleEmail}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="btn btn-quiet btn-sm">Send again</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
