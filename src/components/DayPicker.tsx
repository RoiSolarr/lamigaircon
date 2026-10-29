"use client";

import { formatDayChip } from "@/lib/format";

type Props = {
  days: string[];
  value: string;
  onChange: (day: string) => void;
  tone?: "dark" | "light";
  label: string;
};

// A row of day buttons (radio group) for the next open days.
export function DayPicker({ days, value, onChange, tone = "light", label }: Props) {
  const idle =
    tone === "dark"
      ? "border-white/25 text-frost hover:border-frost"
      : "border-mist bg-white text-ink hover:border-ink";
  const active = tone === "dark" ? "border-sun bg-sun text-deep" : "border-ink bg-ink text-frost";

  return (
    <div role="radiogroup" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {days.map((day) => {
        const chip = formatDayChip(day);
        const selected = day === value;
        return (
          <button
            key={day}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(day)}
            className={`flex min-w-[4.25rem] shrink-0 flex-col items-center rounded-xl border-[1.5px] px-2 py-2 leading-tight transition-colors ${selected ? active : idle}`}
          >
            <span className="text-sm">{chip.weekday}</span>
            <span className="readout text-2xl">{chip.day}</span>
            <span className="text-xs opacity-80">{chip.month}</span>
          </button>
        );
      })}
    </div>
  );
}
