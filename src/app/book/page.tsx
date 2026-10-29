import type { Metadata } from "next";
import { BookingForm } from "@/components/BookingForm";
import { ChatWidget } from "@/components/ChatWidget";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { getBusiness } from "@/lib/data";
import { addDays, firstBookableDay, manilaToday, nextOpenDays } from "@/lib/format";

export const metadata: Metadata = { title: "Book a cleaning" };
export const dynamic = "force-dynamic";

type Search = Promise<{ service?: string; date?: string; time?: string }>;

export default async function BookPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const { settings, services, closedDates } = await getBusiness();
  const today = manilaToday();
  const days = nextOpenDays(settings.open_days, closedDates.map((c) => c.closed_on), firstBookableDay(settings.close_time, settings.min_notice_hours), settings.max_days_ahead, 14);

  const initialService = services.some((s) => s.code === params.service) ? params.service! : "";
  const initialDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "";
  const initialTime = params.time && /^\d{2}:\d{2}$/.test(params.time) ? params.time : "";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
        <h1 className="display-wide text-4xl sm:text-5xl">Book a cleaning</h1>
        <p className="mt-4 max-w-[36rem] text-lg text-steel">
          One booking covers one unit. You get a confirmation email right away and a reminder the day before.
        </p>
        <BookingForm
          services={services}
          days={days}
          minDate={today}
          maxDate={addDays(today, settings.max_days_ahead)}
          initialService={initialService}
          initialDate={initialDate}
          initialTime={initialTime}
        />
      </main>
      <SiteFooter name={settings.name} phone={settings.phone} email={settings.email} />
      <ChatWidget />
    </>
  );
}
