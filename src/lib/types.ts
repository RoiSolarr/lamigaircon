export type BusinessSettings = {
  name: string;
  phone: string;
  email: string;
  service_area: string;
  timezone: string;
  open_time: string;
  close_time: string;
  open_days: number[];
  max_days_ahead: number;
  min_notice_hours: number;
};

export type Service = {
  code: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_php: number;
};

export type Faq = { id: number; question: string; answer: string };

export type Slot = { start_time: string; label: string };

export type SlotsResult =
  | {
      ok: true;
      date: string;
      date_label: string;
      service: { code: string; name: string; duration_minutes: number; price_php: number };
      slots: Slot[];
      reason: string | null;
    }
  | { ok: false; error: string };

export type BookingResult =
  | { ok: true; ref: string; service: string; when: string; starts_at: string; price_php: number; email: string }
  | { ok: false; error: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };
