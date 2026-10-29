import { NextResponse, type NextRequest } from "next/server";
import { publicDb } from "@/lib/supabase/public";

// GET /api/slots?service=split_cleaning&date=2026-10-28
// Free start times for a service on a day, from lamig.get_slots().
export async function GET(request: NextRequest) {
  const service = request.nextUrl.searchParams.get("service") ?? "";
  const date = request.nextUrl.searchParams.get("date") ?? "";

  if (!/^[a-z0-9_]{1,50}$/.test(service) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "Pick a service and a date." }, { status: 400 });
  }

  const { data, error } = await publicDb().rpc("get_slots", { p_service_code: service, p_date: date });
  if (error) {
    console.error("get_slots failed", error);
    return NextResponse.json({ ok: false, error: "Could not load times. Please try again." }, { status: 500 });
  }

  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
