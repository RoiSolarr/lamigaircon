import { NextResponse } from "next/server";
import { staffDb as userDb } from "@/lib/supabase/server";

// GET /api/chat/history
// The signed in customer's latest chat, so it continues on any device.
export async function GET() {
  const db = await userDb();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ conversation_id: null }, { status: 401 });
  }

  const { data, error } = await db.rpc("my_latest_conversation");
  if (error) {
    console.error("my_latest_conversation failed", error);
    return NextResponse.json({ conversation_id: null }, { status: 500 });
  }

  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}