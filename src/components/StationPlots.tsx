"use client";
import { useEffect, useRef, useState } from "react";
import { fetchForecast, ForecastRequestError } from "@/lib/forecastClient";
import { combineStationDays } from "@/lib/forecastHistory";
import type { ForecastFile, StationDetail, StationSummary } from "@/lib/forecastCsv";
import ForecastChart from "./ForecastChart";
import styles from "./SwitzerlandBeta.module.css";
type Combined = ReturnType<typeof combineStationDays>;
export default function StationPlots({ station, files, from, to, onClose, onRefresh }: {
  station: StationSummary; files: ForecastFile[]; from: string; to: string; onClose: () => void; onRefresh: () => void;
}) {
  const [data, setData] = useState<Combined | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [attempt, setAttempt] = useState(0);
  const cached = useRef(new Map<string, StationDetail | null>());
  const refresh = useRef(onRefresh);
  useEffect(() => { refresh.current = onRefresh; }, [onRefresh]);
  const fileKey = JSON.stringify(files);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const requested: ForecastFile[] = JSON.parse(fileKey);
        const days: StationDetail[] = [];
        for (let i = 0; i < requested.length; i++) {
          const file = requested[i]; const key = `${station.id}:${file.day}:${file.version}`;
          setProgress(`Loading ${i + 1} of ${requested.length} days…`);
          if (!cached.current.has(key)) {
            try {
              const result = await fetchForecast<StationDetail>({ station: station.id, day: file.day, version: file.version }, controller.signal);
              if (controller.signal.aborted) return;
              cached.current.set(key, result);
            } catch (e) {
              if (e instanceof ForecastRequestError && e.code === "station_not_found") cached.current.set(key, null);
              else throw e;
            }
            while (cached.current.size > 100) cached.current.delete(cached.current.keys().next().value!);
          }
          const detail = cached.current.get(key); if (detail) days.push(detail);
        }
        if (!controller.signal.aborted) setData(combineStationDays(days));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Could not load station forecasts.");
          if (e instanceof ForecastRequestError && e.status === 409) setTimeout(() => { if (!controller.signal.aborted) refresh.current(); }, 16000);
        }
      } finally { if (!controller.signal.aborted) { setLoading(false); setProgress(""); } }
    }
    void load(); return () => controller.abort();
  }, [station.id, fileKey, attempt]);
  return <section className="mt-7 pb-5" aria-label={`${station.name} forecast comparison`}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{station.name} <span className="ml-2 text-sm font-normal text-slate-500">{station.id} · Forecast comparison</span></h2>
      <div className="flex items-center gap-4"><p className="text-xs text-slate-400">Drag to zoom · Double-click to reset · Click legend to toggle</p><button type="button" onClick={onClose} className="rounded border border-white/15 px-3 py-1 text-xs text-slate-300 hover:bg-white/10" aria-label={`Hide ${station.name} plots`}>Hide</button></div>
    </div>
    {error && <div role="alert" className="mb-3 rounded-xl border border-amber-300/20 p-4 text-sm text-amber-100">{error}<button className="ml-4 underline" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Retry</button>{data && <p className="mt-1 text-xs">The previous successful chart remains visible.</p>}</div>}
    {loading && <p role="status" className="mb-3 text-sm text-slate-400">{progress || `Loading ${station.name} forecasts…`}{data ? " Updating the displayed chart." : ""}</p>}
    {data && <div className={styles.chartGrid}><ForecastChart data={data} station={data.station} model="icon_ch1" period={`${from}:${to}`} /><ForecastChart data={data} station={data.station} model="icon_ch2" period={`${from}:${to}`} /></div>}
  </section>;
}
