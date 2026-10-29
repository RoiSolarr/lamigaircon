"use client";

import Link from "next/link";
import { useState } from "react";
import { DayPicker } from "@/components/DayPicker";
import { useSlots } from "@/components/useSlots";
import { formatHours, formatPeso } from "@/lib/format";
import type { Service } from "@/lib/types";

// Hero panel: live free times straight from the booking rules, styled like an
// aircon remote. Picking a time carries the choice over to the booking form.
export function FreeTimes({ services, days }: { services: Service[]; days: string[] }) {
  const [service, setService] = useState(services[1]?.code ?? services[0]?.code ?? "");
  const [date, setDate] = useState(days[0] ?? "");
  const [time, setTime] = useState("");
  const { loading, failed, result } = useSlots(service, date);

  const selected = services.find((s) => s.code === service);
  const slots = result?.ok ? result.slots : [];
  const chosen = slots.find((s) => s.start_time === time);
  const bookHref = `/book?service=${service}&date=${date}${chosen ? `&time=${chosen.start_time}` : ""}`;

  return (
    <section
      aria-labelledby="free-times-title"
      className="min-w-0 rounded-[28px] bg-ink p-5 text-frost shadow-[0_24px_60px_-30px_rgba(10,37,48,0.9)] sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="free-times-title" className="text-xl font-bold" style={{ fontStretch: "100%" }}>
          Free times
        </h2>
        <div className="text-right" aria-live="polite">
          <p className="readout text-5xl leading-none text-sun sm:text-6xl">{chosen ? chosen.label.replace(/ (AM|PM)/, "") : "--:--"}</p>
          <p className="mt-1 text-sm text-mist">{chosen ? chosen.label.slice(-2) : "pick a time"}</p>
        </div>
      </div>

      <label htmlFor="ft-service" className="mt-5 block text-sm text-mist">
        Service
      </label>
      <select
        id="ft-service"
        value={service}
        onChange={(e) => {
          setService(e.target.value);
          setTime("");
        }}
        className="mt-1 w-full rounded-xl border-[1.5px] border-white/25 bg-deep px-3 py-2.5 text-frost focus:border-sun focus:outline-none"
      >
        {services.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}, {formatPeso(s.price_php)}
          </option>
        ))}
      </select>
      {selected && <p className="mt-1.5 text-sm text-mist">Takes about {formatHours(selected.duration_minutes)}</p>}

      <p className="mt-5 mb-2 text-sm text-mist">Day</p>
      <DayPicker
        days={days}
        value={date}
        onChange={(d) => {
          setDate(d);
          setTime("");
        }}
        tone="dark"
        label="Day"
      />

      <p className="mt-5 mb-2 text-sm text-mist">Start time</p>
      <div className="min-h-[5.5rem]">
        {loading && <p className="text-mist">Checking free times…</p>}
        {failed && <p className="text-sun">Could not load times. Check your connection and pick the day again.</p>}
        {result && !result.ok && <p className="text-sun">{result.error}</p>}
        {result?.ok && slots.length === 0 && <p className="text-mist">{result.reason}</p>}
        {result?.ok && slots.length > 0 && (
          <div role="radiogroup" aria-label="Start time" className="flex flex-wrap gap-2">
            {slots.map((slot) => {
              const on = slot.start_time === time;
              return (
                <button
                  key={slot.start_time}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTime(slot.start_time)}
                  className={`readout rounded-lg border-[1.5px] px-3 py-1.5 text-lg transition-colors ${
                    on ? "border-sun bg-sun text-deep" : "border-white/25 hover:border-frost"
                  }`}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Link href={bookHref} className="btn btn-sun mt-6 w-full text-lg">
        {chosen ? `Book ${chosen.label}` : "Book a cleaning"}
      </Link>
    </section>
  );
}
