import { retryNotification } from "@/app/admin/actions";
import { formatDateTime } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

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

export default async function AutomationPage() {
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

  if (recent.error) throw new Error(recent.error.message);
  const rows = (recent.data ?? []) as unknown as Notification[];
  const overdueCount = overdue.count ?? 0;

  const stats = [
    { label: "Sent in the last 24 hours", value: sent24.count ?? 0 },
    { label: "Waiting to send", value: pending.count ?? 0, note: "includes future reminders and follow ups" },
    { label: "Failed after 3 tries", value: failed.count ?? 0, bad: (failed.count ?? 0) > 0 },
    { label: "Chat messages in 24 hours", value: chats24.count ?? 0 },
  ];

  return (
    <>
      <h1 className="text-3xl font-bold" style={{ fontStretch: "100%" }}>Automation</h1>
      <p className="mt-1 max-w-3xl text-steel">
        The n8n Notifications workflow sends these emails. It runs every 5 minutes and right after each website booking.
        This page is how you check that it is working.
      </p>

      <div
        role="status"
        className={`mt-6 rounded-2xl p-5 ${overdueCount > 0 ? "bg-bad/10 text-bad" : "bg-ok/10 text-ok"}`}
      >
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

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-5 ring-1 ring-mist">
            <dt className="text-steel">{s.label}</dt>
            <dd className={`readout mt-1 text-4xl ${s.bad ? "text-bad" : ""}`}>{s.value}</dd>
            {s.note && <dd className="text-sm text-steel">{s.note}</dd>}
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-xl font-bold" style={{ fontStretch: "100%" }}>Recent emails</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-steel">No emails yet. Make a booking on the website and the confirmation shows up here.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-mist">
          <table className="w-full min-w-[46rem] text-left">
            <thead className="border-b border-mist text-steel">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Email</th>
                <th scope="col" className="px-4 py-3 font-normal">Booking</th>
                <th scope="col" className="px-4 py-3 font-normal">Due</th>
                <th scope="col" className="px-4 py-3 font-normal">Status</th>
                <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
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
                        <button className="btn btn-line px-3 py-1 text-sm">Send again</button>
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
