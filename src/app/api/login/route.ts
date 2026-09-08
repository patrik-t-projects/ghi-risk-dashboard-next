import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
  try {
    const body = await request.json();
    if (typeof body.identifier !== "string" || typeof body.password !== "string" ||
        body.identifier.length > 254 || !body.password || body.password.length > 4096) {
      return fail("Enter your username or email and password.", 400);
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return fail("Sign-in is temporarily unavailable.", 503);
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const auth = createClient(url, key, options);
    let email = body.identifier.trim();
    if (!email.includes("@")) {
      const secret = process.env.SUPABASE_SECRET_KEY;
      if (!secret) return fail("Username sign-in is not configured yet. Please use your email.", 503);
      const admin = createClient(url, secret, options);
      const { data: profile, error } = await admin.from("account_usernames")
        .select("user_id").eq("username", email.toLowerCase()).maybeSingle();
      if (error) return fail("Username sign-in is temporarily unavailable. Please use your email.", 503);
      if (profile) {
        const { data } = await admin.auth.admin.getUserById(profile.user_id);
        email = data.user?.email ?? "unknown@invalid.invalid";
      } else { email = "unknown@invalid.invalid"; }
    }
    const { data, error } = await auth.auth.signInWithPassword({ email, password: body.password });
    if (error || !data.session) return fail("Unable to sign in. Check your credentials and confirm your email.", 401);
    return Response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, { headers });
  } catch { return fail("Unable to sign in. Please try again.", 400); }
}

