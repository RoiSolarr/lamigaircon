import { staffDb } from "@/lib/supabase/server";

// Shared by the Customers list and the customer page.
// Everyone who booked (lamig.customers) or made an account (lamig.customer_accounts),
// merged into one person per email.

export type Status = "booked" | "completed" | "cancelled" | "no_show";
export type CustomerRow = { id: string; name: string; phone: string; email: string; created_at: string };
export type AccountRow = { user_id: string; full_name: string; phone: string; email: string; created_at: string };
export type BookingRow = {
  id: string;
  ref: string;
  customer_id: string;
  status: Status;
  starts_at: string;
  address: string;
  source: "website" | "chat" | "staff";
  services: { name: string; price_php: number } | null;
  technicians: { full_name: string } | null;
};
export type ChatRow = { id: string; account_id: string | null; customer_id: string | null; last_message_at: string; needs_human: boolean };

export type Person = {
  email: string;
  name: string;
  phone: string;
  account: AccountRow | null;
  customer: CustomerRow | null;
  bookings: BookingRow[];
  chats: ChatRow[];
};

export const STATUS: Record<Status, { label: string; style: string }> = {
  booked: { label: "Booked", style: "bg-ice text-ink" },
  completed: { label: "Done", style: "bg-ok/10 text-ok" },
  cancelled: { label: "Cancelled", style: "bg-mist/50 text-steel" },
  no_show: { label: "No show", style: "bg-warn/10 text-warn" },
};

export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

export const spent = (p: Person) =>
  p.bookings.filter((b) => b.status === "completed").reduce((s, b) => s + Number(b.services?.price_php ?? 0), 0);

export const lastActivity = (p: Person) =>
  Math.max(
    ...[p.customer?.created_at, p.account?.created_at, p.bookings[0]?.starts_at, p.chats[0]?.last_message_at]
      .filter(Boolean)
      .map((d) => new Date(d!).getTime()),
  );

export const customerSince = (p: Person) =>
  dateOnly(
    new Date(Math.min(...[p.customer?.created_at, p.account?.created_at].filter(Boolean).map((d) => new Date(d!).getTime()))).toISOString(),
  );

export const customerHref = (email: string) => `/admin/customers/${encodeURIComponent(email)}`;

// Everyone, most recently active first.
export async function loadPeople(): Promise<Person[]> {
  const db = await staffDb();
  const [customers, accounts, bookings, chats] = await Promise.all([
    db.from("customers").select("id, name, phone, email, created_at").limit(2000),
    db.from("customer_accounts").select("user_id, full_name, phone, email, created_at").limit(2000),
    db
      .from("appointments")
      .select("id, ref, customer_id, status, starts_at, address, source, services(name, price_php), technicians(full_name)")
      .order("starts_at", { ascending: false })
      .limit(5000),
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

  return [...people.values()].sort((a, b) => lastActivity(b) - lastActivity(a));
}
