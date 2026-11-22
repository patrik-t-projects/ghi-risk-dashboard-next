"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fetchFogForecast, type FogCatalogResponse, type FogRuntimeResponse } from "@/lib/fogClient";
import { fogRecordsAtTime, type FogDisplayRecord } from "@/lib/fogCsv";
import { distanceToGridEdgeKm, fogGridComponents, fogGridKey, gridDistanceKm, uniqueFogGridPoints } from "@/lib/fogGrid";
import type { FogRuntimeSlot } from "@/lib/fogSource";
import type { GhiForecastResolution } from "@/lib/ghiResolution";
import styles from "./SwitzerlandBeta.module.css";

type Point = [number, number];
type Geometry = { type: "Polygon"; coordinates: Point[][] } | { type: "MultiPolygon"; coordinates: Point[][][] };
type Cantons = { features: { properties: { shapeName: string }; geometry: Geometry }[] };
type Lakes = { features: { properties: { name: string }; geometry: Geometry }[] };
type Postcodes = { geometry: { type: "MultiLineString"; coordinates: Point[][] } };
type MapView = { x: number; y: number; width: number; height: number };
type Projection = {
  cantonPaths: { name: string; path: string }[];
  lakePaths: { name: string; path: string }[];
  postcodePath: string;
  xy: (point: Point) => Point;
  geometryPath: (geometry: Geometry) => string;
};
type FieldBounds = { west: number; east: number; south: number; north: number; x: number; y: number; width: number; height: number };
type FogLayer = { key: string; href: string; x: number; y: number; width: number; height: number };
type PostcodeFeature = { postcode: string | null; geometry: Geometry | null };
type Hover = { left: number; top: number; nearest: FogDisplayRecord; postcode: string | null };

const INITIAL_VIEW: MapView = { x: 0, y: 0, width: 1000, height: 550 };
const rings = (geometry: Geometry): Point[][] => geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
const project = ([longitude, latitude]: Point): Point => [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];
const formatRuntime = (runtime: string) => `${runtime.slice(8, 10)}.${runtime.slice(5, 7)}. ${Number(runtime.slice(11, 13))} UTC`;
const formatTime = (time: string) => `${time.slice(8, 10)}.${time.slice(5, 7)}.${time.slice(0, 4)} · ${time.slice(11, 16)} UTC`;
const SLOT_LABELS: Record<FogRuntimeSlot, string> = { "day-ahead": "Day-Ahead 0 UTC", "intraday-00": "Intraday 0 UTC", "intraday-06": "Intraday 6 UTC" };

function probabilityAt(records: FogDisplayRecord[], longitude: number, latitude: number): number {
  let weighted = 0; let total = 0;
  for (const record of records) {
    const dx = (longitude - record.gridLongitude) * Math.cos(latitude * Math.PI / 180);
    const dy = latitude - record.gridLatitude; const distance2 = dx * dx + dy * dy;
    if (distance2 < 1e-10) return record.fogProbability;
    const weight = 1 / Math.pow(distance2, 1.35); weighted += record.fogProbability * weight; total += weight;
  }
  return total ? weighted / total : 0;
}

function fogColor(value: number): [number, number, number] {
  const colors: [number, number, number][] = [[15, 38, 73], [20, 112, 176], [38, 198, 193], [242, 208, 68], [224, 63, 91]];
  const scaled = Math.max(0, Math.min(1, value)) * (colors.length - 1);
  const lower = Math.floor(scaled); const upper = Math.min(colors.length - 1, lower + 1); const fraction = scaled - lower;
  return colors[lower].map((component, index) => Math.round(component + (colors[upper][index] - component) * fraction)) as [number, number, number];
}

