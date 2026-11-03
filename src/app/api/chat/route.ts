import { NextResponse, type NextRequest } from "next/server";
import { n8n } from "@/lib/env";
import { callN8n } from "@/lib/n8n";
import { publicDb } from "@/lib/supabase/public";
import { staffDb as userDb } from "@/lib/supabase/server";

// n8n on a free Render instance can take close to a minute to wake up.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// POST /api/chat { sessionId, message } -> { reply } or { waiting: true }
// Forwards one chat turn to the n8n Receptionist workflow. The workflow loads
// the conversation history itself, so only the new message is sent.
// If the customer is signed in, the chat is linked to their account first, so
// staff see their name. If staff have taken over this chat, the message is
// saved for them and the AI does not answer ({ waiting: true }).
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

  // Link the chat to the signed in customer (does nothing for guests).
  try {
    const db = await userDb();
    const { data: claims } = await db.auth.getClaims();
    if (claims?.claims) await db.rpc("claim_conversation", { p_conversation_id: sessionId });
  } catch (err) {
    console.warn("Could not link the chat to the account", err);
  }

  // Staff are answering this chat: save the message for them instead of asking the AI.
  const { data: paused, error: pausedError } = await publicDb().rpc("customer_message_if_paused", {
    p_conversation_id: sessionId,
    p_message: message.trim(),
  });
  if (pausedError) console.error("customer_message_if_paused failed", pausedError);
  const state = paused as { paused?: boolean; error?: string } | null;
  if (state?.paused) {
    if (state.error) return NextResponse.json({ error: state.error }, { status: 429 });
    return NextResponse.json({ waiting: true });
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