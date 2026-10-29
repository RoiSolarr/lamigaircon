import Link from "next/link";
import { resolveHandoff } from "@/app/admin/actions";
import { formatDateTime } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

type Conversation = {
  id: string;
  created_at: string;
  last_message_at: string;
  needs_human: boolean;
  handoff_name: string | null;
  handoff_contact: string | null;
  handoff_reason: string | null;
  handoff_requested_at: string | null;
  resolved_at: string | null;
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const db = await staffDb();

  const { data, error } = await db
    .from("conversations")
    .select("id, created_at, last_message_at, needs_human, handoff_name, handoff_contact, handoff_reason, handoff_requested_at, resolved_at")
    .order("needs_human", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const conversations = (data ?? []) as Conversation[];

  const selectedId = c && conversations.some((x) => x.id === c) ? c : conversations[0]?.id;
  const selected = conversations.find((x) => x.id === selectedId);

  const [{ data: messages }, { data: bookings }] = selectedId
    ? await Promise.all([
        db.from("messages").select("id, role, content, created_at").eq("conversation_id", selectedId).order("id"),
        db.from("appointments").select("ref, starts_at, status, services(name)").eq("conversation_id", selectedId),
      ])
    : [{ data: [] }, { data: [] }];

  const waiting = conversations.filter((x) => x.needs_human).length;

  return (
    <>
      <h1 className="text-3xl font-bold" style={{ fontStretch: "100%" }}>Inbox</h1>
      <p className="mt-1 text-steel">
        Every chat with the AI receptionist. {waiting > 0 ? `${waiting} waiting for a person: call or text them, then mark it handled.` : "Nothing is waiting for a person right now."}
      </p>

      {conversations.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-mist bg-white p-10 text-center">
          <p className="text-lg font-bold">No chats yet</p>
          <p className="mt-1 text-steel">Open the website and ask the receptionist something. The chat appears here.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
          <ul className="max-h-[70vh] divide-y divide-mist overflow-y-auto rounded-2xl bg-white ring-1 ring-mist">
            {conversations.map((x) => (
              <li key={x.id}>
                <Link
                  href={`/admin/inbox?c=${x.id}`}
                  aria-current={x.id === selectedId ? "true" : undefined}
                  className={`block px-4 py-3 ${x.id === selectedId ? "bg-ice" : "hover:bg-frost"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{x.handoff_name ?? "Website visitor"}</span>
                    {x.needs_human && <span className="rounded-full bg-sun px-2 text-sm font-bold text-deep">Needs a person</span>}
                  </div>
                  <p className="text-sm text-steel">{formatDateTime(x.last_message_at)}</p>
                </Link>
              </li>
            ))}
          </ul>

          {selected && (
            <section aria-label="Conversation" className="rounded-2xl bg-white p-5 ring-1 ring-mist sm:p-6">
              {selected.handoff_requested_at && (
                <div className={`mb-6 rounded-xl p-4 ${selected.needs_human ? "bg-sun/25" : "bg-frost"}`}>
                  <p className="font-bold">
                    {selected.needs_human ? "The receptionist passed this to staff" : `Handled ${selected.resolved_at ? formatDateTime(selected.resolved_at) : ""}`}
                  </p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                    <dt className="text-steel">Name</dt>
                    <dd>{selected.handoff_name ?? "Not given"}</dd>
                    <dt className="text-steel">Contact</dt>
                    <dd className="font-bold">{selected.handoff_contact}</dd>
                    <dt className="text-steel">Reason</dt>
                    <dd>{selected.handoff_reason}</dd>
                  </dl>
                  {selected.needs_human && (
                    <form action={resolveHandoff} className="mt-4">
                      <input type="hidden" name="id" value={selected.id} />
                      <button className="btn btn-ink px-4 py-2 text-sm">Mark as handled</button>
                    </form>
                  )}
                </div>
              )}

              {bookings && bookings.length > 0 && (
                <p className="mb-4 text-steel">
                  Booked in this chat:{" "}
                  {bookings
                    .map((b) => {
                      const svc = (b.services as unknown as { name: string } | null)?.name ?? "";
                      return `${b.ref} (${svc}, ${formatDateTime(b.starts_at)}, ${b.status})`;
                    })
                    .join("; ")}
                </p>
              )}

              <ol className="space-y-3">
                {(messages ?? []).map((m) => (
                  <li key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-frost" : "bg-ink text-frost"}`}>
                      <p className="text-xs opacity-70">
                        {m.role === "user" ? "Customer" : "AI receptionist"}, {formatDateTime(m.created_at, { weekday: undefined, month: undefined, day: undefined })}
                      </p>
                      <p className="whitespace-pre-line">{m.content}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </>
  );
}