export default function FogMap({ resolution }: { resolution: GhiForecastResolution }) {
  const [cantons, setCantons] = useState<Cantons | null>(null);
  const [lakes, setLakes] = useState<Lakes | null>(null);
  const [postcodes, setPostcodes] = useState<Postcodes | null>(null);
  const [catalog, setCatalog] = useState<FogCatalogResponse | null>(null);
  const [runtime, setRuntime] = useState("");
  const [forecast, setForecast] = useState<FogRuntimeResponse | null>(null);
  const [level, setLevel] = useState(80);
  const [selectedTime, setSelectedTime] = useState("");
  const [fogLayers, setFogLayers] = useState<FogLayer[]>([]);
  const [postcodeVersion, setPostcodeVersion] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [mapView, setMapView] = useState<MapView>(INITIAL_VIEW);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const mapElement = useRef<SVGSVGElement>(null);
  const mapDrag = useRef<{ pointer: number; clientX: number; clientY: number; view: MapView } | null>(null);
  const postcodeCache = useRef(new Map<string, PostcodeFeature>());
  const fittedRuntime = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(["/maps/switzerland-cantons.geojson", "/maps/switzerland-lakes.geojson", "/maps/switzerland-postcode-boundaries.geojson"].map(async path => {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error("Map data unavailable");
      return response.json();
    })).then(([cantonData, lakeData, postcodeData]) => {
      if (!controller.signal.aborted) { setCantons(cantonData); setLakes(lakeData); setPostcodes(postcodeData); }
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load the Switzerland map."); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    fetchFogForecast<FogCatalogResponse>({ view: "catalog" }, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setCatalog(result); const latest = [...result.runtimes].reverse().find(option => option.available);
      setRuntime(current => result.runtimes.some(option => option.runtime === current && option.available) ? current : latest?.runtime ?? "");
      setError(latest ? "" : "No fog forecast runtime has been uploaded yet."); setLoading(false);
    }).catch(caught => { if (!controller.signal.aborted) { setError(caught instanceof Error ? caught.message : "Could not load fog forecasts."); setLoading(false); } });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!runtime) { setForecast(null); return; }
    const controller = new AbortController(); setLoading(true);
    fetchFogForecast<FogRuntimeResponse>({ view: "data", runtime }, controller.signal).then(result => {
      if (!controller.signal.aborted) { setForecast(result); setError(""); setLoading(false); }
    }).catch(caught => { if (!controller.signal.aborted) { setError(caught instanceof Error ? caught.message : "Could not load fog forecasts."); setLoading(false); } });
    return () => controller.abort();
  }, [runtime, attempt]);

  const projection = useMemo<Projection | null>(() => {
    if (!cantons || !lakes || !postcodes) return null;
    const points = cantons.features.flatMap(feature => rings(feature.geometry).flat().map(project));
    const xs = points.map(point => point[0]); const ys = points.map(point => point[1]);
    const minX = Math.min(...xs); const minY = Math.min(...ys); const width = Math.max(...xs) - minX; const height = Math.max(...ys) - minY;
    const scale = Math.min(900 / width, 490 / height); const xOffset = 50 + (900 - width * scale) / 2; const yOffset = 30 + (490 - height * scale) / 2;
    const xy = (point: Point): Point => { const p = project(point); return [xOffset + (p[0] - minX) * scale, yOffset + (p[1] - minY) * scale]; };
    const linePath = (lines: Point[][], close = false) => lines.map(line => line.map((point, index) => `${index ? "L" : "M"}${xy(point).map(value => value.toFixed(2)).join(",")}`).join(" ") + (close ? "Z" : "")).join(" ");
    const geometryPath = (geometry: Geometry) => linePath(rings(geometry), true);
    return { xy, geometryPath, cantonPaths: cantons.features.map(feature => ({ name: feature.properties.shapeName, path: geometryPath(feature.geometry) })),
      lakePaths: lakes.features.map(feature => ({ name: feature.properties.name, path: linePath(rings(feature.geometry), true) })), postcodePath: linePath(postcodes.geometry.coordinates) };
  }, [cantons, lakes, postcodes]);

  const times = useMemo(() => {
    if (!forecast?.records.length) return [];
    const source = [...new Set(forecast.records.map(record => record.time))].sort();
    if (resolution === "hourly") return source;
    const first = Date.parse(source[0]); const last = Date.parse(source.at(-1)!); const result: string[] = [];
    for (let instant = first; instant <= last; instant += 15 * 60000) result.push(new Date(instant).toISOString().replace(".000Z", "Z"));
    return result;
  }, [forecast, resolution]);

  useEffect(() => {
    if (!times.length) { setSelectedTime(""); return; }
    const now = Date.now(); const nearest = times.reduce((best, time) => Math.abs(Date.parse(time) - now) < Math.abs(Date.parse(best) - now) ? time : best, times[0]);
    setSelectedTime(current => times.includes(current) ? current : nearest);
  }, [times]);

  const levelRecords = useMemo(() => !forecast || !selectedTime ? [] : fogRecordsAtTime(forecast.records, selectedTime, resolution)
    .filter(record => record.modelLevel === level), [forecast, selectedTime, resolution, level]);
  const gridPoints = useMemo(() => uniqueFogGridPoints(levelRecords), [levelRecords]);
  const components = useMemo(() => fogGridComponents(gridPoints), [gridPoints]);
  const gridSignature = gridPoints.map(fogGridKey).sort().join("|");

  const fieldBounds = useMemo<FieldBounds | null>(() => {
    if (!projection || !gridPoints.length) return null;
    const longitudes = gridPoints.map(record => record.gridLongitude); const latitudes = gridPoints.map(record => record.gridLatitude);
    const spanLon = Math.max(...longitudes) - Math.min(...longitudes); const spanLat = Math.max(...latitudes) - Math.min(...latitudes);
    const padLon = Math.max(0.015, spanLon * 0.1); const padLat = Math.max(0.012, spanLat * 0.1);
    const west = Math.min(...longitudes) - padLon; const east = Math.max(...longitudes) + padLon; const south = Math.min(...latitudes) - padLat; const north = Math.max(...latitudes) + padLat;
    const topLeft = projection.xy([west, north]); const bottomRight = projection.xy([east, south]);
    return { west, east, south, north, x: topLeft[0], y: topLeft[1], width: bottomRight[0] - topLeft[0], height: bottomRight[1] - topLeft[1] };
  }, [projection, gridPoints]);

  useEffect(() => {
    const missing = gridPoints.filter(record => !postcodeCache.current.has(fogGridKey(record)));
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(missing.map(async record => {
      const response = await fetch(`/api/postcode?${new URLSearchParams({ lat: String(record.gridLatitude), lon: String(record.gridLongitude) })}`,
        { signal: controller.signal });
      const result = await response.json() as { postcode?: string | number | null; geometry?: Geometry | null };
      return [fogGridKey(record), { postcode: result.postcode ? String(result.postcode) : null, geometry: result.geometry ?? null }] as const;
    })).then(features => {
      if (controller.signal.aborted) return;
      features.forEach(([key, feature]) => postcodeCache.current.set(key, feature));
      setPostcodeVersion(version => version + 1);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [gridSignature]);

  useEffect(() => {
    if (!fieldBounds || !runtime || fittedRuntime.current === runtime) return;
    fittedRuntime.current = runtime;
    const width = Math.min(1000, Math.max(115, fieldBounds.width * 1.65));
    const height = width * 0.55;
    const centerX = fieldBounds.x + fieldBounds.width / 2; const centerY = fieldBounds.y + fieldBounds.height / 2;
    setMapView({ x: Math.min(1000 - width, Math.max(0, centerX - width / 2)), y: Math.min(550 - height, Math.max(0, centerY - height / 2)), width, height });
  }, [fieldBounds, runtime]);

  useEffect(() => {
    if (!projection) { setFogLayers([]); return; }
    const layers = components.filter(component => !component.isolated).map((component, componentIndex) => {
      const meanLatitude = component.points.reduce((sum, point) => sum + point.gridLatitude, 0) / component.points.length;
      const padLatitude = 1.55 / 110.574; const padLongitude = 1.55 / (111.32 * Math.cos(meanLatitude * Math.PI / 180));
      const west = Math.min(...component.points.map(point => point.gridLongitude)) - padLongitude;
      const east = Math.max(...component.points.map(point => point.gridLongitude)) + padLongitude;
      const south = Math.min(...component.points.map(point => point.gridLatitude)) - padLatitude;
      const north = Math.max(...component.points.map(point => point.gridLatitude)) + padLatitude;
      const topLeft = projection.xy([west, north]); const bottomRight = projection.xy([east, south]);
      const width = bottomRight[0] - topLeft[0]; const height = bottomRight[1] - topLeft[1];
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = Math.max(100, Math.round(320 * height / width));
      const context = canvas.getContext("2d"); if (!context) return null;
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const longitude = west + (x + 0.5) / canvas.width * (east - west);
        const latitude = north - (y + 0.5) / canvas.height * (north - south);
        const sample = { gridLatitude: latitude, gridLongitude: longitude };
        const pointDistance = Math.min(...component.points.map(point => gridDistanceKm(sample, point)));
        const edgeDistance = Math.min(...component.edges.map(edge => distanceToGridEdgeKm(latitude, longitude, edge)));
        const coverageDistance = Math.min(pointDistance, edgeDistance);
        if (coverageDistance > 1.5) continue;
        const probability = probabilityAt(component.points, longitude, latitude); const color = fogColor(probability);
        const alpha = coverageDistance <= 1.2 ? 220 : Math.round(220 * (1.5 - coverageDistance) / 0.3);
        const offset = (y * canvas.width + x) * 4;
        pixels.data[offset] = color[0]; pixels.data[offset + 1] = color[1]; pixels.data[offset + 2] = color[2]; pixels.data[offset + 3] = alpha;
      }
      context.putImageData(pixels, 0, 0);
      return { key: `connected-${componentIndex}`, href: canvas.toDataURL("image/png"), x: topLeft[0], y: topLeft[1], width, height };
    }).filter((layer): layer is FogLayer => Boolean(layer));
    setFogLayers(layers);
  }, [projection, components]);

  const isolatedFills = useMemo(() => {
    if (!projection) return [];
    return components.filter(component => component.isolated).flatMap(component => {
      const point = component.points[0]; const feature = postcodeCache.current.get(fogGridKey(point));
      return feature?.geometry ? [{ key: fogGridKey(point), path: projection.geometryPath(feature.geometry), color: fogColor(point.fogProbability) }] : [];
    });
  }, [projection, components, postcodeVersion]);

  const heightLabel = useMemo(() => {
    if (hover?.nearest.modelLevel === level) return `${Math.round(hover.nearest.heightAslM)} m ASL`;
    if (!levelRecords.length) return "height unavailable";
    const heights = levelRecords.map(record => record.heightAslM); const low = Math.round(Math.min(...heights)); const high = Math.round(Math.max(...heights));
    return low === high ? `${low} m ASL` : `${low}–${high} m ASL`;
  }, [hover, levelRecords, level]);

  const zoomMap = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const bounds = mapElement.current?.getBoundingClientRect();
    setMapView(current => { const rx = bounds && clientX !== undefined ? Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) : 0.5;
      const ry = bounds && clientY !== undefined ? Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)) : 0.5;
      const width = Math.min(1000, Math.max(90, current.width / factor)); const height = width * 0.55; const pointX = current.x + rx * current.width; const pointY = current.y + ry * current.height;
      return { x: Math.min(1000 - width, Math.max(0, pointX - rx * width)), y: Math.min(550 - height, Math.max(0, pointY - ry * height)), width, height }; });
  }, []);

  useEffect(() => { const element = mapElement.current; if (!element) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoomMap(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY); };
    element.addEventListener("wheel", wheel, { passive: false }); return () => element.removeEventListener("wheel", wheel); }, [zoomMap]);

  function showGridHover(event: ReactPointerEvent<SVGGElement>, record: FogDisplayRecord) {
    if (mapDrag.current) { setHover(null); return; }
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect(); if (!bounds) return;
    const left = Math.min(bounds.width - 265, Math.max(8, event.clientX - bounds.left + 14));
    const top = Math.min(bounds.height - 245, Math.max(8, event.clientY - bounds.top + 14));
    setHover({ left, top, nearest: record, postcode: postcodeCache.current.get(fogGridKey(record))?.postcode ?? null });
  }

  function startMapDrag(event: ReactPointerEvent<SVGSVGElement>) { event.currentTarget.setPointerCapture(event.pointerId);
    mapDrag.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, view: mapView }; }
  function moveMap(event: ReactPointerEvent<SVGSVGElement>) { const drag = mapDrag.current; const bounds = mapElement.current?.getBoundingClientRect();
    if (drag && drag.pointer === event.pointerId && bounds) { const x = drag.view.x - (event.clientX - drag.clientX) * drag.view.width / bounds.width;
      const y = drag.view.y - (event.clientY - drag.clientY) * drag.view.height / bounds.height;
      setMapView({ ...drag.view, x: Math.min(1000 - drag.view.width, Math.max(0, x)), y: Math.min(550 - drag.view.height, Math.max(0, y)) }); setHover(null);
    } }
  function endMapDrag(event: ReactPointerEvent<SVGSVGElement>) { if (mapDrag.current?.pointer === event.pointerId) mapDrag.current = null; }

  const selectedIndex = Math.max(0, times.indexOf(selectedTime));
  const timeSliderPosition = times.length > 1 ? selectedIndex / (times.length - 1) * 100 : 0;
  const timeSliderTransform = selectedIndex === 0 ? "translateX(0)" : selectedIndex === times.length - 1 ? "translateX(-100%)" : "translateX(-50%)";

  return <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400">Fog map · Beta</p><h2 className="mt-2 text-2xl font-semibold">ICON-CH2 fog probability</h2><p className="mt-2 text-sm text-slate-400">Grid-aware local field from 11 configured locations · UTC</p></div>
      <label className="text-xs text-slate-400">Forecast runtime
        <select value={runtime} onChange={event => setRuntime(event.target.value)} className="mt-1 block min-w-64 rounded-lg border border-white/10 bg-[#0d1d2b] px-3 py-2 text-sm text-slate-100">
          {catalog?.runtimes.map(option => <option key={option.slot} value={option.runtime} disabled={!option.available}>{SLOT_LABELS[option.slot]} ({formatRuntime(option.runtime)}){option.available ? "" : " — unavailable"}</option>)}
        </select>
      </label>
    </div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100">{error}<button type="button" className="ml-4 underline" onClick={() => setAttempt(current => current + 1)}>Retry</button></div>}
    <section className={styles.mapCard} aria-label="Switzerland fog map">
      {loading && <p role="status" className="absolute left-5 top-5 z-20 rounded bg-[#071018]/80 px-3 py-2 text-xs text-slate-300">Loading fog forecast…</p>}
      <div className="absolute right-4 top-4 z-20 flex overflow-hidden rounded-lg border border-white/15 bg-[#0d1d2b]/90" aria-label="Map zoom controls">
        <button type="button" className="px-3 py-2 text-lg hover:bg-white/10" onClick={() => zoomMap(1.5)} aria-label="Zoom map in">+</button>
        <button type="button" className="border-x border-white/10 px-3 py-2 text-lg hover:bg-white/10" onClick={() => zoomMap(1 / 1.5)} aria-label="Zoom map out">−</button>
        <button type="button" className="px-3 py-2 text-xs hover:bg-white/10" onClick={() => setMapView(INITIAL_VIEW)}>Reset</button>
      </div>
      <div className="absolute right-4 top-16 z-20 flex h-[65%] min-h-52 flex-col items-center rounded-xl border border-white/15 bg-[#071018]/88 px-3 py-3 shadow-xl">
        <span className="text-[10px] font-semibold text-cyan-200">k={level}</span><span className="mt-1 max-w-24 text-center text-[9px] leading-3 text-slate-400">{heightLabel}</span>
        <span className="mt-2 text-[9px] text-slate-500">60</span>
        <input aria-label="Vertical model level" type="range" min="60" max="80" step="1" value={level} onChange={event => setLevel(Number(event.target.value))}
          className="my-1 min-h-32 flex-1 accent-cyan-400" style={{ writingMode: "vertical-lr", direction: "ltr" }} />
        <span className="text-[9px] text-slate-500">80</span>
      </div>
      <svg ref={mapElement} viewBox={`${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`}
        onPointerDown={startMapDrag} onPointerMove={moveMap} onPointerUp={endMapDrag} onPointerCancel={endMapDrag}
        onPointerLeave={() => { if (!mapDrag.current) setHover(null); }} onDoubleClick={() => setMapView(INITIAL_VIEW)} className={styles.map}
        aria-label="Map of Switzerland with canton and postal-code boundaries and a local fog-probability field. Use the mouse wheel or zoom buttons to zoom and drag to pan.">
        <defs><linearGradient id="fog-map-canton-fill" x2="0.4" y2="1"><stop stopColor="#203c50" /><stop offset="1" stopColor="#142a3b" /></linearGradient></defs>
        <g fill="url(#fog-map-canton-fill)" stroke="#698598" strokeWidth="0.85" strokeLinejoin="round" fillRule="evenodd">
          {projection?.cantonPaths.map(canton => <path key={canton.name} d={canton.path}><title>{canton.name}</title></path>)}
        </g>
        {isolatedFills.map(fill => <path key={`isolated-${fill.key}`} d={fill.path} fill={`rgb(${fill.color.join(",")})`} fillOpacity="0.82" stroke="none" />)}
        {fogLayers.map(layer => <image key={layer.key} href={layer.href} x={layer.x} y={layer.y} width={layer.width} height={layer.height} preserveAspectRatio="none" />)}
        <path d={projection?.postcodePath} fill="none" stroke="#dbeafe" strokeOpacity="0.38" strokeWidth="0.28" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        <g fill="#1688b5" fillOpacity="0.62" stroke="#74ccec" strokeWidth="0.65" strokeLinejoin="round" fillRule="evenodd" pointerEvents="none">
          {projection?.lakePaths.map(lake => <path key={lake.name} d={lake.path} />)}
        </g>
        <g>{projection && gridPoints.map(record => { const [x, y] = projection.xy([record.gridLongitude, record.gridLatitude]); return <g key={fogGridKey(record)}
          className="cursor-help" onPointerEnter={event => showGridHover(event, record)} onPointerMove={event => showGridHover(event, record)} onPointerLeave={() => setHover(null)}>
          <circle cx={x} cy={y} r="3.2" fill="#f8fafc" stroke="#071018" strokeWidth="1" />
        </g>; })}</g>
      </svg>
      {hover && <div className="pointer-events-none absolute z-30 w-64 rounded-xl border border-white/15 bg-[#071018]/95 p-3 text-[11px] shadow-2xl" style={{ left: hover.left, top: hover.top }}>
        <p className="mb-2 font-semibold text-slate-100">{formatTime(selectedTime)}</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-slate-300">
          <dt>Fog probability</dt><dd className="font-semibold text-cyan-200">{(hover.nearest.fogProbability * 100).toFixed(1)}%</dd>
          <dt>PLZ</dt><dd>{hover.postcode ?? "…"}</dd>
          <dt>Grid point</dt><dd>{hover.nearest.gridLatitude.toFixed(4)}, {hover.nearest.gridLongitude.toFixed(4)}</dd>
          <dt>Grid elevation</dt><dd>{Math.round(hover.nearest.surfaceHeightAslM)} m ASL</dd>
          <dt>Model level</dt><dd>k={hover.nearest.modelLevel}</dd>
          <dt>Level height</dt><dd>{Math.round(hover.nearest.heightAglM)} m AGL</dd><dt></dt><dd>{Math.round(hover.nearest.heightAslM)} m ASL</dd>
        </dl>
      </div>}
      <div className="absolute bottom-24 left-4 z-20 rounded-lg border border-white/10 bg-[#071018]/88 px-3 py-2 text-[9px] text-slate-300">
        <div className="mb-1 h-2.5 w-32 rounded" style={{ background: "linear-gradient(90deg,#0f2649,#1470b0,#26c6c1,#f2d044,#e03f5b)" }} /><div className="flex justify-between"><span>0%</span><span>Fog probability</span><span>100%</span></div>
      </div>
      <div className="border-t border-white/5 px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-4 text-xs"><span className="font-medium text-slate-200">{selectedTime ? formatTime(selectedTime) : "Time unavailable"}</span><span className="text-slate-500">{resolution === "15min" ? "15-minute interpolation" : "Hourly"}</span></div>
        <div className="relative pt-9">
          {selectedTime && <output aria-live="polite" aria-label="Selected forecast time" className="absolute top-0 whitespace-nowrap rounded-md border border-cyan-300/20 bg-cyan-400/12 px-2 py-1 text-sm font-medium text-cyan-100"
            style={{ left: `${timeSliderPosition}%`, transform: timeSliderTransform }}>{formatTime(selectedTime)}</output>}
          <input aria-label="Forecast valid time UTC" type="range" min="0" max={Math.max(0, times.length - 1)} value={selectedIndex} disabled={!times.length}
            onChange={event => setSelectedTime(times[Number(event.target.value)] ?? "")} className="w-full accent-cyan-400" />
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>{times[0] ? formatTime(times[0]) : ""}</span><span>{times.at(-1) ? formatTime(times.at(-1)!) : ""}</span></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 py-3 text-[10px] text-slate-500">
        <span>ICON-CH2 · 11 locations · levels 60–80</span>
        <span><a href="https://www.swisstopo.admin.ch/en/official-directory-of-towns-and-cities" target="_blank" rel="noreferrer" className="hover:text-slate-300">PLZ boundaries: © swisstopo</a><span className="mx-2">·</span><a href="https://www.swisstopo.admin.ch/en/landscape-model-swisstlmregio" target="_blank" rel="noreferrer" className="hover:text-slate-300">Lakes: © swisstopo</a></span>
      </div>
    </section>
  </div>;
}
