import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { staffDb as userDb } from "@/lib/supabase/server";

// Links in Supabase emails (confirm your account, reset your password) land here.
// We turn the link into a signed in session, then go to `next`.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawNext = url.searchParams.get("next") ?? "/account";
  // Only our own account pages, never another site.
  const next = rawNext.startsWith("/account") ? rawNext : "/account";

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const db = await userDb();
  let failed = true;
  if (code) {
    failed = Boolean((await db.auth.exchangeCodeForSession(code)).error);
  } else if (tokenHash && type) {
    failed = Boolean((await db.auth.verifyOtp({ token_hash: tokenHash, type })).error);
  }

  const target = new URL(failed ? "/account" : next, url.origin);
  if (failed) target.searchParams.set("error", "That link has expired or was already used. Sign in, or ask for a new link.");
  return NextResponse.redirect(target);
}
