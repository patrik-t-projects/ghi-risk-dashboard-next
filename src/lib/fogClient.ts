import { supabase } from "./supabaseClient";
import type { FogRecord } from "./fogCsv";
import type { FogRuntimeOption } from "./fogSource";

export type FogCatalogResponse = { today: string; runtimes: FogRuntimeOption[] };
export type FogRuntimeResponse = { runtime: string; records: FogRecord[]; version: string };

export async function fetchFogForecast<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again to load fog forecasts.");
  const response = await fetch(`/api/fog-forecast?${new URLSearchParams(params)}`, { signal, cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load fog forecasts.");
  return result;
}
