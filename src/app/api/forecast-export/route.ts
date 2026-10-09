import { createClient } from "@supabase/supabase-js";
import { readCsv, writeCsv } from "@/lib/forecastCsv";
import { ForecastSourceError, loadStationForecast, validDay } from "@/lib/forecastSource";

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
  const from = view === "today" ? today : params.get("from") ?? "";
  const to = view === "today" ? today : params.get("to") ?? "";
  const stations = [...new Set((params.get("stations") ?? "").split(",").filter(Boolean))];
  if ((view !== "today" && view !== "history") || !validDay(from) || !validDay(to) || from > to || to > today ||
      Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000 ||
      !stations.length || stations.length > 200 || stations.some(id => !/^[A-Z0-9_-]{1,20}$/.test(id))) {
    return Response.json({ error: "Invalid forecast export request." }, { status: 400, headers });
  }
  try {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`) + 86400000;
    let header: string[] | undefined;
    const rows: string[][] = [];
    for (const station of stations) {
      const snapshots = await loadStationForecast(station, view, from, to);
      for (const snapshot of snapshots) {
        const records = readCsv(snapshot.text);
        const nextHeader = records.shift();
        if (!nextHeader || (header && JSON.stringify(header) !== JSON.stringify(nextHeader))) {
          throw new ForecastSourceError("The selected station files do not share the same CSV columns.", 422);
        }
        header ??= nextHeader;
        const timeIndex = nextHeader.indexOf("datetime");
        const stationIndex = nextHeader.indexOf("station_abbr");
        if (timeIndex < 0 || stationIndex < 0) throw new ForecastSourceError("The station CSV is missing required columns.", 422);
        rows.push(...records.filter(row => row[stationIndex] === station && Date.parse(row[timeIndex]) >= start && Date.parse(row[timeIndex]) < end));
      }
    }
    if (!header || !rows.length) throw new ForecastSourceError("No data was found for the selected stations.", 404);
    const period = from === to ? from : `${from}_to_${to}`;
    return new Response(writeCsv([header, ...rows]), { headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="icon_ghi_selected_stations_${period}.csv"`,
    } });
  } catch (caught) {
    return Response.json({ error: caught instanceof ForecastSourceError ? caught.message : "Forecast export is temporarily unavailable." },
      { status: caught instanceof ForecastSourceError ? caught.status : 503, headers });
  }
}
