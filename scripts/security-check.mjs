// PASS/FAIL check of what a website visitor (the anon key) can and cannot do.
// Read only: it never creates a booking. Run with:  npm run check:security
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local first.");
  process.exit(1);
}

const db = createClient(url, key, { db: { schema: "lamig" }, auth: { persistSession: false } });
let failed = 0;
const report = (ok, name, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
};

// Blocked means an error, or (for tables) zero rows back.
async function cannotRead(table) {
  const { data, error } = await db.from(table).select("*").limit(1);
  report(Boolean(error) || data.length === 0, `visitors cannot read ${table}`, error ? "" : `got ${data.length} row(s)`);
}
async function cannotCall(fn, args) {
  const { error } = await db.rpc(fn, args);
  report(Boolean(error), `visitors cannot run ${fn}()`, "the call succeeded");
}

console.log(`Checking ${url}\n`);

// Public business info is readable
for (const table of ["business_settings", "services", "faqs"]) {
  const { data, error } = await db.from(table).select("*").limit(1);
  report(!error && data.length > 0, `visitors can read ${table}`, error?.message ?? "no rows: did you run seed.sql?");
}

// Private data is not
for (const table of ["customers", "appointments", "notifications", "conversations", "messages", "staff"]) {
  await cannotRead(table);
}

// Writes to tables are blocked
{
  const { error } = await db.from("services").update({ price_php: 1 }).eq("code", "window_cleaning").select();
  const { data } = await db.from("services").select("price_php").eq("code", "window_cleaning").single();
  report(Boolean(error) || Number(data?.price_php) !== 1, "visitors cannot change prices");
}

// Public functions work
{
  const { data, error } = await db.rpc("get_slots", { p_service_code: "window_cleaning", p_date: "2099-01-01" });
  report(!error && data?.ok === true, "visitors can check free slots", error?.message);
}

// Booking with the chat source is refused for visitors (only n8n may do that)
{
  const { data, error } = await db.rpc("book_appointment", {
    p_service_code: "window_cleaning", p_date: "2099-01-01", p_start_time: "09:00",
    p_name: "Security Check", p_phone: "09170000000", p_email: "security-check@example.com",
    p_address: "Security check address, not a real booking", p_source: "chat",
  });
  report(!error && data?.ok === false, "visitors cannot pretend to be the AI receptionist", JSON.stringify(data ?? error));
}

// n8n only and staff only functions
const anyId = "00000000-0000-4000-8000-000000000000";
await cannotCall("claim_due_notifications", { p_limit: 1 });
await cannotCall("mark_notification_sent", { p_notification_id: 1 });
await cannotCall("mark_notification_failed", { p_notification_id: 1, p_error: "x" });
await cannotCall("chat_start", { p_conversation_id: anyId, p_message: "x" });
await cannotCall("save_reply", { p_conversation_id: anyId, p_reply: "x" });
await cannotCall("request_human", { p_conversation_id: anyId, p_name: "x", p_contact: "09170000000", p_reason: "x" });
await cannotCall("set_appointment_status", { p_appointment_id: anyId, p_status: "cancelled" });
await cannotCall("retry_notification", { p_notification_id: 1 });
await cannotCall("resolve_handoff", { p_conversation_id: anyId });

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
