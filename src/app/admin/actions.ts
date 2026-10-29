"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffDb } from "@/lib/supabase/server";

// Staff actions. Each calls a security definer function that checks
// lamig.is_staff() itself, so these are safe even if someone calls them directly.

type Result = { ok: boolean; error?: string };

async function run(fn: string, args: Record<string, unknown>, path: string) {
  const db = await staffDb();
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  const result = data as Result;
  if (!result.ok) throw new Error(result.error ?? "Action failed.");
  revalidatePath(path);
}

export async function setAppointmentStatus(formData: FormData) {
  await run(
    "set_appointment_status",
    { p_appointment_id: String(formData.get("id")), p_status: String(formData.get("status")) },
    "/admin",
  );
}

export async function retryNotification(formData: FormData) {
  await run("retry_notification", { p_notification_id: Number(formData.get("id")) }, "/admin/automation");
}

export async function resolveHandoff(formData: FormData) {
  await run("resolve_handoff", { p_conversation_id: String(formData.get("id")) }, "/admin/inbox");
}

export async function signOut() {
  const db = await staffDb();
  await db.auth.signOut();
  redirect("/admin/login");
}
