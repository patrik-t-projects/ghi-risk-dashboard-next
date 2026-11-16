import { createClient } from "@supabase/supabase-js";
import { availableFogRuntimes, FogSourceError, loadFogRuntime } from "@/lib/fogSource";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const params = new URL(request.url).searchParams;
  try {
    if ((params.get("view") ?? "catalog") === "catalog") {
      return Response.json({ today: new Date().toISOString().slice(0, 10), runtimes: await availableFogRuntimes() }, { headers });
    }
    const runtimeValue = params.get("runtime") ?? "";
    const result = await loadFogRuntime(runtimeValue);
    return Response.json({ runtime: runtimeValue, records: result.records, version: result.version }, { headers });
  } catch (caught) {
    return Response.json({ error: caught instanceof FogSourceError ? caught.message : "Fog forecasts are temporarily unavailable." },
      { status: caught instanceof FogSourceError ? caught.status : 503, headers });
  }
}
