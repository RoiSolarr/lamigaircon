"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { staffDb as userDb } from "@/lib/supabase/server";

// Save the signed in customer's name and mobile number.
export async function saveMyAccount(formData: FormData) {
  const db = await userDb();
  const { data, error } = await db.rpc("save_my_account", {
    p_full_name: String(formData.get("full_name") ?? ""),
    p_phone: String(formData.get("phone") ?? ""),
  });
  const result = data as { ok?: boolean; error?: string } | null;

  if (error || !result?.ok) {
    redirect(`/account?error=${encodeURIComponent(error?.message ?? result?.error ?? "Could not save. Try again.")}`);
  }

  revalidatePath("/", "layout");
  redirect("/account?saved=1");
}
// Add a booking made before signing in to the history (needs its reference and email).
export async function linkMyBooking(formData: FormData) {
  const db = await userDb();
  const { data, error } = await db.rpc("link_my_booking", {
    p_ref: String(formData.get("ref") ?? ""),
    p_email: String(formData.get("email") ?? ""),
  });
  const result = data as { ok?: boolean; ref?: string; error?: string } | null;

  if (error || !result?.ok) {
    redirect(`/account?linkError=${encodeURIComponent(error?.message ?? result?.error ?? "Could not add that booking.")}#bookings`);
  }

  revalidatePath("/account");
  redirect(`/account?linked=${encodeURIComponent(result.ref ?? "")}#bookings`);
}
