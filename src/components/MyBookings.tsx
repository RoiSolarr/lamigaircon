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

// The signed in customer's bookings on the account page.
export function MyBookings({ bookings }: { bookings: MyBooking[] }) {
  const today = manilaToday();
  const upcoming = bookings.filter((b) => b.status === "booked" && manilaDateOf(b.starts_at) >= today).reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <section id="bookings" aria-labelledby="bookings-title" className="scroll-mt-24 lg:col-span-2">
      <div className="border-t border-mist/70 pt-12">
        <h2 id="bookings-title" className="display-wide text-3xl">My bookings</h2>
        <p className="mt-2 text-steel">Bookings you made while signed in, on the website or in the chat.</p>
      </div>

      {bookings.length === 0 ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="title text-xl">No bookings yet</p>
          <p className="mt-2 text-steel">Book a cleaning with Book now at the top and it shows up here, with its status.</p>
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
    </section>
  );
}
