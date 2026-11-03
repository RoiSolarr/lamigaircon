import Image from "next/image";
import Link from "next/link";
import { ChatWidget, OpenChatButton } from "@/components/ChatWidget";
import { FreeTimes } from "@/components/FreeTimes";
import { HeaderAccount } from "@/components/HeaderAccount";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { getBusiness } from "@/lib/data";
import { formatClock, formatClosedDays, formatHours, formatOpenDays, formatPeso, firstBookableDay, nextOpenDays } from "@/lib/format";

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
    body: "Your technician arrives with covers, a pressure washer and everything else needed.",
  },
  {
    title: "Follow up",
    body: "A day after the job we check that the unit is running well. Our 7 day warranty starts here.",
  },
];

// One icon per service code in /public/images/services (replace the SVGs any time).
const SERVICE_ICONS: Record<string, string> = {
  window_cleaning: "window type aircon",
  split_cleaning: "split type aircon",
  split_deep_cleaning: "split type aircon with water drops",
  checkup: "magnifying glass over a pulse line",
};

const promises = [
  { title: "Pay after the job", body: "Cash or GCash, with a receipt for every job.", icon: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
  { title: "No travel fee", body: "Anywhere in our service area.", icon: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { title: "7 day warranty", body: "A leak or problem from our work? We come back for free.", icon: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4" },
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
  const closedText = formatClosedDays(settings.open_days);
  const upcomingHolidays = closedDates.slice(0, 4);

  return (
    <>
      <SiteHeader account={<HeaderAccount />} />

      <main>
        <section className="relative overflow-hidden">
          {/* A faint cold band behind the hero, where the remote sits. */}
          <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[44%] bg-ice/70 lg:block" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:pt-16 lg:pb-24">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-white py-1 pr-3.5 pl-2 text-sm font-bold text-ink shadow-[var(--shadow-soft)]">
                <span aria-hidden className="h-2 w-2 rounded-full bg-ok ring-4 ring-ok/15" />
                Receptionist online, day and night
              </p>
              <h1 className="display-wide mt-6 text-[2.7rem] sm:text-6xl lg:text-[4.6rem]">Cold air again, by tomorrow.</h1>
              <p className="mt-6 max-w-[34rem] text-xl text-steel">
                Aircon cleaning at home in Batangas. Pick a free time here, or ask our receptionist in the chat. It
                answers day and night and can book for you.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/book" className="btn btn-sun px-6 text-lg">Book a cleaning</Link>
                <OpenChatButton className="btn btn-quiet px-6 text-lg">Ask the receptionist</OpenChatButton>
              </div>
              <p className="mt-6 text-steel">
                <span className="font-bold text-ink">Open {hours}.</span> {closedText}
              </p>
            </div>
            <div className="min-w-0">
              <Image
                src="/images/hero-aircon.svg"
                alt="A clean split type aircon on the wall, set to 18 degrees and blowing cold air"
                width={600}
                height={262}
                sizes="(min-width: 1024px) 400px, (min-width: 640px) 60vw, 80vw"
                loading="eager"
                fetchPriority="high"
                className="mx-auto mb-3 h-auto w-[80%] sm:w-[72%]"
              />
              <FreeTimes services={services} days={days} />
            </div>
          </div>
        </section>

        <section aria-label="Our promises" className="border-y border-mist/70 bg-white">
          <ul className="mx-auto grid max-w-6xl divide-mist/70 px-4 sm:grid-cols-3 sm:divide-x sm:px-6">
            {promises.map((p) => (
              <li key={p.title} className="flex items-start gap-4 py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
                <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-frost text-ink">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d={p.icon} />
                  </svg>
                </span>
                <div>
                  <h2 className="title text-lg">{p.title}</h2>
                  <p className="text-steel">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="services" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end">
              <h2 className="display-wide text-3xl sm:text-[2.6rem]">Services and prices</h2>
              <p className="max-w-[34rem] text-steel lg:justify-self-end lg:text-right">
                Prices are per unit and include labor and cleaning solution. Pay by cash or GCash after the job.
              </p>
            </div>
            <ul className="panel mt-10 divide-y divide-mist/70 overflow-hidden">
              {services.map((s) => (
                <li key={s.code} className="grid grid-cols-[auto_1fr] gap-4 p-5 transition-colors hover:bg-frost/60 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-x-6 sm:p-7">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-frost">
                    <Image
                      src={`/images/services/${s.code in SERVICE_ICONS ? s.code : "default"}.svg`}
                      alt={`Icon: ${SERVICE_ICONS[s.code] ?? "aircon"}`}
                      width={32}
                      height={32}
                      sizes="32px"
                    />
                  </span>
                  <div>
                    <h3 className="title text-xl">{s.name}</h3>
                    <p className="mt-1 max-w-[42rem] text-steel">{s.description}</p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-6 sm:col-span-1 sm:justify-end">
                    <div className="sm:text-right">
                      <p className="readout text-[2rem] leading-none">{formatPeso(s.price_php)}</p>
                      <p className="mt-1 text-sm text-steel">about {formatHours(s.duration_minutes)}</p>
                    </div>
                    <Link href={`/book?service=${s.code}`} className="btn btn-line btn-sm px-5" aria-label={`Book ${s.name}`}>
                      Book
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="results-title" className="pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end">
              <h2 id="results-title" className="display-wide text-3xl sm:text-[2.6rem]">Before and after</h2>
              <p className="max-w-[34rem] text-steel lg:justify-self-end lg:text-right">
                A dusty filter makes the unit work harder and blow warm, smelly air. We wash it, the coils and the blower wheel.
              </p>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {[
                { src: "/images/before-cleaning.svg", label: "Before", alt: "Aircon filter before cleaning, its mesh covered in grey dust", style: "bg-white text-ink" },
                { src: "/images/after-cleaning.svg", label: "After", alt: "The same filter after cleaning, clear and bright", style: "bg-sun text-deep" },
              ].map((img) => (
                <figure key={img.label} className="panel overflow-hidden p-3">
                  <div className="relative">
                    <Image src={img.src} alt={img.alt} width={400} height={260} sizes="(min-width: 640px) 45vw, 92vw" className="h-auto w-full rounded-2xl" />
                    <span className={`pill absolute top-3 left-3 shadow-[var(--shadow-soft)] ${img.style}`}>{img.label}</span>
                  </div>
                  <figcaption className="px-2 pt-3 pb-1 text-steel">
                    {img.label === "Before" ? "Dust on the filter blocks the air and spreads smell." : "Clean mesh, cold air and no smell."}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="display-wide text-3xl sm:text-[2.6rem]">How a visit goes</h2>
            <p className="mt-3 max-w-[38rem] text-steel">Every step after you book happens on its own. You get an email at each one.</p>
            <ol className="relative mt-12 grid gap-8 lg:grid-cols-5 lg:gap-6">
              <span aria-hidden className="absolute top-5 right-[10%] left-[10%] hidden h-0.5 bg-mist lg:block" />
              {visitSteps.map((step, i) => (
                <li key={step.title} className="relative flex gap-4 lg:flex-col lg:items-center lg:text-center">
                  <span
                    aria-hidden
                    className={`readout relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl ring-4 ring-white ${
                      i === 0 ? "bg-sun text-deep" : "bg-ink text-frost"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="lg:mt-4">
                    <h3 className="title text-lg">{step.title}</h3>
                    <p className="mt-1 text-steel">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="area" className="scroll-mt-20 bg-ink py-20 text-frost">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 className="display-wide text-3xl sm:text-[2.6rem]">Where we go</h2>
              <p className="mt-5 max-w-[34rem] text-xl text-ice">{settings.service_area}.</p>
              <p className="mt-4 max-w-[34rem] text-mist">
                Outside these places? Ask in the chat. A staff member will check and give you a quote.
              </p>
            </div>
            <div className="rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/10 sm:p-7">
              <h3 className="title text-xl">Hours</h3>
              <p className="mt-2 text-mist">{hours}. {closedText}</p>
              {upcomingHolidays.length > 0 && (
                <>
                  <h3 className="title mt-7 text-xl">Upcoming days off</h3>
                  <ul className="mt-3 space-y-2.5">
                    {upcomingHolidays.map((h) => {
                      const d = new Date(`${h.closed_on}T00:00:00Z`);
                      return (
                        <li key={h.closed_on} className="flex items-center gap-4">
                          <span className="grid w-14 shrink-0 place-items-center rounded-xl bg-deep py-1.5 leading-none">
                            <span className="text-xs text-mist">{d.toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" })}</span>
                            <span className="readout text-2xl text-sun">{d.getUTCDate()}</span>
                          </span>
                          <span className="text-ice">{h.reason}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.7fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="display-wide text-3xl sm:text-[2.6rem]">Questions</h2>
            <p className="mt-4 max-w-[26rem] text-steel">
              Something else? Ask the receptionist in the chat, or call{" "}
              <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="font-bold text-ink underline underline-offset-2">{settings.phone}</a>.
            </p>
            <OpenChatButton className="btn btn-ink mt-6">Ask the receptionist</OpenChatButton>
          </div>
          <div className="panel divide-y divide-mist/70 px-5 sm:px-7">
            {faqs.map((f) => (
              <details key={f.id} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
                  {f.question}
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-frost text-ink transition-transform duration-200 group-open:rotate-45 group-open:bg-ink group-open:text-frost"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M7 2v10M2 7h10" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 max-w-[40rem] pr-10 text-steel">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter name={settings.name} phone={settings.phone} email={settings.email} />
      <ChatWidget />
    </>
  );
}
