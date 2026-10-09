"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./SwitzerlandBeta.module.css";

type Point = [number, number];
type Geometry = { type: "Polygon"; coordinates: Point[][] } | { type: "MultiPolygon"; coordinates: Point[][][] };
type Cantons = { features: { properties: { shapeName: string }; geometry: Geometry }[] };
type Lakes = { features: { properties: { name: string }; geometry: Geometry }[] };
type MapView = { x: number; y: number; width: number; height: number };

const INITIAL_VIEW: MapView = { x: 0, y: 0, width: 1000, height: 550 };
const rings = (geometry: Geometry): Point[][] => geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
const project = ([longitude, latitude]: Point): Point => [longitude * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))];

export default function FogMap() {
  const [cantons, setCantons] = useState<Cantons | null>(null);
  const [lakes, setLakes] = useState<Lakes | null>(null);
  const [mapView, setMapView] = useState<MapView>(INITIAL_VIEW);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const mapElement = useRef<SVGSVGElement>(null);
  const mapDrag = useRef<{ pointer: number; clientX: number; clientY: number; view: MapView } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(["/maps/switzerland-cantons.geojson", "/maps/switzerland-lakes.geojson"].map(async path => {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error("Map data unavailable");
      return response.json();
    })).then(([cantonData, lakeData]) => {
      if (!controller.signal.aborted) {
        setCantons(cantonData);
        setLakes(lakeData);
        setError("");
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError("Could not load the Switzerland map.");
    });
    return () => controller.abort();
  }, [attempt]);

  const projection = useMemo(() => {
    if (!cantons || !lakes) return null;
    const points = cantons.features.flatMap(feature => rings(feature.geometry).flat().map(project));
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    const scale = Math.min(900 / width, 490 / height);
    const xy = (point: Point): Point => {
      const projected = project(point);
      return [
        50 + (900 - width * scale) / 2 + (projected[0] - minX) * scale,
        30 + (490 - height * scale) / 2 + (projected[1] - minY) * scale,
      ];
    };
    const makePath = (geometry: Geometry) => rings(geometry).map(ring =>
      ring.map((point, index) => `${index ? "L" : "M"}${xy(point).map(value => value.toFixed(2)).join(",")}`).join(" ") + "Z",
    ).join(" ");
    return {
      cantonPaths: cantons.features.map(feature => ({ name: feature.properties.shapeName, path: makePath(feature.geometry) })),
      lakePaths: lakes.features.map(feature => ({ name: feature.properties.name, path: makePath(feature.geometry) })),
    };
  }, [cantons, lakes]);

  const zoomMap = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const bounds = mapElement.current?.getBoundingClientRect();
    setMapView(current => {
      const rx = bounds && clientX !== undefined ? Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) : 0.5;
      const ry = bounds && clientY !== undefined ? Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)) : 0.5;
      const width = Math.min(1000, Math.max(250, current.width / factor));
      const height = width * 0.55;
      const pointX = current.x + rx * current.width;
      const pointY = current.y + ry * current.height;
      return {
        x: Math.min(1000 - width, Math.max(0, pointX - rx * width)),
        y: Math.min(550 - height, Math.max(0, pointY - ry * height)),
        width,
        height,
      };
    });
  }, []);

  useEffect(() => {
    const element = mapElement.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomMap(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoomMap]);

  function startMapDrag(event: ReactPointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    mapDrag.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, view: mapView };
  }

  function moveMap(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = mapDrag.current;
    const bounds = mapElement.current?.getBoundingClientRect();
    if (!drag || drag.pointer !== event.pointerId || !bounds) return;
    const x = drag.view.x - (event.clientX - drag.clientX) * drag.view.width / bounds.width;
    const y = drag.view.y - (event.clientY - drag.clientY) * drag.view.height / bounds.height;
    setMapView({
      ...drag.view,
      x: Math.min(1000 - drag.view.width, Math.max(0, x)),
      y: Math.min(550 - drag.view.height, Math.max(0, y)),
    });
  }

  function endMapDrag(event: ReactPointerEvent<SVGSVGElement>) {
    if (mapDrag.current?.pointer === event.pointerId) mapDrag.current = null;
  }

  return <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-4 sm:p-6">
    {error && <div role="alert" className="mb-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100">
      {error}<button type="button" className="ml-4 underline" onClick={() => setAttempt(current => current + 1)}>Retry</button>
    </div>}
    <section className={styles.mapCard} aria-label="Switzerland fog map">
      {!projection && !error && <p role="status" className="absolute left-5 top-5 z-10 text-xs text-slate-400">Loading Switzerland map…</p>}
      <div className="absolute right-4 top-4 z-10 flex overflow-hidden rounded-lg border border-white/15 bg-[#0d1d2b]/90" aria-label="Map zoom controls">
        <button type="button" className="px-3 py-2 text-lg hover:bg-white/10" onClick={() => zoomMap(1.5)} aria-label="Zoom map in">+</button>
        <button type="button" className="border-x border-white/10 px-3 py-2 text-lg hover:bg-white/10" onClick={() => zoomMap(1 / 1.5)} aria-label="Zoom map out">−</button>
        <button type="button" className="px-3 py-2 text-xs hover:bg-white/10" onClick={() => setMapView(INITIAL_VIEW)}>Reset</button>
      </div>
      <svg ref={mapElement} viewBox={`${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`}
        onPointerDown={startMapDrag} onPointerMove={moveMap} onPointerUp={endMapDrag} onPointerCancel={endMapDrag}
        onDoubleClick={() => setMapView(INITIAL_VIEW)} className={styles.map}
        aria-label="Map of Switzerland with canton boundaries. Use the mouse wheel or zoom buttons to zoom and drag to pan.">
        <defs><linearGradient id="fog-map-canton-fill" x2="0.4" y2="1"><stop stopColor="#203c50" /><stop offset="1" stopColor="#142a3b" /></linearGradient></defs>
        <g fill="url(#fog-map-canton-fill)" stroke="#698598" strokeWidth="0.85" strokeLinejoin="round" fillRule="evenodd">
          {projection?.cantonPaths.map(canton => <path key={canton.name} d={canton.path}><title>{canton.name}</title></path>)}
        </g>
        <g fill="#1688b5" fillOpacity="0.72" stroke="#74ccec" strokeWidth="0.75" strokeLinejoin="round" fillRule="evenodd">
          {projection?.lakePaths.map(lake => <path key={lake.name} d={lake.path}><title>{lake.name}</title></path>)}
        </g>
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-5 py-3 text-[10px] text-slate-500">
        <span>26 cantons · Switzerland</span>
        <span><a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer" className="hover:text-slate-300">Boundaries: © swisstopo · geoBoundaries (2022)</a><span className="mx-2">·</span><a href="https://www.swisstopo.admin.ch/en/landscape-model-swisstlmregio" target="_blank" rel="noreferrer" className="hover:text-slate-300">Lakes: © swisstopo · swissTLMRegio (2025)</a></span>
      </div>
    </section>
  </div>;
}
