import { publicDb } from "@/lib/supabase/public";
import { manilaToday } from "@/lib/format";
import type { BusinessSettings, Faq, Service } from "@/lib/types";

// Public business info for the website. Same rows the AI receptionist reads.
export async function getBusiness() {
  const db = publicDb();
  const [settings, services, faqs, closed] = await Promise.all([
    db.from("business_settings").select("name, phone, email, service_area, timezone, open_time, close_time, open_days, max_days_ahead, min_notice_hours").single(),
    db.from("services").select("code, name, description, duration_minutes, price_php").eq("is_active", true).order("sort_order"),
    db.from("faqs").select("id, question, answer").eq("is_active", true).order("sort_order"),
    db.from("closed_dates").select("closed_on, reason").gte("closed_on", manilaToday()),
  ]);

  const error = settings.error ?? services.error ?? faqs.error ?? closed.error;
  if (error) {
    throw new Error(`Could not load business info from Supabase: ${error.message}. Check the setup steps in README.md.`);
  }

  return {
    settings: settings.data as BusinessSettings,
    services: (services.data ?? []).map((s) => ({ ...s, price_php: Number(s.price_php) })) as Service[],
    faqs: (faqs.data ?? []) as Faq[],
    closedDates: (closed.data ?? []) as { closed_on: string; reason: string }[],
  };
}
