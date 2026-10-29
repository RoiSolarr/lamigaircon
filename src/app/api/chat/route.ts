import { NextResponse, type NextRequest } from "next/server";
import { n8n } from "@/lib/env";
import { callN8n } from "@/lib/n8n";

// n8n on a free Render instance can take close to a minute to wake up.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// POST /api/chat { sessionId, message } -> { reply }
// Forwards one chat turn to the n8n Receptionist workflow. The workflow loads
// the conversation history itself, so only the new message is sent.
export async function POST(request: NextRequest) {
  let sessionId: unknown, message: unknown;
  try {
    ({ sessionId, message } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof sessionId !== "string" || !UUID.test(sessionId)) {
    return NextResponse.json({ error: "Invalid chat session. Refresh the page and try again." }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "That message is too long. Keep it under 1,000 characters." }, { status: 400 });
  }

  try {
    const res = await callN8n(n8n.chatUrl(), { sessionId, message: message.trim() }, 55_000);
    if (!res.ok) {
      console.error("Receptionist webhook returned", res.status, await res.text().catch(() => ""));
      throw new Error(`n8n responded ${res.status}`);
    }
    const data = (await res.json()) as { reply?: unknown };
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("n8n response had no reply");
    }
    return NextResponse.json({ reply: data.reply });
  } catch (err) {
    console.error("Chat failed", err);
    return NextResponse.json(
      { error: "The receptionist is not answering right now. You can still book online, or try again in a minute." },
      { status: 502 },
    );
  }
}
