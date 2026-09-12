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
