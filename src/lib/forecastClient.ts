import { supabase } from "./supabaseClient";
import { readCsv, writeCsv, type ForecastFile } from "./forecastCsv";

export class ForecastRequestError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function fetchForecast<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ForecastRequestError("Please sign in again to load forecasts.", 401);
  const response = await fetch(`/api/forecast-beta?${new URLSearchParams(params)}`, { signal, cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}` } });
  const result = await response.json();
  if (!response.ok) throw new ForecastRequestError(result.error || "Could not load forecasts.", response.status, result.code);
  return result;
}

export async function downloadForecastCsv(files: ForecastFile[], stations: string[], signal?: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ForecastRequestError("Please sign in again to export forecasts.", 401);
  if (!files.length || !stations.length) throw new ForecastRequestError("Select at least one station with uploaded data.", 400);
  let header: string[] | undefined; const rows: string[][] = [];
  for (const file of files) {
    const response = await fetch(`/api/forecast-export?${new URLSearchParams({
      day: file.day, version: file.version, stations: stations.join(","),
    })}`, { signal, cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new ForecastRequestError(result.error || "Could not export forecast data.", response.status, result.code);
    }
    const records = readCsv(await response.text()); const nextHeader = records.shift();
    if (!nextHeader || (header && JSON.stringify(header) !== JSON.stringify(nextHeader))) {
      throw new ForecastRequestError("The selected daily files do not share the same CSV columns.", 422);
    }
    header ??= nextHeader; rows.push(...records);
  }
  if (!header || !rows.length) throw new ForecastRequestError("No data was found for the selected stations.", 404);
  return new Blob([writeCsv([header, ...rows])], { type: "text/csv;charset=utf-8" });
}
