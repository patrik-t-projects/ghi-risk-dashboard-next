"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { downloadForecastCsv, fetchForecast } from "@/lib/forecastClient";
import { exportPlotsPdf, exportPlotsPng, saveDownload } from "@/lib/forecastExport";
import type { ForecastCatalog } from "@/lib/forecastCsv";
import StationPlots from "./StationPlots";
import styles from "./SwitzerlandBeta.module.css";
type Point = [number, number];
type Geometry = { type: "Polygon"; coordinates: Point[][] } | { type: "MultiPolygon"; coordinates: Point[][][] };
type Cantons = { features: { properties: { shapeName: string }; geometry: Geometry }[] };
type Lakes = { features: { properties: { name: string }; geometry: Geometry }[] };
const rings = (geometry: Geometry): Point[][] => geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
const project = ([longitude, latitude]: Point): Point => [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];
export default function SwitzerlandBeta({ mode, onModeChange }: { mode: "today" | "history"; onModeChange: (mode: "today" | "history") => void }) {
  const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [catalog, setCatalog] = useState<ForecastCatalog | null>(null);
  const [cantons, setCantons] = useState<Cantons | null>(null);
  const [lakes, setLakes] = useState<Lakes | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rangeError, setRangeError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [from, setFrom] = useState(yesterday);
  const [to, setTo] = useState(yesterday);
  const [range, setRange] = useState(() => ({ from: yesterday(), to: yesterday() }));
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState("");
  const [mapView, setMapView] = useState({ x: 0, y: 0, width: 1000, height: 550 });
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");
  const mapElement = useRef<SVGSVGElement>(null);
  const mapDrag = useRef<{ pointer: number; clientX: number; clientY: number; view: typeof mapView } | null>(null);
  const today = catalog?.today ?? new Date().toISOString().slice(0, 10);
  const activeFrom = mode === "today" ? today : range.from;
  const activeTo = mode === "today" ? today : range.to;
  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      setLoading(true);
      try {
        const result = await fetchForecast<ForecastCatalog>({ view: "catalog" }, controller.signal);
        if (!controller.signal.aborted) {
          setCatalog(result);
          setChecked(new Date().toLocaleTimeString("en-GB", { timeZone: "UTC" })); setCatalogError("");
        }
      } catch (e) { if (!controller.signal.aborted) setCatalogError(e instanceof Error ? e.message : "Could not check for uploads."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void check();
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(["/maps/switzerland-cantons.geojson", "/maps/switzerland-lakes.geojson"].map(async path => {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error("Could not load the Switzerland map.");
      return response.json();
    })).then(([cantonData, lakeData]) => { if (!controller.signal.aborted) { setCantons(cantonData); setLakes(lakeData); setMapError(""); } })
      .catch(() => { if (!controller.signal.aborted) setMapError("Could not load the Switzerland map."); });
    return () => controller.abort();
  }, [attempt]);
  const projection = useMemo(() => {
    if (!cantons || !lakes) return null;
    const points = cantons.features.flatMap(feature => rings(feature.geometry).flat().map(project));
    const xs = points.map(p => p[0]); const ys = points.map(p => p[1]);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX; const height = Math.max(...ys) - minY;
    const scale = Math.min(900 / width, 490 / height);
    const xy = (point: Point): Point => { const p = project(point); return [50 + (900 - width * scale) / 2 + (p[0] - minX) * scale, 30 + (490 - height * scale) / 2 + (p[1] - minY) * scale]; };
    const makePath = (geometry: Geometry) => rings(geometry).map(ring => ring.map((point, index) => `${index ? "L" : "M"}${xy(point).map(n => n.toFixed(2)).join(",")}`).join(" ") + "Z").join(" ");
    return { xy, paths: cantons.features.map(feature => ({ name: feature.properties.shapeName,
      path: makePath(feature.geometry),
    })), lakePaths: lakes.features.map(feature => ({ name: feature.properties.name, path: makePath(feature.geometry) })) };
  }, [cantons, lakes]);
  const selectedStations = selected.flatMap(id => catalog?.stations.filter(station => station.id === id) ?? []);
  function choose(id: string) {
    setSelected(current => current.includes(id) ? current.filter(stationId => stationId !== id) : [...current, id]);
  }
  const zoomMap = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const bounds = mapElement.current?.getBoundingClientRect();
    setMapView(current => {
      const rx = bounds && clientX !== undefined ? Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) : 0.5;
      const ry = bounds && clientY !== undefined ? Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)) : 0.5;
      const width = Math.min(1000, Math.max(250, current.width / factor));
      const height = width * 0.55;
      const pointX = current.x + rx * current.width; const pointY = current.y + ry * current.height;
      return { x: Math.min(1000 - width, Math.max(0, pointX - rx * width)), y: Math.min(550 - height, Math.max(0, pointY - ry * height)), width, height };
    });
  }, []);
  useEffect(() => {
    const element = mapElement.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); zoomMap(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoomMap]);
  function startMapDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-station-marker]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    mapDrag.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, view: mapView };
  }
  function moveMap(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = mapDrag.current; const bounds = mapElement.current?.getBoundingClientRect();
    if (!drag || drag.pointer !== event.pointerId || !bounds) return;
    const x = drag.view.x - (event.clientX - drag.clientX) * drag.view.width / bounds.width;
    const y = drag.view.y - (event.clientY - drag.clientY) * drag.view.height / bounds.height;
    setMapView({ ...drag.view, x: Math.min(1000 - drag.view.width, Math.max(0, x)), y: Math.min(550 - drag.view.height, Math.max(0, y)) });
  }
  function endMapDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (mapDrag.current?.pointer === event.pointerId) mapDrag.current = null;
  }
  async function exportSelection(format: "png" | "pdf" | "csv") {
    if (!selected.length) return;
    setExporting(format); setExportError("");
    const exportFrom = activeFrom; const exportTo = activeTo;
    try {
      if (format === "png") {
        await exportPlotsPng([...document.querySelectorAll<HTMLElement>("[data-export-chart]")], selected, exportFrom, exportTo);
      } else if (format === "pdf") {
        await exportPlotsPdf([...document.querySelectorAll<HTMLElement>("[data-export-chart]")], selected, exportFrom, exportTo);
      } else {
        const blob = await downloadForecastCsv(mode, exportFrom, exportTo, selected);
        const period = exportFrom === exportTo ? exportFrom : `${exportFrom}_to_${exportTo}`;
        saveDownload(blob, `icon_ghi_selected_stations_${period}.csv`);
      }
    } catch (caught) { setExportError(caught instanceof Error ? caught.message : "The export could not be created."); }
    finally { setExporting(""); }
  }
  const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400">Station explorer <span className="ml-2 rounded border border-cyan-400/25 px-1.5 py-0.5 tracking-normal">BETA</span></p><h2 className="text-2xl font-semibold tracking-tight">Switzerland · GHI forecasts</h2><p className="mt-2 text-sm text-slate-400">Select a station to explore its forecast and observations.</p></div>
      <div className="text-right text-xs text-slate-400"><p className="text-slate-200">{dateLabel(`${activeFrom}T00:00:00Z`)}{activeFrom !== activeTo ? ` – ${dateLabel(`${activeTo}T00:00:00Z`)}` : ""} {activeTo.slice(0, 4)}</p></div>
    </div>
    <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2" role="tablist" aria-label="Forecast period">{(["today", "history"] as const).map(view => <button key={view} type="button" role="tab" aria-selected={mode === view} onClick={() => onModeChange(view)} className={`rounded-lg px-4 py-2 text-sm ${mode === view ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5"}`}>{view === "today" ? "Today" : "Historical"}</button>)}</div><div className="flex items-center gap-3 text-xs text-slate-400"><span>Auto-update: every minute{checked ? ` · Checked ${checked} UTC` : ""}</span><button type="button" className="rounded border border-white/15 px-3 py-2 hover:text-white" onClick={() => setAttempt(n => n + 1)}>Refresh</button></div></div>
      {mode === "history" && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (from > to) { setRangeError("The start date must be on or before the end date."); return; } setRangeError(""); setRange({ from, to }); }}>
        <label className="text-xs text-slate-400">From (UTC day)<input type="date" required value={from} max={to || today} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded border border-white/20 bg-[#0d1d2b] px-3 py-2 text-sm text-white [color-scheme:dark]" /></label>
        <label className="text-xs text-slate-400">To (UTC day)<input type="date" required value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="mt-1 block rounded border border-white/20 bg-[#0d1d2b] px-3 py-2 text-sm text-white [color-scheme:dark]" /></label>
        <button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Show range</button>
      </form>}
    </div>
    {(rangeError || catalogError || mapError) && <div role="alert" className="mb-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100">{rangeError || catalogError || mapError}<button className="ml-4 underline" onClick={() => { setRangeError(""); setAttempt(n => n + 1); }}>Retry</button></div>}
    {loading && !catalogError && <p role="status" className="mb-4 text-sm text-slate-400">Loading station map…</p>}
    <section className={styles.mapCard} aria-label="Switzerland station map">
      <div className="absolute left-5 top-5 z-10 flex items-center gap-4 text-xs text-slate-300"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />GHI weather stations</span></div>
      <div className="absolute right-4 top-4 z-10 flex overflow-hidden rounded-lg border border-white/15 bg-[#0d1d2b]/90" aria-label="Map zoom controls">
        <button type="button" className="px-3 py-2 text-lg hover:bg-white/10" onClick={() => zoomMap(1.5)} aria-label="Zoom map in">+</button>
        <button type="button" className="border-x border-white/10 px-3 py-2 text-lg hover:bg-white/10" onClick={() => zoomMap(1 / 1.5)} aria-label="Zoom map out">−</button>
        <button type="button" className="px-3 py-2 text-xs hover:bg-white/10" onClick={() => setMapView({ x: 0, y: 0, width: 1000, height: 550 })}>Reset</button>
      </div>
      <svg ref={mapElement} viewBox={`${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`} onPointerDown={startMapDrag} onPointerMove={moveMap} onPointerUp={endMapDrag} onPointerCancel={endMapDrag} onDoubleClick={() => setMapView({ x: 0, y: 0, width: 1000, height: 550 })} className={styles.map} aria-label="Map of Switzerland with canton boundaries. Use the mouse wheel or zoom buttons to zoom and drag to pan.">
        <defs><linearGradient id="canton-fill" x2="0.4" y2="1"><stop stopColor="#203c50" /><stop offset="1" stopColor="#142a3b" /></linearGradient></defs>
        <g fill="url(#canton-fill)" stroke="#698598" strokeWidth="0.85" strokeLinejoin="round" fillRule="evenodd">
          {projection?.paths.map(canton => <path key={canton.name} d={canton.path}><title>{canton.name}</title></path>)}
        </g>
        <g fill="#1688b5" fillOpacity="0.72" stroke="#74ccec" strokeWidth="0.75" strokeLinejoin="round" fillRule="evenodd">
          {projection?.lakePaths.map(lake => <path key={lake.name} d={lake.path}><title>{lake.name}</title></path>)}
        </g>
        {projection && [...(catalog?.stations ?? [])].sort((a, b) => Number(selected.includes(a.id)) - Number(selected.includes(b.id))).map(s => { const [x, y] = projection.xy([s.longitude, s.latitude]); return <g key={s.id} data-station-marker transform={`translate(${x},${y})`} className={styles.station} role="button" tabIndex={0} aria-label={`${selected.includes(s.id) ? "Hide" : "Show"} ${s.id} forecasts`} aria-pressed={selected.includes(s.id)} onClick={() => choose(s.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(s.id); } }}>
          <circle r="8" fill="transparent" /><circle className={styles.halo} r="10" fill="#ef4444" opacity="0.12" pointerEvents="none" /><circle className={styles.dot} r="4.5" fill="#ef4444" stroke="#fecaca" strokeWidth="1.4" />
          <text className={styles.stationLabel} x="12" y="-10" fill="#f8fafc" fontSize="13" fontWeight="600" paintOrder="stroke" stroke="#102332" strokeWidth="4">{s.id}</text>
        </g>; })}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 py-3 text-[10px] text-slate-500"><span>26 cantons · Switzerland</span><span><a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer" className="hover:text-slate-300">Boundaries: © swisstopo · geoBoundaries (2022)</a><span className="mx-2">·</span><a href="https://www.swisstopo.admin.ch/en/landscape-model-swisstlmregio" target="_blank" rel="noreferrer" className="hover:text-slate-300">Lakes: © swisstopo · swissTLMRegio (2025)</a></span></div>
    </section>
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><label htmlFor="station-picker" className="text-slate-400">Select a station</label><select id="station-picker" value="" onChange={e => { if (e.target.value) choose(e.target.value); }} className="rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-slate-200"><option value="">Choose station…</option>{catalog?.stations.map(s => <option key={s.id} value={s.id}>{s.id}{selected.includes(s.id) ? " — selected (hide)" : ""}</option>)}</select><span className="text-xs text-slate-500">{selected.length} selected · Hover for station labels</span><label htmlFor="forecast-export" className="ml-auto text-slate-400">Download</label><select id="forecast-export" value="" disabled={!selected.length || Boolean(exporting)} onChange={event => { const format = event.target.value as "png" | "pdf" | "csv"; if (format) void exportSelection(format); }} className="rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"><option value="">{exporting ? `Creating ${exporting.toUpperCase()}…` : "Choose format…"}</option><option value="png">PNG — selected plots</option><option value="pdf">PDF — selected plots</option><option value="csv">CSV — selected stations</option></select></div>
    {exportError && <div role="alert" className="mt-3 text-sm text-amber-200">{exportError}</div>}
    {selectedStations.map(station => <StationPlots key={station.id} station={station} mode={mode} from={activeFrom} to={activeTo} refreshToken={attempt} onClose={() => choose(station.id)} />)}
    {selectedStations.length === 0 && <div className="mt-5 rounded-xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-400">Click a red station marker to open its plots. Click again to hide them.</div>}
  </div>;
}
