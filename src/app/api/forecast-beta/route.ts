import { createClient } from "@supabase/supabase-js";
import { loadDailyForecast } from "@/lib/forecastSource";

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
  const params = new URL(request.url).searchParams;
  const day = params.get("day") ?? undefined;
  const stationId = params.get("station");
  if ((day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) || (stationId !== null && !/^[A-Z0-9_-]{1,20}$/.test(stationId))) {
    return Response.json({ error: "Invalid forecast request." }, { status: 400, headers });
  }
  try {
    const snapshot = await loadDailyForecast(day);
    const { series, stations, start, end } = snapshot.data;
    if (params.has("version") && params.get("version") !== snapshot.version) {
      return Response.json({ error: "The daily dataset has changed. Reopen the beta tab to load the updated map." }, { status: 409, headers });
    }
    if (stationId) {
      const station = stations.find(s => s.id === stationId);
      if (!station) return Response.json({ error: "Station not found in this daily file." }, { status: 404, headers });
      return Response.json({ series, station, start, end }, { headers });
    }
    return Response.json({ day: snapshot.day, version: snapshot.version, start, end,
      stations: stations.map(({ id, name, latitude, longitude }) => ({ id, name, latitude, longitude })),
    }, { headers });
  } catch {
    return Response.json({ error: "The beta forecast sample could not be loaded." }, { status: 500, headers });
  }
}
