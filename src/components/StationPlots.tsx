"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { StationDetail, StationSummary } from "@/lib/forecastCsv";
import ForecastChart from "./ForecastChart";
import styles from "./SwitzerlandBeta.module.css";

export default function StationPlots({ station, day, version, onClose }: {
  station: StationSummary; day: string; version: string; onClose: () => void;
}) {
  const [data, setData] = useState<StationDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Please sign in again to load station forecasts.");
        const params = new URLSearchParams({ station: station.id, day, version });
        const response = await fetch(`/api/forecast-beta?${params}`, { signal: controller.signal,
          headers: { Authorization: `Bearer ${session.access_token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load station forecasts.");
        if (!controller.signal.aborted) setData(result);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load station forecasts."); }
    }
    void load(); return () => controller.abort();
  }, [station.id, day, version, attempt]);
  return <section className="mt-7 pb-5" aria-label={`${station.name} forecast comparison`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{station.name} <span className="ml-2 text-sm font-normal text-slate-500">{station.id} · Forecast comparison</span></h2>
      <div className="flex items-center gap-4"><p className="text-xs text-slate-400">Drag to zoom · Double-click to reset · Click legend to toggle</p><button type="button" onClick={onClose} className="rounded border border-white/15 px-3 py-1 text-xs text-slate-300 hover:bg-white/10" aria-label={`Hide ${station.name} plots`}>Hide</button></div>
    </div>
    {error ? <div role="alert" className="rounded-xl border border-amber-300/20 p-6 text-sm text-amber-100">{error}<button className="ml-4 underline" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Retry</button></div>
      : data ? <div className={styles.chartGrid}><ForecastChart data={data} station={data.station} model="icon_ch1" /><ForecastChart data={data} station={data.station} model="icon_ch2" /></div>
      : <p role="status" className="rounded-xl border border-white/10 p-8 text-sm text-slate-400">Loading {station.name} forecasts…</p>}
  </section>;
}
