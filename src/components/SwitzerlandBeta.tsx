"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ForecastData } from "@/lib/forecastCsv";
import ForecastChart from "./ForecastChart";
import styles from "./SwitzerlandBeta.module.css";

type Point = [number, number];
type Geometry = { type: "Polygon"; coordinates: Point[][] } | { type: "MultiPolygon"; coordinates: Point[][][] };
type Cantons = { features: { properties: { shapeName: string }; geometry: Geometry }[] };
const rings = (geometry: Geometry): Point[][] => geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
const project = ([longitude, latitude]: Point): Point => [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];

export default function SwitzerlandBeta() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [cantons, setCantons] = useState<Cantons | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Please sign in again to open the beta map.");
        const [forecast, map] = await Promise.all([
          fetch("/api/forecast-beta", { headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal }),
          fetch("/maps/switzerland-cantons.geojson", { signal: controller.signal }),
        ]);
        if (!forecast.ok) throw new Error((await forecast.json()).error || "Could not load forecast data.");
        if (!map.ok) throw new Error("Could not load the canton map.");
        const [forecastData, mapData] = await Promise.all([forecast.json(), map.json()]);
        if (!controller.signal.aborted) { setData(forecastData); setCantons(mapData); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load the beta map."); }
    }
    void load(); return () => controller.abort();
  }, [attempt]);
  const projection = useMemo(() => {
    if (!cantons) return null;
    const points = cantons.features.flatMap(feature => rings(feature.geometry).flat().map(project));
    const xs = points.map(p => p[0]); const ys = points.map(p => p[1]);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX; const height = Math.max(...ys) - minY;
    const scale = Math.min(900 / width, 490 / height);
    const xy = (point: Point): Point => { const p = project(point); return [50 + (900 - width * scale) / 2 + (p[0] - minX) * scale, 30 + (490 - height * scale) / 2 + (p[1] - minY) * scale]; };
    return { xy, paths: cantons.features.map(feature => ({ name: feature.properties.shapeName,
      path: rings(feature.geometry).map(ring => ring.map((point, index) => `${index ? "L" : "M"}${xy(point).map(n => n.toFixed(2)).join(",")}`).join(" ") + "Z").join(" "),
    })) };
  }, [cantons]);
  const selectedStations = selected.flatMap(id => data?.stations.filter(s => s.id === id) ?? []);
  function choose(id: string) {
    setSelected(current => current.includes(id) ? current.filter(stationId => stationId !== id) : [...current, id]);
  }
  if (error) return <div role="alert" className="m-6 rounded-xl border border-amber-300/30 p-6 text-amber-100">{error}<button className="ml-4 underline" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Try again</button></div>;
  if (!data || !projection) return <p role="status" className="p-10 text-slate-400">Loading Switzerland and station forecasts…</p>;
  const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400">Station explorer <span className="ml-2 rounded border border-cyan-400/25 px-1.5 py-0.5 tracking-normal">BETA</span></p><h2 className="text-2xl font-semibold tracking-tight">Switzerland · GHI forecasts</h2><p className="mt-2 text-sm text-slate-400">Select a station to explore its forecast and observations.</p></div>
      <div className="text-right text-xs text-slate-400"><p className="text-slate-200">{dateLabel(data.start)} – {dateLabel(data.end)} {new Date(data.end).getUTCFullYear()}</p><p className="mt-1">Test dataset · {data.stations.length} station{data.stations.length === 1 ? "" : "s"} · UTC</p></div>
    </div>
    <section className={styles.mapCard} aria-label="Switzerland station map">
      <div className="absolute left-5 top-5 z-10 flex items-center gap-2 text-xs text-slate-300"><span className="h-2 w-2 rounded-full bg-red-500" />GHI weather stations</div>
      <svg viewBox="0 0 1000 550" className={styles.map} aria-label="Map of Switzerland with canton boundaries">
        <defs><linearGradient id="canton-fill" x2="0.4" y2="1"><stop stopColor="#203c50" /><stop offset="1" stopColor="#142a3b" /></linearGradient></defs>
        <g fill="url(#canton-fill)" stroke="#698598" strokeWidth="0.85" strokeLinejoin="round" fillRule="evenodd">
          {projection.paths.map(canton => <path key={canton.name} d={canton.path}><title>{canton.name}</title></path>)}
        </g>
        {data.stations.map(s => { const [x, y] = projection.xy([s.longitude, s.latitude]); return <g key={s.id} transform={`translate(${x},${y})`} className={styles.station} role="button" tabIndex={0} aria-label={`${selected.includes(s.id) ? "Hide" : "Show"} ${s.name} (${s.id}) forecasts`} aria-pressed={selected.includes(s.id)} onClick={() => choose(s.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(s.id); } }}>
          <title>{s.name} · {s.id}</title><circle r="22" fill="transparent" /><circle className={styles.halo} r="15" fill="#ef4444" opacity="0.12" /><circle className={styles.dot} r="6" fill="#ef4444" stroke="#fecaca" strokeWidth="1.8" />
          <text x="16" y="-13" fill="#f8fafc" fontSize="14" fontWeight="600" paintOrder="stroke" stroke="#102332" strokeWidth="4">{s.name}</text>
        </g>; })}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 py-3 text-[10px] text-slate-500"><span>26 cantons · Switzerland</span><a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer" className="hover:text-slate-300">Boundaries: © swisstopo · geoBoundaries (2022)</a></div>
    </section>
    {selectedStations.map(station => <div key={station.id} className="mt-7 pb-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{station.name} <span className="ml-2 text-sm font-normal text-slate-500">{station.id} · Forecast comparison</span></h2><p className="text-xs text-slate-400">Drag to zoom · Double-click to reset · Click legend to toggle</p></div>
      <div className={styles.chartGrid}><ForecastChart data={data} station={station} model="icon_ch1" /><ForecastChart data={data} station={station} model="icon_ch2" /></div>
    </div>)}
    {selectedStations.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-400">Click a red station marker to open its plots. Click again to hide them.</div>}
  </div>;
}
