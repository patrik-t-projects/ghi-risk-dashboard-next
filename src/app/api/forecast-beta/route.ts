import { createClient } from "@supabase/supabase-js";
import { ForecastSourceError, listForecastFiles, loadDailyForecast, validDay } from "@/lib/forecastSource";

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
  const day = params.get("day") ?? new Date().toISOString().slice(0, 10);
  const stationId = params.get("station");
  if (!validDay(day) || (stationId !== null && !/^[A-Z0-9_-]{1,20}$/.test(stationId))) {
    return Response.json({ error: "Invalid forecast request." }, { status: 400, headers });
  }
  try {
    if (params.get("view") === "catalog") {
      return Response.json({ files: await listForecastFiles(), today: new Date().toISOString().slice(0, 10) }, { headers });
    }
    const snapshot = await loadDailyForecast(day, params.get("version") ?? undefined);
    const { series, stations, start, end } = snapshot.data;
    if (stationId) {
      const station = stations.find(s => s.id === stationId);
      if (!station) return Response.json({ error: "Station not found in this daily file.", code: "station_not_found" }, { status: 404, headers });
      return Response.json({ series, station, start, end }, { headers });
    }
    return Response.json({ day: snapshot.day, version: snapshot.version, start, end,
      stations: stations.map(({ id, name, latitude, longitude }) => ({ id, name, latitude, longitude })),
    }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof ForecastSourceError ? error.message : "Forecast storage is temporarily unavailable." },
      { status: error instanceof ForecastSourceError ? error.status : 503, headers });
  }
}
