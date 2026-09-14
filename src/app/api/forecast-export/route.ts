import { createClient } from "@supabase/supabase-js";
import { filterForecastCsv } from "@/lib/forecastCsv";
import { ForecastSourceError, loadDailyForecast, validDay } from "@/lib/forecastSource";

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
  const day = params.get("day") ?? "";
  const version = params.get("version") ?? undefined;
  const stations = [...new Set((params.get("stations") ?? "").split(",").filter(Boolean))];
  if (!validDay(day) || !stations.length || stations.length > 200 || stations.some(id => !/^[A-Z0-9_-]{1,20}$/.test(id))) {
    return Response.json({ error: "Invalid forecast export request." }, { status: 400, headers });
  }
  try {
    const snapshot = await loadDailyForecast(day, version);
    const csv = filterForecastCsv(snapshot.text, new Set(stations));
    return new Response(csv, { headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="icon_ghi_selected_stations_${day}.csv"`,
    } });
  } catch (caught) {
    return Response.json({ error: caught instanceof ForecastSourceError ? caught.message : "Forecast export is temporarily unavailable." },
      { status: caught instanceof ForecastSourceError ? caught.status : 503, headers });
  }
}
