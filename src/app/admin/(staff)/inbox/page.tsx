import Link from "next/link";
import { resolveHandoff, setAiPaused, staffReply } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { formatDateTime } from "@/lib/format";
import { AutoRefresh, InboxThread, type ThreadMessage } from "./thread";
import { staffDb } from "@/lib/supabase/server";

type Person = { name: string; phone: string; email: string };

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
  ai_paused: boolean;
  customer_accounts: { full_name: string; phone: string; email: string } | null;
  customers: Person | null;
};

// Who is this chat with? Signed in account first, then the customer who booked
// in this chat, then the name given when the AI passed the chat to staff.
function whoIs(x: Conversation) {
  if (x.customer_accounts) {
    return {
      name: x.customer_accounts.full_name,
      kind: "Signed in",
      contact: [x.customer_accounts.phone, x.customer_accounts.email].filter(Boolean).join(", "),
    };
  }
  if (x.customers) {
    return { name: x.customers.name, kind: "Guest, booked", contact: `${x.customers.phone}, ${x.customers.email}` };
  }
  if (x.handoff_name) {
    return { name: x.handoff_name, kind: "Guest", contact: x.handoff_contact ?? "" };
  }
  return { name: "Website visitor", kind: "Guest", contact: x.handoff_contact ?? "" };
}

