import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

// Anonymous client for public data and the booking functions.
// No cookies, so pages that use it can still be cached.
export function publicDb() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    db: { schema: "lamig" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
