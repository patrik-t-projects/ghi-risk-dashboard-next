import { createClient } from "@supabase/supabase-js";
import { forecastStations } from "@/lib/forecastStationCatalog";
import { ForecastSourceError, loadComparisonForecast, loadComparisonRuntimeCatalog, loadStationForecast,
  stationDetail, validDay } from "@/lib/forecastSource";

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
  const mode = params.get("mode");
  if (view === "comparison-runtimes") {
    if ((mode !== "today" && mode !== "history") || !/^[A-Z0-9_-]{1,20}$/.test(station)) {
      return Response.json({ error: "Invalid comparison runtime request." }, { status: 400, headers });
    }
    try {
      const result = await loadComparisonRuntimeCatalog(station, mode, today);
      return Response.json({ runs: result.runs,
        version: result.snapshots.map(snapshot => snapshot.file.version).join(":"),
      }, { headers });
    } catch (caught) {
      return sourceError(caught, headers);
    }
  }
  const periodMode = view === "comparison" ? mode : view;
  const from = periodMode === "today" ? today : params.get("from") ?? "";
  const to = periodMode === "today" ? today : params.get("to") ?? "";
  if ((periodMode !== "today" && periodMode !== "history") ||
      (view !== "today" && view !== "history" && view !== "comparison") ||
      !/^[A-Z0-9_-]{1,20}$/.test(station) ||
      !validDay(from) || !validDay(to) || from > to || to > today ||
      Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000) {
    return Response.json({ error: "Invalid forecast request." }, { status: 400, headers });
  }
  const runs = view === "comparison" ? [...new Set((params.get("runs") ?? "").split(",").filter(Boolean))] : [];
  if (view === "comparison" && (!runs.length || runs.length > 6 ||
      runs.some(run => !/^\d{8}T\d{6}Z$/.test(run)))) {
    return Response.json({ error: "Select between one and six valid model runtimes." }, { status: 400, headers });
  }
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const permittedTodayRunDays = new Set([yesterday.toISOString().slice(0, 10).replaceAll("-", ""), today.replaceAll("-", "")]);
  if (view === "comparison" && (periodMode === "today"
      ? runs.some(run => !permittedTodayRunDays.has(run.slice(0, 8)))
      : runs.some(run => run.slice(0, 8) >= today.replaceAll("-", "")))) {
    return Response.json({ error: "The selected runtime is unavailable for this comparison period." }, { status: 400, headers });
  }
  try {
    const allowedRuns = view === "comparison" ? new Set(runs) : undefined;
    const snapshots = view === "comparison"
      ? await loadComparisonForecast(station, periodMode, from, allowedRuns!)
      : await loadStationForecast(station, periodMode, from, to);
    const segments = snapshots.flatMap(snapshot => {
      const snapshotRuns = view === "comparison" && periodMode === "today"
        ? new Set(runs.filter(run => snapshot.file.kind === "daily"
          ? run.slice(0, 8) === today.replaceAll("-", "")
          : run.slice(0, 8) < today.replaceAll("-", "")))
        : allowedRuns;
      const detail = stationDetail(snapshot, from, to, snapshotRuns);
      return detail ? [detail] : [];
    });
    if (!segments.length) return Response.json({ error: "No forecast data is available for this range.", code: "station_not_found" },
      { status: 404, headers });
    return Response.json({ segments, version: snapshots.map(snapshot => snapshot.file.version).join(":") }, { headers });
  } catch (caught) { return sourceError(caught, headers); }
}

function sourceError(caught: unknown, headers: Record<string, string>) {
  return Response.json({ error: caught instanceof ForecastSourceError ? caught.message : "Forecast storage is temporarily unavailable.",
    code: caught instanceof ForecastSourceError ? caught.code : undefined },
  { status: caught instanceof ForecastSourceError ? caught.status : 503, headers });
}