const ROLE_LABEL = { assistant: "AI receptionist", staff: "Staff" } as const;

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string; error?: string }> }) {
  const { c, error: actionError } = await searchParams;
  const db = await staffDb();

  const { data, error } = await db
    .from("conversations")
    .select(
      "id, created_at, last_message_at, needs_human, handoff_name, handoff_contact, handoff_reason, handoff_requested_at, resolved_at, ai_paused, customer_accounts(full_name, phone, email), customers(name, phone, email)",
    )
    .order("needs_human", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const conversations = (data ?? []) as unknown as Conversation[];

  const selectedId = c && conversations.some((x) => x.id === c) ? c : conversations[0]?.id;
  const selected = conversations.find((x) => x.id === selectedId);
  const person = selected ? whoIs(selected) : null;
  const back = selectedId ? `/admin/inbox?c=${selectedId}` : "/admin/inbox";

  const [{ data: messages }, { data: bookings }] = selectedId
    ? await Promise.all([
        db.from("messages").select("id, role, content, created_at").eq("conversation_id", selectedId).order("id"),
        db.from("appointments").select("ref, starts_at, status, services(name)").eq("conversation_id", selectedId),
      ])
    : [{ data: [] }, { data: [] }];

  const waiting = conversations.filter((x) => x.needs_human).length;

  const thread: ThreadMessage[] = (messages ?? []).map((m) => ({
    id: m.id as number,
    role: m.role as ThreadMessage["role"],
    content: m.content as string,
    who: m.role === "user" ? (person?.name ?? "Customer") : ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? "AI receptionist",
    time: formatDateTime(m.created_at as string, { weekday: undefined, month: undefined, day: undefined }),
  }));

  return (
    <>
      <AutoRefresh />
      <ErrorBanner message={actionError} />
      <AdminPageHeader title="Inbox">
        Every chat with the AI receptionist. Reply to any chat: the customer sees your reply in their chat window, and the
        AI stays quiet in that chat until you let it answer again.{" "}
        <strong className="text-ink">{waiting > 0 ? `${waiting} waiting for a person.` : "Nothing is waiting for a person right now."}</strong>
      </AdminPageHeader>

      {conversations.length === 0 ? (
        <div className="panel mt-10 p-10 text-center">
          <p className="title text-xl">No chats yet</p>
          <p className="mt-2 text-steel">Open the website and ask the receptionist something. The chat appears here.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:h-[calc(100dvh-13rem)] lg:min-h-[34rem] lg:grid-cols-[20rem_1fr]">
          <ul className={`panel divide-y divide-mist/70 overflow-y-auto lg:block ${c ? "hidden" : ""}`} aria-label="Chats">
            {conversations.map((x) => {
              const who = whoIs(x);
              const current = x.id === selectedId;
              return (
                <li key={x.id}>
                  <Link
                    href={`/admin/inbox?c=${x.id}`}
                    aria-current={current ? "true" : undefined}
                    className={`relative flex items-start gap-3 px-4 py-3.5 transition-colors ${current ? "bg-ice" : "hover:bg-frost"}`}
                  >
                    {current && <span aria-hidden className="absolute top-0 bottom-0 left-0 w-1 bg-ink" />}
                    <span className={`avatar ${who.kind === "Signed in" ? "bg-ink text-frost" : ""}`}>
                      {who.name === "Website visitor" ? "?" : initials(who.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold">{who.name}</span>
                        {x.needs_human && <span className="pill shrink-0 bg-sun text-deep">Needs a person</span>}
                      </span>
                      <span className="block truncate text-sm text-steel">
                        {who.kind}
                        {x.ai_paused ? ", staff answering" : ""}
                      </span>
                      <span className="block text-xs text-steel">{formatDateTime(x.last_message_at)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {selected && person && (
            <section aria-label="Conversation" className={`panel min-h-0 flex-col overflow-hidden lg:flex ${c ? "flex" : "hidden"}`}>
              <div className="border-b border-mist/70 px-5 py-4 sm:px-6">
                <Link href="/admin/inbox" className="mb-3 inline-flex items-center gap-1 text-sm text-steel underline underline-offset-2 lg:hidden">
                  All chats
                </Link>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`avatar h-11 w-11 ${person.kind === "Signed in" ? "bg-ink text-frost" : ""}`}>
                      {person.name === "Website visitor" ? "?" : initials(person.name)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="title flex flex-wrap items-center gap-2 text-xl">
                        {person.name}
                        <span className={`pill text-xs ${person.kind === "Signed in" ? "bg-ok/10 text-ok" : "bg-frost text-steel"}`}>{person.kind}</span>
                      </h2>
                      <p className="truncate text-sm text-steel">{person.contact || "No contact details yet"}</p>
                    </div>
                  </div>
                  <form action={setAiPaused} className="flex items-center gap-3">
                    <input type="hidden" name="id" value={selected.id} />
                    <input type="hidden" name="back" value={back} />
                    <input type="hidden" name="paused" value={selected.ai_paused ? "false" : "true"} />
                    <span className={`hidden items-center gap-1.5 text-sm sm:flex ${selected.ai_paused ? "text-sun-deep" : "text-ok"}`}>
                      <span aria-hidden className={`h-2 w-2 rounded-full ${selected.ai_paused ? "bg-sun" : "bg-ok"}`} />
                      {selected.ai_paused ? "AI paused" : "AI answering"}
                    </span>
                    <button className="btn btn-quiet btn-sm">
                      {selected.ai_paused ? "Let the AI answer again" : "Pause the AI in this chat"}
                    </button>
                  </form>
                </div>

                {selected.handoff_requested_at && (
                  <div className={`mt-4 rounded-xl p-4 ${selected.needs_human ? "bg-sun/20 ring-1 ring-sun/60" : "bg-frost"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="font-bold">
                        {selected.needs_human ? "The receptionist passed this to staff" : `Handled ${selected.resolved_at ? formatDateTime(selected.resolved_at) : ""}`}
                      </p>
                      {selected.needs_human && (
                        <form action={resolveHandoff}>
                          <input type="hidden" name="id" value={selected.id} />
                          <input type="hidden" name="back" value={back} />
                          <button className="btn btn-ink btn-sm">Mark as handled</button>
                        </form>
                      )}
                    </div>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                      <dt className="text-steel">Name</dt>
                      <dd>{selected.handoff_name ?? "Not given"}</dd>
                      <dt className="text-steel">Contact</dt>
                      <dd className="font-bold">{selected.handoff_contact}</dd>
                      <dt className="text-steel">Reason</dt>
                      <dd>{selected.handoff_reason}</dd>
                    </dl>
                  </div>
                )}

                {bookings && bookings.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Booked in this chat">
                    {bookings.map((b) => {
                      const svc = (b.services as unknown as { name: string } | null)?.name ?? "";
                      return (
                        <li key={b.ref} className="pill bg-frost font-normal text-ink ring-1 ring-mist/70">
                          <strong>{b.ref}</strong> {svc}, {formatDateTime(b.starts_at)}, {b.status}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <InboxThread key={selected.id} messages={thread} />

              <form action={staffReply} className="border-t border-mist/70 bg-white px-5 py-4 sm:px-6">
                <input type="hidden" name="id" value={selected.id} />
                <input type="hidden" name="back" value={back} />
                <label htmlFor="reply" className="sr-only">Reply to {person.name}</label>
                <div className="flex items-end gap-2 rounded-2xl bg-frost p-1.5 ring-1 ring-mist focus-within:ring-2 focus-within:ring-ink">
                  <textarea
                    id="reply"
                    name="message"
                    required
                    rows={2}
                    maxLength={2000}
                    placeholder={`Reply to ${person.name}`}
                    className="max-h-40 min-h-12 w-full resize-y bg-transparent px-2.5 py-2 text-ink placeholder:text-steel/70 focus:outline-none"
                  />
                  <button className="btn btn-ink h-11 shrink-0 px-5 py-0">Send reply</button>
                </div>
                <p className="mt-2 text-xs text-steel">
                  The customer sees replies while the website is open in their browser. If they are signed in, the chat also
                  comes back when they open the chat on any device. This page checks for new messages every 10 seconds.
                </p>
              </form>
            </section>
          )}
        </div>
      )}
    </>
  );
}
