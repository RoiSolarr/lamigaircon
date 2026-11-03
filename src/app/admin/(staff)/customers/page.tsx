import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, StatStrip } from "@/components/AdminPageHeader";
import { formatDateTime, formatPeso } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customers" };

type Status = "booked" | "completed" | "cancelled" | "no_show";
type CustomerRow = { id: string; name: string; phone: string; email: string; created_at: string };
type AccountRow = { user_id: string; full_name: string; phone: string; email: string; created_at: string };
type BookingRow = {
  id: string;
  ref: string;
  customer_id: string;
  status: Status;
  starts_at: string;
  services: { name: string; price_php: number } | null;
};
type ChatRow = { id: string; account_id: string | null; customer_id: string | null; last_message_at: string; needs_human: boolean };

type Person = {
  email: string;
  name: string;
  phone: string;
  account: AccountRow | null;
  customer: CustomerRow | null;
  bookings: BookingRow[];
  chats: ChatRow[];
};

const STATUS: Record<Status, { label: string; style: string }> = {
  booked: { label: "Booked", style: "bg-ice text-ink" },
  completed: { label: "Done", style: "bg-ok/10 text-ok" },
  cancelled: { label: "Cancelled", style: "bg-mist/50 text-steel" },
  no_show: { label: "No show", style: "bg-warn/10 text-warn" },
};

const FILTERS = { all: "All", accounts: "With account", guests: "Guests" } as const;

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

