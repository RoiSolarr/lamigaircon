import Link from "next/link";
import { ChatWidget } from "@/components/ChatWidget";
import { FreeTimes } from "@/components/FreeTimes";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { getBusiness } from "@/lib/data";
import { formatClock, formatHours, formatOpenDays, formatPeso, firstBookableDay, nextOpenDays } from "@/lib/format";

// Prices, hours and FAQs come from Supabase on each visit, so edits in the
// table editor show up right away (the AI receptionist reads the same rows).
export const dynamic = "force-dynamic";

const visitSteps = [
  {
    title: "You book",
    body: "Pick a free time on this page, or tell the receptionist in the chat and it books for you.",
  },
  {
    title: "Confirmation email",
    body: "Within a few minutes you get your booking reference, the time, the address and the price.",
  },
  {
    title: "Reminder the day before",
    body: "An email 24 hours before the visit, so nobody forgets to be home.",
  },
  {
    title: "The cleaning",
    body: "A two person crew arrives with covers, a pressure washer and everything else needed.",
  },
  {
    title: "Follow up",
    body: "A day after the job we check that the unit is running well. Our 7 day warranty starts here.",
  },
];

export default async function Home() {
  const { settings, services, faqs, closedDates } = await getBusiness();
  const days = nextOpenDays(
    settings.open_days,
    closedDates.map((c) => c.closed_on),
    firstBookableDay(settings.close_time, settings.min_notice_hours),
    settings.max_days_ahead,
    7,
  );
  const hours = `${formatOpenDays(settings.open_days)}, ${formatClock(settings.open_time)} to ${formatClock(settings.close_time)}`;
  const upcomingHolidays = closedDates.slice(0, 4);

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:pt-12">
          <div className="min-w-0">
            <h1 className="display-wide text-[2.6rem] sm:text-6xl lg:text-[4.4rem]">Cold air again, by tomorrow.</h1>
            <p className="mt-6 max-w-[34rem] text-xl text-steel">
              Aircon cleaning at home in Batangas. Pick a free time here, or ask our receptionist in the chat. It
              answers day and night and can book for you.
            </p>
            <dl className="mt-8 grid max-w-[34rem] gap-4 border-t border-mist pt-6 sm:grid-cols-2">
              <div>
                <dt className="font-bold">Open</dt>
                <dd className="text-steel">{hours}</dd>
              </div>
              <div>
                <dt className="font-bold">No travel fee</dt>
                <dd className="text-steel">Anywhere in our service area</dd>
              </div>
            </dl>
          </div>
          <FreeTimes services={services} days={days} />
        </section>

        <section id="services" className="scroll-mt-6 bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="display-wide text-3xl sm:text-4xl">Services and prices</h2>
            <p className="mt-3 max-w-[40rem] text-steel">Prices are per unit and include labor and cleaning solution. Pay by cash or GCash after the job.</p>
            <ul className="mt-10 divide-y divide-mist border-y border-mist">
              {services.map((s) => (
                <li key={s.code} className="grid gap-3 py-6 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-10">
                  <div>
                    <h3 className="text-xl font-bold" style={{ fontStretch: "100%" }}>{s.name}</h3>
                    <p className="mt-1 max-w-[42rem] text-steel">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-6 sm:justify-end">
                    <div className="text-right">
                      <p className="readout text-3xl leading-none">{formatPeso(s.price_php)}</p>
                      <p className="mt-1 text-sm text-steel">about {formatHours(s.duration_minutes)}</p>
                    </div>
                    <Link href={`/book?service=${s.code}`} className="btn btn-line px-4 py-2" aria-label={`Book ${s.name}`}>
                      Book
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="display-wide text-3xl sm:text-4xl">How a visit goes</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
            {visitSteps.map((step, i) => (
              <li key={step.title} className="border-t-2 border-ink pt-4">
                <span className="readout text-4xl text-sun-deep" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-2 text-lg font-bold" style={{ fontStretch: "100%" }}>{step.title}</h3>
                <p className="mt-1 text-steel">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="area" className="scroll-mt-6 bg-ink py-16 text-frost">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="display-wide text-3xl sm:text-4xl">Where we go</h2>
              <p className="mt-4 max-w-[34rem] text-lg text-mist">{settings.service_area}.</p>
              <p className="mt-4 max-w-[34rem] text-mist">
                Outside these places? Ask in the chat. A staff member will check and give you a quote.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold" style={{ fontStretch: "100%" }}>Hours</h3>
              <p className="mt-2 text-mist">{hours}. Closed on Sundays and holidays.</p>
              {upcomingHolidays.length > 0 && (
                <>
                  <h3 className="mt-6 text-xl font-bold" style={{ fontStretch: "100%" }}>Upcoming days off</h3>
                  <ul className="mt-2 space-y-1 text-mist">
                    {upcomingHolidays.map((h) => (
                      <li key={h.closed_on}>
                        {new Date(`${h.closed_on}T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", day: "numeric", timeZone: "UTC" })}, {h.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-16 sm:px-6">
          <div className="max-w-3xl">
          <h2 className="display-wide text-3xl sm:text-4xl">Questions</h2>
          <div className="mt-8 divide-y divide-mist border-y border-mist">
            {faqs.map((f) => (
              <details key={f.id} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
                  {f.question}
                  <span aria-hidden className="readout text-2xl text-steel transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-steel">{f.answer}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-steel">
            Something else? Ask the receptionist in the chat, or call {settings.phone}.
          </p>
          </div>
        </section>
      </main>

      <SiteFooter name={settings.name} phone={settings.phone} email={settings.email} />
      <ChatWidget />
    </>
  );
}
