"use client";

import { useEffect, useState } from "react";
import { fetchForecast } from "@/lib/forecastClient";
import { combineStationDays } from "@/lib/forecastHistory";
import type { StationForecastResponse, StationSummary } from "@/lib/forecastCsv";
import ForecastChart from "./ForecastChart";
import styles from "./SwitzerlandBeta.module.css";

type Combined = ReturnType<typeof combineStationDays>;

export default function StationPlots({ station, mode, from, to, refreshToken, onClose }: {
  station: StationSummary;
  mode: "today" | "history";
  from: string;
  to: string;
  refreshToken: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<Combined | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending || document.hidden) return;
      pending = true;
      setLoading(true);
      setError("");
      try {
        const params: Record<string, string> = { view: mode, station: station.id };
        if (mode === "history") Object.assign(params, { from, to });
        const result = await fetchForecast<StationForecastResponse>(params, controller.signal);
        if (!controller.signal.aborted) setData(combineStationDays(result.segments));
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load station forecasts.");
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const interval = mode === "today" ? setInterval(load, 60000) : undefined;
    if (mode === "today") document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, [station.id, mode, from, to, refreshToken, attempt]);

  return <section className="mt-7 pb-5" aria-label={`${station.name} forecast comparison`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{station.name} <span className="ml-2 text-sm font-normal text-slate-500">{station.id} · Forecast comparison</span></h2>
      <div className="flex items-center gap-4"><p className="text-xs text-slate-400">Drag to zoom · Double-click to reset · Click legend to toggle</p><button type="button" onClick={onClose} className="rounded border border-white/15 px-3 py-1 text-xs text-slate-300 hover:bg-white/10" aria-label={`Hide ${station.name} plots`}>Hide</button></div>
    </div>
    {error && <div role="alert" className="mb-3 rounded-xl border border-amber-300/20 p-4 text-sm text-amber-100">{error}<button className="ml-4 underline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry</button>{data && <p className="mt-1 text-xs">The previous successful chart remains visible.</p>}</div>}
    {loading && <p role="status" className="mb-3 text-sm text-slate-400">Loading {station.name} forecasts…{data ? " Updating the displayed chart." : ""}</p>}
    {data && <div className={styles.chartGrid}><ForecastChart data={data} station={data.station} model="icon_ch1" period={`${from}:${to}`} /><ForecastChart data={data} station={data.station} model="icon_ch2" period={`${from}:${to}`} /></div>}
  </section>;
}
