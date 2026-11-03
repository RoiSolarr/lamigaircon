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