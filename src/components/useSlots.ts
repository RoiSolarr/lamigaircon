"use client";

import { useEffect, useState } from "react";
import type { SlotsResult } from "@/lib/types";

// Loads free times from /api/slots whenever the service or date changes.
export function useSlots(service: string, date: string) {
  const [state, setState] = useState<{ key: string; result: SlotsResult | null; failed: boolean }>({
    key: "",
    result: null,
    failed: false,
  });
  const key = service && date ? `${service}|${date}` : "";

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/slots?service=${encodeURIComponent(service)}&date=${encodeURIComponent(date)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json() as Promise<SlotsResult>)
      .then((result) => setState({ key, result, failed: false }))
      .catch((err) => {
        if (err?.name !== "AbortError") setState({ key, result: null, failed: true });
      });
    return () => controller.abort();
  }, [key, service, date]);

  const current = state.key === key;
  return {
    loading: Boolean(key) && !current,
    failed: current && state.failed,
    result: current ? state.result : null,
  };
}