// Everyone who booked (lamig.customers) or made an account (lamig.customer_accounts),
// shown as one person per email. Read only: staff see details, bookings and chats.
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; email?: string }> }) {
  const { q: rawQ, show: rawShow, email: rawEmail } = await searchParams;
  const q = (rawQ ?? "").trim().toLowerCase();
  const show = (rawShow && rawShow in FILTERS ? rawShow : "all") as keyof typeof FILTERS;

  const db = await staffDb();
  const [customers, accounts, bookings, chats] = await Promise.all([
    db.from("customers").select("id, name, phone, email, created_at").limit(2000),
    db.from("customer_accounts").select("user_id, full_name, phone, email, created_at").limit(2000),
    db.from("appointments").select("id, ref, customer_id, status, starts_at, services(name, price_php)").order("starts_at", { ascending: false }).limit(5000),
    db.from("conversations").select("id, account_id, customer_id, last_message_at, needs_human").order("last_message_at", { ascending: false }).limit(2000),
  ]);
  if (customers.error) throw new Error(customers.error.message);

  const people = new Map<string, Person>();
  const get = (email: string) => {
    const key = email.toLowerCase();
    if (!people.has(key)) people.set(key, { email: key, name: "", phone: "", account: null, customer: null, bookings: [], chats: [] });
    return people.get(key)!;
  };
  for (const c of (customers.data ?? []) as CustomerRow[]) {
    const p = get(c.email);
    p.customer = c;
    p.name ||= c.name;
    p.phone ||= c.phone;
  }
  for (const a of (accounts.data ?? []) as AccountRow[]) {
    if (!a.email) continue;
    const p = get(a.email);
    p.account = a;
    p.name = a.full_name; // the name the customer chose for their account
    p.phone = a.phone || p.phone;
  }
  const byCustomerId = new Map([...people.values()].filter((p) => p.customer).map((p) => [p.customer!.id, p]));
  const byAccountId = new Map([...people.values()].filter((p) => p.account).map((p) => [p.account!.user_id, p]));
  for (const b of (bookings.data ?? []) as unknown as BookingRow[]) byCustomerId.get(b.customer_id)?.bookings.push(b);
  for (const c of (chats.data ?? []) as ChatRow[]) {
    const p = (c.account_id && byAccountId.get(c.account_id)) || (c.customer_id && byCustomerId.get(c.customer_id));
    if (p && !p.chats.some((x) => x.id === c.id)) p.chats.push(c);
  }

  const lastActivity = (p: Person) =>
    Math.max(
      ...[p.customer?.created_at, p.account?.created_at, p.bookings[0]?.starts_at, p.chats[0]?.last_message_at]
        .filter(Boolean)
        .map((d) => new Date(d!).getTime()),
    );
  const everyone = [...people.values()].sort((a, b) => lastActivity(b) - lastActivity(a));
  const list = everyone.filter(
    (p) =>
      (show === "all" || (show === "accounts" ? p.account : !p.account)) &&
      (!q || [p.name, p.email, p.phone].some((v) => v.toLowerCase().includes(q))),
  );
  const selected = everyone.find((p) => p.email === (rawEmail ?? "").toLowerCase()) ?? (rawEmail ? undefined : list[0]);

  const link = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(show !== "all" ? { show } : {}), ...next });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "show" && v === "all")) p.delete(k);
    const s = p.toString();
    return s ? `/admin/customers?${s}` : "/admin/customers";
  };

  const spent = (p: Person) => p.bookings.filter((b) => b.status === "completed").reduce((s, b) => s + Number(b.services?.price_php ?? 0), 0);

  return (
    <>
      <AdminPageHeader title="Customers">
        Everyone who booked or made an account, one row per email. Open a customer to see their details, bookings and chats.
      </AdminPageHeader>

      <StatStrip
        stats={[
          { label: "Customers", value: everyone.length },
          { label: "With an account", value: everyone.filter((p) => p.account).length },
          { label: "Booked more than once", value: everyone.filter((p) => p.bookings.length > 1).length },
          { label: "Earned from done jobs", value: formatPeso(everyone.reduce((s, p) => s + spent(p), 0)) },
        ]}
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Filter customers" className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)] ring-1 ring-mist/70">
          {Object.entries(FILTERS).map(([key, label]) => (
            <Link
              key={key}
              href={link({ show: key, email: "" })}
              aria-current={show === key ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 font-bold transition-colors ${show === key ? "bg-ink text-frost" : "text-steel hover:text-ink"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex w-full gap-2 sm:w-auto">
          {show !== "all" && <input type="hidden" name="show" value={show} />}
          <label htmlFor="customers-q" className="sr-only">Search customers</label>
          <input id="customers-q" name="q" defaultValue={rawQ ?? ""} placeholder="Name, email or phone" className="field py-2 sm:w-72" />
          <button className="btn btn-ink btn-sm">Search</button>
        </form>
      </div>

      {list.length === 0 && !selected ? (
        <div className="panel mt-6 p-10 text-center">
          <p className="title text-xl">{q ? "No customers match your search" : "No customers yet"}</p>
          <p className="mt-2 text-steel">
            {q ? <Link href={link({ q: "" })} className="underline underline-offset-2">Clear the search</Link> : "Customers appear here after their first booking or sign up."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <ul className={`panel max-h-[70vh] divide-y divide-mist/70 overflow-y-auto lg:block ${rawEmail ? "hidden" : ""}`} aria-label="Customers">
            {list.map((p) => {
              const current = p.email === selected?.email;
              return (
                <li key={p.email}>
                  <Link
                    href={link({ email: p.email })}
                    aria-current={current ? "true" : undefined}
                    className={`relative flex items-center gap-3 px-4 py-3.5 transition-colors ${current ? "bg-ice" : "hover:bg-frost"}`}
                  >
                    {current && <span aria-hidden className="absolute top-0 bottom-0 left-0 w-1 bg-ink" />}
                    <span className={`avatar ${p.account ? "bg-ink text-frost" : ""}`}>{initials(p.name || p.email)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{p.name || p.email}</span>
                      <span className="block truncate text-sm text-steel">{p.email}</span>
                    </span>
                    <span className="text-right text-xs text-steel">
                      <span className="readout block text-lg leading-none text-ink">{p.bookings.length}</span>
                      booking{p.bookings.length === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            })}
            {list.length === 0 && <li className="p-4 text-steel">No customers match.</li>}
          </ul>

          {selected ? (
            <section aria-label="Customer details" className={`panel overflow-hidden lg:block ${rawEmail ? "" : "hidden"}`}>
              <div className="border-b border-mist/70 p-5 sm:p-6">
                <Link href={link({ email: "" })} className="mb-3 inline-block text-sm text-steel underline underline-offset-2 lg:hidden">
                  All customers
                </Link>
                <div className="flex flex-wrap items-center gap-4">
                  <span className={`avatar h-14 w-14 text-xl ${selected.account ? "bg-ink text-frost" : ""}`}>{initials(selected.name || selected.email)}</span>
                  <div className="min-w-0">
                    <h2 className="title flex flex-wrap items-center gap-2 text-2xl">
                      {selected.name || "No name yet"}
                      {selected.account ? (
                        <span className="pill bg-ok/10 text-xs text-ok">Has an account</span>
                      ) : (
                        <span className="pill bg-frost text-xs text-steel">Guest</span>
                      )}
                    </h2>
                    <p className="text-steel">
                      {selected.phone && (
                        <>
                          <a href={`tel:${selected.phone}`} className="underline underline-offset-2">{selected.phone}</a>
                          {", "}
                        </>
                      )}
                      <a href={`mailto:${selected.email}`} className="break-all underline underline-offset-2">{selected.email}</a>
                    </p>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["Bookings", String(selected.bookings.length)],
                    ["Done", String(selected.bookings.filter((b) => b.status === "completed").length)],
                    ["Spent", formatPeso(spent(selected))],
                    ["Customer since", dateOnly(new Date(Math.min(...[selected.customer?.created_at, selected.account?.created_at].filter(Boolean).map((d) => new Date(d!).getTime()))).toISOString())],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-frost px-3 py-2.5">
                      <dt className="text-xs text-steel">{label}</dt>
                      <dd className="font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
                {selected.account && selected.customer?.name && selected.customer.name !== selected.account.full_name && (
                  <p className="mt-3 text-sm text-steel">Booked as &quot;{selected.customer.name}&quot;. Account name: {selected.account.full_name}.</p>
                )}
              </div>

              <div className="p-5 sm:p-6">
                <h3 className="title text-lg">Bookings</h3>
                {selected.bookings.length === 0 ? (
                  <p className="mt-2 text-steel">No bookings yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-mist/70 rounded-2xl ring-1 ring-mist/70">
                    {selected.bookings.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-bold">{b.services?.name}</p>
                          <p className="text-sm text-steel">
                            {b.ref}, {formatDateTime(b.starts_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="readout text-lg">{b.services ? formatPeso(Number(b.services.price_php)) : ""}</span>
                          <span className={`pill ${STATUS[b.status].style}`}>{STATUS[b.status].label}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <h3 className="title mt-8 text-lg">Chats</h3>
                {selected.chats.length === 0 ? (
                  <p className="mt-2 text-steel">No chats linked to this customer.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {selected.chats.map((c) => (
                      <li key={c.id}>
                        <Link href={`/admin/inbox?c=${c.id}`} className="btn btn-quiet btn-sm">
                          Chat, {formatDateTime(c.last_message_at)}
                          {c.needs_human && <span className="pill bg-sun text-xs text-deep">Needs a person</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : (
            rawEmail && (
              <div className="panel p-8 text-center text-steel">
                No customer with that email. <Link href={link({ email: "" })} className="underline">Back to all customers</Link>
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}
