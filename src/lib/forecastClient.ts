import { supabase } from "./supabaseClient";

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

export async function downloadForecastCsv(view: "today" | "history", from: string, to: string, stations: string[], signal?: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ForecastRequestError("Please sign in again to export forecasts.", 401);
  if (!stations.length) throw new ForecastRequestError("Select at least one station with uploaded data.", 400);
  const response = await fetch(`/api/forecast-export?${new URLSearchParams({ view, from, to, stations: stations.join(",") })}`,
    { signal, cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new ForecastRequestError(result.error || "Could not export forecast data.", response.status, result.code);
  }
  return response.blob();
}
