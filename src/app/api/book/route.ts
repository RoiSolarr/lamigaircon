import { after, NextResponse, type NextRequest } from "next/server";
import { n8n } from "@/lib/env";
import { callN8n } from "@/lib/n8n";
import { publicDb } from "@/lib/supabase/public";
import type { BookingResult } from "@/lib/types";

type BookingRequest = {
  service?: string;
  date?: string;
  time?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  company?: string; // honeypot: hidden field that people never fill in
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

// POST /api/book
// Books through lamig.book_appointment(), which re-checks the slot and saves the
// confirmation, reminder and follow up. Then it nudges the n8n Notifications
// workflow so the confirmation email goes out now instead of on the next schedule.
export async function POST(request: NextRequest) {
  let body: BookingRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (body.company) {
    return NextResponse.json({ ok: false, error: "Could not book. Please try again." }, { status: 400 });
  }

  const { data, error } = await publicDb().rpc("book_appointment", {
    p_service_code: text(body.service, 50),
    p_date: text(body.date, 10),
    p_start_time: text(body.time, 5),
    p_name: text(body.name, 100),
    p_phone: text(body.phone, 30),
    p_email: text(body.email, 254),
    p_address: text(body.address, 300),
    p_notes: text(body.notes, 500) || null,
    p_source: "website",
  });

  if (error) {
    console.error("book_appointment failed", error);
    return NextResponse.json({ ok: false, error: "Could not book right now. Please try again." }, { status: 500 });
  }

  const result = data as BookingResult;
  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }

  const notifyUrl = n8n.notifyUrl();
  if (notifyUrl) {
    // Runs after the response is sent. If n8n is asleep or down, the scheduled
    // run picks the confirmation up later, so a failure here is only logged.
    after(async () => {
      try {
        const res = await callN8n(notifyUrl, { reason: "new_booking", ref: result.ref }, 20_000);
if (!res.ok) {
  console.warn(`n8n notify webhook answered ${res.status}. Check N8N_NOTIFY_WEBHOOK_URL, N8N_WEBHOOK_SECRET and that the workflow is published.`);
}
      } catch (err) {
        console.warn("Could not reach the n8n notify webhook", err);
      }
    });
  }

  return NextResponse.json(result);
}
