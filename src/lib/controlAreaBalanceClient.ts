import { supabase } from "./supabaseClient";
import type { ControlAreaBalanceRow } from "./controlAreaBalanceCsv";

export type ControlAreaBalanceResponse = {
  rows: ControlAreaBalanceRow[];
  start: string | null;
  end: string | null;
  availableFrom: string;
  availableTo: string;
  version: string;
};

export async function fetchControlAreaBalance(params: Record<string, string>, signal?: AbortSignal): Promise<ControlAreaBalanceResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again to load Swissgrid data.");
  const response = await fetch(`/api/control-area-balance?${new URLSearchParams(params)}`, {
    signal, cache: "no-store", headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load Swissgrid data.");
  return result;
}
