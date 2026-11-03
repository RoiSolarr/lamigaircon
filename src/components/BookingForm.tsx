"use client";

import { useState } from "react";
import { DayPicker } from "@/components/DayPicker";
import { useSlots } from "@/components/useSlots";
import { formatHours, formatPeso } from "@/lib/format";
import type { BookingResult, Service } from "@/lib/types";

type Props = {
  services: Service[];
  days: string[];
  minDate: string;
  maxDate: string;
  initialService: string;
  initialDate: string;
  initialTime: string;
  initialDetails?: { name: string; phone: string; email: string };
};

type Details = { name: string; phone: string; email: string; address: string; notes: string; company: string };

export function BookingForm(props: Props) {
  const { services, days } = props;
  const [service, setService] = useState(props.initialService || services[0]?.code || "");
  const [date, setDate] = useState(props.initialDate || days[0] || "");
  const [time, setTime] = useState(props.initialTime);
  const [details, setDetails] = useState<Details>({
    name: props.initialDetails?.name ?? "",
    phone: props.initialDetails?.phone ?? "",
    email: props.initialDetails?.email ?? "",
    address: "",
    notes: "",
    company: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<Extract<BookingResult, { ok: true }> | null>(null);
  const { loading, failed, result } = useSlots(service, date);

  const selected = services.find((s) => s.code === service);
  const slots = result?.ok ? result.slots : [];
  const chosen = slots.find((s) => s.start_time === time);
  const dateLabel = result?.ok ? result.date_label : date;

  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDetails((d) => ({ ...d, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) {
      setError("Pick a start time first.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service, date, time, ...details }),
      });
      const data = (await res.json()) as BookingResult;
      if (!data.ok) {
        setError(data.error);
        if (/not available/i.test(data.error)) setTime("");
        return;
      }
      setBooked(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Could not reach the booking system. Check your connection and press Book again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (booked) {
    return (
      <section className="animate-rise mt-10 max-w-3xl rounded-[32px] bg-ink p-6 text-frost shadow-[var(--shadow-remote)] sm:p-9" aria-live="polite">
        <p className="flex items-center gap-2 font-bold text-ice">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-ok text-white">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>
          </span>
          Booking confirmed
        </p>
        <h2 className="title mt-4 text-3xl">You are booked</h2>
        <p className="readout mt-4 text-5xl text-sun sm:text-6xl">{booked.ref}</p>
        <p className="mt-1 text-sm text-mist">Your booking reference</p>
        <dl className="mt-6 grid gap-x-6 gap-y-4 rounded-2xl bg-deep p-5 ring-1 ring-white/10 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-mist">Service</dt>
            <dd className="font-bold">{booked.service}</dd>
          </div>
          <div>
            <dt className="text-sm text-mist">When</dt>
            <dd className="font-bold">{booked.when}</dd>
          </div>
          <div>
            <dt className="text-sm text-mist">Price</dt>
            <dd className="font-bold">{formatPeso(booked.price_php)}, pay after the job</dd>
          </div>
          <div>
            <dt className="text-sm text-mist">Confirmation sent to</dt>
            <dd className="font-bold break-all">{booked.email}</dd>
          </div>
        </dl>
        <p className="mt-6 text-mist">
          The email should arrive within a few minutes. Check your spam folder if you do not see it. Need to change
          something? Use the chat and mention your reference.
        </p>
        <button
          type="button"
          className="btn btn-sun mt-6"
          onClick={() => {
            setBooked(null);
            setTime("");
          }}
        >
          Book another unit
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8" noValidate={false}>
      <div className="min-w-0 space-y-6">
      <fieldset className="panel min-w-0 p-5 sm:p-7">
        <legend className="title float-left flex w-full items-center gap-3 text-2xl">
          <span aria-hidden className="readout grid h-9 w-9 place-items-center rounded-full bg-ink text-xl text-frost">1</span> Service
        </legend>
        <div className="clear-both grid gap-3 pt-5 sm:grid-cols-2">
          {services.map((s) => {
            const on = s.code === service;
            return (
              <label
                key={s.code}
                className={`relative flex cursor-pointer flex-col rounded-2xl border-[1.5px] p-4 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sun ${
                  on ? "border-ink bg-frost ring-1 ring-ink" : "border-mist bg-white hover:border-steel"
                }`}
              >
                <input
                  type="radio"
                  name="service"
                  value={s.code}
                  checked={on}
                  onChange={() => {
                    setService(s.code);
                    setTime("");
                  }}
                  className="sr-only"
                />
                <span aria-hidden className={`absolute top-4 right-4 grid h-5 w-5 place-items-center rounded-full border-[1.5px] ${on ? "border-ink bg-ink text-frost" : "border-mist"}`}>
                  {on && <span className="h-2 w-2 rounded-full bg-sun" />}
                </span>
                <span className="pr-7 font-bold">{s.name}</span>
                <span className="mt-1 text-sm text-steel">about {formatHours(s.duration_minutes)}</span>
                <span className="readout mt-2 text-2xl">{formatPeso(s.price_php)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="panel min-w-0 p-5 sm:p-7">
        <legend className="title float-left flex w-full items-center gap-3 text-2xl">
          <span aria-hidden className="readout grid h-9 w-9 place-items-center rounded-full bg-ink text-xl text-frost">2</span> Day and time
        </legend>
        <div className="clear-both pt-5">
          <DayPicker
            days={days}
            value={date}
            onChange={(d) => {
              setDate(d);
              setTime("");
            }}
            label="Day"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label htmlFor="other-date" className="text-steel">
              Another date:
            </label>
            <input
              id="other-date"
              type="date"
              min={props.minDate}
              max={props.maxDate}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTime("");
              }}
              className="field w-auto py-1.5"
            />
          </div>
        </div>

        <div className="mt-6 min-h-24" aria-live="polite">
          {loading && <p className="text-steel">Checking free times…</p>}
          {failed && <p className="text-bad">Could not load times. Check your connection and pick the day again.</p>}
          {result && !result.ok && <p className="text-bad">{result.error}</p>}
          {result?.ok && slots.length === 0 && <p className="text-steel">{result.reason}</p>}
          {result?.ok && slots.length > 0 && (
            <>
              <p className="mb-3 text-steel">Free start times on {dateLabel}:</p>
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
                      className={`readout rounded-xl border-[1.5px] px-4 py-2 text-xl transition-colors ${
                        on ? "border-ink bg-ink text-frost" : "border-mist bg-white hover:border-ink"
                      }`}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {time && result?.ok && !chosen && slots.length > 0 && (
            <p className="mt-3 text-bad">The time you picked is no longer free. Choose another one.</p>
          )}
        </div>
      </fieldset>

      <fieldset className="panel min-w-0 p-5 sm:p-7">
        <legend className="title float-left flex w-full items-center gap-3 text-2xl">
          <span aria-hidden className="readout grid h-9 w-9 place-items-center rounded-full bg-ink text-xl text-frost">3</span> Your details
        </legend>
        <div className="clear-both grid gap-5 pt-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" required minLength={2} maxLength={100} autoComplete="name" value={details.name} onChange={set("name")} className="field" />
          </div>
          <div>
            <label htmlFor="phone" className="label">Mobile number</label>
            <input id="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="09171234567" value={details.phone} onChange={set("phone")} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="email" className="label">Email</label>
            <input id="email" required type="email" autoComplete="email" value={details.email} onChange={set("email")} className="field" />
            <p className="mt-1 text-sm text-steel">Your confirmation and reminder go here.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="label">Service address</label>
            <input
              id="address"
              required
              minLength={10}
              maxLength={300}
              autoComplete="street-address"
              placeholder="House number, street, barangay, city"
              value={details.address}
              onChange={set("address")}
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="label">
              Notes <span className="font-normal text-steel">(optional)</span>
            </label>
            <textarea
              id="notes"
              rows={3}
              maxLength={500}
              placeholder="Unit brand, where it is in the house, parking tips"
              value={details.notes}
              onChange={set("notes")}
              className="field"
            />
          </div>
          {/* Honeypot: hidden from people, bots tend to fill it in. */}
          <div aria-hidden className="absolute -left-[9999px]">
            <label htmlFor="company">Company</label>
            <input id="company" tabIndex={-1} autoComplete="off" value={details.company} onChange={set("company")} />
          </div>
        </div>
      </fieldset>
      </div>

      <aside className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-frost shadow-[var(--shadow-remote)] lg:sticky lg:top-24">
        <div aria-hidden className="vent absolute inset-x-0 top-0 h-8" />
        <h2 className="title relative text-xl">Your booking</h2>
        <dl className="relative mt-4 divide-y divide-white/10 rounded-2xl bg-deep px-4 ring-1 ring-white/10">
          <div className="py-3">
            <dt className="text-sm text-mist">Service</dt>
            <dd className="font-bold">{selected ? selected.name : "Pick a service"}</dd>
          </div>
          <div className="py-3">
            <dt className="text-sm text-mist">When</dt>
            <dd className="font-bold">{chosen ? `${dateLabel} at ${chosen.label}` : "Pick a time"}</dd>
          </div>
          <div className="flex items-end justify-between gap-3 py-3">
            <div>
              <dt className="text-sm text-mist">Price</dt>
              <dd className="text-sm text-mist">pay after the job</dd>
            </div>
            {selected && <dd className="readout text-4xl leading-none text-sun">{formatPeso(selected.price_php)}</dd>}
          </div>
        </dl>
        {error && (
          <p className="mt-4 rounded-xl bg-white px-4 py-3 text-bad" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-sun mt-5 w-full py-3.5 text-lg" disabled={submitting}>
          {submitting ? "Booking…" : "Book this time"}
        </button>
        <p className="mt-3 text-center text-sm text-mist">A confirmation email comes right after.</p>
      </aside>
    </form>
  );
}