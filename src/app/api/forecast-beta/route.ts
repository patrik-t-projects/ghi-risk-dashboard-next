import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseForecastCsv } from "@/lib/forecastCsv";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ error: "Authentication required." }, { status: 401, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Authentication unavailable." }, { status: 503, headers });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Please sign in again." }, { status: 401, headers });
  try {
    const csv = await readFile(path.join(process.cwd(), "test_data", "icon_ghi_chz_all_members.csv"), "utf8");
    return Response.json(parseForecastCsv(csv), { headers });
  } catch {
    return Response.json({ error: "The beta forecast sample could not be loaded." }, { status: 500, headers });
  }
}
