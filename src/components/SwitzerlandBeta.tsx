"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchForecast, ForecastRequestError } from "@/lib/forecastClient";
import type { ForecastOverview, ForecastCatalog, ForecastFile } from "@/lib/forecastCsv";
import StationPlots from "./StationPlots";
import styles from "./SwitzerlandBeta.module.css";
type Point = [number, number];
type Geometry = { type: "Polygon"; coordinates: Point[][] } | { type: "MultiPolygon"; coordinates: Point[][][] };
type Cantons = { features: { properties: { shapeName: string }; geometry: Geometry }[] };
const rings = (geometry: Geometry): Point[][] => geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
const project = ([longitude, latitude]: Point): Point => [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];
export default function SwitzerlandBeta({ mode, onModeChange }: { mode: "today" | "history"; onModeChange: (mode: "today" | "history") => void }) {
  const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [catalog, setCatalog] = useState<ForecastCatalog | null>(null);
  const [data, setData] = useState<ForecastOverview | null>(null);
  const [cantons, setCantons] = useState<Cantons | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [from, setFrom] = useState(yesterday);
  const [to, setTo] = useState(yesterday);
  const [range, setRange] = useState(() => ({ from: yesterday(), to: yesterday() }));
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [checked, setChecked] = useState("");
  const summaries = useRef(new Map<string, ForecastOverview>());
  const today = catalog?.today ?? new Date().toISOString().slice(0, 10);
  const activeFrom = mode === "today" ? today : range.from;
  const activeTo = mode === "today" ? today : range.to;
  const files = useMemo(() => catalog?.files.filter(file => file.day >= activeFrom && file.day <= activeTo) ?? [], [catalog, activeFrom, activeTo]);
  const fileKey = JSON.stringify(files);
  const missingDays = Math.max(0, Math.round((Date.parse(activeTo) - Date.parse(activeFrom)) / 86400000) + 1 - files.length);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function check() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await fetchForecast<ForecastCatalog>({ view: "catalog" }, controller.signal);
        if (!controller.signal.aborted) {
          setCatalog(current => JSON.stringify(current) === JSON.stringify(result) ? current : result);
          setChecked(new Date().toLocaleTimeString("en-GB", { timeZone: "UTC" })); setCatalogError("");
        }
      } catch (e) { if (!controller.signal.aborted) setCatalogError(e instanceof Error ? e.message : "Could not check for uploads."); }
      finally { pending = false; }
    }
    void check();
    const interval = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", check); };
  }, [attempt]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/maps/switzerland-cantons.geojson", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Could not load the canton map."); return response.json();
    }).then(result => { if (!controller.signal.aborted) { setCantons(result); setMapError(""); } })
      .catch(() => { if (!controller.signal.aborted) setMapError("Could not load the canton map."); });
    return () => controller.abort();
  }, [attempt]);
  const catalogReady = catalog !== null;
  useEffect(() => {
    if (!catalogReady) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const requested: ForecastFile[] = JSON.parse(fileKey);
        const stations = new Map<string, ForecastOverview["stations"][number]>();
        for (let i = 0; i < requested.length; i++) {
          const file = requested[i]; const key = `${file.day}:${file.version}`;
          setProgress(`Loading day ${i + 1} of ${requested.length}…`);
          let summary = summaries.current.get(key);
          if (!summary) {
            summary = await fetchForecast<ForecastOverview>({ day: file.day, version: file.version }, controller.signal);
            if (controller.signal.aborted) return;
            summaries.current.set(key, summary);
            while (summaries.current.size > 100) summaries.current.delete(summaries.current.keys().next().value!);
          }
          for (const station of summary.stations) stations.set(station.id, station);
        }
        if (!controller.signal.aborted) setData({ day: activeFrom, version: fileKey, start: `${activeFrom}T00:00:00Z`, end: `${activeTo}T23:59:59Z`, stations: [...stations.values()].sort((a, b) => a.id.localeCompare(b.id)) });
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Could not load forecasts.");
          if (e instanceof ForecastRequestError && e.status === 409) setTimeout(() => { if (!controller.signal.aborted) setAttempt(n => n + 1); }, 16000);
        }
      } finally { if (!controller.signal.aborted) { setLoading(false); setProgress(""); } }
    }
    void load(); return () => controller.abort();
  }, [fileKey, catalogReady, activeFrom, activeTo, attempt]);
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
  const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400">Station explorer <span className="ml-2 rounded border border-cyan-400/25 px-1.5 py-0.5 tracking-normal">BETA</span></p><h2 className="text-2xl font-semibold tracking-tight">Switzerland · GHI forecasts</h2><p className="mt-2 text-sm text-slate-400">Select a station to explore its forecast and observations.</p></div>
      <div className="text-right text-xs text-slate-400"><p className="text-slate-200">{dateLabel(`${activeFrom}T00:00:00Z`)}{activeFrom !== activeTo ? ` – ${dateLabel(`${activeTo}T00:00:00Z`)}` : ""} {activeTo.slice(0, 4)}</p><p className="mt-1">Supabase Storage · {data?.stations.length ?? 0} stations · UTC</p></div>
    </div>
    <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2" role="tablist" aria-label="Forecast period">{(["today", "history"] as const).map(view => <button key={view} type="button" role="tab" aria-selected={mode === view} onClick={() => onModeChange(view)} className={`rounded-lg px-4 py-2 text-sm ${mode === view ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5"}`}>{view === "today" ? "Today" : "Historical"}</button>)}</div><div className="flex items-center gap-3 text-xs text-slate-400"><span>Auto-update: every minute{checked ? ` · Checked ${checked} UTC` : ""}</span><button type="button" className="rounded border border-white/15 px-3 py-2 hover:text-white" onClick={() => setAttempt(n => n + 1)}>Refresh</button></div></div>
      {mode === "history" && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (from > to) { setError("The start date must be on or before the end date."); return; } setRange({ from, to }); }}>
        <label className="text-xs text-slate-400">From (UTC day)<input type="date" required value={from} max={to || today} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded border border-white/20 bg-[#0d1d2b] px-3 py-2 text-sm text-white [color-scheme:dark]" /></label>
        <label className="text-xs text-slate-400">To (UTC day)<input type="date" required value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="mt-1 block rounded border border-white/20 bg-[#0d1d2b] px-3 py-2 text-sm text-white [color-scheme:dark]" /></label>
        <button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Show range</button>
        <span className="pb-2 text-xs text-slate-500">{catalog?.files.length ? `Available uploads: ${catalog.files[0].day} to ${catalog.files.at(-1)!.day}` : "No daily CSV uploads yet."}</span>
      </form>}
    </div>
    {(error || catalogError || mapError) && <div role="alert" className="mb-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100">{error || catalogError || mapError}<button className="ml-4 underline" onClick={() => setAttempt(n => n + 1)}>Retry</button>{data && <p className="mt-1 text-xs">Showing the last successfully loaded data until the refresh succeeds.</p>}</div>}
    {loading && !error && !catalogError && <p role="status" className="mb-4 text-sm text-slate-400">{progress || "Checking uploaded forecasts…"}</p>}
    {catalog && !loading && missingDays > 0 && <p className="mb-4 text-sm text-amber-200">{mode === "today" ? `Waiting for today's CSV (${today}). New uploads appear automatically.` : `${missingDays} day(s) in this range have no uploaded CSV. Plots show available days with gaps.`}</p>}
    <section className={styles.mapCard} aria-label="Switzerland station map">
      <div className="absolute left-5 top-5 z-10 flex items-center gap-2 text-xs text-slate-300"><span className="h-2 w-2 rounded-full bg-red-500" />GHI weather stations</div>
      <svg viewBox="0 0 1000 550" className={styles.map} aria-label="Map of Switzerland with canton boundaries">
        <defs><linearGradient id="canton-fill" x2="0.4" y2="1"><stop stopColor="#203c50" /><stop offset="1" stopColor="#142a3b" /></linearGradient></defs>
        <g fill="url(#canton-fill)" stroke="#698598" strokeWidth="0.85" strokeLinejoin="round" fillRule="evenodd">
          {projection?.paths.map(canton => <path key={canton.name} d={canton.path}><title>{canton.name}</title></path>)}
        </g>
        {projection && [...(data?.stations ?? [])].sort((a, b) => Number(selected.includes(a.id)) - Number(selected.includes(b.id))).map(s => { const [x, y] = projection.xy([s.longitude, s.latitude]); return <g key={s.id} transform={`translate(${x},${y})`} className={styles.station} role="button" tabIndex={0} aria-label={`${selected.includes(s.id) ? "Hide" : "Show"} ${s.name} (${s.id}) forecasts`} aria-pressed={selected.includes(s.id)} onClick={() => choose(s.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(s.id); } }}>
          <title>{s.name} · {s.id}</title><circle r="8" fill="transparent" /><circle className={styles.halo} r="10" fill="#ef4444" opacity="0.12" pointerEvents="none" /><circle className={styles.dot} r="4.5" fill="#ef4444" stroke="#fecaca" strokeWidth="1.4" />
          <text className={styles.stationLabel} x="12" y="-10" fill="#f8fafc" fontSize="13" fontWeight="600" paintOrder="stroke" stroke="#102332" strokeWidth="4">{s.name}</text>
        </g>; })}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 py-3 text-[10px] text-slate-500"><span>26 cantons · Switzerland</span><a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer" className="hover:text-slate-300">Boundaries: © swisstopo · geoBoundaries (2022)</a></div>
    </section>
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><label htmlFor="station-picker" className="text-slate-400">Select a station</label><select id="station-picker" value="" onChange={e => { if (e.target.value) choose(e.target.value); }} className="rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-slate-200"><option value="">Choose station…</option>{data?.stations.map(s => <option key={s.id} value={s.id}>{s.name === s.id ? s.id : `${s.name} (${s.id})`}{selected.includes(s.id) ? " — selected (hide)" : ""}</option>)}</select><span className="text-xs text-slate-500">{selected.length} selected · Hover for station labels</span></div>
    {data && selectedStations.map(station => <StationPlots key={station.id} station={station} files={JSON.parse(data.version)} from={data.start.slice(0, 10)} to={data.end.slice(0, 10)} onClose={() => choose(station.id)} onRefresh={() => setAttempt(n => n + 1)} />)}
    {selectedStations.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-400">Click a red station marker to open its plots. Click again to hide them.</div>}
  </div>;
}
