import type { Metadata } from "next";
import Link from "next/link";
import { formatDateTime, formatPeso } from "@/lib/format";
import { customerSince, initials, loadPeople, spent, STATUS } from "../data";

export const metadata: Metadata = { title: "Customer details" };

const decode = (v: string) => {
  try {
    return decodeURIComponent(v).toLowerCase();
  } catch {
    return v.toLowerCase();
  }
};

// One customer on a full page: contact details, every booking and their chats.
export default async function CustomerPage({ params }: { params: Promise<{ email: string }> }) {
  const email = decode((await params).email);
  const person = (await loadPeople()).find((p) => p.email === email);

  const back = (
    <Link href="/admin/customers" className="inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-2 font-bold text-ink ring-1 ring-mist transition-colors hover:bg-white">
      <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      All customers
    </Link>
  );

  if (!person) {
    return (
      <>
        {back}
        <div className="panel mt-6 p-10 text-center">
          <p className="title text-xl">No customer with that email</p>
          <p className="mt-2 text-steel">They may have been removed. Go back to the list to find them.</p>
        </div>
      </>
    );
  }

  const done = person.bookings.filter((b) => b.status === "completed").length;
  const upcoming = person.bookings.filter((b) => b.status === "booked").length;

  return (
    <>
      {back}

      <header className="panel relative mt-6 overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-ink" />
        <div className="flex flex-wrap items-center gap-5">
          <span className={`avatar h-20 w-20 text-3xl ${person.account ? "bg-ink text-frost" : ""}`}>{initials(person.name || person.email)}</span>
          <div className="min-w-0 flex-1">
            <h1 className="title flex flex-wrap items-center gap-3 text-3xl sm:text-4xl">
              {person.name || "No name yet"}
              {person.account ? (
                <span className="pill bg-ok/10 text-sm text-ok">Has an account</span>
              ) : (
                <span className="pill bg-frost text-sm text-steel">Guest</span>
              )}
            </h1>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-lg text-steel">
              {person.phone && (
                <a href={`tel:${person.phone}`} className="underline underline-offset-2 hover:text-ink">{person.phone}</a>
              )}
              <a href={`mailto:${person.email}`} className="break-all underline underline-offset-2 hover:text-ink">{person.email}</a>
            </p>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Bookings", String(person.bookings.length)],
            ["Coming up", String(upcoming)],
            ["Done", String(done)],
            ["Spent", formatPeso(spent(person))],
            ["Customer since", customerSince(person)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-frost px-4 py-3">
              <dt className="text-sm text-steel">{label}</dt>
              <dd className="readout mt-1 text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
        {person.account && person.customer?.name && person.customer.name !== person.account.full_name && (
          <p className="mt-4 text-steel">Booked as &quot;{person.customer.name}&quot;. Account name: {person.account.full_name}.</p>
        )}
      </header>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_20rem] xl:items-start">
        <section aria-labelledby="bookings-title">
          <h2 id="bookings-title" className="title text-2xl">Bookings</h2>
          {person.bookings.length === 0 ? (
            <div className="panel mt-4 p-8 text-center text-steel">No bookings yet.</div>
          ) : (
            <ul className="panel mt-4 divide-y divide-mist/70 overflow-hidden">
              {person.bookings.map((b) => (
                <li key={b.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                      {b.services?.name}
                      <span className={`pill text-sm ${STATUS[b.status].style}`}>{STATUS[b.status].label}</span>
                    </p>
                    <p className="text-steel">
                      {formatDateTime(b.starts_at)}, {b.address}
                    </p>
                    <p className="text-sm text-steel">
                      {b.ref}, booked {b.source === "chat" ? "by the AI receptionist" : b.source === "staff" ? "by staff" : "on the website"}.
                      Technician: {b.technicians?.full_name ?? "none"}.
                    </p>
                  </div>
                  <p className="readout text-3xl sm:text-right">{b.services ? formatPeso(Number(b.services.price_php)) : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="contact-title" className="panel p-5 sm:p-6">
            <h2 id="contact-title" className="title text-xl">Contact</h2>
            <dl className="mt-4 space-y-3">
              <div>
                <dt className="text-sm text-steel">Email</dt>
                <dd className="font-bold break-all">{person.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-steel">Mobile number</dt>
                <dd className="font-bold">{person.phone || "Not given"}</dd>
              </div>
              <div>
                <dt className="text-sm text-steel">Account</dt>
                <dd className="font-bold">{person.account ? `Since ${customerSince({ ...person, customer: null })}` : "Booked as a guest"}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="chats-title" className="panel p-5 sm:p-6">
            <h2 id="chats-title" className="title text-xl">Chats</h2>
            {person.chats.length === 0 ? (
              <p className="mt-2 text-steel">No chats linked to this customer.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {person.chats.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/inbox?c=${c.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-mist transition-colors hover:bg-frost">
                      <span className="text-sm">{formatDateTime(c.last_message_at)}</span>
                      {c.needs_human ? <span className="pill bg-sun text-xs text-deep">Needs a person</span> : <span aria-hidden className="text-steel">›</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
