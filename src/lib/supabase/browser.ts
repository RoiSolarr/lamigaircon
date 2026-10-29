import { createBrowserClient } from "@supabase/ssr";

// Used only by the staff sign in form.
export function browserDb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
