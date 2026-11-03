import Link from "next/link";
import { staffDb as userDb } from "@/lib/supabase/server";

// "Sign in", or "Hi, Ana" for a signed in customer. Server component.
export async function HeaderAccount() {
  const db = await userDb();
  const { data } = await db.auth.getClaims();

  if (!data?.claims) {
    return (
      <Link href="/account" className="flex items-center gap-2 rounded-full px-3 py-1.5 text-ink transition-colors hover:bg-white">
        <PersonIcon />
        Sign in
      </Link>
    );
  }

  const { data: account } = await db
    .from("customer_accounts")
    .select("full_name")
    .eq("user_id", data.claims.sub)
    .maybeSingle();
  const first = (account?.full_name as string | undefined)?.split(" ")[0];

  return (
    <Link href="/account" className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 font-bold text-ink transition-colors hover:bg-white">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-ink text-sm text-frost">
        {(first ?? "?").slice(0, 1).toUpperCase()}
      </span>
      {first ? `Hi, ${first}` : "My account"}
    </Link>
  );
}

function PersonIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
