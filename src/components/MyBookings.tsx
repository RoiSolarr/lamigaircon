import Link from "next/link";
import { linkMyBooking } from "@/app/account/actions";
import { formatPeso, formatTime, manilaDateOf, manilaToday } from "@/lib/format";

export type MyBooking = {
  ref: string;
  starts_at: string;
  ends_at: string;
  status: "booked" | "completed" | "cancelled" | "no_show";
  address: string;
  source: "website" | "chat" | "staff";
  service: string;
  price_php: number;
};

const STATUS: Record<MyBooking["status"], { label: string; style: string }> = {
  booked: { label: "Booked", style: "bg-ice text-ink" },
  completed: { label: "Done", style: "bg-ok/10 text-ok" },
  cancelled: { label: "Cancelled", style: "bg-mist/50 text-steel" },
  no_show: { label: "Missed", style: "bg-warn/10 text-warn" },
};

const dayParts = (iso: string) => {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...o });
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }), year: part({ year: "numeric" }) };
};

// The signed in customer's bookings on the account page, plus a form to add
// a booking made before they had an account.
export function MyBookings({ bookings, linked, linkError }: { bookings: MyBooking[]; linked?: string; linkError?: string }) {
  const today = manilaToday();
  const upcoming = bookings.filter((b) => b.status === "booked" && manilaDateOf(b.starts_at) >= today).reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <section id="bookings" aria-labelledby="bookings-title" className="scroll-mt-24 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-mist/70 pt-12">
        <div>
          <h2 id="bookings-title" className="display-wide text-3xl">My bookings</h2>
          <p className="mt-2 text-steel">Bookings you made while signed in, on the website or in the chat.</p>
        </div>
        <Link href="/book" className="btn btn-ink btn-sm">Book another cleaning</Link>
      </div>

      {linked && (
        <p role="status" className="mt-6 rounded-xl bg-ok/10 px-4 py-3 font-bold text-ok ring-1 ring-ok/20">
          Booking {linked} is now in your history.
        </p>
      )}

      {bookings.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="title text-xl">No bookings yet</p>
          <p className="mt-2 text-steel">Book a cleaning while signed in and it shows up here, with its status.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {[
            { title: "Coming up", list: upcoming },
            { title: "Past and cancelled", list: past },
          ]
            .filter((g) => g.list.length > 0)
            .map((g) => (
              <div key={g.title}>
                <h3 className="title text-lg">{g.title}</h3>
                <ul className="panel mt-3 divide-y divide-mist/70 overflow-hidden">
                  {g.list.map((b) => {
                    const d = dayParts(b.starts_at);
                    return (
                      <li key={b.ref} className="grid grid-cols-[auto_1fr] items-center gap-4 p-4 sm:grid-cols-[auto_1fr_auto] sm:p-5">
                        <div className={`grid w-16 place-items-center rounded-2xl py-2 leading-none ${b.status === "booked" ? "bg-ink text-frost" : "bg-frost text-ink"}`}>
                          <span className="text-xs opacity-80">{d.weekday}</span>
                          <span className={`readout text-3xl ${b.status === "booked" ? "text-sun" : ""}`}>{d.day}</span>
                          <span className="text-xs opacity-80">{d.month} {d.year}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-bold">
                            {b.service}
                            <span className={`pill ${STATUS[b.status].style}`}>{STATUS[b.status].label}</span>
                          </p>
                          <p className="text-steel">
                            {formatTime(b.starts_at)} to {formatTime(b.ends_at)}, {b.address}
                          </p>
                          <p className="text-sm text-steel">
                            Reference <span className="font-bold text-ink">{b.ref}</span>, booked {b.source === "chat" ? "in the chat" : b.source === "staff" ? "by our staff" : "on the website"}
                          </p>
                        </div>
                        <p className="readout col-start-2 text-2xl sm:col-start-auto sm:text-right">{formatPeso(Number(b.price_php))}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}

      <details className="panel group mt-8 p-5 sm:p-6" open={Boolean(linkError)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold [&::-webkit-details-marker]:hidden">
          Booked before you had an account? Add it here.
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-frost transition-transform group-open:rotate-45">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 2v10M2 7h10" /></svg>
          </span>
        </summary>
        <p className="mt-2 text-steel">Use the reference from your confirmation email and the email you booked with.</p>
        {linkError && (
          <p role="alert" className="mt-4 rounded-xl bg-bad/8 px-4 py-3 text-bad ring-1 ring-bad/20">{linkError}</p>
        )}
        <form action={linkMyBooking} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <div>
            <label htmlFor="link-ref" className="label">Booking reference</label>
            <input id="link-ref" name="ref" required placeholder="LMG-AB12CD" autoComplete="off" className="field uppercase placeholder:normal-case" />
          </div>
          <div>
            <label htmlFor="link-email" className="label">Email used for the booking</label>
            <input id="link-email" name="email" type="email" required autoComplete="email" className="field" />
          </div>
          <button className="btn btn-ink">Add booking</button>
        </form>
      </details>
    </section>
  );
}
