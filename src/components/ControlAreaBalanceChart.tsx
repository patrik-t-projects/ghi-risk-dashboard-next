"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ControlAreaBalanceRow } from "@/lib/controlAreaBalanceCsv";

type PlotlyElement = HTMLElement & {
  on: (event: string, listener: (event?: { points?: { pointIndex?: number }[] }) => void) => void;
  removeListener: (event: string, listener: (event?: { points?: { pointIndex?: number }[] }) => void) => void;
};

const valueLabel = (value: number | null) => value === null ? "No value" : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const timeLabel = (time: string) => new Date(time).toLocaleString("en-GB", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false,
}) + " UTC";
const QUARTER_HOUR_MS = 15 * 60 * 1000;
const HALF_INTERVAL_MS = QUARTER_HOUR_MS / 2;

export default function ControlAreaBalanceChart({ rows, from, to }: { rows: ControlAreaBalanceRow[]; from: string; to: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<ControlAreaBalanceRow | null>(null);
  const plotTimes = useMemo(() => rows.map(row => row.time.replace(/Z$/, "")), [rows]);
  const period = `${from}-${to}`;
  const xRange = useMemo(() => [
    new Date(Date.parse(`${from}T00:00:00Z`) - HALF_INTERVAL_MS).toISOString().replace(/Z$/, ""),
    new Date(Date.parse(`${to}T00:00:00Z`) + 86400000 - HALF_INTERVAL_MS).toISOString().replace(/Z$/, ""),
  ], [from, to]);

  useEffect(() => {
    const element = container.current as PlotlyElement | null;
    if (!element) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    const hover = (event?: { points?: { pointIndex?: number }[] }) => {
      const pointIndex = event?.points?.[0]?.pointIndex;
      setHovered(pointIndex === undefined ? null : rows[pointIndex] ?? null);
    };
    const unhover = () => setHovered(null);
    async function draw() {
      try {
        const { default: Plotly } = await import("plotly.js/dist/plotly-basic.min.js");
        if (disposed || !element) return;
        await Plotly.react(element, [
          { type: "bar", name: "Imbalance", x: plotTimes, y: rows.map(row => row.imbalance),
            width: QUARTER_HOUR_MS, marker: { color: "#94a3b8" }, opacity: 0.82, hoverinfo: "none" },
          { type: "scatter", mode: "lines", name: "AEP", x: plotTimes, y: rows.map(row => row.aep),
            yaxis: "y2", line: { color: "#2563eb", width: 2.8 }, connectgaps: false, hoverinfo: "none" },
        ], {
          autosize: true, height: 590, paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff", bargap: 0.06,
          margin: { l: 72, r: 72, t: 30, b: 72 }, font: { family: "Arial, sans-serif", size: 12, color: "#334155" },
          xaxis: { title: { text: "Datetime UTC" }, type: "date", range: xRange, tickformat: "%d %b<br>%H:%M", gridcolor: "#e5e7eb", rangeslider: { visible: false } },
          yaxis: { title: { text: "Imbalance" }, zeroline: true, zerolinecolor: "#64748b", gridcolor: "#e5e7eb" },
          yaxis2: { title: { text: "AEP" }, overlaying: "y", side: "right", showgrid: false, zeroline: false },
          hovermode: "x", showlegend: true, legend: { orientation: "h", x: 0, y: 1.08 },
          uirevision: period,
        }, { responsive: true, displaylogo: false, scrollZoom: true, toImageButtonOptions: { filename: `ch-imbalance-aep-${period}`, scale: 2 } });
        if (disposed) return;
        element.on("plotly_hover", hover);
        element.on("plotly_unhover", unhover);
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => { if (!disposed) Plotly.Plots.resize(element); });
        });
        observer.observe(element);
      } catch { if (!disposed) setError(true); }
    }
    void draw();
    return () => {
      disposed = true; observer?.disconnect(); cancelAnimationFrame(frame);
      if (typeof element.removeListener === "function") {
        element.removeListener("plotly_hover", hover); element.removeListener("plotly_unhover", unhover);
      }
    };
  }, [rows, period, plotTimes, xRange]);

  if (error) return <div role="alert" className="rounded-xl border border-amber-300/20 p-8 text-amber-100">The imbalance chart could not be rendered.</div>;
  return <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800">
    {hovered && <div className="pointer-events-none absolute left-4 top-4 z-10 min-w-56 rounded-lg border border-slate-200 bg-white/95 px-4 py-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold text-slate-700">{timeLabel(hovered.time)}</p>
      <p className="flex justify-between gap-5 text-slate-500"><span>Imbalance</span><strong className="text-slate-700">{valueLabel(hovered.imbalance)}</strong></p>
      <p className="mt-1 flex justify-between gap-5 text-blue-600"><span>AEP</span><strong>{valueLabel(hovered.aep)}</strong></p>
    </div>}
    <div ref={container} className="h-[590px] w-full" aria-label="Swiss control-area imbalance and AEP chart" />
  </section>;
}
