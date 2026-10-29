import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

// Client for the admin pages. It carries the signed in staff member's session,
// so row level security decides what they can read.
export async function staffDb() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    db: { schema: "lamig" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read only.
          // proxy.ts refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
