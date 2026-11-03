"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffDb } from "@/lib/supabase/server";

// Staff and technician actions. Each calls a security definer function that
// checks who is signed in itself (lamig.is_staff() or the technician's own
// jobs), so these are safe even if someone calls them directly.
// When the database refuses (for example "that technician is busy"), the page
// is reloaded with ?error=... and shows the reason.

type Result = { ok: boolean; error?: string };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function backTo(formData: FormData, fallback: string) {
  const back = text(formData, "back");
  return back.startsWith("/admin") || back.startsWith("/tech") ? back : fallback;
}

async function run(fn: string, args: Record<string, unknown>, back: string, alsoRefresh: string[] = [], notice?: string) {
  const db = await staffDb();
  const { data, error } = await db.rpc(fn, args);
  const result = (data ?? { ok: false }) as Result;
  const message = error ? error.message : result.ok ? null : (result.error ?? "That did not work.");

  for (const path of [back.split("?")[0], ...alsoRefresh]) revalidatePath(path);

  if (message || notice) {
    const url = new URL(back, "http://x");
    url.searchParams.delete("error");
    url.searchParams.delete("notice");
    url.searchParams.set(message ? "error" : "notice", (message ?? notice)!);
    redirect(url.pathname + url.search);
  }
}

const STATUS_NOTICE: Record<string, string> = {
  completed: "Job marked done. It is now in Booking history.",
  cancelled: "Job cancelled. It is now in Booking history.",
  no_show: "Job marked as no show. It is now in Booking history.",
  booked: "Job set back to booked. It is back on Appointments.",
};

export async function setAppointmentStatus(formData: FormData) {
  const back = backTo(formData, "/admin");
  await run(
    "set_appointment_status",
    { p_appointment_id: text(formData, "id"), p_status: text(formData, "status") },
    back,
    ["/admin", "/admin/history", "/admin/customers", "/tech"],
    back.startsWith("/admin") ? STATUS_NOTICE[text(formData, "status")] : undefined,
  );
}

export async function setAppointmentTechnician(formData: FormData) {
  const tech = text(formData, "technician_id");
  await run(
    "set_appointment_technician",
    { p_appointment_id: text(formData, "id"), p_technician_id: tech || null },
    backTo(formData, "/admin"),
  );
}

export async function saveTechnician(formData: FormData) {
  await run(
    "save_technician",
    {
      p_technician_id: text(formData, "id") || null,
      p_full_name: text(formData, "full_name"),
      p_phone: text(formData, "phone"),
      p_email: text(formData, "email"),
    },
    "/admin/technicians",
  );
}

export async function setTechnicianActive(formData: FormData) {
  await run(
    "set_technician_active",
    { p_technician_id: text(formData, "id"), p_active: text(formData, "active") === "true" },
    "/admin/technicians",
    ["/admin"],
  );
}

export async function setDayOff(formData: FormData) {
  await run(
    "set_day_off",
    {
      p_technician_id: text(formData, "id"),
      p_date: text(formData, "date") || null,
      p_off: text(formData, "off") !== "false",
      p_reason: text(formData, "reason"),
    },
    "/admin/technicians",
    ["/admin"],
  );
}

export async function linkTechnicianLogin(formData: FormData) {
  await run(
    "link_technician_login",
    { p_technician_id: text(formData, "id"), p_email: text(formData, "email") },
    "/admin/technicians",
  );
}

export async function retryNotification(formData: FormData) {
  await run("retry_notification", { p_notification_id: Number(formData.get("id")) }, "/admin/automation");
}

export async function retryScheduleEmail(formData: FormData) {
  await run("retry_schedule_email", { p_schedule_id: Number(formData.get("id")) }, "/admin/automation");
}

// Staff reply in a chat. The AI stops answering that chat until staff let it answer again.
export async function staffReply(formData: FormData) {
  await run(
    "staff_reply",
    { p_conversation_id: text(formData, "id"), p_message: String(formData.get("message") ?? "") },
    backTo(formData, "/admin/inbox"),
  );
}

export async function setAiPaused(formData: FormData) {
  await run(
    "set_ai_paused",
    { p_conversation_id: text(formData, "id"), p_paused: text(formData, "paused") === "true" },
    backTo(formData, "/admin/inbox"),
  );
}

export async function resolveHandoff(formData: FormData) {
  await run("resolve_handoff", { p_conversation_id: text(formData, "id") }, backTo(formData, "/admin/inbox"));
}

export async function signOut() {
  const db = await staffDb();
  await db.auth.signOut();
  redirect("/admin/login");
}