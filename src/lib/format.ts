export const TIMEZONE = "Asia/Manila";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
export const formatPeso = (amount: number) => peso.format(amount);

export function formatHours(minutes: number) {
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

// "8:00 AM" from a Postgres time like "08:00:00"
export function formatClock(time: string) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ISO weekdays [1..6] -> "Monday to Saturday"; falls back to a list for gaps.
export function formatOpenDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length > 2 && consecutive) {
    return `${DAY_NAMES[sorted[0] - 1]} to ${DAY_NAMES[sorted[sorted.length - 1] - 1]}`;
  }
  return sorted.map((d) => DAY_NAMES[d - 1]).join(", ");
}

// Today's date in Manila as YYYY-MM-DD, whatever timezone the server runs in.
export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ISO weekday (1 = Monday) of a YYYY-MM-DD date.
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function formatDayChip(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-PH", { day: "numeric", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" }),
  };
}

export function formatDateTime(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" });
}

export function manilaDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(iso));
}

// The next open days from today (skipping closed weekdays and holidays), for the day pickers.
export function nextOpenDays(
  openDays: number[],
  closedDates: string[],
  today: string,
  maxDaysAhead: number,
  count: number,
): string[] {
  const closed = new Set(closedDates);
  const days: string[] = [];
  for (let i = 0; i <= maxDaysAhead && days.length < count; i++) {
    const d = addDays(today, i);
    if (openDays.includes(isoWeekday(d)) && !closed.has(d)) days.push(d);
  }
  return days;
}

// First day that can still be booked: today, unless it is already too late
// today to fit the minimum notice before closing time.
export function firstBookableDay(closeTime: string, minNoticeHours: number): string {
  const today = manilaToday();
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const [h, m] = parts.split(":").map(Number);
  const [ch] = closeTime.split(":").map(Number);
  // The last possible start is one hour before closing.
  return h + m / 60 + minNoticeHours > ch - 1 ? addDays(today, 1) : today;
}
