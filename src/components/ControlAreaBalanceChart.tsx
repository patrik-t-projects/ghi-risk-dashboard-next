"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ControlAreaBalanceRow } from "@/lib/controlAreaBalanceCsv";

const QUARTER_HOUR_MS = 15 * 60 * 1000;
const HALF_INTERVAL_MS = QUARTER_HOUR_MS / 2;

export default function ControlAreaBalanceChart({ rows, from, to }: { rows: ControlAreaBalanceRow[]; from: string; to: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const plotTimes = useMemo(() => rows.map(row => row.time.replace(/Z$/, "")), [rows]);
  const period = `${from}-${to}`;
  const xRange = useMemo(() => [
    new Date(Date.parse(`${from}T00:00:00Z`) - HALF_INTERVAL_MS).toISOString().replace(/Z$/, ""),
    new Date(Date.parse(`${to}T00:00:00Z`) + 86400000 - HALF_INTERVAL_MS).toISOString().replace(/Z$/, ""),
  ], [from, to]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    async function draw() {
      try {
        const { default: Plotly } = await import("plotly.js/dist/plotly-basic.min.js");
        if (disposed || !element) return;
        await Plotly.react(element, [
          { type: "bar", name: "Imbalance", x: plotTimes, y: rows.map(row => row.imbalance),
            width: QUARTER_HOUR_MS, marker: { color: "#94a3b8" }, opacity: 0.82,
            hovertemplate: "Imbalance: %{y:.2f} MW<extra></extra>" },
          { type: "scatter", mode: "lines", name: "AEP", x: plotTimes, y: rows.map(row => row.aep),
            yaxis: "y2", line: { color: "#2563eb", width: 2.8 }, connectgaps: false,
            hovertemplate: "AEP: %{y:.2f} EUR/MWh<extra></extra>" },
        ], {
          autosize: true, height: 590, paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff", bargap: 0.06,
          margin: { l: 72, r: 72, t: 30, b: 72 }, font: { family: "Arial, sans-serif", size: 12, color: "#334155" },
          xaxis: { title: { text: "Datetime UTC" }, type: "date", range: xRange, tickformat: "%d %b<br>%H:%M",
            hoverformat: "%d.%m.%Y, %H:%M UTC", gridcolor: "#e5e7eb", rangeslider: { visible: false },
            showspikes: true, spikemode: "across", spikesnap: "cursor", spikedash: "dot", spikecolor: "#475569", spikethickness: 1 },
          yaxis: { title: { text: "Imbalance [MW]" }, zeroline: true, zerolinecolor: "#64748b", gridcolor: "#e5e7eb" },
          yaxis2: { title: { text: "AEP [EUR/MWh]" }, overlaying: "y", side: "right", showgrid: false, zeroline: false },
          hovermode: "x unified", hoverdistance: -1, spikedistance: -1, hoverlabel: { align: "left" },
          showlegend: true, legend: { orientation: "h", x: 0, y: 1.08 },
          uirevision: period,
        }, { responsive: true, displaylogo: false, scrollZoom: true, toImageButtonOptions: { filename: `ch-imbalance-aep-${period}`, scale: 2 } });
        if (disposed) return;
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
    };
  }, [rows, period, plotTimes, xRange]);

  if (error) return <div role="alert" className="rounded-xl border border-amber-300/20 p-8 text-amber-100">The imbalance chart could not be rendered.</div>;
  return <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800">
    <div ref={container} className="h-[590px] w-full" aria-label="Swiss control-area imbalance and AEP chart" />
  </section>;
}
