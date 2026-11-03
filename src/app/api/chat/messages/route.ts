import { NextResponse, type NextRequest } from "next/server";
import { publicDb } from "@/lib/supabase/public";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// GET /api/chat/messages?sessionId=...&after=123
// Staff replies in this chat newer than message id `after`, and whether staff
// have taken over the chat. The chat window polls this while it is open.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const after = Number(request.nextUrl.searchParams.get("after") ?? "0");

  if (!UUID.test(sessionId) || !Number.isSafeInteger(after) || after < 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } = await publicDb().rpc("staff_messages", { p_conversation_id: sessionId, p_after: after });
  if (error) {
    console.error("staff_messages failed", error);
    return NextResponse.json({ error: "Could not load messages." }, { status: 500 });
  }

  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}