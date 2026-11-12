import { createClient } from "@supabase/supabase-js";
import { forecastStations } from "@/lib/forecastStationCatalog";
import { ForecastSourceError, loadStationForecast, stationDetail, validDay } from "@/lib/forecastSource";

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
  const view = params.get("view") ?? "today";
  const today = new Date().toISOString().slice(0, 10);
  if (view === "catalog") return Response.json({ stations: forecastStations, today }, { headers });
  const station = params.get("station") ?? "";
  const from = view === "today" ? today : params.get("from") ?? "";
  const to = view === "today" ? today : params.get("to") ?? "";
  if ((view !== "today" && view !== "history") || !/^[A-Z0-9_-]{1,20}$/.test(station) ||
      !validDay(from) || !validDay(to) || from > to || to > today ||
      Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000) {
    return Response.json({ error: "Invalid forecast request." }, { status: 400, headers });
  }
  try {
    const snapshots = await loadStationForecast(station, view, from, to);
    const segments = snapshots.flatMap(snapshot => {
      const detail = stationDetail(snapshot, from, to);
      return detail ? [detail] : [];
    });
    if (!segments.length) return Response.json({ error: "No forecast data is available for this range.", code: "station_not_found" },
      { status: 404, headers });
    return Response.json({ segments, version: snapshots.map(snapshot => snapshot.file.version).join(":") }, { headers });
  } catch (caught) {
    return Response.json({ error: caught instanceof ForecastSourceError ? caught.message : "Forecast storage is temporarily unavailable.",
      code: caught instanceof ForecastSourceError ? caught.code : undefined },
    { status: caught instanceof ForecastSourceError ? caught.status : 503, headers });
  }
}
